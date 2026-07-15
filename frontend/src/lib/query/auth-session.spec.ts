import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  logoutAndClearCurrentAuth,
  purgeAuthDependentQueries,
  scheduleAuthSessionExpiry,
} from "./auth-session";
import { queryKeys } from "./keys";

afterEach(() => {
  vi.useRealTimers();
});

describe("logout cache safety", () => {
  it("clears authenticated state only after server revocation succeeds", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.currentAuth, { state: "authenticated" });
    const request = vi.fn().mockResolvedValue(null);

    await logoutAndClearCurrentAuth(queryClient, request);

    expect(request).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(queryKeys.currentAuth)).toBeUndefined();
  });

  it("preserves authenticated state when server revocation fails", async () => {
    const queryClient = new QueryClient();
    const current = { state: "authenticated" } as const;
    queryClient.setQueryData(queryKeys.currentAuth, current);
    const failure = new ApiError("network down", { code: "NETWORK_ERROR" });
    const request = vi.fn().mockRejectedValue(failure);

    await expect(logoutAndClearCurrentAuth(queryClient, request)).rejects.toBe(
      failure,
    );
    expect(queryClient.getQueryData(queryKeys.currentAuth)).toBe(current);
  });
});

describe("auth-dependent cache purge", () => {
  it("removes auth and marked private queries while preserving public health", async () => {
    const queryClient = new QueryClient();
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries");
    queryClient.setQueryData(queryKeys.currentAuth, { user: "cached" });
    queryClient.setQueryData(queryKeys.health, { status: "ok" });
    await queryClient.fetchQuery({
      queryKey: ["inventory", "private"],
      queryFn: () => Promise.resolve({ rows: [] }),
      meta: { authDependent: true },
    });

    purgeAuthDependentQueries(queryClient);

    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(queryKeys.currentAuth)).toBeUndefined();
    expect(queryClient.getQueryData(["inventory", "private"])).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.health)).toEqual({
      status: "ok",
    });
  });
});

describe("session-expiry cache boundary", () => {
  it("purges private cache and notifies the router at the absolute deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-16T12:00:00.000Z");
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.currentAuth, { user: "cached" });
    queryClient.setQueryData(queryKeys.health, { status: "ok" });
    await queryClient.fetchQuery({
      queryKey: ["inventory", "private"],
      queryFn: () => Promise.resolve({ rows: [1] }),
      meta: { authDependent: true },
    });
    const onExpired = vi.fn();

    scheduleAuthSessionExpiry(
      queryClient,
      "2026-07-16T12:00:01.000Z",
      onExpired,
    );
    await vi.advanceTimersByTimeAsync(1_000);

    expect(onExpired).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(queryKeys.currentAuth)).toBeUndefined();
    expect(queryClient.getQueryData(["inventory", "private"])).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.health)).toEqual({
      status: "ok",
    });
  });
});
