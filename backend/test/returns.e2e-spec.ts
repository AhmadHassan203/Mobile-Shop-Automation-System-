import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@mobileshop/database";
import {
  ERROR_CODES,
  PERMISSIONS,
  type PermissionKey,
  type PostReturnData,
} from "@mobileshop/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaService } from "@/database/prisma.service";
import {
  ReturnsService,
  type ReturnsActorContext,
} from "@/modules/returns/returns.service";
import {
  SalesService,
  type SalesActorContext,
} from "@/modules/sales/sales.service";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("Returns integration tests require TEST_DATABASE_URL.");
}
const fixtureDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const hasFixtureDatabase =
  fixtureDatabaseUrl !== undefined && fixtureDatabaseUrl.length > 0;

// The migrator role owns the tables, so it may seed fixtures the least-privilege
// application role could not; the services under test still run their real SQL.
const fixtureClient = createPrismaClient({
  connectionString: fixtureDatabaseUrl ?? databaseUrl,
});

interface TenantIds {
  organization: string;
  branch: string;
  user: string;
  location: string;
  category: string;
  brand: string;
  model: string;
  variant: string;
  batch: string;
}

function makeTenantIds(): TenantIds {
  return {
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
}

// Every suite shares the one test database, so each identifier is namespaced to a
// freshly generated organization that can never collide with another suite.
const ids = makeTenantIds();
const otherIds = makeTenantIds();

const salesPermissions: PermissionKey[] = [
  PERMISSIONS.SALES_VIEW,
  PERMISSIONS.SALES_CREATE,
  PERMISSIONS.SALES_POST,
  PERMISSIONS.SALES_VIEW_PROFIT,
  PERMISSIONS.SALES_DISCOUNT,
  PERMISSIONS.SALES_DISCOUNT_OVERRIDE,
  PERMISSIONS.PRICING_OVERRIDE_MIN_MARGIN,
  PERMISSIONS.PAYMENTS_COLLECT,
];

const returnsPermissions: PermissionKey[] = [
  PERMISSIONS.RETURNS_VIEW,
  PERMISSIONS.RETURNS_CREATE,
  PERMISSIONS.RETURNS_APPROVE,
  PERMISSIONS.PAYMENTS_COLLECT,
];

function salesContextFor(
  tenant: TenantIds,
  organizationName: string,
  branchName: string,
): SalesActorContext {
  return {
    organizationId: tenant.organization,
    organizationName,
    branchId: tenant.branch,
    branchName,
    actorUserId: tenant.user,
    actorFullName: "Integration Returns Clerk",
    currency: "PKR",
    allowedLocationIds: null,
    permissions: salesPermissions,
    canViewProfit: true,
    metadata: {
      requestId: `returns-integration-${tenant.organization}`,
      ipAddress: "127.0.0.1",
      userAgent: "returns-integration-test",
    },
  };
}

const salesContext = salesContextFor(
  ids,
  "Returns Integration Shop",
  "Integration Branch",
);
const otherSalesContext = salesContextFor(
  otherIds,
  "Foreign Integration Shop",
  "Foreign Branch",
);

const returnsContext: ReturnsActorContext = {
  organizationId: ids.organization,
  organizationName: "Returns Integration Shop",
  branchId: ids.branch,
  branchName: "Integration Branch",
  actorUserId: ids.user,
  actorFullName: "Integration Returns Clerk",
  currency: "PKR",
  allowedLocationIds: null,
  permissions: returnsPermissions,
  canViewProfit: true,
  canViewSensitive: true,
  metadata: {
    requestId: `returns-integration-${ids.organization}`,
    ipAddress: "127.0.0.1",
    userAgent: "returns-integration-test",
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

// Mirrors the sales.e2e-spec fixture graph exactly so both services exercise the
// real schema, triggers and constraints against a genuine tenant.
async function seedTenant(
  tenant: TenantIds,
  organizationName: string,
  branchName: string,
): Promise<void> {
  await fixtureClient.organization.create({
    data: { id: tenant.organization, name: organizationName, currency: "PKR" },
  });
  await fixtureClient.branch.create({
    data: {
      id: tenant.branch,
      organizationId: tenant.organization,
      code: `T${tenant.branch.slice(0, 6).toUpperCase()}`,
      name: branchName,
    },
  });
  await fixtureClient.user.create({
    data: {
      id: tenant.user,
      organizationId: tenant.organization,
      email: `returns-${tenant.user}@example.test`,
      passwordHash: "integration-test-password-hash",
      fullName: "Integration Returns Clerk",
    },
  });
  await fixtureClient.stockLocation.create({
    data: {
      id: tenant.location,
      organizationId: tenant.organization,
      branchId: tenant.branch,
      code: "SHOP",
      name: "Shop Floor",
    },
  });
  await fixtureClient.category.create({
    data: {
      id: tenant.category,
      organizationId: tenant.organization,
      name: "Accessories",
      slug: `accessories-${tenant.category}`,
    },
  });
  await fixtureClient.brand.create({
    data: {
      id: tenant.brand,
      organizationId: tenant.organization,
      name: "Integration Brand",
      slug: `integration-${tenant.brand}`,
    },
  });
  await fixtureClient.productModel.create({
    data: {
      id: tenant.model,
      organizationId: tenant.organization,
      brandId: tenant.brand,
      categoryId: tenant.category,
      name: "Screen Protector",
      canonicalName: `screen-protector-${tenant.model}`,
    },
  });
  await fixtureClient.productVariant.create({
    data: {
      id: tenant.variant,
      organizationId: tenant.organization,
      productModelId: tenant.model,
      sku: `SCREEN-${tenant.variant.slice(0, 6).toUpperCase()}`,
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
      id: tenant.batch,
      organizationId: tenant.organization,
      branchId: tenant.branch,
      productVariantId: tenant.variant,
      stockLocationId: tenant.location,
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
        organizationId: tenant.organization,
        branchId: tenant.branch,
        code,
        name,
        accountType,
        accountSubtype,
        normalBalance,
      }),
    ),
  });
}

describe.skipIf(!hasFixtureDatabase)(
  "ReturnsService database transaction",
  () => {
    let salesService: SalesService;
    let returnsService: ReturnsService;

    // Carried from the happy-path post into the idempotency replay assertion.
    let happyReturnId: string;
    let happyIdempotencyKey: string;
    let happyPostInput: PostReturnData;

    // A posted, still-returnable sale owned entirely by the foreign tenant.
    let foreignSale: { readonly saleId: string; readonly saleLineId: string };

    // Post a single-unit, fully bank-paid quantity sale for a tenant and return the
    // resulting sale and sale-line ids. Posting freezes returnWindowDays from the
    // `sales.return_window_days` application setting (default 7), so a caller that
    // needs an already-elapsed window seeds that setting to 0 before calling.
    async function postQuantitySale(
      context: SalesActorContext,
      tenant: TenantIds,
      options: { readonly reference: string },
    ): Promise<{ readonly saleId: string; readonly saleLineId: string }> {
      const batch = await fixtureClient.stockBatch.findUniqueOrThrow({
        where: { id: tenant.batch },
      });
      const draft = await salesService.createDraft(context, {
        customerId: null,
        note: "Returns integration sale",
        requestedDiscountMinor: 0,
        discountReason: null,
        lines: [
          {
            productVariantId: tenant.variant,
            trackingType: "quantity",
            locationId: tenant.location,
            quantity: 1,
            stockVersion: batch.version,
            priceSource: "variant_default",
            priceSourceId: null,
            priceVersion: 1,
          },
        ],
      });
      const review = await salesService.review(context, draft.id, {
        version: draft.version,
      });
      expect(review.canPost).toBe(true);
      const posted = await salesService.post(context, draft.id, randomUUID(), {
        version: draft.version,
        payments: [
          {
            method: "bank_transfer",
            amountMinor: review.totals.totalMinor,
            reference: options.reference,
          },
        ],
      });
      expect(posted.sale.status).toBe("posted");
      const line = await fixtureClient.saleLine.findFirstOrThrow({
        where: { saleId: draft.id },
        select: { id: true },
      });
      return { saleId: draft.id, saleLineId: line.id };
    }

    beforeAll(async () => {
      await fixtureClient.$connect();
      await seedTenant(ids, "Returns Integration Shop", "Integration Branch");
      await seedTenant(otherIds, "Foreign Integration Shop", "Foreign Branch");
      // The migration privilege audit is tracked separately; the transaction smoke
      // uses the fixture owner so it can validate SQL/trigger semantics.
      salesService = new SalesService({
        client: fixtureClient,
      } as unknown as PrismaService);
      returnsService = new ReturnsService({
        client: fixtureClient,
      } as unknown as PrismaService);
      foreignSale = await postQuantitySale(otherSalesContext, otherIds, {
        reference: "BANK-FOREIGN-001",
      });
    });

    afterAll(async () => {
      await fixtureClient.$disconnect();
    });

    it("posts a full quantity return: restock, balanced reversal, refund, returned sale", async () => {
      const { saleId, saleLineId } = await postQuantitySale(salesContext, ids, {
        reference: "BANK-RETURN-HAPPY",
      });

      // Eligibility reports a fully returnable, in-window line before any draft.
      const eligibility = await returnsService.eligibility(returnsContext, {
        saleId,
      });
      expect(eligibility.state).toBe("eligible");
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.requiresOverride).toBe(false);
      expect(eligibility.lines).toHaveLength(1);
      expect(eligibility.lines[0]).toMatchObject({
        saleLineId,
        trackingType: "quantity",
        soldQuantity: 1,
        returnedQuantity: 0,
        remainingQuantity: 1,
        refundableMinor: 100_000,
      });

      const saleBefore = await fixtureClient.sale.findUniqueOrThrow({
        where: { id: saleId },
        select: {
          status: true,
          version: true,
          subtotalMinor: true,
          totalMinor: true,
          cogsMinor: true,
          grossProfitMinor: true,
          receiptSnapshot: true,
        },
      });
      const batchAfterSale = await fixtureClient.stockBatch.findUniqueOrThrow({
        where: { id: ids.batch },
      });

      // The draft only carries the customer's claim: zeroed money, no number, and
      // no inventory movement or restock happens yet.
      const draft = await returnsService.createDraft(returnsContext, {
        saleId,
        reason: "Customer reported the screen protector is faulty",
        evidenceNote:
          "Adhesive lifting along the top edge, still within the window",
        lines: [
          {
            trackingType: "quantity",
            saleLineId,
            quantity: 1,
            condition: "faulty",
          },
        ],
      });
      expect(draft.status).toBe("draft");
      expect(draft.returnNumber).toBeNull();
      expect(draft.totals).toMatchObject({
        refundMinor: 0,
        receivableCreditMinor: 0,
        refundedMinor: 0,
      });
      expect(draft.lines).toHaveLength(1);
      expect(draft.lines[0]).toMatchObject({
        saleLineId,
        quantity: 1,
        condition: "faulty",
        refundMinor: 0,
      });
      expect(
        await fixtureClient.inventoryMovement.count({
          where: { referenceType: "return", referenceId: draft.id },
        }),
      ).toBe(0);
      expect(
        await fixtureClient.stockBatch.findUniqueOrThrow({
          where: { id: ids.batch },
        }),
      ).toMatchObject({
        quantityOnHand: batchAfterSale.quantityOnHand,
        version: batchAfterSale.version,
      });

      // A fully-paid sale has no receivable, so the whole refund settles on a rail.
      happyReturnId = draft.id;
      happyIdempotencyKey = randomUUID();
      happyPostInput = {
        version: draft.version,
        refund: { method: "bank_transfer", reference: "BANK-REFUND-HAPPY" },
        policyOverrideReason: null,
      };
      const posted = await returnsService.post(
        returnsContext,
        draft.id,
        happyIdempotencyKey,
        happyPostInput,
      );

      expect(posted.idempotencyReplay).toBe(false);
      expect(posted.return.status).toBe("posted");
      expect(posted.return.returnNumber).not.toBeNull();
      expect(posted.return.policy.overridden).toBe(false);

      // Settlement reconciles: refund = receivable credit + external refund.
      const totals = posted.return.totals;
      expect(totals.refundMinor).toBe(100_000);
      expect(totals.receivableCreditMinor).toBe(0);
      expect(totals.refundedMinor).toBe(100_000);
      expect(totals.refundMinor).toBe(
        totals.receivableCreditMinor + totals.refundedMinor,
      );

      // Exactly one version-guarded sale_return movement restocked the batch by one.
      const movements = await fixtureClient.inventoryMovement.findMany({
        where: { referenceType: "return", referenceId: draft.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        movementType: "sale_return",
        quantity: 1,
        stockBatchId: ids.batch,
        stockLocationId: ids.location,
      });
      const batchAfterReturn = await fixtureClient.stockBatch.findUniqueOrThrow(
        {
          where: { id: ids.batch },
        },
      );
      expect(batchAfterReturn.quantityOnHand).toBe(
        batchAfterSale.quantityOnHand + 1,
      );
      expect(batchAfterReturn.version).toBe(batchAfterSale.version + 1);

      // The return/refund ledger group is balanced (Σ debit === Σ credit).
      const entries = await fixtureClient.financialEntry.findMany({
        where: { organizationId: ids.organization, entryGroupId: draft.id },
      });
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(["return", "refund"]).toContain(entry.sourceType);
      }
      const debit = entries
        .filter((entry) => entry.direction === "debit")
        .reduce((sum, entry) => sum + entry.amountMinor, 0n);
      const credit = entries
        .filter((entry) => entry.direction === "credit")
        .reduce((sum, entry) => sum + entry.amountMinor, 0n);
      expect(debit).toBe(credit);
      // Revenue reversal 100_000 + inventory restock 60_000 on each side.
      expect(debit).toBe(160_000n);

      // A refund row records exactly the externally settled amount.
      const refund = await fixtureClient.refund.findFirstOrThrow({
        where: { returnId: draft.id },
      });
      expect(refund.amountMinor).toBe(BigInt(totals.refundedMinor));
      expect(refund.amountMinor).toBe(100_000n);
      expect(refund.paymentMethod).toBe("bank_transfer");

      // The original sale is now fully returned and every frozen snapshot is intact.
      const saleAfter = await fixtureClient.sale.findUniqueOrThrow({
        where: { id: saleId },
        select: {
          status: true,
          version: true,
          subtotalMinor: true,
          totalMinor: true,
          cogsMinor: true,
          grossProfitMinor: true,
          receiptSnapshot: true,
        },
      });
      expect(saleBefore.status).toBe("posted");
      expect(saleAfter.status).toBe("returned");
      expect(saleAfter.version).toBe(saleBefore.version + 1);
      expect(saleAfter.subtotalMinor).toBe(saleBefore.subtotalMinor);
      expect(saleAfter.totalMinor).toBe(saleBefore.totalMinor);
      expect(saleAfter.cogsMinor).toBe(saleBefore.cogsMinor);
      expect(saleAfter.grossProfitMinor).toBe(saleBefore.grossProfitMinor);
      expect(saleAfter.receiptSnapshot).toEqual(saleBefore.receiptSnapshot);
    });

    it("replays the same return post idempotently with no second refund, movement, or restock", async () => {
      const refundsBefore = await fixtureClient.refund.count({
        where: { returnId: happyReturnId },
      });
      const movementsBefore = await fixtureClient.inventoryMovement.count({
        where: { referenceType: "return", referenceId: happyReturnId },
      });
      const batchBefore = await fixtureClient.stockBatch.findUniqueOrThrow({
        where: { id: ids.batch },
      });

      const replay = await returnsService.post(
        returnsContext,
        happyReturnId,
        happyIdempotencyKey,
        happyPostInput,
      );
      expect(replay.idempotencyReplay).toBe(true);
      expect(replay.return.status).toBe("posted");

      expect(
        await fixtureClient.refund.count({
          where: { returnId: happyReturnId },
        }),
      ).toBe(refundsBefore);
      expect(
        await fixtureClient.inventoryMovement.count({
          where: { referenceType: "return", referenceId: happyReturnId },
        }),
      ).toBe(movementsBefore);
      const batchAfter = await fixtureClient.stockBatch.findUniqueOrThrow({
        where: { id: ids.batch },
      });
      expect(batchAfter.quantityOnHand).toBe(batchBefore.quantityOnHand);
      expect(batchAfter.version).toBe(batchBefore.version);
    });

    it("requires an authorized override to post once the return window has elapsed", async () => {
      // Freeze a zero-day return window onto just this sale by seeding the policy
      // setting the sale reads at post time, then removing it so later sales are
      // unaffected. A zero-day window is already elapsed by the time the return is
      // posted, which is what the override path must guard.
      const settingId = randomUUID();
      await fixtureClient.applicationSetting.create({
        data: {
          id: settingId,
          organizationId: ids.organization,
          branchId: ids.branch,
          key: "sales.return_window_days",
          value: 0,
        },
      });
      const { saleId, saleLineId } = await postQuantitySale(salesContext, ids, {
        reference: "BANK-RETURN-EXPIRED",
      });
      await fixtureClient.applicationSetting.delete({
        where: { id: settingId },
      });

      const draft = await returnsService.createDraft(returnsContext, {
        saleId,
        reason: "Customer returned after the policy window",
        evidenceNote: "Device brought back outside the zero-day return window",
        lines: [
          {
            trackingType: "quantity",
            saleLineId,
            quantity: 1,
            condition: "faulty",
          },
        ],
      });

      const batchBefore = await fixtureClient.stockBatch.findUniqueOrThrow({
        where: { id: ids.batch },
      });

      // Without an override reason the closed window blocks the post and rolls back.
      await expect(
        returnsService.post(returnsContext, draft.id, randomUUID(), {
          version: draft.version,
          refund: { method: "bank_transfer", reference: "BANK-REFUND-EXPIRED" },
          policyOverrideReason: null,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.RETURN_WINDOW_EXPIRED });
      expect(
        await fixtureClient.inventoryMovement.count({
          where: { referenceType: "return", referenceId: draft.id },
        }),
      ).toBe(0);
      expect(
        await fixtureClient.stockBatch.findUniqueOrThrow({
          where: { id: ids.batch },
        }),
      ).toMatchObject({
        quantityOnHand: batchBefore.quantityOnHand,
        version: batchBefore.version,
      });

      // With an authorized override reason the same draft posts and records it.
      const overridden = await returnsService.post(
        returnsContext,
        draft.id,
        randomUUID(),
        {
          version: draft.version,
          refund: { method: "bank_transfer", reference: "BANK-REFUND-EXPIRED" },
          policyOverrideReason: "Store manager approved a goodwill return",
        },
      );
      expect(overridden.return.status).toBe("posted");
      expect(overridden.return.policy.expired).toBe(true);
      expect(overridden.return.policy.overridden).toBe(true);
      expect(overridden.return.policy.overrideReason).toBe(
        "Store manager approved a goodwill return",
      );
      expect(
        await fixtureClient.inventoryMovement.count({
          where: { referenceType: "return", referenceId: draft.id },
        }),
      ).toBe(1);
      const batchAfter = await fixtureClient.stockBatch.findUniqueOrThrow({
        where: { id: ids.batch },
      });
      expect(batchAfter.quantityOnHand).toBe(batchBefore.quantityOnHand + 1);
      expect(batchAfter.version).toBe(batchBefore.version + 1);
    });

    it("rejects a return line quantity greater than what remains sold", async () => {
      const { saleId, saleLineId } = await postQuantitySale(salesContext, ids, {
        reference: "BANK-RETURN-EXCESS",
      });

      // Only one unit was sold, so a draft asking for two exceeds what is returnable.
      await expect(
        returnsService.createDraft(returnsContext, {
          saleId,
          reason: "Customer wants to return more than was purchased",
          evidenceNote: "Requested two units although only one was ever sold",
          lines: [
            {
              trackingType: "quantity",
              saleLineId,
              quantity: 2,
              condition: "faulty",
            },
          ],
        }),
      ).rejects.toMatchObject({
        code: ERROR_CODES.RETURN_QUANTITY_EXCEEDS_SOLD,
      });
    });

    it("never leaks a return-eligible sale across tenants", async () => {
      // The foreign sale is real and returnable inside its own organization, yet the
      // primary tenant's actor must see it as if it does not exist.
      await expect(
        returnsService.eligibility(returnsContext, {
          saleId: foreignSale.saleId,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });

      await expect(
        returnsService.createDraft(returnsContext, {
          saleId: foreignSale.saleId,
          reason: "Attempted cross-tenant return",
          evidenceNote: "Referencing a sale owned by a different organization",
          lines: [
            {
              trackingType: "quantity",
              saleLineId: foreignSale.saleLineId,
              quantity: 1,
              condition: "faulty",
            },
          ],
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
    });
  },
);
