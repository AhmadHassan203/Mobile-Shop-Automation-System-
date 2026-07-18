import {
  PERMISSIONS,
  type DailyFinancialSummary,
  type PermissionKey,
} from "@mobileshop/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import type { CashPosition, CashService } from "../cash/cash.service";
import type {
  DemandService,
  DemandTopUnmetItem,
} from "../demand/demand.service";
import type {
  ExternalBalancesResult,
  ExternalCommissionResult,
  ExternalService,
} from "../external/external.service";
import type { SalesService } from "../sales/sales.service";
import {
  DashboardService,
  type DashboardActorContext,
  type ReorderReport,
} from "./dashboard.service";

const IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  location: "10000000-0000-4000-8000-000000000003",
  otherLocation: "10000000-0000-4000-8000-000000000004",
});

/** A second tenant whose rows must never appear in tenant A's reports. */
const TENANT_B = Object.freeze({
  organization: "20000000-0000-4000-8000-000000000001",
  branch: "20000000-0000-4000-8000-000000000002",
});
const VARIANT_A = "10000000-0000-4000-8000-0000000000aa";
const SALE_ID = "10000000-0000-4000-8000-0000000000cc";

interface InventoryTestRow {
  readonly onHandUnits: bigint;
  readonly reservedUnits: bigint;
  readonly availableUnits: bigint;
  readonly valuedUnits: bigint;
  readonly uncostedUnits: bigint;
  readonly inventoryValueMinor: bigint;
  readonly outOfStockVariantCount: bigint;
}

const INVENTORY_ROW: InventoryTestRow = Object.freeze({
  onHandUnits: 9n,
  reservedUnits: 2n,
  availableUnits: 7n,
  valuedUnits: 8n,
  uncostedUnits: 1n,
  inventoryValueMinor: 123_450n,
  outOfStockVariantCount: 3n,
});

function context(
  permissions: readonly PermissionKey[],
  allowedLocationIds: readonly string[] | null = [IDS.location],
): DashboardActorContext {
  return {
    organizationId: IDS.organization,
    organizationName: "Tenant A",
    branchId: IDS.branch,
    branchName: "Main",
    actorUserId: "10000000-0000-4000-8000-0000000000ff",
    actorFullName: "Owner",
    currency: "PKR",
    permissions: new Set(permissions),
    allowedLocationIds,
    metadata: { ipAddress: null, userAgent: null, requestId: "test-request" },
  };
}

/** Stub domain services for the read-model methods that never call out. */
function stubServices(): {
  sales: SalesService;
  external: ExternalService;
  cash: CashService;
  demand: DemandService;
} {
  return {
    sales: {} as unknown as SalesService,
    external: {} as unknown as ExternalService,
    cash: {} as unknown as CashService,
    demand: {} as unknown as DemandService,
  };
}

function dashboardService(prisma: PrismaService): DashboardService {
  const stubs = stubServices();
  return new DashboardService(
    prisma,
    stubs.sales,
    stubs.external,
    stubs.cash,
    stubs.demand,
  );
}

// ---------------------------------------------------------------------------
// snapshot() — the live command-centre read model
// ---------------------------------------------------------------------------

const DAY_SUMMARY: DailyFinancialSummary = {
  period: "day",
  from: "2026-07-17",
  to: "2026-07-17",
  salesRevenueMinor: 500_000,
  discountsMinor: 0,
  returnsMinor: 0,
  netSalesMinor: 500_000,
  cogsMinor: 300_000,
  grossProfitMinor: 200_000,
  serviceProfitMinor: 7_000,
  expensesMinor: 12_000,
  estimatedNetProfitMinor: 195_000,
  salesCount: 4,
  externalTxnCount: 3,
};

const ZERO_SUMMARY: DailyFinancialSummary = {
  period: "day",
  from: "2026-07-17",
  to: "2026-07-17",
  salesRevenueMinor: 0,
  discountsMinor: 0,
  returnsMinor: 0,
  netSalesMinor: 0,
  cogsMinor: 0,
  grossProfitMinor: 0,
  serviceProfitMinor: 0,
  expensesMinor: 0,
  estimatedNetProfitMinor: 0,
  salesCount: 0,
  externalTxnCount: 0,
};

const REORDER_REPORT: ReorderReport = {
  windowDays: 30,
  generatedAt: "2026-07-17T06:00:00.000Z",
  businessDate: "2026-07-17",
  signal: "recommendations",
  earlySignal: false,
  analysis: {
    analyzedVariants: 1,
    variantsWithSales: 1,
    variantsWithStock: 1,
    variantsWithDemand: 0,
    windowUnitsSold: 12,
  },
  totalEstCostMinor: 150_000,
  totalExpProfitMinor: 90_000,
  costCoverage: { costed: 1, total: 1 },
  suggestions: [],
};

const EMPTY_REORDER: ReorderReport = {
  windowDays: 30,
  generatedAt: "2026-07-17T06:00:00.000Z",
  businessDate: "2026-07-17",
  signal: "insufficient_data",
  earlySignal: false,
  analysis: {
    analyzedVariants: 0,
    variantsWithSales: 0,
    variantsWithStock: 0,
    variantsWithDemand: 0,
    windowUnitsSold: 0,
  },
  totalEstCostMinor: 0,
  totalExpProfitMinor: 0,
  costCoverage: { costed: 0, total: 0 },
  suggestions: [],
};

