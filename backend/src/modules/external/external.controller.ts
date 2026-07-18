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
  CreateExternalTransactionInputSchema,
  DomainError,
  ERROR_CODES,
  ExternalTransactionListQuerySchema,
  IDEMPOTENCY_KEY_HEADER,
  PERMISSIONS,
  type CreateExternalTransactionData,
  type ExternalTransaction,
  type ExternalTransactionListQuery,
  type ExternalTransactionPage,
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
  ExternalService,
  type ExternalActorContext,
  type ExternalBalancesResult,
  type ExternalCommissionResult,
} from "./external.service";

const uuidParam = new ZodValidationPipe(z.uuid());

/** Commission roll-up window; defaults to the current calendar month. */
const ExternalCommissionQuerySchema = z
  .object({ period: z.enum(["day", "week", "month"]).default("month") })
  .strict();
type ExternalCommissionQuery = z.output<typeof ExternalCommissionQuerySchema>;

/** The idempotency header is optional here; a missing key simply records once. */
function optionalIdempotencyKey(value: string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = z.uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  const message = `The ${IDEMPOTENCY_KEY_HEADER} header must be a UUID when provided.`;
  throw new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { idempotencyKey: [message] },
  });
}

export function externalActorContext(request: Request): ExternalActorContext {
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
    permissions: current.permissions,
    metadata: authRequestMetadata(request),
  };
}

@ApiTags("External transactions")
@Controller("external")
export class ExternalController {
  constructor(private readonly external: ExternalService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EXTERNAL_VIEW)
  @ApiOperation({
    summary: "List recorded external money-service transactions",
  })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ExternalTransactionListQuerySchema))
    query: ExternalTransactionListQuery,
  ): Promise<ExternalTransactionPage> {
    return this.external.list(externalActorContext(request), query);
  }

  // Static GET routes MUST be declared before the parameterized `:id` route
  // below: NestJS/Express matches in declaration order, so were `:id` first it
  // would greedily capture `/external/balances` as id="balances".
  @Get("balances")
  @RequirePermissions(PERMISSIONS.EXTERNAL_VIEW)
  @ApiOperation({
    summary:
      "Per-provider service balances derived for the current business date",
  })
  balances(@Req() request: Request): Promise<ExternalBalancesResult> {
    return this.external.balances(externalActorContext(request));
  }

  @Get("commission")
  @RequirePermissions(PERMISSIONS.EXTERNAL_VIEW)
  @ApiOperation({
    summary:
      "Commission totals for a business-date period, overall and grouped",
  })
  commission(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ExternalCommissionQuerySchema))
    query: ExternalCommissionQuery,
  ): Promise<ExternalCommissionResult> {
    return this.external.commission(
      externalActorContext(request),
      query.period,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXTERNAL_CREATE)
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: false })
  @ApiOperation({
    summary:
      "Record an external transaction with server-authoritative fee, profit and ledger",
  })
  create(
    @Req() request: Request,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body(zodBody(CreateExternalTransactionInputSchema))
    input: CreateExternalTransactionData,
  ): Promise<ExternalTransaction> {
    return this.external.record(
      externalActorContext(request),
      optionalIdempotencyKey(idempotencyKey),
      input,
    );
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.EXTERNAL_VIEW)
  @ApiOperation({ summary: "Read one recorded external transaction" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<ExternalTransaction> {
    return this.external.detail(externalActorContext(request), id);
  }
}
