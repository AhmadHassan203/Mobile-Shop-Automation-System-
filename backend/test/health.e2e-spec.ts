import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { VersioningType, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_VERSION, REQUEST_ID_HEADER } from "@mobileshop/shared";
import { AppModule } from "@/app.module";
import { PrismaService } from "@/database/prisma.service";

vi.mock("@/database/prisma.service", () => ({ PrismaService: class {} }));

/**
 * Boots the real application over HTTP.
 *
 * Needs no database: it exercises bootstrap wiring, the request-ID middleware,
 * the global exception filter and the health endpoints. Slice 1 adds the
 * database-backed integration suite.
 */
describe("Health endpoints (HTTP)", () => {
  let app: INestApplication;
  const databasePing = vi
    .fn<PrismaService["ping"]>()
    .mockResolvedValue(undefined);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ ping: databasePing })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix("api");
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: API_VERSION.replace("v", ""),
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("GET /api/v1/health", () => {
    it("returns 200 with liveness detail", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/health")
        .expect(200);

      expect(response.body).toMatchObject({
        status: "ok",
        name: "MobileShop OS",
        apiVersion: "v1",
      });
      expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it("is reachable without authentication", async () => {
      // A load balancer cannot log in.
      await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    });

    it("leaks no configuration or secrets", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/health");
      const body = JSON.stringify(response.body).toLowerCase();

      for (const forbidden of [
        "password",
        "secret",
        "postgresql://",
        "session_secret",
        "database_url",
      ]) {
        expect(
          body,
          `health response must not contain "${forbidden}"`,
        ).not.toContain(forbidden);
      }
    });
  });

  describe("GET /api/v1/health/ready", () => {
    it("returns 200 only when the mandatory database responds", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/health/ready")
        .expect(200);
      expect(response.body).toMatchObject({
        status: "ok",
        dependencies: { database: "up" },
      });
      expect(databasePing).toHaveBeenCalled();
    });

    it("returns 503 when the mandatory database is unavailable", async () => {
      databasePing.mockRejectedValueOnce(new Error("connection refused"));

      const response = await request(app.getHttpServer())
        .get("/api/v1/health/ready")
        .expect(503);

      expect(response.body).toMatchObject({ code: "INTERNAL_ERROR" });
      expect(response.body.requestId).toBeDefined();
      expect(JSON.stringify(response.body)).not.toContain("connection refused");
    });
  });

  describe("request correlation", () => {
    it("generates a request ID and echoes it back", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/health")
        .expect(200);
      const requestId = response.headers[REQUEST_ID_HEADER];

      expect(requestId).toBeDefined();
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("honors a caller-supplied request ID so traces survive the proxy", async () => {
      const supplied = "trace-abc-123";
      const response = await request(app.getHttpServer())
        .get("/api/v1/health")
        .set(REQUEST_ID_HEADER, supplied)
        .expect(200);

      expect(response.headers[REQUEST_ID_HEADER]).toBe(supplied);
    });

    it("rejects an unsafe inbound request ID and substitutes a generated one", async () => {
      // The value reaches logs and headers, so injection attempts must not pass through.
      const response = await request(app.getHttpServer())
        .get("/api/v1/health")
        .set(REQUEST_ID_HEADER, "bad value with spaces and <script>")
        .expect(200);

      expect(response.headers[REQUEST_ID_HEADER]).not.toContain("<script>");
      expect(response.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("rejects an over-long inbound request ID", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/health")
        .set(REQUEST_ID_HEADER, "a".repeat(500))
        .expect(200);

      expect(response.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("issues a distinct ID per request", async () => {
      const [a, b] = await Promise.all([
        request(app.getHttpServer()).get("/api/v1/health"),
        request(app.getHttpServer()).get("/api/v1/health"),
      ]);
      expect(a.headers[REQUEST_ID_HEADER]).not.toBe(
        b.headers[REQUEST_ID_HEADER],
      );
    });
  });

  describe("error contract", () => {
    it("shapes an unknown route as a stable error body with a request ID", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/does-not-exist")
        .expect(404);

      expect(response.body).toMatchObject({ code: "NOT_FOUND" });
      expect(response.body.requestId).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      // 13_ §27: never expose stack traces to a normal user.
      expect(response.body.stack).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain("at Object");
    });
  });
});