const BALANCES: ExternalBalancesResult = {
  businessDate: "2026-07-17",
  providers: [
    {
      provider: "easypaisa",
      amountSentTodayMinor: 60_000,
      amountReceivedTodayMinor: 50_000,
      netMovementMinor: -10_000,
      transactionCount: 2,
      lastTransactionAt: null,
      openingBalanceMinor: null,
      currentBalanceMinor: null,
      lowBalanceThresholdMinor: null,
    },
    {
      provider: "jazzcash",
      amountSentTodayMinor: 40_000,
      amountReceivedTodayMinor: 30_000,
      netMovementMinor: -10_000,
      transactionCount: 1,
      lastTransactionAt: null,
      openingBalanceMinor: null,
      currentBalanceMinor: null,
      lowBalanceThresholdMinor: null,
    },
  ],
};

const EMPTY_BALANCES: ExternalBalancesResult = {
  businessDate: "2026-07-17",
  providers: [],
};

const COMMISSION: ExternalCommissionResult = {
  period: "day",
  from: "2026-07-17",
  to: "2026-07-17",
  totals: {
    grossFeeMinor: 2_000,
    providerCostMinor: 500,
    netCommissionMinor: 1_500,
    transactionCount: 3,
  },
  byProvider: [],
  byType: [],
};

const EMPTY_COMMISSION: ExternalCommissionResult = {
  period: "day",
  from: "2026-07-17",
  to: "2026-07-17",
  totals: {
    grossFeeMinor: 0,
    providerCostMinor: 0,
    netCommissionMinor: 0,
    transactionCount: 0,
  },
  byProvider: [],
  byType: [],
};

const CASH_POSITION: CashPosition = {
  sessionId: "10000000-0000-4000-8000-0000000000dd",
  sessionNumber: "CS-000001",
  openingCashMinor: 50_000,
  cashSalesMinor: 30_000,
  externalCashImpactMinor: 0,
  cashExpensesMinor: 5_000,
  expectedCashMinor: 75_000,
};

const TOP_UNMET: readonly DemandTopUnmetItem[] = [
  { key: `variant:${VARIANT_A}`, name: "iPhone 15", waitingQuantity: 3 },
];

/** One posted-sale list row, with knobs for the mapping edge cases. */
function saleRow(
  overrides: Partial<{
    id: string;
    invoiceNumber: string | null;
    postedAt: string | null;
    customer: { id: string; name: string; phone: string | null } | null;
    paymentMethods: readonly string[];
    totalMinor: number;
    profit:
      | {
          availability: "available";
          cogsMinor: number;
          grossProfitMinor: number;
          grossMarginBasisPoints: number;
        }
      | { availability: "redacted"; message: string };
  }> = {},
) {
  return {
    id: overrides.id ?? SALE_ID,
    status: "posted" as const,
    invoiceNumber:
      overrides.invoiceNumber === undefined
        ? "SAL-000123"
        : overrides.invoiceNumber,
    customer:
      overrides.customer === undefined
        ? {
            id: "10000000-0000-4000-8000-0000000000ee",
            name: "Acme",
            phone: null,
          }
        : overrides.customer,
    lineCount: 1,
    unitCount: 1,
    totalMinor: overrides.totalMinor ?? 25_000,
    paymentMethods: overrides.paymentMethods ?? ["cash"],
    profit:
      overrides.profit ??
      ({
        availability: "available",
        cogsMinor: 15_000,
        grossProfitMinor: 10_000,
        grossMarginBasisPoints: 4_000,
      } as const),
    cashier: null,
    salesperson: null,
    heldAt: null,
    postedAt:
      overrides.postedAt === undefined
        ? "2026-07-16T09:15:00.000Z"
        : overrides.postedAt,
    createdAt: "2026-07-16T09:15:00.000Z",
    version: 1,
  };
}

function salesPage(items: readonly ReturnType<typeof saleRow>[]) {
  return {
    items,
    page: 1,
    pageSize: 6,
    total: items.length,
    totalPages: 1,
  };
}

interface CreateServiceOverrides {
  inventoryRows?: readonly InventoryTestRow[];
  openPurchaseOrders?: number;
  sales?: ReturnType<typeof salesPage>;
  balances?: ExternalBalancesResult;
  commission?: ExternalCommissionResult;
  position?: CashPosition | null;
  topUnmet?: readonly DemandTopUnmetItem[];
  summary?: DailyFinancialSummary;
  reorder?: ReorderReport;
}

/**
 * The single snapshot-test factory. Every dependency is a typed mock whose
 * default is a valid live state (a session is open, zero/empty movement is a
 * real zero — never a source_not_built stub). Individual tests override only
 * the source they exercise. The finance summary and reorder engine are
 * DashboardService's own methods, exercised in their own suites, so here they
 * are spied to keep snapshot() coordination free of a live database.
 */
