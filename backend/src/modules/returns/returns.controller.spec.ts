import { PATH_METADATA } from "@nestjs/common/constants";
import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import { ReturnsController, returnsActorContext } from "./returns.controller";

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
      email: "manager@example.test",
      fullName: "Returns Manager",
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
    roles: ["manager"],
    permissions,
    scopes,
    session: { expiresAt: "2026-07-17T12:00:00.000Z" },
  };
  return {
    auth: { sessionId: "session-id", current },
    ip: "127.0.0.1",
    requestId: "request-returns-controller-test",
    get: () => "returns-test-agent",
  } as unknown as Request;
}

describe("ReturnsController", () => {
  it("requires both approval and collection grants to post a return", () => {
    const postMethod = (
      ReturnsController.prototype as unknown as Record<string, unknown>
    )["post"];

    expect(Reflect.getMetadata(PATH_METADATA, ReturnsController)).toBe("returns");
    expect(Reflect.getMetadata(PATH_METADATA, postMethod as object)).toBe(
      ":id/post",
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, postMethod as object),
    ).toEqual([PERMISSIONS.RETURNS_APPROVE, PERMISSIONS.PAYMENTS_COLLECT]);
  });

  it("declares GET /eligibility before GET /:id so the id route cannot swallow it", () => {
    const methods = Object.getOwnPropertyNames(ReturnsController.prototype);
    const eligibility = (
      ReturnsController.prototype as unknown as Record<string, unknown>
    )["eligibility"];
    const detail = (
      ReturnsController.prototype as unknown as Record<string, unknown>
    )["detail"];

    expect(methods.indexOf("eligibility")).toBeLessThan(methods.indexOf("detail"));
    expect(Reflect.getMetadata(PATH_METADATA, eligibility as object)).toBe(
      "eligibility",
    );
    expect(Reflect.getMetadata(PATH_METADATA, detail as object)).toBe(":id");
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, eligibility as object),
    ).toEqual([PERMISSIONS.RETURNS_CREATE]);
  });

  it("preserves branch-wide access and derives profit and contact visibility", () => {
    const context = returnsActorContext(
      requestWith(
        [
          PERMISSIONS.RETURNS_VIEW,
          PERMISSIONS.SALES_VIEW_PROFIT,
          PERMISSIONS.CUSTOMERS_VIEW_SENSITIVE,
        ],
        [
          { branchId: BRANCH_ID, locationId: LOCATION_A },
          { branchId: BRANCH_ID, locationId: null },
          { branchId: OTHER_BRANCH_ID, locationId: LOCATION_B },
        ],
      ),
    );

    expect(context).toMatchObject({
      organizationId: ORGANIZATION_ID,
      branchId: BRANCH_ID,
      actorUserId: USER_ID,
      currency: "PKR",
      allowedLocationIds: null,
      canViewProfit: true,
      canViewSensitive: true,
      metadata: {
        requestId: "request-returns-controller-test",
        ipAddress: "127.0.0.1",
        userAgent: "returns-test-agent",
      },
    });
  });

  it("keeps only sorted unique in-branch locations and redacts by default", () => {
    const context = returnsActorContext(
      requestWith(
        [PERMISSIONS.RETURNS_VIEW],
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
    expect(context.canViewSensitive).toBe(false);
  });

  it("rejects unauthenticated context projection", () => {
    expect(() => returnsActorContext({} as Request)).toThrow(
      "Authentication is required",
    );
  });
});
