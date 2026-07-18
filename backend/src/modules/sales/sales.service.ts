import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  allocateByIntegerWeights,
  businessDayEndUtc,
  businessDayStartUtc,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  PostSaleResponseSchema,
  parseBusinessDate,
  SaleDetailSchema,
  SalePageSchema,
  SaleReceiptSchema,
  SaleReviewSchema,
  SEQUENCE_KEYS,
  toBusinessDate,
  toMinor,
  type CancelSaleData,
  type CreateSaleDraftData,
  type HoldSaleData,
  type PostSaleData,
  type PostSaleResponse,
  type ReplaceSaleDraftData,
  type SaleDetail,
  type SaleDraftLineData,
  type SaleLine,
  type SaleListQuery,
  type SalePage,
  type SalePayment,
  type SaleProfit,
  type SaleReceipt,
  type SaleReceiptQuery,
  type SaleReview,
  type SaleReviewData,
  type SaleReviewWarning,
  type SaleSettlement,
} from "@mobileshop/shared";
import { allocateDocumentNumber } from "../../common/numbers/number-sequence";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface SalesActorContext {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly branchId: string;
  readonly branchName: string;
  readonly actorUserId: string;
  readonly actorFullName: string;
  readonly currency: string;
  readonly allowedLocationIds: readonly string[] | null;
  readonly permissions: readonly string[];
  readonly canViewProfit: boolean;
  readonly metadata: AuthRequestMetadata;
}

const saleInclude = {
  organization: { select: { name: true, currency: true } },
  branch: { select: { name: true, addressLine: true, phone: true } },
  salesperson: { select: { id: true, fullName: true } },
  cashier: { select: { id: true, fullName: true } },
  heldBy: { select: { id: true, fullName: true } },
  lines: {
    orderBy: [{ lineNumber: "asc" as const }, { id: "asc" as const }],
    include: {
      stockLocation: { select: { id: true, code: true, name: true } },
      serializedUnit: {
        select: {
          id: true,
          identifiers: {
            select: { identifierType: true, normalizedValue: true },
            orderBy: [
              { identifierType: "asc" as const },
              { position: "asc" as const },
            ],
          },
        },
      },
    },
  },
  allocations: { include: { payment: true } },
  receivable: { include: { allocations: { include: { payment: true } } } },
} satisfies Prisma.SaleInclude;

type SaleRecord = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

const variantSelect = {
  id: true,
  sku: true,
  name: true,
  trackingType: true,
  defaultPriceMinor: true,
  minPriceMinor: true,
  warrantyType: true,
  warrantyMonths: true,
  version: true,
  updatedAt: true,
  isActive: true,
  productModel: {
    select: {
      isActive: true,
      brand: { select: { isActive: true } },
      category: { select: { isActive: true } },
    },
  },
} satisfies Prisma.ProductVariantSelect;

type VariantRecord = Prisma.ProductVariantGetPayload<{
  select: typeof variantSelect;
}>;

interface LineSelection {
  readonly id: string;
  readonly lineNumber: number;
  readonly productVariantId: string;
  readonly trackingType: "serialized" | "quantity";
  readonly locationId: string;
  readonly quantity: number;
  readonly serializedUnitId: string | null;
  readonly expectedUnitVersion: number | null;
  readonly expectedStockVersion: number | null;
  readonly expectedPriceSource: "price_rule" | "variant_default";
  readonly expectedPriceSourceId: string | null;
  readonly expectedPriceVersion: number;
  readonly snapshotUnitPriceMinor: number | null;
  readonly snapshotUnitCogsMinor: number | null;
}

interface ResolvedLine {
  readonly id: string;
  readonly lineNumber: number;
  readonly productVariantId: string;
  readonly sku: string;
  readonly name: string;
  readonly trackingType: "serialized" | "quantity";
  readonly location: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
  };
  readonly quantity: number;
  readonly serializedUnitId: string | null;
  readonly identifiers: readonly {
    readonly type: "imei" | "serial";
    readonly value: string;
  }[];
  readonly stockRecordId: string;
  readonly stockVersion: number;
  readonly available: boolean;
  readonly priceSource: "price_rule" | "variant_default";
  readonly priceEntryId: string | null;
  readonly priceVersion: number;
  readonly unitPriceMinor: number;
  readonly minimumUnitPriceMinor: number;
  readonly unitCogsMinor: number;
  readonly costAvailable: boolean;
  readonly warrantyType: VariantRecord["warrantyType"];
  readonly warrantyMonths: number | null;
  readonly snapshotUnitPriceMinor: number | null;
  readonly snapshotUnitCogsMinor: number | null;
  readonly expectedPriceSource: "price_rule" | "variant_default";
  readonly expectedPriceSourceId: string | null;
  readonly expectedPriceVersion: number;
}

interface CalculatedLine extends ResolvedLine {
  readonly lineSubtotalMinor: number;
  readonly discountMinor: number;
  readonly lineTotalMinor: number;
  readonly cogsMinor: number;
  readonly grossProfitMinor: number;
  readonly grossMarginBasisPoints: number | null;
}

interface SaleCalculation {
  readonly lines: readonly CalculatedLine[];
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly cogsMinor: number;
  readonly grossProfitMinor: number;
  readonly grossMarginBasisPoints: number | null;
}

interface EffectivePrice {
  readonly source: "price_rule" | "variant_default";
  readonly sourceId: string | null;
  readonly version: number;
  readonly unitPriceMinor: number;
  readonly minimumUnitPriceMinor: number;
}

interface SalesPolicy {
  readonly discountOverrideThresholdMinor: number;
  readonly minimumMarginBasisPoints: number;
  readonly returnWindowDays: number;
  readonly creditDueDays: number;
}

const SALES_SETTING_KEYS = Object.freeze({
  DISCOUNT_OVERRIDE_THRESHOLD_MINOR: "sales.discount_override_threshold_minor",
  MINIMUM_MARGIN_BASIS_POINTS: "sales.minimum_margin_basis_points",
  RETURN_WINDOW_DAYS: "sales.return_window_days",
  CREDIT_DUE_DAYS: "sales.credit_due_days",
});

const DEFAULT_SALES_POLICY: SalesPolicy = Object.freeze({
  // Prototype threshold: Rs 2,000, represented in exact paisa.
  discountOverrideThresholdMinor: 200_000,
  // Prototype floor: 6.00%.
  minimumMarginBasisPoints: 600,
  returnWindowDays: 7,
  creditDueDays: 30,
});

function safeInteger(
  value: bigint | number,
  label: string,
  minimum?: number,
): number {
  const result = Number(value);
  if (
    !Number.isSafeInteger(result) ||
    (minimum !== undefined && result < minimum)
  ) {
    throw new Error(`${label} is outside the safe-integer range.`);
  }
  return result;
}

function iso(value: Date): string {
  if (!Number.isFinite(value.getTime()))
    throw new Error("Invalid database timestamp.");
  return value.toISOString();
}

function notFound(label = "sale"): DomainError {
  return new DomainError(
    ERROR_CODES.NOT_FOUND,
    `This ${label} no longer exists.`,
  );
}

function optimistic(label = "sale"): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    `This ${label} changed. Reload it before continuing.`,
  );
}

function validation(message: string, field = "sale"): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
  });
}

function marginBasisPoints(profit: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return safeInteger(
    (BigInt(profit) * 10_000n) / BigInt(revenue),
    "gross margin",
  );
}

function calculate(
  resolved: readonly ResolvedLine[],
  discountMinor: number,
): SaleCalculation {
  const subtotals = resolved.map((line) =>
    safeInteger(
      BigInt(line.unitPriceMinor) * BigInt(line.quantity),
      "line subtotal",
      0,
    ),
  );
  const subtotalMinor = safeInteger(
    subtotals.reduce((sum, value) => sum + BigInt(value), 0n),
    "sale subtotal",
    0,
  );
  if (discountMinor > subtotalMinor) {
    throw validation(
      "The requested discount cannot exceed the sale subtotal.",
      "requestedDiscountMinor",
    );
  }
  const discounts =
    discountMinor === 0
      ? resolved.map(() => 0)
      : allocateByIntegerWeights(
          toMinor(discountMinor, "sale discount"),
          subtotals,
        );
  const lines = resolved.map((line, index): CalculatedLine => {
    const lineSubtotalMinor = subtotals[index];
    const lineDiscountMinor = discounts[index];
    if (lineSubtotalMinor === undefined || lineDiscountMinor === undefined) {
      throw new Error("Discount allocation lost a sale line.");
    }
    const lineTotalMinor = lineSubtotalMinor - lineDiscountMinor;
    const cogsMinor = safeInteger(
      BigInt(line.unitCogsMinor) * BigInt(line.quantity),
      "line COGS",
      0,
    );
    const grossProfitMinor = lineTotalMinor - cogsMinor;
    return {
      ...line,
      lineSubtotalMinor,
      discountMinor: lineDiscountMinor,
      lineTotalMinor,
      cogsMinor,
      grossProfitMinor,
      grossMarginBasisPoints: marginBasisPoints(
        grossProfitMinor,
        lineTotalMinor,
      ),
    };
  });
  const totalMinor = subtotalMinor - discountMinor;
  const cogsMinor = safeInteger(
    lines.reduce((sum, line) => sum + BigInt(line.cogsMinor), 0n),
    "sale COGS",
    0,
  );
  const grossProfitMinor = totalMinor - cogsMinor;
  return {
    lines,
    subtotalMinor,
    discountMinor,
    totalMinor,
    cogsMinor,
    grossProfitMinor,
    grossMarginBasisPoints: marginBasisPoints(grossProfitMinor, totalMinor),
  };
}