function createService(overrides: CreateServiceOverrides = {}) {
  const queryRaw = vi
    .fn()
    .mockResolvedValue(overrides.inventoryRows ?? [INVENTORY_ROW]);
  const count = vi.fn().mockResolvedValue(overrides.openPurchaseOrders ?? 2);
  const list = vi
    .fn()
    .mockResolvedValue(overrides.sales ?? salesPage([saleRow()]));
  const balances = vi.fn().mockResolvedValue(overrides.balances ?? BALANCES);
  const commission = vi
    .fn()
    .mockResolvedValue(overrides.commission ?? COMMISSION);
  const position = vi
    .fn()
    .mockResolvedValue(
      "position" in overrides ? overrides.position : CASH_POSITION,
    );
  const topUnmet = vi.fn().mockResolvedValue(overrides.topUnmet ?? TOP_UNMET);

  const prisma = {
    client: { $queryRaw: queryRaw, purchaseOrder: { count } },
  } as unknown as PrismaService;
  const service = new DashboardService(
    prisma,
    { list } as unknown as SalesService,
    { balances, commission } as unknown as ExternalService,
    { position } as unknown as CashService,
    { topUnmet } as unknown as DemandService,
  );
  vi.spyOn(service, "summary").mockResolvedValue(
    overrides.summary ?? DAY_SUMMARY,
  );
  vi.spyOn(service, "reorderSuggestions").mockResolvedValue(
    overrides.reorder ?? REORDER_REPORT,
  );

  return {
    service,
    mocks: { queryRaw, count, list, balances, commission, position, topUnmet },
  };
}

const FULL_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.INVENTORY_VIEW_COST,
  PERMISSIONS.REPORTS_VIEW_FINANCIAL,
  PERMISSIONS.PURCHASES_VIEW,
  PERMISSIONS.SALES_VIEW,
  PERMISSIONS.SALES_VIEW_PROFIT,
  PERMISSIONS.CASH_SESSIONS_VIEW,
  PERMISSIONS.DEMAND_VIEW,
  PERMISSIONS.RECOMMENDATIONS_VIEW,
  PERMISSIONS.EXTERNAL_SERVICES_VIEW,
];

