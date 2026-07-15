import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleSessionExpiry } from "./session-expiry";

describe("absolute session expiry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires exactly at the server-provided expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-16T12:00:00.000Z");
    const onExpired = vi.fn();

    scheduleSessionExpiry("2026-07-16T12:00:01.000Z", onExpired);

    await vi.advanceTimersByTimeAsync(999);
    expect(onExpired).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("expires immediately when cached auth is already past its deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-16T12:00:01.000Z");
    const onExpired = vi.fn();

    scheduleSessionExpiry("2026-07-16T12:00:00.000Z", onExpired);

    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("does not fire after the owning component cancels the timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-16T12:00:00.000Z");
    const onExpired = vi.fn();
    const cancel = scheduleSessionExpiry("2026-07-16T12:00:01.000Z", onExpired);

    cancel();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onExpired).not.toHaveBeenCalled();
  });
});
