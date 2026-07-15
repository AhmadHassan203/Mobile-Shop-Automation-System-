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
import cookieParser from "cookie-parser";
import request from "supertest";
import { API_VERSION, ERROR_CODES } from "@mobileshop/shared";
import { AppModule } from "@/app.module";
import { PrismaService } from "@/database/prisma.service";
import { hashSessionToken } from "@/modules/auth/auth-crypto";

const SESSION_SECRET = "test-session-secret-not-used-outside-tests-0123456789";
const VALID_TOKEN = "a".repeat(43);
const VALID_PASSWORD = "invalid-user-timing-placeholder";
const NOW = new Date("2026-07-15T18:00:00.000Z");

function signedCookie(token: string, corrupt = false): string {
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(token)
    .digest("base64")
    .replace(/=+$/u, "");
  const value = `s:${token}.${corrupt ? `${signature}corrupt` : signature}`;
  return `mshop_session=${encodeURIComponent(value)}`;
}

const organization = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "MobileShop",
  currency: "PKR",
  timezone: "Asia/Karachi",
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const branch = {
  id: "10000000-0000-4000-8000-000000000002",
  organizationId: organization.id,
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

const authUser = {
  id: "20000000-0000-4000-8000-000000000001",
  organizationId: organization.id,
  email: "owner@mobileshop.local",
  passwordHash:
    "$argon2id$v=19$m=65536,t=3,p=4$zL5lXCwVw1W6DJvoCMCnsw$xAe5pQITmFBafts+7U8jHdddUexpIcc9iPD20prZSVc",
  fullName: "Shop Owner",
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
      organizationId: organization.id,
      userId: "20000000-0000-4000-8000-000000000001",
      roleId: "40000000-0000-4000-8000-000000000001",
      assignedAt: NOW,
      assignedBy: null,
      role: {
        id: "40000000-0000-4000-8000-000000000001",
        organizationId: organization.id,
        code: "owner",
        name: "Owner",
        description: null,
        isSystem: true,
        createdAt: NOW,
        updatedAt: NOW,
        rolePermissions: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            roleId: "40000000-0000-4000-8000-000000000001",
            permissionId: "60000000-0000-4000-8000-000000000001",
            grantedAt: NOW,
            permission: {
              id: "60000000-0000-4000-8000-000000000001",
              key: "settings.manage",
              resource: "settings",
              action: "manage",
              description: null,
              createdAt: NOW,
            },
          },
        ],
      },
    },
  ],
  scopeAccess: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      organizationId: organization.id,
      userId: "20000000-0000-4000-8000-000000000001",
      branchId: branch.id,
      locationId: null,
      createdAt: NOW,
    },
  ],
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "80000000-0000-4000-8000-000000000001",
    organizationId: organization.id,
    userId: authUser.id,
    tokenHash: hashSessionToken(VALID_TOKEN),
    branchId: branch.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    createdAt: NOW,
    lastSeenAt: NOW,
    branch,
    user: authUser,
    ...overrides,
  };
}

