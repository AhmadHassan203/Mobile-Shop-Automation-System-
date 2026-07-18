import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  businessDayEndUtc,
  businessDayStartUtc,
  DomainError,
  ERROR_CODES,
  parseBusinessDate,
  PostReturnResponseSchema,
  RETURN_EXCHANGE_CAPABILITY,
  RETURN_EXCHANGE_UNAVAILABLE_REASON,
  ReturnDetailSchema,
  ReturnEligibilitySchema,
  ReturnPageSchema,
  SEQUENCE_KEYS,
  toBusinessDate,
  type CreateReturnDraftData,
  type ExchangeReturnData,
  type PostReturnData,
  type PostReturnResponse,
  type ReturnDetail,
  type ReturnEligibility,
  type ReturnEligibilityQuery,
  type ReturnListQuery,
  type ReturnPage,
} from "@mobileshop/shared";
import { allocateDocumentNumber } from "../../common/numbers/number-sequence";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface ReturnsActorContext {
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
  readonly canViewSensitive: boolean;
  readonly metadata: AuthRequestMetadata;
}

const returnInclude = {
  organization: { select: { currency: true } },
  sale: {
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      postedAt: true,
      returnWindowDays: true,
      customerId: true,
      customerNameSnapshot: true,
      customerPhoneSnapshot: true,
    },
  },
  approvedBy: { select: { id: true, fullName: true } },
  policyOverriddenBy: { select: { id: true, fullName: true } },
  refund: true,
  lines: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
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
} satisfies Prisma.SaleReturnInclude;

type ReturnRecord = Prisma.SaleReturnGetPayload<{
  include: typeof returnInclude;
}>;

const saleLineSelect = {
  id: true,
  lineNumber: true,
  quantity: true,
  unitCogsMinor: true,
  lineTotalMinor: true,
  trackingTypeSnapshot: true,
  serializedUnitId: true,
  imeiSnapshot: true,
  stockLocationId: true,
  productVariantId: true,
  skuSnapshot: true,
  productNameSnapshot: true,
} satisfies Prisma.SaleLineSelect;

interface SaleReferenceSource {
  readonly id: string;
  readonly invoiceNumber: string | null;
  readonly status: string;
  readonly postedAt: Date | null;
  readonly returnWindowDays: number;
  readonly customerId: string | null;
  readonly customerNameSnapshot: string;
  readonly customerPhoneSnapshot: string | null;
}

/** Server-authoritative account routing for a refund rail. Credit never appears. */
const REFUND_ACCOUNT_BY_METHOD = Object.freeze({
  cash: { code: "CASH", subtype: "physical_cash" },
  bank_transfer: { code: "BANK", subtype: "bank" },
  card: { code: "BANK", subtype: "bank" },
  digital_wallet: { code: "DIGITAL", subtype: "provider_float" },
} as const);

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

function notFound(label = "return"): DomainError {
  return new DomainError(
    ERROR_CODES.NOT_FOUND,
    `This ${label} no longer exists.`,
  );
}

function optimistic(label = "return"): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    `This ${label} changed. Reload it before continuing.`,
  );
}

function forbiddenScope(message: string): DomainError {
  return new DomainError(ERROR_CODES.FORBIDDEN_SCOPE, message);
}

function unitMismatch(): DomainError {
  return new DomainError(
    ERROR_CODES.RETURN_UNIT_MISMATCH,
    "The selected serialized unit no longer matches the original sale line.",
  );
}

function quantityExceeded(): DomainError {
  return new DomainError(
    ERROR_CODES.RETURN_QUANTITY_EXCEEDS_SOLD,
    "The requested quantity exceeds what remains returnable on the original sale.",
  );
}

function originalSaleRequired(): DomainError {
  return new DomainError(
    ERROR_CODES.RETURN_ORIGINAL_SALE_REQUIRED,
    "A return requires a posted, still-returnable original sale.",
  );
}

/**
 * Cumulative-floor proportional refund for `thisQty` units of a sale line, given
 * how many units were already returned. Cumulative flooring guarantees the sum of
 * every batch's refund equals the sale line total exactly once the line is fully
 * returned, with no rounding drift.
 */
function proportionalRefundMinor(
  lineTotalMinor: bigint,
  soldQty: number,
  alreadyReturnedQty: number,
  thisQty: number,
): number {
  if (soldQty <= 0)
    throw new Error("A sale line must have a positive quantity.");
  const denominator = BigInt(soldQty);
  const previousCumulative =
    (lineTotalMinor * BigInt(alreadyReturnedQty)) / denominator;
  const nextCumulative =
    (lineTotalMinor * BigInt(alreadyReturnedQty + thisQty)) / denominator;
  return safeInteger(nextCumulative - previousCumulative, "return refund", 0);
}

function returnProfit(
  canView: boolean,
  cogsReversalMinor: number,
  refundMinor: number,
) {
  return canView
    ? {
        availability: "available" as const,
        cogsReversalMinor,
        grossProfitReversalMinor: refundMinor - cogsReversalMinor,
      }
    : { availability: "redacted" as const };
}

