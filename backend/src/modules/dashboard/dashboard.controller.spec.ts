import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import { PATH_METADATA } from "@nestjs/common/constants";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import {
  DashboardController,
  dashboardActorContext,
} from "./dashboard.controller";

const BRANCH_ID = "10000000-0000-4000-8000-000000000003";
const LOCATION_A = "10000000-0000-4000-8000-000000000004";
const LOCATION_B = "10000000-0000-4000-8000-000000000005";
const OTHER_BRANCH_ID = "10000000-0000-4000-8000-000000000099";

function requestWithScopes(scopes: CurrentAuth["scopes"]): Request {
  const current: CurrentAuth = {
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "dashboard@example.test",
      fullName: "Dashboard User",
      phone: null,
      mustChangePassword: false,
    },
    organization: {
      id: "10000000-0000-4000-8000-000000000002",
      name: "Test Shop",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
    branch: { id: BRANCH_ID, code: "MAIN", name: "Main Branch" },
    roles: ["owner"],
    permissions: [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_VIEW_COST,
    ],
    scopes,
    session: { expiresAt: "2026-07-17T12:00:00.000Z" },
  };
  return {
    auth: { sessionId: "session-id", current },
    ip: "203.0.113.5",
    requestId: "req-dashboard-1",
    get: (header: string) =>
      header.toLowerCase() === "user-agent" ? "vitest" : undefined,
  } as unknown as Request;
}

describe("DashboardController", () => {
  it("publishes the canonical reports/dashboard route without a coarse permission", () => {
    const snapshotMethod = (
      DashboardController.prototype as unknown as Record<string, unknown>
    )["snapshot"];
    expect(Reflect.getMetadata(PATH_METADATA, DashboardController)).toBe(
      "reports/dashboard",
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, snapshotMethod as object),
    ).toBeUndefined();
  });

  it("preserves branch-wide location access and all resolved permissions", () => {
    const context = dashboardActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: null },
        { branchId: OTHER_BRANCH_ID, locationId: LOCATION_B },
      ]),
    );

    expect(context.allowedLocationIds).toBeNull();
    expect(context.branchId).toBe(BRANCH_ID);
    // The enriched context carries what the reused domain services need.
    expect(context.organizationName).toBe("Test Shop");
    expect(context.branchName).toBe("Main Branch");
    expect(context.actorUserId).toBe("10000000-0000-4000-8000-000000000001");
    expect(context.actorFullName).toBe("Dashboard User");
    expect(context.metadata).toEqual({
      ipAddress: "203.0.113.5",
      userAgent: "vitest",
      requestId: "req-dashboard-1",
    });
    expect(context.permissions).toEqual(
      new Set([
        PERMISSIONS.REPORTS_VIEW,
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_VIEW_COST,
      ]),
    );
  });

  it("passes only sorted unique location scopes from the active branch", () => {
    const context = dashboardActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_B },
        { branchId: OTHER_BRANCH_ID, locationId: null },
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: LOCATION_B },
      ]),
    );

    expect(context.allowedLocationIds).toEqual([LOCATION_A, LOCATION_B]);
  });

  it("rejects a request with no authenticated current-user context", () => {
    expect(() => dashboardActorContext({} as Request)).toThrow(
      "Authentication is required",
    );
  });
});
