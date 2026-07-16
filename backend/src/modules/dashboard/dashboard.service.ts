import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  addBusinessDays,
  DailyFinancialSummarySchema,
  DashboardSnapshotSchema,
  ON_HAND_STOCK_STATES,
  parseBusinessDate,
  PERMISSIONS,
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
