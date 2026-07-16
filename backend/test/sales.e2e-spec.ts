import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@mobileshop/database";
import {
  ERROR_CODES,
  PERMISSIONS,
  type PermissionKey,
} from "@mobileshop/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaService } from "@/database/prisma.service";
import {
  SalesService,
  type SalesActorContext,
} from "@/modules/sales/sales.service";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("Sales integration tests require TEST_DATABASE_URL.");
}
const fixtureDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const hasFixtureDatabase =
  fixtureDatabaseUrl !== undefined && fixtureDatabaseUrl.length > 0;

const fixtureClient = createPrismaClient({
  connectionString: fixtureDatabaseUrl ?? databaseUrl,
});

const ids = {
  organization: randomUUID(),
  branch: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  category: randomUUID(),
  brand: randomUUID(),
  model: randomUUID(),
  variant: randomUUID(),
  batch: randomUUID(),
};

const permissions: PermissionKey[] = [
  PERMISSIONS.SALES_VIEW,
  PERMISSIONS.SALES_CREATE,
  PERMISSIONS.SALES_POST,
  PERMISSIONS.SALES_VIEW_PROFIT,
  PERMISSIONS.SALES_DISCOUNT,
  PERMISSIONS.SALES_DISCOUNT_OVERRIDE,
  PERMISSIONS.PRICING_OVERRIDE_MIN_MARGIN,
  PERMISSIONS.PAYMENTS_COLLECT,
];

const context: SalesActorContext = {
  organizationId: ids.organization,
  organizationName: "Sales Integration Shop",
  branchId: ids.branch,
  branchName: "Integration Branch",
  actorUserId: ids.user,
  actorFullName: "Integration Cashier",
  currency: "PKR",
  allowedLocationIds: null,
  permissions,
  canViewProfit: true,
  metadata: {
    requestId: `sales-integration-${ids.organization}`,
    ipAddress: "127.0.0.1",
    userAgent: "sales-integration-test",
  },
};

const accountFixtures = [
  ["CASH", "Physical cash", "asset", "physical_cash", "debit"],
  ["BANK", "Bank balance", "asset", "bank", "debit"],
  ["DIGITAL", "Digital wallet", "asset", "provider_float", "debit"],
  ["AR", "Customer receivables", "asset", "receivable", "debit"],
  ["INVENTORY", "Inventory asset", "asset", "inventory_asset", "debit"],
  ["SALES", "Sales revenue", "revenue", "sales_revenue", "credit"],
  ["COGS", "Cost of goods sold", "expense", "cost_of_goods_sold", "debit"],
] as const;

