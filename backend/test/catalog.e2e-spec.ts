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
 * HTTP contract of the catalog management API.
 *
 * These tests exist to prove the properties that a unit test of the service
 * cannot: that the real guard chain, the real pipes and the real exception
 * filter — assembled exactly as `AppModule` assembles them in production —
 * refuse a request before it reaches PostgreSQL. Prisma is mocked so that every
 * assertion here is about the HTTP boundary, and so that "no write happened" is
 * observable rather than inferred.
 */

const SESSION_SECRET = "test-session-secret-not-used-outside-tests-0123456789";
const VALID_TOKEN = "c".repeat(43);
const NOW = new Date("2026-07-16T09:00:00.000Z");

/** `CORS_ORIGIN` defaults to this; anything else is an untrusted browser. */
const TRUSTED_ORIGIN = "http://localhost:3000";
const HOSTILE_ORIGIN = "https://hostile.example";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const BRANCH_ID = "10000000-0000-4000-8000-000000000002";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const ROLE_ID = "40000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "a0000000-0000-4000-8000-000000000001";
const BRAND_ID = "b0000000-0000-4000-8000-000000000001";
const MODEL_ID = "c0000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "d0000000-0000-4000-8000-000000000001";
const ALIAS_ID = "e0000000-0000-4000-8000-000000000001";
const BARCODE_ID = "f0000000-0000-4000-8000-000000000001";

/** A well-formed id that exists in PostgreSQL — under a different tenant. */
const FOREIGN_ID = "99999999-0000-4000-8000-000000000009";

function signedCookie(token: string): string {
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(token)
    .digest("base64")
    .replace(/=+$/u, "");
  return `mshop_session=${encodeURIComponent(`s:${token}.${signature}`)}`;
}

// --- Values that must never cross the API boundary --------------------------

/**
 * Keys the catalog contract forbids in either direction: cost, price, stock and
 * device identity belong to other modules and other permissions, and the tenant
 * is never client-supplied. Compared in a normalized form so that a camelCase
 * and a snake_case spelling of the same field are one entry.
 */
const FORBIDDEN_RESPONSE_KEYS = [
  "organizationId",
  "organization_id",
  "costMinor",
  "priceMinor",
  "defaultPriceMinor",
  "minPriceMinor",
  "reorderPoint",
  "casePackSize",
  "stock",
  "quantity",
  "imei",
] as const;

/** Fields a hostile client might try to smuggle past the strict input schemas. */
const SMUGGLED_FIELDS: ReadonlyArray<readonly [string, unknown]> = [
  ["organizationId", "00000000-0000-4000-8000-0000000000ff"],
  ["organization_id", "00000000-0000-4000-8000-0000000000ff"],
  ["costMinor", 1],
  ["priceMinor", 1],
  ["defaultPriceMinor", 1],
  ["stock", 1],
  ["quantity", 1],
  ["imei", "356938035643809"],
  ["reorderPoint", 1],
  ["isActive", true],
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/_/gu, "");
}

const FORBIDDEN_KEY_FORMS = new Set(FORBIDDEN_RESPONSE_KEYS.map(normalizeKey));

/**
 * Every path in `value` whose key names a forbidden field. Walks the whole tree
 * rather than checking a handful of known fields, so a leak nested inside
 * `productModel` or an alias row is caught just as a top-level one would be.
 */
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

/**
 * Values planted on every mocked database row. A row read from PostgreSQL is
 * far wider than the public contract, so the mapping layer must whitelist rather
 * than spread. Planting these proves it does: if any mapper ever passes a row
 * through, these unmistakable values surface in the response body.
 */
const ROW_POLLUTION = {
  organizationId: ORGANIZATION_ID,
  organization_id: ORGANIZATION_ID,
  costMinor: 111111111,
  priceMinor: 222222222,
  defaultPriceMinor: 333333333,
  minPriceMinor: 444444444,
  reorderPoint: 555555555,
  casePackSize: 666666666,
  stock: 777777777,
  quantity: 888888888,
  imei: "356938035643809",
} as const;

const POLLUTION_VALUES = Object.values(ROW_POLLUTION).map(String);

// --- Tenant fixtures --------------------------------------------------------

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
    userAgent: "test-agent",
    createdAt: NOW,
    lastSeenAt: new Date(),
    branch,
    user: authUserWith(permissions),
  };
}

