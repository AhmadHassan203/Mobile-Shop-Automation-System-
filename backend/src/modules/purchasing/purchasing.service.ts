import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type PurchaseOrderStatus as DatabasePurchaseOrderStatus,
  type SerializedStockState,
} from "@mobileshop/database";
import {
  GoodsReceiptDetailSchema,
  GoodsReceiptPageSchema,
  GoodsReceiptSummarySchema,
  MoneyError,
  PurchaseOrderDetailSchema,
  PurchaseOrderPageSchema,
  PurchaseOrderSummarySchema,
  RECEIVABLE_PURCHASE_ORDER_STATUSES,
  SEQUENCE_KEYS,
  SupplierDetailSchema,
  SupplierPageSchema,
  SupplierSummarySchema,
  DomainError,
  ERROR_CODES,
  allocateByIntegerWeights,
  addBusinessDays,
  businessDayEndUtc,
  businessDayStartUtc,
  isPurchaseOrderTransitionAllowed,
  movingWeightedAverageUnitCost,
  multiplyByQuantity,
  normalizeSerial,
  sum,
  toBusinessDate,
  toMinor,
  validateImei,
  parseBusinessDate as parseBusinessDateString,
  type CancelPurchaseOrderData,
  type CreateGoodsReceiptData,
  type CreatePurchaseOrderData,
  type CreateSupplierData,
  type GoodsReceiptDetail,
  type GoodsReceiptLineData,
  type GoodsReceiptListQuery,
  type GoodsReceiptPage,
  type GoodsReceiptSummary,
  type PurchaseOrderDetail,
  type PurchaseOrderListQuery,
  type PurchaseOrderPage,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
  type PurchaseOrderTransitionData,
  type PurchasingVersionData,
  type SupplierDetail,
  type SupplierListQuery,
  type SupplierPage,
  type SupplierSummary,
  type UpdatePurchaseOrderData,
  type UpdateSupplierData,
} from "@mobileshop/shared";
import type { z } from "zod";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface PurchasingActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  /** Null means the authenticated user has branch-wide location access. */
  readonly allowedLocationIds: readonly string[] | null;
  readonly metadata: AuthRequestMetadata;
}

const contactSelect = {
  id: true,
  name: true,
  role: true,
  phone: true,
  email: true,
  isPrimary: true,
} satisfies Prisma.SupplierContactSelect;

const supplierSummarySelect = {
  id: true,
  code: true,
  name: true,
  paymentTermsDays: true,
  leadTimeDays: true,
  onTimeRateBasisPoints: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  contacts: {
    where: { isActive: true, isPrimary: true },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    take: 1,
    select: contactSelect,
  },
} satisfies Prisma.SupplierSelect;

const supplierDetailSelect = {
  ...supplierSummarySelect,
  addressLine: true,
  city: true,
  notes: true,
  contacts: {
    where: { isActive: true },
    orderBy: [
      { isPrimary: "desc" as const },
      { name: "asc" as const },
      { id: "asc" as const },
    ],
    select: contactSelect,
  },
} satisfies Prisma.SupplierSelect;

const nestedSupplierSelect = {
  id: true,
  code: true,
  name: true,
} satisfies Prisma.SupplierSelect;

const nestedVariantSelect = {
  id: true,
  sku: true,
  name: true,
  trackingType: true,
  condition: true,
  ptaStatus: true,
} satisfies Prisma.ProductVariantSelect;

