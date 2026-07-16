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
  ERROR_CODES,
  IDEMPOTENCY_KEY_HEADER,
  PERMISSIONS,
  type PermissionKey,
} from "@mobileshop/shared";
import cookieParser from "cookie-parser";
import { parse } from "dotenv";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppModule } from "@/app.module";
import { PrismaService } from "@/database/prisma.service";
import { hashSessionToken } from "@/modules/auth/auth-crypto";

/**
 * Canonical HTTP contract for suppliers, purchase orders and receiving.
 *
 * The first suite assembles the real AppModule/guard/pipe/filter chain around
 * an observable Prisma boundary. Rejected requests therefore prove that no
 * business write reached PostgreSQL. The final suite runs the same HTTP stack
 * over a real PostgreSQL transaction, forcing deferred receipt checks before
 * rolling the fixture back.
 */

const SESSION_SECRET = "test-session-secret-not-used-outside-tests-0123456789";
const MOCK_TOKEN = "p".repeat(43);
const REAL_TOKEN = "r".repeat(43);
const NOW = new Date("2026-07-16T09:00:00.000Z");
const TRUSTED_ORIGIN = "http://localhost:3000";
const HOSTILE_ORIGIN = "https://hostile.example";

const IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  user: "20000000-0000-4000-8000-000000000001",
  role: "40000000-0000-4000-8000-000000000001",
  supplier: "71000000-0000-4000-8000-000000000001",
  supplierContact: "71000000-0000-4000-8000-000000000002",
  purchaseOrder: "72000000-0000-4000-8000-000000000001",
  purchaseOrderLine: "72000000-0000-4000-8000-000000000002",
  quantityVariant: "73000000-0000-4000-8000-000000000001",
  serializedVariant: "73000000-0000-4000-8000-000000000002",
  location: "74000000-0000-4000-8000-000000000001",
  receipt: "75000000-0000-4000-8000-000000000001",
  receiptLine: "75000000-0000-4000-8000-000000000002",
  unit: "76000000-0000-4000-8000-000000000001",
  batch: "77000000-0000-4000-8000-000000000001",
  payable: "78000000-0000-4000-8000-000000000001",
  sequence: "79000000-0000-4000-8000-000000000001",
  foreign: "99999999-0000-4000-8000-000000000009",
});

function signedCookie(token: string): string {
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(token)
    .digest("base64")
    .replace(/=+$/u, "");
  return `mshop_session=${encodeURIComponent(`s:${token}.${signature}`)}`;
}

const organization = {
  id: IDS.organization,
  name: "MobileShop",
  currency: "PKR",
  timezone: "Asia/Karachi",
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const branch = {
  id: IDS.branch,
  organizationId: IDS.organization,
  code: "MAIN",
  name: "Main Branch",
  addressLine: null,
  city: "Lahore",
  phone: null,
  isDefault: true,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function authUserWith(
  permissions: readonly PermissionKey[],
  ids: {
    readonly organizationId?: string;
    readonly branchId?: string;
    readonly userId?: string;
    readonly roleId?: string;
    readonly locationId?: string | null;
  } = {},
) {
  const organizationId = ids.organizationId ?? IDS.organization;
  const branchId = ids.branchId ?? IDS.branch;
  const userId = ids.userId ?? IDS.user;
  const roleId = ids.roleId ?? IDS.role;
  const locationId = ids.locationId ?? null;
  return {
    id: userId,
    organizationId,
    email: "purchaser@mobileshop.local",
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$notused$notused",
    fullName: "Purchasing Manager",
    phone: null,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    organization: { ...organization, id: organizationId },
    userRoles: [
      {
        id: randomUUID(),
        organizationId,
        userId,
        roleId,
        assignedAt: NOW,
        assignedBy: null,
        role: {
          id: roleId,
          organizationId,
          code: "purchaser",
          name: "Purchaser",
          description: null,
          isSystem: true,
          createdAt: NOW,
          updatedAt: NOW,
          rolePermissions: permissions.map((key) => ({
            id: randomUUID(),
            roleId,
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
        organizationId,
        userId,
        branchId,
        locationId,
        createdAt: NOW,
      },
    ],
  };
}

function sessionWith(
  permissions: readonly PermissionKey[],
  options: {
    readonly token?: string;
    readonly organizationId?: string;
    readonly branchId?: string;
    readonly userId?: string;
    readonly locationId?: string;
  } = {},
) {
  const organizationId = options.organizationId ?? IDS.organization;
  const branchId = options.branchId ?? IDS.branch;
  const userId = options.userId ?? IDS.user;
  return {
    id: randomUUID(),
    organizationId,
    userId,
    tokenHash: hashSessionToken(options.token ?? MOCK_TOKEN),
    branchId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    ipAddress: "127.0.0.1",
    userAgent: "purchasing-http-test",
    createdAt: NOW,
    lastSeenAt: new Date(),
    branch: {
      ...branch,
      id: branchId,
      organizationId,
    },
    user: authUserWith(permissions, {
      organizationId,
      branchId,
      userId,
      locationId: options.locationId ?? null,
    }),
  };
}

const ALL_PURCHASING_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.SUPPLIERS_VIEW,
  PERMISSIONS.SUPPLIERS_MANAGE,
  PERMISSIONS.PURCHASES_VIEW,
  PERMISSIONS.PURCHASES_CREATE,
  PERMISSIONS.PURCHASES_APPROVE,
  PERMISSIONS.PURCHASES_RECEIVE,
];

const contactRow = {
  id: IDS.supplierContact,
  name: "Sara Khan",
  role: "Sales",
  phone: "+923001234567",
  email: "sara@supplier.example",
  isPrimary: true,
};

function supplierRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.supplier,
    code: "SUP-001",
    name: "Reliable Mobiles",
    paymentTermsDays: 30,
    leadTimeDays: 5,
    onTimeRateBasisPoints: 9_500,
    addressLine: "Hall Road",
    city: "Lahore",
    notes: null,
    isActive: true,
    version: 5,
    createdAt: NOW,
    updatedAt: NOW,
    contacts: [contactRow],
    ...overrides,
  };
}

const nestedSupplier = {
  id: IDS.supplier,
  code: "SUP-001",
  name: "Reliable Mobiles",
};

const quantityVariant = {
  id: IDS.quantityVariant,
  sku: "CASE-001",
  name: "Protective case",
  trackingType: "quantity" as const,
  condition: "new" as const,
  ptaStatus: "not_applicable" as const,
};

const serializedVariant = {
  id: IDS.serializedVariant,
  sku: "PHONE-001",
  name: "Smartphone 8/256",
  trackingType: "serialized" as const,
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
};

function purchaseOrderRow(
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
    id: IDS.purchaseOrder,
    number: "PO-000001",
    supplier: nestedSupplier,
    status,
    orderDate: new Date("2026-07-16T00:00:00.000Z"),
    expectedOn: new Date("2030-01-01T00:00:00.000Z"),
    notes: "Initial stocking order",
    approvedAt:
      status === "approved" ||
      status === "ordered" ||
      status === "partially_received" ||
      status === "received" ||
      status === "closed"
        ? NOW
        : null,
    orderedAt:
      status === "ordered" ||
      status === "partially_received" ||
      status === "received" ||
      status === "closed"
        ? NOW
        : null,
    closedAt: status === "closed" ? NOW : null,
    cancelledAt: status === "cancelled" ? NOW : null,
    version,
    createdAt: NOW,
    updatedAt: NOW,
    lines: [
      {
        id: IDS.purchaseOrderLine,
        productVariant: quantityVariant,
        quantityOrdered: 2,
        quantityReceived: 0,
        unitCostMinor: 1_000n,
        notes: null,
      },
    ],
  };
}

function receiptRow() {
  return {
    id: IDS.receipt,
    number: "GRN-000001",
    supplierInvoiceReference: "INV-001",
    receivedAt: NOW,
    actualCostTotalMinor: 100_000n,
    landedCostTotalMinor: 100_500n,
    payableTotalMinor: 100_000n,
    createdAt: NOW,
    purchaseOrder: { id: IDS.purchaseOrder, number: "PO-000001" },
    supplier: nestedSupplier,
    invoiceDueOn: new Date("2030-01-01T00:00:00.000Z"),
    notes: null,
    landedCosts: [
      {
        id: randomUUID(),
        kind: "freight" as const,
        amountMinor: 500n,
        reference: null,
        notes: null,
      },
    ],
    payable: {
      id: IDS.payable,
      dueOn: new Date("2030-01-01T00:00:00.000Z"),
      amountMinor: 100_000n,
      outstandingMinor: 100_000n,
      status: "open" as const,
    },
    lines: [
      {
        id: IDS.receiptLine,
        purchaseOrderLineId: IDS.purchaseOrderLine,
        quantityReceived: 1,
        unitCostMinor: 100_000n,
        actualCostTotalMinor: 100_000n,
        landedCostAllocatedMinor: 500n,
        landedCostTotalMinor: 100_500n,
        stockBatchId: null,
        productVariant: serializedVariant,
        stockLocation: {
          id: IDS.location,
          code: "MAIN",
          name: "Main store",
        },
        serializedUnits: [
          {
            id: IDS.unit,
            actualCostMinor: 100_000n,
            landedCostMinor: 100_500n,
            identifiers: [
              {
                identifierType: "imei" as const,
                position: 1,
                normalizedValue: "356938035643809",
              },
            ],
          },
        ],
      },
    ],
  };
}

function supplierBody(overrides: Record<string, unknown> = {}) {
  return {
    code: "SUP-001",
    name: "Reliable Mobiles",
    contacts: [
      {
        name: "Sara Khan",
        role: "Sales",
        phone: "+923001234567",
        email: "sara@supplier.example",
        isPrimary: true,
      },
    ],
    paymentTermsDays: 30,
    leadTimeDays: 5,
    addressLine: "Hall Road",
    city: "Lahore",
    notes: null,
    ...overrides,
  };
}

function supplierUpdateBody(overrides: Record<string, unknown> = {}) {
  return { ...supplierBody(), version: 5, ...overrides };
}

function purchaseOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    supplierId: IDS.supplier,
    expectedOn: "2030-01-01",
    notes: "Initial stocking order",
    lines: [
      {
        productVariantId: IDS.quantityVariant,
        quantity: 2,
        unitCostMinor: 1_000,
        notes: null,
      },
    ],
    ...overrides,
  };
}

