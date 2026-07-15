import { ERROR_CODES, LIMITS } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./client";
import {
  currentAuthSchema,
  getCurrentAuth,
  isEndedSessionError,
  isExpiredSessionError,
  isWorkspaceAccessEndedError,
  login,
  loginErrorMessage,
  loginInputSchema,
  logout,
  logoutErrorMessage,
} from "./auth";

const currentAuthFixture = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    fullName: "Shop Owner",
    phone: null,
    mustChangePassword: false,
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Example Mobile Shop",
    currency: "PKR",
    timezone: "Asia/Karachi",
  },
  branch: {
    id: "33333333-3333-4333-8333-333333333333",
    code: "LHR-01",
    name: "Lahore",
  },
  roles: ["owner"],
  permissions: ["catalog.view"],
  scopes: [
    {
      branchId: "33333333-3333-4333-8333-333333333333",
      locationId: null,
    },
  ],
  session: { expiresAt: "2026-07-16T12:00:00.000Z" },
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

describe("auth API contracts", () => {
  it("accepts the backend CurrentAuth DTO and rejects accidental secret fields", () => {
    expect(currentAuthSchema.parse(currentAuthFixture)).toEqual(
      currentAuthFixture,
    );
    expect(() =>
      currentAuthSchema.parse({
        ...currentAuthFixture,
        user: { ...currentAuthFixture.user, passwordHash: "must-not-leak" },
      }),
    ).toThrow();
  });

  it("normalizes an email without changing the submitted password", () => {
    expect(
      loginInputSchema.parse({
        email: "  OWNER@Example.COM ",
        password: "Case Sensitive Password",
      }),
    ).toEqual({
      email: "owner@example.com",
      password: "Case Sensitive Password",
    });
  });

  it("bounds password input before it reaches the network", () => {
    expect(() =>
      loginInputSchema.parse({
        email: "owner@example.com",
        password: "x".repeat(LIMITS.MAX_PASSWORD_LENGTH + 1),
      }),
    ).toThrow();
  });

  it("posts normalized credentials to the real login route", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(currentAuthFixture));
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(
      login({ email: " OWNER@EXAMPLE.COM ", password: "Secret value" }, client),
    ).resolves.toMatchObject({ user: { email: "owner@example.com" } });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/auth/login",
    );
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "owner@example.com",
      password: "Secret value",
    });
    expect(init?.credentials).toBe("include");
  });

  it("gets the current session from the real me route", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(currentAuthFixture));
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(getCurrentAuth(undefined, client)).resolves.toMatchObject({
      branch: { code: "LHR-01" },
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/auth/me",
    );
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it("posts to logout with credentials and accepts only the 204 empty body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(logout(client)).resolves.toBeNull();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/auth/logout",
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe("include");
  });
});

describe("auth-safe error presentation", () => {
  it.each([
    ERROR_CODES.AUTH_INVALID_CREDENTIALS,
    ERROR_CODES.AUTH_USER_INACTIVE,
  ])("does not reveal account state for %s", (code) => {
    const message = loginErrorMessage(
      new ApiError("Backend detail", { code, status: 401 }),
    );
    expect(message).toBe("Email or password is incorrect.");
    expect(message).not.toContain("inactive");
  });

  it("distinguishes an ended session from an expired or revoked session", () => {
    const missing = new ApiError("Missing", {
      code: ERROR_CODES.AUTH_REQUIRED,
      status: 401,
    });
    const expired = new ApiError("Expired", {
      code: ERROR_CODES.AUTH_SESSION_EXPIRED,
      status: 401,
    });

    expect(isEndedSessionError(missing)).toBe(true);
    expect(isExpiredSessionError(missing)).toBe(false);
    expect(isEndedSessionError(expired)).toBe(true);
    expect(isExpiredSessionError(expired)).toBe(true);
    expect(isWorkspaceAccessEndedError(expired)).toBe(true);
  });

  it("treats any 401 and revoked branch access as workspace-ending", () => {
    expect(
      isWorkspaceAccessEndedError(
        new ApiError("Unauthorized", { code: "FUTURE_AUTH_CODE", status: 401 }),
      ),
    ).toBe(true);
    expect(
      isWorkspaceAccessEndedError(
        new ApiError("Scope removed", {
          code: ERROR_CODES.FORBIDDEN_SCOPE,
          status: 403,
        }),
      ),
    ).toBe(true);
  });

  it("gives rate limits a non-enumerating retry message", () => {
    expect(
      loginErrorMessage(
        new ApiError("Locked", {
          code: ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
          status: 429,
        }),
      ),
    ).toContain("Too many sign-in attempts");
  });

  it("does not claim sign-out succeeded when the server is unreachable", () => {
    expect(
      logoutErrorMessage(
        new ApiError("fetch failed", { code: "NETWORK_ERROR" }),
      ),
    ).toContain("session may still be active");
  });
});
