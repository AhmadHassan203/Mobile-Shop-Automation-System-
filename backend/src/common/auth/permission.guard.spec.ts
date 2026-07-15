import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { ERROR_CODES, PERMISSIONS } from "@mobileshop/shared";
import type {
  CurrentAuth,
  DomainError,
  PermissionKey,
} from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import { PermissionGuard } from "./permission.guard";

const CURRENT_AUTH: CurrentAuth = {
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "user@example.test",
    fullName: "Test User",
    phone: null,
    mustChangePassword: false,
  },
  organization: {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Test Shop",
    currency: "PKR",
    timezone: "Asia/Karachi",
  },
  branch: {
    id: "10000000-0000-4000-8000-000000000003",
    code: "MAIN",
    name: "Main Branch",
  },
  roles: ["test"],
  permissions: [PERMISSIONS.CATALOG_VIEW, PERMISSIONS.CATALOG_CREATE],
  scopes: [
    {
      branchId: "10000000-0000-4000-8000-000000000003",
      locationId: null,
    },
  ],
  session: { expiresAt: "2026-07-17T12:00:00.000Z" },
};

function executionContext(auth: CurrentAuth | undefined): ExecutionContext {
  const request =
    auth === undefined
      ? {}
      : { auth: { sessionId: "session-id", current: auth } };
  return {
    getHandler: () => executionContext,
    getClass: () => PermissionGuard,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(required: readonly PermissionKey[] | undefined) {
  const reflector = {
    getAllAndMerge: vi.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new PermissionGuard(reflector);
}

describe("PermissionGuard", () => {
  it("allows authenticated routes without a domain permission decorator", () => {
    expect(guardWith(undefined).canActivate(executionContext(undefined))).toBe(
      true,
    );
  });

  it("requires every permission declared by the route", () => {
    const guard = guardWith([
      PERMISSIONS.CATALOG_VIEW,
      PERMISSIONS.CATALOG_CREATE,
    ]);
    expect(guard.canActivate(executionContext(CURRENT_AUTH))).toBe(true);
  });

  it("requires the merged class and method permission metadata", () => {
    const guard = guardWith([
      PERMISSIONS.CATALOG_VIEW,
      PERMISSIONS.CATALOG_DEACTIVATE,
    ]);

    expect(() =>
      guard.canActivate(executionContext(CURRENT_AUTH)),
    ).toThrowError(
      expect.objectContaining<Partial<DomainError>>({
        code: ERROR_CODES.FORBIDDEN_PERMISSION,
        status: 403,
      }),
    );
  });

  it("rejects a missing grant with a stable 403 domain code", () => {
    const guard = guardWith([
      PERMISSIONS.CATALOG_VIEW,
      PERMISSIONS.CATALOG_DEACTIVATE,
    ]);

    expect(() =>
      guard.canActivate(executionContext(CURRENT_AUTH)),
    ).toThrowError(
      expect.objectContaining<Partial<DomainError>>({
        code: ERROR_CODES.FORBIDDEN_PERMISSION,
        status: 403,
      }),
    );
  });

  it("fails closed when guard ordering provides no auth context", () => {
    expect(() =>
      guardWith([PERMISSIONS.CATALOG_VIEW]).canActivate(
        executionContext(undefined),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainError>>({
        code: ERROR_CODES.AUTH_REQUIRED,
        status: 401,
      }),
    );
  });
});