describe("DashboardService.snapshot (live read model)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("populates every section from the reused domain sources", async () => {
    const { service } = createService();
    const snapshot = await service.snapshot(context(FULL_PERMISSIONS));

    // The four financial tiles are the finance summary verbatim — Dashboard can
    // never disagree with Finance.
    expect(snapshot.moneyKpis[0].value).toEqual({
      availability: "available",
      valueMinor: 500_000,
      meta: "Posted sales revenue today",
    });
    expect(snapshot.moneyKpis[1].value).toEqual({
      availability: "available",
      valueMinor: 200_000,
      meta: "Sales revenue less COGS",
    });
    expect(snapshot.moneyKpis[2].value).toEqual({
      availability: "available",
      valueMinor: 12_000,
      meta: "Operating expenses today",
    });
    expect(snapshot.moneyKpis[3].value).toEqual({
      availability: "available",
      valueMinor: 195_000,
      meta: "Gross + service profit less expenses",
    });
    expect(snapshot.moneyKpis[4].value).toEqual({
      availability: "available",
      valueMinor: 75_000,
      meta: "Expected drawer · session CS-000001",
    });
    expect(snapshot.moneyKpis[5].value).toMatchObject({
      availability: "partial",
      valueMinor: 123_450,
    });

    expect(snapshot.todaysTasks).toEqual({
      availability: "unavailable",
      reason: "source_not_built",
      message: "The Tasks source module is coming soon.",
    });
    expect(snapshot.stockSummary).toEqual({
      availability: "available",
      data: {
        onHandUnits: 9,
        reservedUnits: 2,
        availableUnits: 7,
        outOfStockVariantCount: 3,
      },
    });
    expect(snapshot.attention.availability).toBe("partial");
  });

  it("maps recent sales — split payments, walk-in fallback and redacted profit", async () => {
    const { service } = createService({
      sales: salesPage([
        saleRow({
          id: "10000000-0000-4000-8000-0000000000c1",
          invoiceNumber: "SAL-1",
          paymentMethods: ["cash", "card"],
          customer: null,
        }),
        saleRow({
          id: "10000000-0000-4000-8000-0000000000c2",
          invoiceNumber: "SAL-2",
          paymentMethods: ["bank_transfer"],
          profit: { availability: "redacted", message: "no profit" },
        }),
        // Unposted rows are never shown even if the list returns them.
        saleRow({
          id: "10000000-0000-4000-8000-0000000000c3",
          invoiceNumber: null,
          postedAt: null,
        }),
      ]),
    });

    const snapshot = await service.snapshot(context(FULL_PERMISSIONS));

    expect(snapshot.recentSales.availability).toBe("available");
    if (snapshot.recentSales.availability !== "available") return;
    expect(snapshot.recentSales.items).toEqual([
      {
        id: "10000000-0000-4000-8000-0000000000c1",
        invoiceNumber: "SAL-1",
        postedAt: "2026-07-16T09:15:00.000Z",
        customerName: "Walk-in customer",
        paymentMethod: "Split payment",
        totalMinor: 25_000,
        profit: {
          availability: "available",
          valueMinor: 10_000,
          meta: "Gross profit",
        },
        href: "/sales/10000000-0000-4000-8000-0000000000c1",
      },
      {
        id: "10000000-0000-4000-8000-0000000000c2",
        invoiceNumber: "SAL-2",
        postedAt: "2026-07-16T09:15:00.000Z",
        customerName: "Acme",
        paymentMethod: "Bank transfer",
        totalMinor: 25_000,
        profit: {
          availability: "redacted",
          message: "Profit visibility requires sales.view_profit.",
        },
        href: "/sales/10000000-0000-4000-8000-0000000000c2",
      },
    ]);
  });

  it("aggregates digital totals from balances and commission", async () => {
    const { service } = createService();
    const snapshot = await service.snapshot(context(FULL_PERMISSIONS));

    expect(snapshot.digitalServices.availability).toBe("available");
    if (snapshot.digitalServices.availability !== "available") return;
    const digital = snapshot.digitalServices.data;
    // sent = 60,000 + 40,000; received = 50,000 + 30,000 across providers.
    expect(digital.sentToday).toMatchObject({ valueMinor: 100_000 });
    expect(digital.receivedToday).toMatchObject({ valueMinor: 80_000 });
    expect(digital.customerFeesToday).toMatchObject({ valueMinor: 2_000 });
    // The "providerNetCommission" contract field carries the provider charge.
    expect(digital.providerNetCommission).toMatchObject({ valueMinor: 500 });
    expect(digital.netEarnings).toMatchObject({ valueMinor: 1_500 });
    expect(digital.pendingTransactions).toEqual({
      availability: "available",
      value: 0,
      meta: "Recorded instantly",
    });
    expect(digital.actionQueue).toEqual([]);
  });

  it("aggregates demand top-unmet and the reorder budget", async () => {
    const { service } = createService({
      topUnmet: [
        { key: `variant:${VARIANT_A}`, name: "iPhone 15", waitingQuantity: 3 },
        { key: "wording:pixel 9", name: "Pixel 9", waitingQuantity: 1 },
      ],
      reorder: { ...REORDER_REPORT, costCoverage: { costed: 2, total: 3 } },
    });

    const snapshot = await service.snapshot(context(FULL_PERMISSIONS));

    expect(snapshot.demandAndBuying.availability).toBe("available");
    if (snapshot.demandAndBuying.availability !== "available") return;
    const data = snapshot.demandAndBuying.data;
    expect(data.topUnmet).toEqual([
      {
        key: `variant:${VARIANT_A}`,
        name: "iPhone 15",
        waitingQuantity: 3,
        href: "/demand",
      },
      {
        key: "wording:pixel 9",
        name: "Pixel 9",
        waitingQuantity: 1,
        href: "/demand",
      },
    ]);
    // One suggested item is uncosted, so the budget is a partial value.
    expect(data.recommendedBudget).toMatchObject({
      availability: "partial",
      valueMinor: 150_000,
    });
    expect(data.expectedGrossProfit).toMatchObject({ valueMinor: 90_000 });
    // There is no server "selected investment" concept.
    expect(data.selectedInvestment).toMatchObject({
      availability: "unavailable",
      reason: "source_not_configured",
    });
  });

  it("renders empty live sources as real zeros, never a coming-soon stub", async () => {
    const { service } = createService({
      sales: salesPage([]),
      balances: EMPTY_BALANCES,
      commission: EMPTY_COMMISSION,
      topUnmet: [],
      summary: ZERO_SUMMARY,
      reorder: EMPTY_REORDER,
    });

    const snapshot = await service.snapshot(context(FULL_PERMISSIONS));

    expect(snapshot.moneyKpis[0].value).toEqual({
      availability: "available",
      valueMinor: 0,
      meta: "Posted sales revenue today",
    });
    expect(snapshot.recentSales).toEqual({
      availability: "available",
      items: [],
    });
    expect(snapshot.digitalServices.availability).toBe("available");
    if (snapshot.digitalServices.availability === "available") {
      expect(snapshot.digitalServices.data.sentToday).toMatchObject({
        valueMinor: 0,
      });
      expect(snapshot.digitalServices.data.netEarnings).toMatchObject({
        valueMinor: 0,
      });
    }
    expect(snapshot.demandAndBuying.availability).toBe("available");
    if (snapshot.demandAndBuying.availability === "available") {
      expect(snapshot.demandAndBuying.data.topUnmet).toEqual([]);
      expect(snapshot.demandAndBuying.data.recommendedBudget).toEqual({
        availability: "available",
        valueMinor: 0,
        meta: "Recommended reorder spend",
      });
    }
  });

  it("degrades a single failing source without failing the whole dashboard", async () => {
    const { service, mocks } = createService();
    mocks.balances.mockRejectedValue(new Error("provider read timed out"));

    const snapshot = await service.snapshot(context(FULL_PERMISSIONS));

    expect(snapshot.digitalServices).toEqual({
      availability: "unavailable",
      reason: "temporarily_unavailable",
      message: "Digital-service analytics are temporarily unavailable.",
    });
    // Every other live section still renders.
    expect(snapshot.recentSales.availability).toBe("available");
    expect(snapshot.moneyKpis[0].value.availability).toBe("available");
  });

  it("propagates the tenant, branch and posted-only scope to every source", async () => {
    const { service, mocks } = createService();
    await service.snapshot(context(FULL_PERMISSIONS));

    const salesArgs = mocks.list.mock.calls[0];
    expect(salesArgs?.[0]).toMatchObject({
      organizationId: IDS.organization,
      branchId: IDS.branch,
    });
    expect(salesArgs?.[1]).toMatchObject({ status: "posted", pageSize: 6 });

    expect(mocks.balances.mock.calls[0]?.[0]).toMatchObject({
      organizationId: IDS.organization,
      branchId: IDS.branch,
    });
    expect(mocks.commission.mock.calls[0]).toMatchObject([
      { organizationId: IDS.organization, branchId: IDS.branch },
      "day",
    ]);
    expect(mocks.position.mock.calls[0]?.[0]).toMatchObject({
      organizationId: IDS.organization,
      branchId: IDS.branch,
    });
    expect(mocks.topUnmet.mock.calls[0]).toMatchObject([
      { organizationId: IDS.organization, branchId: IDS.branch },
      4,
    ]);
  });

  it("does not query or leak source data when source permissions are absent", async () => {
    const { service, mocks } = createService();
    const snapshot = await service.snapshot(
      context([PERMISSIONS.REPORTS_VIEW]),
    );

    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.balances).not.toHaveBeenCalled();
    expect(mocks.position).not.toHaveBeenCalled();
    expect(mocks.topUnmet).not.toHaveBeenCalled();
    expect(snapshot.stockSummary.availability).toBe("redacted");
    expect(snapshot.moneyKpis[0].value.availability).toBe("redacted");
    expect(snapshot.moneyKpis[4].value.availability).toBe("redacted");
    expect(snapshot.moneyKpis[5].value.availability).toBe("redacted");
    expect(snapshot.attention.availability).toBe("redacted");
    expect(snapshot.recentSales.availability).toBe("redacted");
    expect(snapshot.demandAndBuying.availability).toBe("redacted");
    expect(snapshot.digitalServices.availability).toBe("redacted");
    // Tasks is genuinely unimplemented — coming soon regardless of grants.
    expect(snapshot.todaysTasks.availability).toBe("unavailable");
  });

  it("reports cash position as not-configured when no session is open", async () => {
    const { service } = createService({ position: null });

    const snapshot = await service.snapshot(context(FULL_PERMISSIONS));

    expect(snapshot.moneyKpis[4].value).toEqual({
      availability: "unavailable",
      reason: "source_not_configured",
      message: "No cash session is open. Open one from Daily Closing.",
    });
  });

  it("keeps stock live and valuation redacted without the cost grant", async () => {
    const { service, mocks } = createService();
    const snapshot = await service.snapshot(
      context([PERMISSIONS.INVENTORY_VIEW]),
    );

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(snapshot.stockSummary.availability).toBe("available");
    expect(snapshot.moneyKpis[5].value.availability).toBe("redacted");
  });

  it("reports a complete zero valuation as real zero rather than unavailable", async () => {
    const { service } = createService({
      inventoryRows: [
        {
          ...INVENTORY_ROW,
          onHandUnits: 0n,
          reservedUnits: 0n,
          availableUnits: 0n,
          valuedUnits: 0n,
          uncostedUnits: 0n,
          inventoryValueMinor: 0n,
          outOfStockVariantCount: 0n,
        },
      ],
    });
    const snapshot = await service.snapshot(
      context([
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_VIEW_COST,
        PERMISSIONS.REPORTS_VIEW_FINANCIAL,
      ]),
    );

    expect(snapshot.moneyKpis[5].value).toEqual({
      availability: "available",
      valueMinor: 0,
      meta: "At recorded landed cost",
      coverage: { valuedUnits: 0, uncostedUnits: 0 },
    });
  });

  it("fails closed when database aggregates violate the public invariants", async () => {
    const { service } = createService({
      inventoryRows: [
        {
          ...INVENTORY_ROW,
          onHandUnits: 1n,
          reservedUnits: 2n,
          availableUnits: 0n,
        },
      ],
    });

    await expect(
      service.snapshot(context([PERMISSIONS.INVENTORY_VIEW])),
    ).rejects.toThrow("Dashboard response violated its public contract");
  });
});

