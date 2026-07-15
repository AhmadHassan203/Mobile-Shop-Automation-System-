import {
  AdjustStockInputSchema,
  BulkImeiValidationInputSchema,
  ERROR_CODES,
  StockBalanceListQuerySchema,
  type AdjustStockData,
  type ReleaseStockData,
  type ReserveStockData,
  type SerializedStockState,
  type TransferStockData,
} from "@mobileshop/shared";
import { describe, expect, it, vi, type Mock } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import {
  InventoryService,
  type InventoryActorContext,
} from "./inventory.service";

const IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  variant: "10000000-0000-4000-8000-000000000004",
  serializedVariant: "10000000-0000-4000-8000-000000000005",
  location: "10000000-0000-4000-8000-000000000006",
  otherLocation: "10000000-0000-4000-8000-000000000007",
  batch: "10000000-0000-4000-8000-000000000008",
  otherBatch: "10000000-0000-4000-8000-000000000009",
  unit: "10000000-0000-4000-8000-00000000000a",
  otherOrganization: "20000000-0000-4000-8000-000000000001",
  missing: "30000000-0000-4000-8000-000000000001",
});

/**
 * Values the inventory contracts exist to keep out of inventory requests,
 * responses and audit snapshots alike. Cost belongs to the purchasing slice and
 * the columns exist on the row — so their absence has to be asserted, not
 * assumed.
 */
const FORBIDDEN_FIELDS = Object.freeze([
  "organizationId",
  "branchId",
  "actorUserId",
  "actualCostMinor",
  "landedCostMinor",
  "cost",
  "price",
  "defaultPriceMinor",
  "minPriceMinor",
]);

function expectNoForbiddenFields(value: unknown): void {
  for (const field of FORBIDDEN_FIELDS) {
    expect(value).not.toHaveProperty(field);
  }
}

const CONTEXT: InventoryActorContext = {
  organizationId: IDS.organization,
  branchId: IDS.branch,
  actorUserId: IDS.user,
  metadata: {
    requestId: "request-inventory-test",
    ipAddress: "127.0.0.1",
    userAgent: "inventory-test",
  },
};

const QUANTITY_VARIANT = {
  id: IDS.variant,
  sku: "CASE-001",
  name: "Clear silicone case",
  trackingType: "quantity" as const,
};

const SERIALIZED_VARIANT = {
  id: IDS.serializedVariant,
  sku: "PHONE-001",
  name: "Generic smartphone 8/256",
  trackingType: "serialized" as const,
};

/** A `SELECT ... FOR UPDATE` projection, as the raw lock query returns it. */
const LOCKED_BATCH = {
  id: IDS.batch,
  stockLocationId: IDS.location,
  quantityOnHand: 5,
  quantityReserved: 1,
  version: 3,
};

const LOCKED_UNIT = {
  id: IDS.unit,
  productVariantId: IDS.serializedVariant,
  stockLocationId: IDS.location,
  state: "available" as SerializedStockState,
  version: 2,
};

const UNIT_RECORD = {
  id: IDS.unit,
  state: "available" as SerializedStockState,
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
  receivedAt: new Date("2026-07-01T00:00:00.000Z"),
  version: 2,
  productVariant: {
    id: IDS.serializedVariant,
    sku: "PHONE-001",
    name: "Generic smartphone 8/256",
  },
  stockLocation: { id: IDS.location, name: "Main counter", code: "MAIN" },
  identifiers: [
    { identifierType: "imei" as const, normalizedValue: "356938035643809" },
  ],
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

const ADJUST_INPUT: AdjustStockData = AdjustStockInputSchema.parse({
  productVariantId: IDS.variant,
  stockLocationId: IDS.location,
  movementType: "adjustment_out",
  quantity: 2,
  adjustmentReason: "stock_count_correction",
  reason: "Counted two fewer on the shelf.",
});

const RESERVE_INPUT: ReserveStockData = {
  productVariantId: IDS.variant,
  stockLocationId: IDS.location,
  quantity: 2,
  reason: null,
};

const RELEASE_INPUT: ReleaseStockData = {
  productVariantId: IDS.variant,
  stockLocationId: IDS.location,
  quantity: 1,
  reason: null,
};

const TRANSFER_INPUT: TransferStockData = {
  productVariantId: IDS.variant,
  fromStockLocationId: IDS.location,
  toStockLocationId: IDS.otherLocation,
  quantity: 2,
  reason: "Restocking the back counter.",
};

function serviceFor(client: object): InventoryService {
  return new InventoryService({ client } as unknown as PrismaService);
}

function interactiveClient(transactionClient: object) {
  return {
    $transaction: vi.fn(
      async (operation: (client: object) => Promise<unknown>) =>
        operation(transactionClient),
    ),
  };
}

/**
 * Reads back the SQL a mocked `$queryRaw` was called with. It is invoked both as
 * a tagged template (the row locks) and with a `Prisma.Sql` (the balance union),
 * so both shapes are flattened to text the assertions can search.
 */
function sqlTextOf(mock: Mock, call = 0): string {
  const first: unknown = mock.mock.calls[call]?.[0];
  if (Array.isArray(first)) return first.join(" ? ");
  const sql: unknown = (first as { readonly sql?: unknown } | undefined)?.sql;
  return typeof sql === "string" ? sql : "";
}

function auditData(
  mock: Mock,
  call = 0,
): {
  readonly action: string;
  readonly entityType: string;
  readonly beforeSnapshot?: Record<string, unknown>;
  readonly afterSnapshot: Record<string, unknown>;
} {
  return (
    mock.mock.calls[call]?.[0] as {
      readonly data: {
        readonly action: string;
        readonly entityType: string;
        readonly beforeSnapshot?: Record<string, unknown>;
        readonly afterSnapshot: Record<string, unknown>;
      };
    }
  ).data;
}

function movementData(mock: Mock, call = 0): Record<string, unknown> {
  return (
    mock.mock.calls[call]?.[0] as { readonly data: Record<string, unknown> }
  ).data;
}

/**
 * A transaction client for quantity-tracked stock, wired for the happy path.
 * Individual tests override only the step they are about to break, so a test
 * that expects a refusal cannot pass merely because a later step was missing.
 */
function quantityTx(
  overrides: {
    readonly variant?: unknown;
    readonly lockedBatches?: readonly unknown[];
    readonly updateCount?: number;
    readonly batchAfter?: { quantityOnHand: number; quantityReserved: number };
  } = {},
) {
  return {
    productVariant: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.variant === undefined
            ? QUANTITY_VARIANT
            : overrides.variant,
        ),
    },
    stockLocation: {
      // Nullable: a location outside the session's branch resolves to null.
      findFirst: vi.fn(
        (args: {
          readonly where: { readonly id: string };
        }): Promise<{ id: string; name: string } | null> =>
          Promise.resolve({ id: args.where.id, name: "Main counter" }),
      ),
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValue(overrides.lockedBatches ?? [LOCKED_BATCH]),
    stockBatch: {
      create: vi.fn().mockResolvedValue({
        id: IDS.otherBatch,
        stockLocationId: IDS.otherLocation,
        quantityOnHand: 0,
        quantityReserved: 0,
        version: 1,
      }),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides.updateCount ?? 1 }),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.batchAfter ?? { quantityOnHand: 3, quantityReserved: 1 },
        ),
    },
    inventoryMovement: {
      create: vi.fn().mockResolvedValue({ id: "movement" }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
  };
}

