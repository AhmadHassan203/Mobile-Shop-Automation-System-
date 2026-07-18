import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  BulkStockInInputSchema,
  DomainError,
  ERROR_CODES,
  IDEMPOTENCY_KEY_HEADER,
  PERMISSIONS,
  type BulkStockInData,
  type BulkStockInResult,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { quickStockInActorContext } from "../quick-stock-in/quick-stock-in.controller";
import { BulkStockInService } from "./bulk-stock-in.service";

/** The batch idempotency key is a UUID header, exactly like Quick Stock In. */
function requiredIdempotencyKey(value: string | undefined): string {
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  const message = `A UUID ${IDEMPOTENCY_KEY_HEADER} header is required.`;
  throw new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { idempotencyKey: [message] },
  });
}

/**
 * Bulk Stock In — one endpoint that receives many Quick Stock In rows in a
 * single submission. Baseline permissions match Quick Stock In exactly; the
 * CONDITIONAL grants (creating a new product/supplier per row) are enforced
 * inside Quick Stock In against the caller's permission set. The response is a
 * per-row report because the batch commits row by row (partial success).
 */
@ApiTags("Inventory")
@Controller("inventory")
export class BulkStockInController {
  constructor(private readonly bulkStockIn: BulkStockInService) {}

  @Post("bulk-stock-in")
  @RequirePermissions(
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_RECEIVE,
    PERMISSIONS.PRICING_MANAGE,
  )
  @ApiOperation({
    summary:
      "Receive many Quick Stock In rows in one submission: each row is a full atomic stock-in, with batch-level partial success and a per-row report.",
  })
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  create(
    @Req() request: Request,
    @Body(zodBody(BulkStockInInputSchema)) input: BulkStockInData,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
  ): Promise<BulkStockInResult> {
    return this.bulkStockIn.bulkStockIn(
      quickStockInActorContext(request),
      input,
      requiredIdempotencyKey(idempotencyKey),
    );
  }
}
