import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateExpenseInputSchema,
  DomainError,
  ERROR_CODES,
  ExpenseListQuerySchema,
  PERMISSIONS,
  type CreateExpenseData,
  type Expense,
  type ExpenseListQuery,
  type ExpensePage,
} from "@mobileshop/shared";
import type { Request } from "express";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { ExpensesService, type ExpensesActorContext } from "./expenses.service";

export function expensesActorContext(request: Request): ExpensesActorContext {
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

@ApiTags("Expenses")
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EXPENSES_VIEW)
  @ApiOperation({ summary: "List operating expenses for the current branch" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ExpenseListQuerySchema))
    query: ExpenseListQuery,
  ): Promise<ExpensePage> {
    return this.expenses.list(expensesActorContext(request), query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  @ApiOperation({
    summary: "Record an operating expense and post its balanced ledger",
  })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateExpenseInputSchema)) input: CreateExpenseData,
  ): Promise<Expense> {
    return this.expenses.record(expensesActorContext(request), input);
  }
}
