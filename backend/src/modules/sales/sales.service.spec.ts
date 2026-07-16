import { ERROR_CODES } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import {
  SalesService,
  type SalesActorContext,
} from "./sales.service";

const CONTEXT: SalesActorContext = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  organizationName: "Test Mobile Shop",
  branchId: "10000000-0000-4000-8000-000000000002",
  branchName: "Main Branch",
  actorUserId: "20000000-0000-4000-8000-000000000001",
  actorFullName: "Counter Cashier",
  currency: "PKR",
  allowedLocationIds: null,
  permissions: [],
  canViewProfit: false,
  metadata: {
    requestId: "request-sales-service-test",
    ipAddress: "127.0.0.1",
    userAgent: "sales-service-test",
  },
};

const IDS = Object.freeze({
  sale: "40000000-0000-4000-8000-000000000001",
  line: "40000000-0000-4000-8000-000000000002",
  variant: "40000000-0000-4000-8000-000000000003",
  location: "40000000-0000-4000-8000-000000000004",
  batch: "40000000-0000-4000-8000-000000000005",
  idempotency: "40000000-0000-4000-8000-000000000006",
  creditPayment: "40000000-0000-4000-8000-000000000007",
  laterCashPayment: "40000000-0000-4000-8000-000000000008",
});

const NOW = new Date("2026-07-16T09:00:00.000Z");

function draftRecord() {
  return {
    id: IDS.sale,
    organizationId: CONTEXT.organizationId,
    branchId: CONTEXT.branchId,
    invoiceNumber: null,
    customerId: null,
    customerNameSnapshot: "Walk-in Customer",
    customerPhoneSnapshot: null,
    salespersonUserId: CONTEXT.actorUserId,
    cashierUserId: CONTEXT.actorUserId,
    cashSessionId: null,
    status: "draft" as const,
    subtotalMinor: 1_000n,
    discountMinor: 0n,
    taxMinor: 0n,
    totalMinor: 1_000n,
    cogsMinor: 600n,
    grossProfitMinor: 400n,
    discountReason: null,
    note: null,
    discountApprovedByUserId: null,
    heldAt: null,
    heldByUserId: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    returnWindowDays: 7,
    postedAt: null,
    businessDate: null,
    postRequestId: null,
    postRequestHash: null,
    receiptSnapshot: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    organization: { name: CONTEXT.organizationName, currency: "PKR" },
    branch: {
      name: CONTEXT.branchName,
      addressLine: null,
      phone: null,
    },
    salesperson: { id: CONTEXT.actorUserId, fullName: "Counter Cashier" },
    cashier: { id: CONTEXT.actorUserId, fullName: "Counter Cashier" },
    heldBy: null,
    lines: [
      {
        id: IDS.line,
        organizationId: CONTEXT.organizationId,
        branchId: CONTEXT.branchId,
        saleId: IDS.sale,
        stockLocationId: IDS.location,
        lineNumber: 1,
        productVariantId: IDS.variant,
        priceEntryId: null,
        serializedUnitId: null,
        trackingTypeSnapshot: "quantity" as const,
        productNameSnapshot: "Tempered Glass",
        skuSnapshot: "GLASS-001",
        imeiSnapshot: null,
        quantity: 1,
        unitPriceMinor: 1_000n,
        priceVersionSnapshot: 2,
        discountMinor: 0n,
        discountReason: null,
        taxMinor: 0n,
        lineTotalMinor: 1_000n,
        unitCogsMinor: 600n,
        cogsMinor: 600n,
        grossProfitMinor: 400n,
        warrantyTypeSnapshot: "none" as const,
        warrantyMonthsSnapshot: null,
        isManualLine: false,
        unitSaleActive: false,
        createdAt: NOW,
        updatedAt: NOW,
        stockLocation: {
          id: IDS.location,
          code: "SHOP",
          name: "Shop Floor",
        },
        serializedUnit: null,
      },
    ],
    allocations: [],
    receivable: null,
  };
}

function quantityResolutionMocks(costMinor: bigint | null = 600n) {
  return {
    stockLocation: {
      findFirst: vi.fn().mockResolvedValue({
        id: IDS.location,
        code: "SHOP",
        name: "Shop Floor",
      }),
    },
    productVariant: {
      findFirst: vi.fn().mockResolvedValue({
        id: IDS.variant,
        sku: "GLASS-001",
        name: "Tempered Glass",
        trackingType: "quantity",
        defaultPriceMinor: 1_000n,
        minPriceMinor: 800n,
        warrantyType: "none",
        warrantyMonths: null,
        version: 2,
        updatedAt: NOW,
        isActive: true,
        productModel: {
          isActive: true,
          brand: { isActive: true },
          category: { isActive: true },
        },
      }),
    },
    priceEntry: { findMany: vi.fn().mockResolvedValue([]) },
    stockBatch: {
      findFirst: vi.fn().mockResolvedValue({
        id: IDS.batch,
        quantityOnHand: 10,
        quantityReserved: 0,
        version: 3,
        actualCostMinor: costMinor,
        landedCostMinor: costMinor,
      }),
      updateMany: vi.fn(),
    },
  };
}

