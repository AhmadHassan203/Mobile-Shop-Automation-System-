import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { inventoryActorContext } from "./inventory.controller";

const BRANCH_ID = "10000000-0000-4000-8000-000000000003";
const LOCATION_A = "10000000-0000-4000-8000-000000000004";
const LOCATION_B = "10000000-0000-4000-8000-000000000005";
const OTHER_BRANCH_ID = "10000000-0000-4000-8000-000000000099";

function requestWithScopes(scopes: CurrentAuth["scopes"]): Request {
  const current: CurrentAuth = {
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "stock-controller@example.test",
      fullName: "Stock Controller",
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
    roles: ["stock-controller"],
    permissions: [PERMISSIONS.INVENTORY_VIEW],
    scopes,
    session: { expiresAt: "2026-07-17T12:00:00.000Z" },
  };
  return {
    auth: { sessionId: "session-id", current },
    ip: "127.0.0.1",
    requestId: "request-inventory-controller-test",
    get: () => undefined,
  } as unknown as Request;
}

describe("inventory controller location scope projection", () => {
  it("preserves branch-wide location access as null", () => {
    const context = inventoryActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: null },
        { branchId: OTHER_BRANCH_ID, locationId: LOCATION_B },
      ]),
    );

    expect(context.allowedLocationIds).toBeNull();
  });

  it("returns sorted unique locations from only the active branch", () => {
    const context = inventoryActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_B },
        { branchId: OTHER_BRANCH_ID, locationId: null },
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: LOCATION_B },
        { branchId: OTHER_BRANCH_ID, locationId: LOCATION_A },
      ]),
    );

    expect(context.allowedLocationIds).toEqual([LOCATION_A, LOCATION_B]);
  });
});
