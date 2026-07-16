import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  BulkImeiValidationInputSchema,
  InventoryMovementListQuerySchema,
  PERMISSIONS,
  SerializedUnitListQuerySchema,
  TransferSerializedUnitInputSchema,
  TransitionSerializedUnitInputSchema,
  type BulkImeiValidationData,
  type BulkImeiValidationResult,
  type InventoryMovementListQuery,
  type InventoryMovementPage,
  type SerializedUnitDetail,
  type SerializedUnitListQuery,
  type SerializedUnitSummaryPage,
  type TransferSerializedUnitData,
  type TransitionSerializedUnitData,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { InventoryService } from "./inventory.service";
import { inventoryActorContext } from "./inventory.controller";

/** A malformed id is a bad request, so it fails here and never reaches Prisma. */
const uuidParam = new ZodValidationPipe(z.uuid());

@ApiTags("Serialized units")
@Controller("serialized-units")
export class SerializedUnitsController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({
    summary: "List serialized units, searchable by IMEI or serial",
  })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(SerializedUnitListQuerySchema))
    query: SerializedUnitListQuery,
  ): Promise<SerializedUnitSummaryPage> {
    return this.inventory.listSerializedUnits(
      inventoryActorContext(request),
      query,
    );
  }

  /**
   * Read-only despite being a POST: the request carries a pasted spreadsheet
   * column that does not belong in a URL. It writes nothing, so inventory.view
   * is the right grant — previewing what will fail must never require the
   * permission to change stock.
   */
  @Post("validate-bulk")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: "Validate pasted IMEIs before they are saved" })
  validateBulk(
    @Body(zodBody(BulkImeiValidationInputSchema)) input: BulkImeiValidationData,
  ): BulkImeiValidationResult {
    return this.inventory.validateBulkImei(input);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: "Read one serialized unit with its identifiers" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<SerializedUnitDetail> {
    return this.inventory.getSerializedUnit(inventoryActorContext(request), id);
  }

  @Get(":id/movements")
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({ summary: "Read one serialized unit's movement history" })
  movements(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Query(new ZodValidationPipe(InventoryMovementListQuerySchema))
    query: InventoryMovementListQuery,
  ): Promise<InventoryMovementPage> {
    return this.inventory.listSerializedUnitMovements(
      inventoryActorContext(request),
      id,
      query,
    );
  }

  /**
   * The lifecycle move for one handset: it is how a serialized unit is
   * reserved, released, quarantined, written off or sent for repair. Correcting
   * where a unit stands in its lifecycle is a stock correction, so it takes the
   * same grant as an adjustment.
   */
  @Post(":id/transition")
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @ApiOperation({ summary: "Move one serialized unit to another state" })
  transition(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(TransitionSerializedUnitInputSchema))
    input: TransitionSerializedUnitData,
  ): Promise<SerializedUnitDetail> {
    return this.inventory.transitionSerializedUnit(
      inventoryActorContext(request),
      id,
      input,
    );
  }

  @Post(":id/transfer")
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @ApiOperation({ summary: "Move one serialized unit to another location" })
  transfer(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(TransferSerializedUnitInputSchema))
    input: TransferSerializedUnitData,
  ): Promise<SerializedUnitDetail> {
    return this.inventory.transferSerializedUnit(
      inventoryActorContext(request),
      id,
      input,
    );
  }
}
