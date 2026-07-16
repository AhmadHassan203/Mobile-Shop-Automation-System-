import { PATH_METADATA } from "@nestjs/common/constants";
import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import { SalesController, salesActorContext } from "./sales.controller";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const BRANCH_ID = "10000000-0000-4000-8000-000000000002";
const OTHER_BRANCH_ID = "10000000-0000-4000-8000-000000000003";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const LOCATION_A = "30000000-0000-4000-8000-000000000001";
const LOCATION_B = "30000000-0000-4000-8000-000000000002";

function requestWith(
  permissions: CurrentAuth["permissions"],
  scopes: CurrentAuth["scopes"],
): Request {
  const current: CurrentAuth = {
    user: {
      id: USER_ID,
      email: "cashier@example.test",
      fullName: "Counter Cashier",
      phone: null,
      mustChangePassword: false,
    },
    organization: {
      id: ORGANIZATION_ID,
      name: "Test Mobile Shop",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
    branch: { id: BRANCH_ID, code: "MAIN", name: "Main Branch" },
    roles: ["cashier"],
    permissions,
    scopes,
    session: { expiresAt: "2026-07-17T12:00:00.000Z" },
  };
  return {
    auth: { sessionId: "session-id", current },
    ip: "127.0.0.1",
    requestId: "request-sales-controller-test",
    get: () => "sales-test-agent",
  } as unknown as Request;
}

describe("SalesController", () => {
  it("publishes the sales route and requires both posting and collection grants", () => {
    const postMethod = (
      SalesController.prototype as unknown as Record<string, unknown>
    )["post"];

    expect(Reflect.getMetadata(PATH_METADATA, SalesController)).toBe("sales");
    expect(Reflect.getMetadata(PATH_METADATA, postMethod as object)).toBe(
      ":id/post",
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, postMethod as object),
    ).toEqual([PERMISSIONS.SALES_POST, PERMISSIONS.PAYMENTS_COLLECT]);
  });

  it("preserves branch-wide access and derives profit visibility from permission", () => {
    const context = salesActorContext(
      requestWith(
        [PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_VIEW_PROFIT],
        [
          { branchId: BRANCH_ID, locationId: LOCATION_A },
          { branchId: BRANCH_ID, locationId: null },
          { branchId: OTHER_BRANCH_ID, locationId: LOCATION_B },
        ],
      ),
    );

    expect(context).toMatchObject({
      organizationId: ORGANIZATION_ID,
      organizationName: "Test Mobile Shop",
      branchId: BRANCH_ID,
      branchName: "Main Branch",
      actorUserId: USER_ID,
      actorFullName: "Counter Cashier",
      currency: "PKR",
      allowedLocationIds: null,
      canViewProfit: true,
      metadata: {
        requestId: "request-sales-controller-test",
        ipAddress: "127.0.0.1",
        userAgent: "sales-test-agent",
      },
    });
  });

  it("keeps only sorted unique locations from the active branch", () => {
    const context = salesActorContext(
      requestWith(
        [PERMISSIONS.SALES_VIEW],
        [
          { branchId: BRANCH_ID, locationId: LOCATION_B },
          { branchId: OTHER_BRANCH_ID, locationId: null },
          { branchId: BRANCH_ID, locationId: LOCATION_A },
          { branchId: BRANCH_ID, locationId: LOCATION_B },
        ],
      ),
    );

    expect(context.allowedLocationIds).toEqual([LOCATION_A, LOCATION_B]);
    expect(context.canViewProfit).toBe(false);
  });

  it("rejects unauthenticated context projection", () => {
    expect(() => salesActorContext({} as Request)).toThrow(
      "Authentication is required",
    );
  });
});
