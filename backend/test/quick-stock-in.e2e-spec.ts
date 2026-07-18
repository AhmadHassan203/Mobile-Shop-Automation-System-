import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { VersioningType, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage } from "@nestjs/throttler";
import {
  createPrismaClient,
  type Prisma,
  type PrismaClient,
} from "@mobileshop/database";
import {
  API_VERSION,
  IDEMPOTENCY_KEY_HEADER,
  PERMISSIONS,
  type PermissionKey,
} from "@mobileshop/shared";
import cookieParser from "cookie-parser";
import { parse } from "dotenv";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "@/app.module";
import { PrismaService } from "@/database/prisma.service";
import { hashSessionToken } from "@/modules/auth/auth-crypto";

/**
 * Quick Stock In over a real PostgreSQL transaction.
 *
 * The whole one-action flow (reuse/create product + supplier, purchase order,
 * approval, goods receipt, stock batch, purchase_receive movement, supplier
 * payable, payment split and selling price) runs through the real AppModule,
 * guards, pipes and Prisma against `mobileshop_test`. Every test is wrapped in a
 * transaction that is always rolled back, so the database is left untouched.
 */

const SESSION_SECRET = "test-session-secret-not-used-outside-tests-0123456789";
const REAL_TOKEN = "r".repeat(43);
const NOW = new Date("2026-07-16T09:00:00.000Z");

// Baseline grants + the conditional grants Quick Stock In needs for new
// product/supplier creation and safe serialized conversion.
const QUICK_STOCK_IN_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.PURCHASES_CREATE,
  PERMISSIONS.PURCHASES_RECEIVE,
  PERMISSIONS.PRICING_MANAGE,
  PERMISSIONS.CATALOG_CREATE,
  PERMISSIONS.CATALOG_UPDATE,
  PERMISSIONS.SUPPLIERS_MANAGE,
];

function signedCookie(token: string): string {
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(token)
    .digest("base64")
    .replace(/=+$/u, "");
  return `mshop_session=${encodeURIComponent(`s:${token}.${signature}`)}`;
}

function authUser(
  permissions: readonly PermissionKey[],
  ids: {
    organizationId: string;
    branchId: string;
    userId: string;
    roleId: string;
  },
) {
  return {
    id: ids.userId,
    organizationId: ids.organizationId,
    email: "quick-stock@mobileshop.local",
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$notused$notused",
    fullName: "Quick Stock Tester",
    phone: null,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    organization: {
      id: ids.organizationId,
      name: "Quick Stock Org",
      currency: "PKR",
      timezone: "Asia/Karachi",
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    userRoles: [
      {
        id: randomUUID(),
        organizationId: ids.organizationId,
        userId: ids.userId,
        roleId: ids.roleId,
        assignedAt: NOW,
        assignedBy: null,
        role: {
          id: ids.roleId,
          organizationId: ids.organizationId,
          code: "purchaser",
          name: "Purchaser",
          description: null,
          isSystem: true,
          createdAt: NOW,
          updatedAt: NOW,
          rolePermissions: permissions.map((key) => ({
            id: randomUUID(),
            roleId: ids.roleId,
            permissionId: randomUUID(),
            grantedAt: NOW,
            permission: {
              id: randomUUID(),
              key,
              resource: key.split(".")[0],
              action: key.split(".")[1],
              description: null,
              createdAt: NOW,
            },
          })),
        },
      },
    ],
    scopeAccess: [
      {
        id: randomUUID(),
        organizationId: ids.organizationId,
        userId: ids.userId,
        branchId: ids.branchId,
        locationId: null,
        createdAt: NOW,
      },
    ],
  };
}

function sessionWith(
  permissions: readonly PermissionKey[],
  ids: { organizationId: string; branchId: string; userId: string },
) {
  const roleId = randomUUID();
  return {
    id: randomUUID(),
    organizationId: ids.organizationId,
    userId: ids.userId,
    tokenHash: hashSessionToken(REAL_TOKEN),
    branchId: ids.branchId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    ipAddress: "127.0.0.1",
    userAgent: "quick-stock-http-test",
    createdAt: NOW,
    lastSeenAt: new Date(),
    branch: {
      id: ids.branchId,
      organizationId: ids.organizationId,
      code: "MAIN",
      name: "Main Branch",
      isDefault: true,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    user: authUser(permissions, { ...ids, roleId }),
  };
}

function createNestApp(prismaValue: object): Promise<INestApplication> {
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaValue)
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: () =>
        Promise.resolve({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
    })
    .compile()
    .then(async (moduleRef) => {
      const app = moduleRef.createNestApplication({ logger: false });
      app.use(cookieParser(SESSION_SECRET));
      app.setGlobalPrefix("api");
      app.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: API_VERSION.replace("v", ""),
      });
      await app.init();
      return app;
    });
}