describe("SalesService", () => {
  it("uses Asia/Karachi business-day boundaries for list date filters", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      sale: { count, findMany },
      $transaction: vi.fn(
        async (operations: readonly Promise<unknown>[]) =>
          Promise.all(operations),
      ),
    };
    const service = new SalesService({ client } as unknown as PrismaService);

    await service.list(CONTEXT, {
      page: 1,
      pageSize: 20,
      from: "2026-07-16",
      to: "2026-07-16",
      sort: "posted_at",
      direction: "desc",
    });

    const call = findMany.mock.calls[0]?.[0] as
      | { readonly where?: { readonly postedAt?: { readonly gte?: Date; readonly lt?: Date } } }
      | undefined;
    expect(call?.where?.postedAt?.gte?.toISOString()).toBe(
      "2026-07-15T19:00:00.000Z",
    );
    expect(call?.where?.postedAt?.lt?.toISOString()).toBe(
      "2026-07-16T19:00:00.000Z",
    );
  });

  it("creates a draft without consuming stock, payments, or document numbers", async () => {
    const resolution = quantityResolutionMocks();
    const tx = {
      ...resolution,
      sale: {
        create: vi.fn().mockResolvedValue({ id: IDS.sale }),
        findFirst: vi.fn().mockResolvedValue(draftRecord()),
      },
      saleLine: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      inventoryMovement: { create: vi.fn() },
      payment: { create: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const client = {
      $transaction: vi.fn(
        async (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new SalesService({ client } as unknown as PrismaService);

    const created = await service.createDraft(CONTEXT, {
      customerId: null,
      note: null,
      requestedDiscountMinor: 0,
      discountReason: null,
      lines: [
        {
          productVariantId: IDS.variant,
          trackingType: "quantity",
          locationId: IDS.location,
          quantity: 1,
          stockVersion: 3,
          priceSource: "variant_default",
          priceSourceId: null,
          priceVersion: 2,
        },
      ],
    });

    expect(created.status).toBe("draft");
    expect(created.invoiceNumber).toBeNull();
    expect(created.settlement).toEqual({
      payments: [],
      paidMinor: 0,
      receivableMinor: 0,
    });
    expect(resolution.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects a payment mismatch before any stock or financial mutation", async () => {
    const resolution = quantityResolutionMocks();
    const tx = {
      ...resolution,
      sale: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(draftRecord()),
      },
      serializedUnit: { updateMany: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      payment: { create: vi.fn() },
      financialEntry: { createMany: vi.fn() },
      applicationSetting: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const client = {
      $transaction: vi.fn(
        async (operation: (transaction: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new SalesService({ client } as unknown as PrismaService);

    await expect(
      service.post(CONTEXT, IDS.sale, IDS.idempotency, {
        version: 1,
        payments: [{ method: "cash", amountMinor: 999, reference: null }],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SALE_PAYMENT_MISMATCH });

    expect(resolution.stockBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.serializedUnit.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.financialEntry.createMany).not.toHaveBeenCalled();
  });

  it("uses allocation amounts and ignores later receivable collections in historical settlement", async () => {
    const posted = {
      ...draftRecord(),
      status: "posted" as const,
      invoiceNumber: "INV-2026-000001",
      postedAt: NOW,
      businessDate: new Date("2026-07-16T00:00:00.000Z"),
      postRequestId: IDS.idempotency,
      postRequestHash: "a".repeat(64),
      version: 2,
      receivable: {
        allocations: [
          {
            amountMinor: 1_000n,
            payment: {
              id: IDS.creditPayment,
              paymentMethod: "credit" as const,
              // One payment may be split across receivables; only this
              // allocation belongs to the historical sale.
              amountMinor: 2_000n,
              reference: null,
              receivedAt: NOW,
            },
          },
          {
            amountMinor: 500n,
            payment: {
              id: IDS.laterCashPayment,
              paymentMethod: "cash" as const,
              amountMinor: 500n,
              reference: null,
              receivedAt: new Date("2026-07-17T09:00:00.000Z"),
            },
          },
        ],
      },
    };
    const client = {
      sale: { findFirst: vi.fn().mockResolvedValue(posted) },
    };
    const service = new SalesService({ client } as unknown as PrismaService);

    const detail = await service.detail(CONTEXT, IDS.sale);

    expect(detail.settlement).toEqual({
      payments: [
        {
          id: IDS.creditPayment,
          method: "credit",
          amountMinor: 1_000,
          reference: null,
          recordedAt: NOW.toISOString(),
        },
      ],
      paidMinor: 0,
      receivableMinor: 1_000,
    });
  });

  it("reissues the immutable posted receipt snapshot instead of mutable live labels", async () => {
    const snapshot = {
      saleId: IDS.sale,
      invoiceNumber: "INV-2026-000001",
      currency: "PKR",
      issuedAt: NOW.toISOString(),
      shop: {
        organizationName: "Original Mobile Shop",
        branchName: "Original Branch",
        addressLine: "Original address",
        phone: "+924200000000",
      },
      customer: null,
      cashier: {
        id: CONTEXT.actorUserId,
        fullName: "Original Cashier",
      },
      salesperson: {
        id: CONTEXT.actorUserId,
        fullName: "Original Salesperson",
      },
      lines: [
        {
          id: IDS.line,
          product: {
            id: IDS.variant,
            sku: "GLASS-001",
            name: "Tempered Glass",
          },
          locationName: "Original Counter",
          trackingType: "quantity" as const,
          quantity: 1,
          unitPriceMinor: 1_000,
          lineSubtotalMinor: 1_000,
          discountMinor: 0,
          lineTotalMinor: 1_000,
          discountReason: null,
        },
      ],
      totals: {
        subtotalMinor: 1_000,
        discountMinor: 0,
        totalMinor: 1_000,
      },
      settlement: {
        payments: [
          {
            id: IDS.creditPayment,
            method: "bank_transfer" as const,
            amountMinor: 1_000,
            reference: "BANK-ORIGINAL",
            recordedAt: NOW.toISOString(),
          },
        ],
        paidMinor: 1_000,
        receivableMinor: 0,
      },
      footer: null,
    };
    const posted = {
      ...draftRecord(),
      status: "posted" as const,
      invoiceNumber: snapshot.invoiceNumber,
      postedAt: NOW,
      businessDate: new Date("2026-07-16T00:00:00.000Z"),
      postRequestId: IDS.idempotency,
      postRequestHash: "a".repeat(64),
      receiptSnapshot: snapshot,
      version: 2,
      organization: { name: "Renamed Shop", currency: "PKR" },
      branch: {
        name: "Renamed Branch",
        addressLine: "Changed address",
        phone: null,
      },
      cashier: { id: CONTEXT.actorUserId, fullName: "Renamed Cashier" },
      salesperson: {
        id: CONTEXT.actorUserId,
        fullName: "Renamed Salesperson",
      },
    };
    const client = {
      sale: { findFirst: vi.fn().mockResolvedValue(posted) },
    };
    const service = new SalesService({ client } as unknown as PrismaService);

    const receipt = await service.receipt(CONTEXT, IDS.sale, {
      format: "thermal",
    });

    expect(receipt).toEqual(snapshot);
    expect(receipt.shop.branchName).toBe("Original Branch");
    expect(receipt.cashier.fullName).toBe("Original Cashier");
    expect(receipt.lines[0]?.locationName).toBe("Original Counter");
  });

  it("does not expose cost-derived warning structure to profit-redacted users", async () => {
    const reviewAtCost = async (costMinor: bigint) => {
      const resolution = quantityResolutionMocks(costMinor);
      const tx = {
        ...resolution,
        sale: { findFirst: vi.fn().mockResolvedValue(draftRecord()) },
        applicationSetting: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const client = {
        $transaction: vi.fn(
          async (operation: (transaction: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      };
      const service = new SalesService({ client } as unknown as PrismaService);
      return service.review(CONTEXT, IDS.sale, { version: 1 });
    };

    const healthyMargin = await reviewAtCost(600n);
    const hiddenLowMargin = await reviewAtCost(990n);

    expect(healthyMargin.warnings).toEqual(hiddenLowMargin.warnings);
    expect(healthyMargin.warnings).toEqual([]);
    expect(healthyMargin.canPost).toBe(hiddenLowMargin.canPost);
    expect(healthyMargin.profit).toEqual({ availability: "redacted" });
    expect(hiddenLowMargin.profit).toEqual({ availability: "redacted" });
  });
});
