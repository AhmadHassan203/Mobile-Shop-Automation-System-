import {
  CreateDemandRequestInputSchema,
  PERMISSIONS,
  UpdateDemandRequestInputSchema,
  type CreateDemandRequestData,
  type DemandAvailabilitySnapshot,
} from "@mobileshop/shared";
import { describe, expect, it, vi, type Mock } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { DemandService, type DemandActorContext } from "./demand.service";

const IDS = {
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  actor: "10000000-0000-4000-8000-000000000003",
  demand: "10000000-0000-4000-8000-000000000004",
  item: "10000000-0000-4000-8000-000000000005",
  product: "10000000-0000-4000-8000-000000000006",
  otherProduct: "10000000-0000-4000-8000-00000000000a",
  model: "10000000-0000-4000-8000-000000000007",
  customer: "10000000-0000-4000-8000-000000000008",
  followUp: "10000000-0000-4000-8000-000000000009",
  location: "20000000-0000-4000-8000-000000000001",
  otherLocation: "20000000-0000-4000-8000-000000000002",
  sale: "30000000-0000-4000-8000-000000000001",
  sequence: "40000000-0000-4000-8000-000000000001",
} as const;

const context: DemandActorContext = {
  organizationId: IDS.organization,
  branchId: IDS.branch,
  actorUserId: IDS.actor,
  actorFullName: "Demand User",
  allowedLocationIds: [IDS.location],
  permissions: [
    PERMISSIONS.DEMAND_VIEW,
    PERMISSIONS.DEMAND_CREATE,
    PERMISSIONS.DEMAND_MANAGE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.PRICING_VIEW,
  ],
  metadata: {
    requestId: "request-demand-test",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  },
};

const now = new Date("2026-07-16T10:00:00.000Z");
const product = {
  id: IDS.product,
  sku: "PHONE-001",
  name: "Phone 8/256 · Green",
  trackingType: "quantity",
  productModelId: IDS.model,
  isActive: true,
  defaultPriceMinor: 200_000n,
  productModel: {
    isActive: true,
    brand: { isActive: true },
    category: { isActive: true },
  },
} as const;

const record = {
  id: IDS.demand,
  organizationId: IDS.organization,
  branchId: IDS.branch,
  requestNumber: "DM-000001",
  customerId: IDS.customer,
  customerName: "Ayesha Khan",
  contactPhoneE164: "+923001234567",
  quantity: 1,
  budgetMinMinor: 200_000n,
  budgetMaxMinor: 300_000n,
  ptaPreference: "pta_only",
  urgency: "within_week",
  channel: "walk_in",
  status: "new",
  outcome: "unknown",
  availabilityState: "available",
  availabilityUnknownReason: null,
  availableQuantitySnapshot: 4,
  availabilityCheckedAt: now,
  unitPriceMinorSnapshot: 250_000n,
  followUpOn: new Date("2026-07-20T00:00:00.000Z"),
  consentToContact: true,
  tradeInInterest: false,
  note: "Prefers green.",
  lostSaleReason: null,
  dedupeGroupId: null,
  convertedTargetType: null,
  convertedTargetId: null,
  convertedAt: null,
  salespersonUserId: IDS.actor,
  version: 2,
  createdAt: now,
  updatedAt: now,
  customer: { id: IDS.customer, fullName: "Ayesha Khan", isActive: true },
  salesperson: { id: IDS.actor, fullName: "Demand User" },
  items: [
    {
      id: IDS.item,
      organizationId: IDS.organization,
      branchId: IDS.branch,
      demandRequestId: IDS.demand,
      lineNumber: 1,
      rawRequestText: "Phone 8/256, green",
      matchedProductVariantId: IDS.product,
      matchedProductModelId: IDS.model,
      desiredBrand: null,
      desiredModel: null,
      desiredVariant: "8/256 · Green",
      desiredRam: "8 GB",
      desiredStorage: "256 GB",
      desiredColor: "Green",
      conditionPreference: "new",
      createdAt: now,
      updatedAt: now,
      matchedProductVariant: {
        id: IDS.product,
        sku: product.sku,
        name: product.name,
        productModelId: IDS.model,
        isActive: true,
      },
    },
  ],
  followUps: [
    {
      id: IDS.followUp,
      organizationId: IDS.organization,
      branchId: IDS.branch,
      demandRequestId: IDS.demand,
      occurredAt: now,
      channel: "phone",
      result: "reached",
      note: "Customer remains interested.",
      nextFollowUpOn: new Date("2026-07-20T00:00:00.000Z"),
      actorUserId: IDS.actor,
      createdAt: now,
      actor: { id: IDS.actor, fullName: "Demand User" },
    },
  ],
} as const;