function testMigrationDatabaseUrl(): string {
  const workspaceRoot =
    path.basename(process.cwd()).toLowerCase() === "backend"
      ? path.resolve(process.cwd(), "..")
      : process.cwd();
  const environmentPath = path.join(workspaceRoot, ".env");
  const fileEnvironment = existsSync(environmentPath)
    ? parse(readFileSync(environmentPath))
    : {};
  const value =
    process.env.TEST_MIGRATION_DATABASE_URL ??
    fileEnvironment.TEST_MIGRATION_DATABASE_URL;
  if (!value) {
    throw new Error(
      "TEST_MIGRATION_DATABASE_URL is required for Quick Stock In integration tests",
    );
  }
  const database = new URL(value).pathname.replace(/^\//u, "");
  if (database !== "mobileshop_test") {
    throw new Error(`Refusing to run Quick Stock In tests against ${database}`);
  }
  return value;
}

class RollbackRealFixture extends Error {}

describe("Quick Stock In (real PostgreSQL HTTP)", () => {
  let app: INestApplication;
  let database: PrismaClient;
  let currentTransaction: Prisma.TransactionClient | undefined;
  let currentSession: ReturnType<typeof sessionWith> | undefined;
  let savepointSequence = 0;

  const sessionDelegate = {
    findUnique: () => Promise.resolve(currentSession ?? null),
    updateMany: () => Promise.resolve({ count: 1 }),
  };

  const clientProxy = new Proxy({} as PrismaClient, {
    get: (_target, property) => {
      if (property === "session") return sessionDelegate;
      const transaction = currentTransaction;
      if (transaction === undefined) {
        throw new Error(
          "A Quick Stock In request escaped its test transaction",
        );
      }
      if (property === "$transaction") {
        return async (argument: unknown): Promise<unknown> => {
          if (typeof argument !== "function") {
            return Promise.all(argument as Promise<unknown>[]);
          }
          savepointSequence += 1;
          const savepoint = `quick_stock_in_${savepointSequence}`;
          await transaction.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
          try {
            const result = await (
              argument as (tx: PrismaClient) => Promise<unknown>
            )(clientProxy);
            await transaction.$executeRawUnsafe(
              `RELEASE SAVEPOINT ${savepoint}`,
            );
            return result;
          } catch (error) {
            await transaction.$executeRawUnsafe(
              `ROLLBACK TO SAVEPOINT ${savepoint}`,
            );
            await transaction.$executeRawUnsafe(
              `RELEASE SAVEPOINT ${savepoint}`,
            );
            throw error;
          }
        };
      }
      const value = (transaction as unknown as Record<PropertyKey, unknown>)[
        property
      ];
      return typeof value === "function"
        ? (...args: unknown[]): unknown =>
            (value as (...values: unknown[]) => unknown).apply(
              transaction,
              args,
            )
        : value;
    },
  });

  async function withinRollback(
    work: (transaction: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await database.$transaction(
        async (transaction) => {
          currentTransaction = transaction;
          await work(transaction);
          throw new RollbackRealFixture();
        },
        { maxWait: 5_000, timeout: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackRealFixture)) throw error;
    } finally {
      currentTransaction = undefined;
      currentSession = undefined;
    }
  }

  async function seedFixture(transaction: Prisma.TransactionClient) {
    const fixture = {
      organizationId: randomUUID(),
      branchId: randomUUID(),
      otherBranchId: randomUUID(),
      userId: randomUUID(),
      locationId: randomUUID(),
      otherLocationId: randomUUID(),
      categoryId: randomUUID(),
      brandId: randomUUID(),
      modelId: randomUUID(),
      quantityVariantId: randomUUID(),
      serializedFreshVariantId: randomUUID(),
      serializedUsedVariantId: randomUUID(),
      serializedUnitId: randomUUID(),
      supplierId: randomUUID(),
    };
    await transaction.organization.create({
      data: {
        id: fixture.organizationId,
        name: `Quick Stock ${fixture.organizationId.slice(0, 8)}`,
      },
    });
    await transaction.branch.createMany({
      data: [
        {
          id: fixture.branchId,
          organizationId: fixture.organizationId,
          code: "MAIN",
          name: "Main Branch",
          isDefault: true,
        },
        {
          id: fixture.otherBranchId,
          organizationId: fixture.organizationId,
          code: "WARE",
          name: "Warehouse Branch",
          isDefault: false,
        },
      ],
    });
    await transaction.user.create({
      data: {
        id: fixture.userId,
        organizationId: fixture.organizationId,
        email: `quick-${fixture.userId.slice(0, 8)}@example.test`,
        passwordHash:
          "$argon2id$v=19$m=65536,t=3,p=4$notused$notused-for-http-test",
        fullName: "Quick Stock HTTP Tester",
      },
    });
    await transaction.stockLocation.createMany({
      data: [
        {
          id: fixture.locationId,
          organizationId: fixture.organizationId,
          branchId: fixture.branchId,
          code: "MAIN",
          name: "Main store",
          isDefault: true,
        },
        {
          id: fixture.otherLocationId,
          organizationId: fixture.organizationId,
          branchId: fixture.otherBranchId,
          code: "WARE",
          name: "Warehouse store",
          isDefault: true,
        },
      ],
    });
    await transaction.category.create({
      data: {
        id: fixture.categoryId,
        organizationId: fixture.organizationId,
        name: "Quick Products",
        slug: `quick-products-${fixture.categoryId.slice(0, 8)}`,
      },
    });
    await transaction.brand.create({
      data: {
        id: fixture.brandId,
        organizationId: fixture.organizationId,
        name: "Quick Brand",
        slug: `quick-brand-${fixture.brandId.slice(0, 8)}`,
      },
    });
    await transaction.productModel.create({
      data: {
        id: fixture.modelId,
        organizationId: fixture.organizationId,
        brandId: fixture.brandId,
        categoryId: fixture.categoryId,
        name: "Quick Model",
        canonicalName: `quick model ${fixture.modelId.slice(0, 8)}`,
      },
    });
    await transaction.productVariant.createMany({
      data: [
        {
          id: fixture.quantityVariantId,
          organizationId: fixture.organizationId,
          productModelId: fixture.modelId,
          sku: `QTY-${fixture.quantityVariantId.slice(0, 8).toUpperCase()}`,
          name: "Existing Case",
          trackingType: "quantity",
          condition: "new",
          ptaStatus: "not_applicable",
        },
        {
          id: fixture.serializedFreshVariantId,
          organizationId: fixture.organizationId,
          productModelId: fixture.modelId,
          sku: `SNF-${fixture.serializedFreshVariantId.slice(0, 8).toUpperCase()}`,
          name: "Serialized Phone (never transacted)",
          trackingType: "serialized",
          condition: "new",
          ptaStatus: "pta_approved",
        },
        {
          id: fixture.serializedUsedVariantId,
          organizationId: fixture.organizationId,
          productModelId: fixture.modelId,
          sku: `SNU-${fixture.serializedUsedVariantId.slice(0, 8).toUpperCase()}`,
          name: "Serialized Phone (with history)",
          trackingType: "serialized",
          condition: "new",
          ptaStatus: "pta_approved",
        },
      ],
    });
    // Give the "with history" serialized variant a real unit so it cannot be
    // safely converted to quantity.
    await transaction.serializedUnit.create({
      data: {
        id: fixture.serializedUnitId,
        organizationId: fixture.organizationId,
        branchId: fixture.branchId,
        productVariantId: fixture.serializedUsedVariantId,
        stockLocationId: fixture.locationId,
        state: "available",
        condition: "new",
        ptaStatus: "pta_approved",
      },
    });
    await transaction.supplier.create({
      data: {
        id: fixture.supplierId,
        organizationId: fixture.organizationId,
        code: `SUP-${fixture.supplierId.slice(0, 8).toUpperCase()}`,
        name: "Existing Supplier",
        paymentTermsDays: 30,
      },
    });
    currentSession = sessionWith(QUICK_STOCK_IN_PERMISSIONS, {
      organizationId: fixture.organizationId,
      branchId: fixture.branchId,
      userId: fixture.userId,
    });
    return fixture;
  }

  function post(body: Record<string, unknown>, idempotencyKey = randomUUID()) {
    return request(app.getHttpServer())
      .post("/api/v1/inventory/quick-stock-in")
      .set("Cookie", signedCookie(REAL_TOKEN))
      .set(IDEMPOTENCY_KEY_HEADER, idempotencyKey)
      .send(body);
  }

  function existingProductBody(
    fixture: Awaited<ReturnType<typeof seedFixture>>,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      product: {
        mode: "existing",
        productVariantId: fixture.quantityVariantId,
      },
      supplier: { mode: "existing", supplierId: fixture.supplierId },
      stockLocationId: fixture.locationId,
      quantity: 5,
      unitCostMinor: 42_000,
      sellingPriceMinor: 44_500,
      payment: { status: "paid_full", method: "cash" },
      ...overrides,
    };
  }

  beforeAll(async () => {
    database = createPrismaClient({
      connectionString: testMigrationDatabaseUrl(),
      maxConnections: 2,
    });
    app = await createNestApp({
      client: clientProxy,
      ping: () => Promise.resolve(undefined),
    });
  });

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
  });

  it("stocks an existing product paid in full: no remaining payable, POS-available, purchase_receive movement", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const response = await post(existingProductBody(fixture)).expect(201);

      expect(response.body).toMatchObject({
        product: { id: fixture.quantityVariantId, wasCreated: false },
        supplier: { id: fixture.supplierId, wasCreated: false },
        quantityAdded: 5,
        currentStockOnHand: 5,
        unitCostMinor: 42_000,
        purchaseTotalMinor: 210_000,
        sellingPriceMinor: 44_500,
        paymentStatus: "paid_full",
        paymentMethod: "cash",
        walletProvider: null,
        paidAmountMinor: 210_000,
        remainingPayableMinor: 0,
      });
      expect(response.body.purchaseOrderNumber).toMatch(/^PO-/);
      expect(response.body.goodsReceiptNumber).toMatch(/^GRN-/);

      // Stock only moved through a purchase_receive movement + batch.
      const movement = await transaction.inventoryMovement.findFirst({
        where: {
          organizationId: fixture.organizationId,
          productVariantId: fixture.quantityVariantId,
          movementType: "purchase_receive",
        },
        select: { quantity: true },
      });
      expect(movement?.quantity).toBe(5);
      const batch = await transaction.stockBatch.findFirst({
        where: {
          organizationId: fixture.organizationId,
          productVariantId: fixture.quantityVariantId,
          stockLocationId: fixture.locationId,
        },
        select: { quantityOnHand: true, actualCostMinor: true },
      });
      expect(batch?.quantityOnHand).toBe(5);
      expect(batch?.actualCostMinor).toBe(42_000n);
      // Fully paid -> settled payable.
      const payable = await transaction.payable.findFirst({
        where: {
          organizationId: fixture.organizationId,
          id: response.body.payableId as string,
        },
        select: { outstandingMinor: true, paidMinor: true, status: true },
      });
      expect(payable).toMatchObject({
        outstandingMinor: 0n,
        paidMinor: 210_000n,
        status: "paid",
      });
      // Selling price was set through the pricing domain.
      const variant = await transaction.productVariant.findFirst({
        where: { id: fixture.quantityVariantId },
        select: { defaultPriceMinor: true },
      });
      expect(variant?.defaultPriceMinor).toBe(44_500n);
    });
  });

  it("creates a new phone product + new supplier on credit without any IMEI", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const response = await post({
        product: {
          mode: "new",
          productName: "Galaxy A15",
          variantName: "Galaxy A15 8/256 Black",
          categoryId: fixture.categoryId,
          brandId: fixture.brandId,
        },
        supplier: {
          mode: "new",
          name: "Local Market Trader",
          paymentTermsDays: 0,
        },
        stockLocationId: fixture.locationId,
        quantity: 3,
        unitCostMinor: 4_200_000,
        sellingPriceMinor: 4_450_000,
        payment: { status: "credit" },
      }).expect(201);

      expect(response.body).toMatchObject({
        product: { name: "Galaxy A15 8/256 Black", wasCreated: true },
        supplier: { name: "Local Market Trader", wasCreated: true },
        quantityAdded: 3,
        currentStockOnHand: 3,
        paymentStatus: "credit",
        paymentMethod: null,
        paidAmountMinor: 0,
        remainingPayableMinor: 12_600_000,
      });
      // The created variant is quantity-tracked (no IMEI), immediately in stock.
      const created = await transaction.productVariant.findFirst({
        where: { id: response.body.product.id as string },
        select: { trackingType: true },
      });
      expect(created?.trackingType).toBe("quantity");
      const units = await transaction.serializedUnit.count({
        where: { productVariantId: response.body.product.id as string },
      });
      expect(units).toBe(0);
      // Credit -> full open payable.
      const payable = await transaction.payable.findFirst({
        where: { id: response.body.payableId as string },
        select: { outstandingMinor: true, status: true },
      });
      expect(payable).toMatchObject({
        outstandingMinor: 12_600_000n,
        status: "open",
      });
    });
  });

  it("records a partial bank-transfer payment with the correct remaining payable", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const response = await post(
        existingProductBody(fixture, {
          quantity: 2,
          unitCostMinor: 100_000, // total 200,000
          payment: {
            status: "partial",
            method: "bank_transfer",
            amountPaidMinor: 50_000,
          },
        }),
      ).expect(201);
      expect(response.body).toMatchObject({
        paymentStatus: "partial",
        paymentMethod: "bank_transfer",
        paidAmountMinor: 50_000,
        remainingPayableMinor: 150_000,
      });
      const payable = await transaction.payable.findFirst({
        where: { id: response.body.payableId as string },
        select: { paidMinor: true, outstandingMinor: true, status: true },
      });
      expect(payable).toMatchObject({
        paidMinor: 50_000n,
        outstandingMinor: 150_000n,
        status: "partially_paid",
      });
    });
  });

  it("records a JazzCash wallet payment and preserves the provider", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const response = await post(
        existingProductBody(fixture, {
          payment: {
            status: "paid_full",
            method: "digital_wallet",
            walletProvider: "jazzcash",
            reference: "JC-123",
          },
        }),
      ).expect(201);
      expect(response.body).toMatchObject({
        paymentStatus: "paid_full",
        paymentMethod: "digital_wallet",
        walletProvider: "jazzcash",
        remainingPayableMinor: 0,
      });
    });
  });

  it("rejects a serialized product that already has unit history", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const response = await post(
        existingProductBody(fixture, {
          product: {
            mode: "existing",
            productVariantId: fixture.serializedUsedVariantId,
          },
        }),
      ).expect(422);
      expect(response.body.code).toBe("VALIDATION_FAILED");
      // The serialized variant is untouched (still serialized, no batch).
      const variant = await transaction.productVariant.findFirst({
        where: { id: fixture.serializedUsedVariantId },
        select: { trackingType: true },
      });
      expect(variant?.trackingType).toBe("serialized");
    });
  });

  it("rejects an existing serialized product even with no history (tracking type is DB-immutable)", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const response = await post(
        existingProductBody(fixture, {
          product: {
            mode: "existing",
            productVariantId: fixture.serializedFreshVariantId,
          },
        }),
      ).expect(422);
      expect(response.body.code).toBe("VALIDATION_FAILED");
      // Left untouched: still serialized, no batch created.
      const variant = await transaction.productVariant.findFirst({
        where: { id: fixture.serializedFreshVariantId },
        select: { trackingType: true },
      });
      expect(variant?.trackingType).toBe("serialized");
      const batch = await transaction.stockBatch.findFirst({
        where: {
          organizationId: fixture.organizationId,
          productVariantId: fixture.serializedFreshVariantId,
        },
        select: { quantityOnHand: true },
      });
      expect(batch).toBeNull();
    });
  });

  it("is idempotent: same key + same payload replays the original result", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const key = randomUUID();
      const first = await post(existingProductBody(fixture), key).expect(201);
      const second = await post(existingProductBody(fixture), key).expect(201);
      expect(second.body.goodsReceiptId).toBe(first.body.goodsReceiptId);
      // Only ONE receipt movement was ever posted.
      const movements = await transaction.inventoryMovement.count({
        where: {
          organizationId: fixture.organizationId,
          productVariantId: fixture.quantityVariantId,
          movementType: "purchase_receive",
        },
      });
      expect(movements).toBe(1);
    });
  });

  it("rejects the same idempotency key with a different payload", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const key = randomUUID();
      await post(existingProductBody(fixture), key).expect(201);
      const conflict = await post(
        existingProductBody(fixture, { quantity: 9 }),
        key,
      ).expect(409);
      expect(conflict.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });
  });

  it("rejects a stock location in another branch", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      await post(
        existingProductBody(fixture, {
          stockLocationId: fixture.otherLocationId,
        }),
      ).expect(404);
    });
  });

  it("forbids a caller without pricing permission", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      currentSession = sessionWith(
        [PERMISSIONS.PURCHASES_CREATE, PERMISSIONS.PURCHASES_RECEIVE],
        {
          organizationId: fixture.organizationId,
          branchId: fixture.branchId,
          userId: fixture.userId,
        },
      );
      await post(existingProductBody(fixture)).expect(403);
    });
  });

  it("forbids creating a new product without catalog.create", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      currentSession = sessionWith(
        [
          PERMISSIONS.PURCHASES_CREATE,
          PERMISSIONS.PURCHASES_RECEIVE,
          PERMISSIONS.PRICING_MANAGE,
        ],
        {
          organizationId: fixture.organizationId,
          branchId: fixture.branchId,
          userId: fixture.userId,
        },
      );
      await post({
        product: {
          mode: "new",
          productName: "Blocked",
          variantName: "Blocked base",
          categoryId: fixture.categoryId,
          brandId: fixture.brandId,
        },
        supplier: { mode: "existing", supplierId: fixture.supplierId },
        stockLocationId: fixture.locationId,
        quantity: 1,
        unitCostMinor: 1_000,
        sellingPriceMinor: 1_500,
        payment: { status: "credit" },
      }).expect(403);
    });
  });
});
