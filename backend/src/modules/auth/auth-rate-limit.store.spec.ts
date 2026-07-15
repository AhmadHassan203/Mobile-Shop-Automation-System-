import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_RATE_LIMIT_MAX_TRACKERS,
  AuthRateLimitStore,
} from "./auth-rate-limit.store";

describe("AuthRateLimitStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enforces its absolute key bound and evicts expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    const store = new AuthRateLimitStore();
    const now = Date.now();

    for (let index = 0; index < AUTH_RATE_LIMIT_MAX_TRACKERS + 25; index += 1) {
      store.consume(`tracker-${index}`, 100, 60_000, now);
    }

    expect(store.trackedKeyCount).toBe(AUTH_RATE_LIMIT_MAX_TRACKERS);
    expect(store.hasTracker("tracker-0")).toBe(false);
    expect(
      store.hasTracker(`tracker-${AUTH_RATE_LIMIT_MAX_TRACKERS + 24}`),
    ).toBe(true);

    const removed = store.cleanupExpired(now + 60_000);
    expect(removed).toBe(AUTH_RATE_LIMIT_MAX_TRACKERS);
    expect(store.trackedKeyCount).toBe(0);

    store.onApplicationShutdown();
  });

  it("automatically removes idle keys when their TTL elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    const store = new AuthRateLimitStore();

    store.consume("temporary", 10, 1_000);
    expect(store.hasTracker("temporary")).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(store.hasTracker("temporary")).toBe(false);
    expect(store.trackedKeyCount).toBe(0);

    store.onApplicationShutdown();
  });
});
