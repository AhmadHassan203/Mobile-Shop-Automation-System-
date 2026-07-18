import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  DomainError,
  ERROR_CODES,
  IDEMPOTENCY_KEY_HEADER,
  PERMISSIONS,
  QuickStockInInputSchema,
  type PermissionKey,
  type QuickStockInData,
  type QuickStockInResult,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { zodBody } from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import {
  QuickStockInService,
  type QuickStockInActorContext,
} from "./quick-stock-in.service";

function requiredIdempotencyKey(value: string | undefined): string {
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  const message = `A UUID ${IDEMPOTENCY_KEY_HEADER} header is required.`;
  throw new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { idempotencyKey: [message] },
  });
}

export function quickStockInActorContext(
  request: Request,
): QuickStockInActorContext {
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
    currency: current.organization.currency,
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
    permissions: new Set(current.permissions as readonly PermissionKey[]),
    metadata: authRequestMetadata(request),
  };
}

/**
 * Quick Stock In — one endpoint that performs the whole add-stock chain
 * atomically. Baseline permissions are enforced here; the CONDITIONAL grants
 * (creating a new product/supplier, converting a never-transacted serialized
 * variant) are enforced in the service against the caller's permission set.
 */
@ApiTags("Inventory")
@Controller("inventory")
export class QuickStockInController {
  constructor(private readonly quickStockIn: QuickStockInService) {}

  @Post("quick-stock-in")
  @RequirePermissions(
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_RECEIVE,
    PERMISSIONS.PRICING_MANAGE,
  )
  @ApiOperation({
    summary:
      "Add stock in one action: reuse/create product + supplier, purchase, receive, pay and price — atomically.",
  })
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  create(
    @Req() request: Request,
    @Body(zodBody(QuickStockInInputSchema)) input: QuickStockInData,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
  ): Promise<QuickStockInResult> {
    return this.quickStockIn.quickStockIn(
      quickStockInActorContext(request),
      input,
      requiredIdempotencyKey(idempotencyKey),
    );
  }
}
