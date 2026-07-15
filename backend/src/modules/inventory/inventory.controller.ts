import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AdjustStockInputSchema,
  CreateStockLocationInputSchema,
  DomainError,
  ERROR_CODES,
  InventoryMovementListQuerySchema,
  InventoryVersionInputSchema,
  PERMISSIONS,
  ReleaseStockInputSchema,
  ReserveStockInputSchema,
  StockBalanceListQuerySchema,
  StockLocationListQuerySchema,
  TransferStockInputSchema,
  UpdateStockLocationInputSchema,
  type AdjustStockData,
  type CreateStockLocationData,
  type InventoryMovementListQuery,
  type InventoryMovementPage,
  type InventoryVersionData,
  type ReleaseStockData,
  type ReserveStockData,
  type StockBalance,
  type StockBalanceListQuery,
  type StockBalancePage,
  type StockLocationListQuery,
  type StockLocationPage,
  type StockLocationReference,
  type TransferStockData,
  type UpdateStockLocationData,
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
  InventoryService,
  type InventoryActorContext,
} from "./inventory.service";

/** A malformed id is a bad request, so it fails here and never reaches Prisma. */
const uuidParam = new ZodValidationPipe(z.uuid());

export function inventoryActorContext(request: Request): InventoryActorContext {
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
    metadata: authRequestMetadata(request),
  };
}

/**
 * Stock locations are branch configuration, not stock. Reading them is part of
 * seeing inventory; changing the shape of a branch is a settings action, so it
 * takes settings.manage — the only manage-style grant that exists and the one
 * an owner/manager already holds for configuring the shop.
 */
@ApiTags("Inventory")
@Controller("locations")
export class LocationsController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: "List tenant-scoped stock locations" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(StockLocationListQuerySchema))
    query: StockLocationListQuery,
  ): Promise<StockLocationPage> {
    return this.inventory.listStockLocations(
      inventoryActorContext(request).organizationId,
      query,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Create a stock location in the current branch" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateStockLocationInputSchema))
    input: CreateStockLocationData,
  ): Promise<StockLocationReference> {
    return this.inventory.createStockLocation(
      inventoryActorContext(request),
      input,
    );
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Update a stock location" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateStockLocationInputSchema))
    input: UpdateStockLocationData,
  ): Promise<StockLocationReference> {
    return this.inventory.updateStockLocation(
      inventoryActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/deactivate")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Deactivate a stock location" })
  deactivate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(InventoryVersionInputSchema)) input: InventoryVersionData,
  ): Promise<StockLocationReference> {
    return this.inventory.deactivateStockLocation(
      inventoryActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/activate")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Reactivate a stock location" })
  activate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(InventoryVersionInputSchema)) input: InventoryVersionData,
  ): Promise<StockLocationReference> {
    return this.inventory.activateStockLocation(
      inventoryActorContext(request),
      id,
      input,
    );
  }
}

@ApiTags("Inventory")
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({
    summary: "Read derived stock balances per product variant and location",
  })
  balances(
    @Req() request: Request,
    @Query(new ZodValidationPipe(StockBalanceListQuerySchema))
    query: StockBalanceListQuery,
  ): Promise<StockBalancePage> {
    return this.inventory.listStockBalances(
      inventoryActorContext(request).organizationId,
      query,
    );
  }

  @Get("movements")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: "Read the append-only inventory movement ledger" })
  movements(
    @Req() request: Request,
    @Query(new ZodValidationPipe(InventoryMovementListQuerySchema))
    query: InventoryMovementListQuery,
  ): Promise<InventoryMovementPage> {
    return this.inventory.listMovements(
      inventoryActorContext(request).organizationId,
      query,
    );
  }

  @Post("adjustments")
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @ApiOperation({ summary: "Correct a stock quantity through one movement" })
  adjust(
    @Req() request: Request,
    @Body(zodBody(AdjustStockInputSchema)) input: AdjustStockData,
  ): Promise<StockBalance> {
    return this.inventory.adjustStock(inventoryActorContext(request), input);
  }

  @Post("reservations")
  @RequirePermissions(PERMISSIONS.INVENTORY_RESERVE)
  @ApiOperation({ summary: "Reserve quantity-tracked stock at a location" })
  reserve(
    @Req() request: Request,
    @Body(zodBody(ReserveStockInputSchema)) input: ReserveStockData,
  ): Promise<StockBalance> {
    return this.inventory.reserveStock(inventoryActorContext(request), input);
  }

  // A reservation is not a stored row, so the path names the product it is held
  // against — the only id the balance a caller reads actually carries.
  @Delete("reservations/:id")
  @RequirePermissions(PERMISSIONS.INVENTORY_RESERVE)
  @ApiOperation({ summary: "Release a quantity-tracked stock reservation" })
  release(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(ReleaseStockInputSchema)) input: ReleaseStockData,
  ): Promise<StockBalance> {
    return this.inventory.releaseStock(
      inventoryActorContext(request),
      id,
      input,
    );
  }

  @Post("transfers")
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @ApiOperation({
    summary: "Move quantity-tracked stock between two locations atomically",
  })
  transfer(
    @Req() request: Request,
    @Body(zodBody(TransferStockInputSchema)) input: TransferStockData,
  ): Promise<StockBalancePage> {
    return this.inventory.transferStock(inventoryActorContext(request), input);
  }
}
