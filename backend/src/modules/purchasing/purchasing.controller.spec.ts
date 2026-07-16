import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import { PATH_METADATA } from "@nestjs/common/constants";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import {
  GoodsReceiptsController,
  PurchaseOrdersController,
  SuppliersController,
  purchasingActorContext,
} from "./purchasing.controller";

const BRANCH_ID = "10000000-0000-4000-8000-000000000003";
const LOCATION_A = "10000000-0000-4000-8000-000000000004";
const LOCATION_B = "10000000-0000-4000-8000-000000000005";

function requestWithScopes(scopes: CurrentAuth["scopes"]): Request {
  const current: CurrentAuth = {
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "buyer@example.test",
      fullName: "Buyer",
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
    roles: ["buyer"],
    permissions: [PERMISSIONS.PURCHASES_RECEIVE],
    scopes,
    session: { expiresAt: "2026-07-17T12:00:00.000Z" },
  };
  return {
    auth: { sessionId: "session-id", current },
    ip: "127.0.0.1",
    requestId: "request-purchasing-controller-test",
    get: () => undefined,
  } as unknown as Request;
}

function permissionsFor(
  controller: object,
  method: string,
): readonly string[] | undefined {
  const candidate = (controller as Record<string, unknown>)[method];
  return Reflect.getMetadata(REQUIRED_PERMISSIONS, candidate as object) as
    readonly string[] | undefined;
}

describe("purchasing controller permission boundaries", () => {
  it("preserves branch-wide location access in the service context", () => {
    const context = purchasingActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: null },
      ]),
    );

    expect(context.allowedLocationIds).toBeNull();
  });

  it("passes only the active branch's unique location scopes", () => {
    const context = purchasingActorContext(
      requestWithScopes([
        { branchId: BRANCH_ID, locationId: LOCATION_B },
        { branchId: BRANCH_ID, locationId: LOCATION_A },
        { branchId: BRANCH_ID, locationId: LOCATION_B },
        {
          branchId: "10000000-0000-4000-8000-000000000099",
          locationId: null,
        },
      ]),
    );

    expect(context.allowedLocationIds).toEqual([LOCATION_A, LOCATION_B]);
  });

  it("publishes the canonical supplier, purchase and receipt route roots", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SuppliersController)).toBe(
      "suppliers",
    );
    expect(Reflect.getMetadata(PATH_METADATA, PurchaseOrdersController)).toBe(
      "purchases",
    );
    expect(Reflect.getMetadata(PATH_METADATA, GoodsReceiptsController)).toBe(
      "goods-receipts",
    );
  });

  it.each([
    [SuppliersController.prototype, "list", PERMISSIONS.SUPPLIERS_VIEW],
    [SuppliersController.prototype, "detail", PERMISSIONS.SUPPLIERS_VIEW],
    [SuppliersController.prototype, "create", PERMISSIONS.SUPPLIERS_MANAGE],
    [SuppliersController.prototype, "update", PERMISSIONS.SUPPLIERS_MANAGE],
    [SuppliersController.prototype, "deactivate", PERMISSIONS.SUPPLIERS_MANAGE],
    [SuppliersController.prototype, "activate", PERMISSIONS.SUPPLIERS_MANAGE],
    [PurchaseOrdersController.prototype, "list", PERMISSIONS.PURCHASES_VIEW],
    [PurchaseOrdersController.prototype, "detail", PERMISSIONS.PURCHASES_VIEW],
    [
      PurchaseOrdersController.prototype,
      "create",
      PERMISSIONS.PURCHASES_CREATE,
    ],
    [
      PurchaseOrdersController.prototype,
      "update",
      PERMISSIONS.PURCHASES_CREATE,
    ],
    [
      PurchaseOrdersController.prototype,
      "approve",
      PERMISSIONS.PURCHASES_APPROVE,
    ],
    [PurchaseOrdersController.prototype, "order", PERMISSIONS.PURCHASES_CREATE],
    [
      PurchaseOrdersController.prototype,
      "cancel",
      PERMISSIONS.PURCHASES_APPROVE,
    ],
    [
      PurchaseOrdersController.prototype,
      "close",
      PERMISSIONS.PURCHASES_APPROVE,
    ],
    [GoodsReceiptsController.prototype, "list", PERMISSIONS.PURCHASES_VIEW],
    [GoodsReceiptsController.prototype, "detail", PERMISSIONS.PURCHASES_VIEW],
    [
      GoodsReceiptsController.prototype,
      "create",
      PERMISSIONS.PURCHASES_RECEIVE,
    ],
  ])("protects %s.%s with %s", (controller, method, permission) => {
    expect(permissionsFor(controller, method)).toEqual([permission]);
  });
});
