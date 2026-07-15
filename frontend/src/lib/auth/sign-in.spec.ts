import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuth } from "@/lib/api/auth";
import { queryKeys } from "@/lib/query/keys";
import { signInAndCacheCurrentAuth } from "./sign-in";

const currentAuthFixture: CurrentAuth = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.test",
    fullName: "Test Owner",
    phone: null,
    mustChangePassword: false,
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Test Organization",
    timezone: "Asia/Karachi",
    currency: "PKR",
  },
  branch: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Test Branch",
    code: "TEST",
  },
  roles: ["owner"],
  permissions: [],
  scopes: [
    {
      branchId: "33333333-3333-4333-8333-333333333333",
      locationId: null,
    },
  ],
  session: { expiresAt: "2026-07-17T12:00:00.000Z" },
};

describe("direct sign-in cache boundary", () => {
  it("caches only current auth and never creates a credential-bearing mutation", async () => {
    const queryClient = new QueryClient();
    const credentials = {
      email: "owner@example.test",
      password: "DUMMY_TEST_PASSWORD",
    };
    const request = vi.fn().mockResolvedValue(currentAuthFixture);

    await expect(
      signInAndCacheCurrentAuth(queryClient, credentials, request),
    ).resolves.toEqual(currentAuthFixture);

    expect(request).toHaveBeenCalledWith(credentials);
    expect(queryClient.getQueryData(queryKeys.currentAuth)).toEqual(
      currentAuthFixture,
    );
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("does not write auth or mutation state when the request fails", async () => {
    const queryClient = new QueryClient();
    const failure = new Error("request failed");
    const request = vi.fn().mockRejectedValue(failure);

    await expect(
      signInAndCacheCurrentAuth(
        queryClient,
        {
          email: "owner@example.test",
          password: "DUMMY_TEST_PASSWORD",
        },
        request,
      ),
    ).rejects.toBe(failure);

    expect(queryClient.getQueryData(queryKeys.currentAuth)).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});