function summaryServiceWith(sums: {
  salesTotal: bigint;
  salesCogs: bigint;
  salesCount: number;
  serviceProfit: bigint;
  externalCount: number;
  expenses: bigint;
  discounts?: bigint;
  returns?: bigint;
}) {
  const sale = { aggregate: vi.fn() };
  const externalTransaction = { aggregate: vi.fn() };
  const expense = { aggregate: vi.fn() };
  const saleReturn = { aggregate: vi.fn() };
  sale.aggregate.mockResolvedValue({
    _sum: {
      totalMinor: sums.salesTotal,
      cogsMinor: sums.salesCogs,
      discountMinor: sums.discounts ?? 0n,
    },
    _count: sums.salesCount,
  });
  externalTransaction.aggregate.mockResolvedValue({
    _sum: { serviceProfitMinor: sums.serviceProfit },
    _count: sums.externalCount,
  });
  expense.aggregate.mockResolvedValue({ _sum: { amountMinor: sums.expenses } });
  saleReturn.aggregate.mockResolvedValue({
    _sum: { totalRefundMinor: sums.returns ?? 0n },
  });
  const prisma = {
    client: { sale, externalTransaction, expense, saleReturn },
  } as unknown as PrismaService;
  return { service: dashboardService(prisma), sale, expense, saleReturn };
}