const ALL_CATALOG_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.CATALOG_VIEW,
  PERMISSIONS.CATALOG_CREATE,
  PERMISSIONS.CATALOG_UPDATE,
  PERMISSIONS.CATALOG_DEACTIVATE,
];

/** The exact grant a role gets when it may read the catalog but not edit it. */
const VIEW_ONLY: readonly PermissionKey[] = [PERMISSIONS.CATALOG_VIEW];

// --- Row fixtures -----------------------------------------------------------

const categoryRow = {
  ...ROW_POLLUTION,
  id: CATEGORY_ID,
  name: "Smartphones",
  slug: "smartphones",
  parentCategoryId: null,
  isActive: true,
  version: 4,
  createdAt: NOW,
  updatedAt: NOW,
};

const brandRow = {
  ...ROW_POLLUTION,
  id: BRAND_ID,
  name: "Apple",
  slug: "apple",
  isActive: true,
  version: 5,
  createdAt: NOW,
  updatedAt: NOW,
};

const productModelRow = {
  ...ROW_POLLUTION,
  id: MODEL_ID,
  name: "iPhone 15",
  canonicalName: "iphone 15",
  brandId: BRAND_ID,
  categoryId: CATEGORY_ID,
  isActive: true,
  version: 6,
  brand: { name: "Apple" },
  category: { name: "Smartphones" },
};

/**
 * Nested relations stay clean: `select` bounds them in the real query, and the
 * strict response schemas reject an unknown nested key by design. Pollution is
 * planted at the top level, which is where a row is mapped by hand.
 */
const productRow = {
  ...ROW_POLLUTION,
  id: PRODUCT_ID,
  sku: "IPH-15-128-BLK",
  name: "iPhone 15 128GB Black",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  ram: null,
  storage: "128GB",
  color: "Black",
  region: null,
  warrantyType: "none",
  warrantyMonths: null,
  isActive: true,
  version: 7,
  createdAt: NOW,
  updatedAt: NOW,
  productModel: {
    id: MODEL_ID,
    name: "iPhone 15",
    brand: { id: BRAND_ID, name: "Apple" },
    category: { id: CATEGORY_ID, name: "Smartphones" },
  },
  aliases: [{ id: ALIAS_ID, alias: "iPhone 15 Black" }],
  barcodes: [{ id: BARCODE_ID, barcode: "8901234567890", isPrimary: true }],
};

// --- Request bodies ---------------------------------------------------------

function categoryUpdateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Smartphones",
    parentCategoryId: null,
    version: categoryRow.version,
    ...overrides,
  };
}

function brandUpdateBody(overrides: Record<string, unknown> = {}) {
  return { name: "Apple", version: brandRow.version, ...overrides };
}

function productModelUpdateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "iPhone 15",
    brandId: BRAND_ID,
    categoryId: CATEGORY_ID,
    version: productModelRow.version,
    ...overrides,
  };
}

function productUpdateBody(overrides: Record<string, unknown> = {}) {
  return {
    productModelId: MODEL_ID,
    sku: "IPH-15-128-BLK",
    name: "iPhone 15 128GB Black",
    // Round-tripped unchanged: the same value must stay a no-op, only a real
    // change is locked.
    trackingType: "serialized",
    condition: "new",
    ptaStatus: "pta_approved",
    ram: null,
    storage: "128GB",
    color: "Black",
    region: null,
    warrantyType: "none",
    warrantyMonths: null,
    aliases: ["iPhone 15 Black"],
    barcodes: ["8901234567890"],
    version: productRow.version,
    ...overrides,
  };
}

// --- Route tables -----------------------------------------------------------

type HttpMethod = "get" | "post" | "patch";

interface Route {
  readonly name: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly body?: Record<string, unknown>;
  /** The tenant-scoped read that must reject a foreign id with 404. */
  readonly loader?: "category" | "brand" | "productModel" | "productVariant";
  readonly foreignPath?: string;
}

/**
 * Success status of a route as the application actually serves it. The
 * deactivate/activate transitions are POSTs, and Nest answers a POST with
 * `201 Created` unless the handler overrides it — so 201 is asserted here as
 * observed behaviour, not as an endorsement of it (see the note in the suite
 * header of the review notes: a state transition on an existing row is not a
 * creation, and these responses carry no Location header).
 */