const purchaseOrderSummarySelect = {
  id: true,
  number: true,
  status: true,
  orderDate: true,
  expectedOn: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  supplier: { select: nestedSupplierSelect },
  lines: {
    orderBy: [{ lineNumber: "asc" as const }],
    select: {
      quantityOrdered: true,
      quantityReceived: true,
      unitCostMinor: true,
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

const purchaseOrderDetailSelect = {
  ...purchaseOrderSummarySelect,
  notes: true,
  approvedAt: true,
  orderedAt: true,
  closedAt: true,
  cancelledAt: true,
  lines: {
    orderBy: [{ lineNumber: "asc" as const }],
    select: {
      id: true,
      quantityOrdered: true,
      quantityReceived: true,
      unitCostMinor: true,
      notes: true,
      productVariant: { select: nestedVariantSelect },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

const goodsReceiptSummarySelect = {
  id: true,
  number: true,
  supplierInvoiceReference: true,
  receivedAt: true,
  actualCostTotalMinor: true,
  landedCostTotalMinor: true,
  payableTotalMinor: true,
  createdAt: true,
  purchaseOrder: { select: { id: true, number: true } },
  supplier: { select: nestedSupplierSelect },
  lines: { select: { quantityReceived: true } },
} satisfies Prisma.GoodsReceiptSelect;

const goodsReceiptDetailSelect = {
  ...goodsReceiptSummarySelect,
  invoiceDueOn: true,
  notes: true,
  landedCosts: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      kind: true,
      amountMinor: true,
      reference: true,
      notes: true,
    },
  },
  payable: {
    select: {
      id: true,
      dueOn: true,
      amountMinor: true,
      outstandingMinor: true,
      status: true,
    },
  },
  lines: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      purchaseOrderLineId: true,
      quantityReceived: true,
      unitCostMinor: true,
      actualCostTotalMinor: true,
      landedCostAllocatedMinor: true,
      landedCostTotalMinor: true,
      stockBatchId: true,
      productVariant: { select: nestedVariantSelect },
      stockLocation: { select: { id: true, code: true, name: true } },
      serializedUnits: {
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          actualCostMinor: true,
          landedCostMinor: true,
          identifiers: {
            orderBy: [
              { identifierType: "asc" as const },
              { position: "asc" as const },
            ],
            select: {
              identifierType: true,
              position: true,
              normalizedValue: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.GoodsReceiptSelect;

const receivingPurchaseOrderSelect = {
  id: true,
  supplierId: true,
  status: true,
  version: true,
  supplier: {
    select: {
      id: true,
      code: true,
      name: true,
      paymentTermsDays: true,
    },
  },
  lines: {
    orderBy: [{ lineNumber: "asc" as const }],
    select: {
      id: true,
      productVariantId: true,
      quantityOrdered: true,
      quantityReceived: true,
      unitCostMinor: true,
      productVariant: {
        select: {
          ...nestedVariantSelect,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

type SupplierSummaryRecord = Prisma.SupplierGetPayload<{
  select: typeof supplierSummarySelect;
}>;
type SupplierDetailRecord = Prisma.SupplierGetPayload<{
  select: typeof supplierDetailSelect;
}>;
type PurchaseOrderSummaryRecord = Prisma.PurchaseOrderGetPayload<{
  select: typeof purchaseOrderSummarySelect;
}>;
type PurchaseOrderDetailRecord = Prisma.PurchaseOrderGetPayload<{
  select: typeof purchaseOrderDetailSelect;
}>;
type GoodsReceiptSummaryRecord = Prisma.GoodsReceiptGetPayload<{
  select: typeof goodsReceiptSummarySelect;
}>;
type GoodsReceiptDetailRecord = Prisma.GoodsReceiptGetPayload<{
  select: typeof goodsReceiptDetailSelect;
}>;
type ReceivingPurchaseOrderRecord = Prisma.PurchaseOrderGetPayload<{
  select: typeof receivingPurchaseOrderSelect;
}>;
type ReceivingPurchaseOrderLine = ReceivingPurchaseOrderRecord["lines"][number];

interface PreparedReceiptLine {
  readonly input: GoodsReceiptLineData;
  readonly orderLine: ReceivingPurchaseOrderLine;
  readonly quantity: number;
  readonly unitCostMinor: number;
  readonly actualTotalMinor: number;
  readonly landedCostAllocatedMinor: number;
  readonly landedCostTotalMinor: number;
}

interface LockedPurchaseOrder {
  readonly id: string;
  readonly status: DatabasePurchaseOrderStatus;
  readonly version: number;
}

interface LockedStockBatch {
  readonly id: string;
  readonly quantityOnHand: number;
  readonly quantityReserved: number;
  readonly actualCostMinor: bigint | null;
  readonly landedCostMinor: bigint | null;
  readonly version: number;
}

interface LockedSequence {
  readonly id: string;
  readonly prefix: string;
  readonly nextValue: number;
  readonly padding: number;
  readonly periodKey: string | null;
}

interface ReceiptInitialStateRow {
  readonly serializedUnitId: string | null;
  readonly toState: SerializedStockState | null;
}

function purchasingResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Purchasing response violated its public contract");
  }
  return parsed.data;
}

/** Stable hash of the normalized business request; the retry key is separate. */
function goodsReceiptRequestHash(input: CreateGoodsReceiptData): string {
  const canonical = {
    purchaseOrderId: input.purchaseOrderId,
    supplierInvoiceReference: input.supplierInvoiceReference ?? null,
    invoiceDueOn: input.invoiceDueOn ?? null,
    notes: input.notes ?? null,
    landedCosts: input.landedCosts.map((cost) => ({
      kind: cost.kind,
      amountMinor: cost.amountMinor,
      reference: cost.reference ?? null,
      notes: cost.notes ?? null,
    })),
    lines: input.lines.map((line) =>
      line.trackingType === "quantity"
        ? {
            purchaseOrderLineId: line.purchaseOrderLineId,
            trackingType: line.trackingType,
            stockLocationId: line.stockLocationId,
            unitCostMinor: line.unitCostMinor,
            quantity: line.quantity,
          }
        : {
            purchaseOrderLineId: line.purchaseOrderLineId,
            trackingType: line.trackingType,
            stockLocationId: line.stockLocationId,
            unitCostMinor: line.unitCostMinor,
            units: line.units.map((unit) => ({
              imei1: unit.imei1,
              imei2: unit.imei2 ?? null,
              serialNumber: unit.serialNumber ?? null,
              initialState: unit.initialState,
            })),
          },
    ),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function notFound(label: string): DomainError {
  return new DomainError(ERROR_CODES.NOT_FOUND, `${label} was not found.`);
}

function validationError(field: string, message: string): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
  });
}

function optimisticLockError(label: string): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    `This ${label} was changed by someone else. Reload it and try again.`,
  );
}

function invalidPurchaseStatus(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): DomainError {
  return new DomainError(
    ERROR_CODES.PURCHASE_ORDER_INVALID_STATUS,
    `A purchase order cannot move from ${from} to ${to}.`,
  );
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDateColumn(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function safeMinor(value: bigint, label: string): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error(`${label} is outside the public safe-integer money range`);
  }
  return converted;
}

function moneyBigInt(value: number, label: string): bigint {
  return BigInt(toMinor(value, label));
}

function lineValue(unitCostMinor: number, quantity: number, label: string) {
  try {
    return multiplyByQuantity(toMinor(unitCostMinor, label), quantity);
  } catch (error) {
    if (error instanceof MoneyError) {
      throw validationError(label, error.message);
    }
    throw error;
  }
}

@Injectable()
export class PurchasingService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Suppliers
  // -------------------------------------------------------------------------

  async listSuppliers(
    organizationId: string,
    query: SupplierListQuery,
  ): Promise<SupplierPage> {
    const where: Prisma.SupplierWhereInput = {
      organizationId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { code: { contains: query.q, mode: "insensitive" } },
              { name: { contains: query.q, mode: "insensitive" } },
              { city: { contains: query.q, mode: "insensitive" } },
            ],
          }),
    };
    const [total, items] = await this.prisma.client.$transaction([
      this.prisma.client.supplier.count({ where }),
      this.prisma.client.supplier.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: supplierSummarySelect,
      }),
    ]);
    return purchasingResponse(SupplierPageSchema, {
      items: items.map((item) => this.toSupplierSummary(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async getSupplier(
    organizationId: string,
    id: string,
  ): Promise<SupplierDetail> {
    const supplier = await this.prisma.client.supplier.findFirst({
      where: { id, organizationId },
      select: supplierDetailSelect,
    });
    if (supplier === null) throw notFound("supplier");
    return this.toSupplierDetail(supplier);
  }

  async createSupplier(
    context: PurchasingActorContext,
    input: CreateSupplierData,
  ): Promise<SupplierDetail> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            organizationId: context.organizationId,
            code: input.code,
            name: input.name,
            paymentTermsDays: input.paymentTermsDays,
            leadTimeDays: input.leadTimeDays,
            addressLine: input.addressLine ?? null,
            city: input.city ?? null,
            notes: input.notes ?? null,
            contacts: {
              create: input.contacts.map((contact) => ({
                name: contact.name,
                role: contact.role ?? null,
                phone: contact.phone ?? null,
                email: contact.email ?? null,
                isPrimary: contact.isPrimary,
              })),
            },
          },
          select: supplierDetailSelect,
        });
        await this.writeAudit(tx, context, {
          action: "purchasing.supplier_created",
          entityType: "supplier",
          entityId: supplier.id,
          after: this.supplierSnapshot(supplier),
        });
        return this.toSupplierDetail(supplier);
      });
    } catch (error) {
      this.rethrowSupplierDuplicate(error);
    }
  }

  async updateSupplier(
    context: PurchasingActorContext,
    id: string,
    input: UpdateSupplierData,
  ): Promise<SupplierDetail> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const before = await this.loadSupplier(tx, context.organizationId, id);
        this.assertVersionMatched(
          await tx.supplier.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              version: input.version,
            },
            data: {
              code: input.code,
              name: input.name,
              paymentTermsDays: input.paymentTermsDays,
              leadTimeDays: input.leadTimeDays,
              addressLine: input.addressLine ?? null,
              city: input.city ?? null,
              notes: input.notes ?? null,
              version: { increment: 1 },
            },
          }),
          "supplier",
        );

        await tx.supplierContact.updateMany({
          where: {
            organizationId: context.organizationId,
            supplierId: id,
            isActive: true,
          },
          data: { isActive: false, isPrimary: false },
        });
        if (input.contacts.length > 0) {
          await tx.supplierContact.createMany({
            data: input.contacts.map((contact) => ({
              organizationId: context.organizationId,
              supplierId: id,
              name: contact.name,
              role: contact.role ?? null,
              phone: contact.phone ?? null,
              email: contact.email ?? null,
              isPrimary: contact.isPrimary,
            })),
          });
        }

        const after = await this.loadSupplier(tx, context.organizationId, id);
        await this.writeAudit(tx, context, {
          action: "purchasing.supplier_updated",
          entityType: "supplier",
          entityId: id,
          before: this.supplierSnapshot(before),
          after: this.supplierSnapshot(after),
        });
        return this.toSupplierDetail(after);
      });
    } catch (error) {
      this.rethrowSupplierDuplicate(error);
    }
  }

  async deactivateSupplier(
    context: PurchasingActorContext,
    id: string,
    input: PurchasingVersionData,
  ): Promise<SupplierDetail> {
    return this.setSupplierActive(context, id, input, false);
  }

  async activateSupplier(
    context: PurchasingActorContext,
    id: string,
    input: PurchasingVersionData,
  ): Promise<SupplierDetail> {
    return this.setSupplierActive(context, id, input, true);
  }

  private async setSupplierActive(
    context: PurchasingActorContext,
    id: string,
    input: PurchasingVersionData,
    isActive: boolean,
  ): Promise<SupplierDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.loadSupplier(tx, context.organizationId, id);
      this.assertVersionMatched(
        await tx.supplier.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { isActive, version: { increment: 1 } },
        }),
        "supplier",
      );
      const after = await this.loadSupplier(tx, context.organizationId, id);
      await this.writeAudit(tx, context, {
        action: isActive
          ? "purchasing.supplier_activated"
          : "purchasing.supplier_deactivated",
        entityType: "supplier",
        entityId: id,
        before: this.supplierSnapshot(before),
        after: this.supplierSnapshot(after),
      });
      return this.toSupplierDetail(after);
    });
  }

  // -------------------------------------------------------------------------
  // Purchase orders
  // -------------------------------------------------------------------------

  async listPurchaseOrders(
    context: PurchasingActorContext,
    query: PurchaseOrderListQuery,
  ): Promise<PurchaseOrderPage> {
    if (query.supplierId !== undefined) {
      const supplier = await this.prisma.client.supplier.findFirst({
        where: {
          id: query.supplierId,
          organizationId: context.organizationId,
        },
        select: { id: true },
      });
      if (supplier === null) throw notFound("supplier");
    }
    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.supplierId === undefined
        ? {}
        : { supplierId: query.supplierId }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            orderDate: {
              ...(query.from === undefined
                ? {}
                : { gte: parseDateColumn(query.from) }),
              ...(query.to === undefined
                ? {}
                : { lte: parseDateColumn(query.to) }),
            },
          }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { number: { contains: query.q, mode: "insensitive" } },
              {
                supplier: {
                  is: { name: { contains: query.q, mode: "insensitive" } },
                },
              },
              {
                supplier: {
                  is: { code: { contains: query.q, mode: "insensitive" } },
                },
              },
            ],
          }),
    };
    const [total, items] = await this.prisma.client.$transaction([
      this.prisma.client.purchaseOrder.count({ where }),
      this.prisma.client.purchaseOrder.findMany({
        where,
        orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: purchaseOrderSummarySelect,
      }),
    ]);
    return purchasingResponse(PurchaseOrderPageSchema, {
      items: items.map((item) => this.toPurchaseOrderSummary(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async getPurchaseOrder(
    context: PurchasingActorContext,
    id: string,
  ): Promise<PurchaseOrderDetail> {
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        branchId: context.branchId,
      },
      select: purchaseOrderDetailSelect,
    });
    if (order === null) throw notFound("purchase order");
    return this.toPurchaseOrderDetail(order);
  }

  async createPurchaseOrder(
    context: PurchasingActorContext,
    input: CreatePurchaseOrderData,
  ): Promise<PurchaseOrderDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const orderDate = toBusinessDate(new Date());
      if (
        input.expectedOn !== undefined &&
        input.expectedOn !== null &&
        input.expectedOn < orderDate
      ) {
        throw validationError(
          "expectedOn",
          "Expected delivery cannot be before the order date.",
        );
      }
      await this.resolveActiveSupplier(
        tx,
        context.organizationId,
        input.supplierId,
      );
      await this.resolveActiveVariants(
        tx,
        context.organizationId,
        input.lines.map((line) => line.productVariantId),
      );
      this.validateOrderTotals(input.lines);
      const number = await this.allocateNumber(
        tx,
        context,
        SEQUENCE_KEYS.PURCHASE_ORDER,
        "PO-",
      );
      const created = await tx.purchaseOrder.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          supplierId: input.supplierId,
          createdByUserId: context.actorUserId,
          number,
          orderDate: parseDateColumn(orderDate),
          expectedOn:
            input.expectedOn === undefined || input.expectedOn === null
              ? null
              : parseDateColumn(input.expectedOn),
          notes: input.notes ?? null,
          lines: {
            create: input.lines.map((line, index) => ({
              lineNumber: index + 1,
              productVariantId: line.productVariantId,
              quantityOrdered: line.quantity,
              unitCostMinor: moneyBigInt(line.unitCostMinor, "unit cost"),
              notes: line.notes ?? null,
            })),
          },
        },
        select: { id: true },
      });
      const order = await this.loadPurchaseOrder(tx, context, created.id);
      await this.writeAudit(tx, context, {
        action: "purchasing.purchase_order_created",
        entityType: "purchase_order",
        entityId: created.id,
        after: this.purchaseOrderSnapshot(order),
      });
      return this.toPurchaseOrderDetail(order);
    });
  }

  async updatePurchaseOrder(
    context: PurchasingActorContext,
    id: string,
    input: UpdatePurchaseOrderData,
  ): Promise<PurchaseOrderDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.loadPurchaseOrder(tx, context, id);
      if (before.status !== "draft") {
        throw invalidPurchaseStatus(before.status, "draft");
      }
      if (
        input.expectedOn !== undefined &&
        input.expectedOn !== null &&
        input.expectedOn < dateOnly(before.orderDate)
      ) {
        throw validationError(
          "expectedOn",
          "Expected delivery cannot be before the order date.",
        );
      }
      await this.resolveActiveSupplier(
        tx,
        context.organizationId,
        input.supplierId,
      );
      await this.resolveActiveVariants(
        tx,
        context.organizationId,
        input.lines.map((line) => line.productVariantId),
      );
      this.validateOrderTotals(input.lines);
      this.assertVersionMatched(
        await tx.purchaseOrder.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            branchId: context.branchId,
            status: "draft",
            version: input.version,
          },
          data: {
            supplierId: input.supplierId,
            expectedOn:
              input.expectedOn === undefined || input.expectedOn === null
                ? null
                : parseDateColumn(input.expectedOn),
            notes: input.notes ?? null,
            version: { increment: 1 },
          },
        }),
        "purchase order",
      );

      // Draft lines are replace semantics. Migration 0008 permits this only
      // while the locked parent remains draft; posted lines remain immutable.
      await tx.purchaseOrderLine.deleteMany({
        where: { organizationId: context.organizationId, purchaseOrderId: id },
      });
      await tx.purchaseOrderLine.createMany({
        data: input.lines.map((line, index) => ({
          organizationId: context.organizationId,
          purchaseOrderId: id,
          lineNumber: index + 1,
          productVariantId: line.productVariantId,
          quantityOrdered: line.quantity,
          unitCostMinor: moneyBigInt(line.unitCostMinor, "unit cost"),
          notes: line.notes ?? null,
        })),
      });

      const after = await this.loadPurchaseOrder(tx, context, id);
      await this.writeAudit(tx, context, {
        action: "purchasing.purchase_order_updated",
        entityType: "purchase_order",
        entityId: id,
        before: this.purchaseOrderSnapshot(before),
        after: this.purchaseOrderSnapshot(after),
      });
      return this.toPurchaseOrderDetail(after);
    });
  }

  async approvePurchaseOrder(
    context: PurchasingActorContext,
    id: string,
    input: PurchaseOrderTransitionData,
  ): Promise<PurchaseOrderDetail> {
    return this.transitionPurchaseOrder(context, id, input, "approved");
  }

  async orderPurchaseOrder(
    context: PurchasingActorContext,
    id: string,
    input: PurchaseOrderTransitionData,
  ): Promise<PurchaseOrderDetail> {
    return this.transitionPurchaseOrder(context, id, input, "ordered");
  }

  async closePurchaseOrder(
    context: PurchasingActorContext,
    id: string,
    input: PurchaseOrderTransitionData,
  ): Promise<PurchaseOrderDetail> {
    return this.transitionPurchaseOrder(context, id, input, "closed");
  }

  async cancelPurchaseOrder(
    context: PurchasingActorContext,
    id: string,
    input: CancelPurchaseOrderData,
  ): Promise<PurchaseOrderDetail> {
    return this.transitionPurchaseOrder(context, id, input, "cancelled");
  }

  private async transitionPurchaseOrder(
    context: PurchasingActorContext,
    id: string,
    input: PurchaseOrderTransitionData | CancelPurchaseOrderData,
    target: "approved" | "ordered" | "closed" | "cancelled",
  ): Promise<PurchaseOrderDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.loadPurchaseOrder(tx, context, id);
      if (!isPurchaseOrderTransitionAllowed(before.status, target)) {
        throw invalidPurchaseStatus(before.status, target);
      }
      const timestamp = new Date();
      const actorData =
        target === "approved"
          ? { approvedAt: timestamp, approvedByUserId: context.actorUserId }
          : target === "ordered"
            ? { orderedAt: timestamp, orderedByUserId: context.actorUserId }
            : target === "closed"
              ? { closedAt: timestamp, closedByUserId: context.actorUserId }
              : {
                  cancelledAt: timestamp,
                  cancelledByUserId: context.actorUserId,
                  cancellationReason: input.reason ?? null,
                };
      this.assertVersionMatched(
        await tx.purchaseOrder.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            branchId: context.branchId,
            status: before.status,
            version: input.version,
          },
          data: {
            status: target,
            ...actorData,
            version: { increment: 1 },
          },
        }),
        "purchase order",
      );
      const after = await this.loadPurchaseOrder(tx, context, id);
      await this.writeAudit(tx, context, {
        action: `purchasing.purchase_order_${target}`,
        entityType: "purchase_order",
        entityId: id,
        before: this.purchaseOrderSnapshot(before),
        after: this.purchaseOrderSnapshot(after),
        reason: input.reason ?? null,
      });
      return this.toPurchaseOrderDetail(after);
    });
  }

  // -------------------------------------------------------------------------
  // Goods receiving
  // -------------------------------------------------------------------------

  async listGoodsReceipts(
    context: PurchasingActorContext,
    query: GoodsReceiptListQuery,
  ): Promise<GoodsReceiptPage> {
    const [supplier, purchaseOrder] = await Promise.all([
      query.supplierId === undefined
        ? Promise.resolve({ id: "not-filtered" })
        : this.prisma.client.supplier.findFirst({
            where: {
              id: query.supplierId,
              organizationId: context.organizationId,
            },
            select: { id: true },
          }),
      query.purchaseOrderId === undefined
        ? Promise.resolve({ id: "not-filtered" })
        : this.prisma.client.purchaseOrder.findFirst({
            where: {
              id: query.purchaseOrderId,
              organizationId: context.organizationId,
              branchId: context.branchId,
            },
            select: { id: true },
          }),
    ]);
    if (supplier === null) throw notFound("supplier");
    if (purchaseOrder === null) throw notFound("purchase order");
    const where: Prisma.GoodsReceiptWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...this.goodsReceiptLocationScope(context),
      ...(query.purchaseOrderId === undefined
        ? {}
        : { purchaseOrderId: query.purchaseOrderId }),
      ...(query.supplierId === undefined
        ? {}
        : { supplierId: query.supplierId }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            receivedAt: {
              ...(query.from === undefined
                ? {}
                : {
                    gte: businessDayStartUtc(
                      parseBusinessDateString(query.from),
                    ),
                  }),
              ...(query.to === undefined
                ? {}
                : {
                    lt: businessDayEndUtc(parseBusinessDateString(query.to)),
                  }),
            },
          }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { number: { contains: query.q, mode: "insensitive" } },
              {
                supplierInvoiceReference: {
                  contains: query.q,
                  mode: "insensitive",
                },
              },
              {
                purchaseOrder: {
                  is: { number: { contains: query.q, mode: "insensitive" } },
                },
              },
              {
                supplier: {
                  is: { name: { contains: query.q, mode: "insensitive" } },
                },
              },
              {
                supplier: {
                  is: { code: { contains: query.q, mode: "insensitive" } },
                },
              },
            ],
          }),
    };
    const [total, items] = await this.prisma.client.$transaction([
      this.prisma.client.goodsReceipt.count({ where }),
      this.prisma.client.goodsReceipt.findMany({
        where,
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: goodsReceiptSummarySelect,
      }),
    ]);
    return purchasingResponse(GoodsReceiptPageSchema, {
      items: items.map((item) => this.toGoodsReceiptSummary(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async getGoodsReceipt(
    context: PurchasingActorContext,
    id: string,
  ): Promise<GoodsReceiptDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const loaded = await this.loadGoodsReceipt(tx, context, id);
      return this.toGoodsReceiptDetail(loaded.receipt, loaded.initialStates);
    });
  }

  async createGoodsReceipt(
    context: PurchasingActorContext,
    input: CreateGoodsReceiptData,
    idempotencyKey: string,
  ): Promise<GoodsReceiptDetail> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        // Contract parsing only normalizes and length-checks. The business
        // transaction owns the actual Luhn/repeated-digit decision so no invalid
        // identity can race past validation into stock.
        this.validateReceiptImeis(input);

        const requestHash = goodsReceiptRequestHash(input);
        await this.lockGoodsReceiptIdempotency(tx, context, idempotencyKey);
        const replay = await tx.goodsReceipt.findFirst({
          where: {
            organizationId: context.organizationId,
            branchId: context.branchId,
            idempotencyKey,
          },
          select: { id: true, requestHash: true },
        });
        if (replay !== null) {
          if (replay.requestHash !== requestHash) {
            throw new DomainError(
              ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
              "This idempotency key was already used for a different goods receipt request.",
            );
          }
          const loaded = await this.loadGoodsReceipt(tx, context, replay.id);
          return this.toGoodsReceiptDetail(
            loaded.receipt,
            loaded.initialStates,
          );
        }

        const locked = await this.lockPurchaseOrder(
          tx,
          context,
          input.purchaseOrderId,
        );
        if (
          !RECEIVABLE_PURCHASE_ORDER_STATUSES.includes(
            locked.status as (typeof RECEIVABLE_PURCHASE_ORDER_STATUSES)[number],
          )
        ) {
          if (locked.status === "draft") {
            throw new DomainError(
              ERROR_CODES.PURCHASE_ORDER_NOT_APPROVED,
              "Approve this purchase order before receiving stock.",
            );
          }
          throw new DomainError(
            ERROR_CODES.PURCHASE_ORDER_INVALID_STATUS,
            `A ${locked.status} purchase order cannot receive stock.`,
          );
        }

        await this.lockPurchaseOrderLines(
          tx,
          context.organizationId,
          input.purchaseOrderId,
        );
        const order = await tx.purchaseOrder.findFirst({
          where: {
            id: input.purchaseOrderId,
            organizationId: context.organizationId,
            branchId: context.branchId,
          },
          select: receivingPurchaseOrderSelect,
        });
        if (order === null) throw notFound("purchase order");
        if (
          order.version !== locked.version ||
          order.status !== locked.status
        ) {
          throw optimisticLockError("purchase order");
        }

        await this.resolveReceiptLocations(tx, context, input.lines);
        await this.assertIdentifiersAvailable(tx, context, input);
        const prepared = this.prepareReceiptLines(order, input.lines);
        const actualTotalMinor = sum(
          prepared.map((line) =>
            toMinor(line.actualTotalMinor, "line actual total"),
          ),
        );
        const landedCostExtraMinor = sum(
          input.landedCosts.map((cost) =>
            toMinor(cost.amountMinor, "landed cost"),
          ),
        );
        if (actualTotalMinor === 0 && landedCostExtraMinor > 0) {
          throw validationError(
            "landedCosts",
            "Landed costs cannot be allocated when every received line has zero value.",
          );
        }
        const allocations =
          landedCostExtraMinor === 0
            ? prepared.map(() => toMinor(0))
            : allocateByIntegerWeights(
                landedCostExtraMinor,
                prepared.map((line) => line.actualTotalMinor),
              );
        const allocatedLines: PreparedReceiptLine[] = prepared.map(
          (line, index) => {
            const allocation = allocations[index];
            if (allocation === undefined) {
              throw new Error("Landed-cost allocation lost a receipt line");
            }
            return {
              ...line,
              landedCostAllocatedMinor: allocation,
              landedCostTotalMinor: sum([
                toMinor(line.actualTotalMinor),
                allocation,
              ]),
            };
          },
        );
        const landedCostTotalMinor = sum(
          allocatedLines.map((line) =>
            toMinor(line.landedCostTotalMinor, "line landed total"),
          ),
        );

        const receivedAt = new Date();
        const dueOn =
          input.invoiceDueOn === undefined || input.invoiceDueOn === null
            ? parseDateColumn(
                addBusinessDays(
                  toBusinessDate(receivedAt),
                  order.supplier.paymentTermsDays,
                ),
              )
            : parseDateColumn(input.invoiceDueOn);
        if (dateOnly(dueOn) < toBusinessDate(receivedAt)) {
          throw validationError(
            "invoiceDueOn",
            "Invoice due date cannot be before the receipt date.",
          );
        }
        const number = await this.allocateNumber(
          tx,
          context,
          SEQUENCE_KEYS.GOODS_RECEIPT,
          "GRN-",
        );
        const receipt = await tx.goodsReceipt.create({
          data: {
            organizationId: context.organizationId,
            branchId: context.branchId,
            purchaseOrderId: order.id,
            supplierId: order.supplierId,
            receivedByUserId: context.actorUserId,
            number,
            supplierInvoiceReference: input.supplierInvoiceReference ?? null,
            receivedAt,
            invoiceDueOn: dueOn,
            notes: input.notes ?? null,
            actualCostTotalMinor: BigInt(actualTotalMinor),
            landedCostTotalMinor: BigInt(landedCostTotalMinor),
            // Landed components capitalize inventory but are not automatically
            // owed to the product supplier. The payable follows invoice cost.
            payableTotalMinor: BigInt(actualTotalMinor),
            idempotencyKey,
            requestHash,
          },
          select: { id: true },
        });

        if (input.landedCosts.length > 0) {
          await tx.goodsReceiptLandedCost.createMany({
            data: input.landedCosts.map((cost) => ({
              organizationId: context.organizationId,
              branchId: context.branchId,
              goodsReceiptId: receipt.id,
              kind: cost.kind,
              amountMinor: BigInt(cost.amountMinor),
              reference: cost.reference ?? null,
              notes: cost.notes ?? null,
            })),
          });
        }

        // A canonical lock order prevents two receipts for different POs from
        // deadlocking when they touch the same quantity batches in reverse
        // request order.
        const postingLines = [...allocatedLines].sort((left, right) =>
          `${left.orderLine.productVariantId}:${left.input.stockLocationId}`.localeCompare(
            `${right.orderLine.productVariantId}:${right.input.stockLocationId}`,
          ),
        );
        for (const line of postingLines) {
          await this.postReceiptLine(
            tx,
            context,
            receipt.id,
            number,
            order.id,
            receivedAt,
            line,
          );
        }

        for (const source of order.lines) {
          const increment = allocatedLines
            .filter((line) => line.orderLine.id === source.id)
            .reduce((total, line) => total + line.quantity, 0);
          if (increment === 0) continue;
          this.assertVersionMatched(
            await tx.purchaseOrderLine.updateMany({
              where: {
                id: source.id,
                organizationId: context.organizationId,
                purchaseOrderId: order.id,
                quantityReceived: source.quantityReceived,
              },
              data: { quantityReceived: { increment } },
            }),
            "purchase order line",
          );
        }

        const incomingByLine = new Map<string, number>();
        for (const line of allocatedLines) {
          incomingByLine.set(
            line.orderLine.id,
            (incomingByLine.get(line.orderLine.id) ?? 0) + line.quantity,
          );
        }
        const fullyReceived = order.lines.every(
          (line) =>
            line.quantityReceived + (incomingByLine.get(line.id) ?? 0) ===
            line.quantityOrdered,
        );
        const targetStatus: PurchaseOrderStatus = fullyReceived
          ? "received"
          : "partially_received";
        if (
          targetStatus !== order.status &&
          !isPurchaseOrderTransitionAllowed(order.status, targetStatus)
        ) {
          throw invalidPurchaseStatus(order.status, targetStatus);
        }
        this.assertVersionMatched(
          await tx.purchaseOrder.updateMany({
            where: {
              id: order.id,
              organizationId: context.organizationId,
              branchId: context.branchId,
              status: locked.status,
              version: locked.version,
            },
            data: { status: targetStatus, version: { increment: 1 } },
          }),
          "purchase order",
        );

        await tx.payable.create({
          data: {
            organizationId: context.organizationId,
            branchId: context.branchId,
            supplierId: order.supplierId,
            goodsReceiptId: receipt.id,
            dueOn,
            amountMinor: BigInt(actualTotalMinor),
            outstandingMinor: BigInt(actualTotalMinor),
          },
        });

        const loaded = await this.loadGoodsReceipt(tx, context, receipt.id);
        const response = this.toGoodsReceiptDetail(
          loaded.receipt,
          loaded.initialStates,
        );
        await this.writeAudit(tx, context, {
          action: "purchasing.goods_received",
          entityType: "goods_receipt",
          entityId: receipt.id,
          after: this.goodsReceiptSnapshot(response),
        });
        return response;
      });
    } catch (error) {
      this.rethrowReceivingFailure(error, input);
    }
  }

  private async lockGoodsReceiptIdempotency(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    idempotencyKey: string,
  ): Promise<void> {
    const scope = `goods-receipt:${context.organizationId}:${context.branchId}`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${scope}), hashtext(${idempotencyKey}))
    `;
  }

  private async postReceiptLine(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    goodsReceiptId: string,
    receiptNumber: string,
    purchaseOrderId: string,
    receivedAt: Date,
    line: PreparedReceiptLine,
  ): Promise<void> {
    if (line.input.trackingType === "quantity") {
      const batch = await this.ensureAndLockStockBatch(
        tx,
        context,
        line.orderLine.productVariantId,
        line.input.stockLocationId,
      );
      if (
        batch.quantityOnHand > 0 &&
        (batch.actualCostMinor === null || batch.landedCostMinor === null)
      ) {
        throw validationError(
          "lines",
          "Existing quantity stock has no recorded cost and cannot be averaged automatically.",
        );
      }
      const existingActual =
        batch.actualCostMinor === null
          ? null
          : toMinor(safeMinor(batch.actualCostMinor, "batch actual unit cost"));
      const existingLanded =
        batch.landedCostMinor === null
          ? null
          : toMinor(safeMinor(batch.landedCostMinor, "batch landed unit cost"));
      const newActual = movingWeightedAverageUnitCost(
        existingActual,
        batch.quantityOnHand,
        toMinor(line.actualTotalMinor),
        line.quantity,
      );
      const newLanded = movingWeightedAverageUnitCost(
        existingLanded,
        batch.quantityOnHand,
        toMinor(line.landedCostTotalMinor),
        line.quantity,
      );
      this.assertVersionMatched(
        await tx.stockBatch.updateMany({
          where: {
            id: batch.id,
            organizationId: context.organizationId,
            branchId: context.branchId,
            quantityOnHand: batch.quantityOnHand,
            quantityReserved: batch.quantityReserved,
            version: batch.version,
          },
          data: {
            quantityOnHand: { increment: line.quantity },
            actualCostMinor: BigInt(newActual),
            landedCostMinor: BigInt(newLanded),
            receivedAt,
            version: { increment: 1 },
          },
        }),
        "stock batch",
      );
      const receiptLine = await tx.goodsReceiptLine.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          goodsReceiptId,
          purchaseOrderId,
          purchaseOrderLineId: line.orderLine.id,
          productVariantId: line.orderLine.productVariantId,
          stockLocationId: line.input.stockLocationId,
          trackingType: "quantity",
          quantityReceived: line.quantity,
          unitCostMinor: BigInt(line.unitCostMinor),
          actualCostTotalMinor: BigInt(line.actualTotalMinor),
          landedCostAllocatedMinor: BigInt(line.landedCostAllocatedMinor),
          landedCostTotalMinor: BigInt(line.landedCostTotalMinor),
          stockBatchId: batch.id,
        },
        select: { id: true },
      });
      await tx.inventoryMovement.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          productVariantId: line.orderLine.productVariantId,
          stockBatchId: batch.id,
          stockLocationId: line.input.stockLocationId,
          movementType: "purchase_receive",
          quantity: line.quantity,
          referenceType: "goods_receipt",
          referenceId: goodsReceiptId,
          reason: `Received on ${receiptNumber} line ${receiptLine.id}`,
          actorUserId: context.actorUserId,
          occurredAt: receivedAt,
        },
      });
      return;
    }

    const receiptLine = await tx.goodsReceiptLine.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        goodsReceiptId,
        purchaseOrderId,
        purchaseOrderLineId: line.orderLine.id,
        productVariantId: line.orderLine.productVariantId,
        stockLocationId: line.input.stockLocationId,
        trackingType: "serialized",
        quantityReceived: line.quantity,
        unitCostMinor: BigInt(line.unitCostMinor),
        actualCostTotalMinor: BigInt(line.actualTotalMinor),
        landedCostAllocatedMinor: BigInt(line.landedCostAllocatedMinor),
        landedCostTotalMinor: BigInt(line.landedCostTotalMinor),
        stockBatchId: null,
      },
      select: { id: true },
    });
    const perUnitLanded = allocateByIntegerWeights(
      toMinor(line.landedCostAllocatedMinor),
      line.input.units.map(() => 1),
    );
    for (const [index, unit] of line.input.units.entries()) {
      const allocated = perUnitLanded[index];
      if (allocated === undefined) {
        throw new Error("Landed-cost allocation lost a serialized unit");
      }
      const landedUnitCost = sum([toMinor(line.unitCostMinor), allocated]);
      const identifiers = [
        {
          identifierType: "imei" as const,
          position: 1 as const,
          normalizedValue: unit.imei1,
        },
        ...(unit.imei2 === undefined || unit.imei2 === null
          ? []
          : [
              {
                identifierType: "imei" as const,
                position: 2 as const,
                normalizedValue: unit.imei2,
              },
            ]),
        ...(unit.serialNumber === undefined || unit.serialNumber === null
          ? []
          : [
              {
                identifierType: "serial" as const,
                position: 1 as const,
                normalizedValue: unit.serialNumber,
              },
            ]),
      ];
      const created = await tx.serializedUnit.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          productVariantId: line.orderLine.productVariantId,
          stockLocationId: line.input.stockLocationId,
          purchaseOrderLineId: line.orderLine.id,
          goodsReceiptLineId: receiptLine.id,
          state: unit.initialState,
          condition: line.orderLine.productVariant.condition,
          ptaStatus: line.orderLine.productVariant.ptaStatus,
          receivedAt,
          actualCostMinor: BigInt(line.unitCostMinor),
          landedCostMinor: BigInt(landedUnitCost),
        },
        select: { id: true },
      });
      for (const identifier of identifiers) {
        await this.createDeviceIdentifier(
          tx,
          context.organizationId,
          created.id,
          identifier,
        );
      }
      await tx.inventoryMovement.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          productVariantId: line.orderLine.productVariantId,
          serializedUnitId: created.id,
          stockLocationId: line.input.stockLocationId,
          movementType: "purchase_receive",
          quantity: 1,
          fromState: null,
          toState: unit.initialState,
          referenceType: "goods_receipt",
          referenceId: goodsReceiptId,
          reason: `Received on ${receiptNumber}`,
          actorUserId: context.actorUserId,
          occurredAt: receivedAt,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Receiving validation and locking
  // -------------------------------------------------------------------------

  private validateReceiptImeis(input: CreateGoodsReceiptData): void {
    input.lines.forEach((line, lineIndex) => {
      if (line.trackingType !== "serialized") return;
      line.units.forEach((unit, unitIndex) => {
        const values = [
          ["imei1", unit.imei1],
          ["imei2", unit.imei2],
        ] as const;
        for (const [field, value] of values) {
          if (value === undefined || value === null) continue;
          const result = validateImei(value, {
            requireChecksum: true,
            allowImeiSv: true,
          });
          if (!result.valid || result.normalized === null) {
            const path = `lines.${lineIndex}.units.${unitIndex}.${field}`;
            const message = result.message ?? "IMEI is invalid.";
            throw new DomainError(ERROR_CODES.IMEI_INVALID, message, {
              details: { [path]: [message] },
            });
          }
        }
      });
    });
  }

  private prepareReceiptLines(
    order: ReceivingPurchaseOrderRecord,
    inputs: readonly GoodsReceiptLineData[],
  ): PreparedReceiptLine[] {
    const sourceById = new Map(order.lines.map((line) => [line.id, line]));
    const incomingByLine = new Map<string, number>();
    const prepared = inputs.map((input, index): PreparedReceiptLine => {
      const source = sourceById.get(input.purchaseOrderLineId);
      if (source === undefined) throw notFound("purchase order line");
      if (source.productVariant.trackingType !== input.trackingType) {
        throw validationError(
          `lines.${index}.trackingType`,
          `This product is ${source.productVariant.trackingType}-tracked.`,
        );
      }
      const quantity =
        input.trackingType === "serialized"
          ? input.units.length
          : input.quantity;
      const running = (incomingByLine.get(source.id) ?? 0) + quantity;
      incomingByLine.set(source.id, running);
      if (source.quantityReceived + running > source.quantityOrdered) {
        throw new DomainError(
          ERROR_CODES.PURCHASE_RECEIVE_EXCEEDS_ORDERED,
          "The received quantity exceeds the remaining purchase-order quantity.",
          {
            details: {
              [`lines.${index}`]: [
                `Only ${source.quantityOrdered - source.quantityReceived} units remain on this order line.`,
              ],
            },
          },
        );
      }
      const approvedUnitCostMinor = safeMinor(
        source.unitCostMinor,
        "approved purchase unit cost",
      );
      if (input.unitCostMinor !== approvedUnitCostMinor) {
        throw validationError(
          `lines.${index}.unitCostMinor`,
          "Received unit cost must match the manager-approved purchase-order cost. Update and reapprove the PO before receiving an invoice variance.",
        );
      }
      return {
        input,
        orderLine: source,
        quantity,
        unitCostMinor: approvedUnitCostMinor,
        actualTotalMinor: lineValue(
          approvedUnitCostMinor,
          quantity,
          `lines.${index}.unitCostMinor`,
        ),
        landedCostAllocatedMinor: 0,
        landedCostTotalMinor: 0,
      };
    });
    return prepared;
  }

  private async resolveReceiptLocations(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    lines: readonly GoodsReceiptLineData[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((line) => line.stockLocationId))];
    if (context.allowedLocationIds !== null) {
      const allowed = new Set(context.allowedLocationIds);
      if (ids.some((id) => !allowed.has(id))) {
        throw notFound("stock location");
      }
    }
    const locations = await tx.stockLocation.findMany({
      where: {
        id: { in: ids },
        organizationId: context.organizationId,
        branchId: context.branchId,
        isActive: true,
      },
      select: { id: true },
    });
    if (locations.length !== ids.length) throw notFound("stock location");
  }

  private async assertIdentifiersAvailable(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    input: CreateGoodsReceiptData,
  ): Promise<void> {
    const requested = new Map<string, "imei" | "serial">();
    for (const line of input.lines) {
      if (line.trackingType !== "serialized") continue;
      for (const unit of line.units) {
        requested.set(unit.imei1, "imei");
        if (unit.imei2 !== undefined && unit.imei2 !== null) {
          requested.set(unit.imei2, "imei");
        }
        if (unit.serialNumber !== undefined && unit.serialNumber !== null) {
          const serial = normalizeSerial(unit.serialNumber);
          if (serial !== null) requested.set(serial, "serial");
        }
      }
    }
    if (requested.size === 0) return;
    const existing = await tx.deviceIdentifier.findMany({
      where: {
        organizationId: context.organizationId,
        normalizedValue: { in: [...requested.keys()] },
      },
      select: { normalizedValue: true },
    });
    const collision = existing[0];
    if (collision === undefined) return;
    const type = requested.get(collision.normalizedValue) ?? "imei";
    throw new DomainError(
      type === "serial"
        ? ERROR_CODES.SERIAL_DUPLICATE
        : ERROR_CODES.IMEI_DUPLICATE,
      type === "serial"
        ? "This serial number already exists in inventory."
        : "This IMEI already exists in inventory.",
      {
        details: {
          identifiers: ["Every received identifier must be unique."],
        },
      },
    );
  }

  private async createDeviceIdentifier(
    tx: Prisma.TransactionClient,
    organizationId: string,
    serializedUnitId: string,
    identifier: {
      readonly identifierType: "imei" | "serial";
      readonly position: 1 | 2;
      readonly normalizedValue: string;
    },
  ): Promise<void> {
    try {
      await tx.deviceIdentifier.create({
        data: {
          organizationId,
          serializedUnitId,
          identifierType: identifier.identifierType,
          position: identifier.position,
          normalizedValue: identifier.normalizedValue,
        },
      });
    } catch (error) {
      if (!this.isPrismaError(error, "P2002")) throw error;
      const isSerial = identifier.identifierType === "serial";
      throw new DomainError(
        isSerial ? ERROR_CODES.SERIAL_DUPLICATE : ERROR_CODES.IMEI_DUPLICATE,
        isSerial
          ? "This serial number already exists in inventory."
          : "This IMEI already exists in inventory.",
        { cause: error },
      );
    }
  }

  private async lockPurchaseOrder(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    id: string,
  ): Promise<LockedPurchaseOrder> {
    const rows = await tx.$queryRaw<readonly LockedPurchaseOrder[]>`
      SELECT id, status, version
        FROM purchase_orders
       WHERE id = ${id}::uuid
         AND organization_id = ${context.organizationId}::uuid
         AND branch_id = ${context.branchId}::uuid
       FOR UPDATE`;
    const order = rows[0];
    if (order === undefined) throw notFound("purchase order");
    return order;
  }

  private async lockPurchaseOrderLines(
    tx: Prisma.TransactionClient,
    organizationId: string,
    purchaseOrderId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<readonly { readonly id: string }[]>`
      SELECT id
        FROM purchase_order_lines
       WHERE organization_id = ${organizationId}::uuid
         AND purchase_order_id = ${purchaseOrderId}::uuid
       ORDER BY id
       FOR UPDATE`;
    if (rows.length === 0) {
      throw new DomainError(
        ERROR_CODES.PURCHASE_ORDER_INVALID_STATUS,
        "A purchase order with no lines cannot receive stock.",
      );
    }
  }

  private async ensureAndLockStockBatch(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    productVariantId: string,
    stockLocationId: string,
  ): Promise<LockedStockBatch> {
    // ON CONFLICT makes first receipt creation safe across different POs that
    // arrive at the same product/location concurrently. The following SELECT
    // then takes the authoritative row lock before averaging any cost.
    const candidateId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO stock_batches (
        id,
        organization_id,
        branch_id,
        product_variant_id,
        stock_location_id,
        updated_at
      ) VALUES (
        ${candidateId}::uuid,
        ${context.organizationId}::uuid,
        ${context.branchId}::uuid,
        ${productVariantId}::uuid,
        ${stockLocationId}::uuid,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (organization_id, product_variant_id, stock_location_id)
      DO NOTHING`;
    const rows = await tx.$queryRaw<readonly LockedStockBatch[]>`
      SELECT id,
             quantity_on_hand AS "quantityOnHand",
             quantity_reserved AS "quantityReserved",
             actual_cost_minor AS "actualCostMinor",
             landed_cost_minor AS "landedCostMinor",
             version
        FROM stock_batches
       WHERE organization_id = ${context.organizationId}::uuid
         AND branch_id = ${context.branchId}::uuid
         AND product_variant_id = ${productVariantId}::uuid
         AND stock_location_id = ${stockLocationId}::uuid
       FOR UPDATE`;
    const batch = rows[0];
    if (batch === undefined) throw notFound("stock batch");
    return batch;
  }

  // -------------------------------------------------------------------------
  // Shared persistence helpers
  // -------------------------------------------------------------------------

  private async resolveActiveSupplier(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<void> {
    const supplier = await tx.supplier.findFirst({
      where: { id, organizationId },
      select: { isActive: true },
    });
    if (supplier === null) throw notFound("supplier");
    if (!supplier.isActive) {
      throw validationError("supplierId", "Select an active supplier.");
    }
  }

  private async resolveActiveVariants(
    tx: Prisma.TransactionClient,
    organizationId: string,
    ids: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(ids)];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: unique }, organizationId },
      select: { id: true, isActive: true },
    });
    if (variants.length !== unique.length) throw notFound("product variant");
    if (variants.some((variant) => !variant.isActive)) {
      throw validationError(
        "lines",
        "Every purchase line must use an active product variant.",
      );
    }
  }

  private validateOrderTotals(
    lines: readonly {
      readonly quantity: number;
      readonly unitCostMinor: number;
    }[],
  ): void {
    try {
      sum(
        lines.map((line, index) =>
          lineValue(
            line.unitCostMinor,
            line.quantity,
            `lines.${index}.unitCostMinor`,
          ),
        ),
      );
    } catch (error) {
      if (error instanceof MoneyError) {
        throw validationError("lines", error.message);
      }
      throw error;
    }
  }

  private async allocateNumber(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    key: string,
    defaultPrefix: string,
  ): Promise<string> {
    const lockKey = `${context.organizationId}:${context.branchId}:${key}`;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const candidateId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO number_sequences (
        id,
        organization_id,
        branch_id,
        key,
        prefix,
        next_value,
        padding,
        period_key,
        updated_at
      ) VALUES (
        ${candidateId}::uuid,
        ${context.organizationId}::uuid,
        ${context.branchId}::uuid,
        ${key},
        ${defaultPrefix},
        1,
        6,
        NULL,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT DO NOTHING`;
    const rows = await tx.$queryRaw<readonly LockedSequence[]>`
      SELECT id,
             prefix,
             next_value AS "nextValue",
             padding,
             period_key AS "periodKey"
        FROM number_sequences
       WHERE organization_id = ${context.organizationId}::uuid
         AND branch_id = ${context.branchId}::uuid
         AND key = ${key}
         AND period_key IS NULL
       FOR UPDATE`;
    const sequence = rows[0];
    if (sequence === undefined) {
      throw new Error(`Number sequence ${key} could not be allocated`);
    }
    this.assertVersionMatched(
      await tx.numberSequence.updateMany({
        where: {
          id: sequence.id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          key,
          periodKey: null,
          nextValue: sequence.nextValue,
        },
        data: { nextValue: { increment: 1 } },
      }),
      "number sequence",
    );
    const period = sequence.periodKey === null ? "" : `${sequence.periodKey}-`;
    return `${sequence.prefix}${period}${String(sequence.nextValue).padStart(
      sequence.padding,
      "0",
    )}`;
  }

  private async loadSupplier(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<SupplierDetailRecord> {
    const supplier = await tx.supplier.findFirst({
      where: { id, organizationId },
      select: supplierDetailSelect,
    });
    if (supplier === null) throw notFound("supplier");
    return supplier;
  }

  private async loadPurchaseOrder(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    id: string,
  ): Promise<PurchaseOrderDetailRecord> {
    const order = await tx.purchaseOrder.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        branchId: context.branchId,
      },
      select: purchaseOrderDetailSelect,
    });
    if (order === null) throw notFound("purchase order");
    return order;
  }

  private async loadGoodsReceipt(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    id: string,
  ): Promise<{
    readonly receipt: GoodsReceiptDetailRecord;
    readonly initialStates: ReadonlyMap<string, SerializedStockState>;
  }> {
    const receipt = await tx.goodsReceipt.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        branchId: context.branchId,
        ...this.goodsReceiptLocationScope(context),
      },
      select: goodsReceiptDetailSelect,
    });
    if (receipt === null) throw notFound("goods receipt");
    const movements = await tx.inventoryMovement.findMany({
      where: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        movementType: "purchase_receive",
        referenceType: "goods_receipt",
        referenceId: id,
        serializedUnitId: { not: null },
      },
      select: { serializedUnitId: true, toState: true },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    const initialStates = new Map<string, SerializedStockState>();
    for (const movement of movements as readonly ReceiptInitialStateRow[]) {
      if (movement.serializedUnitId !== null && movement.toState !== null) {
        initialStates.set(movement.serializedUnitId, movement.toState);
      }
    }
    return { receipt, initialStates };
  }

  private goodsReceiptLocationScope(
    context: PurchasingActorContext,
  ): Prisma.GoodsReceiptWhereInput {
    if (context.allowedLocationIds === null) return {};
    const allowed = { in: [...context.allowedLocationIds] };
    return {
      lines: {
        // Detail responses reconcile whole receipts. Never expose a mixed-
        // location receipt unless every line falls inside the caller's scope.
        some: { stockLocationId: allowed },
        every: { stockLocationId: allowed },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Strict response mapping (no tenant, branch, actor or internal cost leakage)
  // -------------------------------------------------------------------------

  private supplierSummaryValue(supplier: SupplierSummaryRecord) {
    const primary =
      supplier.contacts.find((contact) => contact.isPrimary) ?? null;
    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      primaryContact:
        primary === null
          ? null
          : {
              id: primary.id,
              name: primary.name,
              role: primary.role,
              phone: primary.phone,
              email: primary.email,
              isPrimary: primary.isPrimary,
            },
      paymentTermsDays: supplier.paymentTermsDays,
      leadTimeDays: supplier.leadTimeDays,
      onTimeRateBasisPoints: supplier.onTimeRateBasisPoints,
      isActive: supplier.isActive,
      version: supplier.version,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    };
  }

  private toSupplierSummary(supplier: SupplierSummaryRecord): SupplierSummary {
    return purchasingResponse(
      SupplierSummarySchema,
      this.supplierSummaryValue(supplier),
    );
  }

  private toSupplierDetail(supplier: SupplierDetailRecord): SupplierDetail {
    return purchasingResponse(SupplierDetailSchema, {
      ...this.supplierSummaryValue(supplier),
      addressLine: supplier.addressLine,
      city: supplier.city,
      notes: supplier.notes,
      contacts: supplier.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        phone: contact.phone,
        email: contact.email,
        isPrimary: contact.isPrimary,
      })),
    });
  }

  private purchaseOrderSummaryValue(
    order: PurchaseOrderSummaryRecord | PurchaseOrderDetailRecord,
  ) {
    const lineTotals = order.lines.map((line) =>
      lineValue(
        safeMinor(line.unitCostMinor, "purchase unit cost"),
        line.quantityOrdered,
        "purchase order total",
      ),
    );
    return {
      id: order.id,
      number: order.number,
      supplier: order.supplier,
      status: order.status,
      orderDate: dateOnly(order.orderDate),
      expectedOn: order.expectedOn === null ? null : dateOnly(order.expectedOn),
      totalMinor: sum(lineTotals),
      totalUnits: order.lines.reduce(
        (total, line) => total + line.quantityOrdered,
        0,
      ),
      receivedUnits: order.lines.reduce(
        (total, line) => total + line.quantityReceived,
        0,
      ),
      version: order.version,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toPurchaseOrderSummary(
    order: PurchaseOrderSummaryRecord,
  ): PurchaseOrderSummary {
    return purchasingResponse(
      PurchaseOrderSummarySchema,
      this.purchaseOrderSummaryValue(order),
    );
  }

  private toPurchaseOrderDetail(
    order: PurchaseOrderDetailRecord,
  ): PurchaseOrderDetail {
    return purchasingResponse(PurchaseOrderDetailSchema, {
      ...this.purchaseOrderSummaryValue(order),
      notes: order.notes,
      approvedAt: order.approvedAt?.toISOString() ?? null,
      orderedAt: order.orderedAt?.toISOString() ?? null,
      closedAt: order.closedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      lines: order.lines.map((line) => {
        const unitCostMinor = safeMinor(
          line.unitCostMinor,
          "purchase unit cost",
        );
        return {
          id: line.id,
          productVariant: line.productVariant,
          quantityOrdered: line.quantityOrdered,
          quantityReceived: line.quantityReceived,
          quantityRemaining: line.quantityOrdered - line.quantityReceived,
          unitCostMinor,
          lineTotalMinor: lineValue(
            unitCostMinor,
            line.quantityOrdered,
            "purchase line total",
          ),
          notes: line.notes,
        };
      }),
    });
  }

  private goodsReceiptSummaryValue(receipt: GoodsReceiptSummaryRecord) {
    return {
      id: receipt.id,
      number: receipt.number,
      purchaseOrder: receipt.purchaseOrder,
      supplier: receipt.supplier,
      supplierInvoiceReference: receipt.supplierInvoiceReference,
      receivedAt: receipt.receivedAt.toISOString(),
      lineCount: receipt.lines.length,
      unitCount: receipt.lines.reduce(
        (total, line) => total + line.quantityReceived,
        0,
      ),
      actualCostTotalMinor: safeMinor(
        receipt.actualCostTotalMinor,
        "receipt actual total",
      ),
      landedCostTotalMinor: safeMinor(
        receipt.landedCostTotalMinor,
        "receipt landed total",
      ),
      payableTotalMinor: safeMinor(
        receipt.payableTotalMinor,
        "receipt payable total",
      ),
      createdAt: receipt.createdAt.toISOString(),
    };
  }

  private toGoodsReceiptSummary(
    receipt: GoodsReceiptSummaryRecord,
  ): GoodsReceiptSummary {
    return purchasingResponse(
      GoodsReceiptSummarySchema,
      this.goodsReceiptSummaryValue(receipt),
    );
  }

  private toGoodsReceiptDetail(
    receipt: GoodsReceiptDetailRecord,
    initialStates: ReadonlyMap<string, SerializedStockState>,
  ): GoodsReceiptDetail {
    if (receipt.payable === null) {
      throw new Error("Posted goods receipt is missing its payable");
    }
    return purchasingResponse(GoodsReceiptDetailSchema, {
      ...this.goodsReceiptSummaryValue(receipt),
      invoiceDueOn: dateOnly(receipt.invoiceDueOn),
      notes: receipt.notes,
      landedCosts: receipt.landedCosts.map((cost) => ({
        id: cost.id,
        kind: cost.kind,
        amountMinor: safeMinor(cost.amountMinor, "landed cost"),
        reference: cost.reference,
        notes: cost.notes,
      })),
      lines: receipt.lines.map((line) => ({
        id: line.id,
        purchaseOrderLineId: line.purchaseOrderLineId,
        productVariant: line.productVariant,
        stockLocation: line.stockLocation,
        quantityReceived: line.quantityReceived,
        unitCostMinor: safeMinor(line.unitCostMinor, "receipt unit cost"),
        actualCostTotalMinor: safeMinor(
          line.actualCostTotalMinor,
          "receipt line actual total",
        ),
        landedCostAllocatedMinor: safeMinor(
          line.landedCostAllocatedMinor,
          "receipt line landed allocation",
        ),
        landedCostTotalMinor: safeMinor(
          line.landedCostTotalMinor,
          "receipt line landed total",
        ),
        stockBatchId: line.stockBatchId,
        serializedUnits: line.serializedUnits.map((unit) => {
          if (unit.actualCostMinor === null || unit.landedCostMinor === null) {
            throw new Error("Received serialized unit is missing its cost");
          }
          const identifierAt = (type: "imei" | "serial", position: 1 | 2) =>
            unit.identifiers.find(
              (identifier) =>
                identifier.identifierType === type &&
                identifier.position === position,
            )?.normalizedValue;
          const imei1 = identifierAt("imei", 1);
          const state = initialStates.get(unit.id);
          if (imei1 === undefined || state === undefined) {
            throw new Error(
              "Received serialized unit is missing immutable receiving evidence",
            );
          }
          return {
            id: unit.id,
            imei1,
            imei2: identifierAt("imei", 2) ?? null,
            serialNumber: identifierAt("serial", 1) ?? null,
            state,
            actualCostMinor: safeMinor(
              unit.actualCostMinor,
              "serialized actual unit cost",
            ),
            landedCostMinor: safeMinor(
              unit.landedCostMinor,
              "serialized landed unit cost",
            ),
          };
        }),
      })),
      payable: {
        id: receipt.payable.id,
        dueOn: dateOnly(receipt.payable.dueOn),
        amountMinor: safeMinor(receipt.payable.amountMinor, "payable amount"),
        outstandingMinor: safeMinor(
          receipt.payable.outstandingMinor,
          "payable outstanding amount",
        ),
        status: receipt.payable.status,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Audit and failure translation
  // -------------------------------------------------------------------------

  private supplierSnapshot(
    supplier: SupplierDetailRecord,
  ): Prisma.InputJsonObject {
    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      paymentTermsDays: supplier.paymentTermsDays,
      leadTimeDays: supplier.leadTimeDays,
      addressLine: supplier.addressLine,
      city: supplier.city,
      notes: supplier.notes,
      isActive: supplier.isActive,
      version: supplier.version,
      contacts: supplier.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        phone: contact.phone,
        email: contact.email,
        isPrimary: contact.isPrimary,
      })),
    };
  }

  private purchaseOrderSnapshot(
    order: PurchaseOrderDetailRecord,
  ): Prisma.InputJsonObject {
    const detail = this.toPurchaseOrderDetail(order);
    return {
      id: detail.id,
      number: detail.number,
      supplier: detail.supplier,
      status: detail.status,
      orderDate: detail.orderDate,
      expectedOn: detail.expectedOn,
      notes: detail.notes,
      totalMinor: detail.totalMinor,
      totalUnits: detail.totalUnits,
      receivedUnits: detail.receivedUnits,
      approvedAt: detail.approvedAt,
      orderedAt: detail.orderedAt,
      closedAt: detail.closedAt,
      cancelledAt: detail.cancelledAt,
      version: detail.version,
      lines: detail.lines.map((line) => ({
        id: line.id,
        productVariant: line.productVariant,
        quantityOrdered: line.quantityOrdered,
        quantityReceived: line.quantityReceived,
        unitCostMinor: line.unitCostMinor,
        lineTotalMinor: line.lineTotalMinor,
        notes: line.notes,
      })),
    };
  }

  private goodsReceiptSnapshot(
    receipt: GoodsReceiptDetail,
  ): Prisma.InputJsonObject {
    return {
      id: receipt.id,
      number: receipt.number,
      purchaseOrder: receipt.purchaseOrder,
      supplier: receipt.supplier,
      supplierInvoiceReference: receipt.supplierInvoiceReference,
      receivedAt: receipt.receivedAt,
      invoiceDueOn: receipt.invoiceDueOn,
      actualCostTotalMinor: receipt.actualCostTotalMinor,
      landedCostTotalMinor: receipt.landedCostTotalMinor,
      payableTotalMinor: receipt.payableTotalMinor,
      payable: {
        id: receipt.payable.id,
        dueOn: receipt.payable.dueOn,
        amountMinor: receipt.payable.amountMinor,
        outstandingMinor: receipt.payable.outstandingMinor,
        status: receipt.payable.status,
      },
      landedCosts: receipt.landedCosts.map((cost) => ({
        kind: cost.kind,
        amountMinor: cost.amountMinor,
        reference: cost.reference,
      })),
      lines: receipt.lines.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        productVariantId: line.productVariant.id,
        stockLocationId: line.stockLocation.id,
        quantityReceived: line.quantityReceived,
        unitCostMinor: line.unitCostMinor,
        actualCostTotalMinor: line.actualCostTotalMinor,
        landedCostAllocatedMinor: line.landedCostAllocatedMinor,
        landedCostTotalMinor: line.landedCostTotalMinor,
      })),
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    context: PurchasingActorContext,
    event: {
      readonly action: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly before?: Prisma.InputJsonObject;
      readonly after: Prisma.InputJsonObject;
      readonly reason?: string | null;
    },
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        ...(event.before === undefined ? {} : { beforeSnapshot: event.before }),
        afterSnapshot: event.after,
        ...(event.reason === undefined ? {} : { reason: event.reason }),
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }

  private assertVersionMatched(
    result: { readonly count: number },
    label: string,
  ): void {
    if (result.count === 0) throw optimisticLockError(label);
  }

  private rethrowSupplierDuplicate(error: unknown): never {
    if (error instanceof DomainError) throw error;
    if (this.isPrismaError(error, "P2002")) {
      const message = "A supplier with this code already exists.";
      throw new DomainError(ERROR_CODES.CONFLICT, message, {
        details: { code: [message] },
        cause: error,
      });
    }
    this.rethrowUnexpected(error);
  }

  private rethrowReceivingFailure(
    error: unknown,
    input: CreateGoodsReceiptData,
  ): never {
    if (error instanceof DomainError) throw error;
    if (error instanceof MoneyError) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_FAILED,
        "Receipt totals exceed the supported integer money range.",
        { details: { lines: [error.message] }, cause: error },
      );
    }
    const text = this.databaseFailureText(error);
    if (
      this.isPrismaError(error, "P2002") &&
      (text.includes("device_identifiers") || text.includes("normalized_value"))
    ) {
      const hasImei = input.lines.some(
        (line) => line.trackingType === "serialized" && line.units.length > 0,
      );
      throw new DomainError(
        hasImei ? ERROR_CODES.IMEI_DUPLICATE : ERROR_CODES.SERIAL_DUPLICATE,
        hasImei
          ? "An IMEI entered on this receipt already exists in inventory."
          : "A serial number entered on this receipt already exists in inventory.",
        { cause: error },
      );
    }
    if (
      text.includes("purchase_order_lines_received_not_above_ordered") ||
      text.includes("quantity_received")
    ) {
      throw new DomainError(
        ERROR_CODES.PURCHASE_RECEIVE_EXCEEDS_ORDERED,
        "The received quantity exceeds the remaining purchase-order quantity.",
        { cause: error },
      );
    }
    if (
      text.includes("goods_receipts_supplier_invoice_reference_uq") ||
      (this.isPrismaError(error, "P2002") &&
        input.supplierInvoiceReference !== undefined &&
        input.supplierInvoiceReference !== null)
    ) {
      const message = "This supplier invoice reference was already received.";
      throw new DomainError(ERROR_CODES.CONFLICT, message, {
        details: { supplierInvoiceReference: [message] },
        cause: error,
      });
    }
    if (this.isPrismaError(error, "P2002")) {
      throw new DomainError(
        ERROR_CODES.CONFLICT,
        "This receipt conflicts with stock or receiving data posted at the same time.",
        { cause: error },
      );
    }
    if (
      text.includes("23514") ||
      text.includes("23503") ||
      text.includes("55000")
    ) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_FAILED,
        "The receipt no longer satisfies the purchase or stock constraints. Reload and try again.",
        { cause: error },
      );
    }
    this.rethrowUnexpected(error);
  }

  private databaseFailureText(error: unknown): string {
    const failure = error as {
      readonly message?: unknown;
      readonly meta?: unknown;
    };
    const message = typeof failure?.message === "string" ? failure.message : "";
    return `${message} ${JSON.stringify(failure?.meta ?? {})}`;
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is { readonly code: string; readonly meta?: unknown } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    );
  }

  private rethrowUnexpected(error: unknown): never {
    if (error instanceof Error) throw error;
    throw new Error("Purchasing database operation failed", { cause: error });
  }
}