function profit(
  canView: boolean,
  cogsMinor: number,
  grossProfitMinor: number,
  grossMarginBasisPoints: number | null,
): SaleProfit {
  return canView
    ? {
        availability: "available",
        cogsMinor,
        grossProfitMinor,
        grossMarginBasisPoints,
      }
    : { availability: "redacted" };
}

function customerReference(record: SaleRecord) {
  if (record.customerId === null) return null;
  if (record.customerPhoneSnapshot === null) {
    throw new Error("A customer sale is missing its phone snapshot.");
  }
  return {
    id: record.customerId,
    name: record.customerNameSnapshot,
    phone: record.customerPhoneSnapshot,
  };
}

function userReference(
  user: { readonly id: string; readonly fullName: string } | null,
) {
  return user === null ? null : { id: user.id, fullName: user.fullName };
}

function paymentSettlement(record: SaleRecord): SaleSettlement {
  const values = [
    ...record.allocations.map((allocation) => ({
      payment: allocation.payment,
      allocatedMinor: allocation.amountMinor,
    })),
    ...(record.receivable?.allocations
      .filter((allocation) => allocation.payment.paymentMethod === "credit")
      .map((allocation) => ({
        payment: allocation.payment,
        allocatedMinor: allocation.amountMinor,
      })) ?? []),
  ];
  const unique = new Map<string, (typeof values)[number]>();
  for (const value of values) unique.set(value.payment.id, value);
  const payments: SalePayment[] = [...unique.values()]
    .sort(
      (left, right) =>
        left.payment.receivedAt.getTime() - right.payment.receivedAt.getTime(),
    )
    .map(({ payment, allocatedMinor }) => ({
      id: payment.id,
      method: payment.paymentMethod,
      amountMinor: safeInteger(allocatedMinor, "payment allocation", 1),
      reference: payment.reference,
      recordedAt: iso(payment.receivedAt),
    }));
  return {
    payments,
    paidMinor: payments
      .filter((payment) => payment.method !== "credit")
      .reduce((sum, payment) => sum + payment.amountMinor, 0),
    receivableMinor: payments
      .filter((payment) => payment.method === "credit")
      .reduce((sum, payment) => sum + payment.amountMinor, 0),
  };
}

function recordLine(
  line: SaleRecord["lines"][number],
  canViewProfit: boolean,
): SaleLine {
  const quantity = line.quantity;
  const unitPriceMinor = safeInteger(line.unitPriceMinor, "unit price", 0);
  const lineSubtotalMinor = safeInteger(
    BigInt(quantity) * line.unitPriceMinor,
    "line subtotal",
    0,
  );
  const lineTotalMinor = safeInteger(line.lineTotalMinor, "line total", 0);
  const cogsMinor = safeInteger(line.cogsMinor, "line COGS", 0);
  const grossProfitMinor = safeInteger(
    line.grossProfitMinor,
    "line gross profit",
  );
  const common = {
    id: line.id,
    product: {
      id: line.productVariantId,
      sku: line.skuSnapshot,
      name: line.productNameSnapshot,
    },
    location: line.stockLocation,
    priceVersion: line.priceVersionSnapshot,
    unitPriceMinor,
    lineSubtotalMinor,
    discountMinor: safeInteger(line.discountMinor, "line discount", 0),
    lineTotalMinor,
    discountReason: line.discountReason,
    profit: profit(
      canViewProfit,
      cogsMinor,
      grossProfitMinor,
      marginBasisPoints(grossProfitMinor, lineTotalMinor),
    ),
  };
  if (line.trackingTypeSnapshot === "serialized") {
    if (line.serializedUnit === null)
      throw new Error("Serialized sale line lost its unit.");
    return {
      ...common,
      trackingType: "serialized",
      quantity: 1,
      serializedUnit: {
        id: line.serializedUnit.id,
        identifiers: line.serializedUnit.identifiers.map((identifier) => ({
          type: identifier.identifierType,
          value: identifier.normalizedValue,
        })),
      },
    };
  }
  return { ...common, trackingType: "quantity", quantity };
}

function calculatedLine(
  line: CalculatedLine,
  canViewProfit: boolean,
  discountReason: string | null,
): SaleLine {
  const common = {
    id: line.id,
    product: { id: line.productVariantId, sku: line.sku, name: line.name },
    location: line.location,
    priceVersion: line.priceVersion,
    unitPriceMinor: line.unitPriceMinor,
    lineSubtotalMinor: line.lineSubtotalMinor,
    discountMinor: line.discountMinor,
    lineTotalMinor: line.lineTotalMinor,
    discountReason: line.discountMinor === 0 ? null : discountReason,
    profit: profit(
      canViewProfit,
      line.cogsMinor,
      line.grossProfitMinor,
      line.grossMarginBasisPoints,
    ),
  };
  return line.trackingType === "serialized"
    ? {
        ...common,
        trackingType: "serialized",
        quantity: 1,
        serializedUnit: {
          id: line.serializedUnitId ?? "",
          identifiers: [...line.identifiers],
        },
      }
    : { ...common, trackingType: "quantity", quantity: line.quantity };
}

function detailResponse(
  record: SaleRecord,
  context: SalesActorContext,
): SaleDetail {
  const totalMinor = safeInteger(record.totalMinor, "sale total", 0);
  const cogsMinor = safeInteger(record.cogsMinor, "sale COGS", 0);
  const grossProfitMinor = safeInteger(
    record.grossProfitMinor,
    "sale gross profit",
  );
  return SaleDetailSchema.parse({
    id: record.id,
    status: record.status,
    invoiceNumber: record.invoiceNumber,
    customer: customerReference(record),
    currency: record.organization.currency,
    note: record.note,
    discountReason: record.discountReason,
    hold:
      record.heldAt === null || record.heldBy === null
        ? null
        : {
            heldAt: iso(record.heldAt),
            heldBy: record.heldBy,
            note: record.note,
          },
    lines: record.lines.map((line) => recordLine(line, context.canViewProfit)),
    totals: {
      subtotalMinor: safeInteger(record.subtotalMinor, "sale subtotal", 0),
      discountMinor: safeInteger(record.discountMinor, "sale discount", 0),
      totalMinor,
    },
    settlement: paymentSettlement(record),
    profit: profit(
      context.canViewProfit,
      cogsMinor,
      grossProfitMinor,
      marginBasisPoints(grossProfitMinor, totalMinor),
    ),
    cashier: userReference(record.cashier),
    salesperson: userReference(record.salesperson),
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
    postedAt: record.postedAt === null ? null : iso(record.postedAt),
    cancelledAt: record.cancelledAt === null ? null : iso(record.cancelledAt),
  });
}