describe.skipIf(!hasFixtureDatabase)("SalesService database transaction", () => {
  let service: SalesService;

  beforeAll(async () => {
    await fixtureClient.$connect();
    await fixtureClient.organization.create({
      data: {
        id: ids.organization,
        name: context.organizationName,
        currency: "PKR",
      },
    });
    await fixtureClient.branch.create({
      data: {
        id: ids.branch,
        organizationId: ids.organization,
        code: `T${ids.branch.slice(0, 6).toUpperCase()}`,
        name: context.branchName,
      },
    });
    await fixtureClient.user.create({
      data: {
        id: ids.user,
        organizationId: ids.organization,
        email: `sales-${ids.user}@example.test`,
        passwordHash: "integration-test-password-hash",
        fullName: "Integration Cashier",
      },
    });
    await fixtureClient.stockLocation.create({
      data: {
        id: ids.location,
        organizationId: ids.organization,
        branchId: ids.branch,
        code: "SHOP",
        name: "Shop Floor",
      },
    });
    await fixtureClient.category.create({
      data: {
        id: ids.category,
        organizationId: ids.organization,
        name: "Accessories",
        slug: `accessories-${ids.category}`,
      },
    });
    await fixtureClient.brand.create({
      data: {
        id: ids.brand,
        organizationId: ids.organization,
        name: "Integration Brand",
        slug: `integration-${ids.brand}`,
      },
    });
    await fixtureClient.productModel.create({
      data: {
        id: ids.model,
        organizationId: ids.organization,
        brandId: ids.brand,
        categoryId: ids.category,
        name: "Screen Protector",
        canonicalName: `screen-protector-${ids.model}`,
      },
    });
    await fixtureClient.productVariant.create({
      data: {
        id: ids.variant,
        organizationId: ids.organization,
        productModelId: ids.model,
        sku: `SCREEN-${ids.variant.slice(0, 6).toUpperCase()}`,
        name: "Premium Screen Protector",
        trackingType: "quantity",
        condition: "new",
        ptaStatus: "not_applicable",
        warrantyType: "none",
        defaultPriceMinor: 100_000n,
        minPriceMinor: 90_000n,
      },
    });
    await fixtureClient.stockBatch.create({
      data: {
        id: ids.batch,
        organizationId: ids.organization,
        branchId: ids.branch,
        productVariantId: ids.variant,
        stockLocationId: ids.location,
        quantityOnHand: 5,
        quantityReserved: 0,
        actualCostMinor: 60_000n,
        landedCostMinor: 60_000n,
        receivedAt: new Date(),
      },
    });
    await fixtureClient.financialAccount.createMany({
      data: accountFixtures.map(
        ([code, name, accountType, accountSubtype, normalBalance]) => ({
          organizationId: ids.organization,
          branchId: ids.branch,
          code,
          name,
          accountType,
          accountSubtype,
          normalBalance,
        }),
      ),
    });
    // The migration privilege audit is tracked separately; the transaction
    // smoke uses the fixture owner so it can validate SQL/trigger semantics.
    service = new SalesService({
      client: fixtureClient,
    } as unknown as PrismaService);
  });

  afterAll(async () => {
    await fixtureClient.$disconnect();
  });

  it("posts non-cash atomically, replays idempotently, and rolls back a late failure", async () => {
    const draft = await service.createDraft(context, {
      customerId: null,
      note: "Database smoke sale",
      requestedDiscountMinor: 0,
      discountReason: null,
      lines: [
        {
          productVariantId: ids.variant,
          trackingType: "quantity",
          locationId: ids.location,
          quantity: 1,
          stockVersion: 1,
          priceSource: "variant_default",
          priceSourceId: null,
          priceVersion: 1,
        },
      ],
    });

    expect(draft.status).toBe("draft");
    expect(draft.invoiceNumber).toBeNull();
    expect(draft.settlement.payments).toEqual([]);
    expect(
      await fixtureClient.stockBatch.findUniqueOrThrow({ where: { id: ids.batch } }),
    ).toMatchObject({ quantityOnHand: 5, version: 1 });
    expect(
      await fixtureClient.inventoryMovement.count({
        where: { referenceType: "sale", referenceId: draft.id },
      }),
    ).toBe(0);

    const review = await service.review(context, draft.id, {
      version: draft.version,
    });
    expect(review.canPost).toBe(true);
    expect(review.warnings).toEqual([]);
    expect(review.totals.totalMinor).toBe(100_000);

    const key = randomUUID();
    const postInput = {
      version: draft.version,
      payments: [
        {
          method: "bank_transfer" as const,
          amountMinor: 100_000,
          reference: "BANK-SMOKE-001",
        },
      ],
    };
    const posted = await service.post(context, draft.id, key, postInput);
    expect(posted.idempotencyReplay).toBe(false);
    expect(posted.sale.status).toBe("posted");
    expect(posted.receipt.saleId).toBe(draft.id);
    expect(posted.receipt.invoiceNumber).toBe(posted.sale.invoiceNumber);
    expect(posted.sale.settlement).toMatchObject({
      paidMinor: 100_000,
      receivableMinor: 0,
    });
    const storedReceipt = await fixtureClient.sale.findUniqueOrThrow({
      where: { id: draft.id },
      select: { receiptSnapshot: true },
    });
    expect(storedReceipt.receiptSnapshot).toMatchObject({
      saleId: draft.id,
      invoiceNumber: posted.receipt.invoiceNumber,
      shop: { branchName: context.branchName },
      cashier: { fullName: context.actorFullName },
    });

    await fixtureClient.branch.update({
      where: { id: ids.branch },
      data: { name: "Renamed Integration Branch" },
    });
    await fixtureClient.user.update({
      where: { id: ids.user },
      data: { fullName: "Renamed Integration Cashier" },
    });
    const reissuedReceipt = await service.receipt(context, draft.id, {
      format: "thermal",
    });
    expect(reissuedReceipt.shop.branchName).toBe(context.branchName);
    expect(reissuedReceipt.cashier.fullName).toBe(context.actorFullName);

    const postedBatch = await fixtureClient.stockBatch.findUniqueOrThrow({
      where: { id: ids.batch },
    });
    expect(postedBatch).toMatchObject({ quantityOnHand: 4, version: 2 });
    expect(
      await fixtureClient.inventoryMovement.count({
        where: { referenceType: "sale", referenceId: draft.id },
      }),
    ).toBe(1);
    const ledger = await fixtureClient.financialEntry.findMany({
      where: { sourceType: "sale", sourceId: draft.id },
    });
    const debits = ledger
      .filter((entry) => entry.direction === "debit")
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);
    const credits = ledger
      .filter((entry) => entry.direction === "credit")
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);
    expect(debits).toBe(credits);

    const replay = await service.post(context, draft.id, key, postInput);
    expect(replay.idempotencyReplay).toBe(true);
    expect(replay.sale.invoiceNumber).toBe(posted.sale.invoiceNumber);
    expect(
      await fixtureClient.inventoryMovement.count({
        where: { referenceType: "sale", referenceId: draft.id },
      }),
    ).toBe(1);

    const rollbackDraft = await service.createDraft(context, {
      customerId: null,
      note: "Rollback evidence sale",
      requestedDiscountMinor: 0,
      discountReason: null,
      lines: [
        {
          productVariantId: ids.variant,
          trackingType: "quantity",
          locationId: ids.location,
          quantity: 1,
          stockVersion: postedBatch.version,
          priceSource: "variant_default",
          priceSourceId: null,
          priceVersion: 1,
        },
      ],
    });
    const paymentCountBefore = await fixtureClient.payment.count({
      where: { organizationId: ids.organization },
    });
    const sequencesBefore = await fixtureClient.numberSequence.findMany({
      where: { organizationId: ids.organization, branchId: ids.branch },
      select: { key: true, nextValue: true, periodKey: true },
      orderBy: [{ key: "asc" }, { periodKey: "asc" }],
    });
    await fixtureClient.financialAccount.update({
      where: {
        organizationId_branchId_code: {
          organizationId: ids.organization,
          branchId: ids.branch,
          code: "COGS",
        },
      },
      data: { isActive: false, version: { increment: 1 } },
    });

    await expect(
      service.post(context, rollbackDraft.id, randomUUID(), {
        version: rollbackDraft.version,
        payments: [
          {
            method: "bank_transfer",
            amountMinor: 100_000,
            reference: "BANK-ROLLBACK-001",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });

    await fixtureClient.financialAccount.update({
      where: {
        organizationId_branchId_code: {
          organizationId: ids.organization,
          branchId: ids.branch,
          code: "COGS",
        },
      },
      data: { isActive: true, version: { increment: 1 } },
    });
    expect(
      await fixtureClient.stockBatch.findUniqueOrThrow({ where: { id: ids.batch } }),
    ).toMatchObject({ quantityOnHand: 4, version: 2 });
    expect(
      await fixtureClient.inventoryMovement.count({
        where: { referenceType: "sale", referenceId: rollbackDraft.id },
      }),
    ).toBe(0);
    expect(
      await fixtureClient.payment.count({ where: { organizationId: ids.organization } }),
    ).toBe(paymentCountBefore);
    expect(
      await fixtureClient.numberSequence.findMany({
        where: { organizationId: ids.organization, branchId: ids.branch },
        select: { key: true, nextValue: true, periodKey: true },
        orderBy: [{ key: "asc" }, { periodKey: "asc" }],
      }),
    ).toEqual(sequencesBefore);
    expect(await service.detail(context, rollbackDraft.id)).toMatchObject({
      status: "draft",
      version: rollbackDraft.version,
    });
  });
});
