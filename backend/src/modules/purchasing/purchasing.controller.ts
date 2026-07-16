import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CancelPurchaseOrderInputSchema,
  CreateGoodsReceiptInputSchema,
  CreatePurchaseOrderInputSchema,
  CreateSupplierInputSchema,
  DomainError,
  ERROR_CODES,
  GoodsReceiptListQuerySchema,
  PERMISSIONS,
  PurchaseOrderListQuerySchema,
  PurchaseOrderTransitionInputSchema,
  PurchasingVersionInputSchema,
  SupplierListQuerySchema,
  UpdatePurchaseOrderInputSchema,
  UpdateSupplierInputSchema,
  type CancelPurchaseOrderData,
  type CreateGoodsReceiptData,
  type CreatePurchaseOrderData,
  type CreateSupplierData,
  type GoodsReceiptDetail,
  type GoodsReceiptListQuery,
  type GoodsReceiptPage,
  type PurchaseOrderDetail,
  type PurchaseOrderListQuery,
  type PurchaseOrderPage,
  type PurchaseOrderTransitionData,
  type PurchasingVersionData,
  type SupplierDetail,
  type SupplierListQuery,
  type SupplierPage,
  type UpdatePurchaseOrderData,
  type UpdateSupplierData,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import {
  PurchasingService,
  type PurchasingActorContext,
} from "./purchasing.service";

const uuidParam = new ZodValidationPipe(z.uuid());

export function purchasingActorContext(
  request: Request,
): PurchasingActorContext {
  const current = request.auth?.current;
  if (current === undefined) {
    throw new DomainError(
      ERROR_CODES.AUTH_REQUIRED,
      "Authentication is required",
    );
  }
  return {
    organizationId: current.organization.id,
    branchId: current.branch.id,
    actorUserId: current.user.id,
    allowedLocationIds: current.scopes.some(
      (scope) =>
        scope.branchId === current.branch.id && scope.locationId === null,
    )
      ? null
      : [
          ...new Set(
            current.scopes.flatMap((scope) =>
              scope.branchId === current.branch.id && scope.locationId !== null
                ? [scope.locationId]
                : [],
            ),
          ),
        ].sort(),
    metadata: authRequestMetadata(request),
  };
}

@ApiTags("Purchasing")
@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_VIEW)
  @ApiOperation({ summary: "List tenant-scoped suppliers" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(SupplierListQuerySchema))
    query: SupplierListQuery,
  ): Promise<SupplierPage> {
    return this.purchasing.listSuppliers(
      purchasingActorContext(request).organizationId,
      query,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @ApiOperation({ summary: "Create a supplier" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateSupplierInputSchema)) input: CreateSupplierData,
  ): Promise<SupplierDetail> {
    return this.purchasing.createSupplier(
      purchasingActorContext(request),
      input,
    );
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.SUPPLIERS_VIEW)
  @ApiOperation({ summary: "Read a supplier" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<SupplierDetail> {
    return this.purchasing.getSupplier(
      purchasingActorContext(request).organizationId,
      id,
    );
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @ApiOperation({ summary: "Update a supplier with optimistic concurrency" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateSupplierInputSchema)) input: UpdateSupplierData,
  ): Promise<SupplierDetail> {
    return this.purchasing.updateSupplier(
      purchasingActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/deactivate")
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @ApiOperation({ summary: "Deactivate a supplier" })
  deactivate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(PurchasingVersionInputSchema)) input: PurchasingVersionData,
  ): Promise<SupplierDetail> {
    return this.purchasing.deactivateSupplier(
      purchasingActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/activate")
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @ApiOperation({ summary: "Reactivate a supplier" })
  activate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(PurchasingVersionInputSchema)) input: PurchasingVersionData,
  ): Promise<SupplierDetail> {
    return this.purchasing.activateSupplier(
      purchasingActorContext(request),
      id,
      input,
    );
  }
}

@ApiTags("Purchasing")
@Controller("purchases")
export class PurchaseOrdersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiOperation({ summary: "List purchase orders in the current branch" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(PurchaseOrderListQuerySchema))
    query: PurchaseOrderListQuery,
  ): Promise<PurchaseOrderPage> {
    return this.purchasing.listPurchaseOrders(
      purchasingActorContext(request),
      query,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASES_CREATE)
  @ApiOperation({ summary: "Create a draft purchase order without stock" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreatePurchaseOrderInputSchema))
    input: CreatePurchaseOrderData,
  ): Promise<PurchaseOrderDetail> {
    return this.purchasing.createPurchaseOrder(
      purchasingActorContext(request),
      input,
    );
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiOperation({ summary: "Read a purchase order" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<PurchaseOrderDetail> {
    return this.purchasing.getPurchaseOrder(
      purchasingActorContext(request),
      id,
    );
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PURCHASES_CREATE)
  @ApiOperation({ summary: "Replace the commercial terms of a draft order" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdatePurchaseOrderInputSchema))
    input: UpdatePurchaseOrderData,
  ): Promise<PurchaseOrderDetail> {
    return this.purchasing.updatePurchaseOrder(
      purchasingActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/approve")
  @RequirePermissions(PERMISSIONS.PURCHASES_APPROVE)
  @ApiOperation({ summary: "Approve a draft purchase order" })
  approve(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(PurchaseOrderTransitionInputSchema))
    input: PurchaseOrderTransitionData,
  ): Promise<PurchaseOrderDetail> {
    return this.purchasing.approvePurchaseOrder(
      purchasingActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/order")
  @RequirePermissions(PERMISSIONS.PURCHASES_CREATE)
  @ApiOperation({ summary: "Mark an approved purchase order as ordered" })
  order(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(PurchaseOrderTransitionInputSchema))
    input: PurchaseOrderTransitionData,
  ): Promise<PurchaseOrderDetail> {
    return this.purchasing.orderPurchaseOrder(
      purchasingActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/cancel")
  @RequirePermissions(PERMISSIONS.PURCHASES_APPROVE)
  @ApiOperation({ summary: "Cancel an eligible purchase order" })
  cancel(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CancelPurchaseOrderInputSchema))
    input: CancelPurchaseOrderData,
  ): Promise<PurchaseOrderDetail> {
    return this.purchasing.cancelPurchaseOrder(
      purchasingActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/close")
  @RequirePermissions(PERMISSIONS.PURCHASES_APPROVE)
  @ApiOperation({ summary: "Close a received or partially received order" })
  close(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(PurchaseOrderTransitionInputSchema))
    input: PurchaseOrderTransitionData,
  ): Promise<PurchaseOrderDetail> {
    return this.purchasing.closePurchaseOrder(
      purchasingActorContext(request),
      id,
      input,
    );
  }
}

@ApiTags("Purchasing")
@Controller("goods-receipts")
export class GoodsReceiptsController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiOperation({ summary: "List immutable goods receipts in the branch" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(GoodsReceiptListQuerySchema))
    query: GoodsReceiptListQuery,
  ): Promise<GoodsReceiptPage> {
    return this.purchasing.listGoodsReceipts(
      purchasingActorContext(request),
      query,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASES_RECEIVE)
  @ApiOperation({ summary: "Receive purchase stock atomically" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateGoodsReceiptInputSchema))
    input: CreateGoodsReceiptData,
  ): Promise<GoodsReceiptDetail> {
    return this.purchasing.createGoodsReceipt(
      purchasingActorContext(request),
      input,
    );
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiOperation({ summary: "Read immutable receiving evidence" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<GoodsReceiptDetail> {
    return this.purchasing.getGoodsReceipt(purchasingActorContext(request), id);
  }
}
