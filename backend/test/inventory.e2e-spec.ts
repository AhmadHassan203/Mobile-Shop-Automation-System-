import { createHmac } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { VersioningType, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerStorage } from "@nestjs/throttler";
import cookieParser from "cookie-parser";
import request from "supertest";
import {
  API_VERSION,
  ERROR_CODES,
  PERMISSIONS,
  type PermissionKey,
} from "@mobileshop/shared";
import { AppModule } from "@/app.module";
import { PrismaService } from "@/database/prisma.service";
import { hashSessionToken } from "@/modules/auth/auth-crypto";

/**
 * HTTP contract of the Inventory API.
 *
 * Service tests prove the stock arithmetic and transaction ordering. This file
 * deliberately stays at the Nest HTTP boundary: the production guard chain,
 * strict request pipes and exception filter must reject hostile requests before
 * a mocked Prisma write can run. Successful reads additionally prove that wide
 * database rows are mapped onto the narrow public contracts without leaking
 * tenant, cost or price fields.
 */

const SESSION_SECRET = "test-session-secret-not-used-outside-tests-0123456789";
const VALID_TOKEN = "i".repeat(43);
const NOW = new Date("2026-07-16T09:00:00.000Z");

const TRUSTED_ORIGIN = "http://localhost:3000";
const HOSTILE_ORIGIN = "https://hostile.example";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const BRANCH_ID = "10000000-0000-4000-8000-000000000002";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const ROLE_ID = "40000000-0000-4000-8000-000000000001";
const VARIANT_ID = "a0000000-0000-4000-8000-000000000001";
const SERIALIZED_VARIANT_ID = "a0000000-0000-4000-8000-000000000002";
const LOCATION_ID = "b0000000-0000-4000-8000-000000000001";
const OTHER_LOCATION_ID = "b0000000-0000-4000-8000-000000000002";
const BATCH_ID = "c0000000-0000-4000-8000-000000000001";
const UNIT_ID = "d0000000-0000-4000-8000-000000000001";
const MOVEMENT_ID = "e0000000-0000-4000-8000-000000000001";

/** A valid identifier whose existence belongs to a different organization. */
const FOREIGN_ID = "99999999-0000-4000-8000-000000000009";

function signedCookie(token: string): string {
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(token)
    .digest("base64")
    .replace(/=+$/u, "");
  return `mshop_session=${encodeURIComponent(`s:${token}.${signature}`)}`;
}

// --- Forbidden response data ----------------------------------------------

const FORBIDDEN_RESPONSE_KEYS = [
  "organizationId",
  "organization_id",
  "branchId",
  "branch_id",
  "actualCostMinor",
  "actual_cost_minor",
  "landedCostMinor",
  "landed_cost_minor",
  "costMinor",
  "cost_minor",
  "unitCostMinor",
  "unit_cost_minor",
  "priceMinor",
  "price_minor",
  "defaultPriceMinor",
  "default_price_minor",
  "minPriceMinor",
  "min_price_minor",
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/_/gu, "");
}

const FORBIDDEN_KEY_FORMS = new Set(FORBIDDEN_RESPONSE_KEYS.map(normalizeKey));

function forbiddenKeyPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      forbiddenKeyPaths(entry, `${path}[${index}]`),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) => [
      ...(FORBIDDEN_KEY_FORMS.has(normalizeKey(key)) ? [`${path}.${key}`] : []),
      ...forbiddenKeyPaths(entry, `${path}.${key}`),
    ]);
  }
  return [];
}

/** Values planted on wide mocked rows to catch accidental object spreading. */
const ROW_POLLUTION = {
  organizationId: ORGANIZATION_ID,
  organization_id: ORGANIZATION_ID,
  branchId: BRANCH_ID,
  branch_id: BRANCH_ID,
  actualCostMinor: 911_111_111,
  landedCostMinor: 922_222_222,
  costMinor: 933_333_333,
  priceMinor: 944_444_444,
  defaultPriceMinor: 955_555_555,
  minPriceMinor: 966_666_666,
} as const;