function purchaseOrderUpdateBody(overrides: Record<string, unknown> = {}) {
  return { ...purchaseOrderBody(), version: 3, ...overrides };
}

function transitionBody(overrides: Record<string, unknown> = {}) {
  return { version: 3, reason: null, ...overrides };
}

function cancelBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    reason: "Supplier could not fulfil the order.",
    ...overrides,
  };
}

function quantityReceiptBody(overrides: Record<string, unknown> = {}) {
  return {
    purchaseOrderId: IDS.purchaseOrder,
    supplierInvoiceReference: "INV-001",
    invoiceDueOn: "2030-01-01",
    notes: null,
    landedCosts: [],
    lines: [
      {
        purchaseOrderLineId: IDS.purchaseOrderLine,
        trackingType: "quantity",
        stockLocationId: IDS.location,
        unitCostMinor: 1_000,
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

type HttpMethod = "get" | "post" | "patch";

interface Route {
  readonly name: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly permission: PermissionKey;
  readonly body?: Record<string, unknown>;
}

const ROUTES: readonly Route[] = [
  {
    name: "GET /suppliers",
    method: "get",
    path: "/api/v1/suppliers",
    permission: PERMISSIONS.SUPPLIERS_VIEW,
  },
  {
    name: "POST /suppliers",
    method: "post",
    path: "/api/v1/suppliers",
    permission: PERMISSIONS.SUPPLIERS_MANAGE,
    body: supplierBody(),
  },
  {
    name: "GET /suppliers/:id",
    method: "get",
    path: `/api/v1/suppliers/${IDS.supplier}`,
    permission: PERMISSIONS.SUPPLIERS_VIEW,
  },
  {
    name: "PATCH /suppliers/:id",
    method: "patch",
    path: `/api/v1/suppliers/${IDS.supplier}`,
    permission: PERMISSIONS.SUPPLIERS_MANAGE,
    body: supplierUpdateBody(),
  },
  {
    name: "POST /suppliers/:id/deactivate",
    method: "post",
    path: `/api/v1/suppliers/${IDS.supplier}/deactivate`,
    permission: PERMISSIONS.SUPPLIERS_MANAGE,
    body: { version: 5 },
  },
  {
    name: "POST /suppliers/:id/activate",
    method: "post",
    path: `/api/v1/suppliers/${IDS.supplier}/activate`,
    permission: PERMISSIONS.SUPPLIERS_MANAGE,
    body: { version: 5 },
  },
  {
    name: "GET /purchases",
    method: "get",
    path: "/api/v1/purchases",
    permission: PERMISSIONS.PURCHASES_VIEW,
  },
  {
    name: "POST /purchases",
    method: "post",
    path: "/api/v1/purchases",
    permission: PERMISSIONS.PURCHASES_CREATE,
    body: purchaseOrderBody(),
  },
  {
    name: "GET /purchases/:id",
    method: "get",
    path: `/api/v1/purchases/${IDS.purchaseOrder}`,
    permission: PERMISSIONS.PURCHASES_VIEW,
  },
  {
    name: "PATCH /purchases/:id",
    method: "patch",
    path: `/api/v1/purchases/${IDS.purchaseOrder}`,
    permission: PERMISSIONS.PURCHASES_CREATE,
    body: purchaseOrderUpdateBody(),
  },
  {
    name: "POST /purchases/:id/approve",
    method: "post",
    path: `/api/v1/purchases/${IDS.purchaseOrder}/approve`,
    permission: PERMISSIONS.PURCHASES_APPROVE,
    body: transitionBody(),
  },
  {
    name: "POST /purchases/:id/order",
    method: "post",
    path: `/api/v1/purchases/${IDS.purchaseOrder}/order`,
    permission: PERMISSIONS.PURCHASES_CREATE,
    body: transitionBody(),
  },
  {
    name: "POST /purchases/:id/cancel",
    method: "post",
    path: `/api/v1/purchases/${IDS.purchaseOrder}/cancel`,
    permission: PERMISSIONS.PURCHASES_APPROVE,
    body: cancelBody(),
  },
  {
    name: "POST /purchases/:id/close",
    method: "post",
    path: `/api/v1/purchases/${IDS.purchaseOrder}/close`,
    permission: PERMISSIONS.PURCHASES_APPROVE,
    body: transitionBody(),
  },
  {
    name: "GET /goods-receipts",
    method: "get",
    path: "/api/v1/goods-receipts",
    permission: PERMISSIONS.PURCHASES_VIEW,
  },
  {
    name: "POST /goods-receipts",
    method: "post",
    path: "/api/v1/goods-receipts",
    permission: PERMISSIONS.PURCHASES_RECEIVE,
    body: quantityReceiptBody(),
  },
  {
    name: "GET /goods-receipts/:id",
    method: "get",
    path: `/api/v1/goods-receipts/${IDS.receipt}`,
    permission: PERMISSIONS.PURCHASES_VIEW,
  },
];

const MUTATION_ROUTES = ROUTES.filter((route) => route.method !== "get");

interface ScopedRoute extends Route {
  readonly resource: "supplier" | "purchaseOrder" | "goodsReceipt";
}

const SCOPED_ID_ROUTES: readonly ScopedRoute[] = [
  ...ROUTES.filter((route) =>
    [
      "GET /suppliers/:id",
      "PATCH /suppliers/:id",
      "POST /suppliers/:id/deactivate",
      "POST /suppliers/:id/activate",
    ].includes(route.name),
  ).map((route) => ({ ...route, resource: "supplier" as const })),
  ...ROUTES.filter((route) =>
    [
      "GET /purchases/:id",
      "PATCH /purchases/:id",
      "POST /purchases/:id/approve",
      "POST /purchases/:id/order",
      "POST /purchases/:id/cancel",
      "POST /purchases/:id/close",
    ].includes(route.name),
  ).map((route) => ({ ...route, resource: "purchaseOrder" as const })),
  {
    ...ROUTES.find((route) => route.name === "GET /goods-receipts/:id")!,
    resource: "goodsReceipt" as const,
  },
];

const MALFORMED_ID_ROUTES = SCOPED_ID_ROUTES.map((route) => ({
  ...route,
  path: route.path.replace(
    /[0-9a-f]{8}-[0-9a-f-]{27,}/u,
    "definitely-not-a-uuid",
  ),
}));

const PURCHASING_TABLES = [
  "supplier",
  "supplierContact",
  "purchaseOrder",
  "purchaseOrderLine",
  "goodsReceipt",
  "goodsReceiptLandedCost",
  "goodsReceiptLine",
  "payable",
  "stockBatch",
  "serializedUnit",
  "deviceIdentifier",
  "inventoryMovement",
  "numberSequence",
  "auditEvent",
] as const;

const MUTATION_METHODS = [
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
] as const;

function tableMock() {
  return {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
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

describe("Purchasing endpoints (HTTP boundary)", () => {
  let app: INestApplication;
  let grantedPermissions: readonly PermissionKey[] = ALL_PURCHASING_PERMISSIONS;

  const client = {
    session: { findUnique: vi.fn(), updateMany: vi.fn() },
    supplier: tableMock(),
    supplierContact: tableMock(),
    purchaseOrder: tableMock(),
    purchaseOrderLine: tableMock(),
    goodsReceipt: tableMock(),
    goodsReceiptLandedCost: tableMock(),
    goodsReceiptLine: tableMock(),
    payable: tableMock(),
    stockLocation: tableMock(),
    productVariant: tableMock(),
    stockBatch: tableMock(),
    serializedUnit: tableMock(),
    deviceIdentifier: tableMock(),
    inventoryMovement: tableMock(),
    numberSequence: tableMock(),
    auditEvent: tableMock(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };

  function send(route: Pick<Route, "method" | "body"> & { path: string }) {
    const agent = request(app.getHttpServer());
    const pending =
      route.method === "get"
        ? agent.get(route.path)
        : route.method === "patch"
          ? agent.patch(route.path)
          : agent.post(route.path);
    return route.body === undefined ? pending : pending.send(route.body);
  }

  function authorized(
    route: Pick<Route, "method" | "body"> & { path: string },
    permissions: readonly PermissionKey[] = ALL_PURCHASING_PERMISSIONS,
  ) {
    grantedPermissions = permissions;
    const pending = send(route).set("Cookie", signedCookie(MOCK_TOKEN));
    return route.method === "post" && route.path === "/api/v1/goods-receipts"
      ? pending.set(IDEMPOTENCY_KEY_HEADER, randomUUID())
      : pending;
  }

  function expectNoBusinessWrite(): void {
    for (const table of PURCHASING_TABLES) {
      for (const method of MUTATION_METHODS) {
        expect(
          client[table][method],
          `${table}.${method} must not run for a rejected request`,
        ).not.toHaveBeenCalled();
      }
    }
    // An authorized receipt attempt may take its transaction-scoped retry-key
    // lock before discovering a hidden PO/location. That lock writes no
    // business data; no second raw call (sequence/batch mutation) is allowed.
    expect(client.$executeRaw.mock.calls.length).toBeLessThanOrEqual(1);
    if (client.$executeRaw.mock.calls.length === 1) {
      const template: unknown = client.$executeRaw.mock.calls[0]?.[0];
      expect(Array.isArray(template) ? template.join(" ") : "").toContain(
        "pg_advisory_xact_lock",
      );
    }
  }

  beforeAll(async () => {
    app = await createNestApp({
      client,
      ping: vi.fn().mockResolvedValue(undefined),
    });
  });

  beforeEach(() => {
    vi.resetAllMocks();
    grantedPermissions = ALL_PURCHASING_PERMISSIONS;
    client.session.findUnique.mockImplementation(() =>
      Promise.resolve(sessionWith(grantedPermissions)),
    );
    client.session.updateMany.mockResolvedValue({ count: 1 });
    client.$transaction.mockImplementation((argument: unknown) =>
      typeof argument === "function"
        ? (argument as (tx: unknown) => Promise<unknown>)(client)
        : Promise.all(argument as Promise<unknown>[]),
    );

    client.supplier.count.mockResolvedValue(1);
    client.supplier.findMany.mockResolvedValue([supplierRow()]);
    client.supplier.findFirst.mockResolvedValue(supplierRow());
    client.supplier.create.mockResolvedValue(supplierRow());
    client.supplier.updateMany.mockResolvedValue({ count: 1 });
    client.supplierContact.updateMany.mockResolvedValue({ count: 1 });
    client.supplierContact.createMany.mockResolvedValue({ count: 1 });

    client.purchaseOrder.count.mockResolvedValue(1);
    client.purchaseOrder.findMany.mockResolvedValue([purchaseOrderRow()]);
    client.purchaseOrder.findFirst.mockResolvedValue(purchaseOrderRow());
    client.purchaseOrder.create.mockResolvedValue({ id: IDS.purchaseOrder });
    client.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    client.purchaseOrderLine.deleteMany.mockResolvedValue({ count: 1 });
    client.purchaseOrderLine.createMany.mockResolvedValue({ count: 1 });
    client.purchaseOrderLine.updateMany.mockResolvedValue({ count: 1 });

    client.goodsReceipt.count.mockResolvedValue(1);
    client.goodsReceipt.findMany.mockResolvedValue([receiptRow()]);
    client.goodsReceipt.findFirst.mockImplementation(
      (parameters: { readonly where?: { readonly idempotencyKey?: string } }) =>
        Promise.resolve(
          parameters.where?.idempotencyKey === undefined ? receiptRow() : null,
        ),
    );
    client.inventoryMovement.findMany.mockResolvedValue([
      { serializedUnitId: IDS.unit, toState: "available" },
    ]);

    client.stockLocation.findMany.mockResolvedValue([{ id: IDS.location }]);
    client.productVariant.findMany.mockResolvedValue([
      { id: IDS.quantityVariant, isActive: true },
    ]);
    client.numberSequence.updateMany.mockResolvedValue({ count: 1 });
    client.auditEvent.create.mockResolvedValue({ id: randomUUID() });
    client.$executeRaw.mockResolvedValue(1);
    client.$queryRaw.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("authentication and exact permissions", () => {
    it.each(ROUTES.map((route) => [route.name, route] as const))(
      "returns 401 on %s without a session before a business write",
      async (_name, route) => {
        const response = await send(route).expect(401);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.AUTH_REQUIRED,
        });
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(client.session.findUnique).not.toHaveBeenCalled();
        expectNoBusinessWrite();
      },
    );

    it.each(ROUTES.map((route) => [route.name, route] as const))(
      "returns 403 on %s when its exact permission is absent",
      async (_name, route) => {
        const permissions = ALL_PURCHASING_PERMISSIONS.filter(
          (permission) => permission !== route.permission,
        );
        const response = await authorized(route, permissions).expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expectNoBusinessWrite();
      },
    );
  });

  describe("hostile browser origins", () => {
    it.each(MUTATION_ROUTES.map((route) => [route.name, route] as const))(
      "rejects %s before any purchasing or inventory write",
      async (_name, route) => {
        const response = await authorized(route)
          .set("Origin", HOSTILE_ORIGIN)
          .expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expect(response.headers["cache-control"]).toBe("no-store");
        expectNoBusinessWrite();
      },
    );

    it("admits the configured application origin", async () => {
      client.supplier.create.mockResolvedValue(supplierRow());

      await authorized({
        method: "post",
        path: "/api/v1/suppliers",
        body: supplierBody(),
      })
        .set("Origin", TRUSTED_ORIGIN)
        .expect(201);

      expect(client.supplier.create).toHaveBeenCalledOnce();
    });
  });

  describe("malformed identifiers", () => {
    it.each(MALFORMED_ID_ROUTES.map((route) => [route.name, route] as const))(
      "returns 422 on %s before any database write",
      async (_name, route) => {
        const response = await authorized(route).expect(422);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        expectNoBusinessWrite();
      },
    );
  });

  describe("strict request bodies", () => {
    const cases: ReadonlyArray<readonly [string, Route]> = [
      [
        "organizationId on supplier create",
        {
          name: "",
          method: "post",
          path: "/api/v1/suppliers",
          permission: PERMISSIONS.SUPPLIERS_MANAGE,
          body: supplierBody({ organizationId: IDS.foreign }),
        },
      ],
      [
        "branchId on supplier update",
        {
          name: "",
          method: "patch",
          path: `/api/v1/suppliers/${IDS.supplier}`,
          permission: PERMISSIONS.SUPPLIERS_MANAGE,
          body: supplierUpdateBody({ branchId: IDS.foreign }),
        },
      ],
      [
        "isActive on supplier deactivate",
        {
          name: "",
          method: "post",
          path: `/api/v1/suppliers/${IDS.supplier}/deactivate`,
          permission: PERMISSIONS.SUPPLIERS_MANAGE,
          body: { version: 5, isActive: false },
        },
      ],
      [
        "organizationId on supplier activate",
        {
          name: "",
          method: "post",
          path: `/api/v1/suppliers/${IDS.supplier}/activate`,
          permission: PERMISSIONS.SUPPLIERS_MANAGE,
          body: { version: 5, organizationId: IDS.foreign },
        },
      ],
      [
        "server-issued number on purchase create",
        {
          name: "",
          method: "post",
          path: "/api/v1/purchases",
          permission: PERMISSIONS.PURCHASES_CREATE,
          body: purchaseOrderBody({ number: "PO-FORGED" }),
        },
      ],
      [
        "server-derived total on purchase update",
        {
          name: "",
          method: "patch",
          path: `/api/v1/purchases/${IDS.purchaseOrder}`,
          permission: PERMISSIONS.PURCHASES_CREATE,
          body: purchaseOrderUpdateBody({ totalMinor: 1 }),
        },
      ],
      [
        "approval actor on approve",
        {
          name: "",
          method: "post",
          path: `/api/v1/purchases/${IDS.purchaseOrder}/approve`,
          permission: PERMISSIONS.PURCHASES_APPROVE,
          body: transitionBody({ approvedByUserId: IDS.foreign }),
        },
      ],
      [
        "status on order",
        {
          name: "",
          method: "post",
          path: `/api/v1/purchases/${IDS.purchaseOrder}/order`,
          permission: PERMISSIONS.PURCHASES_CREATE,
          body: transitionBody({ status: "received" }),
        },
      ],
      [
        "cancelledAt on cancel",
        {
          name: "",
          method: "post",
          path: `/api/v1/purchases/${IDS.purchaseOrder}/cancel`,
          permission: PERMISSIONS.PURCHASES_APPROVE,
          body: cancelBody({ cancelledAt: NOW.toISOString() }),
        },
      ],
      [
        "branchId on close",
        {
          name: "",
          method: "post",
          path: `/api/v1/purchases/${IDS.purchaseOrder}/close`,
          permission: PERMISSIONS.PURCHASES_APPROVE,
          body: transitionBody({ branchId: IDS.foreign }),
        },
      ],
      ...[
        ["organizationId", IDS.foreign],
        ["branchId", IDS.foreign],
        ["actualCostTotalMinor", 1],
        ["landedCostTotalMinor", 1],
        ["payableTotalMinor", 1],
      ].map(
        ([field, value]) =>
          [
            `${field} on goods receipt`,
            {
              name: "",
              method: "post" as const,
              path: "/api/v1/goods-receipts",
              permission: PERMISSIONS.PURCHASES_RECEIVE,
              body: quantityReceiptBody({ [field as string]: value }),
            },
          ] as const,
      ),
      [
        "derived line cost on goods receipt",
        {
          name: "",
          method: "post",
          path: "/api/v1/goods-receipts",
          permission: PERMISSIONS.PURCHASES_RECEIVE,
          body: quantityReceiptBody({
            lines: [
              {
                purchaseOrderLineId: IDS.purchaseOrderLine,
                trackingType: "quantity",
                stockLocationId: IDS.location,
                unitCostMinor: 1_000,
                quantity: 1,
                landedCostTotalMinor: 1,
              },
            ],
          }),
        },
      ],
    ];

    it.each(cases)("rejects %s as request smuggling", async (_label, route) => {
      const response = await authorized(route).expect(422);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      expectNoBusinessWrite();
    });
  });

  describe("goods receipt idempotency boundary", () => {
    it.each([undefined, "not-a-uuid"])(
      "rejects a %s idempotency key before the receiving service",
      async (key) => {
        const pending = send({
          method: "post",
          path: "/api/v1/goods-receipts",
          body: quantityReceiptBody(),
        }).set("Cookie", signedCookie(MOCK_TOKEN));
        if (key !== undefined) pending.set(IDEMPOTENCY_KEY_HEADER, key);

        const response = await pending.expect(422);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        expectNoBusinessWrite();
      },
    );
  });

  describe("tenant and branch scope", () => {
    it.each(SCOPED_ID_ROUTES.map((route) => [route.name, route] as const))(
      "returns a non-enumerating 404 on foreign %s",
      async (_name, route) => {
        const foreignRoute = {
          ...route,
          path: route.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/u, IDS.foreign),
        };
        client[route.resource].findFirst.mockResolvedValue(null);

        const response = await authorized(foreignRoute).expect(404);

        expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
        expect(response.status).not.toBe(403);
        expect(JSON.stringify(response.body)).not.toContain(IDS.foreign);
        expect(client[route.resource].findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: IDS.foreign,
              organizationId: IDS.organization,
              ...(route.resource === "supplier"
                ? {}
                : { branchId: IDS.branch }),
            }),
          }),
        );
        expectNoBusinessWrite();
      },
    );

    it("returns 404 when a PO create names a foreign supplier", async () => {
      client.supplier.findFirst.mockResolvedValue(null);

      const response = await authorized({
        method: "post",
        path: "/api/v1/purchases",
        body: purchaseOrderBody({ supplierId: IDS.foreign }),
      }).expect(404);

      expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expect(client.supplier.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: IDS.foreign, organizationId: IDS.organization },
        }),
      );
      expectNoBusinessWrite();
    });

    it("returns 404 when a PO create names a foreign product variant", async () => {
      client.productVariant.findMany.mockResolvedValue([]);

      const response = await authorized({
        method: "post",
        path: "/api/v1/purchases",
        body: purchaseOrderBody({
          lines: [
            {
              productVariantId: IDS.foreign,
              quantity: 1,
              unitCostMinor: 1_000,
            },
          ],
        }),
      }).expect(404);

      expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expectNoBusinessWrite();
    });

    it("returns 404 when receiving names a PO outside the branch", async () => {
      client.$queryRaw.mockResolvedValue([]);

      const response = await authorized({
        method: "post",
        path: "/api/v1/goods-receipts",
        body: quantityReceiptBody({ purchaseOrderId: IDS.foreign }),
      }).expect(404);

      expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expectNoBusinessWrite();
    });
  });

  describe("optimistic concurrency", () => {
    it.each([
      [
        "update",
        "patch",
        `/api/v1/suppliers/${IDS.supplier}`,
        supplierUpdateBody(),
      ],
      [
        "deactivate",
        "post",
        `/api/v1/suppliers/${IDS.supplier}/deactivate`,
        { version: 5 },
      ],
      [
        "activate",
        "post",
        `/api/v1/suppliers/${IDS.supplier}/activate`,
        { version: 5 },
      ],
    ] as const)(
      "returns 409 for a stale supplier %s",
      async (_operation, method, routePath, body) => {
        client.supplier.updateMany.mockResolvedValue({ count: 0 });

        const response = await authorized({
          method,
          path: routePath,
          body,
        }).expect(409);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
        });
        expect(client.supplierContact.updateMany).not.toHaveBeenCalled();
        expect(client.auditEvent.create).not.toHaveBeenCalled();
      },
    );

    it("returns 409 for a stale draft PO replacement", async () => {
      client.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });

      const response = await authorized({
        method: "patch",
        path: `/api/v1/purchases/${IDS.purchaseOrder}`,
        body: purchaseOrderUpdateBody(),
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      });
      expect(client.purchaseOrderLine.deleteMany).not.toHaveBeenCalled();
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });

    it("returns 409 for a stale PO lifecycle transition", async () => {
      client.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });

      const response = await authorized({
        method: "post",
        path: `/api/v1/purchases/${IDS.purchaseOrder}/approve`,
        body: transitionBody(),
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      });
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("successful boundary behavior", () => {
    it("creates a PO without touching stock, units or movements", async () => {
      client.$queryRaw.mockResolvedValueOnce([
        {
          id: IDS.sequence,
          prefix: "PO-",
          nextValue: 1,
          padding: 6,
          periodKey: null,
        },
      ]);

      const response = await authorized({
        method: "post",
        path: "/api/v1/purchases",
        body: purchaseOrderBody(),
      }).expect(201);

      expect(response.body).toMatchObject({
        id: IDS.purchaseOrder,
        number: "PO-000001",
        status: "draft",
        totalMinor: 2_000,
        totalUnits: 2,
        receivedUnits: 0,
      });
      expect(client.stockBatch.create).not.toHaveBeenCalled();
      expect(client.stockBatch.updateMany).not.toHaveBeenCalled();
      expect(client.serializedUnit.create).not.toHaveBeenCalled();
      expect(client.inventoryMovement.create).not.toHaveBeenCalled();
      expect(client.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: IDS.organization,
            branchId: IDS.branch,
            createdByUserId: IDS.user,
          }),
        }),
      );
    });

    it("returns tenant-scoped supplier, PO and receipt list contracts", async () => {
      const supplierResponse = await authorized({
        method: "get",
        path: "/api/v1/suppliers?page=1&pageSize=20",
      }).expect(200);
      const purchaseResponse = await authorized({
        method: "get",
        path: "/api/v1/purchases?page=1&pageSize=20",
      }).expect(200);
      const receiptResponse = await authorized({
        method: "get",
        path: "/api/v1/goods-receipts?page=1&pageSize=20",
      }).expect(200);

      expect(supplierResponse.body).toMatchObject({ total: 1, page: 1 });
      expect(purchaseResponse.body).toMatchObject({ total: 1, page: 1 });
      expect(receiptResponse.body).toMatchObject({ total: 1, page: 1 });
      expect(client.purchaseOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: IDS.organization,
            branchId: IDS.branch,
          }),
        }),
      );
      expect(client.goodsReceipt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: IDS.organization,
            branchId: IDS.branch,
          }),
        }),
      );
    });
  });
});

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
      "TEST_MIGRATION_DATABASE_URL is required for Purchasing HTTP integration tests",
    );
  }
  const database = new URL(value).pathname.replace(/^\//u, "");
  if (database !== "mobileshop_test") {
    throw new Error(
      `Refusing to run Purchasing HTTP tests against ${database}`,
    );
  }
  return value;
}

