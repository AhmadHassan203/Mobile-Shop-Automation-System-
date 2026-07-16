import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CancelSaleInputSchema,
  CreateSaleDraftInputSchema,
  DomainError,
  ERROR_CODES,
  HoldSaleInputSchema,
  IDEMPOTENCY_KEY_HEADER,
  PERMISSIONS,
  PostSaleInputSchema,
  ReplaceSaleDraftInputSchema,
  SaleListQuerySchema,
  SaleReceiptQuerySchema,
  SaleReviewInputSchema,
  type CancelSaleData,
  type CreateSaleDraftData,
  type HoldSaleData,
  type PostSaleData,
  type PostSaleResponse,
  type ReplaceSaleDraftData,
  type SaleDetail,
  type SaleListQuery,
  type SalePage,
  type SaleReceipt,
  type SaleReceiptQuery,
  type SaleReview,
  type SaleReviewData,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { SalesService, type SalesActorContext } from "./sales.service";

const uuidParam = new ZodValidationPipe(z.uuid());

function requiredIdempotencyKey(value: string | undefined): string {
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  const message = `A UUID ${IDEMPOTENCY_KEY_HEADER} header is required.`;
  throw new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { idempotencyKey: [message] },
  });
}

export function salesActorContext(request: Request): SalesActorContext {
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
    metadata: authRequestMetadata(request),
  };
}

@ApiTags("Sales")
@Controller("sales")
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  @ApiOperation({ summary: "List sales in the current branch and location scope" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(SaleListQuerySchema)) query: SaleListQuery,
  ): Promise<SalePage> {
    return this.sales.list(salesActorContext(request), query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @ApiOperation({ summary: "Create a mutable draft without consuming stock or numbers" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateSaleDraftInputSchema)) input: CreateSaleDraftData,
  ): Promise<SaleDetail> {
    return this.sales.createDraft(salesActorContext(request), input);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  @ApiOperation({ summary: "Read one scoped sale with profit redaction" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<SaleDetail> {
    return this.sales.detail(salesActorContext(request), id);
  }

  @Put(":id")
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @ApiOperation({ summary: "Replace a draft cart using optimistic concurrency" })
  replace(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(ReplaceSaleDraftInputSchema)) input: ReplaceSaleDraftData,
  ): Promise<SaleDetail> {
    return this.sales.replaceDraft(salesActorContext(request), id, input);
  }

  @Post(":id/review")
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @ApiOperation({ summary: "Recompute authoritative price, stock, cost and warnings" })
  review(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(SaleReviewInputSchema)) input: SaleReviewData,
  ): Promise<SaleReview> {
    return this.sales.review(salesActorContext(request), id, input);
  }

  @Post(":id/hold")
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @ApiOperation({ summary: "Hold a draft without reserving stock" })
  hold(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(HoldSaleInputSchema)) input: HoldSaleData,
  ): Promise<SaleDetail> {
    return this.sales.hold(salesActorContext(request), id, input);
  }

  @Post(":id/cancel")
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @ApiOperation({ summary: "Cancel an unposted draft with reason evidence" })
  cancel(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CancelSaleInputSchema)) input: CancelSaleData,
  ): Promise<SaleDetail> {
    return this.sales.cancel(salesActorContext(request), id, input);
  }

  @Post(":id/post")
  @RequirePermissions(PERMISSIONS.SALES_POST, PERMISSIONS.PAYMENTS_COLLECT)
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiOperation({ summary: "Atomically post stock, settlement, ledger and receipt" })
  post(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body(zodBody(PostSaleInputSchema)) input: PostSaleData,
  ): Promise<PostSaleResponse> {
    return this.sales.post(
      salesActorContext(request),
      id,
      requiredIdempotencyKey(idempotencyKey),
      input,
    );
  }

  @Get(":id/receipt")
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  @ApiOperation({ summary: "Reissue the immutable posted-sale receipt" })
  receipt(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Query(new ZodValidationPipe(SaleReceiptQuerySchema)) query: SaleReceiptQuery,
  ): Promise<SaleReceipt> {
    return this.sales.receipt(salesActorContext(request), id, query);
  }
}
