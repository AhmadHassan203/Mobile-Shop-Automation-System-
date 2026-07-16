import { PERMISSIONS } from "@mobileshop/shared";
import { PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import {
  GoodsReceiptsController,
  PurchaseOrdersController,
  SuppliersController,
} from "./purchasing.controller";

function permissionsFor(
  controller: object,
  method: string,
): readonly string[] | undefined {
  const candidate = (controller as Record<string, unknown>)[method];
  return Reflect.getMetadata(REQUIRED_PERMISSIONS, candidate as object) as
    readonly string[] | undefined;
}

describe("purchasing controller permission boundaries", () => {
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