describe("DashboardService.summary", () => {
  it("rolls up revenue, cost, service profit and expenses into estimated net profit", async () => {
    const { service } = summaryServiceWith({
      salesTotal: 500_000n,
      salesCogs: 300_000n,
      salesCount: 4,
      serviceProfit: 7_000n,
      externalCount: 3,
      expenses: 12_000n,
      discounts: 20_000n,
      returns: 8_000n,
    });

    const summary = await service.summary(
      context([PERMISSIONS.REPORTS_VIEW_FINANCIAL]),
      {
        period: "day",
        date: "2026-07-17",
      },
    );

    expect(summary).toEqual({
      period: "day",
      from: "2026-07-17",
      to: "2026-07-17",
      salesRevenueMinor: 500_000,
      discountsMinor: 20_000,
      returnsMinor: 8_000,
      // Net sales = revenue - posted returns.
      netSalesMinor: 492_000,
      cogsMinor: 300_000,
      grossProfitMinor: 200_000,
      serviceProfitMinor: 7_000,
      expensesMinor: 12_000,
      // 200,000 gross + 7,000 service - 12,000 expenses.
      estimatedNetProfitMinor: 195_000,
      salesCount: 4,
      externalTxnCount: 3,
    });
  });

  it("scopes every table to the tenant, branch and business-date window", async () => {
    const { service, sale, expense } = summaryServiceWith({
      salesTotal: 0n,
      salesCogs: 0n,
      salesCount: 0,
      serviceProfit: 0n,
      externalCount: 0,
      expenses: 0n,
    });

    // 2026-07-17 is a Friday: the ISO week runs Mon 13th .. Sun 19th.
    const week = await service.summary(
      context([PERMISSIONS.REPORTS_VIEW_FINANCIAL]),
      {
        period: "week",
        date: "2026-07-17",
      },
    );
    expect({ from: week.from, to: week.to }).toEqual({
      from: "2026-07-13",
      to: "2026-07-19",
    });

    const saleWhere = sale.aggregate.mock.calls[0]?.[0]?.where as {
      organizationId: string;
      branchId: string;
      businessDate: { gte: Date; lte: Date };
    };
    expect(saleWhere.organizationId).toBe(IDS.organization);
    expect(saleWhere.branchId).toBe(IDS.branch);
    expect(saleWhere.businessDate.gte).toEqual(
      new Date("2026-07-13T00:00:00.000Z"),
    );
    expect(saleWhere.businessDate.lte).toEqual(
      new Date("2026-07-19T00:00:00.000Z"),
    );

    const month = await service.summary(
      context([PERMISSIONS.REPORTS_VIEW_FINANCIAL]),
      {
        period: "month",
        date: "2026-07-17",
      },
    );
    expect({ from: month.from, to: month.to }).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    const expenseWhere = expense.aggregate.mock.calls[1]?.[0]?.where as {
      businessDate: { gte: Date; lte: Date };
    };
    expect(expenseWhere.businessDate.gte).toEqual(
      new Date("2026-07-01T00:00:00.000Z"),
    );
    expect(expenseWhere.businessDate.lte).toEqual(
      new Date("2026-07-31T00:00:00.000Z"),
    );
  });
});

interface TrendGroupRow {
  readonly businessDate: Date | null;
  readonly _sum: { totalMinor: bigint | null; cogsMinor: bigint | null };
  readonly _count: { _all: number };
}

function trendServiceWith(rows: readonly TrendGroupRow[]) {
  const groupBy = vi.fn().mockResolvedValue(rows);
  const prisma = {
    client: { sale: { groupBy } },
  } as unknown as PrismaService;
  return { service: dashboardService(prisma), groupBy };
}