function serviceFor(client: object): DemandService {
  return new DemandService({ client } as unknown as PrismaService);
}

function transactionClient<T extends object>(tx: T) {
  return {
    $transaction: vi.fn(
      async (operation: (transaction: T) => Promise<unknown>) => operation(tx),
    ),
  };
}

function sqlTextOf(mock: Mock, call: number): string {
  const first: unknown = mock.mock.calls[call]?.[0];
  if (Array.isArray(first)) return first.join(" ? ");
  const sql = (first as { readonly sql?: unknown } | undefined)?.sql;
  return typeof sql === "string" ? sql : "";
}

describe("DemandService", () => {
  it("overrides malicious submitted stock and price with scoped server truth", async () => {
    const tx = {
      productVariant: { findFirst: vi.fn().mockResolvedValue(product) },
      stockBatch: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ quantityOnHand: 5, quantityReserved: 1 }]),
      },
      serializedUnit: { count: vi.fn() },
      priceEntry: {
        findFirst: vi.fn().mockResolvedValue({ priceMinor: 250_000n }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: IDS.sequence,
          prefix: "DM-",
          nextValue: 1,
          padding: 6,
          periodKey: null,
        },
      ]),
      numberSequence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      demandRequest: {
        create: vi.fn().mockResolvedValue({ id: IDS.demand }),
        findFirst: vi.fn().mockResolvedValue(record),
      },
      demandRequestItem: {
        create: vi.fn().mockResolvedValue({ id: IDS.item }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = serviceFor(transactionClient(tx));
    const input = CreateDemandRequestInputSchema.parse({
      item: {
        match: "matched",
        rawRequestText: "Phone 8/256, green",
        productVariantId: IDS.product,
        desiredBrand: null,
        desiredModel: null,
        desiredVariant: "8/256 · Green",
        desiredRam: "8 GB",
        desiredStorage: "256 GB",
        desiredColor: "Green",
        conditionPreference: "new",
      },
      customerId: null,
      customerName: null,
      customerPhone: null,
      consentToContact: false,
      quantity: 1,
      budget: { minimumMinor: 200_000, maximumMinor: 300_000 },
      ptaPreference: "pta_only",
      urgency: "within_week",
      channel: "walk_in",
      tradeInInterest: false,
      followUpOn: null,
      note: null,
      availabilitySnapshot: {
        state: "unavailable",
        checkedAt: "2026-07-01T00:00:00.000Z",
        availableQuantity: 0,
        unitPriceMinor: 9_999_999,
      },
    });

    const result = await service.create(context, input);

    expect(result.availabilitySnapshot).toMatchObject({
      state: "available",
      availableQuantity: 4,
      unitPriceMinor: 250_000,
    });
    expect(tx.demandRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        availabilityState: "available",
        availableQuantitySnapshot: 4,
        unitPriceMinorSnapshot: 250_000n,
      }),
    });
    expect(tx.stockBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: IDS.organization,
          branchId: IDS.branch,
          stockLocationId: { in: [IDS.location] },
        }),
      }),
    );
  });

  it("structurally redacts customer identity and follow-up history without customers.view", async () => {
    const client = {
      demandRequest: { findFirst: vi.fn().mockResolvedValue(record) },
    };
    const result = await serviceFor(client).detail(
      {
        ...context,
        permissions: [PERMISSIONS.DEMAND_VIEW],
      },
      IDS.demand,
    );

    expect(result.contact).toEqual({
      customerId: null,
      customerName: null,
      customerPhone: null,
      consentToContact: false,
    });
    expect(result.followUps).toEqual([]);
    expect(result.item).toMatchObject({
      match: "matched",
      productVariant: { id: IDS.product },
    });
    expect(client.demandRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: IDS.demand,
          organizationId: IDS.organization,
          branchId: IDS.branch,
        },
      }),
    );
  });

  it("rejects a stale replace before mutating the item or customer match", async () => {
    const tx = {
      demandRequest: { findFirst: vi.fn().mockResolvedValue(record) },
    };
    const input = UpdateDemandRequestInputSchema.parse({
      item: {
        match: "matched",
        productVariantId: IDS.product,
        desiredBrand: null,
        desiredModel: null,
        desiredVariant: "8/256 · Green",
        desiredRam: "8 GB",
        desiredStorage: "256 GB",
        desiredColor: "Green",
        conditionPreference: "new",
      },
      customerId: null,
      customerName: null,
      customerPhone: null,
      consentToContact: false,
      quantity: 1,
      budget: { minimumMinor: null, maximumMinor: null },
      ptaPreference: "pta_only",
      urgency: "within_week",
      channel: "walk_in",
      tradeInInterest: false,
      followUpOn: null,
      note: null,
      version: 1,
    });

    await expect(
      serviceFor(transactionClient(tx)).update(context, IDS.demand, input),
    ).rejects.toMatchObject({ code: "OPTIMISTIC_LOCK_FAILED" });
  });

  it("keeps the catalog match identity immutable on replace", async () => {
    const tx = {
      demandRequest: { findFirst: vi.fn().mockResolvedValue(record) },
      customer: { findFirst: vi.fn() },
      productVariant: { findFirst: vi.fn() },
    };
    const input = UpdateDemandRequestInputSchema.parse({
      item: {
        match: "matched",
        productVariantId: IDS.otherProduct,
        desiredBrand: null,
        desiredModel: null,
        desiredVariant: "Different phone",
        desiredRam: null,
        desiredStorage: null,
        desiredColor: null,
        conditionPreference: null,
      },
      customerId: null,
      customerName: null,
      customerPhone: null,
      consentToContact: false,
      quantity: 1,
      budget: { minimumMinor: null, maximumMinor: null },
      ptaPreference: "no_preference",
      urgency: "flexible",
      channel: "walk_in",
      tradeInInterest: false,
      followUpOn: null,
      note: null,
      version: 2,
    });

    await expect(
      serviceFor(transactionClient(tx)).update(context, IDS.demand, input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(tx.customer.findFirst).not.toHaveBeenCalled();
    expect(tx.productVariant.findFirst).not.toHaveBeenCalled();
  });

  it("serializes forecast dedupe by a privacy-safe normalized identity lock", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      applicationSetting: { findFirst: vi.fn().mockResolvedValue(null) },
      demandRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const input = CreateDemandRequestInputSchema.parse({
      item: {
        match: "unmatched",
        rawRequestText: "  iPhone 16 Pro   any colour ",
        desiredBrand: null,
        desiredModel: null,
        desiredVariant: null,
        desiredRam: null,
        desiredStorage: null,
        desiredColor: null,
        conditionPreference: null,
      },
      customerId: null,
      customerName: null,
      customerPhone: "0300-1234567",
      consentToContact: true,
      quantity: 1,
      budget: { minimumMinor: null, maximumMinor: null },
      ptaPreference: "no_preference",
      urgency: "within_week",
      channel: "walk_in",
      tradeInInterest: false,
      followUpOn: null,
      note: null,
      availabilitySnapshot: {
        state: "not_in_catalog",
        checkedAt: now.toISOString(),
        availableQuantity: null,
        unitPriceMinor: null,
      },
    });
    type FindDedupeGroup = (
      transaction: object,
      actor: DemandActorContext,
      demand: CreateDemandRequestData,
      availability: DemandAvailabilitySnapshot,
      at: Date,
    ) => Promise<string | null>;
    const findDedupeGroup = Reflect.get(
      serviceFor({}),
      "findDedupeGroup",
    ) as FindDedupeGroup;

    await expect(
      findDedupeGroup.call(
        serviceFor({}),
        tx,
        context,
        input,
        {
          state: "not_in_catalog",
          checkedAt: now.toISOString(),
          availableQuantity: null,
          unitPriceMinor: null,
        },
        now,
      ),
    ).resolves.toBeNull();

    expect(sqlTextOf(tx.$executeRaw, 0)).toContain(
      "pg_advisory_xact_lock",
    );
    expect(sqlTextOf(tx.$executeRaw, 0)).not.toContain("+923001234567");
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.demandRequest.findFirst.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("rejects contradictory manual status and outcome combinations", async () => {
    const tx = {
      demandRequest: {
        findFirst: vi.fn().mockResolvedValue(record),
        updateMany: vi.fn(),
      },
    };

    await expect(
      serviceFor(transactionClient(tx)).transition(context, IDS.demand, {
        status: "available",
        outcome: "unavailable",
        lostSaleReason: "No stock remained.",
        version: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(tx.demandRequest.updateMany).not.toHaveBeenCalled();
  });

  it("blocks sale conversion when any sale line is outside location scope", async () => {
    const tx = {
      demandRequest: { findFirst: vi.fn().mockResolvedValue(record) },
      sale: {
        findFirst: vi.fn().mockResolvedValue({
          id: IDS.sale,
          customerId: IDS.customer,
          lines: [{ stockLocationId: IDS.otherLocation }],
        }),
      },
    };

    await expect(
      serviceFor(transactionClient(tx)).convert(context, IDS.demand, {
        target: "sale",
        saleId: IDS.sale,
        version: 2,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE" });
  });

  it("requires a registered demand customer to match the posted sale exactly", async () => {
    const tx = {
      demandRequest: { findFirst: vi.fn().mockResolvedValue(record) },
      sale: {
        findFirst: vi.fn().mockResolvedValue({
          id: IDS.sale,
          customerId: null,
          postedAt: new Date("2026-07-16T10:05:00.000Z"),
          lines: [
            {
              stockLocationId: IDS.location,
              productVariantId: IDS.product,
            },
          ],
        }),
      },
    };

    await expect(
      serviceFor(transactionClient(tx)).convert(context, IDS.demand, {
        target: "sale",
        saleId: IDS.sale,
        version: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(tx.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "posted" }),
      }),
    );
  });

  it("requires a matched demand item to appear on the linked sale", async () => {
    const tx = {
      demandRequest: { findFirst: vi.fn().mockResolvedValue(record) },
      sale: {
        findFirst: vi.fn().mockResolvedValue({
          id: IDS.sale,
          customerId: IDS.customer,
          postedAt: new Date("2026-07-16T10:05:00.000Z"),
          lines: [
            {
              stockLocationId: IDS.location,
              productVariantId: IDS.otherProduct,
            },
          ],
        }),
      },
    };

    await expect(
      serviceFor(transactionClient(tx)).convert(context, IDS.demand, {
        target: "sale",
        saleId: IDS.sale,
        version: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("does not link a sale that predates the captured demand", async () => {
    const tx = {
      demandRequest: { findFirst: vi.fn().mockResolvedValue(record) },
      sale: {
        findFirst: vi.fn().mockResolvedValue({
          id: IDS.sale,
          customerId: IDS.customer,
          postedAt: new Date("2026-07-16T09:59:59.000Z"),
          lines: [
            {
              stockLocationId: IDS.location,
              productVariantId: IDS.product,
            },
          ],
        }),
      },
    };

    await expect(
      serviceFor(transactionClient(tx)).convert(context, IDS.demand, {
        target: "sale",
        saleId: IDS.sale,
        version: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
