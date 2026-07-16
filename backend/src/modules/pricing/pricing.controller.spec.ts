import { PATH_METADATA } from "@nestjs/common/constants";
import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import { PricingController, pricingActorContext } from "./pricing.controller";

const BRANCH_ID = "10000000-0000-4000-8000-000000000003";
const OTHER_BRANCH_ID = "10000000-0000-4000-8000-000000000099";
const LOCATION_A = "10000000-0000-4000-8000-000000000004";
const LOCATION_B = "10000000-0000-4000-8000-000000000005";

function requestWithScopes(scopes: CurrentAuth["scopes"]): Request {
  const current: CurrentAuth = {
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "seller@example.test",
      fullName: "Counter Seller",
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
    roles: ["salesperson"],
    permissions: [PERMISSIONS.PRICING_VIEW],
    scopes,
    session: { expiresAt: "2026-07-17T12:00:00.000Z" },
  };
  return {
    auth: { sessionId: "session-id", current },
    ip: "127.0.0.1",
    requestId: "request-pricing-controller-test",
    get: () => undefined,
  } as unknown as Request;
}

describe("PricingController", () => {
  it("publishes the dedicated POS lookup under pricing.view", () => {
    const lookupMethod = (
      PricingController.prototype as unknown as Record<string, unknown>
    )["lookup"];

    expect(Reflect.getMetadata(PATH_METADATA, PricingController)).toBe(
      "pricing",
    );
    expect(Reflect.getMetadata(PATH_METADATA, lookupMethod as object)).toBe(
      "pos-lookup",
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, lookupMethod as object),
    ).toEqual([PERMISSIONS.PRICING_VIEW]);
  });

  it("guards default-price writes with pricing.manage", () => {
    const setMethod = (
      PricingController.prototype as unknown as Record<string, unknown>
    )["setVariantDefault"];

    expect(Reflect.getMetadata(PATH_METADATA, setMethod as object)).toBe(
      "variants/:id/default",
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, setMethod as object),
    ).toEqual([PERMISSIONS.PRICING_MANAGE]);
  });

  it("preserves branch-wide scope and authenticated currency", () => {
    const context = pricingActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: null },
        { branchId: OTHER_BRANCH_ID, locationId: LOCATION_B },
      ]),
    );

    expect(context).toMatchObject({
      branchId: BRANCH_ID,
      currency: "PKR",
      actorUserId: "10000000-0000-4000-8000-000000000001",
      metadata: {
        ipAddress: "127.0.0.1",
        requestId: "request-pricing-controller-test",
        userAgent: null,
      },
      allowedLocationIds: null,
    });
  });

  it("passes only sorted unique locations from the active branch", () => {
    const context = pricingActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_B },
        { branchId: OTHER_BRANCH_ID, locationId: null },
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: LOCATION_B },
      ]),
    );

    expect(context.allowedLocationIds).toEqual([LOCATION_A, LOCATION_B]);
  });

  it("rejects a request without authenticated context", () => {
    expect(() => pricingActorContext({} as Request)).toThrow(
      "Authentication is required",
    );
  });
});
