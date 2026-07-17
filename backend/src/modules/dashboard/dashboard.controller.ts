import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  DailyFinancialSummaryQuerySchema,
  DomainError,
  ERROR_CODES,
  FINANCIAL_SUMMARY_PERIODS,
  PERMISSIONS,
  type DailyFinancialSummary,
  type DailyFinancialSummaryQuery,
  type DashboardSnapshot,
  type PermissionKey,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  DashboardService,
  type DashboardActorContext,
  type ReorderReport,
  type SalesTrendReport,
  type TopProductsReport,
} from "./dashboard.service";

/** Read-only query contracts for the reporting aggregations. Backend-local: the
 * responses are internal read models, not part of the shared public contract. */
const SalesTrendQuerySchema = z
  .object({ days: z.coerce.number().int().min(1).max(31).default(7) })
  .strict();
type SalesTrendQuery = z.output<typeof SalesTrendQuerySchema>;

const TopProductsQuerySchema = z
  .object({
    period: z.enum(FINANCIAL_SUMMARY_PERIODS).default("month"),
    limit: z.coerce.number().int().min(1).max(20).default(5),
  })
  .strict();
type TopProductsQuery = z.output<typeof TopProductsQuerySchema>;

const ReorderSuggestionsQuerySchema = z
  .object({
    windowDays: z.coerce.number().int().min(7).max(90).default(30),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
type ReorderSuggestionsQuery = z.output<typeof ReorderSuggestionsQuerySchema>;

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

  /**
   * Posted-sales revenue and gross-profit series for the last N business days.
   * Same financial-reporting grant and tenant/branch scope as the summary.
   */
  @Get("sales-trend")
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW_FINANCIAL)
  @ApiOperation({
    summary: "Read the posted-sales revenue and profit series by business day",
  })
  salesTrend(
    @Req() request: Request,
    @Query(new ZodValidationPipe(SalesTrendQuerySchema)) query: SalesTrendQuery,
  ): Promise<SalesTrendReport> {
    return this.dashboard.salesTrend(dashboardActorContext(request), query.days);
  }

  /** Products ranked by posted revenue for a day, week or month. */
  @Get("top-products")
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW_FINANCIAL)
  @ApiOperation({
    summary: "Read the products ranked by posted revenue for a period",
  })
  topProducts(
    @Req() request: Request,
    @Query(new ZodValidationPipe(TopProductsQuerySchema))
    query: TopProductsQuery,
  ): Promise<TopProductsReport> {
    return this.dashboard.topProducts(
      dashboardActorContext(request),
      query.period,
      query.limit,
    );
  }

  /**
   * Deterministic reorder suggestions derived from stock, sales velocity and
   * open demand. Gated on the recommendations grant, mirroring the buying page.
   */
  @Get("reorder-suggestions")
  @RequirePermissions(PERMISSIONS.RECOMMENDATIONS_VIEW)
  @ApiOperation({
    summary: "Read deterministic reorder suggestions with cost and profit basis",
  })
  reorderSuggestions(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ReorderSuggestionsQuerySchema))
    query: ReorderSuggestionsQuery,
  ): Promise<ReorderReport> {
    return this.dashboard.reorderSuggestions(
      dashboardActorContext(request),
      query.windowDays,
      query.limit,
    );
  }
}
