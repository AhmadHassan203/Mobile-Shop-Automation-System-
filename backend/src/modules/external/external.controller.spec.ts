import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
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
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import { ExternalController } from "./external.controller";
import {
  ExternalService,
  type ExternalBalancesResult,
  type ExternalCommissionResult,
} from "./external.service";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const BRANCH_ID = "10000000-0000-4000-8000-000000000002";
const USER_ID = "20000000-0000-4000-8000-000000000001";
// A real RFC-4122 UUID so the `:id` route's uuid pipe accepts it.
const TXN_ID = "40000000-0000-4000-8000-000000000009";

const BALANCES: ExternalBalancesResult = {
  businessDate: "2026-07-17",
  providers: [],
};
const COMMISSION: ExternalCommissionResult = {
  period: "month",
  from: "2026-07-01",
  to: "2026-07-31",
  totals: {
    grossFeeMinor: 0,
    providerCostMinor: 0,
    netCommissionMinor: 0,
    transactionCount: 0,
  },
  byProvider: [],
  byType: [],
};

// Spy per service method so each test asserts EXACTLY which handler ran. If the
// `:id` route is ever moved above the static routes and shadows them, `balances`
// / `commission` stop being called (and the uuid pipe rejects "balances" /
// "commission") — either way these tests fail loudly.
const serviceMock = {
  list: vi.fn(),
  detail: vi.fn(),
  balances: vi.fn(),
  commission: vi.fn(),
  record: vi.fn(),
};

const CURRENT: CurrentAuth = {
  user: {
    id: USER_ID,
    email: "router@example.test",
    fullName: "Route Prober",
    phone: null,
    mustChangePassword: false,
  },
  organization: {
    id: ORG_ID,
    name: "Test Shop",
    currency: "PKR",
    timezone: "Asia/Karachi",
  },
  branch: { id: BRANCH_ID, code: "MAIN", name: "Main Branch" },
  roles: ["owner"],
  permissions: [PERMISSIONS.EXTERNAL_VIEW],
  scopes: [],
  session: { expiresAt: "2026-07-17T12:00:00.000Z" },
};

/**
 * The production controller ships with the real global guards (AuthGuard +
 * PermissionGuard, registered as APP_GUARD in AppModule) and its
 * @RequirePermissions decorators — none of which are touched here. This slim
 * module boots ONLY the controller so the test observes pure route ordering; a
 * request-scoped middleware seeds the auth context the AuthGuard would normally
 * resolve from the session. (Nest's overrideGuard cannot intercept APP_GUARD
 * global guards in this version — it re-instantiates them — so the substitution
 * lives entirely in this test module, never in production code.) A separate
 * metadata assertion below proves the new routes keep their permission guard.
 */
describe("ExternalController routing (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    serviceMock.list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    serviceMock.detail.mockResolvedValue({ id: TXN_ID });
    serviceMock.balances.mockResolvedValue(BALANCES);
    serviceMock.commission.mockResolvedValue(COMMISSION);

    const moduleRef = await Test.createTestingModule({
      controllers: [ExternalController],
      providers: [{ provide: ExternalService, useValue: serviceMock }],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, {
        requestId: "external-controller-routing-test",
        auth: { sessionId: "session-id", current: CURRENT },
      });
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    serviceMock.list.mockClear();
    serviceMock.detail.mockClear();
    serviceMock.balances.mockClear();
    serviceMock.commission.mockClear();
    serviceMock.record.mockClear();
  });

  it("routes GET /external/balances to the balances handler, never getById", async () => {
    await request(app.getHttpServer()).get("/external/balances").expect(200);

    expect(serviceMock.balances).toHaveBeenCalledTimes(1);
    expect(serviceMock.detail).not.toHaveBeenCalled();
  });

  it("routes GET /external/commission to the commission handler with the period, never getById", async () => {
    await request(app.getHttpServer())
      .get("/external/commission?period=week")
      .expect(200);

    expect(serviceMock.commission).toHaveBeenCalledTimes(1);
    expect(serviceMock.commission).toHaveBeenCalledWith(
      expect.anything(),
      "week",
    );
    expect(serviceMock.detail).not.toHaveBeenCalled();
  });

  it("defaults the commission period to month when the query omits it", async () => {
    await request(app.getHttpServer()).get("/external/commission").expect(200);

    expect(serviceMock.commission).toHaveBeenCalledWith(
      expect.anything(),
      "month",
    );
  });

  it("still routes a real UUID to getById and not the static handlers", async () => {
    await request(app.getHttpServer()).get(`/external/${TXN_ID}`).expect(200);

    expect(serviceMock.detail).toHaveBeenCalledTimes(1);
    expect(serviceMock.balances).not.toHaveBeenCalled();
    expect(serviceMock.commission).not.toHaveBeenCalled();
  });
});

describe("ExternalController permission guard wiring", () => {
  const permissionsFor = (method: keyof ExternalController): unknown =>
    Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      (ExternalController.prototype as unknown as Record<string, object>)[
        method
      ] as object,
    );

  it("guards the new read routes with external.view, exactly like the list route", () => {
    expect(permissionsFor("balances")).toEqual([PERMISSIONS.EXTERNAL_VIEW]);
    expect(permissionsFor("commission")).toEqual([PERMISSIONS.EXTERNAL_VIEW]);
    expect(permissionsFor("list")).toEqual([PERMISSIONS.EXTERNAL_VIEW]);
  });
});