function receiptResponse(record: SaleRecord): SaleReceipt {
  if (
    record.status === "draft" ||
    record.status === "cancelled" ||
    record.invoiceNumber === null ||
    record.postedAt === null
  ) {
    throw new DomainError(
      ERROR_CODES.CONFLICT,
      "A receipt exists only after a sale is posted.",
    );
  }
  if (record.receiptSnapshot !== null) {
    return SaleReceiptSchema.parse(record.receiptSnapshot);
  }
  const cashier = userReference(record.cashier);
  if (cashier === null) throw new Error("Posted sale lost its cashier.");
  return SaleReceiptSchema.parse({
    saleId: record.id,
    invoiceNumber: record.invoiceNumber,
    currency: record.organization.currency,
    issuedAt: iso(record.postedAt),
    shop: {
      organizationName: record.organization.name,
      branchName: record.branch.name,
      addressLine: record.branch.addressLine,
      phone: record.branch.phone,
    },
    customer: customerReference(record),
    cashier,
    salesperson: userReference(record.salesperson),
    lines: record.lines.map((line) => {
      const common = {
        id: line.id,
        product: {
          id: line.productVariantId,
          sku: line.skuSnapshot,
          name: line.productNameSnapshot,
        },
        locationName: line.stockLocation.name,
        unitPriceMinor: safeInteger(
          line.unitPriceMinor,
          "receipt unit price",
          0,
        ),
        lineSubtotalMinor: safeInteger(
          line.unitPriceMinor * BigInt(line.quantity),
          "receipt subtotal",
          0,
        ),
        discountMinor: safeInteger(line.discountMinor, "receipt discount", 0),
        lineTotalMinor: safeInteger(line.lineTotalMinor, "receipt total", 0),
        discountReason: line.discountReason,
      };
      if (line.trackingTypeSnapshot === "serialized") {
        if (line.imeiSnapshot === null) {
          throw new Error("Receipt identifier snapshot is missing.");
        }
        return {
          ...common,
          trackingType: "serialized" as const,
          quantity: 1 as const,
          identifiers: [
            {
              type: /^\d{15}$/u.test(line.imeiSnapshot)
                ? ("imei" as const)
                : ("serial" as const),
              value: line.imeiSnapshot,
            },
          ],
        };
      }
      return {
        ...common,
        trackingType: "quantity" as const,
        quantity: line.quantity,
      };
    }),
    totals: {
      subtotalMinor: safeInteger(record.subtotalMinor, "receipt subtotal", 0),
      discountMinor: safeInteger(record.discountMinor, "receipt discount", 0),
      totalMinor: safeInteger(record.totalMinor, "receipt total", 0),
    },
    settlement: paymentSettlement(record),
    footer: null,
  });
}

