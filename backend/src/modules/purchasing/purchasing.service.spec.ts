import {
  CreateGoodsReceiptInputSchema,
  CreatePurchaseOrderInputSchema,
  ERROR_CODES,
  type CancelPurchaseOrderData,
  type CreateGoodsReceiptData,
  type PurchaseOrderTransitionData,
} from "@mobileshop/shared";
import { describe, expect, it, vi, type Mock } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import {
  PurchasingService,
  type PurchasingActorContext,
} from "./purchasing.service";

const IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  supplier: "10000000-0000-4000-8000-000000000004",
  purchase: "10000000-0000-4000-8000-000000000005",
  purchaseLine: "10000000-0000-4000-8000-000000000006",
  purchaseLine2: "10000000-0000-4000-8000-000000000007",
  quantityVariant: "10000000-0000-4000-8000-000000000008",
  quantityVariant2: "10000000-0000-4000-8000-000000000009",
  serializedVariant: "10000000-0000-4000-8000-00000000000a",
  location: "10000000-0000-4000-8000-00000000000b",
  allowedLocation: "10000000-0000-4000-8000-000000000015",
  receipt: "10000000-0000-4000-8000-00000000000c",
  receiptLine: "10000000-0000-4000-8000-00000000000d",
  receiptLine2: "10000000-0000-4000-8000-00000000000e",
  unit: "10000000-0000-4000-8000-00000000000f",
  batch: "10000000-0000-4000-8000-000000000010",
  batch2: "10000000-0000-4000-8000-000000000011",
  sequence: "10000000-0000-4000-8000-000000000012",
  payable: "10000000-0000-4000-8000-000000000013",
  landedCost: "10000000-0000-4000-8000-000000000014",
});

const NOW = new Date("2026-07-16T05:00:00.000Z");
const CONTEXT: PurchasingActorContext = {
  organizationId: IDS.organization,
  branchId: IDS.branch,
  actorUserId: IDS.user,
  allowedLocationIds: null,
  metadata: {
    requestId: "request-purchasing-test",
    ipAddress: "127.0.0.1",
    userAgent: "purchasing-test",
  },
};

const SUPPLIER = {
  id: IDS.supplier,
  code: "SUP-001",
  name: "Reliable Mobiles",
};

const QUANTITY_VARIANT = {
  id: IDS.quantityVariant,
  sku: "CASE-001",
  name: "Protective case",
  trackingType: "quantity" as const,
  condition: "new" as const,
  ptaStatus: "not_applicable" as const,
};

const QUANTITY_VARIANT_2 = {
  id: IDS.quantityVariant2,
  sku: "CABLE-001",
  name: "USB-C cable",
  trackingType: "quantity" as const,
  condition: "new" as const,
  ptaStatus: "not_applicable" as const,
};

const SERIALIZED_VARIANT = {
  id: IDS.serializedVariant,
  sku: "PHONE-001",
  name: "Smartphone 8/256",
  trackingType: "serialized" as const,
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
};

interface VariantFixture {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly trackingType: "quantity" | "serialized";
  readonly condition: "new";
  readonly ptaStatus: "not_applicable" | "pta_approved";
}

function purchaseRecord(
  status:
    | "draft"
    | "approved"
    | "ordered"
    | "partially_received"
    | "received"
    | "closed"
    | "cancelled" = "draft",
  version = 3,
) {
  return {
    id: IDS.purchase,
    number: "PO-000001",
    supplier: SUPPLIER,
    status,
    orderDate: new Date("2026-07-16T00:00:00.000Z"),
    expectedOn: new Date("2030-01-01T00:00:00.000Z"),
    notes: "Initial stocking order",
    approvedAt: status === "approved" ? NOW : null,
    orderedAt: status === "ordered" ? NOW : null,
    closedAt: status === "closed" ? NOW : null,
    cancelledAt: status === "cancelled" ? NOW : null,
    version,
    createdAt: NOW,
    updatedAt: NOW,
    lines: [
      {
        id: IDS.purchaseLine,
        productVariant: QUANTITY_VARIANT,
        quantityOrdered: 2,
        quantityReceived: 0,
        unitCostMinor: 1_250n,
        notes: null,
      },
      {
        id: IDS.purchaseLine2,
        productVariant: QUANTITY_VARIANT_2,
        quantityOrdered: 5,
        quantityReceived: 0,
        unitCostMinor: 500n,
        notes: null,
      },
    ],
  };
}

