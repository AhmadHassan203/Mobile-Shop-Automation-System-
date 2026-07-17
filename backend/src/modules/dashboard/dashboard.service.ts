import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  addBusinessDays,
  DailyFinancialSummarySchema,
  DashboardSnapshotSchema,
  ON_HAND_STOCK_STATES,
  parseBusinessDate,
  PERMISSIONS,
  rollingWindow,
  toBusinessDate,
  type BusinessDate,
  type DailyFinancialSummary,
  type DailyFinancialSummaryQuery,
  type DashboardAttentionItem,
  type DashboardMoneyValue,
  type DashboardSnapshot,
  type FinancialSummaryPeriod,
  type PermissionKey,
} from "@mobileshop/shared";
import { PrismaService } from "../../database/prisma.service";

export interface DashboardActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly currency: string;
  readonly permissions: ReadonlySet<PermissionKey>;
  /** Null means the authenticated user can read every location in the branch. */
  readonly allowedLocationIds: readonly string[] | null;
}

interface InventoryAggregateRow {
  readonly onHandUnits: bigint;
  readonly reservedUnits: bigint;
  readonly availableUnits: bigint;
  readonly valuedUnits: bigint;
  readonly uncostedUnits: bigint;
  readonly inventoryValueMinor: bigint;
  readonly outOfStockVariantCount: bigint;
}

interface InventoryAggregate {
  readonly onHandUnits: number;
  readonly reservedUnits: number;
  readonly availableUnits: number;
  readonly valuedUnits: number;
  readonly uncostedUnits: number;
  readonly inventoryValueMinor: number;
  readonly outOfStockVariantCount: number;
}

/** One posted-sales roll-up for a single business day. */
export interface SalesTrendPoint {
  readonly businessDate: string;
  readonly salesRevenueMinor: number;
  readonly cogsMinor: number;
  readonly grossProfitMinor: number;
  readonly salesCount: number;
}

export interface SalesTrendReport {
  readonly from: string;
  readonly to: string;
  readonly days: number;
  readonly points: readonly SalesTrendPoint[];
}

export interface TopProductRow {
  readonly productVariantId: string;
  readonly name: string;
  readonly sku: string;
  readonly unitsSold: number;
  readonly revenueMinor: number;
  readonly cogsMinor: number;
  readonly grossProfitMinor: number;
}

export interface TopProductsReport {
  readonly period: FinancialSummaryPeriod;
  readonly from: string;
  readonly to: string;
  readonly items: readonly TopProductRow[];
}

interface TopProductRawRow {
  readonly productVariantId: string;
  readonly name: string;
  readonly sku: string;
  readonly unitsSold: bigint;
  readonly revenueMinor: bigint;
  readonly cogsMinor: bigint;
  readonly grossProfitMinor: bigint;
}

export type ReorderConfidence = "high" | "medium" | "low";

export interface ReorderSuggestion {
  readonly productVariantId: string;
  readonly name: string;
  readonly sku: string;
  readonly onHandUnits: number;
  readonly reservedUnits: number;
  readonly availableUnits: number;
  readonly reorderPoint: number | null;
  readonly windowUnitsSold: number;
  readonly demandOpenCount: number;
  readonly coverDaysRemaining: number | null;
  readonly recommendedQty: number;
  readonly unitLandedCostMinor: number | null;
  readonly estCostMinor: number | null;
  readonly unitProfitMinor: number | null;
  readonly expProfitMinor: number | null;
  readonly roiBasisPoints: number | null;
  readonly confidence: ReorderConfidence;
  readonly score: number;
}

export interface ReorderReport {
  readonly windowDays: number;
  readonly generatedAt: string;
  readonly businessDate: string;
  readonly totalEstCostMinor: number;
  readonly totalExpProfitMinor: number;
  readonly costCoverage: { readonly costed: number; readonly total: number };
  readonly suggestions: readonly ReorderSuggestion[];
}

interface ReorderRawRow {
  readonly productVariantId: string;
  readonly name: string;
  readonly sku: string;
  readonly reorderPoint: number | null;
  readonly casePackSize: number | null;
  readonly onHandUnits: bigint;
  readonly reservedUnits: bigint;
  readonly availableUnits: bigint;
  readonly costedUnits: bigint;
  readonly costedValueMinor: bigint;
  readonly windowUnitsSold: bigint;
  readonly windowRevenueMinor: bigint;
  readonly windowProfitMinor: bigint;
}

/** Days of demand cover the reorder engine targets holding in stock. */
const REORDER_COVER_DAYS = 30;