const POLLUTION_VALUES = Object.values(ROW_POLLUTION).map(String);

// --- Authenticated tenant fixture -----------------------------------------

const organization = {
  id: ORGANIZATION_ID,
  name: "MobileShop",
  currency: "PKR",
  timezone: "Asia/Karachi",
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const branch = {
  id: BRANCH_ID,
  organizationId: ORGANIZATION_ID,
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

function authUserWith(permissions: readonly PermissionKey[]) {
  return {
    id: USER_ID,
    organizationId: ORGANIZATION_ID,
    email: "manager@mobileshop.local",
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$notused$notused",
    fullName: "Shop Manager",
    phone: null,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    organization,
    userRoles: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        roleId: ROLE_ID,
        assignedAt: NOW,
        assignedBy: null,
        role: {
          id: ROLE_ID,
          organizationId: ORGANIZATION_ID,
          code: "manager",
          name: "Manager",
          description: null,
          isSystem: true,
          createdAt: NOW,
          updatedAt: NOW,
          rolePermissions: permissions.map((key, index) => ({
            id: `50000000-0000-4000-8000-00000000000${index}`,
            roleId: ROLE_ID,
            permissionId: `60000000-0000-4000-8000-00000000000${index}`,
            grantedAt: NOW,
            permission: {
              id: `60000000-0000-4000-8000-00000000000${index}`,
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
        id: "70000000-0000-4000-8000-000000000001",
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        branchId: BRANCH_ID,
        locationId: null,
        createdAt: NOW,
      },
    ],
  };
}

function sessionWith(permissions: readonly PermissionKey[]) {
  return {
    id: "80000000-0000-4000-8000-000000000001",
    organizationId: ORGANIZATION_ID,
    userId: USER_ID,
    tokenHash: hashSessionToken(VALID_TOKEN),
    branchId: BRANCH_ID,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    ipAddress: "127.0.0.1",
    userAgent: "inventory-http-test",
    createdAt: NOW,
    lastSeenAt: new Date(),
    branch,
    user: authUserWith(permissions),
  };
}

const ALL_INVENTORY_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.INVENTORY_VIEW_COST,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.INVENTORY_RESERVE,
  PERMISSIONS.INVENTORY_TRANSFER,
  PERMISSIONS.SETTINGS_MANAGE,
];

// --- Database row fixtures -------------------------------------------------

const locationRow = {
  ...ROW_POLLUTION,
  id: LOCATION_ID,
  name: "Main counter",
  code: "MAIN",
  kind: "store" as const,
  isActive: true,
  version: 3,
};

const quantityVariantRow = {
  ...ROW_POLLUTION,
  id: VARIANT_ID,
  sku: "CASE-001",
  name: "Clear silicone case",
  trackingType: "quantity" as const,
};

const unitRow = {
  ...ROW_POLLUTION,
  id: UNIT_ID,
  state: "available" as const,
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
  receivedAt: new Date("2026-07-01T00:00:00.000Z"),
  version: 2,
  productVariant: {
    id: SERIALIZED_VARIANT_ID,
    sku: "PHONE-001",
    name: "Generic smartphone 8/256",
  },
  stockLocation: { id: LOCATION_ID, name: "Main counter", code: "MAIN" },
  identifiers: [
    { identifierType: "imei" as const, normalizedValue: "356938035643809" },
  ],
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

const lockedBatch = {
  id: BATCH_ID,
  stockLocationId: LOCATION_ID,
  quantityOnHand: 7,
  quantityReserved: 1,
  version: 4,
};

const lockedUnit = {
  id: UNIT_ID,
  productVariantId: SERIALIZED_VARIANT_ID,
  stockLocationId: LOCATION_ID,
  state: "available" as const,
  version: 2,
};

const movementRow = {
  ...ROW_POLLUTION,
  id: MOVEMENT_ID,
  productVariant: {
    id: VARIANT_ID,
    sku: "CASE-001",
    name: "Clear silicone case",
  },
  stockLocationId: LOCATION_ID,
  serializedUnitId: null,
  stockBatchId: BATCH_ID,
  movementType: "adjustment_in" as const,
  quantity: 2,
  fromState: null,
  toState: null,
  referenceType: "stock_count_correction",
  referenceId: null,
  reason: "Counted two more on the shelf.",
  occurredAt: new Date("2026-07-16T08:00:00.000Z"),
};

// --- Request bodies and route matrix --------------------------------------

function locationUpdateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Main counter",
    code: "MAIN",
    locationType: "store",
    version: locationRow.version,
    ...overrides,
  };
}

function adjustmentBody(overrides: Record<string, unknown> = {}) {
  return {
    productVariantId: VARIANT_ID,
    stockLocationId: LOCATION_ID,
    movementType: "adjustment_out",
    quantity: 1,
    adjustmentReason: "stock_count_correction",
    reason: "Shelf count correction.",
    ...overrides,
  };
}

function reservationBody(overrides: Record<string, unknown> = {}) {
  return {
    productVariantId: VARIANT_ID,
    stockLocationId: LOCATION_ID,
    quantity: 1,
    reason: null,
    ...overrides,
  };
}

function quantityTransferBody(overrides: Record<string, unknown> = {}) {
  return {
    productVariantId: VARIANT_ID,
    fromStockLocationId: LOCATION_ID,
    toStockLocationId: OTHER_LOCATION_ID,
    quantity: 1,
    reason: "Restock the back counter.",
    ...overrides,
  };
}

type HttpMethod = "get" | "post" | "patch" | "delete";

interface Route {
  readonly name: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly permission: PermissionKey;
  readonly body?: Record<string, unknown>;
}

const ROUTES: readonly Route[] = [
  {
    name: "GET /locations",
    method: "get",
    path: "/api/v1/locations",
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    name: "POST /locations",
    method: "post",
    path: "/api/v1/locations",
    permission: PERMISSIONS.SETTINGS_MANAGE,
    body: { name: "Back counter", code: "BACK", locationType: "store" },
  },
  {
    name: "PATCH /locations/:id",
    method: "patch",
    path: `/api/v1/locations/${LOCATION_ID}`,
    permission: PERMISSIONS.SETTINGS_MANAGE,
    body: locationUpdateBody(),
  },
  {
    name: "POST /locations/:id/deactivate",
    method: "post",
    path: `/api/v1/locations/${LOCATION_ID}/deactivate`,
    permission: PERMISSIONS.SETTINGS_MANAGE,
    body: { version: locationRow.version },
  },
  {
    name: "POST /locations/:id/activate",
    method: "post",
    path: `/api/v1/locations/${LOCATION_ID}/activate`,
    permission: PERMISSIONS.SETTINGS_MANAGE,
    body: { version: locationRow.version },
  },
  {
    name: "GET /inventory",
    method: "get",
    path: "/api/v1/inventory",
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    name: "GET /inventory/movements",
    method: "get",
    path: "/api/v1/inventory/movements",
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    name: "POST /inventory/adjustments",
    method: "post",
    path: "/api/v1/inventory/adjustments",
    permission: PERMISSIONS.INVENTORY_ADJUST,
    body: adjustmentBody(),
  },
  {
    name: "POST /inventory/reservations",
    method: "post",
    path: "/api/v1/inventory/reservations",
    permission: PERMISSIONS.INVENTORY_RESERVE,
    body: reservationBody(),
  },
  {
    name: "DELETE /inventory/reservations/:id",
    method: "delete",
    path: `/api/v1/inventory/reservations/${VARIANT_ID}`,
    permission: PERMISSIONS.INVENTORY_RESERVE,
    body: reservationBody(),
  },
  {
    name: "POST /inventory/transfers",
    method: "post",
    path: "/api/v1/inventory/transfers",
    permission: PERMISSIONS.INVENTORY_TRANSFER,
    body: quantityTransferBody(),
  },
  {
    name: "GET /serialized-units",
    method: "get",
    path: "/api/v1/serialized-units",
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    name: "POST /serialized-units/validate-bulk",
    method: "post",
    path: "/api/v1/serialized-units/validate-bulk",
    permission: PERMISSIONS.INVENTORY_VIEW,
    body: { identifiers: ["356938035643809"] },
  },
  {
    name: "GET /serialized-units/:id",
    method: "get",
    path: `/api/v1/serialized-units/${UNIT_ID}`,
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    name: "GET /serialized-units/:id/movements",
    method: "get",
    path: `/api/v1/serialized-units/${UNIT_ID}/movements`,
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    name: "POST /serialized-units/:id/transition",
    method: "post",
    path: `/api/v1/serialized-units/${UNIT_ID}/transition`,
    permission: PERMISSIONS.INVENTORY_ADJUST,
    body: { toState: "reserved", reason: "Held for a customer.", version: 2 },
  },
  {
    name: "POST /serialized-units/:id/transfer",
    method: "post",
    path: `/api/v1/serialized-units/${UNIT_ID}/transfer`,
    permission: PERMISSIONS.INVENTORY_TRANSFER,
    body: {
      toStockLocationId: OTHER_LOCATION_ID,
      reason: "Move to the back counter.",
      version: 2,
    },
  },
];

const ORIGIN_PROTECTED_ROUTES = ROUTES.filter(
  (route) => route.method !== "get",
);

// --- Prisma mock -----------------------------------------------------------

const INVENTORY_TABLES = [
  "stockLocation",
  "productVariant",
  "stockBatch",
  "serializedUnit",
  "deviceIdentifier",
  "inventoryMovement",
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

describe("Inventory endpoints (HTTP)", () => {
  let app: INestApplication;
  let grantedPermissions: readonly PermissionKey[] = ALL_INVENTORY_PERMISSIONS;

  const client = {
    session: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    stockLocation: tableMock(),
    productVariant: tableMock(),
    stockBatch: tableMock(),
    serializedUnit: tableMock(),
    deviceIdentifier: tableMock(),
    inventoryMovement: tableMock(),
    auditEvent: tableMock(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };

  function expectNoDatabaseWrite(): void {
    for (const table of INVENTORY_TABLES) {
      for (const method of MUTATION_METHODS) {
        expect(
          client[table][method],
          `${table}.${method} must never run on a rejected request`,
        ).not.toHaveBeenCalled();
      }
    }
  }

  function send(route: Pick<Route, "method" | "body"> & { path: string }) {
    const agent = request(app.getHttpServer());
    const pending =
      route.method === "get"
        ? agent.get(route.path)
        : route.method === "patch"
          ? agent.patch(route.path)
          : route.method === "delete"
            ? agent.delete(route.path)
            : agent.post(route.path);
    return route.body === undefined ? pending : pending.send(route.body);
  }

  function authorized(
    route: Pick<Route, "method" | "body"> & { path: string },
    permissions: readonly PermissionKey[] = ALL_INVENTORY_PERMISSIONS,
  ) {
    grantedPermissions = permissions;
    return send(route).set("Cookie", signedCookie(VALID_TOKEN));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ client, ping: vi.fn().mockResolvedValue(undefined) })
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
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser(SESSION_SECRET));
    app.setGlobalPrefix("api");
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: API_VERSION.replace("v", ""),
    });
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    grantedPermissions = ALL_INVENTORY_PERMISSIONS;

    client.session.findUnique.mockImplementation(() =>
      Promise.resolve(sessionWith(grantedPermissions)),
    );
    client.session.updateMany.mockResolvedValue({ count: 1 });

    // The same object is also the interactive transaction client, making any
    // attempted write observable from the test after the request completes.
    client.$transaction.mockImplementation((argument: unknown) =>
      typeof argument === "function"
        ? (argument as (tx: unknown) => Promise<unknown>)(client)
        : Promise.all(argument as Promise<unknown>[]),
    );

    client.stockLocation.count.mockResolvedValue(1);
    client.stockLocation.findMany.mockResolvedValue([locationRow]);
    client.stockLocation.findFirst.mockResolvedValue(locationRow);
    client.stockLocation.create.mockResolvedValue(locationRow);
    client.stockLocation.updateMany.mockResolvedValue({ count: 1 });

    client.productVariant.findFirst.mockResolvedValue(quantityVariantRow);
    client.stockBatch.findFirst.mockResolvedValue({
      quantityOnHand: 6,
      quantityReserved: 1,
    });
    client.stockBatch.create.mockResolvedValue(lockedBatch);
    client.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    client.serializedUnit.count.mockResolvedValue(1);
    client.serializedUnit.findMany.mockResolvedValue([unitRow]);
    client.serializedUnit.findFirst.mockResolvedValue(unitRow);
    client.serializedUnit.updateMany.mockResolvedValue({ count: 1 });

    client.inventoryMovement.count.mockResolvedValue(1);
    client.inventoryMovement.findMany.mockResolvedValue([movementRow]);
    client.inventoryMovement.create.mockResolvedValue({ id: MOVEMENT_ID });
    client.auditEvent.create.mockResolvedValue({ id: "audit" });
    client.$queryRaw.mockResolvedValue([lockedBatch]);
  });

  afterAll(async () => {
    await app?.close();
  });

  // --- 1. Authentication --------------------------------------------------

  describe("authentication", () => {
    it.each(ROUTES.map((route) => [route.name, route] as const))(
      "rejects %s without a session before any inventory write",
      async (_name, route) => {
        const response = await send(route).expect(401);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.AUTH_REQUIRED,
        });
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(client.session.findUnique).not.toHaveBeenCalled();
        expectNoDatabaseWrite();
      },
    );
  });

  // --- 2. Exact permissions ----------------------------------------------

  describe("permission enforcement", () => {
    it.each(ROUTES.map((route) => [route.name, route] as const))(
      "returns 403 on %s when its exact grant is absent and performs no write",
      async (_name, route) => {
        const permissions = ALL_INVENTORY_PERMISSIONS.filter(
          (permission) => permission !== route.permission,
        );
        const response = await authorized(route, permissions).expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expectNoDatabaseWrite();
      },
    );
  });

  // --- 3. Tenant isolation ------------------------------------------------

  describe("cross-tenant isolation", () => {
    it("reports a foreign serialized unit as 404 and scopes the lookup", async () => {
      client.serializedUnit.findFirst.mockResolvedValue(null);

      const response = await authorized({
        method: "get",
        path: `/api/v1/serialized-units/${FOREIGN_ID}`,
      }).expect(404);

      expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expect(response.status).not.toBe(403);
      expect(JSON.stringify(response.body)).not.toContain(FOREIGN_ID);
      expect(client.serializedUnit.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FOREIGN_ID, organizationId: ORGANIZATION_ID },
        }),
      );
      expectNoDatabaseWrite();
    });

    it("reports a foreign stock location mutation as 404 without an update", async () => {
      client.stockLocation.findFirst.mockResolvedValue(null);

      const response = await authorized({
        method: "patch",
        path: `/api/v1/locations/${FOREIGN_ID}`,
        body: locationUpdateBody(),
      }).expect(404);

      expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expect(response.status).not.toBe(403);
      expect(JSON.stringify(response.body)).not.toContain(FOREIGN_ID);
      expect(client.stockLocation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FOREIGN_ID, organizationId: ORGANIZATION_ID },
        }),
      );
      expect(client.stockLocation.updateMany).not.toHaveBeenCalled();
      expectNoDatabaseWrite();
    });

    it("does not let an adjustment name a product from another tenant", async () => {
      client.productVariant.findFirst.mockResolvedValue(null);

      const response = await authorized({
        method: "post",
        path: "/api/v1/inventory/adjustments",
        body: adjustmentBody({ productVariantId: FOREIGN_ID }),
      }).expect(404);

      expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expect(response.status).not.toBe(403);
      expect(JSON.stringify(response.body)).not.toContain(FOREIGN_ID);
      expect(client.productVariant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FOREIGN_ID, organizationId: ORGANIZATION_ID },
        }),
      );
      expectNoDatabaseWrite();
    });
  });

  // --- 4. Origin / CSRF ---------------------------------------------------

  describe("origin protection", () => {
    it.each(
      ORIGIN_PROTECTED_ROUTES.map((route) => [route.name, route] as const),
    )(
      "rejects %s from an untrusted browser before any inventory write",
      async (_name, route) => {
        const response = await authorized(route)
          .set("Origin", HOSTILE_ORIGIN)
          .expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expect(response.headers["cache-control"]).toBe("no-store");
        expectNoDatabaseWrite();
      },
    );

    it("admits the configured application origin", async () => {
      const response = await authorized({
        method: "post",
        path: "/api/v1/serialized-units/validate-bulk",
        body: { identifiers: ["356938035643809"] },
      })
        .set("Origin", TRUSTED_ORIGIN)
        .expect(201);

      expect(response.body).toMatchObject({ validCount: 1, invalidCount: 0 });
      expectNoDatabaseWrite();
    });
  });

  // --- 5. Strict input contracts -----------------------------------------

  describe("input smuggling", () => {
    const cases: ReadonlyArray<readonly [string, Route]> = [
      [
        "organizationId in a location create",
        {
          name: "",
          method: "post",
          path: "/api/v1/locations",
          permission: PERMISSIONS.SETTINGS_MANAGE,
          body: {
            name: "Back counter",
            code: "BACK",
            locationType: "store",
            organizationId: FOREIGN_ID,
          },
        },
      ],
      [
        "costMinor in a location update",
        {
          name: "",
          method: "patch",
          path: `/api/v1/locations/${LOCATION_ID}`,
          permission: PERMISSIONS.SETTINGS_MANAGE,
          body: locationUpdateBody({ costMinor: 1 }),
        },
      ],
      [
        "quantityOnHand in a location transition",
        {
          name: "",
          method: "post",
          path: `/api/v1/locations/${LOCATION_ID}/deactivate`,
          permission: PERMISSIONS.SETTINGS_MANAGE,
          body: { version: locationRow.version, quantityOnHand: 99 },
        },
      ],
      [
        "organizationId in an adjustment",
        {
          name: "",
          method: "post",
          path: "/api/v1/inventory/adjustments",
          permission: PERMISSIONS.INVENTORY_ADJUST,
          body: adjustmentBody({ organizationId: FOREIGN_ID }),
        },
      ],
      [
        "costMinor in a reservation",
        {
          name: "",
          method: "post",
          path: "/api/v1/inventory/reservations",
          permission: PERMISSIONS.INVENTORY_RESERVE,
          body: reservationBody({ costMinor: 1 }),
        },
      ],
      [
        "quantityOnHand in a quantity transfer",
        {
          name: "",
          method: "post",
          path: "/api/v1/inventory/transfers",
          permission: PERMISSIONS.INVENTORY_TRANSFER,
          body: quantityTransferBody({ quantityOnHand: 99 }),
        },
      ],
      [
        "organizationId in a serialized transition",
        {
          name: "",
          method: "post",
          path: `/api/v1/serialized-units/${UNIT_ID}/transition`,
          permission: PERMISSIONS.INVENTORY_ADJUST,
          body: {
            toState: "reserved",
            reason: "Held for a customer.",
            version: 2,
            organizationId: FOREIGN_ID,
          },
        },
      ],
      [
        "costMinor in a serialized transfer",
        {
          name: "",
          method: "post",
          path: `/api/v1/serialized-units/${UNIT_ID}/transfer`,
          permission: PERMISSIONS.INVENTORY_TRANSFER,
          body: {
            toStockLocationId: OTHER_LOCATION_ID,
            reason: "Move to the back counter.",
            version: 2,
            costMinor: 1,
          },
        },
      ],
      [
        "quantityOnHand in bulk IMEI validation",
        {
          name: "",
          method: "post",
          path: "/api/v1/serialized-units/validate-bulk",
          permission: PERMISSIONS.INVENTORY_VIEW,
          body: {
            identifiers: ["356938035643809"],
            quantityOnHand: 99,
          },
        },
      ],
    ];

    it.each(cases)("returns 422 for %s before Prisma", async (_name, route) => {
      const response = await authorized(route).expect(422);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      expectNoDatabaseWrite();
    });
  });

  // --- 6. Optimistic locking ---------------------------------------------

  describe("optimistic locking", () => {
    it("returns 409 when a stock location edit carries a stale version", async () => {
      client.stockLocation.updateMany.mockResolvedValue({ count: 0 });

      const response = await authorized({
        method: "patch",
        path: `/api/v1/locations/${LOCATION_ID}`,
        body: locationUpdateBody({ version: 1 }),
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      });
      expect(client.stockLocation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: LOCATION_ID,
            organizationId: ORGANIZATION_ID,
            version: 1,
          }),
        }),
      );
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });

    it("returns 409 when a serialized transition carries a stale version", async () => {
      client.$queryRaw.mockResolvedValue([lockedUnit]);
      client.serializedUnit.updateMany.mockResolvedValue({ count: 0 });

      const response = await authorized({
        method: "post",
        path: `/api/v1/serialized-units/${UNIT_ID}/transition`,
        body: { toState: "reserved", reason: "Customer hold.", version: 1 },
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      });
      expect(client.serializedUnit.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: UNIT_ID,
            organizationId: ORGANIZATION_ID,
            version: 1,
          }),
        }),
      );
      expect(client.inventoryMovement.create).not.toHaveBeenCalled();
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });

    it("returns 409 when the locked quantity batch loses its write race", async () => {
      client.$queryRaw.mockResolvedValue([lockedBatch]);
      client.stockBatch.updateMany.mockResolvedValue({ count: 0 });

      const response = await authorized({
        method: "post",
        path: "/api/v1/inventory/adjustments",
        body: adjustmentBody(),
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      });
      expect(client.stockBatch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: BATCH_ID,
            organizationId: ORGANIZATION_ID,
            version: lockedBatch.version,
          }),
        }),
      );
      expect(client.inventoryMovement.create).not.toHaveBeenCalled();
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });
  });

  // --- 7. Response field exposure ----------------------------------------

  describe("response field exposure", () => {
    function expectNoRestrictedData(response: {
      readonly body: unknown;
      readonly text: string;
    }): void {
      expect(forbiddenKeyPaths(response.body)).toEqual([]);
      for (const planted of POLLUTION_VALUES) {
        expect(response.text).not.toContain(planted);
      }
    }

    it("maps a wide location row onto the public location page", async () => {
      const response = await authorized({
        method: "get",
        path: "/api/v1/locations",
      }).expect(200);

      expect(response.body).toMatchObject({
        items: [{ id: LOCATION_ID, code: "MAIN", version: 3 }],
      });
      expectNoRestrictedData(response);
    });

    it("maps raw derived balances without exposing their source row", async () => {
      client.$queryRaw
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          {
            ...ROW_POLLUTION,
            variantId: VARIANT_ID,
            sku: "CASE-001",
            variantName: "Clear silicone case",
            trackingType: "quantity",
            locationId: LOCATION_ID,
            locationName: "Main counter",
            onHand: 7,
            reserved: 1,
          },
        ]);

      const response = await authorized({
        method: "get",
        path: "/api/v1/inventory",
      }).expect(200);

      expect(response.body).toMatchObject({
        items: [{ onHand: 7, reserved: 1, available: 6 }],
      });
      expectNoRestrictedData(response);
    });

    it("maps movement ledger rows without exposing actor or valuation data", async () => {
      const response = await authorized({
        method: "get",
        path: "/api/v1/inventory/movements",
      }).expect(200);

      expect(response.body).toMatchObject({
        items: [{ id: MOVEMENT_ID, movementType: "adjustment_in" }],
      });
      expectNoRestrictedData(response);
    });

    it("maps serialized list and detail rows without cost or tenant fields", async () => {
      const list = await authorized({
        method: "get",
        path: "/api/v1/serialized-units",
      }).expect(200);
      const detail = await authorized({
        method: "get",
        path: `/api/v1/serialized-units/${UNIT_ID}`,
      }).expect(200);

      expect(list.body).toMatchObject({ items: [{ id: UNIT_ID, version: 2 }] });
      expect(detail.body).toMatchObject({
        id: UNIT_ID,
        identifiers: [{ type: "imei", value: "356938035643809" }],
      });
      expectNoRestrictedData(list);
      expectNoRestrictedData(detail);
    });

    it("maps a created location and keeps its audit snapshot restricted", async () => {
      const response = await authorized({
        method: "post",
        path: "/api/v1/locations",
        body: { name: "Main counter", code: "MAIN", locationType: "store" },
      }).expect(201);

      expect(response.body).toMatchObject({ id: LOCATION_ID, code: "MAIN" });
      expectNoRestrictedData(response);
      const [audit] = client.auditEvent.create.mock.calls[0] as [
        { data: { afterSnapshot: unknown } },
      ];
      expect(forbiddenKeyPaths(audit.data.afterSnapshot)).toEqual([]);
    });

    it("maps a quantity mutation result without exposing cost or tenant data", async () => {
      client.$queryRaw.mockResolvedValue([lockedBatch]);

      const response = await authorized({
        method: "post",
        path: "/api/v1/inventory/adjustments",
        body: adjustmentBody(),
      }).expect(201);

      expect(response.body).toMatchObject({
        productVariant: { id: VARIANT_ID, sku: "CASE-001" },
        onHand: 6,
        reserved: 1,
        available: 5,
      });
      expectNoRestrictedData(response);
    });

    it("maps a serialized mutation result without exposing wide row fields", async () => {
      client.$queryRaw.mockResolvedValue([lockedUnit]);
      client.serializedUnit.findFirst
        .mockResolvedValueOnce(unitRow)
        .mockResolvedValueOnce({ ...unitRow, state: "reserved", version: 3 });

      const response = await authorized({
        method: "post",
        path: `/api/v1/serialized-units/${UNIT_ID}/transition`,
        body: { toState: "reserved", reason: "Customer hold.", version: 2 },
      }).expect(201);

      expect(response.body).toMatchObject({
        id: UNIT_ID,
        state: "reserved",
        version: 3,
      });
      expectNoRestrictedData(response);
    });

    it("deep-scans nested arrays and snake_case spellings", () => {
      expect(forbiddenKeyPaths({ organizationId: "x" })).toEqual([
        "$.organizationId",
      ]);
      expect(forbiddenKeyPaths({ items: [{ landed_cost_minor: 1 }] })).toEqual([
        "$.items[0].landed_cost_minor",
      ]);
      expect(forbiddenKeyPaths({ product: { minPriceMinor: 1 } })).toEqual([
        "$.product.minPriceMinor",
      ]);
      expect(
        forbiddenKeyPaths({ onHand: 2, reserved: 1, available: 1 }),
      ).toEqual([]);
    });
  });

  // --- 8. Malformed path identifiers -------------------------------------

  describe("malformed identifiers", () => {
    it.each([
      [
        "location",
        {
          method: "patch" as const,
          path: "/api/v1/locations/not-a-uuid",
          body: locationUpdateBody(),
        },
      ],
      [
        "serialized unit",
        {
          method: "get" as const,
          path: "/api/v1/serialized-units/not-a-uuid",
        },
      ],
    ] as const)(
      "rejects a malformed %s id before Prisma",
      async (_name, route) => {
        const response = await authorized(route).expect(422);

        expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
        expect(client.stockLocation.findFirst).not.toHaveBeenCalled();
        expect(client.serializedUnit.findFirst).not.toHaveBeenCalled();
        expectNoDatabaseWrite();
      },
    );

    it("rejects a malformed reservation path id before a write", async () => {
      const response = await authorized({
        method: "delete",
        path: "/api/v1/inventory/reservations/not-a-uuid",
        body: reservationBody(),
      }).expect(422);

      expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expectNoDatabaseWrite();
    });
  });
});