describe("DashboardService.salesTrend (Asia/Karachi business date)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves a 20:30Z instant to the next Karachi business date and includes it in the day report", async () => {
    // 2026-07-16T20:30Z is 2026-07-17 01:30 in Asia/Karachi (UTC+5).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T20:30:00.000Z"));
    const { service, groupBy } = trendServiceWith([
      {
        businessDate: new Date("2026-07-17T00:00:00.000Z"),
        _sum: { totalMinor: 500_000n, cogsMinor: 300_000n },
        _count: { _all: 4 },
      },
    ]);

    const trend = await service.salesTrend(
      context([PERMISSIONS.REPORTS_VIEW_FINANCIAL]),
      1,
    );

    expect({ from: trend.from, to: trend.to }).toEqual({
      from: "2026-07-17",
      to: "2026-07-17",
    });
    expect(trend.points).toEqual([
      {
        businessDate: "2026-07-17",
        salesRevenueMinor: 500_000,
        cogsMinor: 300_000,
        grossProfitMinor: 200_000,
        salesCount: 4,
      },
    ]);
    const where = groupBy.mock.calls[0]?.[0]?.where as {
      businessDate: { gte: Date; lte: Date };
    };
    expect(where.businessDate.gte).toEqual(
      new Date("2026-07-17T00:00:00.000Z"),
    );
    expect(where.businessDate.lte).toEqual(
      new Date("2026-07-17T00:00:00.000Z"),
    );
  });

  it("builds a contiguous forward window that never shifts backward under UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T06:00:00.000Z"));
    const { service } = trendServiceWith([
      {
        businessDate: new Date("2026-07-15T00:00:00.000Z"),
        _sum: { totalMinor: 120_000n, cogsMinor: 70_000n },
        _count: { _all: 2 },
      },
    ]);

    const trend = await service.salesTrend(
      context([PERMISSIONS.REPORTS_VIEW_FINANCIAL]),
      7,
    );

    // The window runs forward from today: 11th..17th, inclusive of today.
    expect({ from: trend.from, to: trend.to }).toEqual({
      from: "2026-07-11",
      to: "2026-07-17",
    });
    expect(trend.points).toHaveLength(7);
    expect(trend.points[0]?.businessDate).toBe("2026-07-11");
    expect(trend.points[6]?.businessDate).toBe("2026-07-17");
    expect(
      trend.points.find((point) => point.businessDate === "2026-07-15"),
    ).toEqual({
      businessDate: "2026-07-15",
      salesRevenueMinor: 120_000,
      cogsMinor: 70_000,
      grossProfitMinor: 50_000,
      salesCount: 2,
    });
    // Every day without posted sales is an explicit zero, never a gap.
    expect(trend.points.filter((point) => point.salesCount === 0)).toHaveLength(
      6,
    );
  });
});

function topProductsServiceWith(rows: readonly unknown[]) {
  const queryRaw = vi.fn().mockResolvedValue(rows);
  const prisma = {
    client: { $queryRaw: queryRaw },
  } as unknown as PrismaService;
  return { service: dashboardService(prisma), queryRaw };
}

describe("DashboardService.topProducts (Asia/Karachi business date)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters posted sale lines by the Karachi month range without shifting backward", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T06:00:00.000Z"));
    const { service, queryRaw } = topProductsServiceWith([
      {
        productVariantId: IDS.location,
        name: "Test Phone",
        sku: "SKU-1",
        unitsSold: 6n,
        revenueMinor: 600_000n,
        cogsMinor: 360_000n,
        grossProfitMinor: 240_000n,
      },
    ]);

    const report = await service.topProducts(
      context([PERMISSIONS.REPORTS_VIEW_FINANCIAL]),
      "month",
      5,
    );

    expect({ from: report.from, to: report.to }).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(report.items).toEqual([
      {
        productVariantId: IDS.location,
        name: "Test Phone",
        sku: "SKU-1",
        unitsSold: 6,
        revenueMinor: 600_000,
        cogsMinor: 360_000,
        grossProfitMinor: 240_000,
      },
    ]);
    const sql = queryRaw.mock.calls[0]?.[0] as { readonly values: unknown[] };
    expect(sql.values).toContain("2026-07-01");
    expect(sql.values).toContain("2026-07-31");
    // Tenant + branch are bound as query parameters (isolation proxy at the unit
    // level; a static $queryRaw mock cannot execute the WHERE — the orchestrator's
    // live server check exercises the real filter).
    expect(sql.values).toContain(IDS.organization);
    expect(sql.values).toContain(IDS.branch);
    expect(sql.values).not.toContain(TENANT_B.organization);
  });
});

interface SeededDay {
  readonly organizationId: string;
  readonly branchId: string;
  readonly businessDate: string;
  readonly totalMinor: bigint;
  readonly cogsMinor: bigint;
  readonly count: number;
}

/**
 * A `sale.groupBy` mock that actually honours the `where` it is given, so the
 * test fails if the service ever drops the tenant/branch/business-date filter.
 */
function filteringTrendServiceWith(seeded: readonly SeededDay[]) {
  const groupBy = vi.fn().mockImplementation((args: unknown) => {
    const where = (
      args as {
        where: {
          organizationId: string;
          branchId: string;
          businessDate: { gte: Date; lte: Date };
        };
      }
    ).where;
    const matched = seeded.filter((row) => {
      const instant = new Date(`${row.businessDate}T00:00:00.000Z`);
      return (
        row.organizationId === where.organizationId &&
        row.branchId === where.branchId &&
        instant >= where.businessDate.gte &&
        instant <= where.businessDate.lte
      );
    });
    return Promise.resolve(
      matched.map((row) => ({
        businessDate: new Date(`${row.businessDate}T00:00:00.000Z`),
        _sum: { totalMinor: row.totalMinor, cogsMinor: row.cogsMinor },
        _count: { _all: row.count },
      })),
    );
  });
  const prisma = {
    client: { sale: { groupBy } },
  } as unknown as PrismaService;
  return { service: dashboardService(prisma), groupBy };
}

