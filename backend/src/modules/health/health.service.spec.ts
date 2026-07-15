import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../config/app-config.module";
import {
  HealthService,
  type DependencyStatus,
  type HealthIndicator,
} from "./health.service";

type IndicatorCheck = () => Promise<DependencyStatus>;

function makeService(
  databaseCheck: IndicatorCheck = () => Promise.resolve("up"),
): {
  service: HealthService;
  databaseCheck: ReturnType<typeof vi.fn<IndicatorCheck>>;
} {
  const config = {
    get: vi.fn().mockReturnValue("test"),
  } as unknown as AppConfig;
  const check = vi.fn<IndicatorCheck>(databaseCheck);
  const database: HealthIndicator = {
    name: "database",
    check,
  };
  return { service: new HealthService(config, database), databaseCheck: check };
}

describe("liveness", () => {
  it("reports ok with identity and uptime", () => {
    const report = makeService().service.liveness();
    expect(report.status).toBe("ok");
    expect(report.name).toBe("MobileShop OS");
    expect(report.apiVersion).toBe("v1");
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(report.timestamp).toISOString()).not.toThrow();
  });

  it("never inspects dependencies", async () => {
    // A failing database must not make an orchestrator kill a healthy process.
    const { service, databaseCheck } = makeService(() =>
      Promise.resolve("down"),
    );

    service.liveness();
    expect(databaseCheck).not.toHaveBeenCalled();
    await expect(service.readiness()).rejects.toBeInstanceOf(HttpException);
  });
});

describe("readiness", () => {
  it("always checks the mandatory database dependency", async () => {
    const { service, databaseCheck } = makeService();

    const report = await service.readiness();

    expect(databaseCheck).toHaveBeenCalledOnce();
    expect(report.status).toBe("ok");
    expect(report.dependencies).toEqual({ database: "up" });
  });

  it("reports ok when every dependency is up", async () => {
    const { service } = makeService();
    service.register({ name: "storage", check: () => Promise.resolve("up") });

    const report = await service.readiness();
    expect(report.status).toBe("ok");
    expect(report.dependencies).toEqual({ database: "up", storage: "up" });
  });

  it("throws 503 when the mandatory database is down", async () => {
    const { service } = makeService(() => Promise.resolve("down"));

    await expect(service.readiness()).rejects.toBeInstanceOf(HttpException);
    await expect(service.readiness()).rejects.toMatchObject({ status: 503 });
  });

  it("treats a throwing check as down, not as a crashed probe", async () => {
    const { service } = makeService(() =>
      Promise.reject(new Error("connection refused")),
    );

    const error = await service.readiness().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({
      status: "degraded",
      dependencies: { database: "down" },
    });
  });

  it("does not let one down dependency hide the others", async () => {
    const { service } = makeService(() => Promise.resolve("down"));
    service.register({ name: "storage", check: () => Promise.resolve("up") });

    const error = (await service
      .readiness()
      .catch((caught: unknown) => caught)) as HttpException;
    expect(error.getResponse()).toMatchObject({
      dependencies: { database: "down", storage: "up" },
    });
  });

  it("reports an optional not_configured adapter without degrading", async () => {
    const { service } = makeService();
    service.register({
      name: "storage",
      check: () => Promise.resolve("not_configured"),
    });

    const report = await service.readiness();
    expect(report.status).toBe("ok");
    expect(report.dependencies).toEqual({
      database: "up",
      storage: "not_configured",
    });
  });

  it("rejects duplicate indicator names so mandatory status cannot be hidden", () => {
    const { service } = makeService();

    expect(() =>
      service.register({
        name: "database",
        check: () => Promise.resolve("up"),
      }),
    ).toThrow(/already registered/);
  });
});