function postedReceiptSnapshot({
  record,
  context,
  calculation,
  invoiceNumber,
  issuedAt,
  customer,
  payments,
}: {
  readonly record: SaleRecord;
  readonly context: SalesActorContext;
  readonly calculation: SaleCalculation;
  readonly invoiceNumber: string;
  readonly issuedAt: Date;
  readonly customer: {
    readonly id: string;
    readonly fullName: string;
    readonly phoneE164: string;
  } | null;
  readonly payments: readonly SalePayment[];
}): SaleReceipt {
  return SaleReceiptSchema.parse({
    saleId: record.id,
    invoiceNumber,
    currency: record.organization.currency,
    issuedAt: iso(issuedAt),
    shop: {
      organizationName: record.organization.name,
      branchName: record.branch.name,
      addressLine: record.branch.addressLine,
      phone: record.branch.phone,
    },
    customer:
      customer === null
        ? null
        : {
            id: customer.id,
            name: customer.fullName,
            phone: customer.phoneE164,
          },
    cashier: {
      id: context.actorUserId,
      fullName: context.actorFullName,
    },
    salesperson: userReference(record.salesperson),
    lines: calculation.lines.map((line) => {
      const common = {
        id: line.id,
        product: {
          id: line.productVariantId,
          sku: line.sku,
          name: line.name,
        },
        locationName: line.location.name,
        unitPriceMinor: line.unitPriceMinor,
        lineSubtotalMinor: line.lineSubtotalMinor,
        discountMinor: line.discountMinor,
        lineTotalMinor: line.lineTotalMinor,
        discountReason: line.discountMinor === 0 ? null : record.discountReason,
      };
      return line.trackingType === "serialized"
        ? {
            ...common,
            trackingType: "serialized" as const,
            quantity: 1 as const,
            identifiers: [...line.identifiers],
          }
        : {
            ...common,
            trackingType: "quantity" as const,
            quantity: line.quantity,
          };
    }),
    totals: {
      subtotalMinor: calculation.subtotalMinor,
      discountMinor: calculation.discountMinor,
      totalMinor: calculation.totalMinor,
    },
    settlement: {
      payments: [...payments],
      paidMinor: payments
        .filter((payment) => payment.method !== "credit")
        .reduce((sum, payment) => sum + payment.amountMinor, 0),
      receivableMinor: payments
        .filter((payment) => payment.method === "credit")
        .reduce((sum, payment) => sum + payment.amountMinor, 0),
    },
    footer: null,
  });
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    context: SalesActorContext,
    query: SaleListQuery,
  ): Promise<SalePage> {
    const additionalFilters: Prisma.SaleWhereInput[] = [];
    if (query.q !== undefined) {
      additionalFilters.push({
        OR: [
          { invoiceNumber: { contains: query.q, mode: "insensitive" } },
          { customerNameSnapshot: { contains: query.q, mode: "insensitive" } },
          {
            lines: {
              some: { skuSnapshot: { contains: query.q, mode: "insensitive" } },
            },
          },
          {
            lines: {
              some: {
                imeiSnapshot: { contains: query.q, mode: "insensitive" },
              },
            },
          },
        ],
      });
    }
    if (query.paymentMethod !== undefined) {
      additionalFilters.push({
        OR: [
          {
            allocations: {
              some: { payment: { paymentMethod: query.paymentMethod } },
            },
          },
          {
            receivable: {
              is: {
                allocations: {
                  some: { payment: { paymentMethod: query.paymentMethod } },
                },
              },
            },
          },
        ],
      });
    }
    const where: Prisma.SaleWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.cashierId === undefined
        ? {}
        : { cashierUserId: query.cashierId }),
      ...(query.salespersonId === undefined
        ? {}
        : { salespersonUserId: query.salespersonId }),
      ...(context.allowedLocationIds === null
        ? {}
        : {
            lines: {
              every: {
                stockLocationId: { in: [...context.allowedLocationIds] },
              },
            },
          }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            postedAt: {
              ...(query.from === undefined
                ? {}
                : { gte: businessDayStartUtc(parseBusinessDate(query.from)) }),
              ...(query.to === undefined
                ? {}
                : { lt: businessDayEndUtc(parseBusinessDate(query.to)) }),
            },
          }),
      ...(additionalFilters.length === 0 ? {} : { AND: additionalFilters }),
    };
    const orderBy: Prisma.SaleOrderByWithRelationInput =
      query.sort === "total"
        ? { totalMinor: query.direction }
        : { postedAt: { sort: query.direction, nulls: "last" } };
    const [total, rows] = await this.prisma.client.$transaction([
      this.prisma.client.sale.count({ where }),
      this.prisma.client.sale.findMany({
        where,
        include: saleInclude,
        orderBy: [orderBy, { createdAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return SalePageSchema.parse({
      items: rows.map((record) => {
        const settlement = paymentSettlement(record);
        const totalMinor = safeInteger(record.totalMinor, "sale total", 0);
        const cogsMinor = safeInteger(record.cogsMinor, "sale COGS", 0);
        const grossProfitMinor = safeInteger(
          record.grossProfitMinor,
          "sale gross profit",
        );
        return {
          id: record.id,
          status: record.status,
          invoiceNumber: record.invoiceNumber,
          customer: customerReference(record),
          lineCount: record.lines.length,
          unitCount: record.lines.reduce((sum, line) => sum + line.quantity, 0),
          totalMinor,
          paymentMethods: [
            ...new Set(settlement.payments.map((payment) => payment.method)),
          ],
          profit: profit(
            context.canViewProfit,
            cogsMinor,
            grossProfitMinor,
            marginBasisPoints(grossProfitMinor, totalMinor),
          ),
          cashier: userReference(record.cashier),
          salesperson: userReference(record.salesperson),
          heldAt: record.heldAt === null ? null : iso(record.heldAt),
          postedAt: record.postedAt === null ? null : iso(record.postedAt),
          createdAt: iso(record.createdAt),
          version: record.version,
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async createDraft(
    context: SalesActorContext,
    input: CreateSaleDraftData,
  ): Promise<SaleDetail> {
    const record = await this.prisma.client.$transaction(async (tx) => {
      const customer = await this.customer(tx, context, input.customerId);
      const resolved = await this.resolveInputLines(
        tx,
        context,
        input.lines,
        false,
      );
      const calculation = calculate(resolved, input.requestedDiscountMinor);
      const sale = await tx.sale.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          customerId: customer?.id ?? null,
          customerNameSnapshot: customer?.fullName ?? "Walk-in Customer",
          customerPhoneSnapshot: customer?.phoneE164 ?? null,
          salespersonUserId: context.actorUserId,
          cashierUserId: context.actorUserId,
          subtotalMinor: BigInt(calculation.subtotalMinor),
          discountMinor: BigInt(calculation.discountMinor),
          totalMinor: BigInt(calculation.totalMinor),
          cogsMinor: BigInt(calculation.cogsMinor),
          grossProfitMinor: BigInt(calculation.grossProfitMinor),
          discountReason:
            calculation.discountMinor === 0 ? null : input.discountReason,
          note: input.note,
        },
        select: { id: true },
      });
      await tx.saleLine.createMany({
        data: calculation.lines.map((line) =>
          this.lineData(context, sale.id, line, input.discountReason, false),
        ),
      });
      await this.audit(tx, context, "sale.draft_created", sale.id, null, {
        version: 1,
        lineCount: calculation.lines.length,
        totalMinor: calculation.totalMinor,
      });
      return this.load(tx, context, sale.id);
    });
    return detailResponse(record, context);
  }

  async detail(context: SalesActorContext, id: string): Promise<SaleDetail> {
    return detailResponse(
      await this.load(this.prisma.client, context, id),
      context,
    );
  }

  async replaceDraft(
    context: SalesActorContext,
    id: string,
    input: ReplaceSaleDraftData,
  ): Promise<SaleDetail> {
    const record = await this.prisma.client.$transaction(async (tx) => {
      const current = await this.load(tx, context, id);
      this.assertDraftVersion(current, input.version);
      const customer = await this.customer(tx, context, input.customerId);
      const calculation = calculate(
        await this.resolveInputLines(tx, context, input.lines, false),
        input.requestedDiscountMinor,
      );
      const changed = await tx.sale.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          status: "draft",
          version: input.version,
        },
        data: {
          customerId: customer?.id ?? null,
          customerNameSnapshot: customer?.fullName ?? "Walk-in Customer",
          customerPhoneSnapshot: customer?.phoneE164 ?? null,
          subtotalMinor: BigInt(calculation.subtotalMinor),
          discountMinor: BigInt(calculation.discountMinor),
          totalMinor: BigInt(calculation.totalMinor),
          cogsMinor: BigInt(calculation.cogsMinor),
          grossProfitMinor: BigInt(calculation.grossProfitMinor),
          discountReason:
            calculation.discountMinor === 0 ? null : input.discountReason,
          note: input.note,
          heldAt: null,
          heldByUserId: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw optimistic();
      await tx.saleLine.deleteMany({
        where: { saleId: id, organizationId: context.organizationId },
      });
      await tx.saleLine.createMany({
        data: calculation.lines.map((line) =>
          this.lineData(context, id, line, input.discountReason, false),
        ),
      });
      await this.audit(
        tx,
        context,
        "sale.draft_replaced",
        id,
        { version: input.version },
        {
          version: input.version + 1,
          lineCount: calculation.lines.length,
          totalMinor: calculation.totalMinor,
        },
      );
      return this.load(tx, context, id);
    });
    return detailResponse(record, context);
  }

  async review(
    context: SalesActorContext,
    id: string,
    input: SaleReviewData,
  ): Promise<SaleReview> {
    return this.prisma.client.$transaction(async (tx) => {
      const record = await this.load(tx, context, id);
      this.assertDraftVersion(record, input.version);
      const calculation = calculate(
        await this.resolveRecordLines(tx, context, record, false),
        safeInteger(record.discountMinor, "sale discount", 0),
      );
      const policy = await this.policy(tx, context);
      const warnings = this.reviewWarnings(
        context,
        calculation,
        policy,
        context.canViewProfit,
      );
      return SaleReviewSchema.parse({
        saleId: record.id,
        version: record.version,
        customer: customerReference(record),
        currency: record.organization.currency,
        discountReason: record.discountReason,
        lines: calculation.lines.map((line) =>
          calculatedLine(line, context.canViewProfit, record.discountReason),
        ),
        totals: {
          subtotalMinor: calculation.subtotalMinor,
          discountMinor: calculation.discountMinor,
          totalMinor: calculation.totalMinor,
        },
        profit: profit(
          context.canViewProfit,
          calculation.cogsMinor,
          calculation.grossProfitMinor,
          calculation.grossMarginBasisPoints,
        ),
        warnings,
        canPost: !warnings.some((warning) => warning.severity === "blocking"),
        reviewedAt: new Date().toISOString(),
      });
    });
  }

  async hold(
    context: SalesActorContext,
    id: string,
    input: HoldSaleData,
  ): Promise<SaleDetail> {
    const record = await this.prisma.client.$transaction(async (tx) => {
      const current = await this.load(tx, context, id);
      this.assertDraftVersion(current, input.version);
      const changed = await tx.sale.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          status: "draft",
          version: input.version,
        },
        data: {
          heldAt: new Date(),
          heldByUserId: context.actorUserId,
          note: input.note,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw optimistic();
      await this.audit(
        tx,
        context,
        "sale.held",
        id,
        { version: input.version },
        { version: input.version + 1 },
      );
      return this.load(tx, context, id);
    });
    return detailResponse(record, context);
  }

  async cancel(
    context: SalesActorContext,
    id: string,
    input: CancelSaleData,
  ): Promise<SaleDetail> {
    const record = await this.prisma.client.$transaction(async (tx) => {
      const current = await this.load(tx, context, id);
      this.assertDraftVersion(current, input.version);
      const now = new Date();
      const changed = await tx.sale.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          status: "draft",
          version: input.version,
        },
        data: {
          status: "cancelled",
          cancelledAt: now,
          cancelledByUserId: context.actorUserId,
          cancellationReason: input.reason,
          heldAt: null,
          heldByUserId: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw optimistic();
      await this.audit(
        tx,
        context,
        "sale.cancelled",
        id,
        { version: input.version },
        { version: input.version + 1 },
        input.reason,
      );
      return this.load(tx, context, id);
    });
    return detailResponse(record, context);
  }

  async post(
    context: SalesActorContext,
    id: string,
    idempotencyKey: string,
    input: PostSaleData,
    retryCount = 0,
  ): Promise<PostSaleResponse> {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          saleId: id,
          version: input.version,
          payments: input.payments,
        }),
      )
      .digest("hex");
    let result: { readonly record: SaleRecord; readonly replay: boolean };
    try {
      result = await this.prisma.client.$transaction(
        async (tx) => {
          const used = await tx.sale.findFirst({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              postRequestId: idempotencyKey,
            },
            select: { id: true, postRequestHash: true },
          });
          if (used !== null && used.id !== id) {
            throw new DomainError(
              ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
              "This idempotency key was already used for another sale.",
            );
          }
          await tx.$queryRaw`SELECT id FROM sales WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid FOR UPDATE`;
          const current = await this.load(tx, context, id);
          if (current.status !== "draft") {
            if (current.postRequestId === idempotencyKey) {
              if (current.postRequestHash !== requestHash) {
                throw new DomainError(
                  ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
                  "The idempotency key was reused with a different posting request.",
                );
              }
              return { record: current, replay: true };
            }
            throw new DomainError(
              ERROR_CODES.SALE_ALREADY_POSTED,
              "This sale is already closed and cannot be posted again.",
            );
          }
          if (current.version !== input.version) throw optimistic();

          const calculation = calculate(
            await this.resolveRecordLines(tx, context, current, true),
            safeInteger(current.discountMinor, "sale discount", 0),
          );
          const policy = await this.policy(tx, context);
          this.assertPostAllowed(context, calculation, policy);
          const paid = input.payments.reduce(
            (sum, payment) => sum + BigInt(payment.amountMinor),
            0n,
          );
          if (paid !== BigInt(calculation.totalMinor)) {
            throw new DomainError(
              ERROR_CODES.SALE_PAYMENT_MISMATCH,
              "Payment and credit allocations must exactly equal the authoritative sale total.",
            );
          }
          const now = new Date();
          const businessDateText = toBusinessDate(now);
          const businessDate = new Date(`${businessDateText}T00:00:00.000Z`);
          const cashLeg = input.payments.find(
            (payment) => payment.method === "cash",
          );
          let cashSession: { readonly id: string } | null = null;
          if (cashLeg !== undefined) {
            const lockedSessions = await tx.$queryRaw<
              readonly { readonly id: string }[]
            >`SELECT id
              FROM cash_sessions
             WHERE organization_id = ${context.organizationId}::uuid
               AND branch_id = ${context.branchId}::uuid
               AND cashier_user_id = ${context.actorUserId}::uuid
               AND business_date = ${businessDateText}::date
               AND status IN ('open', 'reopened_with_authorization')
             ORDER BY opened_at DESC, id DESC
             LIMIT 1
             FOR UPDATE`;
            cashSession = lockedSessions[0] ?? null;
          }
          if (cashLeg !== undefined && cashSession === null) {
            throw new DomainError(
              ERROR_CODES.SALE_CASH_SESSION_REQUIRED,
              "Open a cash session before accepting cash.",
            );
          }
          const creditLeg = input.payments.find(
            (payment) => payment.method === "credit",
          );
          if (creditLeg !== undefined)
            await this.assertCredit(
              tx,
              context,
              current,
              creditLeg.amountMinor,
            );

          const accounts = await tx.financialAccount.findMany({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              isActive: true,
              code: {
                in: [
                  "CASH",
                  "BANK",
                  "DIGITAL",
                  "AR",
                  "SALES",
                  "COGS",
                  "INVENTORY",
                ],
              },
            },
            orderBy: [{ code: "asc" }, { id: "asc" }],
          });
          const accountFor = (
            code: string,
            subtype: (typeof accounts)[number]["accountSubtype"],
          ) => {
            const account = accounts.find(
              (candidate) =>
                candidate.code === code && candidate.accountSubtype === subtype,
            );
            if (account === undefined) {
              throw validation(
                `Configure the active ${code} account as ${subtype.replaceAll("_", " ")} before posting.`,
                "payments",
              );
            }
            return account;
          };
          const paymentAccount = {
            cash: { code: "CASH", subtype: "physical_cash" },
            bank_transfer: { code: "BANK", subtype: "bank" },
            card: { code: "BANK", subtype: "bank" },
            digital_wallet: { code: "DIGITAL", subtype: "provider_float" },
            credit: { code: "AR", subtype: "receivable" },
          } as const;

          for (const line of calculation.lines) {
            if (line.trackingType === "serialized") {
              const updated = await tx.serializedUnit.updateMany({
                where: {
                  id: line.stockRecordId,
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  version: line.stockVersion,
                  state: "available",
                },
                data: { state: "sold", version: { increment: 1 } },
              });
              if (updated.count !== 1)
                throw new DomainError(
                  ERROR_CODES.INVENTORY_UNIT_NOT_AVAILABLE,
                  "A selected serialized unit is no longer available.",
                );
            } else {
              const updated = await tx.stockBatch.updateMany({
                where: {
                  id: line.stockRecordId,
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  version: line.stockVersion,
                  quantityOnHand: { gte: line.quantity },
                },
                data: {
                  quantityOnHand: { decrement: line.quantity },
                  version: { increment: 1 },
                },
              });
              if (updated.count !== 1)
                throw new DomainError(
                  ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK,
                  "Quantity stock changed before posting.",
                );
            }
            await tx.inventoryMovement.create({
              data: {
                organizationId: context.organizationId,
                branchId: context.branchId,
                productVariantId: line.productVariantId,
                serializedUnitId:
                  line.trackingType === "serialized"
                    ? line.serializedUnitId
                    : null,
                stockBatchId:
                  line.trackingType === "quantity" ? line.stockRecordId : null,
                stockLocationId: line.location.id,
                movementType: "sale",
                quantity: line.quantity,
                fromState:
                  line.trackingType === "serialized" ? "available" : null,
                toState: line.trackingType === "serialized" ? "sold" : null,
                referenceType: "sale",
                referenceId: id,
                actorUserId: context.actorUserId,
              },
            });
            await tx.saleLine.update({
              where: { id: line.id },
              data: {
                priceEntryId: line.priceEntryId,
                productNameSnapshot: line.name,
                skuSnapshot: line.sku,
                imeiSnapshot:
                  line.trackingType === "serialized"
                    ? (line.identifiers[0]?.value ?? null)
                    : null,
                unitPriceMinor: BigInt(line.unitPriceMinor),
                priceVersionSnapshot: line.priceVersion,
                discountMinor: BigInt(line.discountMinor),
                discountReason:
                  line.discountMinor === 0 ? null : current.discountReason,
                lineTotalMinor: BigInt(line.lineTotalMinor),
                unitCogsMinor: BigInt(line.unitCogsMinor),
                cogsMinor: BigInt(line.cogsMinor),
                grossProfitMinor: BigInt(line.grossProfitMinor),
                warrantyTypeSnapshot: line.warrantyType,
                warrantyMonthsSnapshot: line.warrantyMonths,
                unitSaleActive: line.trackingType === "serialized",
              },
            });
          }

          const periodKey = businessDateText.slice(0, 4);
          const invoiceNumber = await allocateDocumentNumber(
            tx,
            {
              organizationId: context.organizationId,
              branchId: context.branchId,
            },
            {
              key: SEQUENCE_KEYS.SALE_INVOICE,
              defaultPrefix: "INV-",
              periodKey,
            },
          );
          let receivableId: string | null = null;
          if (creditLeg !== undefined && current.customerId !== null) {
            const dueOn = new Date(businessDate);
            dueOn.setUTCDate(dueOn.getUTCDate() + policy.creditDueDays);
            const receivable = await tx.receivable.create({
              data: {
                organizationId: context.organizationId,
                branchId: context.branchId,
                customerId: current.customerId,
                saleId: id,
                amountMinor: BigInt(creditLeg.amountMinor),
                balanceMinor: BigInt(creditLeg.amountMinor),
                dueOn,
                approvedByUserId: context.actorUserId,
              },
              select: { id: true },
            });
            receivableId = receivable.id;
          }

          const ledgerPayments: {
            readonly accountId: string;
            readonly amountMinor: number;
            readonly index: number;
          }[] = [];
          const receiptPayments: SalePayment[] = [];
          for (const [index, paymentInput] of input.payments.entries()) {
            const requiredAccount = paymentAccount[paymentInput.method];
            const account = accountFor(
              requiredAccount.code,
              requiredAccount.subtype,
            );
            const paymentNumber = await allocateDocumentNumber(
              tx,
              {
                organizationId: context.organizationId,
                branchId: context.branchId,
              },
              { key: "payment", defaultPrefix: "PAY-", periodKey },
            );
            const payment = await tx.payment.create({
              data: {
                organizationId: context.organizationId,
                branchId: context.branchId,
                paymentNumber,
                customerId: current.customerId,
                paymentMethod: paymentInput.method,
                amountMinor: BigInt(paymentInput.amountMinor),
                financialAccountId: account.id,
                reference: paymentInput.reference,
                receivedAt: now,
                businessDate,
                cashSessionId:
                  paymentInput.method === "cash"
                    ? (cashSession?.id ?? null)
                    : null,
                receivedByUserId: context.actorUserId,
                idempotencyKey: randomUUID(),
              },
              select: { id: true },
            });
            await tx.paymentAllocation.create({
              data: {
                organizationId: context.organizationId,
                branchId: context.branchId,
                paymentId: payment.id,
                saleId: paymentInput.method === "credit" ? null : id,
                receivableId:
                  paymentInput.method === "credit" ? receivableId : null,
                amountMinor: BigInt(paymentInput.amountMinor),
              },
            });
            ledgerPayments.push({
              accountId: account.id,
              amountMinor: paymentInput.amountMinor,
              index,
            });
            receiptPayments.push({
              id: payment.id,
              method: paymentInput.method,
              amountMinor: paymentInput.amountMinor,
              reference: paymentInput.reference,
              recordedAt: iso(now),
            });
          }

          const entryGroupId = randomUUID();
          const entries: Prisma.FinancialEntryCreateManyInput[] =
            ledgerPayments.map((payment) => ({
              organizationId: context.organizationId,
              branchId: context.branchId,
              entryGroupId,
              sourceType: "sale",
              sourceId: id,
              sourceKey: `sale:${id}:settlement:${payment.index}`,
              financialAccountId: payment.accountId,
              direction: "debit",
              amountMinor: BigInt(payment.amountMinor),
              description: `Sale ${invoiceNumber} settlement`,
              occurredAt: now,
              businessDate,
              actorUserId: context.actorUserId,
            }));
          if (calculation.totalMinor > 0) {
            entries.push({
              organizationId: context.organizationId,
              branchId: context.branchId,
              entryGroupId,
              sourceType: "sale",
              sourceId: id,
              sourceKey: `sale:${id}:revenue`,
              financialAccountId: accountFor("SALES", "sales_revenue").id,
              direction: "credit",
              amountMinor: BigInt(calculation.totalMinor),
              description: `Sale ${invoiceNumber} revenue`,
              occurredAt: now,
              businessDate,
              actorUserId: context.actorUserId,
            });
          }
          if (calculation.cogsMinor > 0) {
            entries.push(
              {
                organizationId: context.organizationId,
                branchId: context.branchId,
                entryGroupId,
                sourceType: "sale",
                sourceId: id,
                sourceKey: `sale:${id}:cogs`,
                financialAccountId: accountFor("COGS", "cost_of_goods_sold").id,
                direction: "debit",
                amountMinor: BigInt(calculation.cogsMinor),
                description: `Sale ${invoiceNumber} cost of goods sold`,
                occurredAt: now,
                businessDate,
                actorUserId: context.actorUserId,
              },
              {
                organizationId: context.organizationId,
                branchId: context.branchId,
                entryGroupId,
                sourceType: "sale",
                sourceId: id,
                sourceKey: `sale:${id}:inventory`,
                financialAccountId: accountFor("INVENTORY", "inventory_asset")
                  .id,
                direction: "credit",
                amountMinor: BigInt(calculation.cogsMinor),
                description: `Sale ${invoiceNumber} inventory relief`,
                occurredAt: now,
                businessDate,
                actorUserId: context.actorUserId,
              },
            );
          }
          const debit = entries
            .filter((entry) => entry.direction === "debit")
            .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
          const credit = entries
            .filter((entry) => entry.direction === "credit")
            .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
          if (debit !== credit)
            throw new DomainError(
              ERROR_CODES.LEDGER_UNBALANCED,
              "The sale ledger did not balance.",
            );
          if (entries.length > 0)
            await tx.financialEntry.createMany({ data: entries });

          const customer = await this.customer(tx, context, current.customerId);
          const receiptSnapshot = postedReceiptSnapshot({
            record: current,
            context,
            calculation,
            invoiceNumber,
            issuedAt: now,
            customer,
            payments: receiptPayments,
          });
          const updated = await tx.sale.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              branchId: context.branchId,
              status: "draft",
              version: input.version,
            },
            data: {
              status: "posted",
              invoiceNumber,
              customerNameSnapshot: customer?.fullName ?? "Walk-in Customer",
              customerPhoneSnapshot: customer?.phoneE164 ?? null,
              cashierUserId: context.actorUserId,
              cashSessionId: cashSession?.id ?? null,
              subtotalMinor: BigInt(calculation.subtotalMinor),
              discountMinor: BigInt(calculation.discountMinor),
              totalMinor: BigInt(calculation.totalMinor),
              cogsMinor: BigInt(calculation.cogsMinor),
              grossProfitMinor: BigInt(calculation.grossProfitMinor),
              discountApprovedByUserId:
                calculation.discountMinor > 0 ? context.actorUserId : null,
              heldAt: null,
              heldByUserId: null,
              postedAt: now,
              businessDate,
              postRequestId: idempotencyKey,
              postRequestHash: requestHash,
              returnWindowDays: policy.returnWindowDays,
              receiptSnapshot,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) throw optimistic();
          const discountOverrideExercised =
            calculation.discountMinor > policy.discountOverrideThresholdMinor ||
            calculation.lines.some(
              (line) =>
                BigInt(line.lineTotalMinor) <
                BigInt(line.minimumUnitPriceMinor) * BigInt(line.quantity),
            );
          const minimumMarginOverrideExercised =
            BigInt(calculation.grossProfitMinor) * 10_000n <
            BigInt(calculation.totalMinor) *
              BigInt(policy.minimumMarginBasisPoints);
          await this.audit(
            tx,
            context,
            "sale.posted",
            id,
            { version: input.version },
            {
              version: input.version + 1,
              invoiceNumber,
              totalMinor: calculation.totalMinor,
              cogsMinor: calculation.cogsMinor,
              paymentCount: input.payments.length,
              ...(current.discountReason === null
                ? {}
                : { discountReason: current.discountReason }),
              policy: {
                discountOverrideThresholdMinor:
                  policy.discountOverrideThresholdMinor,
                minimumMarginBasisPoints: policy.minimumMarginBasisPoints,
                returnWindowDays: policy.returnWindowDays,
                creditDueDays: policy.creditDueDays,
              },
              discountOverrideExercised,
              minimumMarginOverrideExercised,
              ...(calculation.discountMinor > 0 ||
              discountOverrideExercised ||
              minimumMarginOverrideExercised
                ? { approverActorUserId: context.actorUserId }
                : {}),
            },
            current.discountReason ?? undefined,
          );
          return { record: await this.load(tx, context, id), replay: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;
      if (code !== "P2002" && code !== "P2034") throw error;
      const used = await this.prisma.client.sale.findFirst({
        where: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          postRequestId: idempotencyKey,
        },
        select: { id: true, postRequestHash: true },
      });
      if (used !== null) {
        if (used.id !== id || used.postRequestHash !== requestHash) {
          throw new DomainError(
            ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
            "The idempotency key was already committed for a different posting request.",
            { cause: error },
          );
        }
        const record = await this.load(this.prisma.client, context, id);
        return PostSaleResponseSchema.parse({
          sale: detailResponse(record, context),
          receipt: receiptResponse(record),
          idempotencyReplay: true,
        });
      }
      if (code === "P2034" && retryCount < 2) {
        return this.post(context, id, idempotencyKey, input, retryCount + 1);
      }
      throw new DomainError(
        ERROR_CODES.CONFLICT,
        "The sale was changed concurrently. Retry with the same idempotency key.",
        { cause: error },
      );
    }
    return PostSaleResponseSchema.parse({
      sale: detailResponse(result.record, context),
      receipt: receiptResponse(result.record),
      idempotencyReplay: result.replay,
    });
  }

  async receipt(
    context: SalesActorContext,
    id: string,
    _query: SaleReceiptQuery,
  ): Promise<SaleReceipt> {
    return receiptResponse(await this.load(this.prisma.client, context, id));
  }

  private async customer(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
    id: string | null,
  ) {
    if (id === null) return null;
    const customer = await tx.customer.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        fullName: true,
        phoneE164: true,
        creditLimitMinor: true,
      },
    });
    if (customer === null) throw notFound("customer");
    if (customer.phoneE164 === null)
      throw validation(
        "The selected customer needs a valid mobile number.",
        "customerId",
      );
    return { ...customer, phoneE164: customer.phoneE164 };
  }

  private assertLocation(context: SalesActorContext, locationId: string): void {
    if (
      context.allowedLocationIds !== null &&
      !context.allowedLocationIds.includes(locationId)
    ) {
      throw new DomainError(
        ERROR_CODES.FORBIDDEN_SCOPE,
        "This stock location is outside your assigned scope.",
      );
    }
  }

  private async price(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
    variant: VariantRecord,
    now: Date,
  ): Promise<EffectivePrice> {
    const entries = await tx.priceEntry.findMany({
      where: {
        organizationId: context.organizationId,
        productVariantId: variant.id,
        AND: [
          { OR: [{ branchId: context.branchId }, { branchId: null }] },
          { effectiveFrom: { lte: now } },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        ],
        priceList: {
          is: {
            isActive: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
        },
      },
      select: {
        id: true,
        branchId: true,
        priceMinor: true,
        minPriceMinor: true,
        effectiveFrom: true,
      },
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    });
    const entry =
      entries.find((candidate) => candidate.branchId === context.branchId) ??
      entries.find((candidate) => candidate.branchId === null);
    if (entry !== undefined) {
      return {
        source: "price_rule",
        sourceId: entry.id,
        version: 1,
        unitPriceMinor: safeInteger(entry.priceMinor, "price", 0),
        minimumUnitPriceMinor: safeInteger(
          entry.minPriceMinor ?? variant.minPriceMinor ?? 0n,
          "minimum price",
          0,
        ),
      };
    }
    if (variant.defaultPriceMinor === null)
      throw validation("This product has no active selling price.", "lines");
    return {
      source: "variant_default",
      sourceId: null,
      version: variant.version,
      unitPriceMinor: safeInteger(variant.defaultPriceMinor, "price", 0),
      minimumUnitPriceMinor: safeInteger(
        variant.minPriceMinor ?? 0n,
        "minimum price",
        0,
      ),
    };
  }

  private async resolveInputLines(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
    lines: readonly SaleDraftLineData[],
    lock: boolean,
  ): Promise<readonly ResolvedLine[]> {
    const selections: LineSelection[] = lines.map((line, index) => ({
      id: randomUUID(),
      lineNumber: index + 1,
      productVariantId: line.productVariantId,
      trackingType: line.trackingType,
      locationId: line.locationId,
      quantity: line.trackingType === "serialized" ? 1 : line.quantity,
      serializedUnitId:
        line.trackingType === "serialized" ? line.serializedUnitId : null,
      expectedUnitVersion:
        line.trackingType === "serialized" ? line.serializedUnitVersion : null,
      expectedStockVersion:
        line.trackingType === "quantity" ? line.stockVersion : null,
      expectedPriceSource: line.priceSource,
      expectedPriceSourceId: line.priceSourceId,
      expectedPriceVersion: line.priceVersion,
      snapshotUnitPriceMinor: null,
      snapshotUnitCogsMinor: null,
    }));
    const result: ResolvedLine[] = [];
    for (const selection of selections.sort((left, right) =>
      `${left.locationId}:${left.productVariantId}:${left.serializedUnitId ?? ""}`.localeCompare(
        `${right.locationId}:${right.productVariantId}:${right.serializedUnitId ?? ""}`,
      ),
    )) {
      result.push(await this.resolveLine(tx, context, selection, lock, true));
    }
    return result.sort((left, right) => left.lineNumber - right.lineNumber);
  }

  private async resolveRecordLines(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
    record: SaleRecord,
    lock: boolean,
  ): Promise<readonly ResolvedLine[]> {
    const selections: LineSelection[] = record.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      productVariantId: line.productVariantId,
      trackingType: line.trackingTypeSnapshot,
      locationId: line.stockLocationId,
      quantity: line.quantity,
      serializedUnitId: line.serializedUnitId,
      expectedUnitVersion: null,
      expectedStockVersion: null,
      expectedPriceSource:
        line.priceEntryId === null ? "variant_default" : "price_rule",
      expectedPriceSourceId: line.priceEntryId,
      expectedPriceVersion: line.priceVersionSnapshot,
      snapshotUnitPriceMinor: safeInteger(
        line.unitPriceMinor,
        "snapshot price",
        0,
      ),
      snapshotUnitCogsMinor: safeInteger(
        line.unitCogsMinor,
        "snapshot cost",
        0,
      ),
    }));
    const result: ResolvedLine[] = [];
    for (const selection of selections.sort((left, right) =>
      `${left.locationId}:${left.productVariantId}:${left.serializedUnitId ?? ""}`.localeCompare(
        `${right.locationId}:${right.productVariantId}:${right.serializedUnitId ?? ""}`,
      ),
    )) {
      result.push(await this.resolveLine(tx, context, selection, lock, false));
    }
    return result.sort((left, right) => left.lineNumber - right.lineNumber);
  }

  private async resolveLine(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
    selection: LineSelection,
    lock: boolean,
    enforceProposal: boolean,
  ): Promise<ResolvedLine> {
    this.assertLocation(context, selection.locationId);
    const [location, variant] = await Promise.all([
      tx.stockLocation.findFirst({
        where: {
          id: selection.locationId,
          organizationId: context.organizationId,
          branchId: context.branchId,
          isActive: true,
        },
        select: { id: true, code: true, name: true },
      }),
      tx.productVariant.findFirst({
        where: {
          id: selection.productVariantId,
          organizationId: context.organizationId,
        },
        select: variantSelect,
      }),
    ]);
    if (location === null) throw notFound("stock location");
    if (variant === null) throw notFound("product");
    if (
      !variant.isActive ||
      !variant.productModel.isActive ||
      !variant.productModel.brand.isActive ||
      !variant.productModel.category.isActive
    ) {
      throw new DomainError(
        ERROR_CODES.CATALOG_VARIANT_INACTIVE,
        "This product is not active for sale.",
      );
    }
    if (variant.trackingType !== selection.trackingType)
      throw validation("The product tracking type changed.", "lines");
    const price = await this.price(tx, context, variant, new Date());
    if (
      enforceProposal &&
      (price.source !== selection.expectedPriceSource ||
        price.sourceId !== selection.expectedPriceSourceId ||
        price.version !== selection.expectedPriceVersion)
    ) {
      throw optimistic("price");
    }
    if (selection.trackingType === "serialized") {
      if (selection.serializedUnitId === null)
        throw validation("Choose a serialized unit.", "lines");
      if (lock) {
        await tx.$queryRaw`SELECT id FROM serialized_units WHERE id = ${selection.serializedUnitId}::uuid AND organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid FOR UPDATE`;
      }
      const unit = await tx.serializedUnit.findFirst({
        where: {
          id: selection.serializedUnitId,
          organizationId: context.organizationId,
          branchId: context.branchId,
          productVariantId: selection.productVariantId,
          stockLocationId: selection.locationId,
        },
        select: {
          id: true,
          state: true,
          version: true,
          actualCostMinor: true,
          landedCostMinor: true,
          identifiers: {
            select: { identifierType: true, normalizedValue: true },
            orderBy: [{ identifierType: "asc" }, { position: "asc" }],
          },
        },
      });
      if (unit === null) throw notFound("serialized unit");
      if (
        selection.expectedUnitVersion !== null &&
        unit.version !== selection.expectedUnitVersion
      )
        throw optimistic("serialized unit");
      if (unit.identifiers.length === 0)
        throw validation(
          "The serialized unit has no verified identifier.",
          "lines",
        );
      const cost = unit.landedCostMinor ?? unit.actualCostMinor;
      return {
        ...selection,
        sku: variant.sku,
        name: variant.name,
        location,
        identifiers: unit.identifiers.map((identifier) => ({
          type: identifier.identifierType,
          value: identifier.normalizedValue,
        })),
        stockRecordId: unit.id,
        stockVersion: unit.version,
        available: unit.state === "available",
        priceSource: price.source,
        priceEntryId: price.sourceId,
        priceVersion: price.version,
        unitPriceMinor: price.unitPriceMinor,
        minimumUnitPriceMinor: price.minimumUnitPriceMinor,
        unitCogsMinor: safeInteger(cost ?? 0n, "unit cost", 0),
        costAvailable: cost !== null,
        warrantyType: variant.warrantyType,
        warrantyMonths: variant.warrantyMonths,
      };
    }
    if (lock) {
      await tx.$queryRaw`SELECT id FROM stock_batches WHERE organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid AND product_variant_id = ${selection.productVariantId}::uuid AND stock_location_id = ${selection.locationId}::uuid FOR UPDATE`;
    }
    const batch = await tx.stockBatch.findFirst({
      where: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        productVariantId: selection.productVariantId,
        stockLocationId: selection.locationId,
      },
      select: {
        id: true,
        quantityOnHand: true,
        quantityReserved: true,
        version: true,
        actualCostMinor: true,
        landedCostMinor: true,
      },
    });
    if (batch === null) throw notFound("stock batch");
    if (
      selection.expectedStockVersion !== null &&
      batch.version !== selection.expectedStockVersion
    )
      throw optimistic("stock");
    const cost = batch.landedCostMinor ?? batch.actualCostMinor;
    return {
      ...selection,
      sku: variant.sku,
      name: variant.name,
      location,
      identifiers: [],
      stockRecordId: batch.id,
      stockVersion: batch.version,
      available:
        batch.quantityOnHand - batch.quantityReserved >= selection.quantity,
      priceSource: price.source,
      priceEntryId: price.sourceId,
      priceVersion: price.version,
      unitPriceMinor: price.unitPriceMinor,
      minimumUnitPriceMinor: price.minimumUnitPriceMinor,
      unitCogsMinor: safeInteger(cost ?? 0n, "unit cost", 0),
      costAvailable: cost !== null,
      warrantyType: variant.warrantyType,
      warrantyMonths: variant.warrantyMonths,
    };
  }

  private reviewWarnings(
    context: SalesActorContext,
    calculation: SaleCalculation,
    policy: SalesPolicy,
    includeCostPolicy: boolean,
  ): SaleReviewWarning[] {
    const warnings: SaleReviewWarning[] = [];
    for (const line of calculation.lines) {
      if (
        line.snapshotUnitPriceMinor !== null &&
        (line.snapshotUnitPriceMinor !== line.unitPriceMinor ||
          line.expectedPriceSource !== line.priceSource ||
          line.expectedPriceSourceId !== line.priceEntryId ||
          line.expectedPriceVersion !== line.priceVersion)
      ) {
        warnings.push({
          code: "price_changed",
          severity: "blocking",
          message: `${line.name}'s selling price changed. Refresh the cart.`,
          lineId: line.id,
        });
      }
      if (!line.available) {
        warnings.push({
          code: "stock_unavailable",
          severity: "blocking",
          message: `${line.name} is no longer available in the selected location.`,
          lineId: line.id,
        });
      } else if (
        includeCostPolicy &&
        line.snapshotUnitCogsMinor !== null &&
        line.snapshotUnitCogsMinor !== line.unitCogsMinor
      ) {
        warnings.push({
          code: "stock_changed",
          severity: "warning",
          message: `${line.name}'s inventory cost changed and was recalculated.`,
          lineId: line.id,
        });
      }
      if (includeCostPolicy && !line.costAvailable) {
        warnings.push({
          code: "below_minimum_margin",
          severity: "blocking",
          message: context.canViewProfit
            ? `${line.name} has no authoritative inventory cost.`
            : "Pricing policy requires authorized review before this sale can be posted.",
          lineId: context.canViewProfit ? line.id : null,
        });
      }
      if (
        BigInt(line.lineTotalMinor) <
        BigInt(line.minimumUnitPriceMinor) * BigInt(line.quantity)
      ) {
        warnings.push({
          code: "below_minimum_price",
          severity: context.permissions.includes(
            PERMISSIONS.SALES_DISCOUNT_OVERRIDE,
          )
            ? "warning"
            : "blocking",
          message: `${line.name} falls below its configured minimum selling price.`,
          lineId: line.id,
        });
      }
    }
    if (
      calculation.discountMinor > 0 &&
      !context.permissions.includes(PERMISSIONS.SALES_DISCOUNT)
    ) {
      warnings.push({
        code: "discount_requires_authorization",
        severity: "blocking",
        message: "This sale discount requires sales.discount permission.",
        lineId: null,
      });
    }
    if (calculation.discountMinor > policy.discountOverrideThresholdMinor) {
      warnings.push({
        code: "discount_requires_authorization",
        severity: context.permissions.includes(
          PERMISSIONS.SALES_DISCOUNT_OVERRIDE,
        )
          ? "warning"
          : "blocking",
        message: `Discounts above ${policy.discountOverrideThresholdMinor} minor units require sales.discount_override permission.`,
        lineId: null,
      });
    }
    if (
      includeCostPolicy &&
      BigInt(calculation.grossProfitMinor) * 10_000n <
        BigInt(calculation.totalMinor) * BigInt(policy.minimumMarginBasisPoints)
    ) {
      warnings.push({
        code: "below_minimum_margin",
        severity: context.permissions.includes(
          PERMISSIONS.PRICING_OVERRIDE_MIN_MARGIN,
        )
          ? "warning"
          : "blocking",
        message: context.canViewProfit
          ? `This sale is below the configured ${policy.minimumMarginBasisPoints} basis-point margin floor.`
          : "Pricing policy requires authorized review before this sale can be posted.",
        lineId: null,
      });
    }
    return warnings;
  }

  private assertPostAllowed(
    context: SalesActorContext,
    calculation: SaleCalculation,
    policy: SalesPolicy,
  ): void {
    const warnings = this.reviewWarnings(context, calculation, policy, true);
    const unavailable = warnings.find(
      (warning) => warning.code === "stock_unavailable",
    );
    if (unavailable !== undefined)
      throw new DomainError(
        ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK,
        unavailable.message,
      );
    const priceChanged = warnings.find(
      (warning) => warning.code === "price_changed",
    );
    if (priceChanged !== undefined) throw optimistic("price");
    const discount = warnings.find(
      (warning) =>
        warning.code === "discount_requires_authorization" ||
        (warning.code === "below_minimum_price" &&
          warning.severity === "blocking"),
    );
    if (discount !== undefined)
      throw new DomainError(
        ERROR_CODES.SALE_DISCOUNT_NOT_AUTHORIZED,
        discount.message,
      );
    const margin = warnings.find(
      (warning) =>
        warning.code === "below_minimum_margin" &&
        warning.severity === "blocking",
    );
    if (margin !== undefined)
      throw new DomainError(ERROR_CODES.SALE_BELOW_MIN_MARGIN, margin.message);
  }

  private async assertCredit(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
    record: SaleRecord,
    amountMinor: number,
  ): Promise<void> {
    if (!context.permissions.includes(PERMISSIONS.SALES_CREDIT)) {
      throw new DomainError(
        ERROR_CODES.SALE_CREDIT_NOT_AUTHORIZED,
        "Customer credit requires sales.credit permission.",
      );
    }
    if (record.customerId === null) {
      throw new DomainError(
        ERROR_CODES.SALE_CREDIT_NOT_AUTHORIZED,
        "Choose a customer before using credit.",
      );
    }
    const customer = await this.customer(tx, context, record.customerId);
    if (customer === null) throw notFound("customer");
    const outstanding = await tx.receivable.aggregate({
      where: {
        organizationId: context.organizationId,
        customerId: record.customerId,
        status: { in: ["open", "partially_paid"] },
      },
      _sum: { balanceMinor: true },
    });
    if (
      (outstanding._sum.balanceMinor ?? 0n) + BigInt(amountMinor) >
      customer.creditLimitMinor
    ) {
      throw new DomainError(
        ERROR_CODES.SALE_CREDIT_NOT_AUTHORIZED,
        "This credit sale exceeds the customer's approved credit limit.",
      );
    }
  }

  private async policy(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
  ): Promise<SalesPolicy> {
    const rows = await tx.applicationSetting.findMany({
      where: {
        organizationId: context.organizationId,
        key: { in: Object.values(SALES_SETTING_KEYS) },
        OR: [{ branchId: context.branchId }, { branchId: null }],
      },
      select: { branchId: true, key: true, value: true },
    });
    const value = (key: string, fallback: number, maximum: number): number => {
      const row =
        rows.find(
          (candidate) =>
            candidate.key === key && candidate.branchId === context.branchId,
        ) ??
        rows.find(
          (candidate) => candidate.key === key && candidate.branchId === null,
        );
      if (row === undefined) return fallback;
      if (
        typeof row.value !== "number" ||
        !Number.isSafeInteger(row.value) ||
        row.value < 0 ||
        row.value > maximum
      ) {
        throw new Error(
          `Application setting ${key} must be an integer from 0 to ${maximum}.`,
        );
      }
      return row.value;
    };
    return {
      discountOverrideThresholdMinor: value(
        SALES_SETTING_KEYS.DISCOUNT_OVERRIDE_THRESHOLD_MINOR,
        DEFAULT_SALES_POLICY.discountOverrideThresholdMinor,
        Number.MAX_SAFE_INTEGER,
      ),
      minimumMarginBasisPoints: value(
        SALES_SETTING_KEYS.MINIMUM_MARGIN_BASIS_POINTS,
        DEFAULT_SALES_POLICY.minimumMarginBasisPoints,
        10_000,
      ),
      returnWindowDays: value(
        SALES_SETTING_KEYS.RETURN_WINDOW_DAYS,
        DEFAULT_SALES_POLICY.returnWindowDays,
        3_650,
      ),
      creditDueDays: value(
        SALES_SETTING_KEYS.CREDIT_DUE_DAYS,
        DEFAULT_SALES_POLICY.creditDueDays,
        3_650,
      ),
    };
  }

  private lineData(
    context: SalesActorContext,
    saleId: string,
    line: CalculatedLine,
    discountReason: string | null,
    unitSaleActive: boolean,
  ): Prisma.SaleLineCreateManyInput {
    const imei =
      line.trackingType === "serialized" ? line.identifiers[0]?.value : null;
    if (line.trackingType === "serialized" && imei === undefined)
      throw validation("A serialized unit must have an identifier.", "lines");
    return {
      id: line.id,
      organizationId: context.organizationId,
      branchId: context.branchId,
      saleId,
      stockLocationId: line.location.id,
      lineNumber: line.lineNumber,
      productVariantId: line.productVariantId,
      priceEntryId: line.priceEntryId,
      serializedUnitId: line.serializedUnitId,
      trackingTypeSnapshot: line.trackingType,
      productNameSnapshot: line.name,
      skuSnapshot: line.sku,
      imeiSnapshot: imei ?? null,
      quantity: line.quantity,
      unitPriceMinor: BigInt(line.unitPriceMinor),
      priceVersionSnapshot: line.priceVersion,
      discountMinor: BigInt(line.discountMinor),
      discountReason: line.discountMinor === 0 ? null : discountReason,
      lineTotalMinor: BigInt(line.lineTotalMinor),
      unitCogsMinor: BigInt(line.unitCogsMinor),
      cogsMinor: BigInt(line.cogsMinor),
      grossProfitMinor: BigInt(line.grossProfitMinor),
      warrantyTypeSnapshot: line.warrantyType,
      warrantyMonthsSnapshot: line.warrantyMonths,
      unitSaleActive: line.trackingType === "serialized" && unitSaleActive,
    };
  }

  private async load(
    client: Prisma.TransactionClient | PrismaService["client"],
    context: SalesActorContext,
    id: string,
  ): Promise<SaleRecord> {
    const record = await client.sale.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        branchId: context.branchId,
      },
      include: saleInclude,
    });
    if (record === null) throw notFound();
    if (
      context.allowedLocationIds !== null &&
      record.lines.some(
        (line) => !context.allowedLocationIds?.includes(line.stockLocationId),
      )
    ) {
      throw new DomainError(
        ERROR_CODES.FORBIDDEN_SCOPE,
        "This sale contains stock outside your assigned location scope.",
      );
    }
    return record;
  }

  private assertDraftVersion(record: SaleRecord, version: number): void {
    if (record.status !== "draft") {
      throw new DomainError(
        ERROR_CODES.SALE_POSTED_IMMUTABLE,
        "Only a draft sale can be changed.",
      );
    }
    if (record.version !== version) throw optimistic();
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: SalesActorContext,
    action: string,
    entityId: string,
    beforeSnapshot: Prisma.InputJsonObject | null,
    afterSnapshot: Prisma.InputJsonObject,
    reason?: string,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action,
        entityType: "sale",
        entityId,
        beforeSnapshot:
          beforeSnapshot === null ? Prisma.JsonNull : beforeSnapshot,
        afterSnapshot,
        ...(reason === undefined ? {} : { reason }),
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }
}
