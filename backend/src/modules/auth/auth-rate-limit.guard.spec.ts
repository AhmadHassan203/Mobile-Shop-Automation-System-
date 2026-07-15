import type { ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "@mobileshop/shared";
import type { Request, Response } from "express";
import type { AppConfig } from "../../config/app-config.module";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { AuthRateLimitStore } from "./auth-rate-limit.store";
import type { LoginAttemptRecorder } from "./login-attempt-recorder.service";

describe("AuthRateLimitGuard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("short-circuits a blocked IP without growing email state or repeating audit writes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));

    const store = new AuthRateLimitStore();
    const recordRateLimited = vi
      .fn<LoginAttemptRecorder["recordRateLimited"]>()
      .mockResolvedValue(undefined);
    const setHeader = vi.fn();
    const request = {
      body: { email: "first@mobileshop.local" },
      ip: "127.0.0.1",
      requestId: "request-1",
      get: vi.fn().mockReturnValue("test-agent"),
    } as unknown as Request;
    const response = { setHeader } as unknown as Response;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const config = {
      get: (key: string) => (key === "AUTH_RATE_LIMIT_TTL_SECONDS" ? 60 : 1),
    } as AppConfig;
    const guard = new AuthRateLimitGuard(store, config, {
      recordRateLimited,
    } as unknown as LoginAttemptRecorder);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(store.trackedKeyCount).toBe(2); // one IP + one email

    request.body = { email: "second-random@hostile.example" };
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
      status: 429,
    });
    expect(setHeader).toHaveBeenLastCalledWith("Retry-After", "60");
    expect(recordRateLimited).toHaveBeenCalledTimes(1);
    expect(recordRateLimited).toHaveBeenCalledWith(
      "second-random@hostile.example",
      expect.objectContaining({ ipAddress: "127.0.0.1" }),
    );
    expect(store.trackedKeyCount).toBe(2);

    vi.advanceTimersByTime(10_000);
    for (let index = 0; index < 25; index += 1) {
      request.body = { email: `random-${index}@hostile.example` };
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
      });
    }

    expect(setHeader).toHaveBeenLastCalledWith("Retry-After", "50");
    expect(recordRateLimited).toHaveBeenCalledTimes(1);
    expect(store.trackedKeyCount).toBe(2);
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");

    store.onApplicationShutdown();
  });
});
