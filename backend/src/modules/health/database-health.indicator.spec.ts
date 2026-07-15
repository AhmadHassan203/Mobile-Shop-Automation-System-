import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../config/app-config.module";
import type { PrismaService } from "../../database/prisma.service";
import { DatabaseHealthIndicator } from "./database-health.indicator";

// Keep this focused unit test independent from the workspace package link.
vi.mock("../../database/prisma.service", () => ({ PrismaService: class {} }));

function makeIndicator(ping: () => Promise<void>): {
  indicator: DatabaseHealthIndicator;
  ping: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  const pingMock = vi.fn<() => Promise<void>>(ping);
  const prisma = { ping: pingMock } as unknown as PrismaService;
  const config = {
    get: vi.fn().mockReturnValue(1_250),
  } as unknown as AppConfig;
  return {
    indicator: new DatabaseHealthIndicator(prisma, config),
    ping: pingMock,
  };
}

describe("DatabaseHealthIndicator", () => {
  it("reports up only after a real ping succeeds within the configured budget", async () => {
    const { indicator, ping } = makeIndicator(() => Promise.resolve());

    await expect(indicator.check()).resolves.toBe("up");
    expect(ping).toHaveBeenCalledWith(1_250);
  });

  it("reports down without leaking the database error", async () => {
    const { indicator } = makeIndicator(() =>
      Promise.reject(new Error("driver detail")),
    );

    await expect(indicator.check()).resolves.toBe("down");
  });
});
