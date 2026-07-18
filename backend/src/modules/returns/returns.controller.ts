import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateReturnDraftInputSchema,
  DomainError,
  ERROR_CODES,
  ExchangeReturnInputSchema,
  IDEMPOTENCY_KEY_HEADER,
  PERMISSIONS,
  PostReturnInputSchema,
  ReturnEligibilityQuerySchema,
  ReturnListQuerySchema,
  type CreateReturnDraftData,
  type ExchangeReturnData,
  type PostReturnData,
  type PostReturnResponse,
  type ReturnDetail,
  type ReturnEligibility,
  type ReturnEligibilityQuery,
  type ReturnListQuery,
  type ReturnPage,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { ReturnsService, type ReturnsActorContext } from "./returns.service";

const uuidParam = new ZodValidationPipe(z.uuid());

function requiredIdempotencyKey(value: string | undefined): string {
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  const message = `A UUID ${IDEMPOTENCY_KEY_HEADER} header is required.`;
  throw new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { idempotencyKey: [message] },
  });
}

export function returnsActorContext(request: Request): ReturnsActorContext {
  const current = request.auth?.current;
  if (current === undefined) {
    throw new DomainError(
      ERROR_CODES.AUTH_REQUIRED,
      "Authentication is required",
    );
  }
  const branchWide = current.scopes.some(
    (scope) =>
      scope.branchId === current.branch.id && scope.locationId === null,
  );
  return {
    organizationId: current.organization.id,
    organizationName: current.organization.name,
    branchId: current.branch.id,
    branchName: current.branch.name,
    actorUserId: current.user.id,
    actorFullName: current.user.fullName,
    currency: current.organization.currency,
    allowedLocationIds: branchWide
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
    permissions: current.permissions,
    canViewProfit: current.permissions.includes(PERMISSIONS.SALES_VIEW_PROFIT),
    canViewSensitive: current.permissions.includes(
      PERMISSIONS.CUSTOMERS_VIEW_SENSITIVE,
    ),
    metadata: authRequestMetadata(request),
  };
}

@ApiTags("Returns")
@Controller("returns")
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RETURNS_VIEW)
  @ApiOperation({
    summary: "List returns in the current branch and location scope",
  })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ReturnListQuerySchema)) query: ReturnListQuery,
  ): Promise<ReturnPage> {
    return this.returns.list(returnsActorContext(request), query);
  }

  // Declared before :id so Nest's ordered matcher never lets ":id" swallow it.
  @Get("eligibility")
  @RequirePermissions(PERMISSIONS.RETURNS_CREATE)
  @ApiOperation({
    summary: "Resolve return eligibility, policy, and refundable amounts",
  })
  eligibility(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ReturnEligibilityQuerySchema))
    query: ReturnEligibilityQuery,
  ): Promise<ReturnEligibility> {
    return this.returns.eligibility(returnsActorContext(request), query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RETURNS_CREATE)
  @ApiOperation({
    summary: "Create a return draft without touching stock, numbers, or ledger",
  })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateReturnDraftInputSchema)) input: CreateReturnDraftData,
  ): Promise<ReturnDetail> {
    return this.returns.createDraft(returnsActorContext(request), input);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.RETURNS_VIEW)
  @ApiOperation({
    summary: "Read one scoped return with profit and contact redaction",
  })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<ReturnDetail> {
    return this.returns.detail(returnsActorContext(request), id);
  }

  @Post(":id/post")
  @RequirePermissions(PERMISSIONS.RETURNS_APPROVE, PERMISSIONS.PAYMENTS_COLLECT)
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiOperation({
    summary:
      "Atomically restock, settle, reverse the ledger, and freeze the return",
  })
  post(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body(zodBody(PostReturnInputSchema)) input: PostReturnData,
  ): Promise<PostReturnResponse> {
    return this.returns.post(
      returnsActorContext(request),
      id,
      requiredIdempotencyKey(idempotencyKey),
      input,
    );
  }

  @Post(":id/exchange")
  @RequirePermissions(PERMISSIONS.RETURNS_APPROVE, PERMISSIONS.PAYMENTS_COLLECT)
  @ApiOperation({
    summary: "Exchange a return (atomic sales-posting boundary unavailable)",
  })
  exchange(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(ExchangeReturnInputSchema)) input: ExchangeReturnData,
  ): Promise<never> {
    return this.returns.exchange(returnsActorContext(request), id, input);
  }
}
