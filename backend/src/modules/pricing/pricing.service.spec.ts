import { ERROR_CODES, PosSellableLookupQuerySchema } from "@mobileshop/shared";
import { describe, expect, it, vi, type Mock } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { PricingService, type PricingActorContext } from "./pricing.service";

const IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  user: "10000000-0000-4000-8000-000000000009",
  branch: "10000000-0000-4000-8000-000000000002",
  otherBranch: "10000000-0000-4000-8000-000000000003",
  quantityVariant: "20000000-0000-4000-8000-000000000001",
  serializedVariant: "20000000-0000-4000-8000-000000000002",
  location: "30000000-0000-4000-8000-000000000001",
  otherLocation: "30000000-0000-4000-8000-000000000002",
  unit: "40000000-0000-4000-8000-000000000001",
  priceEntry: "50000000-0000-4000-8000-000000000001",
});

const CONTEXT: PricingActorContext = {
  organizationId: IDS.organization,
  branchId: IDS.branch,
  currency: "PKR",
  actorUserId: IDS.user,
  metadata: {
    requestId: "request-pricing-test",
    ipAddress: "127.0.0.1",
    userAgent: "pricing-test",
  },
  allowedLocationIds: null,
};

const DEFAULT_PRICE_ROW = {
  productVariantId: IDS.quantityVariant,
  sku: "CASE-001",
  name: "Clear silicone case",
  brandName: "Generic",
  modelName: "Case",
  categoryName: "Accessories",
  trackingType: "quantity" as const,
  condition: "new" as const,
  ptaStatus: "not_applicable" as const,
  productVersion: 4,
  unitPriceMinor: 250_000n,
  minimumUnitPriceMinor: 200_000n,
  priceSource: "variant_default" as const,
  priceSourceId: null,
  priceVersion: 4,
  priceEffectiveAt: new Date("2026-07-16T09:00:00.000Z"),
  hasSaleableStock: false,
  // Wide-row pollution must never be copied into a public pricing response.
  actualCostMinor: 100_000n,
  landedCostMinor: 120_000n,
};

const RULE_PRICE_ROW = {
  productVariantId: IDS.serializedVariant,
  sku: "PHONE-001",
  name: "Generic smartphone 8/256",
  brandName: "Generic",
  modelName: "Smartphone",
  categoryName: "Phones",
  trackingType: "serialized" as const,
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
  productVersion: 7,
  unitPriceMinor: 8_500_000n,
  minimumUnitPriceMinor: 8_000_000n,
  priceSource: "price_rule" as const,
  priceSourceId: IDS.priceEntry,
  priceVersion: 1,
  priceEffectiveAt: new Date("2026-07-16T08:00:00.000Z"),
  hasSaleableStock: true,
};

function serviceFor(client: object): PricingService {
  return new PricingService({ client } as unknown as PrismaService);
}

function mutationClient<T extends object>(tx: T) {
  return {
    $transaction: vi.fn(
      async (operation: (transaction: T) => Promise<unknown>) => operation(tx),
    ),
  };
}