function saleReference(sale: SaleReferenceSource, canViewSensitive: boolean) {
  if (sale.postedAt === null) {
    throw new Error("A return references a sale that was never posted.");
  }
  if (sale.invoiceNumber === null) {
    throw new Error("A return references a sale without an invoice number.");
  }
  const deadline = new Date(sale.postedAt);
  deadline.setUTCDate(deadline.getUTCDate() + sale.returnWindowDays);
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    status: sale.status,
    postedAt: iso(sale.postedAt),
    returnWindowDays: sale.returnWindowDays,
    returnDeadline: iso(deadline),
    customer:
      sale.customerId === null
        ? null
        : {
            id: sale.customerId,
            name: sale.customerNameSnapshot,
            contact: canViewSensitive
              ? {
                  availability: "available" as const,
                  phone: sale.customerPhoneSnapshot,
                }
              : { availability: "redacted" as const },
          },
  };
}

function policyReference(record: ReturnRecord) {
  return {
    windowDaysSnapshot: record.returnWindowDaysSnapshot,
    deadline: iso(record.returnDeadline),
    checkedAt: iso(record.policyCheckedAt),
    expired: record.policyExpired,
    overridden: record.policyOverridden,
    overrideReason: record.policyOverrideReason,
    overriddenBy:
      record.policyOverriddenBy === null
        ? null
        : {
            id: record.policyOverriddenBy.id,
            fullName: record.policyOverriddenBy.fullName,
          },
    overriddenAt:
      record.policyOverriddenAt === null
        ? null
        : iso(record.policyOverriddenAt),
  };
}

function refundReference(refund: ReturnRecord["refund"]) {
  if (refund === null) return null;
  return {
    id: refund.id,
    refundNumber: refund.refundNumber,
    method: refund.paymentMethod,
    amountMinor: safeInteger(refund.amountMinor, "refund amount", 1),
    reference: refund.reference,
    refundedAt: iso(refund.refundedAt),
  };
}

function returnLineResponse(
  line: ReturnRecord["lines"][number],
  canViewProfit: boolean,
) {
  const refundMinor = safeInteger(line.refundMinor, "return line refund", 0);
  const cogsReversalMinor = safeInteger(
    line.cogsReversalMinor,
    "return line cost reversal",
    0,
  );
  const common = {
    id: line.id,
    saleLineId: line.saleLineId,
    product: {
      id: line.productVariantId,
      sku: line.skuSnapshot,
      name: line.productNameSnapshot,
    },
    location: line.stockLocation,
    refundMinor,
    condition: line.condition,
    outcome: line.outcome,
    profit: returnProfit(canViewProfit, cogsReversalMinor, refundMinor),
  };
  if (line.trackingTypeSnapshot === "serialized") {
    if (line.serializedUnit === null) {
      throw new Error("A serialized return line lost its unit.");
    }
    return {
      ...common,
      trackingType: "serialized" as const,
      quantity: 1 as const,
      serializedUnit: {
        id: line.serializedUnit.id,
        identifiers: line.serializedUnit.identifiers.map((identifier) => ({
          type: identifier.identifierType,
          value: identifier.normalizedValue,
        })),
      },
    };
  }
  return {
    ...common,
    trackingType: "quantity" as const,
    quantity: line.quantity,
  };
}

function returnTotals(record: ReturnRecord, canViewProfit: boolean) {
  const refundMinor = safeInteger(
    record.totalRefundMinor,
    "return refund total",
    0,
  );
  const cogsReversalMinor = safeInteger(
    record.totalCogsReversalMinor,
    "return cost reversal total",
    0,
  );
  return {
    refundMinor,
    receivableCreditMinor: safeInteger(
      record.receivableCreditMinor,
      "return receivable credit",
      0,
    ),
    refundedMinor: safeInteger(
      record.refundedMinor,
      "return refunded amount",
      0,
    ),
    profit: returnProfit(canViewProfit, cogsReversalMinor, refundMinor),
  };
}

function detailResponse(
  record: ReturnRecord,
  context: ReturnsActorContext,
): ReturnDetail {
  return ReturnDetailSchema.parse({
    id: record.id,
    returnNumber: record.returnNumber,
    status: record.status,
    sale: saleReference(record.sale, context.canViewSensitive),
    reason: record.reason,
    evidenceNote: record.evidenceNote,
    currency: record.organization.currency,
    lines: record.lines.map((line) =>
      returnLineResponse(line, context.canViewProfit),
    ),
    totals: returnTotals(record, context.canViewProfit),
    refund: refundReference(record.refund),
    policy: policyReference(record),
    approvedBy:
      record.approvedBy === null
        ? null
        : { id: record.approvedBy.id, fullName: record.approvedBy.fullName },
    exchange: RETURN_EXCHANGE_CAPABILITY,
    version: record.version,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
    postedAt: record.postedAt === null ? null : iso(record.postedAt),
  });
}