function serviceFor(client: object): PurchasingService {
  return new PurchasingService({ client } as unknown as PrismaService);
}

function interactiveClient(transactionClient: object) {
  return {
    $transaction: vi.fn(
      async (operation: (client: object) => Promise<unknown>) =>
        operation(transactionClient),
    ),
  };
}

function dataOf(mock: Mock, call = 0): Record<string, unknown> {
  return (
    mock.mock.calls[call]?.[0] as { readonly data: Record<string, unknown> }
  ).data;
}

function recursivelyHasKey(value: unknown, forbidden: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => recursivelyHasKey(item, forbidden));
  }
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, forbidden) ||
    Object.values(record).some((item) => recursivelyHasKey(item, forbidden))
  );
}

function sqlTextOf(mock: Mock, call: number): string {
  const first: unknown = mock.mock.calls[call]?.[0];
  if (Array.isArray(first)) return first.join(" ? ");
  const sql = (first as { readonly sql?: unknown } | undefined)?.sql;
  return typeof sql === "string" ? sql : "";
}

describe("PurchasingService purchase orders", () => {
  it("rejects an expected date before the server business date before writing", async () => {
    const tx = {
      supplier: { findFirst: vi.fn() },
      purchaseOrder: { create: vi.fn() },
    };
    const input = CreatePurchaseOrderInputSchema.parse({
      supplierId: IDS.supplier,
      expectedOn: "2000-01-01",
      lines: [
        {
          productVariantId: IDS.quantityVariant,
          quantity: 1,
          unitCostMinor: 100,
        },
      ],
    });

    await expect(
      serviceFor(interactiveClient(tx)).createPurchaseOrder(CONTEXT, input),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
    expect(tx.supplier.findFirst).not.toHaveBeenCalled();
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it("recalculates totals, records the creator/audit, and never writes stock", async () => {
    const order = purchaseRecord();
    const tx = {
      supplier: { findFirst: vi.fn().mockResolvedValue({ isActive: true }) },
      productVariant: {
        findMany: vi.fn().mockResolvedValue([
          { id: IDS.quantityVariant, isActive: true },
          { id: IDS.quantityVariant2, isActive: true },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValueOnce([
        {
          id: IDS.sequence,
          prefix: "PO-",
          nextValue: 1,
          padding: 6,
          periodKey: null,
        },
      ]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      numberSequence: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      purchaseOrder: {
        create: vi.fn().mockResolvedValue({ id: IDS.purchase }),
        findFirst: vi.fn().mockResolvedValue(order),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
      stockBatch: { create: vi.fn(), updateMany: vi.fn() },
      serializedUnit: { create: vi.fn() },
      inventoryMovement: { create: vi.fn() },
    };
    const input = CreatePurchaseOrderInputSchema.parse({
      supplierId: IDS.supplier,
      expectedOn: "2030-01-01",
      lines: [
        {
          productVariantId: IDS.quantityVariant,
          quantity: 2,
          unitCostMinor: 1_250,
        },
        {
          productVariantId: IDS.quantityVariant2,
          quantity: 5,
          unitCostMinor: 500,
        },
      ],
    });

    const result = await serviceFor(interactiveClient(tx)).createPurchaseOrder(
      CONTEXT,
      input,
    );

    expect(result.totalMinor).toBe(5_000);
    expect(result.totalUnits).toBe(7);
    expect(dataOf(tx.purchaseOrder.create)).toMatchObject({
      organizationId: IDS.organization,
      branchId: IDS.branch,
      createdByUserId: IDS.user,
      number: "PO-000001",
    });
    expect(tx.stockBatch.create).not.toHaveBeenCalled();
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.serializedUnit.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(dataOf(tx.auditEvent.create)).toMatchObject({
      action: "purchasing.purchase_order_created",
      entityType: "purchase_order",
      actorUserId: IDS.user,
    });
    expect(recursivelyHasKey(result, "organizationId")).toBe(false);
    expect(recursivelyHasKey(result, "branchId")).toBe(false);
    expect(recursivelyHasKey(result, "actorUserId")).toBe(false);
    expect(sqlTextOf(tx.$executeRaw, 0)).toContain("pg_advisory_xact_lock");
    expect(sqlTextOf(tx.$executeRaw, 1)).toContain("id,");
    expect(sqlTextOf(tx.$executeRaw, 1)).toContain("updated_at");
  });

  it.each([
    ["approve", "draft", "approved", "approvedByUserId"],
    ["order", "approved", "ordered", "orderedByUserId"],
    ["cancel", "ordered", "cancelled", "cancelledByUserId"],
    ["close", "received", "closed", "closedByUserId"],
  ] as const)(
    "applies the shared %s transition and stores its document actor",
    async (operation, from, target, actorField) => {
      const before = purchaseRecord(from, 3);
      const after = {
        ...purchaseRecord(target, 4),
        approvedAt: target === "approved" ? NOW : null,
        orderedAt: target === "ordered" ? NOW : null,
        cancelledAt: target === "cancelled" ? NOW : null,
        closedAt: target === "closed" ? NOW : null,
      };
      const tx = {
        purchaseOrder: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(before)
            .mockResolvedValueOnce(after),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
      };
      const service = serviceFor(interactiveClient(tx));
      const input: PurchaseOrderTransitionData | CancelPurchaseOrderData = {
        version: 3,
        reason: operation === "cancel" ? "Supplier could not fulfil." : null,
      };

      const result =
        operation === "approve"
          ? await service.approvePurchaseOrder(CONTEXT, IDS.purchase, input)
          : operation === "order"
            ? await service.orderPurchaseOrder(CONTEXT, IDS.purchase, input)
            : operation === "cancel"
              ? await service.cancelPurchaseOrder(
                  CONTEXT,
                  IDS.purchase,
                  input as CancelPurchaseOrderData,
                )
              : await service.closePurchaseOrder(CONTEXT, IDS.purchase, input);

      expect(result.status).toBe(target);
      expect(dataOf(tx.purchaseOrder.updateMany)).toMatchObject({
        status: target,
        [actorField]: IDS.user,
        version: { increment: 1 },
      });
      expect(dataOf(tx.auditEvent.create).action).toBe(
        `purchasing.purchase_order_${target}`,
      );
    },
  );

  it("fails a stale transition through the atomic version predicate", async () => {
    const tx = {
      purchaseOrder: {
        findFirst: vi.fn().mockResolvedValue(purchaseRecord("draft", 3)),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.approvePurchaseOrder(CONTEXT, IDS.purchase, {
        version: 3,
        reason: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED });
    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 3, status: "draft" }),
      }),
    );
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});

function receivingOrder(
  lines: readonly {
    readonly id: string;
    readonly variant: VariantFixture;
    readonly ordered: number;
    readonly received?: number;
    readonly purchaseCost?: number;
  }[],
) {
  return {
    id: IDS.purchase,
    supplierId: IDS.supplier,
    status: "ordered" as const,
    version: 4,
    supplier: { ...SUPPLIER, paymentTermsDays: 30 },
    lines: lines.map((line) => ({
      id: line.id,
      productVariantId: line.variant.id,
      quantityOrdered: line.ordered,
      quantityReceived: line.received ?? 0,
      unitCostMinor: BigInt(line.purchaseCost ?? 100),
      productVariant: { ...line.variant, isActive: true },
    })),
  };
}

function receiptDetail(options: {
  readonly actual: number;
  readonly landed: number;
  readonly lines: readonly {
    readonly id: string;
    readonly purchaseOrderLineId: string;
    readonly variant: VariantFixture;
    readonly quantity: number;
    readonly unitCost: number;
    readonly allocation: number;
    readonly batchId?: string | null;
    readonly serializedUnits?: readonly {
      readonly id: string;
      readonly actualCost: number;
      readonly landedCost: number;
      readonly identifiers: readonly {
        readonly identifierType: "imei" | "serial";
        readonly position: 1 | 2;
        readonly normalizedValue: string;
      }[];
    }[];
  }[];
  readonly landedCosts?: readonly {
    readonly kind: "freight" | "customs";
    readonly amountMinor: number;
  }[];
}) {
  return {
    id: IDS.receipt,
    number: "GRN-000001",
    supplierInvoiceReference: "INV-001",
    receivedAt: NOW,
    actualCostTotalMinor: BigInt(options.actual),
    landedCostTotalMinor: BigInt(options.landed),
    payableTotalMinor: BigInt(options.actual),
    createdAt: NOW,
    purchaseOrder: { id: IDS.purchase, number: "PO-000001" },
    supplier: SUPPLIER,
    invoiceDueOn: new Date("2030-01-01T00:00:00.000Z"),
    notes: null,
    landedCosts: (options.landedCosts ?? []).map((cost, index) => ({
      id: index === 0 ? IDS.landedCost : IDS.receiptLine2,
      kind: cost.kind,
      amountMinor: BigInt(cost.amountMinor),
      reference: null,
      notes: null,
    })),
    payable: {
      id: IDS.payable,
      dueOn: new Date("2030-01-01T00:00:00.000Z"),
      amountMinor: BigInt(options.actual),
      outstandingMinor: BigInt(options.actual),
      status: "open" as const,
    },
    lines: options.lines.map((line) => ({
      id: line.id,
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantityReceived: line.quantity,
      unitCostMinor: BigInt(line.unitCost),
      actualCostTotalMinor: BigInt(line.unitCost * line.quantity),
      landedCostAllocatedMinor: BigInt(line.allocation),
      landedCostTotalMinor: BigInt(
        line.unitCost * line.quantity + line.allocation,
      ),
      stockBatchId: line.batchId ?? null,
      productVariant: line.variant,
      stockLocation: {
        id: IDS.location,
        code: "MAIN",
        name: "Main store",
      },
      serializedUnits: (line.serializedUnits ?? []).map((unit) => ({
        id: unit.id,
        actualCostMinor: BigInt(unit.actualCost),
        landedCostMinor: BigInt(unit.landedCost),
        identifiers: unit.identifiers,
      })),
    })),
  };
}

function receivingTx(options: {
  readonly order: ReturnType<typeof receivingOrder>;
  readonly receipt: ReturnType<typeof receiptDetail>;
  readonly batches?: readonly {
    readonly id: string;
    readonly quantityOnHand: number;
    readonly quantityReserved: number;
    readonly actualCostMinor: bigint | null;
    readonly landedCostMinor: bigint | null;
    readonly version: number;
  }[];
  readonly movements?: readonly {
    readonly serializedUnitId: string | null;
    readonly toState: "available" | "pending_verification" | "quarantined";
  }[];
  readonly identifierCollision?: string;
  readonly serializedFailure?: unknown;
}) {
  const raw = vi
    .fn()
    .mockResolvedValueOnce([
      {
        id: IDS.purchase,
        status: options.order.status,
        version: options.order.version,
      },
    ])
    .mockResolvedValueOnce(options.order.lines.map((line) => ({ id: line.id })))
    .mockResolvedValueOnce([
      {
        id: IDS.sequence,
        prefix: "GRN-",
        nextValue: 1,
        padding: 6,
        periodKey: null,
      },
    ]);
  for (const batch of options.batches ?? []) raw.mockResolvedValueOnce([batch]);
  let receiptLineIndex = 0;
  const receiptLineIds = [IDS.receiptLine, IDS.receiptLine2];
  const identifierCreate = vi.fn();
  if (options.serializedFailure === undefined) {
    identifierCreate.mockResolvedValue({ id: "identifier" });
  } else {
    identifierCreate.mockRejectedValue(options.serializedFailure);
  }
  return {
    $queryRaw: raw,
    $executeRaw: vi.fn().mockResolvedValue(1),
    purchaseOrder: {
      findFirst: vi.fn().mockResolvedValue(options.order),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    purchaseOrderLine: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    stockLocation: {
      findMany: vi.fn().mockResolvedValue([{ id: IDS.location }]),
    },
    deviceIdentifier: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          options.identifierCollision === undefined
            ? []
            : [{ normalizedValue: options.identifierCollision }],
        ),
      create: identifierCreate,
    },
    numberSequence: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    goodsReceipt: {
      create: vi.fn().mockResolvedValue({ id: IDS.receipt }),
      findFirst: vi.fn().mockResolvedValue(options.receipt),
    },
    goodsReceiptLandedCost: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    goodsReceiptLine: {
      create: vi.fn().mockImplementation(() => {
        const id = receiptLineIds[receiptLineIndex] ?? IDS.receiptLine;
        receiptLineIndex += 1;
        return Promise.resolve({ id });
      }),
    },
    stockBatch: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    serializedUnit: {
      create: vi.fn().mockResolvedValue({ id: IDS.unit }),
    },
    inventoryMovement: {
      create: vi.fn().mockResolvedValue({ id: "movement" }),
      findMany: vi.fn().mockResolvedValue(options.movements ?? []),
    },
    payable: { create: vi.fn().mockResolvedValue({ id: IDS.payable }) },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
  };
}

describe("PurchasingService goods receiving", () => {
  it("rejects a non-Luhn IMEI inside TXN-1 before any database write", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      goodsReceipt: { create: vi.fn() },
      serializedUnit: { create: vi.fn() },
    };
    const input = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      invoiceDueOn: "2030-01-01",
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "serialized",
          stockLocationId: IDS.location,
          unitCostMinor: 1_000,
          units: [{ imei1: "356938035643808" }],
        },
      ],
    });

    await expect(
      serviceFor(interactiveClient(tx)).createGoodsReceipt(CONTEXT, input),
    ).rejects.toMatchObject({ code: ERROR_CODES.IMEI_INVALID });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.serializedUnit.create).not.toHaveBeenCalled();
  });

  it("returns stable validation when invoice due date precedes receipt date", async () => {
    const order = receivingOrder([
      {
        id: IDS.purchaseLine,
        variant: QUANTITY_VARIANT,
        ordered: 1,
      },
    ]);
    const receipt = receiptDetail({
      actual: 100,
      landed: 100,
      lines: [
        {
          id: IDS.receiptLine,
          purchaseOrderLineId: IDS.purchaseLine,
          variant: QUANTITY_VARIANT,
          quantity: 1,
          unitCost: 100,
          allocation: 0,
          batchId: IDS.batch,
        },
      ],
    });
    const tx = receivingTx({ order, receipt });
    const input = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      invoiceDueOn: "2000-01-01",
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "quantity",
          stockLocationId: IDS.location,
          unitCostMinor: 100,
          quantity: 1,
        },
      ],
    });

    await expect(
      serviceFor(interactiveClient(tx)).createGoodsReceipt(CONTEXT, input),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a receipt unit cost that differs from the approved PO before mutating receipt, stock or payable", async () => {
    const order = receivingOrder([
      {
        id: IDS.purchaseLine,
        variant: QUANTITY_VARIANT,
        ordered: 1,
        purchaseCost: 100,
      },
    ]);
    const receipt = receiptDetail({
      actual: 120,
      landed: 120,
      lines: [
        {
          id: IDS.receiptLine,
          purchaseOrderLineId: IDS.purchaseLine,
          variant: QUANTITY_VARIANT,
          quantity: 1,
          unitCost: 120,
          allocation: 0,
          batchId: IDS.batch,
        },
      ],
    });
    const tx = receivingTx({ order, receipt });
    const input = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      invoiceDueOn: "2030-01-01",
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "quantity",
          stockLocationId: IDS.location,
          unitCostMinor: 120,
          quantity: 1,
        },
      ],
    });

    await expect(
      serviceFor(interactiveClient(tx)).createGoodsReceipt(CONTEXT, input),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      details: {
        "lines.0.unitCostMinor": [
          expect.stringContaining("manager-approved purchase-order cost"),
        ],
      },
    });
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.payable.create).not.toHaveBeenCalled();
  });

  it("hides an out-of-scope receiving location before mutating receipt or stock", async () => {
    const order = receivingOrder([
      {
        id: IDS.purchaseLine,
        variant: QUANTITY_VARIANT,
        ordered: 1,
        purchaseCost: 100,
      },
    ]);
    const receipt = receiptDetail({
      actual: 100,
      landed: 100,
      lines: [
        {
          id: IDS.receiptLine,
          purchaseOrderLineId: IDS.purchaseLine,
          variant: QUANTITY_VARIANT,
          quantity: 1,
          unitCost: 100,
          allocation: 0,
          batchId: IDS.batch,
        },
      ],
    });
    const tx = receivingTx({ order, receipt });
    const input = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      invoiceDueOn: "2030-01-01",
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "quantity",
          stockLocationId: IDS.location,
          unitCostMinor: 100,
          quantity: 1,
        },
      ],
    });
    const scopedContext: PurchasingActorContext = {
      ...CONTEXT,
      allowedLocationIds: [IDS.allowedLocation],
    };

    await expect(
      serviceFor(interactiveClient(tx)).createGoodsReceipt(
        scopedContext,
        input,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
    expect(tx.stockLocation.findMany).not.toHaveBeenCalled();
    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.payable.create).not.toHaveBeenCalled();
  });

  it("partially receives quantity stock with exact BigInt moving averages, payable and audit", async () => {
    const order = receivingOrder([
      {
        id: IDS.purchaseLine,
        variant: QUANTITY_VARIANT,
        ordered: 10,
        purchaseCost: 120,
      },
    ]);
    const receipt = receiptDetail({
      actual: 360,
      landed: 363,
      landedCosts: [{ kind: "freight", amountMinor: 3 }],
      lines: [
        {
          id: IDS.receiptLine,
          purchaseOrderLineId: IDS.purchaseLine,
          variant: QUANTITY_VARIANT,
          quantity: 3,
          unitCost: 120,
          allocation: 3,
          batchId: IDS.batch,
        },
      ],
    });
    const tx = receivingTx({
      order,
      receipt,
      batches: [
        {
          id: IDS.batch,
          quantityOnHand: 2,
          quantityReserved: 0,
          actualCostMinor: 100n,
          landedCostMinor: 110n,
          version: 5,
        },
      ],
    });
    const input = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      supplierInvoiceReference: "INV-001",
      invoiceDueOn: "2030-01-01",
      landedCosts: [{ kind: "freight", amountMinor: 3 }],
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "quantity",
          stockLocationId: IDS.location,
          unitCostMinor: 120,
          quantity: 3,
        },
      ],
    });

    const result = await serviceFor(interactiveClient(tx)).createGoodsReceipt(
      CONTEXT,
      input,
    );

    expect(result.actualCostTotalMinor).toBe(360);
    expect(result.landedCostTotalMinor).toBe(363);
    expect(result.payableTotalMinor).toBe(360);
    expect(dataOf(tx.stockBatch.updateMany)).toMatchObject({
      quantityOnHand: { increment: 3 },
      actualCostMinor: 112n,
      landedCostMinor: 117n,
      version: { increment: 1 },
    });
    expect(dataOf(tx.goodsReceiptLine.create)).toMatchObject({
      actualCostTotalMinor: 360n,
      landedCostAllocatedMinor: 3n,
      landedCostTotalMinor: 363n,
      stockBatchId: IDS.batch,
    });
    expect(dataOf(tx.purchaseOrder.updateMany)).toMatchObject({
      status: "partially_received",
      version: { increment: 1 },
    });
    expect(dataOf(tx.payable.create)).toMatchObject({
      amountMinor: 360n,
      outstandingMinor: 360n,
    });
    expect(dataOf(tx.auditEvent.create)).toMatchObject({
      action: "purchasing.goods_received",
      entityType: "goods_receipt",
    });
    expect(sqlTextOf(tx.$executeRaw, 0)).toContain("pg_advisory_xact_lock");
    expect(sqlTextOf(tx.$executeRaw, 1)).toContain("id,");
    expect(sqlTextOf(tx.$executeRaw, 1)).toContain("updated_at");
    expect(sqlTextOf(tx.$executeRaw, 2)).toContain("id,");
    expect(sqlTextOf(tx.$executeRaw, 2)).toContain("updated_at");
  });

  it("fully receives serialized stock, keeps initial state immutable, and creates no quantity batch", async () => {
    const order = receivingOrder([
      {
        id: IDS.purchaseLine,
        variant: SERIALIZED_VARIANT,
        ordered: 1,
        purchaseCost: 1_000,
      },
    ]);
    const receipt = receiptDetail({
      actual: 1_000,
      landed: 1_002,
      landedCosts: [{ kind: "customs", amountMinor: 2 }],
      lines: [
        {
          id: IDS.receiptLine,
          purchaseOrderLineId: IDS.purchaseLine,
          variant: SERIALIZED_VARIANT,
          quantity: 1,
          unitCost: 1_000,
          allocation: 2,
          serializedUnits: [
            {
              id: IDS.unit,
              actualCost: 1_000,
              landedCost: 1_002,
              identifiers: [
                {
                  identifierType: "imei",
                  position: 1,
                  normalizedValue: "356938035643809",
                },
                {
                  identifierType: "imei",
                  position: 2,
                  normalizedValue: "356938035643817",
                },
                {
                  identifierType: "serial",
                  position: 1,
                  normalizedValue: "SNABC123",
                },
              ],
            },
          ],
        },
      ],
    });
    const tx = receivingTx({
      order,
      receipt,
      movements: [
        { serializedUnitId: IDS.unit, toState: "quarantined" as const },
      ],
    });
    const input = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      supplierInvoiceReference: "INV-001",
      invoiceDueOn: "2030-01-01",
      landedCosts: [{ kind: "customs", amountMinor: 2 }],
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "serialized",
          stockLocationId: IDS.location,
          unitCostMinor: 1_000,
          units: [
            {
              imei1: "356938035643809",
              imei2: "356938035643817",
              serialNumber: "SNABC123",
              initialState: "quarantined",
            },
          ],
        },
      ],
    });

    const result = await serviceFor(interactiveClient(tx)).createGoodsReceipt(
      CONTEXT,
      input,
    );

    expect(result.lines[0]?.serializedUnits[0]).toMatchObject({
      imei1: "356938035643809",
      imei2: "356938035643817",
      serialNumber: "SNABC123",
      state: "quarantined",
      actualCostMinor: 1_000,
      landedCostMinor: 1_002,
    });
    expect(dataOf(tx.serializedUnit.create)).toMatchObject({
      purchaseOrderLineId: IDS.purchaseLine,
      goodsReceiptLineId: IDS.receiptLine,
      state: "quarantined",
      actualCostMinor: 1_000n,
      landedCostMinor: 1_002n,
    });
    expect([
      dataOf(tx.deviceIdentifier.create, 0),
      dataOf(tx.deviceIdentifier.create, 1),
      dataOf(tx.deviceIdentifier.create, 2),
    ]).toEqual([
      expect.objectContaining({
        identifierType: "imei",
        position: 1,
        normalizedValue: "356938035643809",
      }),
      expect.objectContaining({
        identifierType: "imei",
        position: 2,
        normalizedValue: "356938035643817",
      }),
      expect.objectContaining({
        identifierType: "serial",
        position: 1,
        normalizedValue: "SNABC123",
      }),
    ]);
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(dataOf(tx.purchaseOrder.updateMany).status).toBe("received");
    expect(dataOf(tx.inventoryMovement.create)).toMatchObject({
      movementType: "purchase_receive",
      fromState: null,
      toState: "quarantined",
      referenceType: "goods_receipt",
      referenceId: IDS.receipt,
    });
    expect(recursivelyHasKey(result, "organizationId")).toBe(false);
    expect(recursivelyHasKey(result, "branchId")).toBe(false);
    expect(
      recursivelyHasKey(dataOf(tx.auditEvent.create), "organizationId"),
    ).toBe(true);
    const auditAfter = dataOf(tx.auditEvent.create).afterSnapshot;
    expect(recursivelyHasKey(auditAfter, "organizationId")).toBe(false);
    expect(recursivelyHasKey(auditAfter, "branchId")).toBe(false);
  });

  it("throws from TXN-1 on a concurrent duplicate IMEI so the receipt rolls back", async () => {
    const order = receivingOrder([
      {
        id: IDS.purchaseLine,
        variant: SERIALIZED_VARIANT,
        ordered: 1,
        purchaseCost: 1_000,
      },
    ]);
    const receipt = receiptDetail({
      actual: 1_000,
      landed: 1_000,
      lines: [
        {
          id: IDS.receiptLine,
          purchaseOrderLineId: IDS.purchaseLine,
          variant: SERIALIZED_VARIANT,
          quantity: 1,
          unitCost: 1_000,
          allocation: 0,
        },
      ],
    });
    const duplicate = {
      code: "P2002",
      meta: {
        target: "device_identifiers_organization_id_normalized_value_key",
      },
    };
    const tx = receivingTx({ order, receipt, serializedFailure: duplicate });
    const client = interactiveClient(tx);
    const input: CreateGoodsReceiptData = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      supplierInvoiceReference: "INV-001",
      invoiceDueOn: "2030-01-01",
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "serialized",
          stockLocationId: IDS.location,
          unitCostMinor: 1_000,
          units: [{ imei1: "356938035643809" }],
        },
      ],
    });

    await expect(
      serviceFor(client).createGoodsReceipt(CONTEXT, input),
    ).rejects.toMatchObject({ code: ERROR_CODES.IMEI_DUPLICATE });
    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(tx.goodsReceipt.create).toHaveBeenCalledOnce();
    expect(tx.payable.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("reconciles largest-remainder landed allocation across receipt lines exactly", async () => {
    const order = receivingOrder([
      {
        id: IDS.purchaseLine,
        variant: QUANTITY_VARIANT,
        ordered: 1,
      },
      {
        id: IDS.purchaseLine2,
        variant: QUANTITY_VARIANT_2,
        ordered: 1,
        purchaseCost: 300,
      },
    ]);
    const receipt = receiptDetail({
      actual: 400,
      landed: 403,
      landedCosts: [{ kind: "freight", amountMinor: 3 }],
      lines: [
        {
          id: IDS.receiptLine,
          purchaseOrderLineId: IDS.purchaseLine,
          variant: QUANTITY_VARIANT,
          quantity: 1,
          unitCost: 100,
          allocation: 1,
          batchId: IDS.batch,
        },
        {
          id: IDS.receiptLine2,
          purchaseOrderLineId: IDS.purchaseLine2,
          variant: QUANTITY_VARIANT_2,
          quantity: 1,
          unitCost: 300,
          allocation: 2,
          batchId: IDS.batch2,
        },
      ],
    });
    const tx = receivingTx({
      order,
      receipt,
      batches: [
        {
          id: IDS.batch,
          quantityOnHand: 0,
          quantityReserved: 0,
          actualCostMinor: null,
          landedCostMinor: null,
          version: 1,
        },
        {
          id: IDS.batch2,
          quantityOnHand: 0,
          quantityReserved: 0,
          actualCostMinor: null,
          landedCostMinor: null,
          version: 1,
        },
      ],
    });
    tx.stockLocation.findMany.mockResolvedValue([{ id: IDS.location }]);
    const input = CreateGoodsReceiptInputSchema.parse({
      purchaseOrderId: IDS.purchase,
      invoiceDueOn: "2030-01-01",
      landedCosts: [{ kind: "freight", amountMinor: 3 }],
      lines: [
        {
          purchaseOrderLineId: IDS.purchaseLine,
          trackingType: "quantity",
          stockLocationId: IDS.location,
          unitCostMinor: 100,
          quantity: 1,
        },
        {
          purchaseOrderLineId: IDS.purchaseLine2,
          trackingType: "quantity",
          stockLocationId: IDS.location,
          unitCostMinor: 300,
          quantity: 1,
        },
      ],
    });

    const result = await serviceFor(interactiveClient(tx)).createGoodsReceipt(
      CONTEXT,
      input,
    );

    const allocations = tx.goodsReceiptLine.create.mock.calls.map((call) =>
      Number(
        (call[0] as { data: { landedCostAllocatedMinor: bigint } }).data
          .landedCostAllocatedMinor,
      ),
    );
    expect(allocations).toEqual([1, 2]);
    expect(allocations.reduce((total, value) => total + value, 0)).toBe(3);
    expect(result.landedCostTotalMinor).toBe(403);
    expect(result.payableTotalMinor).toBe(400);
  });
});