function readClient(
  rows: readonly unknown[],
  options: {
    readonly total?: number;
    readonly quantityRows?: readonly unknown[];
    readonly serializedRows?: readonly unknown[];
  } = {},
) {
  const $queryRaw = vi
    .fn()
    .mockResolvedValueOnce([{ total: options.total ?? rows.length }])
    .mockResolvedValueOnce(rows);
  if (
    rows.some(
      (row) => (row as { trackingType?: string }).trackingType === "quantity",
    )
  ) {
    $queryRaw.mockResolvedValueOnce(options.quantityRows ?? []);
  }
  if (
    rows.some(
      (row) => (row as { trackingType?: string }).trackingType === "serialized",
    )
  ) {
    $queryRaw.mockResolvedValueOnce(options.serializedRows ?? []);
  }
  return {
    $queryRaw,
    $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
}

function sqlTextOf(mock: Mock, call: number): string {
  const sql = (
    mock.mock.calls[call]?.[0] as { readonly sql?: unknown } | undefined
  )?.sql;
  return typeof sql === "string" ? sql : "";
}

function sqlValuesOf(mock: Mock, call: number): readonly unknown[] {
  const values = (
    mock.mock.calls[call]?.[0] as { readonly values?: unknown } | undefined
  )?.values;
  return Array.isArray(values) ? values : [];
}

describe("PricingService POS lookup", () => {
  it("keeps a priced out-of-stock product in the page", async () => {
    const client = readClient([DEFAULT_PRICE_ROW]);
    const service = serviceFor(client);

    const result = await service.posLookup(
      CONTEXT,
      PosSellableLookupQuerySchema.parse({ page: 1, pageSize: 25 }),
    );

    expect(result).toEqual({
      items: [
        {
          productVariantId: IDS.quantityVariant,
          sku: "CASE-001",
          name: "Clear silicone case",
          brandName: "Generic",
          modelName: "Case",
          categoryName: "Accessories",
          trackingType: "quantity",
          condition: "new",
          ptaStatus: "not_applicable",
          productVersion: 4,
          effectivePrice: {
            currency: "PKR",
            unitPriceMinor: 250_000,
            minimumUnitPriceMinor: 200_000,
            source: "variant_default",
            sourceId: null,
            version: 4,
            effectiveAt: "2026-07-16T09:00:00.000Z",
          },
          stock: { availability: "out_of_stock" },
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    expect(JSON.stringify(result)).not.toContain("Cost");

    for (let call = 0; call < client.$queryRaw.mock.calls.length; call += 1) {
      const sql = sqlTextOf(client.$queryRaw, call);
      expect(sql).not.toContain("actual_cost_minor");
      expect(sql).not.toContain("landed_cost_minor");
    }
  });

  it("resolves current-branch rules before org rules, then falls back to the variant default", async () => {
    const client = readClient([RULE_PRICE_ROW, DEFAULT_PRICE_ROW]);
    const service = serviceFor(client);

    const result = await service.posLookup(CONTEXT, {
      page: 1,
      pageSize: 25,
    });

    const sql = sqlTextOf(client.$queryRaw, 1);
    expect(sql).toContain("entry.branch_id");
    expect(sql).toContain("entry.branch_id IS NULL");
    expect(sql).toContain("CASE WHEN entry.branch_id");
    expect(sql).toContain("THEN 0 ELSE 1 END ASC");
    expect(sql).toContain(
      "rule.id IS NOT NULL OR v.default_price_minor IS NOT NULL",
    );
    expect(sql).toContain("list.is_active = TRUE");
    expect(sql).toContain("entry.effective_from <=");
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productVariantId: IDS.serializedVariant,
          effectivePrice: {
            currency: "PKR",
            unitPriceMinor: 8_500_000,
            minimumUnitPriceMinor: 8_000_000,
            source: "price_rule",
            sourceId: IDS.priceEntry,
            version: 1,
            effectiveAt: "2026-07-16T08:00:00.000Z",
          },
        }),
        expect.objectContaining({
          productVariantId: IDS.quantityVariant,
          effectivePrice: expect.objectContaining({
            source: "variant_default",
            sourceId: null,
            version: 4,
          }),
        }),
      ]),
    );
  });

  it("returns scoped quantity choices with only available stock", async () => {
    const client = readClient([DEFAULT_PRICE_ROW], {
      quantityRows: [
        {
          productVariantId: IDS.quantityVariant,
          stockLocationId: IDS.location,
          locationCode: "MAIN",
          locationName: "Main counter",
          availableQuantity: 4,
          stockVersion: 3,
        },
      ],
    });
    const service = serviceFor(client);

    const result = await service.posLookup(
      { ...CONTEXT, allowedLocationIds: [IDS.location] },
      { page: 1, pageSize: 25 },
    );

    expect(result.items[0]).toMatchObject({
      stock: {
        availability: "saleable",
        locationChoices: [
          {
            location: {
              id: IDS.location,
              code: "MAIN",
              name: "Main counter",
            },
            availableQuantity: 4,
            stockVersion: 3,
          },
        ],
      },
    });
    const sql = sqlTextOf(client.$queryRaw, 2);
    const values = sqlValuesOf(client.$queryRaw, 2);
    expect(sql).toContain("batch.organization_id");
    expect(sql).toContain("batch.branch_id");
    expect(sql).toContain("batch.stock_location_id");
    expect(sql).toContain("quantity_on_hand - batch.quantity_reserved > 0");
    expect(values).toContain(IDS.organization);
    expect(values).toContain(IDS.branch);
    expect(values).toContain(IDS.location);
    expect(values).not.toContain(IDS.otherLocation);
  });

  it("turns an empty allowed-location scope into OOS without leaking other stock", async () => {
    const client = readClient([DEFAULT_PRICE_ROW]);
    const service = serviceFor(client);

    const result = await service.posLookup(
      { ...CONTEXT, allowedLocationIds: [] },
      { page: 1, pageSize: 25 },
    );

    expect(result.items[0]).toMatchObject({
      stock: { availability: "out_of_stock" },
    });
    expect(sqlTextOf(client.$queryRaw, 1)).toContain("FALSE");
    expect(sqlTextOf(client.$queryRaw, 2)).toContain("FALSE");
  });

  it("rejects an explicitly requested location outside the authenticated scope before querying products", async () => {
    const $queryRaw = vi.fn();
    const findFirst = vi.fn();
    const service = serviceFor({
      $queryRaw,
      stockLocation: { findFirst },
    });

    await expect(
      service.posLookup(
        { ...CONTEXT, allowedLocationIds: [IDS.location] },
        {
          page: 1,
          pageSize: 25,
          locationId: IDS.otherLocation,
        },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).not.toHaveBeenCalled();
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it("reports a requested cross-branch location as missing", async () => {
    const $queryRaw = vi.fn();
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = serviceFor({
      $queryRaw,
      stockLocation: { findFirst },
    });

    await expect(
      service.posLookup(CONTEXT, {
        page: 1,
        pageSize: 25,
        locationId: IDS.otherLocation,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: IDS.otherLocation,
        organizationId: IDS.organization,
        branchId: IDS.branch,
        isActive: true,
      },
      select: { id: true },
    });
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it("returns only real serialized-unit identifiers from scoped available units", async () => {
    const client = readClient([RULE_PRICE_ROW], {
      serializedRows: [
        {
          productVariantId: IDS.serializedVariant,
          serializedUnitId: IDS.unit,
          unitVersion: 2,
          stockLocationId: IDS.location,
          locationCode: "MAIN",
          locationName: "Main counter",
          condition: "new",
          ptaStatus: "pta_approved",
          identifiers: [
            { type: "imei", value: "356938035643809" },
            { type: "serial", value: "SNABC123" },
          ],
        },
      ],
    });
    const service = serviceFor(client);

    const result = await service.posLookup(
      { ...CONTEXT, allowedLocationIds: [IDS.location] },
      { page: 1, pageSize: 25, q: "356938-035643809" },
    );

    expect(result.items[0]).toMatchObject({
      stock: {
        availability: "saleable",
        serializedUnitChoices: [
          {
            serializedUnitId: IDS.unit,
            identifiers: [
              { type: "imei", value: "356938035643809" },
              { type: "serial", value: "SNABC123" },
            ],
          },
        ],
      },
    });
    const productSql = sqlTextOf(client.$queryRaw, 1);
    const unitSql = sqlTextOf(client.$queryRaw, 2);
    expect(productSql).toContain("search_unit.branch_id");
    expect(productSql).toContain("search_identifier.normalized_value");
    expect(unitSql).toContain("unit.state::text = 'available'");
    expect(unitSql).toContain("JOIN device_identifiers identifier");
    expect(unitSql).not.toContain("actual_cost_minor");
    expect(unitSql).not.toContain("landed_cost_minor");
  });
});

describe("PricingService default-price management", () => {
  const before = {
    id: IDS.quantityVariant,
    defaultPriceMinor: null,
    minPriceMinor: null,
    version: 4,
    updatedAt: new Date("2026-07-16T09:00:00.000Z"),
  };
  const after = {
    id: IDS.quantityVariant,
    defaultPriceMinor: 250_000n,
    minPriceMinor: 200_000n,
    version: 5,
    updatedAt: new Date("2026-07-16T10:00:00.000Z"),
  };

  it("writes an organization-scoped optimistic price and safe audit atomically", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createAudit = vi.fn().mockResolvedValue({ id: "audit-id" });
    const client = mutationClient({
      productVariant: { findFirst, updateMany },
      auditEvent: { create: createAudit },
    });
    const service = serviceFor(client);

    await expect(
      service.setVariantDefaultPrice(CONTEXT, IDS.quantityVariant, {
        unitPriceMinor: 250_000,
        minimumUnitPriceMinor: 200_000,
        productVersion: 4,
      }),
    ).resolves.toEqual({
      productVariantId: IDS.quantityVariant,
      effectivePrice: {
        currency: "PKR",
        unitPriceMinor: 250_000,
        minimumUnitPriceMinor: 200_000,
        source: "variant_default",
        sourceId: null,
        version: 5,
        effectiveAt: "2026-07-16T10:00:00.000Z",
      },
    });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: IDS.quantityVariant,
        organizationId: IDS.organization,
      },
      select: {
        id: true,
        defaultPriceMinor: true,
        minPriceMinor: true,
        version: true,
        updatedAt: true,
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: IDS.quantityVariant,
        organizationId: IDS.organization,
        version: 4,
      },
      data: {
        defaultPriceMinor: 250_000n,
        minPriceMinor: 200_000n,
        version: { increment: 1 },
      },
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: {
        organizationId: IDS.organization,
        branchId: IDS.branch,
        actorUserId: IDS.user,
        action: "pricing.variant_default_price_set",
        entityType: "product_variant",
        entityId: IDS.quantityVariant,
        beforeSnapshot: {
          unitPriceMinor: null,
          minimumUnitPriceMinor: null,
          productVersion: 4,
        },
        afterSnapshot: {
          unitPriceMinor: 250_000,
          minimumUnitPriceMinor: 200_000,
          productVersion: 5,
        },
        requestId: "request-pricing-test",
        ipAddress: "127.0.0.1",
        userAgent: "pricing-test",
      },
    });
    expect(JSON.stringify(createAudit.mock.calls[0])).not.toMatch(/cost/iu);
    expect(JSON.stringify(findFirst.mock.calls[0])).not.toMatch(/cost/iu);
  });

  it("rejects a stale product version before reading back or auditing", async () => {
    const findFirst = vi.fn().mockResolvedValue(before);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const createAudit = vi.fn();
    const service = serviceFor(
      mutationClient({
        productVariant: { findFirst, updateMany },
        auditEvent: { create: createAudit },
      }),
    );

    await expect(
      service.setVariantDefaultPrice(CONTEXT, IDS.quantityVariant, {
        unitPriceMinor: 250_000,
        minimumUnitPriceMinor: 200_000,
        productVersion: 3,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(createAudit).not.toHaveBeenCalled();
  });

  it("does not reveal or update a product from another organization", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const updateMany = vi.fn();
    const createAudit = vi.fn();
    const service = serviceFor(
      mutationClient({
        productVariant: { findFirst, updateMany },
        auditEvent: { create: createAudit },
      }),
    );

    await expect(
      service.setVariantDefaultPrice(CONTEXT, IDS.quantityVariant, {
        unitPriceMinor: 250_000,
        minimumUnitPriceMinor: 200_000,
        productVersion: 4,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: IDS.quantityVariant,
          organizationId: IDS.organization,
        },
      }),
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(createAudit).not.toHaveBeenCalled();
  });
});