function serializedTx(
  overrides: {
    readonly locked?: unknown;
    readonly updateCount?: number;
    readonly after?: unknown;
  } = {},
) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([overrides.locked ?? LOCKED_UNIT]),
    serializedUnit: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(UNIT_RECORD)
        .mockResolvedValueOnce(overrides.after ?? UNIT_RECORD),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides.updateCount ?? 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    stockLocation: {
      findFirst: vi.fn((args: { readonly where: { readonly id: string } }) =>
        Promise.resolve({ id: args.where.id, name: "Back counter" }),
      ),
    },
    inventoryMovement: {
      create: vi.fn().mockResolvedValue({ id: "movement" }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
  };
}

describe("InventoryService derived balances", () => {
  function balanceClient(rows: readonly unknown[], total: number) {
    const $queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ total }])
      .mockResolvedValueOnce(rows);
    return {
      $queryRaw,
      $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
  }

  const ROW = {
    variantId: IDS.variant,
    sku: "CASE-001",
    variantName: "Clear silicone case",
    trackingType: "quantity" as const,
    locationId: IDS.location,
    locationName: "Main counter",
    onHand: 5,
    reserved: 1,
  };

  it("derives balances from units and batches, never from a stored rollup", async () => {
    const client = balanceClient([ROW], 1);
    const service = serviceFor(client);

    const result = await service.listStockBalances(
      IDS.organization,
      StockBalanceListQuerySchema.parse({ page: 1, pageSize: 25 }),
    );

    const sql = sqlTextOf(client.$queryRaw, 1);
    expect(sql).toContain("stock_batches");
    expect(sql).toContain("serialized_units");
    // 04_DATA_MODEL §5: a cached total is one bug away from disagreeing with the
    // ledger that produced it, so no such table may be consulted.
    expect(sql).not.toContain("stock_balances");
    expect(sql).not.toContain("actual_cost_minor");
    expect(sql).not.toContain("landed_cost_minor");
    expect(result).toEqual({
      items: [
        {
          productVariant: {
            id: IDS.variant,
            sku: "CASE-001",
            name: "Clear silicone case",
          },
          locationId: IDS.location,
          locationName: "Main counter",
          trackingType: "quantity",
          onHand: 5,
          reserved: 1,
          available: 4,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    expectNoForbiddenFields(result.items[0]);
  });

  it("scopes every balance read to the authenticated tenant", async () => {
    const client = balanceClient([], 0);
    const service = serviceFor(client);

    await service.listStockBalances(
      IDS.organization,
      StockBalanceListQuerySchema.parse({ page: 1, pageSize: 25 }),
    );

    const values = client.$queryRaw.mock.calls[1]?.[0] as {
      readonly values: readonly unknown[];
    };
    expect(values.values).toContain(IDS.organization);
    expect(values.values).not.toContain(IDS.otherOrganization);
  });

  it("counts reserved serialized units as a subset of on hand", async () => {
    // reserved is drawn from the same on-hand states, which is exactly what
    // keeps `reserved <= onHand` true for serialized stock.
    const client = balanceClient([], 0);
    const service = serviceFor(client);

    await service.listStockBalances(
      IDS.organization,
      StockBalanceListQuerySchema.parse({ page: 1, pageSize: 25 }),
    );

    const sql = sqlTextOf(client.$queryRaw, 1);
    expect(sql).toContain("FILTER");
    expect(sql).toContain("GROUP BY");
  });

  it("treats a balance that breaks the response contract as an internal fault", async () => {
    // reserved above onHand cannot be served as a valid balance; it is a data
    // fault, never the caller's 422.
    const client = balanceClient([{ ...ROW, onHand: 1, reserved: 4 }], 1);
    const service = serviceFor(client);

    await expect(
      service.listStockBalances(
        IDS.organization,
        StockBalanceListQuerySchema.parse({ page: 1, pageSize: 25 }),
      ),
    ).rejects.toMatchObject({
      message: "Inventory response validation failed",
    });
  });
});

describe("InventoryService adjustments", () => {
  it("requires a reason on every manual correction", async () => {
    const tx = quantityTx();
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, { ...ADJUST_INPUT, reason: "   " }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_ADJUSTMENT_REASON_REQUIRED,
      details: { reason: expect.any(Array) },
    });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("blocks a direct counter edit on serialized stock", async () => {
    const tx = quantityTx({ variant: SERIALIZED_VARIANT });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, {
        ...ADJUST_INPUT,
        productVariantId: IDS.serializedVariant,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_DIRECT_EDIT_BLOCKED,
    });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("takes a row lock, writes one movement and one audit event", async () => {
    const tx = quantityTx();
    const service = serviceFor(interactiveClient(tx));

    const result = await service.adjustStock(CONTEXT, ADJUST_INPUT);

    // 13_ §22: the lock has to be taken before the read-check-write, or two
    // adjustments each read "5" and the second silently overwrites the first.
    expect(sqlTextOf(tx.$queryRaw)).toContain("FOR UPDATE");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.stockBatch.updateMany.mock.invocationCallOrder[0] ?? 0,
    );
    expect(tx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: IDS.batch,
        organizationId: IDS.organization,
        version: LOCKED_BATCH.version,
      },
      data: { quantityOnHand: 3, version: { increment: 1 } },
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledOnce();
    expect(movementData(tx.inventoryMovement.create)).toMatchObject({
      organizationId: IDS.organization,
      branchId: IDS.branch,
      actorUserId: IDS.user,
      productVariantId: IDS.variant,
      stockBatchId: IDS.batch,
      serializedUnitId: null,
      movementType: "adjustment_out",
      quantity: 2,
      referenceType: "stock_count_correction",
      reason: "Counted two fewer on the shelf.",
      fromState: null,
      toState: null,
    });
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
    const audit = auditData(tx.auditEvent.create);
    expect(audit.action).toBe("inventory.stock_adjusted");
    expect(audit.beforeSnapshot).toEqual({
      quantityOnHand: 5,
      quantityReserved: 1,
    });
    expect(audit.afterSnapshot).toEqual({
      quantityOnHand: 3,
      quantityReserved: 1,
    });
    expectNoForbiddenFields(audit.afterSnapshot);
    expect(result).toEqual({
      productVariant: {
        id: IDS.variant,
        sku: "CASE-001",
        name: "Clear silicone case",
      },
      locationId: IDS.location,
      locationName: "Main counter",
      trackingType: "quantity",
      onHand: 3,
      reserved: 1,
      available: 2,
    });
    expectNoForbiddenFields(result);
  });

  it("refuses to take stock below zero before the CHECK constraint fires", async () => {
    const tx = quantityTx({
      lockedBatches: [
        { ...LOCKED_BATCH, quantityOnHand: 1, quantityReserved: 0 },
      ],
    });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, { ...ADJUST_INPUT, quantity: 4 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK,
      details: { quantity: expect.any(Array) },
    });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("refuses to reduce stock below what is already reserved", async () => {
    const tx = quantityTx({
      lockedBatches: [
        { ...LOCKED_BATCH, quantityOnHand: 5, quantityReserved: 4 },
      ],
    });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, { ...ADJUST_INPUT, quantity: 3 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK,
    });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to reduce stock at a location that holds none", async () => {
    const tx = quantityTx({ lockedBatches: [] });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, ADJUST_INPUT),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK });
    // An outward adjustment must never conjure the row it is reducing.
    expect(tx.stockBatch.create).not.toHaveBeenCalled();
  });

  it("opens a batch for the first inward adjustment at a location", async () => {
    const tx = quantityTx({ lockedBatches: [] });
    tx.stockBatch.create.mockResolvedValue({
      id: IDS.batch,
      stockLocationId: IDS.location,
      quantityOnHand: 0,
      quantityReserved: 0,
      version: 1,
    });
    tx.stockBatch.findFirst.mockResolvedValue({
      quantityOnHand: 2,
      quantityReserved: 0,
    });
    const service = serviceFor(interactiveClient(tx));

    const result = await service.adjustStock(CONTEXT, {
      ...ADJUST_INPUT,
      movementType: "adjustment_in",
      quantity: 2,
    });

    expect(tx.stockBatch.create).toHaveBeenCalledWith({
      data: {
        organizationId: IDS.organization,
        branchId: IDS.branch,
        productVariantId: IDS.variant,
        stockLocationId: IDS.location,
      },
      select: expect.any(Object),
    });
    // Even an opening balance arrives through a movement; the row is created
    // empty and the movement is what puts stock in it.
    expect(movementData(tx.inventoryMovement.create)).toMatchObject({
      movementType: "adjustment_in",
      quantity: 2,
    });
    expect(result).toMatchObject({ onHand: 2, reserved: 0, available: 2 });
  });

  it("reports another tenant's product as missing", async () => {
    const tx = quantityTx({ variant: null });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, ADJUST_INPUT),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(tx.productVariant.findFirst).toHaveBeenCalledWith({
      where: { id: IDS.variant, organizationId: IDS.organization },
      select: { id: true, sku: true, name: true, trackingType: true },
    });
  });

  it("reports a location outside the session branch as unusable", async () => {
    const tx = quantityTx();
    tx.stockLocation.findFirst.mockResolvedValue(null);
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, ADJUST_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { stockLocationId: expect.any(Array) },
    });
    expect(tx.stockLocation.findFirst).toHaveBeenCalledWith({
      where: {
        id: IDS.location,
        organizationId: IDS.organization,
        branchId: IDS.branch,
        isActive: true,
      },
      select: { id: true },
    });
  });

  it("rejects a stale stock level rather than overwriting it", async () => {
    const tx = quantityTx({ updateCount: 0 });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.adjustStock(CONTEXT, ADJUST_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("maps the database negative-stock CHECK to a stable code", async () => {
    const tx = quantityTx();
    tx.stockBatch.updateMany.mockRejectedValue(
      new Error(
        'new row for relation "stock_batches" violates check constraint "stock_batches_quantity_on_hand_non_negative"',
      ),
    );
    const service = serviceFor(interactiveClient(tx));

    // The API checks first, but two transactions can each see enough stock and
    // only the CHECK sees the total. That race is reported, never leaked as 500.
    await expect(
      service.adjustStock(CONTEXT, ADJUST_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_NEGATIVE_STOCK_BLOCKED,
    });
  });
});

describe("InventoryService reservations", () => {
  it("reserves only what is available and writes a reserve movement", async () => {
    const tx = quantityTx({
      batchAfter: { quantityOnHand: 5, quantityReserved: 3 },
    });
    const service = serviceFor(interactiveClient(tx));

    const result = await service.reserveStock(CONTEXT, RESERVE_INPUT);

    expect(sqlTextOf(tx.$queryRaw)).toContain("FOR UPDATE");
    expect(tx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: IDS.batch,
        organizationId: IDS.organization,
        version: LOCKED_BATCH.version,
      },
      data: { quantityReserved: 3, version: { increment: 1 } },
    });
    expect(movementData(tx.inventoryMovement.create)).toMatchObject({
      movementType: "reserve",
      quantity: 2,
      reason: null,
    });
    expect(auditData(tx.auditEvent.create).action).toBe(
      "inventory.stock_reserved",
    );
    expect(result).toMatchObject({ onHand: 5, reserved: 3, available: 2 });
  });

  it("refuses to reserve more than is unreserved", async () => {
    const tx = quantityTx();
    const service = serviceFor(interactiveClient(tx));

    // 5 on hand, 1 already reserved: only 4 can be spoken for.
    await expect(
      service.reserveStock(CONTEXT, { ...RESERVE_INPUT, quantity: 5 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("blocks reserving serialized stock by quantity", async () => {
    const tx = quantityTx({ variant: SERIALIZED_VARIANT });
    const service = serviceFor(interactiveClient(tx));

    // A handset is reserved by name, never by count: picking an unnamed unit is
    // exactly how two staff members end up selling the same IMEI.
    await expect(
      service.reserveStock(CONTEXT, {
        ...RESERVE_INPUT,
        productVariantId: IDS.serializedVariant,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_DIRECT_EDIT_BLOCKED,
    });
  });

  it("releases a reservation and writes a release movement", async () => {
    const tx = quantityTx({
      batchAfter: { quantityOnHand: 5, quantityReserved: 0 },
    });
    const service = serviceFor(interactiveClient(tx));

    const result = await service.releaseStock(
      CONTEXT,
      IDS.variant,
      RELEASE_INPUT,
    );

    expect(tx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: IDS.batch,
        organizationId: IDS.organization,
        version: LOCKED_BATCH.version,
      },
      data: { quantityReserved: 0, version: { increment: 1 } },
    });
    expect(movementData(tx.inventoryMovement.create)).toMatchObject({
      movementType: "release",
      quantity: 1,
    });
    expect(auditData(tx.auditEvent.create).action).toBe(
      "inventory.stock_released",
    );
    expect(result).toMatchObject({ onHand: 5, reserved: 0, available: 5 });
  });

  it("refuses to release more than is reserved", async () => {
    const tx = quantityTx();
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.releaseStock(CONTEXT, IDS.variant, {
        ...RELEASE_INPUT,
        quantity: 4,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a release whose body disagrees with its path", async () => {
    const tx = quantityTx();
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.releaseStock(CONTEXT, IDS.serializedVariant, RELEASE_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { productVariantId: expect.any(Array) },
    });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });
});

describe("InventoryService transfers", () => {
  const LOCKED_DESTINATION = {
    id: IDS.otherBatch,
    stockLocationId: IDS.otherLocation,
    quantityOnHand: 0,
    quantityReserved: 0,
    version: 1,
  };

  it("writes both ledger rows and one audit event in one transaction", async () => {
    const tx = quantityTx({
      lockedBatches: [LOCKED_BATCH, LOCKED_DESTINATION],
    });
    const client = interactiveClient(tx);
    const service = serviceFor(client);

    const result = await service.transferStock(CONTEXT, TRANSFER_INPUT);

    expect(client.$transaction).toHaveBeenCalledOnce();
    // Both locations are locked in one statement, ordered by a value every
    // transaction agrees on, so two opposite transfers cannot deadlock.
    const sql = sqlTextOf(tx.$queryRaw);
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("ORDER BY stock_location_id");
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(movementData(tx.inventoryMovement.create, 0)).toMatchObject({
      movementType: "transfer_out",
      stockLocationId: IDS.location,
      stockBatchId: IDS.batch,
      quantity: 2,
    });
    expect(movementData(tx.inventoryMovement.create, 1)).toMatchObject({
      movementType: "transfer_in",
      stockLocationId: IDS.otherLocation,
      stockBatchId: IDS.otherBatch,
      quantity: 2,
    });
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
    const audit = auditData(tx.auditEvent.create);
    expect(audit.action).toBe("inventory.stock_transferred");
    expect(audit.beforeSnapshot).toEqual({
      from: { quantityOnHand: 5, quantityReserved: 1 },
      to: { quantityOnHand: 0, quantityReserved: 0 },
    });
    expect(audit.afterSnapshot).toEqual({
      from: { quantityOnHand: 3, quantityReserved: 1 },
      to: { quantityOnHand: 2, quantityReserved: 0 },
    });
    expect(result.items).toHaveLength(2);
    expectNoForbiddenFields(result.items[0]);
  });

  it("moves both sides with a version guard on each", async () => {
    const tx = quantityTx({
      lockedBatches: [LOCKED_BATCH, LOCKED_DESTINATION],
    });
    const service = serviceFor(interactiveClient(tx));

    await service.transferStock(CONTEXT, TRANSFER_INPUT);

    const calls = tx.stockBatch.updateMany.mock.calls.map(
      (call) => call[0] as { readonly where: object; readonly data: object },
    );
    expect(calls[0]).toEqual({
      where: { id: IDS.batch, organizationId: IDS.organization, version: 3 },
      data: { quantityOnHand: 3, version: { increment: 1 } },
    });
    expect(calls[1]).toEqual({
      where: {
        id: IDS.otherBatch,
        organizationId: IDS.organization,
        version: 1,
      },
      data: { quantityOnHand: 2, version: { increment: 1 } },
    });
  });

  it("opens the destination batch when the location holds none yet", async () => {
    const tx = quantityTx({ lockedBatches: [LOCKED_BATCH] });
    const service = serviceFor(interactiveClient(tx));

    await service.transferStock(CONTEXT, TRANSFER_INPUT);

    expect(tx.stockBatch.create).toHaveBeenCalledWith({
      data: {
        organizationId: IDS.organization,
        branchId: IDS.branch,
        productVariantId: IDS.variant,
        stockLocationId: IDS.otherLocation,
      },
      select: expect.any(Object),
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
  });

  it("refuses to transfer stock that is reserved where it stands", async () => {
    const tx = quantityTx({
      lockedBatches: [
        { ...LOCKED_BATCH, quantityOnHand: 3, quantityReserved: 2 },
        LOCKED_DESTINATION,
      ],
    });
    const service = serviceFor(interactiveClient(tx));

    // Only 1 of the 3 is unspoken for; moving the reserved 2 would break a
    // promise without telling whoever holds it.
    await expect(
      service.transferStock(CONTEXT, TRANSFER_INPUT),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("refuses a transfer out of a location that holds none", async () => {
    const tx = quantityTx({ lockedBatches: [LOCKED_DESTINATION] });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.transferStock(CONTEXT, TRANSFER_INPUT),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK });
  });

  it("blocks transferring serialized stock by quantity", async () => {
    const tx = quantityTx({ variant: SERIALIZED_VARIANT });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.transferStock(CONTEXT, {
        ...TRANSFER_INPUT,
        productVariantId: IDS.serializedVariant,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_DIRECT_EDIT_BLOCKED,
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe("InventoryService serialized state machine", () => {
  const transition = (
    service: InventoryService,
    toState: SerializedStockState,
    version = 2,
  ) =>
    service.transitionSerializedUnit(CONTEXT, IDS.unit, {
      toState,
      reason: "Damaged in the display case.",
      version,
    });

  it("locks the named handset before judging its state", async () => {
    const tx = serializedTx();
    const service = serviceFor(interactiveClient(tx));

    await transition(service, "quarantined");

    // 13_ §22: the row lock is what stops two staff members taking the same
    // IMEI — the state is only trustworthy once the row is held.
    const sql = sqlTextOf(tx.$queryRaw);
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("serialized_units");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.serializedUnit.updateMany.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("refuses a transition the lifecycle does not allow", async () => {
    const tx = serializedTx({ locked: { ...LOCKED_UNIT, state: "sold" } });
    const service = serviceFor(interactiveClient(tx));

    // 05_RULES §3: a returned unit cannot jump to available without inspection.
    await expect(transition(service, "available")).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_INVALID_STATE_TRANSITION,
      details: { toState: expect.any(Array) },
    });
    expect(tx.serializedUnit.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("lets a sold unit move only to inspection, and books it back on hand", async () => {
    const tx = serializedTx({
      locked: { ...LOCKED_UNIT, state: "sold" },
      after: { ...UNIT_RECORD, state: "returned_inspection", version: 3 },
    });
    const service = serviceFor(interactiveClient(tx));

    const result = await transition(service, "returned_inspection");

    // The handset re-enters the on-hand states, so the ledger says so — and
    // adjustment_in is the type whose published sign is true of that move.
    expect(movementData(tx.inventoryMovement.create)).toMatchObject({
      movementType: "adjustment_in",
      quantity: 1,
      serializedUnitId: IDS.unit,
      stockBatchId: null,
      fromState: "sold",
      toState: "returned_inspection",
    });
    expect(result).toMatchObject({ state: "returned_inspection" });
  });

  it("reports a sold handset as sold when someone tries to reserve it", async () => {
    const tx = serializedTx({ locked: { ...LOCKED_UNIT, state: "sold" } });
    const service = serviceFor(interactiveClient(tx));

    await expect(transition(service, "reserved")).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_UNIT_ALREADY_SOLD,
      status: 409,
    });
    expect(tx.serializedUnit.updateMany).not.toHaveBeenCalled();
  });

  it("reports a handset that is not on the shelf as unavailable to reserve", async () => {
    const tx = serializedTx({ locked: { ...LOCKED_UNIT, state: "defective" } });
    const service = serviceFor(interactiveClient(tx));

    await expect(transition(service, "reserved")).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_UNIT_NOT_AVAILABLE,
      status: 409,
    });
    expect(tx.serializedUnit.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to post a sale through an inventory transition", async () => {
    const tx = serializedTx();
    const service = serviceFor(interactiveClient(tx));

    // Selling is the sales workflow's job; a unit marked sold here would be
    // stock movement with no sale behind it.
    await expect(transition(service, "sold")).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_DIRECT_EDIT_BLOCKED,
    });
    expect(tx.serializedUnit.updateMany).not.toHaveBeenCalled();
  });

  it("writes a reserve movement when a handset is reserved", async () => {
    const tx = serializedTx({
      after: { ...UNIT_RECORD, state: "reserved", version: 3 },
    });
    const service = serviceFor(interactiveClient(tx));

    await transition(service, "reserved");

    expect(movementData(tx.inventoryMovement.create)).toMatchObject({
      movementType: "reserve",
      quantity: 1,
      fromState: "available",
      toState: "reserved",
    });
  });

  it("writes an adjustment_out when a handset leaves the on-hand states", async () => {
    const tx = serializedTx({
      after: { ...UNIT_RECORD, state: "written_off", version: 3 },
    });
    const service = serviceFor(interactiveClient(tx));

    await transition(service, "written_off");

    expect(movementData(tx.inventoryMovement.create)).toMatchObject({
      movementType: "adjustment_out",
      fromState: "available",
      toState: "written_off",
    });
  });

  it("writes no ledger row when the quantity on hand does not change", async () => {
    const tx = serializedTx({
      after: { ...UNIT_RECORD, state: "quarantined", version: 3 },
    });
    const service = serviceFor(interactiveClient(tx));

    await transition(service, "quarantined");

    // available and quarantined are both on hand, so nothing moved. Inventing a
    // signed ledger row here would make a later replay of the ledger disagree
    // with the stock it describes; the audit event is the record of the change.
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
    const audit = auditData(tx.auditEvent.create);
    expect(audit.action).toBe("inventory.unit_transitioned");
    expect(audit.beforeSnapshot).toMatchObject({ state: "available" });
    expect(audit.afterSnapshot).toMatchObject({ state: "quarantined" });
  });

  it("audits which handset moved, and never its cost", async () => {
    const tx = serializedTx({
      after: { ...UNIT_RECORD, state: "written_off", version: 3 },
    });
    const service = serviceFor(interactiveClient(tx));

    await transition(service, "written_off");

    const audit = auditData(tx.auditEvent.create);
    expect(audit.entityType).toBe("serialized_unit");
    // The point of auditing a handset is being able to say WHICH handset.
    expect(audit.afterSnapshot).toMatchObject({
      identifiers: ["356938035643809"],
    });
    expectNoForbiddenFields(audit.beforeSnapshot);
    expectNoForbiddenFields(audit.afterSnapshot);
  });

  it("reports another tenant's handset as missing", async () => {
    const tx = serializedTx();
    tx.$queryRaw.mockResolvedValue([]);
    const service = serviceFor(interactiveClient(tx));

    await expect(transition(service, "quarantined")).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
    });
    const values = tx.$queryRaw.mock.calls[0] as readonly unknown[];
    expect(values).toContain(IDS.organization);
    expect(values).toContain(IDS.branch);
  });

  it("rejects a stale handset edit without writing a movement or audit", async () => {
    const tx = serializedTx({ updateCount: 0 });
    const service = serviceFor(interactiveClient(tx));

    await expect(transition(service, "quarantined", 1)).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    expect(tx.serializedUnit.updateMany).toHaveBeenCalledWith({
      where: { id: IDS.unit, organizationId: IDS.organization, version: 1 },
      data: { state: "quarantined", version: { increment: 1 } },
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});

describe("InventoryService serialized transfers", () => {
  const transfer = (service: InventoryService, version = 2) =>
    service.transferSerializedUnit(CONTEXT, IDS.unit, {
      toStockLocationId: IDS.otherLocation,
      reason: "Moved to the back counter.",
      version,
    });

  it("writes transfer_out and transfer_in for one handset in one transaction", async () => {
    const tx = serializedTx();
    const client = interactiveClient(tx);
    const service = serviceFor(client);

    await transfer(service);

    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(sqlTextOf(tx.$queryRaw)).toContain("FOR UPDATE");
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(movementData(tx.inventoryMovement.create, 0)).toMatchObject({
      movementType: "transfer_out",
      stockLocationId: IDS.location,
      serializedUnitId: IDS.unit,
      quantity: 1,
      // The move does not touch the lifecycle, so both ends carry the same state.
      fromState: "available",
      toState: "available",
    });
    expect(movementData(tx.inventoryMovement.create, 1)).toMatchObject({
      movementType: "transfer_in",
      stockLocationId: IDS.otherLocation,
      quantity: 1,
    });
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
    expect(auditData(tx.auditEvent.create).action).toBe(
      "inventory.unit_transferred",
    );
  });

  it("refuses to move a sold handset", async () => {
    const tx = serializedTx({ locked: { ...LOCKED_UNIT, state: "sold" } });
    const service = serviceFor(interactiveClient(tx));

    await expect(transfer(service)).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_UNIT_ALREADY_SOLD,
      status: 409,
    });
    expect(tx.serializedUnit.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to move a handset that is not in stock", async () => {
    const tx = serializedTx({
      locked: { ...LOCKED_UNIT, state: "supplier_warranty" },
    });
    const service = serviceFor(interactiveClient(tx));

    await expect(transfer(service)).rejects.toMatchObject({
      code: ERROR_CODES.INVENTORY_UNIT_NOT_AVAILABLE,
    });
  });

  it("refuses a move to the location the handset already sits in", async () => {
    const tx = serializedTx({
      locked: { ...LOCKED_UNIT, stockLocationId: IDS.otherLocation },
    });
    const service = serviceFor(interactiveClient(tx));

    await expect(transfer(service)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { toStockLocationId: expect.any(Array) },
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe("InventoryService serialized reads", () => {
  it("returns a handset with its identifiers and no cost", async () => {
    const findFirst = vi.fn().mockResolvedValue(UNIT_RECORD);
    const service = serviceFor({ serializedUnit: { findFirst } });

    const result = await service.getSerializedUnit(IDS.organization, IDS.unit);

    expect(result).toMatchObject({
      id: IDS.unit,
      state: "available",
      version: 2,
      identifiers: [{ type: "imei", value: "356938035643809" }],
      productVariant: { id: IDS.serializedVariant, sku: "PHONE-001" },
      stockLocation: { id: IDS.location, code: "MAIN" },
    });
    expectNoForbiddenFields(result);
    const select = (
      findFirst.mock.calls[0]?.[0] as {
        readonly select: Readonly<Record<string, unknown>>;
        readonly where: Readonly<Record<string, unknown>>;
      }
    ).select;
    // Cost is absent by construction: the columns are never selected, so they
    // cannot reach a response or an audit snapshot built from one.
    expect(select).not.toHaveProperty("actualCostMinor");
    expect(select).not.toHaveProperty("landedCostMinor");
    expect(select).not.toHaveProperty("organizationId");
  });

  it("reports another tenant's handset as missing", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = serviceFor({ serializedUnit: { findFirst } });

    await expect(
      service.getSerializedUnit(IDS.organization, IDS.missing),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: IDS.missing, organizationId: IDS.organization },
      }),
    );
  });

  it("normalizes an IMEI search the same way the stored value was normalized", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      serializedUnit: { count: vi.fn().mockResolvedValue(0), findMany },
      $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = serviceFor(client);

    await service.listSerializedUnits(IDS.organization, {
      page: 1,
      pageSize: 25,
      q: "356938-035643809",
    });

    const where = (
      findMany.mock.calls[0]?.[0] as {
        readonly where: { readonly OR: readonly Record<string, unknown>[] };
      }
    ).where;
    expect(where).toMatchObject({ organizationId: IDS.organization });
    // Staff paste values with hyphens; the stored value has none.
    expect(where.OR[0]).toEqual({
      identifiers: {
        some: { normalizedValue: { contains: "356938035643809" } },
      },
    });
  });

  it("refuses to list another tenant's handset movements", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = serviceFor({ serializedUnit: { findFirst } });

    // An empty page would itself confirm the id exists somewhere.
    await expect(
      service.listSerializedUnitMovements(IDS.organization, IDS.missing, {
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
  });

  it("pins a handset's movement list to the unit named in the path", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      serializedUnit: {
        findFirst: vi.fn().mockResolvedValue({ id: IDS.unit }),
      },
      inventoryMovement: { count: vi.fn().mockResolvedValue(0), findMany },
      $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = serviceFor(client);

    await service.listSerializedUnitMovements(IDS.organization, IDS.unit, {
      page: 1,
      pageSize: 25,
      // A query string must not be able to widen the result past the path.
      serializedUnitId: IDS.missing,
    });

    const args = findMany.mock.calls[0]?.[0] as {
      readonly where: Record<string, unknown>;
      readonly select: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({
      organizationId: IDS.organization,
      serializedUnitId: IDS.unit,
    });
    // The movement contract has no actor field, so the column is never read.
    expect(args.select).not.toHaveProperty("actorUserId");
  });
});

describe("InventoryService bulk IMEI validation", () => {
  const service = serviceFor({});

  it("accepts a well-formed IMEI and reports its normalized value", () => {
    const result = service.validateBulkImei(
      BulkImeiValidationInputSchema.parse({
        identifiers: [" 356938-035643809 "],
      }),
    );

    expect(result).toEqual({
      rows: [
        {
          index: 0,
          normalized: "356938035643809",
          status: "valid",
          code: null,
          duplicateOfIndex: null,
        },
      ],
      validCount: 1,
      invalidCount: 0,
      duplicateCount: 0,
    });
  });

  it("rejects an IMEI whose Luhn check digit is wrong", () => {
    const result = service.validateBulkImei(
      BulkImeiValidationInputSchema.parse({
        identifiers: ["356938035643801"],
      }),
    );

    expect(result.rows[0]).toMatchObject({
      status: "invalid",
      code: "CHECKSUM_FAILED",
    });
    expect(result.invalidCount).toBe(1);
  });

  it.each([
    { identifier: "", code: "EMPTY" },
    { identifier: "12345", code: "BAD_LENGTH" },
    { identifier: "111111111111111", code: "ALL_SAME_DIGIT" },
    { identifier: "35693803564380X", code: "NON_DIGIT" },
  ])("rejects $identifier as $code", ({ identifier, code }) => {
    const result = service.validateBulkImei(
      BulkImeiValidationInputSchema.parse({ identifiers: [identifier] }),
    );

    expect(result.rows[0]).toMatchObject({ status: "invalid", code });
  });

  it("points a repeated row at the row it repeats", () => {
    const result = service.validateBulkImei(
      BulkImeiValidationInputSchema.parse({
        identifiers: ["356938035643809", "356938 035643809"],
      }),
    );

    expect(result.rows[1]).toMatchObject({
      index: 1,
      status: "duplicate_in_request",
      duplicateOfIndex: 0,
      normalized: "356938035643809",
    });
    expect(result.duplicateCount).toBe(1);
    expect(result.validCount).toBe(1);
  });

  it("counts every verdict in one pasted column", () => {
    const result = service.validateBulkImei(
      BulkImeiValidationInputSchema.parse({
        identifiers: [
          "356938035643809",
          "356938035643809",
          "356938035643801",
          "490154203237518",
        ],
      }),
    );

    expect(result).toMatchObject({
      validCount: 2,
      invalidCount: 1,
      duplicateCount: 1,
    });
  });

  it("writes nothing: validation never touches the database", () => {
    const client = {
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
      serializedUnit: { findMany: vi.fn() },
      deviceIdentifier: { findMany: vi.fn(), create: vi.fn() },
    };
    const isolated = serviceFor(client);

    isolated.validateBulkImei(
      BulkImeiValidationInputSchema.parse({ identifiers: ["356938035643809"] }),
    );

    expect(client.$transaction).not.toHaveBeenCalled();
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.deviceIdentifier.create).not.toHaveBeenCalled();
  });

  it("caps a pasted column at the contract limit", () => {
    const tooMany = Array.from({ length: 501 }, () => "356938035643809");

    expect(() =>
      BulkImeiValidationInputSchema.parse({ identifiers: tooMany }),
    ).toThrow();
  });
});

describe("InventoryService stock locations", () => {
  const LOCATION_ROW = {
    id: IDS.location,
    name: "Main counter",
    code: "MAIN",
    kind: "store" as const,
    isActive: true,
    version: 1,
  };

  it("creates a location in the session branch, never a client-named one", async () => {
    const tx = {
      stockLocation: { create: vi.fn().mockResolvedValue(LOCATION_ROW) },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    const result = await service.createStockLocation(CONTEXT, {
      name: "Main counter",
      code: "MAIN",
      locationType: "store",
    });

    const data = (
      tx.stockLocation.create.mock.calls[0]?.[0] as {
        readonly data: Record<string, unknown>;
      }
    ).data;
    expect(data).toMatchObject({
      organizationId: IDS.organization,
      branchId: IDS.branch,
      kind: "store",
    });
    expect(auditData(tx.auditEvent.create).action).toBe(
      "inventory.location_created",
    );
    expect(result).toEqual({
      id: IDS.location,
      name: "Main counter",
      code: "MAIN",
      locationType: "store",
      isActive: true,
      version: 1,
    });
    expectNoForbiddenFields(result);
  });

  it("rejects a stale location edit and reports a duplicate code as a conflict", async () => {
    const stale = {
      stockLocation: {
        findFirst: vi.fn().mockResolvedValue(LOCATION_ROW),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditEvent: { create: vi.fn() },
    };
    const duplicate = {
      stockLocation: {
        findFirst: vi.fn().mockResolvedValue(LOCATION_ROW),
        updateMany: vi.fn().mockRejectedValue({
          code: "P2002",
          meta: { target: ["organization_id", "branch_id", "code"] },
        }),
      },
      auditEvent: { create: vi.fn() },
    };

    await expect(
      serviceFor(interactiveClient(stale)).updateStockLocation(
        CONTEXT,
        IDS.location,
        { name: "Main", code: "MAIN", locationType: "store", version: 9 },
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    expect(stale.auditEvent.create).not.toHaveBeenCalled();

    await expect(
      serviceFor(interactiveClient(duplicate)).updateStockLocation(
        CONTEXT,
        IDS.location,
        { name: "Main", code: "MAIN", locationType: "store", version: 1 },
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
      status: 409,
      details: { code: expect.any(Array) },
    });
  });

  it("reports another tenant's location as missing, scoped by organization", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { stockLocation: { findFirst, updateMany: vi.fn() } };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.deactivateStockLocation(CONTEXT, IDS.location, { version: 1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: IDS.location, organizationId: IDS.organization },
      }),
    );
    expect(tx.stockLocation.updateMany).not.toHaveBeenCalled();
  });

  it("carries version through the location list and filters by tenant", async () => {
    const findMany = vi.fn().mockResolvedValue([LOCATION_ROW]);
    const client = {
      stockLocation: { count: vi.fn().mockResolvedValue(1), findMany },
      $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = serviceFor(client);

    const result = await service.listStockLocations(IDS.organization, {
      page: 1,
      pageSize: 25,
      locationType: "store",
      active: true,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: IDS.organization,
          isActive: true,
          kind: "store",
        },
      }),
    );
    expect(result.items[0]).toMatchObject({
      version: 1,
      locationType: "store",
    });
    expectNoForbiddenFields(result.items[0]);
  });
});