function successStatus(route: Pick<Route, "method">): number {
  return route.method === "post" ? 201 : 200;
}

const UPDATE_ROUTES: readonly Route[] = [
  {
    name: "PATCH /products/:id",
    method: "patch",
    path: `/api/v1/products/${PRODUCT_ID}`,
    body: productUpdateBody(),
    loader: "productVariant",
    foreignPath: `/api/v1/products/${FOREIGN_ID}`,
  },
  {
    name: "PATCH /catalog/categories/:id",
    method: "patch",
    path: `/api/v1/catalog/categories/${CATEGORY_ID}`,
    body: categoryUpdateBody(),
    loader: "category",
    foreignPath: `/api/v1/catalog/categories/${FOREIGN_ID}`,
  },
  {
    name: "PATCH /catalog/brands/:id",
    method: "patch",
    path: `/api/v1/catalog/brands/${BRAND_ID}`,
    body: brandUpdateBody(),
    loader: "brand",
    foreignPath: `/api/v1/catalog/brands/${FOREIGN_ID}`,
  },
  {
    name: "PATCH /catalog/product-models/:id",
    method: "patch",
    path: `/api/v1/catalog/product-models/${MODEL_ID}`,
    body: productModelUpdateBody(),
    loader: "productModel",
    foreignPath: `/api/v1/catalog/product-models/${FOREIGN_ID}`,
  },
];

const DEACTIVATE_ROUTES: readonly Route[] = [
  {
    name: "POST /products/:id/deactivate",
    method: "post",
    path: `/api/v1/products/${PRODUCT_ID}/deactivate`,
    body: { version: productRow.version },
    loader: "productVariant",
    foreignPath: `/api/v1/products/${FOREIGN_ID}/deactivate`,
  },
  {
    name: "POST /catalog/categories/:id/deactivate",
    method: "post",
    path: `/api/v1/catalog/categories/${CATEGORY_ID}/deactivate`,
    body: { version: categoryRow.version },
    loader: "category",
    foreignPath: `/api/v1/catalog/categories/${FOREIGN_ID}/deactivate`,
  },
  {
    name: "POST /catalog/brands/:id/deactivate",
    method: "post",
    path: `/api/v1/catalog/brands/${BRAND_ID}/deactivate`,
    body: { version: brandRow.version },
    loader: "brand",
    foreignPath: `/api/v1/catalog/brands/${FOREIGN_ID}/deactivate`,
  },
  {
    name: "POST /catalog/product-models/:id/deactivate",
    method: "post",
    path: `/api/v1/catalog/product-models/${MODEL_ID}/deactivate`,
    body: { version: productModelRow.version },
    loader: "productModel",
    foreignPath: `/api/v1/catalog/product-models/${FOREIGN_ID}/deactivate`,
  },
];

const ACTIVATE_ROUTES: readonly Route[] = [
  {
    name: "POST /products/:id/activate",
    method: "post",
    path: `/api/v1/products/${PRODUCT_ID}/activate`,
    body: { version: productRow.version },
    loader: "productVariant",
    foreignPath: `/api/v1/products/${FOREIGN_ID}/activate`,
  },
  {
    name: "POST /catalog/categories/:id/activate",
    method: "post",
    path: `/api/v1/catalog/categories/${CATEGORY_ID}/activate`,
    body: { version: categoryRow.version },
    loader: "category",
    foreignPath: `/api/v1/catalog/categories/${FOREIGN_ID}/activate`,
  },
  {
    name: "POST /catalog/brands/:id/activate",
    method: "post",
    path: `/api/v1/catalog/brands/${BRAND_ID}/activate`,
    body: { version: brandRow.version },
    loader: "brand",
    foreignPath: `/api/v1/catalog/brands/${FOREIGN_ID}/activate`,
  },
  {
    name: "POST /catalog/product-models/:id/activate",
    method: "post",
    path: `/api/v1/catalog/product-models/${MODEL_ID}/activate`,
    body: { version: productModelRow.version },
    loader: "productModel",
    foreignPath: `/api/v1/catalog/product-models/${FOREIGN_ID}/activate`,
  },
];

