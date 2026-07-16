import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  DailyFinancialSummaryQuerySchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  type DailyFinancialSummary,
  type DailyFinancialSummaryQuery,
  type DashboardSnapshot,
  type PermissionKey,
} from "@mobileshop/shared";
import type { Request } from "express";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { DashboardService, type DashboardActorContext } from "./dashboard.service";

export function dashboardActorContext(request: Request): DashboardActorContext {
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
    permissions: new Set(current.permissions as PermissionKey[]),
    allowedLocationIds,
  };
}

@ApiTags("Dashboard")
@Controller("reports/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * Dashboard is the landing page for every authenticated role. The service
   * independently redacts every source section and sensitive value.
   */
  @Get()
  @ApiOperation({
    summary: "Read the current branch's permission-aware dashboard snapshot",
  })
  snapshot(@Req() request: Request): Promise<DashboardSnapshot> {
    return this.dashboard.snapshot(dashboardActorContext(request));
  }

  /**
   * Reconciled daily/weekly/monthly financial roll-up. Gated on the financial
   * reporting grant — it exposes revenue, cost, service profit and expenses.
   */
  @Get("summary")
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW_FINANCIAL)
  @ApiOperation({
    summary: "Read the reconciled financial summary for a day, week or month",
  })
  summary(
    @Req() request: Request,
    @Query(new ZodValidationPipe(DailyFinancialSummaryQuerySchema))
    query: DailyFinancialSummaryQuery,
  ): Promise<DailyFinancialSummary> {
    return this.dashboard.summary(dashboardActorContext(request), query);
  }
}