const SOURCE_NOT_BUILT = {
  availability: "unavailable",
  reason: "source_not_built",
} as const;

function unavailable(message: string) {
  return { ...SOURCE_NOT_BUILT, message } as const;
}

function redacted(message: string) {
  return { availability: "redacted", message } as const;
}

function safeNonnegativeInteger(value: bigint, label: string): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error(`${label} is outside the public safe-integer range.`);
  }
  return converted;
}

function safeSignedInteger(value: bigint, label: string): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new Error(`${label} is outside the public safe-integer range.`);
  }
  return converted;
}

function dashboardResponse(value: unknown): DashboardSnapshot {
  const parsed = DashboardSnapshotSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error("Dashboard response violated its public contract", {
    cause: parsed.error,
  });
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(context: DashboardActorContext): Promise<DashboardSnapshot> {
    const canViewInventory = context.permissions.has(
      PERMISSIONS.INVENTORY_VIEW,
    );
    const canViewInventoryValue =
      context.permissions.has(PERMISSIONS.INVENTORY_VIEW_COST) &&
      context.permissions.has(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    const canViewPurchases = context.permissions.has(
      PERMISSIONS.PURCHASES_VIEW,
    );

    const [inventory, openPurchaseOrders] = await Promise.all([
      canViewInventory || canViewInventoryValue
        ? this.inventoryAggregate(context)
        : Promise.resolve(null),
      canViewPurchases
        ? this.prisma.client.purchaseOrder.count({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              status: { notIn: ["closed", "cancelled"] },
            },
          })
        : Promise.resolve(null),
    ]);

    const attentionItems: DashboardAttentionItem[] = [];
    const liveAttentionSources = [
      ...(canViewInventory ? ["Stock"] : []),
      ...(canViewPurchases ? ["Purchasing"] : []),
    ];
    if (
      canViewInventory &&
      inventory !== null &&
      inventory.outOfStockVariantCount > 0
    ) {
      const count = inventory.outOfStockVariantCount;
      attentionItems.push({
        id: "inventory:active-variant-stockouts",
        rank: attentionItems.length + 1,
        severity: "negative",
        title: "Active products are out of stock",
        detail: `${count.toLocaleString("en-PK")} active variant${count === 1 ? " has" : "s have"} no available stock in your location scope.`,
        href: "/stock",
      });
    }
    if (
      canViewPurchases &&
      openPurchaseOrders !== null &&
      openPurchaseOrders > 0
    ) {
      attentionItems.push({
        id: "purchasing:open-purchase-orders",
        rank: attentionItems.length + 1,
        severity: "warning",
        title: "Purchase orders need action",
        detail: `${openPurchaseOrders.toLocaleString("en-PK")} open order${openPurchaseOrders === 1 ? "" : "s"} need approval, ordering, receiving or closure.`,
        href: "/purchases?tab=orders",
      });
    }

    const now = new Date();
    return dashboardResponse({
      asOf: now.toISOString(),
      businessDate: toBusinessDate(now),
      moneyKpis: this.moneyKpis(context, inventory),
      attention:
        canViewInventory || canViewPurchases
          ? {
              availability: "partial",
              items: attentionItems,
              message: `Live ${liveAttentionSources.join(" and ")} exceptions are shown; other attention sources are not built yet.`,
            }
          : redacted(
              "Stock and Purchasing attention requires source-module access.",
            ),
      recentSales: context.permissions.has(PERMISSIONS.SALES_VIEW)
        ? unavailable("The Sales ledger is not built yet.")
        : redacted("Recent sales require sales.view."),
      demandAndBuying:
        context.permissions.has(PERMISSIONS.DEMAND_VIEW) &&
        context.permissions.has(PERMISSIONS.RECOMMENDATIONS_VIEW)
          ? unavailable(
              "Demand capture and reorder recommendations are not built yet.",
            )
          : redacted(
              "Demand and buying insights require demand and recommendation access.",
            ),
      digitalServices: context.permissions.has(
        PERMISSIONS.EXTERNAL_SERVICES_VIEW,
      )
        ? unavailable("The Digital Services ledger is not built yet.")
        : redacted("Digital service analytics require external_services.view."),
      todaysTasks: unavailable("The Tasks source module is not built yet."),
      stockSummary:
        canViewInventory && inventory !== null
          ? {
              availability: "available",
              data: {
                onHandUnits: inventory.onHandUnits,
                reservedUnits: inventory.reservedUnits,
                availableUnits: inventory.availableUnits,
                outOfStockVariantCount: inventory.outOfStockVariantCount,
              },
            }
          : redacted("Live stock totals require inventory.view."),
    });
  }

  /**
   * Reconciled operational roll-up for one business day, week or month.
   *
   * Computed directly from the sales, external-transaction and expense tables
   * with tenant + branch + business-date filters. Sales revenue less COGS is
   * gross profit; service profit is added and expenses subtracted to give an
   * estimated net profit. Deliberately "estimated" — an operational summary,
   * not the posted ledger.
   */
  async summary(
    context: DashboardActorContext,
    query: DailyFinancialSummaryQuery,
  ): Promise<DailyFinancialSummary> {
    const anchor =
      query.date === undefined
        ? toBusinessDate(new Date())
        : parseBusinessDate(query.date);
    const { from, to } = this.periodRange(query.period, anchor);
    const businessDate = {
      gte: new Date(`${from}T00:00:00.000Z`),
      lte: new Date(`${to}T00:00:00.000Z`),
    };
    const tenant = {
      organizationId: context.organizationId,
      branchId: context.branchId,
    };

    const [sales, external, expenses] = await Promise.all([
      // A business date is stamped only when a sale posts, so the range filter
      // already excludes drafts and cancellations.
      this.prisma.client.sale.aggregate({
        where: { ...tenant, postedAt: { not: null }, businessDate },
        _sum: { totalMinor: true, cogsMinor: true },
        _count: true,
      }),
      this.prisma.client.externalTransaction.aggregate({
        where: { ...tenant, businessDate },
        _sum: { serviceProfitMinor: true },
        _count: true,
      }),
      this.prisma.client.expense.aggregate({
        where: { ...tenant, businessDate },
        _sum: { amountMinor: true },
      }),
    ]);

    const salesRevenueMinor = safeNonnegativeInteger(
      sales._sum.totalMinor ?? 0n,
      "sales revenue",
    );
    const cogsMinor = safeNonnegativeInteger(sales._sum.cogsMinor ?? 0n, "sales COGS");
    const grossProfitMinor = salesRevenueMinor - cogsMinor;
    const serviceProfitMinor = safeSignedInteger(
      external._sum.serviceProfitMinor ?? 0n,
      "service profit",
    );
    const expensesMinor = safeNonnegativeInteger(
      expenses._sum.amountMinor ?? 0n,
      "expenses",
    );
    const estimatedNetProfitMinor =
      grossProfitMinor + serviceProfitMinor - expensesMinor;

    return DailyFinancialSummarySchema.parse({
      period: query.period,
      from,
      to,
      salesRevenueMinor,
      cogsMinor,
      grossProfitMinor,
      serviceProfitMinor,
      expensesMinor,
      estimatedNetProfitMinor,
      salesCount: safeNonnegativeInteger(BigInt(sales._count), "sales count"),
      externalTxnCount: safeNonnegativeInteger(
        BigInt(external._count),
        "external transaction count",
      ),
    });
  }

  /**
   * Posted-sales revenue, cost and gross profit per business day for the most
   * recent `days` business dates (inclusive of today). Missing days are emitted
   * as explicit zeros so the series is contiguous and an empty day is never a
   * hole. Same tenant + branch + posted-only scope as {@link summary}.
   */
  async salesTrend(
    context: DashboardActorContext,
    days: number,
  ): Promise<SalesTrendReport> {
    const to = toBusinessDate(new Date());
    const { from } = rollingWindow(to, days);
    const businessDate = {
      gte: new Date(`${from}T00:00:00.000Z`),
      lte: new Date(`${to}T00:00:00.000Z`),
    };

    const rows = await this.prisma.client.sale.groupBy({
      by: ["businessDate"],
      where: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        postedAt: { not: null },
        businessDate,
      },
      _sum: { totalMinor: true, cogsMinor: true },
      _count: { _all: true },
    });

    // Bucket by the business-date instant. A stored `@db.Date` is materialized at
    // UTC midnight, which is exactly what `new Date(\`${d}T00:00:00.000Z\`)` — the
    // same construction the summary filter uses — produces for that Pakistan
    // business date, so equal `getTime()` values identify the same day.
    const byInstant = new Map<
      number,
      { revenue: bigint; cogs: bigint; count: number }
    >();
    for (const row of rows) {
      if (row.businessDate === null) continue;
      byInstant.set(row.businessDate.getTime(), {
        revenue: row._sum.totalMinor ?? 0n,
        cogs: row._sum.cogsMinor ?? 0n,
        count: row._count._all,
      });
    }

    const points: SalesTrendPoint[] = [];
    for (let index = 0; index < days; index += 1) {
      const date = addBusinessDays(from, index);
      const aggregate = byInstant.get(
        new Date(`${date}T00:00:00.000Z`).getTime(),
      );
      const salesRevenueMinor = safeNonnegativeInteger(
        aggregate?.revenue ?? 0n,
        "sales revenue",
      );
      const cogsMinor = safeNonnegativeInteger(
        aggregate?.cogs ?? 0n,
        "sales COGS",
      );
      points.push({
        businessDate: date,
        salesRevenueMinor,
        cogsMinor,
        grossProfitMinor: salesRevenueMinor - cogsMinor,
        salesCount: aggregate?.count ?? 0,
      });
    }

    return { from, to, days, points };
  }

  /**
   * Products ranked by posted revenue for a day, week or month, aggregated from
   * immutable posted sale lines. Tenant + branch scoped; each line carries its
   * own tenant columns so the sale join cannot widen the scope.
   */
  async topProducts(
    context: DashboardActorContext,
    period: FinancialSummaryPeriod,
    limit: number,
  ): Promise<TopProductsReport> {
    const { from, to } = this.periodRange(period, toBusinessDate(new Date()));
    const rows = await this.prisma.client.$queryRaw<
      readonly TopProductRawRow[]
    >(Prisma.sql`
      SELECT sl.product_variant_id AS "productVariantId",
             MAX(sl.product_name_snapshot) AS "name",
             MAX(sl.sku_snapshot) AS "sku",
             SUM(sl.quantity)::bigint AS "unitsSold",
             SUM(sl.line_total_minor)::bigint AS "revenueMinor",
             SUM(sl.cogs_minor)::bigint AS "cogsMinor",
             SUM(sl.gross_profit_minor)::bigint AS "grossProfitMinor"
        FROM sale_lines sl
        JOIN sales s ON s.id = sl.sale_id
                    AND s.organization_id = sl.organization_id
                    AND s.branch_id = sl.branch_id
       WHERE sl.organization_id = ${context.organizationId}::uuid
         AND sl.branch_id = ${context.branchId}::uuid
         AND s.posted_at IS NOT NULL
         AND s.business_date >= ${from}::date
         AND s.business_date <= ${to}::date
       GROUP BY sl.product_variant_id
       ORDER BY "revenueMinor" DESC, "unitsSold" DESC
       LIMIT ${limit}
    `);

    const items = rows.map((row) => {
      const revenueMinor = safeNonnegativeInteger(
        row.revenueMinor,
        "product revenue",
      );
      const cogsMinor = safeNonnegativeInteger(row.cogsMinor, "product COGS");
      return {
        productVariantId: row.productVariantId,
        name: row.name,
        sku: row.sku,
        unitsSold: safeNonnegativeInteger(row.unitsSold, "units sold"),
        revenueMinor,
        cogsMinor,
        grossProfitMinor: safeSignedInteger(
          row.grossProfitMinor,
          "product gross profit",
        ),
      };
    });

    return { period, from, to, items };
  }

  /**
   * Deterministic reorder suggestions for quantity-tracked variants, derived
   * only from real signals: on-hand stock, posted-sales velocity over the
   * window, open matched customer demand, and the variant reorder point. No
   * value is invented — a variant with no evidence yields no suggestion, and a
   * variant with no recorded landed cost reports null cost rather than a guess.
   *
   * Read-only, tenant + branch scoped; stock respects the caller's location
   * scope exactly like the dashboard snapshot.
   */
  async reorderSuggestions(
    context: DashboardActorContext,
    windowDays: number,
    limit: number,
  ): Promise<ReorderReport> {
    const now = new Date();
    const businessDate = toBusinessDate(now);
    const { from: windowStart } = rollingWindow(businessDate, windowDays);
    const batchLocationScope = this.locationScope(
      Prisma.sql`b.stock_location_id`,
      context.allowedLocationIds,
    );

    const [rows, demand] = await Promise.all([
      this.prisma.client.$queryRaw<readonly ReorderRawRow[]>(Prisma.sql`
        WITH batch_stock AS (
          SELECT b.product_variant_id AS variant_id,
                 SUM(b.quantity_on_hand)::bigint AS on_hand,
                 SUM(b.quantity_reserved)::bigint AS reserved,
                 SUM(b.quantity_on_hand - b.quantity_reserved)::bigint AS available,
                 SUM(CASE WHEN b.landed_cost_minor IS NULL
                          THEN 0 ELSE b.quantity_on_hand END)::bigint AS costed_units,
                 SUM(CASE WHEN b.landed_cost_minor IS NULL
                          THEN 0
                          ELSE b.quantity_on_hand::bigint * b.landed_cost_minor
                     END)::bigint AS costed_value
            FROM stock_batches b
           WHERE b.organization_id = ${context.organizationId}::uuid
             AND b.branch_id = ${context.branchId}::uuid
             AND ${batchLocationScope}
           GROUP BY b.product_variant_id
        ), sales_window AS (
          SELECT sl.product_variant_id AS variant_id,
                 SUM(sl.quantity)::bigint AS units_sold,
                 SUM(sl.line_total_minor)::bigint AS revenue,
                 SUM(sl.gross_profit_minor)::bigint AS profit
            FROM sale_lines sl
            JOIN sales s ON s.id = sl.sale_id
                        AND s.organization_id = sl.organization_id
                        AND s.branch_id = sl.branch_id
           WHERE sl.organization_id = ${context.organizationId}::uuid
             AND sl.branch_id = ${context.branchId}::uuid
             AND s.posted_at IS NOT NULL
             AND s.business_date >= ${windowStart}::date
             AND s.business_date <= ${businessDate}::date
           GROUP BY sl.product_variant_id
        )
        SELECT v.id AS "productVariantId",
               v.name AS "name",
               v.sku AS "sku",
               v.reorder_point AS "reorderPoint",
               v.case_pack_size AS "casePackSize",
               COALESCE(bs.on_hand, 0)::bigint AS "onHandUnits",
               COALESCE(bs.reserved, 0)::bigint AS "reservedUnits",
               COALESCE(bs.available, 0)::bigint AS "availableUnits",
               COALESCE(bs.costed_units, 0)::bigint AS "costedUnits",
               COALESCE(bs.costed_value, 0)::bigint AS "costedValueMinor",
               COALESCE(sw.units_sold, 0)::bigint AS "windowUnitsSold",
               COALESCE(sw.revenue, 0)::bigint AS "windowRevenueMinor",
               COALESCE(sw.profit, 0)::bigint AS "windowProfitMinor"
          FROM product_variants v
          LEFT JOIN batch_stock bs ON bs.variant_id = v.id
          LEFT JOIN sales_window sw ON sw.variant_id = v.id
         WHERE v.organization_id = ${context.organizationId}::uuid
           AND v.is_active = TRUE
           AND v.tracking_type::text = 'quantity'
           AND (bs.variant_id IS NOT NULL OR sw.variant_id IS NOT NULL)
      `),
      this.prisma.client.demandRequestItem.groupBy({
        by: ["matchedProductVariantId"],
        where: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          matchedProductVariantId: { not: null },
          demandRequest: {
            convertedTargetId: null,
            status: { notIn: ["converted_to_sale", "closed", "not_interested"] },
          },
        },
        _count: { _all: true },
      }),
    ]);

    const demandByVariant = new Map<string, number>();
    for (const item of demand) {
      if (item.matchedProductVariantId === null) continue;
      demandByVariant.set(item.matchedProductVariantId, item._count._all);
    }

    const suggestions: ReorderSuggestion[] = [];
    for (const row of rows) {
      const availableUnits = safeNonnegativeInteger(
        row.availableUnits,
        "available units",
      );
      const onHandUnits = safeNonnegativeInteger(row.onHandUnits, "on-hand units");
      const reservedUnits = safeNonnegativeInteger(
        row.reservedUnits,
        "reserved units",
      );
      const costedUnits = safeNonnegativeInteger(row.costedUnits, "costed units");
      const costedValueMinor = safeNonnegativeInteger(
        row.costedValueMinor,
        "costed value",
      );
      const windowUnitsSold = safeNonnegativeInteger(
        row.windowUnitsSold,
        "window units sold",
      );
      const windowProfitMinor = safeSignedInteger(
        row.windowProfitMinor,
        "window gross profit",
      );
      const reorderPoint = row.reorderPoint;
      const casePackSize =
        row.casePackSize !== null && row.casePackSize > 0
          ? row.casePackSize
          : null;
      const demandOpenCount = demandByVariant.get(row.productVariantId) ?? 0;

      const dailyVelocity = windowUnitsSold / windowDays;
      const coverTarget = Math.ceil(dailyVelocity * REORDER_COVER_DAYS);
      const targetStock = Math.max(coverTarget, reorderPoint ?? 0);
      const rawNeed = targetStock - availableUnits;
      const belowReorderPoint =
        reorderPoint !== null && availableUnits <= reorderPoint;
      const hasEvidence =
        windowUnitsSold > 0 || belowReorderPoint || demandOpenCount > 0;
      if (rawNeed <= 0 || !hasEvidence) continue;

      const recommendedQty =
        casePackSize === null
          ? rawNeed
          : Math.ceil(rawNeed / casePackSize) * casePackSize;
      const unitLandedCostMinor =
        costedUnits > 0 ? Math.round(costedValueMinor / costedUnits) : null;
      const estCostMinor =
        unitLandedCostMinor === null
          ? null
          : recommendedQty * unitLandedCostMinor;
      const unitProfitMinor =
        windowUnitsSold > 0
          ? Math.round(windowProfitMinor / windowUnitsSold)
          : null;
      const expProfitMinor =
        unitProfitMinor === null ? null : recommendedQty * unitProfitMinor;
      const roiBasisPoints =
        estCostMinor !== null && estCostMinor > 0 && expProfitMinor !== null
          ? Math.round((expProfitMinor / estCostMinor) * 10_000)
          : null;
      const coverDaysRemaining =
        dailyVelocity > 0 ? Math.floor(availableUnits / dailyVelocity) : null;
      const confidence: ReorderConfidence =
        windowUnitsSold >= 10 ? "high" : windowUnitsSold >= 3 ? "medium" : "low";
      const urgency =
        coverDaysRemaining === null
          ? availableUnits === 0
            ? REORDER_COVER_DAYS
            : 0
          : Math.max(0, REORDER_COVER_DAYS - coverDaysRemaining);
      const score =
        Math.round(dailyVelocity * 100) + urgency * 5 + demandOpenCount * 20;

      suggestions.push({
        productVariantId: row.productVariantId,
        name: row.name,
        sku: row.sku,
        onHandUnits,
        reservedUnits,
        availableUnits,
        reorderPoint,
        windowUnitsSold,
        demandOpenCount,
        coverDaysRemaining,
        recommendedQty,
        unitLandedCostMinor,
        estCostMinor,
        unitProfitMinor,
        expProfitMinor,
        roiBasisPoints,
        confidence,
        score,
      });
    }

    suggestions.sort(
      (left, right) =>
        right.score - left.score || right.recommendedQty - left.recommendedQty,
    );
    const ranked = suggestions.slice(0, limit);

    const totalEstCostMinor = ranked.reduce(
      (sum, item) => sum + (item.estCostMinor ?? 0),
      0,
    );
    const totalExpProfitMinor = ranked.reduce(
      (sum, item) => sum + (item.expProfitMinor ?? 0),
      0,
    );
    const costedCount = ranked.filter(
      (item) => item.unitLandedCostMinor !== null,
    ).length;

    return {
      windowDays,
      generatedAt: now.toISOString(),
      businessDate,
      totalEstCostMinor,
      totalExpProfitMinor,
      costCoverage: { costed: costedCount, total: ranked.length },
      suggestions: ranked,
    };
  }

  /** Inclusive business-date range for a period, anchored on `anchor`. */
  private periodRange(
    period: FinancialSummaryPeriod,
    anchor: BusinessDate,
  ): { from: BusinessDate; to: BusinessDate } {
    if (period === "day") return { from: anchor, to: anchor };
    if (period === "week") {
      // Midday UTC avoids any offset edge; ISO week runs Monday..Sunday.
      const dayOfWeek = new Date(`${anchor}T12:00:00.000Z`).getUTCDay();
      const daysFromMonday = (dayOfWeek + 6) % 7;
      const from = addBusinessDays(anchor, -daysFromMonday);
      return { from, to: addBusinessDays(from, 6) };
    }
    const year = Number(anchor.slice(0, 4));
    const month = Number(anchor.slice(5, 7));
    // Date.UTC month is 0-based, so passing `month` names the following month and
    // day 0 resolves to the last calendar day of the anchor's month.
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      from: parseBusinessDate(`${anchor.slice(0, 7)}-01`),
      to: parseBusinessDate(`${anchor.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`),
    };
  }

  private moneyKpis(
    context: DashboardActorContext,
    inventory: InventoryAggregate | null,
  ) {
    const financialReports = context.permissions.has(
      PERMISSIONS.REPORTS_VIEW_FINANCIAL,
    );
    const inventoryValue = this.inventoryValue(context, inventory);

    return [
      {
        key: "sales_today",
        label: "Sales today",
        href: "/finance",
        definition:
          "Net posted sales revenue for the current business date and branch.",
        value: context.permissions.has(PERMISSIONS.SALES_VIEW)
          ? unavailable("The Sales ledger is not built yet.")
          : redacted("Sales revenue requires sales.view."),
      },
      {
        key: "gross_profit",
        label: "Gross profit",
        href: "/finance",
        definition:
          "Net posted sales revenue less recorded cost of goods sold for the business date.",
        value:
          financialReports &&
          context.permissions.has(PERMISSIONS.SALES_VIEW_PROFIT)
            ? unavailable("Sales profit reporting is not built yet.")
            : redacted(
                "Gross profit requires reports.view_financial and sales.view_profit.",
              ),
      },
      {
        key: "expenses",
        label: "Expenses",
        href: "/finance",
        definition:
          "Posted operating expenses for the current business date and branch.",
        value:
          financialReports && context.permissions.has(PERMISSIONS.EXPENSES_VIEW)
            ? unavailable("The Expenses ledger is not built yet.")
            : redacted(
                "Expense totals require reports.view_financial and expenses.view.",
              ),
      },
      {
        key: "net_operating",
        label: "Net operating",
        href: "/finance",
        definition:
          "Sales gross profit plus service profit and other income, less operating expenses and recorded losses.",
        value:
          financialReports && context.permissions.has(PERMISSIONS.LEDGER_VIEW)
            ? unavailable("The Financial Ledger is not built yet.")
            : redacted(
                "Net operating profit requires reports.view_financial and ledger.view.",
              ),
      },
      {
        key: "cash_position",
        label: "Cash position",
        href: "/closing",
        definition:
          "Expected physical cash for the active branch cash session at this snapshot time.",
        value: context.permissions.has(PERMISSIONS.CASH_SESSIONS_VIEW)
          ? unavailable("Cash Sessions and their ledger are not built yet.")
          : redacted("Cash position requires cash_sessions.view."),
      },
      {
        key: "inventory_value",
        label: "Inventory value",
        href: "/stock",
        definition:
          "Recorded landed cost of physically on-hand stock in the active branch and permitted locations.",
        value: inventoryValue,
      },
    ] as const;
  }

  private inventoryValue(
    context: DashboardActorContext,
    inventory: InventoryAggregate | null,
  ): DashboardMoneyValue {
    if (
      !context.permissions.has(PERMISSIONS.INVENTORY_VIEW_COST) ||
      !context.permissions.has(PERMISSIONS.REPORTS_VIEW_FINANCIAL)
    ) {
      return redacted(
        "Inventory valuation requires inventory.view_cost and reports.view_financial.",
      );
    }
    if (inventory === null) {
      return unavailable("Inventory valuation is temporarily unavailable.");
    }

    const coverage = {
      valuedUnits: inventory.valuedUnits,
      uncostedUnits: inventory.uncostedUnits,
    };
    if (inventory.uncostedUnits > 0) {
      return {
        availability: "partial",
        valueMinor: inventory.inventoryValueMinor,
        meta: "Recorded landed cost only",
        message: `${inventory.uncostedUnits.toLocaleString("en-PK")} on-hand unit${inventory.uncostedUnits === 1 ? " has" : "s have"} no recorded landed cost and is excluded.`,
        coverage,
      };
    }
    return {
      availability: "available",
      valueMinor: inventory.inventoryValueMinor,
      meta: "At recorded landed cost",
      coverage,
    };
  }

  private async inventoryAggregate(
    context: DashboardActorContext,
  ): Promise<InventoryAggregate> {
    const batchLocationScope = this.locationScope(
      Prisma.sql`b.stock_location_id`,
      context.allowedLocationIds,
    );
    const unitLocationScope = this.locationScope(
      Prisma.sql`u.stock_location_id`,
      context.allowedLocationIds,
    );
    const rows = await this.prisma.client.$queryRaw<
      readonly InventoryAggregateRow[]
    >(Prisma.sql`
      WITH inventory_rows AS (
        SELECT b.product_variant_id,
               b.quantity_on_hand::bigint AS on_hand,
               b.quantity_reserved::bigint AS reserved,
               (b.quantity_on_hand - b.quantity_reserved)::bigint AS available,
               CASE WHEN b.landed_cost_minor IS NULL
                    THEN 0 ELSE b.quantity_on_hand END::bigint AS valued,
               CASE WHEN b.landed_cost_minor IS NULL
                    THEN b.quantity_on_hand ELSE 0 END::bigint AS uncosted,
               CASE WHEN b.landed_cost_minor IS NULL
                    THEN 0
                    ELSE b.quantity_on_hand::bigint * b.landed_cost_minor
               END::bigint AS inventory_value
          FROM stock_batches b
         WHERE b.organization_id = ${context.organizationId}::uuid
           AND b.branch_id = ${context.branchId}::uuid
           AND ${batchLocationScope}
        UNION ALL
        SELECT u.product_variant_id,
               CASE WHEN u.state::text IN (${Prisma.join([...ON_HAND_STOCK_STATES])})
                    THEN 1 ELSE 0 END::bigint AS on_hand,
               CASE WHEN u.state::text = 'reserved'
                    THEN 1 ELSE 0 END::bigint AS reserved,
               CASE WHEN u.state::text = 'available'
                    THEN 1 ELSE 0 END::bigint AS available,
               CASE WHEN u.state::text IN (${Prisma.join([...ON_HAND_STOCK_STATES])})
                          AND u.landed_cost_minor IS NOT NULL
                    THEN 1 ELSE 0 END::bigint AS valued,
               CASE WHEN u.state::text IN (${Prisma.join([...ON_HAND_STOCK_STATES])})
                          AND u.landed_cost_minor IS NULL
                    THEN 1 ELSE 0 END::bigint AS uncosted,
               CASE WHEN u.state::text IN (${Prisma.join([...ON_HAND_STOCK_STATES])})
                    THEN COALESCE(u.landed_cost_minor, 0)
                    ELSE 0 END::bigint AS inventory_value
          FROM serialized_units u
         WHERE u.organization_id = ${context.organizationId}::uuid
           AND u.branch_id = ${context.branchId}::uuid
           AND ${unitLocationScope}
      ), variant_totals AS (
        SELECT product_variant_id,
               SUM(on_hand)::bigint AS on_hand,
               SUM(reserved)::bigint AS reserved,
               SUM(available)::bigint AS available,
               SUM(valued)::bigint AS valued,
               SUM(uncosted)::bigint AS uncosted,
               SUM(inventory_value)::bigint AS inventory_value
          FROM inventory_rows
         GROUP BY product_variant_id
      ), inventory_totals AS (
        SELECT COALESCE(SUM(on_hand), 0)::bigint AS "onHandUnits",
               COALESCE(SUM(reserved), 0)::bigint AS "reservedUnits",
               COALESCE(SUM(available), 0)::bigint AS "availableUnits",
               COALESCE(SUM(valued), 0)::bigint AS "valuedUnits",
               COALESCE(SUM(uncosted), 0)::bigint AS "uncostedUnits",
               COALESCE(SUM(inventory_value), 0)::bigint AS "inventoryValueMinor"
          FROM variant_totals
      ), stockouts AS (
        SELECT COUNT(*)::bigint AS count
          FROM product_variants v
          LEFT JOIN variant_totals t ON t.product_variant_id = v.id
         WHERE v.organization_id = ${context.organizationId}::uuid
           AND v.is_active = TRUE
           AND COALESCE(t.available, 0) = 0
      )
      SELECT totals."onHandUnits",
             totals."reservedUnits",
             totals."availableUnits",
             totals."valuedUnits",
             totals."uncostedUnits",
             totals."inventoryValueMinor",
             stockouts.count AS "outOfStockVariantCount"
        FROM inventory_totals totals
        CROSS JOIN stockouts
    `);
    const row = rows[0];
    if (row === undefined) {
      throw new Error("Inventory dashboard aggregate returned no row.");
    }
    return {
      onHandUnits: safeNonnegativeInteger(row.onHandUnits, "on-hand units"),
      reservedUnits: safeNonnegativeInteger(
        row.reservedUnits,
        "reserved units",
      ),
      availableUnits: safeNonnegativeInteger(
        row.availableUnits,
        "available units",
      ),
      valuedUnits: safeNonnegativeInteger(row.valuedUnits, "valued units"),
      uncostedUnits: safeNonnegativeInteger(
        row.uncostedUnits,
        "uncosted units",
      ),
      inventoryValueMinor: safeNonnegativeInteger(
        row.inventoryValueMinor,
        "inventory value",
      ),
      outOfStockVariantCount: safeNonnegativeInteger(
        row.outOfStockVariantCount,
        "out-of-stock variant count",
      ),
    };
  }

  private locationScope(
    column: Prisma.Sql,
    allowedLocationIds: readonly string[] | null,
  ): Prisma.Sql {
    if (allowedLocationIds === null) return Prisma.sql`TRUE`;
    if (allowedLocationIds.length === 0) return Prisma.sql`FALSE`;
    return Prisma.sql`${column} IN (${Prisma.join(
      allowedLocationIds.map((id) => Prisma.sql`${id}::uuid`),
    )})`;
  }
}