class RollbackRealFixture extends Error {}

describe("Purchasing receiving transaction (real PostgreSQL HTTP)", () => {
  let app: INestApplication;
  let database: PrismaClient;
  let currentTransaction: Prisma.TransactionClient | undefined;
  let currentSession: ReturnType<typeof sessionWith> | undefined;
  let hideIdentifierCollision = false;
  let savepointSequence = 0;

  const sessionDelegate = {
    findUnique: vi.fn(() => Promise.resolve(currentSession ?? null)),
    updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
  };

  const clientProxy = new Proxy({} as PrismaClient, {
    get: (_target, property) => {
      if (property === "session") return sessionDelegate;
      const transaction = currentTransaction;
      if (transaction === undefined) {
        throw new Error(
          "A real Purchasing request escaped its test transaction",
        );
      }
      if (property === "$transaction") {
        return async (argument: unknown): Promise<unknown> => {
          if (typeof argument !== "function") {
            return Promise.all(argument as Promise<unknown>[]);
          }
          savepointSequence += 1;
          const savepoint = `purchasing_http_${savepointSequence}`;
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
      if (property === "deviceIdentifier") {
        const delegate = value as Record<PropertyKey, unknown>;
        return new Proxy(delegate, {
          get: (delegate, method) => {
            if (method === "findMany" && hideIdentifierCollision) {
              return () => Promise.resolve([]);
            }
            const member = delegate[method];
            return typeof member === "function"
              ? (...args: unknown[]): unknown =>
                  (member as (...values: unknown[]) => unknown).apply(
                    delegate,
                    args,
                  )
              : member;
          },
        });
      }
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
      hideIdentifierCollision = false;
    }
  }

  async function seedFixture(transaction: Prisma.TransactionClient) {
    const fixture = {
      organizationId: randomUUID(),
      branchId: randomUUID(),
      userId: randomUUID(),
      locationId: randomUUID(),
      categoryId: randomUUID(),
      brandId: randomUUID(),
      modelId: randomUUID(),
      serializedVariantId: randomUUID(),
      quantityVariantId: randomUUID(),
    };
    await transaction.organization.create({
      data: {
        id: fixture.organizationId,
        name: `Purchasing HTTP ${fixture.organizationId.slice(0, 8)}`,
      },
    });
    await transaction.branch.create({
      data: {
        id: fixture.branchId,
        organizationId: fixture.organizationId,
        code: "MAIN",
        name: "Main Branch",
        isDefault: true,
      },
    });
    await transaction.user.create({
      data: {
        id: fixture.userId,
        organizationId: fixture.organizationId,
        email: `purchaser-${fixture.userId.slice(0, 8)}@example.test`,
        passwordHash:
          "$argon2id$v=19$m=65536,t=3,p=4$notused$notused-for-http-test",
        fullName: "Purchasing HTTP Tester",
      },
    });
    await transaction.stockLocation.create({
      data: {
        id: fixture.locationId,
        organizationId: fixture.organizationId,
        branchId: fixture.branchId,
        code: "MAIN",
        name: "Main store",
        isDefault: true,
      },
    });
    await transaction.category.create({
      data: {
        id: fixture.categoryId,
        organizationId: fixture.organizationId,
        name: "HTTP Products",
        slug: "http-products",
      },
    });
    await transaction.brand.create({
      data: {
        id: fixture.brandId,
        organizationId: fixture.organizationId,
        name: "HTTP Brand",
        slug: "http-brand",
      },
    });
    await transaction.productModel.create({
      data: {
        id: fixture.modelId,
        organizationId: fixture.organizationId,
        brandId: fixture.brandId,
        categoryId: fixture.categoryId,
        name: "HTTP Model",
        canonicalName: "http model",
      },
    });
    await transaction.productVariant.createMany({
      data: [
        {
          id: fixture.serializedVariantId,
          organizationId: fixture.organizationId,
          productModelId: fixture.modelId,
          sku: "HTTP-PHONE",
          name: "HTTP Smartphone",
          trackingType: "serialized",
          condition: "new",
          ptaStatus: "pta_approved",
        },
        {
          id: fixture.quantityVariantId,
          organizationId: fixture.organizationId,
          productModelId: fixture.modelId,
          sku: "HTTP-CASE",
          name: "HTTP Protective Case",
          trackingType: "quantity",
          condition: "new",
          ptaStatus: "not_applicable",
        },
      ],
    });
    currentSession = sessionWith(ALL_PURCHASING_PERMISSIONS, {
      token: REAL_TOKEN,
      organizationId: fixture.organizationId,
      branchId: fixture.branchId,
      userId: fixture.userId,
    });
    return fixture;
  }

  function realGet(routePath: string) {
    return request(app.getHttpServer())
      .get(routePath)
      .set("Cookie", signedCookie(REAL_TOKEN));
  }

  function realPost(
    routePath: string,
    body: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    const pending = request(app.getHttpServer())
      .post(routePath)
      .set("Cookie", signedCookie(REAL_TOKEN))
      .send(body);
    return routePath === "/api/v1/goods-receipts"
      ? pending.set(IDEMPOTENCY_KEY_HEADER, idempotencyKey)
      : pending;
  }

  async function createOrderedPurchase(
    fixture: Awaited<ReturnType<typeof seedFixture>>,
    lines: readonly {
      readonly productVariantId: string;
      readonly quantity: number;
      readonly unitCostMinor: number;
    }[],
  ) {
    const supplier = await realPost("/api/v1/suppliers", {
      code: `SUP-${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "Real PostgreSQL Supplier",
      contacts: [
        {
          name: "PostgreSQL Contact",
          role: "Purchasing",
          phone: "+923001234567",
          email: "purchasing@supplier.example",
          isPrimary: true,
        },
      ],
      paymentTermsDays: 30,
      leadTimeDays: 5,
    }).expect(201);
    expect(supplier.body).toMatchObject({
      contacts: [
        {
          name: "PostgreSQL Contact",
          role: "Purchasing",
          phone: "+923001234567",
          email: "purchasing@supplier.example",
          isPrimary: true,
        },
      ],
    });
    const order = await realPost("/api/v1/purchases", {
      supplierId: supplier.body.id as string,
      expectedOn: "2030-01-01",
      lines,
    }).expect(201);
    const approved = await realPost(
      `/api/v1/purchases/${order.body.id as string}/approve`,
      { version: order.body.version as number, reason: null },
    ).expect(201);
    const ordered = await realPost(
      `/api/v1/purchases/${order.body.id as string}/order`,
      { version: approved.body.version as number, reason: null },
    ).expect(201);
    expect(ordered.body).toMatchObject({ status: "ordered", version: 3 });
    expect(ordered.body.supplier.id).toBe(supplier.body.id);
    expect(ordered.body.lines).toHaveLength(lines.length);
    expect(fixture.organizationId).toBe(currentSession?.organizationId);
    return {
      supplierId: supplier.body.id as string,
      orderId: ordered.body.id as string,
      lines: ordered.body.lines as Array<{
        id: string;
        productVariant: { id: string; trackingType: string };
      }>,
    };
  }

  beforeAll(async () => {
    database = createPrismaClient({
      connectionString: testMigrationDatabaseUrl(),
      maxConnections: 2,
    });
    app = await createNestApp({
      client: clientProxy,
      ping: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
  });

  it("posts one serialized + quantity receipt atomically and keeps PO creation stock-neutral", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const zeroStock = {
        batches: await transaction.stockBatch.count({
          where: { organizationId: fixture.organizationId },
        }),
        units: await transaction.serializedUnit.count({
          where: { organizationId: fixture.organizationId },
        }),
        movements: await transaction.inventoryMovement.count({
          where: { organizationId: fixture.organizationId },
        }),
      };
      const order = await createOrderedPurchase(fixture, [
        {
          productVariantId: fixture.serializedVariantId,
          quantity: 1,
          unitCostMinor: 100_000,
        },
        {
          productVariantId: fixture.quantityVariantId,
          quantity: 2,
          unitCostMinor: 1_000,
        },
      ]);
      expect({
        batches: await transaction.stockBatch.count({
          where: { organizationId: fixture.organizationId },
        }),
        units: await transaction.serializedUnit.count({
          where: { organizationId: fixture.organizationId },
        }),
        movements: await transaction.inventoryMovement.count({
          where: { organizationId: fixture.organizationId },
        }),
      }).toEqual(zeroStock);

      const serializedLine = order.lines.find(
        (line) => line.productVariant.id === fixture.serializedVariantId,
      );
      const quantityLine = order.lines.find(
        (line) => line.productVariant.id === fixture.quantityVariantId,
      );
      if (serializedLine === undefined || quantityLine === undefined) {
        throw new Error("Real purchase order lost one of its source lines");
      }
      const receiptBody = {
        purchaseOrderId: order.orderId,
        supplierInvoiceReference: `INV-${randomUUID().slice(0, 8)}`,
        invoiceDueOn: "2030-01-01",
        landedCosts: [{ kind: "freight", amountMinor: 300 }],
        lines: [
          {
            purchaseOrderLineId: serializedLine.id,
            trackingType: "serialized",
            stockLocationId: fixture.locationId,
            unitCostMinor: 100_000,
            units: [
              {
                imei1: "490154203237518",
                serialNumber: "HTTPREAL1",
                initialState: "pending_verification",
              },
            ],
          },
          {
            purchaseOrderLineId: quantityLine.id,
            trackingType: "quantity",
            stockLocationId: fixture.locationId,
            unitCostMinor: 1_000,
            quantity: 2,
          },
        ],
      };
      const idempotencyKey = randomUUID();
      const response = await realPost(
        "/api/v1/goods-receipts",
        receiptBody,
        idempotencyKey,
      ).expect(201);

      expect(response.body).toMatchObject({
        purchaseOrder: { id: order.orderId },
        supplier: { id: order.supplierId },
        lineCount: 2,
        unitCount: 3,
        actualCostTotalMinor: 102_000,
        landedCostTotalMinor: 102_300,
        payableTotalMinor: 102_000,
        payable: {
          amountMinor: 102_000,
          outstandingMinor: 102_000,
          status: "open",
        },
      });
      const serializedResponseLine = (
        response.body.lines as Array<{
          productVariant: { trackingType: string };
          serializedUnits: Array<Record<string, unknown>>;
        }>
      ).find((line) => line.productVariant.trackingType === "serialized");
      expect(serializedResponseLine?.serializedUnits[0]).toMatchObject({
        imei1: "490154203237518",
        serialNumber: "HTTPREAL1",
        state: "pending_verification",
        actualCostMinor: 100_000,
      });

      const replay = await realPost(
        "/api/v1/goods-receipts",
        receiptBody,
        idempotencyKey,
      ).expect(201);
      expect(replay.body.id).toBe(response.body.id);
      const changedReplay = await realPost(
        "/api/v1/goods-receipts",
        { ...receiptBody, notes: "different request" },
        idempotencyKey,
      ).expect(409);
      expect(changedReplay.body).toMatchObject({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      });
      expect(
        await transaction.goodsReceipt.count({
          where: { organizationId: fixture.organizationId },
        }),
      ).toBe(1);
      expect(
        await transaction.payable.count({
          where: { organizationId: fixture.organizationId },
        }),
      ).toBe(1);

      await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");

      const batch = await transaction.stockBatch.findFirstOrThrow({
        where: {
          organizationId: fixture.organizationId,
          productVariantId: fixture.quantityVariantId,
          stockLocationId: fixture.locationId,
        },
      });
      expect(batch).toMatchObject({ quantityOnHand: 2, quantityReserved: 0 });
      expect(batch.actualCostMinor).toBe(1_000n);
      expect(batch.landedCostMinor).not.toBeNull();
      expect(
        await transaction.serializedUnit.count({
          where: { organizationId: fixture.organizationId },
        }),
      ).toBe(1);
      expect(
        await transaction.inventoryMovement.count({
          where: {
            organizationId: fixture.organizationId,
            movementType: "purchase_receive",
          },
        }),
      ).toBe(2);

      const orderAfter = await transaction.purchaseOrder.findUniqueOrThrow({
        where: { id: order.orderId },
        include: { lines: true },
      });
      expect(orderAfter.status).toBe("received");
      expect(
        orderAfter.lines.map((line) => line.quantityReceived).sort(),
      ).toEqual([1, 2]);
      await realGet(
        `/api/v1/goods-receipts/${response.body.id as string}`,
      ).expect(200);
      const listed = await realGet(
        `/api/v1/goods-receipts?purchaseOrderId=${order.orderId}`,
      ).expect(200);
      expect(listed.body).toMatchObject({ total: 1 });
    });
  });

  it("returns NOT_FOUND without receiving side effects when the session location scope excludes the target", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const allowedLocationId = randomUUID();
      await transaction.stockLocation.create({
        data: {
          id: allowedLocationId,
          organizationId: fixture.organizationId,
          branchId: fixture.branchId,
          code: "SCOPED",
          name: "Scoped receiving location",
          isDefault: false,
        },
      });
      const order = await createOrderedPurchase(fixture, [
        {
          productVariantId: fixture.quantityVariantId,
          quantity: 2,
          unitCostMinor: 1_000,
        },
      ]);
      const sourceLine = order.lines[0];
      if (sourceLine === undefined) {
        throw new Error("Real location-scope PO has no source line");
      }

      currentSession = sessionWith([PERMISSIONS.PURCHASES_RECEIVE], {
        token: REAL_TOKEN,
        organizationId: fixture.organizationId,
        branchId: fixture.branchId,
        userId: fixture.userId,
        locationId: allowedLocationId,
      });
      expect(allowedLocationId).not.toBe(fixture.locationId);

      const receivingState = async () => ({
        receipts: await transaction.goodsReceipt.count({
          where: { organizationId: fixture.organizationId },
        }),
        receiptLines: await transaction.goodsReceiptLine.count({
          where: { organizationId: fixture.organizationId },
        }),
        payables: await transaction.payable.count({
          where: { organizationId: fixture.organizationId },
        }),
        batches: await transaction.stockBatch.count({
          where: { organizationId: fixture.organizationId },
        }),
        units: await transaction.serializedUnit.count({
          where: { organizationId: fixture.organizationId },
        }),
        movements: await transaction.inventoryMovement.count({
          where: { organizationId: fixture.organizationId },
        }),
        receiptSequences: await transaction.numberSequence.count({
          where: {
            organizationId: fixture.organizationId,
            branchId: fixture.branchId,
            key: "goods_receipt",
          },
        }),
      });
      const before = await receivingState();

      const response = await realPost("/api/v1/goods-receipts", {
        purchaseOrderId: order.orderId,
        supplierInvoiceReference: `INV-SCOPE-${randomUUID().slice(0, 8)}`,
        invoiceDueOn: "2030-01-01",
        lines: [
          {
            purchaseOrderLineId: sourceLine.id,
            trackingType: "quantity",
            stockLocationId: fixture.locationId,
            unitCostMinor: 1_000,
            quantity: 2,
          },
        ],
      }).expect(404);

      expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expect(await receivingState()).toEqual(before);
      const unchanged = await transaction.purchaseOrder.findUniqueOrThrow({
        where: { id: order.orderId },
        include: { lines: true },
      });
      expect(unchanged).toMatchObject({ status: "ordered", version: 3 });
      expect(unchanged.lines[0]?.quantityReceived).toBe(0);
    });
  });

  it("rolls every receiving write back when a concurrent duplicate IMEI wins", async () => {
    await withinRollback(async (transaction) => {
      const fixture = await seedFixture(transaction);
      const order = await createOrderedPurchase(fixture, [
        {
          productVariantId: fixture.serializedVariantId,
          quantity: 1,
          unitCostMinor: 100_000,
        },
      ]);
      const sourceLine = order.lines[0];
      if (sourceLine === undefined) {
        throw new Error("Real duplicate-IMEI PO has no source line");
      }
      await transaction.serializedUnit.create({
        data: {
          organizationId: fixture.organizationId,
          branchId: fixture.branchId,
          productVariantId: fixture.serializedVariantId,
          stockLocationId: fixture.locationId,
          state: "available",
          condition: "new",
          ptaStatus: "pta_approved",
          identifiers: {
            create: [
              {
                identifierType: "imei",
                position: 1,
                normalizedValue: "356938035643809",
              },
            ],
          },
        },
      });
      const before = {
        receipts: await transaction.goodsReceipt.count({
          where: { organizationId: fixture.organizationId },
        }),
        receiptLines: await transaction.goodsReceiptLine.count({
          where: { organizationId: fixture.organizationId },
        }),
        payables: await transaction.payable.count({
          where: { organizationId: fixture.organizationId },
        }),
        units: await transaction.serializedUnit.count({
          where: { organizationId: fixture.organizationId },
        }),
        movements: await transaction.inventoryMovement.count({
          where: { organizationId: fixture.organizationId },
        }),
        receiptSequences: await transaction.numberSequence.count({
          where: {
            organizationId: fixture.organizationId,
            branchId: fixture.branchId,
            key: "goods_receipt",
          },
        }),
      };

      hideIdentifierCollision = true;
      const response = await realPost("/api/v1/goods-receipts", {
        purchaseOrderId: order.orderId,
        supplierInvoiceReference: `INV-DUP-${randomUUID().slice(0, 8)}`,
        invoiceDueOn: "2030-01-01",
        lines: [
          {
            purchaseOrderLineId: sourceLine.id,
            trackingType: "serialized",
            stockLocationId: fixture.locationId,
            unitCostMinor: 100_000,
            units: [{ imei1: "356938035643809" }],
          },
        ],
      }).expect(409);
      hideIdentifierCollision = false;

      expect(response.body).toMatchObject({ code: ERROR_CODES.IMEI_DUPLICATE });
      await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
      expect({
        receipts: await transaction.goodsReceipt.count({
          where: { organizationId: fixture.organizationId },
        }),
        receiptLines: await transaction.goodsReceiptLine.count({
          where: { organizationId: fixture.organizationId },
        }),
        payables: await transaction.payable.count({
          where: { organizationId: fixture.organizationId },
        }),
        units: await transaction.serializedUnit.count({
          where: { organizationId: fixture.organizationId },
        }),
        movements: await transaction.inventoryMovement.count({
          where: { organizationId: fixture.organizationId },
        }),
        receiptSequences: await transaction.numberSequence.count({
          where: {
            organizationId: fixture.organizationId,
            branchId: fixture.branchId,
            key: "goods_receipt",
          },
        }),
      }).toEqual(before);
      const unchanged = await transaction.purchaseOrder.findUniqueOrThrow({
        where: { id: order.orderId },
        include: { lines: true },
      });
      expect(unchanged).toMatchObject({ status: "ordered", version: 3 });
      expect(unchanged.lines[0]?.quantityReceived).toBe(0);
    });
  });
});