describe("DashboardService.salesTrend (tenant isolation and money cross-check)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aggregates only the caller's tenant/branch and totals exactly the seeded rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T06:00:00.000Z"));
    const seeded: readonly SeededDay[] = [
      {
        organizationId: IDS.organization,
        branchId: IDS.branch,
        businessDate: "2026-07-16",
        totalMinor: 200_000n,
        cogsMinor: 120_000n,
        count: 2,
      },
      {
        organizationId: IDS.organization,
        branchId: IDS.branch,
        businessDate: "2026-07-17",
        totalMinor: 500_000n,
        cogsMinor: 300_000n,
        count: 3,
      },
      // Tenant B, identical dates — must never surface in tenant A's report.
      {
        organizationId: TENANT_B.organization,
        branchId: TENANT_B.branch,
        businessDate: "2026-07-16",
        totalMinor: 999_000n,
        cogsMinor: 1_000n,
        count: 9,
      },
      {
        organizationId: TENANT_B.organization,
        branchId: TENANT_B.branch,
        businessDate: "2026-07-17",
        totalMinor: 888_000n,
        cogsMinor: 2_000n,
        count: 8,
      },
    ];
    const { service } = filteringTrendServiceWith(seeded);

    const trend = await service.salesTrend(
      context([PERMISSIONS.REPORTS_VIEW_FINANCIAL]),
      2,
    );

    // Expected total computed independently by reducing tenant A's fixtures.
    const expectedRevenue = seeded
      .filter(
        (row) =>
          row.organizationId === IDS.organization &&
          row.branchId === IDS.branch,
      )
      .reduce((sum, row) => sum + Number(row.totalMinor), 0);
    const actualRevenue = trend.points.reduce(
      (sum, point) => sum + point.salesRevenueMinor,
      0,
    );
    expect(actualRevenue).toBe(expectedRevenue);
    expect(actualRevenue).toBe(700_000);
    expect(
      trend.points.find((point) => point.businessDate === "2026-07-17")
        ?.salesRevenueMinor,
    ).toBe(500_000);
    // No tenant-B amount leaks in.
    expect(
      trend.points.some(
        (point) =>
          point.salesRevenueMinor === 999_000 ||
          point.salesRevenueMinor === 888_000,
      ),
    ).toBe(false);
  });
});

interface ReorderRawFixture {
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
  readonly demandOpenCount: bigint;
}

// The reorder engine now derives open matched demand inside its single scoped
// raw aggregate (a `demand_open` CTE), so it no longer issues a separate
// `demandRequestItem.groupBy`. The fixture supplies `demandOpenCount` on the raw
// row and the mock only needs `$queryRaw`.
function reorderServiceWith(rawRows: readonly ReorderRawFixture[]) {
  const queryRaw = vi.fn().mockResolvedValue(rawRows);
  const prisma = {
    client: { $queryRaw: queryRaw },
  } as unknown as PrismaService;
  return { service: dashboardService(prisma), queryRaw };
}

describe("DashboardService.reorderSuggestions (scoping and money cross-check)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("binds tenant/branch/window and returns money exactly derived from the fixture", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T06:00:00.000Z"));
    const { service, queryRaw } = reorderServiceWith([
      {
        productVariantId: VARIANT_A,
        name: "Reorder Phone",
        sku: "RP-1",
        reorderPoint: null,
        casePackSize: null,
        onHandUnits: 0n,
        reservedUnits: 0n,
        availableUnits: 0n,
        costedUnits: 10n,
        costedValueMinor: 50_000n, // unit landed cost = 5,000
        windowUnitsSold: 30n, // 30 sold over a 30-day window -> velocity 1/day
        windowRevenueMinor: 300_000n,
        windowProfitMinor: 90_000n, // unit profit = 3,000
        demandOpenCount: 2n, // open matched demand, joined in the raw aggregate
      },
    ]);

    const report = await service.reorderSuggestions(
      context([PERMISSIONS.RECOMMENDATIONS_VIEW]),
      30,
      20,
    );

    // Independent hand-computation from the fixture:
    //   velocity 1/day * 30 cover days = target 30; available 0 -> qty 30
    //   unit cost 50,000/10 = 5,000 -> est cost 30 * 5,000 = 150,000
    //   unit profit 90,000/30 = 3,000 -> exp profit 30 * 3,000 = 90,000
    expect(report.suggestions).toHaveLength(1);
    const suggestion = report.suggestions[0];
    expect(suggestion?.recommendedQty).toBe(30);
    expect(suggestion?.unitLandedCostMinor).toBe(5_000);
    expect(suggestion?.estCostMinor).toBe(150_000);
    expect(suggestion?.expProfitMinor).toBe(90_000);
    expect(suggestion?.roiBasisPoints).toBe(6_000);
    expect(suggestion?.demandOpenCount).toBe(2);
    expect(suggestion?.confidence).toBe("high");
    expect(report.totalEstCostMinor).toBe(150_000);
    expect(report.totalExpProfitMinor).toBe(90_000);
    expect(report.costCoverage).toEqual({ costed: 1, total: 1 });

    // Tenant + branch + window are bound into the single scoped raw aggregate,
    // which now includes the open-demand CTE (no separate group-by is issued).
    const sql = queryRaw.mock.calls[0]?.[0] as { readonly values: unknown[] };
    expect(sql.values).toContain(IDS.organization);
    expect(sql.values).toContain(IDS.branch);
    expect(sql.values).toContain("2026-07-17");
    expect(sql.values).not.toContain(TENANT_B.organization);
  });
});
