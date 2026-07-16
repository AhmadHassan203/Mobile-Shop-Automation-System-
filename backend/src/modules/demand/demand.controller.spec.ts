import { PATH_METADATA } from "@nestjs/common/constants";
import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import { DemandController, demandActorContext } from "./demand.controller";

const IDS = {
  user: "10000000-0000-4000-8000-000000000001",
  organization: "10000000-0000-4000-8000-000000000002",
  branch: "10000000-0000-4000-8000-000000000003",
  otherBranch: "10000000-0000-4000-8000-000000000004",
  locationA: "10000000-0000-4000-8000-000000000005",
  locationB: "10000000-0000-4000-8000-000000000006",
} as const;

function requestWithScopes(scopes: CurrentAuth["scopes"]): Request {
  const current: CurrentAuth = {
    user: {
      id: IDS.user,
      email: "demand@example.test",
      fullName: "Demand User",
      phone: null,
      mustChangePassword: false,
    },
    organization: {
      id: IDS.organization,
      name: "Test Shop",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
    branch: { id: IDS.branch, code: "MAIN", name: "Main Branch" },
    roles: ["manager"],
    permissions: [
      PERMISSIONS.DEMAND_VIEW,
      PERMISSIONS.DEMAND_CREATE,
      PERMISSIONS.DEMAND_MANAGE,
    ],
    scopes,
    session: { expiresAt: "2026-07-17T12:00:00.000Z" },
  };
  return {
    auth: { sessionId: "session-id", current },
    ip: "127.0.0.1",
    requestId: "request-demand-controller-test",
    get: () => undefined,
  } as unknown as Request;
}

describe("DemandController", () => {
  it("publishes the canonical Demand resource and exact action permissions", () => {
    const prototype = DemandController.prototype as unknown as Record<
      string,
      object
    >;
    expect(Reflect.getMetadata(PATH_METADATA, DemandController)).toBe("demand");
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, prototype["list"]!),
    ).toEqual([PERMISSIONS.DEMAND_VIEW]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, prototype["create"]!),
    ).toEqual([PERMISSIONS.DEMAND_CREATE]);
    for (const method of ["transition", "convert"] as const) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS, prototype[method]!),
      ).toEqual([PERMISSIONS.DEMAND_MANAGE]);
    }
    for (const method of ["update", "followUp"] as const) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS, prototype[method]!),
      ).toEqual([PERMISSIONS.DEMAND_MANAGE, PERMISSIONS.CUSTOMERS_VIEW]);
    }
  });

  it("derives only sorted unique locations from the authenticated branch", () => {
    const context = demandActorContext(
      requestWithScopes([
        { branchId: IDS.branch, locationId: IDS.locationB },
        { branchId: IDS.otherBranch, locationId: null },
        { branchId: IDS.branch, locationId: IDS.locationA },
        { branchId: IDS.branch, locationId: IDS.locationB },
      ]),
    );
    expect(context).toMatchObject({
      organizationId: IDS.organization,
      branchId: IDS.branch,
      actorUserId: IDS.user,
      allowedLocationIds: [IDS.locationA, IDS.locationB],
    });
  });

  it("preserves branch-wide access when the active branch has a null location", () => {
    expect(
      demandActorContext(
        requestWithScopes([
          { branchId: IDS.branch, locationId: IDS.locationA },
          { branchId: IDS.branch, locationId: null },
        ]),
      ).allowedLocationIds,
    ).toBeNull();
  });

  it("fails closed without authentication", () => {
    expect(() => demandActorContext({} as Request)).toThrow(
      "Authentication is required",
    );
  });
});
