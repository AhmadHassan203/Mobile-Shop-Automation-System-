import {
  PERMISSIONS,
  type DailyFinancialSummary,
  type DashboardSnapshot,
} from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query/keys";
import { FinanceWorkspace } from "./finance-workspace";

const SUMMARY: DailyFinancialSummary = {
  period: "day",
  from: "2026-07-16",
  to: "2026-07-16",
  salesRevenueMinor: 500_000,
  discountsMinor: 20_000,
  returnsMinor: 8_000,
  netSalesMinor: 492_000,
  cogsMinor: 300_000,
  grossProfitMinor: 200_000,
  serviceProfitMinor: 7_000,
  expensesMinor: 12_000,
  estimatedNetProfitMinor: 195_000,
  salesCount: 4,
  externalTxnCount: 3,
};

function moneyValue(valueMinor: number, meta: string) {
  return { availability: "available" as const, valueMinor, meta };
}

const SNAPSHOT: DashboardSnapshot = {
  asOf: "2026-07-16T09:30:00.000Z",
  businessDate: "2026-07-16",
  moneyKpis: [
    { key: "sales_today", label: "Sales today", href: "/finance", definition: "x", value: moneyValue(500_000, "x") },
    { key: "gross_profit", label: "Gross profit", href: "/finance", definition: "x", value: moneyValue(200_000, "x") },
    { key: "expenses", label: "Expenses", href: "/finance", definition: "x", value: moneyValue(12_000, "x") },
    { key: "net_operating", label: "Net operating", href: "/finance", definition: "x", value: moneyValue(195_000, "x") },
    { key: "cash_position", label: "Cash position", href: "/closing", definition: "x", value: moneyValue(75_000, "Expected drawer · session CS-1") },
    { key: "inventory_value", label: "Inventory value", href: "/stock", definition: "x", value: moneyValue(2_500_000, "x") },
  ],
  attention: { availability: "partial", items: [], message: "x" },
  recentSales: { availability: "available", items: [] },
  demandAndBuying: {
    availability: "available",
    data: {
      topUnmet: [],
      recommendedBudget: moneyValue(0, "x"),
      selectedInvestment: { availability: "unavailable", reason: "source_not_configured", message: "x" },
      expectedGrossProfit: moneyValue(0, "x"),
    },
  },
  digitalServices: {
    availability: "available",
    data: {
      sentToday: moneyValue(100_000, "x"),
      receivedToday: moneyValue(80_000, "x"),
      customerFeesToday: moneyValue(2_000, "x"),
      providerNetCommission: moneyValue(500, "x"),
      netEarnings: moneyValue(1_500, "x"),
      pendingTransactions: { availability: "available", value: 0, meta: "x" },
      actionQueue: [],
    },
  },
  todaysTasks: { availability: "unavailable", reason: "source_not_built", message: "x" },
  stockSummary: {
    availability: "available",
    data: { onHandUnits: 5, reservedUnits: 1, availableUnits: 4, outOfStockVariantCount: 0 },
  },
};

function render(permissions: readonly string[]): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKeys.currentAuth, {
    user: { id: "22222222-2222-4222-8222-222222222222", email: "o@e.com", fullName: "Owner", phone: null, mustChangePassword: false },
    organization: { id: "33333333-3333-4333-8333-333333333333", name: "Shop", currency: "PKR", timezone: "Asia/Karachi" },
    branch: { id: "44444444-4444-4444-8444-444444444444", code: "MAIN", name: "Main" },
    roles: ["owner"],
    permissions,
    scopes: [],
    session: { expiresAt: "2026-07-17T00:00:00.000Z" },
  });
  client.setQueryData(queryKeys.dashboardSummary({ period: "day" }), SUMMARY);
  client.setQueryData(queryKeys.dashboard, SNAPSHOT);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(FinanceWorkspace),
    ),
  );
}

const FINANCE_PERMISSIONS = [
  PERMISSIONS.REPORTS_VIEW_FINANCIAL,
  PERMISSIONS.EXPENSES_VIEW,
  PERMISSIONS.CASH_SESSIONS_VIEW,
  PERMISSIONS.EXTERNAL_SERVICES_VIEW,
];

describe("FinanceWorkspace", () => {
  it("renders every card from the live read models, with no obsolete pending copy", () => {
    const html = render(FINANCE_PERMISSIONS);

    // The obsolete placeholder copy must never reappear.
    for (const stale of [
      "Sales ledger pending",
      "Margin analytics pending",
      "Expense ledger pending",
      "Finance read model pending",
      "Settlement API pending",
      "stay blank until",
      "Sales and Settlement APIs exist",
    ]) {
      expect(html).not.toContain(stale);
    }

    // Financial KPIs + P&L are live.
    for (const label of [
      "Sales revenue",
      "Gross profit",
      "Operating expenses",
      "Estimated net operating",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("PKR 5,000.00"); // sales revenue 500,000 minor
    expect(html).toContain("PKR 2,000.00"); // gross profit 200,000 minor

    // Contra-revenue memo populated (discounts / returns / net sales).
    expect(html).toContain("Discounts given today");
    expect(html).toContain("Net sales after returns");
    expect(html).toContain("PKR 4,920.00"); // net sales 492,000 minor

    // Digital + cash from the shared dashboard snapshot.
    expect(html).toContain("Digital sent");
    expect(html).toContain("Net digital earnings");
    expect(html).toContain("Provider charges");
    expect(html).toContain("Cash position");
    expect(html).toContain("PKR 750.00"); // cash position 75,000 minor
  });

  it("does not send a financial request without the reports.view_financial grant", () => {
    const html = render([PERMISSIONS.EXPENSES_VIEW]);
    expect(html).toContain("Financial summary not permitted");
    // The obsolete pending copy still must never appear.
    expect(html).not.toContain("Finance read model pending");
  });
});