function summaryResponse(record: ReturnRecord, context: ReturnsActorContext) {
  return {
    id: record.id,
    returnNumber: record.returnNumber,
    status: record.status,
    sale: saleReference(record.sale, context.canViewSensitive),
    reason: record.reason,
    lineCount: record.lines.length,
    unitCount: record.lines.reduce((sum, line) => sum + line.quantity, 0),
    totalRefundMinor: safeInteger(
      record.totalRefundMinor,
      "return refund total",
      0,
    ),
    policyExpired: record.policyExpired,
    postedAt: record.postedAt === null ? null : iso(record.postedAt),
    createdAt: iso(record.createdAt),
    version: record.version,
  };
}

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    context: ReturnsActorContext,
    query: ReturnListQuery,
  ): Promise<ReturnPage> {
    const additionalFilters: Prisma.SaleReturnWhereInput[] = [];
    if (query.q !== undefined) {
      additionalFilters.push({
        OR: [
          { returnNumber: { contains: query.q, mode: "insensitive" } },
          {
            sale: {
              is: { invoiceNumber: { contains: query.q, mode: "insensitive" } },
            },
          },
          {
            sale: {
              is: {
                customerNameSnapshot: {
                  contains: query.q,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            lines: {
              some: { skuSnapshot: { contains: query.q, mode: "insensitive" } },
            },
          },
          {
            lines: {
              some: {
                identifierSnapshot: { contains: query.q, mode: "insensitive" },
              },
            },
          },
        ],
      });
    }
    const where: Prisma.SaleReturnWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.saleId === undefined ? {} : { saleId: query.saleId }),
      ...(query.customerId === undefined
        ? {}
        : { customerId: query.customerId }),
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
            createdAt: {
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
    const orderBy: Prisma.SaleReturnOrderByWithRelationInput =
      query.sort === "total"
        ? { totalRefundMinor: query.direction }
        : query.sort === "posted_at"
          ? { postedAt: { sort: query.direction, nulls: "last" } }
          : { createdAt: query.direction };
    const [total, rows] = await this.prisma.client.$transaction([
      this.prisma.client.saleReturn.count({ where }),
      this.prisma.client.saleReturn.findMany({
        where,
        include: returnInclude,
        orderBy: [orderBy, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return ReturnPageSchema.parse({
      items: rows.map((record) => summaryResponse(record, context)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async eligibility(
    context: ReturnsActorContext,
    query: ReturnEligibilityQuery,
  ): Promise<ReturnEligibility> {
    const sale = await this.prisma.client.sale.findFirst({
      where: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        // The query schema guarantees exactly one lookup key; each spread only
        // contributes when its key is present, so the filter carries just one.
        ...(query.saleId === undefined ? {} : { id: query.saleId }),
        ...(query.invoiceNumber === undefined
          ? {}
          : { invoiceNumber: query.invoiceNumber }),
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        postedAt: true,
        returnWindowDays: true,
        customerId: true,
        customerNameSnapshot: true,
        customerPhoneSnapshot: true,
        lines: {
          orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
          select: {
            id: true,
            quantity: true,
            unitCogsMinor: true,
            lineTotalMinor: true,
            trackingTypeSnapshot: true,
            serializedUnitId: true,
            stockLocationId: true,
            productVariantId: true,
            skuSnapshot: true,
            productNameSnapshot: true,
            stockLocation: { select: { id: true, code: true, name: true } },
            serializedUnit: {
              select: {
                id: true,
                identifiers: {
                  select: { identifierType: true, normalizedValue: true },
                  orderBy: [{ identifierType: "asc" }, { position: "asc" }],
                },
              },
            },
          },
        },
      },
    });
    if (sale === null || sale.postedAt === null) throw notFound("sale");
    if (
      context.allowedLocationIds !== null &&
      sale.lines.some(
        (line) => !context.allowedLocationIds?.includes(line.stockLocationId),
      )
    ) {
      throw forbiddenScope(
        "This sale contains stock outside your assigned location scope.",
      );
    }
    const selectedLines =
      query.saleLineId === undefined
        ? sale.lines
        : sale.lines.filter((line) => line.id === query.saleLineId);
    if (query.saleLineId !== undefined && selectedLines.length === 0) {
      throw notFound("sale line");
    }
    const alreadyReturned = await this.postedReturnedQuantities(
      this.prisma.client,
      context,
      sale.id,
    );
    const now = new Date();
    const deadline = new Date(sale.postedAt);
    deadline.setUTCDate(deadline.getUTCDate() + sale.returnWindowDays);
    const expired = now.getTime() > deadline.getTime();
    const lines = selectedLines.map((line) => {
      const returnedQuantity = alreadyReturned.get(line.id) ?? 0;
      const remainingQuantity = line.quantity - returnedQuantity;
      const refundableMinor = proportionalRefundMinor(
        line.lineTotalMinor,
        line.quantity,
        returnedQuantity,
        remainingQuantity,
      );
      const cogsReversalMinor = safeInteger(
        BigInt(remainingQuantity) * line.unitCogsMinor,
        "return cost reversal",
        0,
      );
      const common = {
        saleLineId: line.id,
        product: {
          id: line.productVariantId,
          sku: line.skuSnapshot,
          name: line.productNameSnapshot,
        },
        location: line.stockLocation,
        soldQuantity: line.quantity,
        returnedQuantity,
        remainingQuantity,
        refundableMinor,
        profit: returnProfit(
          context.canViewProfit,
          cogsReversalMinor,
          refundableMinor,
        ),
      };
      if (line.trackingTypeSnapshot === "serialized") {
        if (line.serializedUnit === null) {
          throw new Error("A serialized sale line lost its unit.");
        }
        return {
          ...common,
          trackingType: "serialized" as const,
          serializedUnit: {
            id: line.serializedUnit.id,
            identifiers: line.serializedUnit.identifiers.map((identifier) => ({
              type: identifier.identifierType,
              value: identifier.normalizedValue,
            })),
          },
        };
      }
      return { ...common, trackingType: "quantity" as const };
    });
    const totalRemaining = lines.reduce(
      (sum, line) => sum + line.remainingQuantity,
      0,
    );
    const state =
      sale.status !== "posted" &&
      sale.status !== "partially_returned" &&
      sale.status !== "returned"
        ? "sale_not_returnable"
        : totalRemaining === 0
          ? "fully_returned"
          : expired
            ? "window_expired"
            : "eligible";
    return ReturnEligibilitySchema.parse({
      state,
      eligible: state === "eligible",
      requiresOverride: state === "window_expired",
      sale: saleReference(sale, context.canViewSensitive),
      policy: {
        windowDaysSnapshot: sale.returnWindowDays,
        deadline: iso(deadline),
        checkedAt: iso(now),
        expired,
        overridden: false,
        overrideReason: null,
        overriddenBy: null,
        overriddenAt: null,
      },
      lines,
      exchange: RETURN_EXCHANGE_CAPABILITY,
    });
  }

  async createDraft(
    context: ReturnsActorContext,
    input: CreateReturnDraftData,
  ): Promise<ReturnDetail> {
    const record = await this.prisma.client.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: {
          id: input.saleId,
          organizationId: context.organizationId,
          branchId: context.branchId,
        },
        select: {
          id: true,
          status: true,
          postedAt: true,
          returnWindowDays: true,
          customerId: true,
          lines: { select: saleLineSelect },
        },
      });
      if (sale === null) throw notFound("sale");
      if (
        sale.postedAt === null ||
        (sale.status !== "posted" && sale.status !== "partially_returned")
      ) {
        throw originalSaleRequired();
      }
      const alreadyReturned = await this.postedReturnedQuantities(
        tx,
        context,
        sale.id,
      );
      const now = new Date();
      const deadline = new Date(sale.postedAt);
      deadline.setUTCDate(deadline.getUTCDate() + sale.returnWindowDays);
      const expired = now.getTime() > deadline.getTime();

      const lineData: Omit<Prisma.ReturnLineCreateManyInput, "returnId">[] = [];
      for (const inputLine of input.lines) {
        const saleLine = sale.lines.find(
          (line) => line.id === inputLine.saleLineId,
        );
        if (saleLine === undefined) throw notFound("sale line");
        this.assertLocation(context, saleLine.stockLocationId);
        const returned = alreadyReturned.get(saleLine.id) ?? 0;
        const remaining = saleLine.quantity - returned;
        if (inputLine.trackingType === "serialized") {
          if (
            saleLine.trackingTypeSnapshot !== "serialized" ||
            saleLine.serializedUnitId !== inputLine.serializedUnitId ||
            saleLine.imeiSnapshot !== inputLine.identifier
          ) {
            throw unitMismatch();
          }
          const unit = await tx.serializedUnit.findFirst({
            where: {
              id: inputLine.serializedUnitId,
              organizationId: context.organizationId,
              branchId: context.branchId,
              productVariantId: saleLine.productVariantId,
              stockLocationId: saleLine.stockLocationId,
            },
            select: { id: true, state: true },
          });
          if (unit === null) throw notFound("serialized unit");
          if (unit.state !== "sold") throw unitMismatch();
          if (remaining <= 0) throw quantityExceeded();
        } else {
          if (saleLine.trackingTypeSnapshot !== "quantity")
            throw unitMismatch();
          if (remaining <= 0 || inputLine.quantity > remaining) {
            throw quantityExceeded();
          }
        }
        lineData.push({
          organizationId: context.organizationId,
          branchId: context.branchId,
          saleId: sale.id,
          saleLineId: saleLine.id,
          productVariantId: saleLine.productVariantId,
          stockLocationId: saleLine.stockLocationId,
          serializedUnitId:
            inputLine.trackingType === "serialized"
              ? inputLine.serializedUnitId
              : null,
          trackingTypeSnapshot: saleLine.trackingTypeSnapshot,
          productNameSnapshot: saleLine.productNameSnapshot,
          skuSnapshot: saleLine.skuSnapshot,
          identifierSnapshot:
            inputLine.trackingType === "serialized"
              ? saleLine.imeiSnapshot
              : null,
          quantity:
            inputLine.trackingType === "serialized" ? 1 : inputLine.quantity,
          // Draft carries the customer's claim only. Every amount is computed
          // and settled authoritatively under lock at posting, so drafts keep
          // zeroed placeholders and the header/line totals always reconcile.
          refundMinor: 0n,
          cogsReversalMinor: 0n,
          condition: inputLine.condition,
          outcome: null,
        });
      }

      const created = await tx.saleReturn.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          saleId: sale.id,
          customerId: sale.customerId,
          reason: input.reason,
          evidenceNote: input.evidenceNote,
          returnWindowDaysSnapshot: sale.returnWindowDays,
          returnDeadline: deadline,
          policyCheckedAt: now,
          policyExpired: expired,
          createdByUserId: context.actorUserId,
        },
        select: { id: true },
      });
      await tx.returnLine.createMany({
        data: lineData.map((line) => ({ ...line, returnId: created.id })),
      });
      await this.audit(tx, context, "return.draft_created", created.id, null, {
        version: 1,
        saleId: sale.id,
        lineCount: input.lines.length,
      });
      return this.load(tx, context, created.id);
    });
    return detailResponse(record, context);
  }

  async detail(
    context: ReturnsActorContext,
    id: string,
  ): Promise<ReturnDetail> {
    return detailResponse(
      await this.load(this.prisma.client, context, id),
      context,
    );
  }

  async exchange(
    context: ReturnsActorContext,
    id: string,
    input: ExchangeReturnData,
  ): Promise<never> {
    const record = await this.load(this.prisma.client, context, id);
    if (record.version !== input.version) throw optimistic();
    // The endpoint is intentionally stable, but a safe exchange must post a new
    // sale and this return inside one atomic boundary that is not yet available.
    // Never partially post: refuse outright rather than settle a half-exchange.
    throw new DomainError(
      ERROR_CODES.CONFLICT,
      RETURN_EXCHANGE_UNAVAILABLE_REASON,
    );
  }

  async post(
    context: ReturnsActorContext,
    id: string,
    idempotencyKey: string,
    input: PostReturnData,
    retryCount = 0,
  ): Promise<PostReturnResponse> {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          returnId: id,
          version: input.version,
          refund: input.refund,
          policyOverrideReason: input.policyOverrideReason,
        }),
      )
      .digest("hex");
    let result: { readonly record: ReturnRecord; readonly replay: boolean };
    try {
      result = await this.prisma.client.$transaction(
        async (tx) => {
          const used = await tx.saleReturn.findFirst({
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
              "This idempotency key was already used for another return.",
            );
          }
          await tx.$queryRaw`SELECT id FROM returns WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid FOR UPDATE`;
          const record = await this.load(tx, context, id);
          if (record.status !== "draft") {
            if (record.postRequestId === idempotencyKey) {
              if (record.postRequestHash !== requestHash) {
                throw new DomainError(
                  ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
                  "The idempotency key was reused with a different posting request.",
                );
              }
              return { record, replay: true };
            }
            throw new DomainError(
              ERROR_CODES.CONFLICT,
              "This return is already closed and cannot be posted again.",
            );
          }
          if (record.version !== input.version) throw optimistic();

          await tx.$queryRaw`SELECT id FROM sales WHERE id = ${record.saleId}::uuid AND organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid FOR UPDATE`;
          const sale = await tx.sale.findFirst({
            where: {
              id: record.saleId,
              organizationId: context.organizationId,
              branchId: context.branchId,
            },
            select: {
              id: true,
              status: true,
              postedAt: true,
              returnWindowDays: true,
              customerId: true,
              version: true,
              lines: { select: saleLineSelect },
            },
          });
          if (sale === null) throw notFound("sale");
          if (
            sale.postedAt === null ||
            (sale.status !== "posted" && sale.status !== "partially_returned")
          ) {
            throw originalSaleRequired();
          }
          await tx.$queryRaw`SELECT id FROM sale_lines WHERE sale_id = ${sale.id}::uuid AND organization_id = ${context.organizationId}::uuid FOR UPDATE`;
          const lockOrder = [...record.lines].sort((left, right) =>
            `${left.stockLocationId}:${left.productVariantId}:${left.serializedUnitId ?? ""}`.localeCompare(
              `${right.stockLocationId}:${right.productVariantId}:${right.serializedUnitId ?? ""}`,
            ),
          );
          for (const line of lockOrder) {
            if (
              line.trackingTypeSnapshot === "serialized" &&
              line.serializedUnitId !== null
            ) {
              await tx.$queryRaw`SELECT id FROM serialized_units WHERE id = ${line.serializedUnitId}::uuid AND organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid FOR UPDATE`;
            } else {
              await tx.$queryRaw`SELECT id FROM stock_batches WHERE organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid AND product_variant_id = ${line.productVariantId}::uuid AND stock_location_id = ${line.stockLocationId}::uuid FOR UPDATE`;
            }
          }

          // Policy recomputed authoritatively under lock.
          const now = new Date();
          const deadline = new Date(sale.postedAt);
          deadline.setUTCDate(deadline.getUTCDate() + sale.returnWindowDays);
          const expired = now.getTime() > deadline.getTime();
          if (expired && input.policyOverrideReason === null) {
            throw new DomainError(
              ERROR_CODES.RETURN_WINDOW_EXPIRED,
              "The return window has closed. An authorized override reason is required.",
            );
          }
          const overridden = expired;

          const alreadyReturned = await this.postedReturnedQuantities(
            tx,
            context,
            sale.id,
          );
          const computed = record.lines.map((line) => {
            const saleLine = sale.lines.find(
              (candidate) => candidate.id === line.saleLineId,
            );
            if (saleLine === undefined) throw unitMismatch();
            const returned = alreadyReturned.get(line.saleLineId) ?? 0;
            const remaining = saleLine.quantity - returned;
            if (remaining <= 0 || line.quantity > remaining)
              throw quantityExceeded();
            const refundMinor = proportionalRefundMinor(
              saleLine.lineTotalMinor,
              saleLine.quantity,
              returned,
              line.quantity,
            );
            const cogsReversalMinor = safeInteger(
              BigInt(line.quantity) * saleLine.unitCogsMinor,
              "return line cost reversal",
              0,
            );
            return { line, saleLine, refundMinor, cogsReversalMinor };
          });
          const totalRefundMinor = safeInteger(
            computed.reduce(
              (sum, entry) => sum + BigInt(entry.refundMinor),
              0n,
            ),
            "return refund total",
            0,
          );
          const totalCogsReversalMinor = safeInteger(
            computed.reduce(
              (sum, entry) => sum + BigInt(entry.cogsReversalMinor),
              0n,
            ),
            "return cost reversal total",
            0,
          );

          // Settlement split — server authoritative, no client amount is trusted.
          const receivableRow = await tx.receivable.findFirst({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              saleId: sale.id,
            },
            select: { id: true },
          });
          let receivable: {
            id: string;
            balanceMinor: bigint;
            status: string;
            version: number;
          } | null = null;
          if (receivableRow !== null) {
            await tx.$queryRaw`SELECT id FROM receivables WHERE id = ${receivableRow.id}::uuid AND organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid FOR UPDATE`;
            receivable = await tx.receivable.findFirst({
              where: {
                id: receivableRow.id,
                organizationId: context.organizationId,
                branchId: context.branchId,
              },
              select: {
                id: true,
                balanceMinor: true,
                status: true,
                version: true,
              },
            });
          }
          const openReceivable =
            receivable !== null &&
            (receivable.status === "open" ||
              receivable.status === "partially_paid")
              ? receivable
              : null;
          const receivableBalanceMinor = openReceivable
            ? safeInteger(openReceivable.balanceMinor, "receivable balance", 0)
            : 0;
          const receivableCreditMinor = openReceivable
            ? Math.min(totalRefundMinor, receivableBalanceMinor)
            : 0;
          const refundedMinor = totalRefundMinor - receivableCreditMinor;
          if (totalRefundMinor !== receivableCreditMinor + refundedMinor) {
            throw new DomainError(
              ERROR_CODES.CONFLICT,
              "The return settlement did not reconcile.",
            );
          }
          if (refundedMinor > 0 && input.refund === null) {
            throw new DomainError(
              ERROR_CODES.VALIDATION_FAILED,
              "A refund instruction is required to settle the amount not covered by credit.",
              { details: { refund: ["A refund instruction is required."] } },
            );
          }
          if (refundedMinor === 0 && input.refund !== null) {
            throw new DomainError(
              ERROR_CODES.VALIDATION_FAILED,
              "No external refund is required; the return is fully covered by credit.",
              { details: { refund: ["No external refund is required."] } },
            );
          }

          const businessDateText = toBusinessDate(now);
          const businessDate = new Date(`${businessDateText}T00:00:00.000Z`);
          const periodKey = businessDateText.slice(0, 4);

          // Restock: append-only movements plus version-guarded stock updates.
          for (const entry of computed) {
            const line = entry.line;
            if (line.trackingTypeSnapshot === "serialized") {
              if (
                line.serializedUnitId === null ||
                entry.saleLine.serializedUnitId !== line.serializedUnitId ||
                entry.saleLine.imeiSnapshot !== line.identifierSnapshot
              ) {
                throw unitMismatch();
              }
              const unit = await tx.serializedUnit.findFirst({
                where: {
                  id: line.serializedUnitId,
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  productVariantId: line.productVariantId,
                  stockLocationId: line.stockLocationId,
                },
                select: { id: true, state: true, version: true },
              });
              if (unit === null) throw notFound("serialized unit");
              if (unit.state !== "sold") throw unitMismatch();
              const updated = await tx.serializedUnit.updateMany({
                where: {
                  id: unit.id,
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  version: unit.version,
                  state: "sold",
                },
                data: {
                  state: "returned_inspection",
                  version: { increment: 1 },
                },
              });
              if (updated.count !== 1) throw unitMismatch();
              await tx.inventoryMovement.create({
                data: {
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  productVariantId: line.productVariantId,
                  serializedUnitId: unit.id,
                  stockBatchId: null,
                  stockLocationId: line.stockLocationId,
                  movementType: "sale_return",
                  quantity: 1,
                  fromState: "sold",
                  toState: "returned_inspection",
                  referenceType: "return",
                  referenceId: id,
                  actorUserId: context.actorUserId,
                },
              });
            } else {
              const batch = await tx.stockBatch.findFirst({
                where: {
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  productVariantId: line.productVariantId,
                  stockLocationId: line.stockLocationId,
                },
                select: { id: true, version: true },
              });
              if (batch === null) {
                throw new DomainError(
                  ERROR_CODES.CONFLICT,
                  "The stock batch to restock no longer exists.",
                );
              }
              const updated = await tx.stockBatch.updateMany({
                where: {
                  id: batch.id,
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  version: batch.version,
                },
                data: {
                  quantityOnHand: { increment: line.quantity },
                  version: { increment: 1 },
                },
              });
              if (updated.count !== 1) {
                throw new DomainError(
                  ERROR_CODES.CONFLICT,
                  "Quantity stock changed before the return could restock it.",
                );
              }
              await tx.inventoryMovement.create({
                data: {
                  organizationId: context.organizationId,
                  branchId: context.branchId,
                  productVariantId: line.productVariantId,
                  serializedUnitId: null,
                  stockBatchId: batch.id,
                  stockLocationId: line.stockLocationId,
                  movementType: "sale_return",
                  quantity: line.quantity,
                  fromState: null,
                  toState: null,
                  referenceType: "return",
                  referenceId: id,
                  actorUserId: context.actorUserId,
                },
              });
            }
          }

          const returnNumber = await allocateDocumentNumber(
            tx,
            {
              organizationId: context.organizationId,
              branchId: context.branchId,
            },
            { key: SEQUENCE_KEYS.RETURN, defaultPrefix: "RTN-", periodKey },
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
              throw new DomainError(
                ERROR_CODES.VALIDATION_FAILED,
                `Configure the active ${code} account as ${subtype.replaceAll("_", " ")} before posting a return.`,
                { details: { refund: [`Missing ${code} account.`] } },
              );
            }
            return account;
          };

          let refundId: string | null = null;
          let refundAccountId: string | null = null;
          let refundNumber: string | null = null;
          if (refundedMinor > 0) {
            const instruction = input.refund;
            if (instruction === null) {
              throw new DomainError(
                ERROR_CODES.VALIDATION_FAILED,
                "A refund instruction is required.",
                { details: { refund: ["A refund instruction is required."] } },
              );
            }
            const routing = REFUND_ACCOUNT_BY_METHOD[instruction.method];
            const account = accountFor(routing.code, routing.subtype);
            refundAccountId = account.id;
            let cashSessionId: string | null = null;
            if (instruction.method === "cash") {
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
              cashSessionId = lockedSessions[0]?.id ?? null;
              if (cashSessionId === null) {
                throw new DomainError(
                  ERROR_CODES.SALE_CASH_SESSION_REQUIRED,
                  "Open a cash session before refunding cash.",
                );
              }
            }
            refundNumber = await allocateDocumentNumber(
              tx,
              {
                organizationId: context.organizationId,
                branchId: context.branchId,
              },
              { key: "refund", defaultPrefix: "REF-", periodKey },
            );
            const refund = await tx.refund.create({
              data: {
                organizationId: context.organizationId,
                branchId: context.branchId,
                returnId: id,
                refundNumber,
                paymentMethod: instruction.method,
                amountMinor: BigInt(refundedMinor),
                financialAccountId: account.id,
                reference: instruction.reference,
                cashSessionId,
                businessDate,
                processedByUserId: context.actorUserId,
              },
              select: { id: true },
            });
            refundId = refund.id;
          }

          // Ledger reversal — one balanced entry group, per-leg idempotent.
          const entryGroupId = record.id;
          const entries: Prisma.FinancialEntryCreateManyInput[] = [];
          const entryBase = {
            organizationId: context.organizationId,
            branchId: context.branchId,
            entryGroupId,
            occurredAt: now,
            businessDate,
            actorUserId: context.actorUserId,
          };
          if (totalRefundMinor > 0) {
            entries.push({
              ...entryBase,
              sourceType: "return",
              sourceId: id,
              sourceKey: `return:${id}:revenue_reversal`,
              financialAccountId: accountFor("SALES", "sales_revenue").id,
              direction: "debit",
              amountMinor: BigInt(totalRefundMinor),
              description: `Return ${returnNumber} revenue reversal`,
            });
          }
          if (
            refundedMinor > 0 &&
            refundId !== null &&
            refundAccountId !== null
          ) {
            entries.push({
              ...entryBase,
              sourceType: "refund",
              sourceId: refundId,
              sourceKey: `refund:${refundId}:out`,
              financialAccountId: refundAccountId,
              direction: "credit",
              amountMinor: BigInt(refundedMinor),
              description: `Refund ${refundNumber} settlement`,
            });
          }
          if (receivableCreditMinor > 0) {
            entries.push({
              ...entryBase,
              sourceType: "return",
              sourceId: id,
              sourceKey: `return:${id}:receivable_credit`,
              financialAccountId: accountFor("AR", "receivable").id,
              direction: "credit",
              amountMinor: BigInt(receivableCreditMinor),
              description: `Return ${returnNumber} receivable credit`,
            });
          }
          if (totalCogsReversalMinor > 0) {
            entries.push(
              {
                ...entryBase,
                sourceType: "return",
                sourceId: id,
                sourceKey: `return:${id}:inventory_restock`,
                financialAccountId: accountFor("INVENTORY", "inventory_asset")
                  .id,
                direction: "debit",
                amountMinor: BigInt(totalCogsReversalMinor),
                description: `Return ${returnNumber} inventory restock`,
              },
              {
                ...entryBase,
                sourceType: "return",
                sourceId: id,
                sourceKey: `return:${id}:cogs_reversal`,
                financialAccountId: accountFor("COGS", "cost_of_goods_sold").id,
                direction: "credit",
                amountMinor: BigInt(totalCogsReversalMinor),
                description: `Return ${returnNumber} cost of goods sold reversal`,
              },
            );
          }
          const debit = entries
            .filter((entry) => entry.direction === "debit")
            .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
          const credit = entries
            .filter((entry) => entry.direction === "credit")
            .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
          if (debit !== credit) {
            throw new DomainError(
              ERROR_CODES.LEDGER_UNBALANCED,
              "The return ledger did not balance.",
            );
          }
          if (entries.length > 0) {
            await tx.financialEntry.createMany({ data: entries });
          }

          if (receivableCreditMinor > 0 && openReceivable !== null) {
            const newBalanceMinor =
              receivableBalanceMinor - receivableCreditMinor;
            const nextStatus = newBalanceMinor <= 0 ? "paid" : "partially_paid";
            const updatedReceivable = await tx.receivable.updateMany({
              where: {
                id: openReceivable.id,
                organizationId: context.organizationId,
                branchId: context.branchId,
                version: openReceivable.version,
              },
              data: {
                creditedMinor: { increment: receivableCreditMinor },
                balanceMinor: { decrement: receivableCreditMinor },
                status: nextStatus,
                version: { increment: 1 },
              },
            });
            if (updatedReceivable.count !== 1) throw optimistic("receivable");
          }

          // Transition the original sale — only status and version may move, the
          // guard_sale_after_draft trigger enforces every snapshot stays frozen.
          const returnedAfter = new Map(alreadyReturned);
          for (const entry of computed) {
            returnedAfter.set(
              entry.line.saleLineId,
              (returnedAfter.get(entry.line.saleLineId) ?? 0) +
                entry.line.quantity,
            );
          }
          const fullyReturned = sale.lines.every(
            (saleLine) =>
              (returnedAfter.get(saleLine.id) ?? 0) >= saleLine.quantity,
          );
          const nextSaleStatus = fullyReturned
            ? "returned"
            : "partially_returned";
          const saleUpdated = await tx.sale.updateMany({
            where: {
              id: sale.id,
              organizationId: context.organizationId,
              branchId: context.branchId,
              status: sale.status,
              version: sale.version,
            },
            data: { status: nextSaleStatus, version: { increment: 1 } },
          });
          if (saleUpdated.count !== 1) throw optimistic("sale");

          // Authoritative line amounts must be written while the parent return is
          // still draft (guard_return_line_draft), then the header is frozen.
          for (const entry of computed) {
            await tx.returnLine.update({
              where: { id: entry.line.id },
              data: {
                refundMinor: BigInt(entry.refundMinor),
                cogsReversalMinor: BigInt(entry.cogsReversalMinor),
              },
            });
          }
          const frozen = await tx.saleReturn.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              branchId: context.branchId,
              status: "draft",
              version: input.version,
            },
            data: {
              status: "posted",
              returnNumber,
              totalRefundMinor: BigInt(totalRefundMinor),
              totalCogsReversalMinor: BigInt(totalCogsReversalMinor),
              receivableCreditMinor: BigInt(receivableCreditMinor),
              refundedMinor: BigInt(refundedMinor),
              returnWindowDaysSnapshot: sale.returnWindowDays,
              returnDeadline: deadline,
              policyCheckedAt: now,
              policyExpired: expired,
              policyOverridden: overridden,
              policyOverrideReason: overridden
                ? input.policyOverrideReason
                : null,
              policyOverriddenByUserId: overridden ? context.actorUserId : null,
              policyOverriddenAt: overridden ? now : null,
              approvedByUserId: context.actorUserId,
              postedAt: now,
              businessDate,
              postRequestId: idempotencyKey,
              postRequestHash: requestHash,
              version: { increment: 1 },
            },
          });
          if (frozen.count !== 1) throw optimistic();

          await this.audit(
            tx,
            context,
            "return.posted",
            id,
            { version: input.version },
            {
              returnNumber,
              totalRefundMinor,
              receivableCreditMinor,
              refundedMinor,
              policyExpired: expired,
              policyOverridden: overridden,
              saleId: sale.id,
              saleStatusAfter: nextSaleStatus,
            },
            overridden ? (input.policyOverrideReason ?? undefined) : undefined,
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
      const used = await this.prisma.client.saleReturn.findFirst({
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
        return PostReturnResponseSchema.parse({
          return: detailResponse(record, context),
          idempotencyReplay: true,
        });
      }
      if (code === "P2034" && retryCount < 2) {
        return this.post(context, id, idempotencyKey, input, retryCount + 1);
      }
      throw new DomainError(
        ERROR_CODES.CONFLICT,
        "The return was changed concurrently. Retry with the same idempotency key.",
        { cause: error },
      );
    }
    return PostReturnResponseSchema.parse({
      return: detailResponse(result.record, context),
      idempotencyReplay: result.replay,
    });
  }

  private assertLocation(
    context: ReturnsActorContext,
    locationId: string,
  ): void {
    if (
      context.allowedLocationIds !== null &&
      !context.allowedLocationIds.includes(locationId)
    ) {
      throw forbiddenScope(
        "This stock location is outside your assigned scope.",
      );
    }
  }

  private async postedReturnedQuantities(
    client: Prisma.TransactionClient | PrismaService["client"],
    context: ReturnsActorContext,
    saleId: string,
  ): Promise<Map<string, number>> {
    const rows = await client.returnLine.findMany({
      where: {
        organizationId: context.organizationId,
        saleId,
        saleReturn: { is: { status: "posted" } },
      },
      select: { saleLineId: true, quantity: true },
    });
    const returned = new Map<string, number>();
    for (const row of rows) {
      returned.set(
        row.saleLineId,
        (returned.get(row.saleLineId) ?? 0) + row.quantity,
      );
    }
    return returned;
  }

  private async load(
    client: Prisma.TransactionClient | PrismaService["client"],
    context: ReturnsActorContext,
    id: string,
  ): Promise<ReturnRecord> {
    const record = await client.saleReturn.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        branchId: context.branchId,
      },
      include: returnInclude,
    });
    if (record === null) throw notFound();
    if (
      context.allowedLocationIds !== null &&
      record.lines.some(
        (line) => !context.allowedLocationIds?.includes(line.stockLocationId),
      )
    ) {
      throw forbiddenScope(
        "This return contains stock outside your assigned location scope.",
      );
    }
    return record;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: ReturnsActorContext,
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
        entityType: "return",
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
