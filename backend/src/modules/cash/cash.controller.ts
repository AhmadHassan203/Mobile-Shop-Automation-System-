import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CashSessionListQuerySchema,
  CloseCashSessionInputSchema,
  DomainError,
  ERROR_CODES,
  OpenCashSessionInputSchema,
  PERMISSIONS,
  type CashSession,
  type CashSessionListQuery,
  type CashSessionPage,
  type CloseCashSessionData,
  type OpenCashSessionData,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { CashService, type CashActorContext } from "./cash.service";

const uuidParam = new ZodValidationPipe(z.uuid());

export function cashActorContext(request: Request): CashActorContext {
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

@ApiTags("Cash sessions")
@Controller("cash-sessions")
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.CASH_SESSION_MANAGE)
  @ApiOperation({ summary: "Open a cash session with a counted opening float" })
  open(
    @Req() request: Request,
    @Body(zodBody(OpenCashSessionInputSchema)) input: OpenCashSessionData,
  ): Promise<CashSession> {
    return this.cash.open(cashActorContext(request), input);
  }

  // Declared before any ":id" route so the literal segment is matched first.
  @Get("current")
  @RequirePermissions(PERMISSIONS.CASH_SESSION_VIEW)
  @ApiOperation({
    summary: "Read the branch's currently open cash session, if any",
  })
  current(@Req() request: Request): Promise<CashSession | null> {
    return this.cash.current(cashActorContext(request));
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CASH_SESSION_VIEW)
  @ApiOperation({ summary: "List cash sessions for the current branch" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(CashSessionListQuerySchema))
    query: CashSessionListQuery,
  ): Promise<CashSessionPage> {
    return this.cash.list(cashActorContext(request), query);
  }

  @Post(":id/close")
  @RequirePermissions(PERMISSIONS.CASH_SESSION_MANAGE)
  @ApiOperation({
    summary: "Close a cash session and reconcile counted against expected cash",
  })
  close(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CloseCashSessionInputSchema)) input: CloseCashSessionData,
  ): Promise<CashSession> {
    return this.cash.close(cashActorContext(request), id, input);
  }
}
