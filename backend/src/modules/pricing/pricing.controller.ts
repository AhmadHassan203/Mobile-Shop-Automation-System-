import { Body, Controller, Get, Param, Put, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  PosSellableLookupQuerySchema,
  SetVariantDefaultPriceInputSchema,
  type PosSellableLookupQuery,
  type PosSellablePage,
  type SetVariantDefaultPriceInput,
  type VariantDefaultPriceResponse,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { PricingService, type PricingActorContext } from "./pricing.service";

const uuidParam = new ZodValidationPipe(z.uuid());

export function pricingActorContext(request: Request): PricingActorContext {
  const current = request.auth?.current;
  if (current === undefined) {
    throw new DomainError(
      ERROR_CODES.AUTH_REQUIRED,
      "Authentication is required",
    );
  }

  const allowedLocationIds = current.scopes.some(
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
      ].sort();

  return {
    organizationId: current.organization.id,
    branchId: current.branch.id,
    currency: current.organization.currency,
    actorUserId: current.user.id,
    metadata: authRequestMetadata(request),
    allowedLocationIds,
  };
}

@ApiTags("Pricing")
@Controller("pricing")
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get("pos-lookup")
  @RequirePermissions(PERMISSIONS.PRICING_VIEW)
  @ApiOperation({
    summary: "Read authoritative POS prices and branch-scoped stock choices",
  })
  lookup(
    @Req() request: Request,
    @Query(new ZodValidationPipe(PosSellableLookupQuerySchema))
    query: PosSellableLookupQuery,
  ): Promise<PosSellablePage> {
    return this.pricing.posLookup(pricingActorContext(request), query);
  }

  @Put("variants/:id/default")
  @RequirePermissions(PERMISSIONS.PRICING_MANAGE)
  @ApiOperation({ summary: "Set a product variant's default sale price" })
  setVariantDefault(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(SetVariantDefaultPriceInputSchema))
    input: SetVariantDefaultPriceInput,
  ): Promise<VariantDefaultPriceResponse> {
    return this.pricing.setVariantDefaultPrice(
      pricingActorContext(request),
      id,
      input,
    );
  }
}