const READ_ROUTES: readonly Route[] = [
  {
    name: "GET /catalog/categories",
    method: "get",
    path: "/api/v1/catalog/categories",
  },
  {
    name: "GET /catalog/brands",
    method: "get",
    path: "/api/v1/catalog/brands",
  },
  {
    name: "GET /catalog/product-models",
    method: "get",
    path: "/api/v1/catalog/product-models",
  },
  { name: "GET /products", method: "get", path: "/api/v1/products" },
  {
    name: "GET /products/:id",
    method: "get",
    path: `/api/v1/products/${PRODUCT_ID}`,
    loader: "productVariant",
    foreignPath: `/api/v1/products/${FOREIGN_ID}`,
  },
];

const UNSAFE_ROUTES: readonly Route[] = [
  ...UPDATE_ROUTES,
  ...DEACTIVATE_ROUTES,
  ...ACTIVATE_ROUTES,
];

const ALL_ROUTES: readonly Route[] = [...READ_ROUTES, ...UNSAFE_ROUTES];

// --- Prisma mock ------------------------------------------------------------

const CATALOG_TABLES = [
  "category",
  "brand",
  "productModel",
  "productVariant",
  "productAlias",
  "productBarcode",
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

describe("Catalog management endpoints (HTTP)", () => {
  let app: INestApplication;
  let grantedPermissions: readonly PermissionKey[] = ALL_CATALOG_PERMISSIONS;

  const client = {
    session: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    category: tableMock(),
    brand: tableMock(),
    productModel: tableMock(),
    productVariant: tableMock(),
    productAlias: tableMock(),
    productBarcode: tableMock(),
    auditEvent: tableMock(),
    $transaction: vi.fn(),
  };

  /** Fails if any catalog table was written — the proof that a guard held. */
  function expectNoDatabaseWrite(): void {
    for (const table of CATALOG_TABLES) {
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
          : agent.post(route.path);
    return route.body === undefined ? pending : pending.send(route.body);
  }

  function authorized(
    route: Pick<Route, "method" | "body"> & { path: string },
    permissions: readonly PermissionKey[] = ALL_CATALOG_PERMISSIONS,
  ) {
    grantedPermissions = permissions;
    return send(route).set("Cookie", signedCookie(VALID_TOKEN));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ client, ping: vi.fn().mockResolvedValue(undefined) })
      // ThrottlerGuard itself stays real and still runs first on every request;
      // only its counter is neutralised. The global limit (20 per handler per
      // minute in tests) is proven by throttling.e2e-spec, and this file
      // deliberately exercises a single handler far more often than a real
      // client would. Origin, Auth and Permission are untouched.
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
    vi.clearAllMocks();
    grantedPermissions = ALL_CATALOG_PERMISSIONS;

    client.session.findUnique.mockImplementation(() =>
      Promise.resolve(sessionWith(grantedPermissions)),
    );
    client.session.updateMany.mockResolvedValue({ count: 1 });

    // One client object doubles as the transaction client, so an assertion on
    // `client.category.updateMany` sees writes issued inside $transaction too.
    client.$transaction.mockImplementation((argument: unknown) =>
      typeof argument === "function"
        ? (argument as (tx: unknown) => Promise<unknown>)(client)
        : Promise.all(argument as Promise<unknown>[]),
    );

    client.category.findFirst.mockResolvedValue(categoryRow);
    client.category.updateMany.mockResolvedValue({ count: 1 });
    client.brand.findFirst.mockResolvedValue(brandRow);
    client.brand.updateMany.mockResolvedValue({ count: 1 });
    client.brand.create.mockResolvedValue(brandRow);
    client.productModel.findFirst.mockResolvedValue(productModelRow);
    client.productModel.updateMany.mockResolvedValue({ count: 1 });
    client.productVariant.findFirst.mockResolvedValue(productRow);
    client.productVariant.updateMany.mockResolvedValue({ count: 1 });
    client.productVariant.create.mockResolvedValue(productRow);
    client.productAlias.updateMany.mockResolvedValue({ count: 1 });
    client.productAlias.createMany.mockResolvedValue({ count: 1 });
    client.productBarcode.updateMany.mockResolvedValue({ count: 1 });
    client.productBarcode.createMany.mockResolvedValue({ count: 1 });
    client.auditEvent.create.mockResolvedValue({});
  });

  afterAll(async () => {
    await app?.close();
  });

  // --- 1. Authentication ----------------------------------------------------

  describe("authentication", () => {
    it.each(ALL_ROUTES.map((route) => [route.name, route] as const))(
      "rejects %s without a session and touches no table",
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

  // --- 2. Permissions -------------------------------------------------------

  describe("permission enforcement", () => {
    it.each(UPDATE_ROUTES.map((route) => [route.name, route] as const))(
      "denies %s to a catalog.view session without catalog.update",
      async (_name, route) => {
        const response = await authorized(route, VIEW_ONLY).expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expectNoDatabaseWrite();
      },
    );

    it.each(DEACTIVATE_ROUTES.map((route) => [route.name, route] as const))(
      "denies %s to a catalog.view session without catalog.deactivate",
      async (_name, route) => {
        const response = await authorized(route, VIEW_ONLY).expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expectNoDatabaseWrite();
      },
    );

    it.each(DEACTIVATE_ROUTES.map((route) => [route.name, route] as const))(
      "does not let catalog.update alone reach %s",
      async (_name, route) => {
        const response = await authorized(route, [
          PERMISSIONS.CATALOG_VIEW,
          PERMISSIONS.CATALOG_UPDATE,
        ]).expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expectNoDatabaseWrite();
      },
    );

    /**
     * Reactivation is an edit of an existing record, so it is gated on
     * catalog.update — not on catalog.deactivate, and not on catalog.create.
     */
    it.each(ACTIVATE_ROUTES.map((route) => [route.name, route] as const))(
      "denies %s to a session holding catalog.deactivate but not catalog.update",
      async (_name, route) => {
        const response = await authorized(route, [
          PERMISSIONS.CATALOG_VIEW,
          PERMISSIONS.CATALOG_CREATE,
          PERMISSIONS.CATALOG_DEACTIVATE,
        ]).expect(403);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN_PERMISSION,
        });
        expectNoDatabaseWrite();
      },
    );

    it.each(ACTIVATE_ROUTES.map((route) => [route.name, route] as const))(
      "admits %s for catalog.update",
      async (_name, route) => {
        await authorized(route, [
          PERMISSIONS.CATALOG_VIEW,
          PERMISSIONS.CATALOG_UPDATE,
        ]).expect(successStatus(route));

        expect(client.auditEvent.create).toHaveBeenCalledTimes(1);
      },
    );
  });

  // --- 3. Tenant isolation --------------------------------------------------

  describe("cross-tenant isolation", () => {
    type ScopedRoute = Route & {
      readonly foreignPath: string;
      readonly loader: NonNullable<Route["loader"]>;
    };

    const foreignRoutes = ALL_ROUTES.filter(
      (route): route is ScopedRoute =>
        route.foreignPath !== undefined && route.loader !== undefined,
    );

    it.each(foreignRoutes.map((route) => [route.name, route] as const))(
      "reports a foreign-tenant id on %s as 404, scoped by organizationId",
      async (_name, route) => {
        const loader = client[route.loader].findFirst;
        // The row exists — but only for another organization, so the
        // organization-scoped read finds nothing.
        loader.mockResolvedValue(null);

        const response = await authorized({
          method: route.method,
          path: route.foreignPath,
          ...(route.body === undefined ? {} : { body: route.body }),
        }).expect(404);

        expect(response.body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
        // Never 403: distinguishing "forbidden" from "absent" would confirm the
        // id exists in another tenant.
        expect(response.status).not.toBe(403);
        expect(JSON.stringify(response.body)).not.toContain(FOREIGN_ID);

        expect(loader).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: FOREIGN_ID,
              organizationId: ORGANIZATION_ID,
            }),
          }),
        );
        expectNoDatabaseWrite();
      },
    );

    it("never lets a request widen its own tenant scope", async () => {
      await authorized({
        method: "patch",
        path: `/api/v1/catalog/brands/${BRAND_ID}`,
        body: brandUpdateBody(),
      }).expect(200);

      const everyWhere = [
        ...client.brand.findFirst.mock.calls,
        ...client.brand.updateMany.mock.calls,
      ].map(
        ([argument]) => (argument as { where: Record<string, unknown> }).where,
      );

      expect(everyWhere.length).toBeGreaterThan(0);
      for (const where of everyWhere) {
        expect(where.organizationId).toBe(ORGANIZATION_ID);
      }
      expect(client.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: ORGANIZATION_ID }),
        }),
      );
    });
  });

  // --- 4. Origin / CSRF -----------------------------------------------------

  describe("origin protection", () => {
    it.each(UNSAFE_ROUTES.map((route) => [route.name, route] as const))(
      "rejects %s from an untrusted browser origin before any write",
      async (_name, route) => {
        // Fully authenticated and fully permitted: only the Origin is wrong, so
        // a pass here would be a real CSRF hole.
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
      await authorized({
        method: "patch",
        path: `/api/v1/catalog/brands/${BRAND_ID}`,
        body: brandUpdateBody(),
      })
        .set("Origin", TRUSTED_ORIGIN)
        .expect(200);

      expect(client.brand.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  // --- 5. Field smuggling ---------------------------------------------------

  describe("input smuggling", () => {
    it.each(SMUGGLED_FIELDS)(
      "refuses %s in a category update body",
      async (field, value) => {
        const response = await authorized({
          method: "patch",
          path: `/api/v1/catalog/categories/${CATEGORY_ID}`,
          body: categoryUpdateBody({ [field]: value }),
        }).expect(422);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        expectNoDatabaseWrite();
      },
    );

    it.each(SMUGGLED_FIELDS)(
      "refuses %s in a product update body",
      async (field, value) => {
        const response = await authorized({
          method: "patch",
          path: `/api/v1/products/${PRODUCT_ID}`,
          body: productUpdateBody({ [field]: value }),
        }).expect(422);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        expectNoDatabaseWrite();
      },
    );

    it.each(SMUGGLED_FIELDS)(
      "refuses %s in a deactivate body",
      async (field, value) => {
        const response = await authorized({
          method: "post",
          path: `/api/v1/catalog/brands/${BRAND_ID}/deactivate`,
          body: { version: brandRow.version, [field]: value },
        }).expect(422);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        expectNoDatabaseWrite();
      },
    );
  });

  // --- 6. Optimistic locking ------------------------------------------------

  describe("optimistic locking", () => {
    it("returns OPTIMISTIC_LOCK_FAILED when an update carries a stale version", async () => {
      // The guarded write matches no row: someone else committed first.
      client.brand.updateMany.mockResolvedValue({ count: 0 });

      const response = await authorized({
        method: "patch",
        path: `/api/v1/catalog/brands/${BRAND_ID}`,
        body: brandUpdateBody({ version: 1 }),
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      });
      expect(client.brand.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ version: 1 }),
        }),
      );
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });

    it("returns OPTIMISTIC_LOCK_FAILED when a deactivate carries a stale version", async () => {
      client.productVariant.updateMany.mockResolvedValue({ count: 0 });

      const response = await authorized({
        method: "post",
        path: `/api/v1/products/${PRODUCT_ID}/deactivate`,
        body: { version: 1 },
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      });
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });

    it("carries the caller's version into the guarded write and audits the success", async () => {
      await authorized({
        method: "patch",
        path: `/api/v1/catalog/categories/${CATEGORY_ID}`,
        body: categoryUpdateBody(),
      }).expect(200);

      expect(client.category.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: CATEGORY_ID,
            organizationId: ORGANIZATION_ID,
            version: categoryRow.version,
          }),
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
      expect(client.auditEvent.create).toHaveBeenCalledTimes(1);
    });
  });

  // --- 7. Stable conflict codes ---------------------------------------------

  describe("stable conflict codes", () => {
    const duplicate = (target: readonly string[]) =>
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: [...target] },
      });

    it("maps a duplicate SKU to CATALOG_SKU_DUPLICATE", async () => {
      client.productVariant.updateMany.mockRejectedValue(
        duplicate(["organization_id", "sku"]),
      );

      const response = await authorized({
        method: "patch",
        path: `/api/v1/products/${PRODUCT_ID}`,
        body: productUpdateBody({ sku: "TAKEN-SKU" }),
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.CATALOG_SKU_DUPLICATE,
        details: { sku: expect.any(Array) },
      });
    });

    it("maps a duplicate barcode to CATALOG_BARCODE_DUPLICATE", async () => {
      client.productBarcode.createMany.mockRejectedValue(
        duplicate(["organization_id", "barcode"]),
      );

      const response = await authorized({
        method: "patch",
        path: `/api/v1/products/${PRODUCT_ID}`,
        body: productUpdateBody({ barcodes: ["4006381333931"] }),
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.CATALOG_BARCODE_DUPLICATE,
        details: { barcodes: expect.any(Array) },
      });
    });

    it("maps a duplicate alias to VALIDATION_FAILED with alias details", async () => {
      client.productAlias.createMany.mockRejectedValue(
        duplicate(["organization_id", "normalized_alias"]),
      );

      const response = await authorized({
        method: "patch",
        path: `/api/v1/products/${PRODUCT_ID}`,
        body: productUpdateBody({ aliases: ["Someone else's alias"] }),
      }).expect(422);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.VALIDATION_FAILED,
        details: { aliases: expect.any(Array) },
      });
    });

    it.each([
      [
        "category",
        `/api/v1/catalog/categories/${CATEGORY_ID}`,
        categoryUpdateBody(),
      ],
      ["brand", `/api/v1/catalog/brands/${BRAND_ID}`, brandUpdateBody()],
      [
        "product model",
        `/api/v1/catalog/product-models/${MODEL_ID}`,
        productModelUpdateBody(),
      ],
    ] as const)(
      "maps a duplicate %s name to CONFLICT with name details",
      async (table, path, body) => {
        const target =
          table === "category"
            ? client.category
            : table === "brand"
              ? client.brand
              : client.productModel;
        target.updateMany.mockRejectedValue(
          duplicate(["organization_id", "slug"]),
        );

        const response = await authorized({
          method: "patch",
          path,
          body,
        }).expect(409);

        expect(response.body).toMatchObject({
          code: ERROR_CODES.CONFLICT,
          details: { name: expect.any(Array) },
        });
      },
    );

    it("locks a tracking type change with CATALOG_TRACKING_TYPE_LOCKED and writes nothing", async () => {
      const response = await authorized({
        method: "patch",
        path: `/api/v1/products/${PRODUCT_ID}`,
        // The stored row is serialized; switching it is a migration, not an edit.
        body: productUpdateBody({ trackingType: "quantity" }),
      }).expect(400);

      expect(response.body).toMatchObject({
        code: ERROR_CODES.CATALOG_TRACKING_TYPE_LOCKED,
      });
      expect(client.productVariant.updateMany).not.toHaveBeenCalled();
      expect(client.auditEvent.create).not.toHaveBeenCalled();
    });

    it("treats an unchanged tracking type as a no-op and succeeds", async () => {
      const response = await authorized({
        method: "patch",
        path: `/api/v1/products/${PRODUCT_ID}`,
        body: productUpdateBody({ trackingType: productRow.trackingType }),
      }).expect(200);

      expect(response.body).toMatchObject({
        trackingType: productRow.trackingType,
      });
      // The locked column must never appear in the write itself.
      const [write] = client.productVariant.updateMany.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(write.data).not.toHaveProperty("trackingType");
    });
  });

  // --- 8. Response field leakage --------------------------------------------

  describe("response field exposure", () => {
    const responses: ReadonlyArray<readonly [string, Route]> = [
      [
        "GET /products/:id",
        { name: "", method: "get", path: `/api/v1/products/${PRODUCT_ID}` },
      ],
      [
        "PATCH /products/:id",
        {
          name: "",
          method: "patch",
          path: `/api/v1/products/${PRODUCT_ID}`,
          body: productUpdateBody(),
        },
      ],
      ...UPDATE_ROUTES.filter((route) => route.loader !== "productVariant").map(
        (route) => [route.name, route] as const,
      ),
      ...DEACTIVATE_ROUTES.map((route) => [route.name, route] as const),
      ...ACTIVATE_ROUTES.map((route) => [route.name, route] as const),
    ];

    it.each(responses)(
      "exposes no restricted field on %s",
      async (_name, route) => {
        const response = await authorized(route).expect(successStatus(route));

        expect(forbiddenKeyPaths(response.body)).toEqual([]);
        // The mocked rows carry every restricted value; none may survive mapping.
        for (const planted of POLLUTION_VALUES) {
          expect(response.text).not.toContain(planted);
        }
      },
    );

    /**
     * Guards the guard: every leak assertion above is a `toEqual([])` on the
     * output of `forbiddenKeyPaths`, which would pass vacuously if the scan ever
     * stopped matching. This pins the scan's behaviour independently.
     */
    it("detects a restricted field wherever it is nested", () => {
      expect(forbiddenKeyPaths(categoryRow)).toContain("$.organizationId");
      expect(forbiddenKeyPaths({ productModel: { costMinor: 1 } })).toEqual([
        "$.productModel.costMinor",
      ]);
      expect(forbiddenKeyPaths({ items: [{ organization_id: "x" }] })).toEqual([
        "$.items[0].organization_id",
      ]);
      // A snake_case spelling is the same field, and must not slip past.
      expect(forbiddenKeyPaths({ reorder_point: 1 })).toEqual([
        "$.reorder_point",
      ]);
      // The legitimate contract is not flagged.
      expect(
        forbiddenKeyPaths({ id: "x", name: "y", version: 1, isActive: true }),
      ).toEqual([]);
    });

    it("keeps restricted fields out of the audit snapshots", async () => {
      await authorized({
        method: "patch",
        path: `/api/v1/products/${PRODUCT_ID}`,
        body: productUpdateBody(),
      }).expect(200);

      expect(client.auditEvent.create).toHaveBeenCalledTimes(1);
      const [event] = client.auditEvent.create.mock.calls[0] as [
        {
          data: {
            beforeSnapshot?: unknown;
            afterSnapshot?: unknown;
          };
        },
      ];

      expect(event.data.beforeSnapshot).toBeDefined();
      expect(event.data.afterSnapshot).toBeDefined();
      expect(forbiddenKeyPaths(event.data.beforeSnapshot, "$.before")).toEqual(
        [],
      );
      expect(forbiddenKeyPaths(event.data.afterSnapshot, "$.after")).toEqual(
        [],
      );
      for (const planted of POLLUTION_VALUES) {
        expect(JSON.stringify(event.data.beforeSnapshot)).not.toContain(
          planted,
        );
        expect(JSON.stringify(event.data.afterSnapshot)).not.toContain(planted);
      }
    });

    it("returns the edit identity a catalog.view caller needs and nothing more", async () => {
      const response = await authorized(
        { method: "get", path: `/api/v1/products/${PRODUCT_ID}` },
        VIEW_ONLY,
      ).expect(200);

      expect(response.body).toMatchObject({
        id: PRODUCT_ID,
        sku: productRow.sku,
        version: productRow.version,
        aliases: [{ id: ALIAS_ID, alias: "iPhone 15 Black" }],
        barcodes: [
          { id: BARCODE_ID, barcode: "8901234567890", isPrimary: true },
        ],
      });
      expect(forbiddenKeyPaths(response.body)).toEqual([]);
    });
  });

  // --- 9. Malformed identifiers ---------------------------------------------

  describe("malformed identifiers", () => {
    const malformed = [
      "not-a-uuid",
      "1",
      "00000000-0000-0000-0000-000000000000%20OR%201=1",
    ];

    it.each(malformed)(
      "rejects %s on GET /products/:id with a stable 4xx code",
      async (id) => {
        const response = await authorized({
          method: "get",
          path: `/api/v1/products/${id}`,
        });

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
        expect(client.productVariant.findFirst).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["categories", categoryUpdateBody()],
      ["brands", brandUpdateBody()],
      ["product-models", productModelUpdateBody()],
    ] as const)(
      "rejects a malformed id on PATCH /catalog/%s/:id before Prisma",
      async (segment, body) => {
        const response = await authorized({
          method: "patch",
          path: `/api/v1/catalog/${segment}/not-a-uuid`,
          body,
        }).expect(422);

        expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
        expect(response.body.message).not.toContain("prisma");
        expectNoDatabaseWrite();
      },
    );

    it("rejects a malformed id on a deactivate route without a 500", async () => {
      const response = await authorized({
        method: "post",
        path: "/api/v1/products/not-a-uuid/deactivate",
        body: { version: 1 },
      }).expect(422);

      expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expectNoDatabaseWrite();
    });
  });
});