describe("Auth endpoints and global guard (HTTP)", () => {
  let app: INestApplication;
  let guardedSession: ReturnType<typeof session> | null;
  let loginUsers: unknown[];

  const client = {
    user: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue(authUser),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    branch: { findFirst: vi.fn().mockResolvedValue(branch) },
    session: {
      findUnique: vi.fn(),
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: "new-session-id", ...data }),
        ),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    loginAttempt: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ client, ping: vi.fn().mockResolvedValue(undefined) })
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
    guardedSession = session();
    loginUsers = [authUser];
    client.user.findMany.mockImplementation(() => Promise.resolve(loginUsers));
    client.branch.findFirst.mockResolvedValue(branch);
    client.session.findUnique.mockImplementation(() =>
      Promise.resolve(guardedSession),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it("keeps health public while protecting current-user routes", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .expect(401);

    expect(response.body).toMatchObject({ code: ERROR_CODES.AUTH_REQUIRED });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects a tampered signed cookie before querying PostgreSQL", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", signedCookie(VALID_TOKEN, true))
      .expect(401);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.AUTH_SESSION_INVALID,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(client.session.findUnique).not.toHaveBeenCalled();
  });

  it("maps an expired session and revokes its row", async () => {
    guardedSession = session({ expiresAt: new Date(Date.now() - 1_000) });
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", signedCookie(VALID_TOKEN))
      .expect(401);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.AUTH_SESSION_EXPIRED,
    });
    expect(client.session.updateMany).toHaveBeenCalled();
  });

  it("maps a revoked session as invalid", async () => {
    guardedSession = session({ revokedAt: NOW });
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", signedCookie(VALID_TOKEN))
      .expect(401);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.AUTH_SESSION_INVALID,
    });
  });

  it("returns current grants without credentials and disables caching", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", signedCookie(VALID_TOKEN))
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      user: {
        id: authUser.id,
        email: authUser.email,
        fullName: authUser.fullName,
      },
      organization: { id: organization.id },
      branch: { id: branch.id },
      roles: ["owner"],
      permissions: ["settings.manage"],
      session: { expiresAt: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("uses the same generic response for unknown users and wrong passwords", async () => {
    loginUsers = [];
    const unknown = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: authUser.email, password: "wrong-password" })
      .expect(401);

    loginUsers = [authUser];
    const wrong = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: authUser.email, password: "wrong-password" })
      .expect(401);

    expect(unknown.body).toMatchObject({
      code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      message: "Invalid email or password",
    });
    expect(wrong.body).toMatchObject({
      code: unknown.body.code,
      message: unknown.body.message,
    });
  });

  it("audits a malformed credential body before returning validation details", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "" })
      .expect(422);

    expect(response.body).toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(client.loginAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "not-an-email",
          failureReason: "invalid_request",
          succeeded: false,
        }),
      }),
    );
    expect(client.user.findMany).not.toHaveBeenCalled();
  });

  it("issues only a signed secure-policy cookie after valid Argon2 verification", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: authUser.email, password: VALID_PASSWORD })
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("mshop_session=s%3A");
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).toContain("SameSite=Lax");
    expect(cookies[0]).toContain("Path=/api/v1");
    expect(cookies[0]).not.toContain(VALID_PASSWORD);
    expect(JSON.stringify(client.session.create.mock.calls)).not.toContain(
      VALID_PASSWORD,
    );
  });

  it("rejects unapproved browser origins before login or logout side effects", async () => {
    const rejectedLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", "https://hostile.example")
      .send({ email: authUser.email, password: VALID_PASSWORD })
      .expect(403);
    expect(rejectedLogin.body).toMatchObject({
      code: ERROR_CODES.FORBIDDEN_PERMISSION,
    });
    expect(rejectedLogin.headers["cache-control"]).toBe("no-store");
    expect(client.user.findMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const rejectedLogout = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Origin", "https://hostile.example")
      .set("Cookie", signedCookie(VALID_TOKEN))
      .expect(403);
    expect(rejectedLogout.body).toMatchObject({
      code: ERROR_CODES.FORBIDDEN_PERMISSION,
    });
    expect(client.auditEvent.create).not.toHaveBeenCalled();
  });

  it("handles inactive and locked accounts after correct password verification", async () => {
    loginUsers = [{ ...authUser, isActive: false }];
    const inactive = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: authUser.email, password: VALID_PASSWORD })
      .expect(403);
    expect(inactive.body).toMatchObject({
      code: ERROR_CODES.AUTH_USER_INACTIVE,
    });

    loginUsers = [
      { ...authUser, lockedUntil: new Date(Date.now() + 60 * 60 * 1000) },
    ];
    const locked = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: authUser.email, password: VALID_PASSWORD })
      .expect(429);
    expect(locked.body).toMatchObject({
      code: ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
    });
  });

  it("revokes logout, clears the cookie and returns no cached body", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", signedCookie(VALID_TOKEN))
      .expect(204);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).toBe("");
    expect(client.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: guardedSession?.id }),
      }),
    );
    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toContain("mshop_session=");
    expect(cookies[0]).toContain("Expires=Thu, 01 Jan 1970");
  });
});
