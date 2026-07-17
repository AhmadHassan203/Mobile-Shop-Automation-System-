import { PERMISSIONS, type DashboardSnapshot } from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import {
  dashboardErrorMessage,
  dashboardGreeting,
  WorkspaceDashboard,
} from "./workspace-dashboard";

const SALE_ID = "11111111-1111-4111-8111-111111111111";

const snapshot: DashboardSnapshot = {
  asOf: "2026-07-16T09:30:00.000Z",
  businessDate: "2026-07-16",
  moneyKpis: [
    {
      key: "sales_today",
      label: "Sales today",
      href: "/finance",
      definition: "Posted sales in the current business day.",
      value: {
        availability: "available",
        valueMinor: 123_456,
        meta: "vs yesterday",
        trendBasisPoints: 840,
      },
    },
    {
      key: "gross_profit",
      label: "Gross profit",
      href: "/finance",
      definition: "Posted sales revenue less recorded cost.",
      value: {
        availability: "redacted",
        message: "Profit visibility is not granted.",
      },
    },
    {
      key: "expenses",
      label: "Expenses",
      href: "/finance",
      definition: "Approved expenses in the current business day.",
      value: {
        availability: "unavailable",
        reason: "source_not_built",
        message: "The expense source is not built.",
      },
    },
    {
      key: "net_operating",
      label: "Net operating",
      href: "/finance",
      definition: "Gross profit less approved operating expenses.",
      value: {
        availability: "partial",
        valueMinor: 80_000,
        meta: "estimated",
        message: "Some source records are incomplete.",
      },
    },
    {
      key: "cash_position",
      label: "Cash position",
      href: "/closing",
      definition: "Expected drawer cash in open sessions.",
      value: {
        availability: "available",
        valueMinor: 50_000,
        meta: "drawer · session open",
      },
    },
    {
      key: "inventory_value",
      label: "Inventory value",
      href: "/stock",
      definition: "On-hand stock valued at recorded cost.",
      value: {
        availability: "available",
        valueMinor: 2_500_000,
        meta: "at recorded cost",
        coverage: { valuedUnits: 4, uncostedUnits: 0 },
      },
    },
  ],
  attention: {
    availability: "partial",
    message: "Sales attention is not available yet.",
    items: [
      {
        id: "second",
        rank: 2,
        severity: "warning",
        title: "Second ranked item",
        detail: "Review a delayed purchase order.",
        href: "/purchases?tab=orders",
      },
      {
        id: "first",
        rank: 1,
        severity: "negative",
        title: "First ranked item",
        detail: "A product is out of stock.",
        href: "/stock",
      },
    ],
  },
  recentSales: {
    availability: "available",
    items: [
      {
        id: SALE_ID,
        invoiceNumber: "SAL-000123",
        postedAt: "2026-07-16T09:15:00.000Z",
        customerName: "Walk-in customer",
        paymentMethod: "Cash",
        totalMinor: 25_000,
        profit: {
          availability: "redacted",
          message: "Profit visibility is not granted.",
        },
        href: `/sales/${SALE_ID}`,
      },
    ],
  },
  demandAndBuying: {
    availability: "partial",
    message: "Recommendation scoring is incomplete.",
    data: {
      topUnmet: [
        {
          key: "iphone-15-blue",
          name: "iPhone 15 · Blue",
          waitingQuantity: 3,
          href: "/demand",
        },
      ],
      recommendedBudget: {
        availability: "available",
        valueMinor: 500_000,
        meta: "approved budget",
      },
      selectedInvestment: {
        availability: "unavailable",
        reason: "source_not_configured",
        message: "No buying plan is configured.",
      },
      expectedGrossProfit: {
        availability: "partial",
        valueMinor: 75_000,
        meta: "current selections",
        message: "Some variants do not have a recorded cost.",
      },
    },
  },
  digitalServices: {
    availability: "available",
    data: {
      sentToday: {
        availability: "available",
        valueMinor: 100_000,
        meta: "settled principal",
      },
      receivedToday: {
        availability: "available",
        valueMinor: 80_000,
        meta: "settled principal",
      },
      customerFeesToday: {
        availability: "available",
        valueMinor: 2_000,
        meta: "settled fees",
      },
      providerNetCommission: {
        availability: "available",
        valueMinor: 1_000,
        meta: "settled commission",
      },
      netEarnings: {
        availability: "available",
        valueMinor: 3_000,
        meta: "fees plus commission",
      },
      pendingTransactions: {
        availability: "available",
        value: 2,
        meta: "awaiting settlement",
      },
      actionQueue: [
        {
          id: "digital-pending",
          rank: 1,
          severity: "warning",
          title: "Pending digital transactions",
          detail: "Two transactions await settlement.",
          href: "/digital/history",
        },
      ],
    },
  },
  todaysTasks: {
    availability: "available",
    items: [
      {
        id: "task-1",
        title: "Follow up with supplier",
        dueLabel: "Today",
        priority: "high",
        href: "/tasks",
      },
    ],
  },
  stockSummary: {
    availability: "available",
    data: {
      onHandUnits: 5,
      reservedUnits: 1,
      availableUnits: 4,
      outOfStockVariantCount: 2,
    },
  },
};

function renderDashboard(
  permissions: readonly string[],
  value: DashboardSnapshot = snapshot,
): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKeys.currentAuth, {
    user: {
      id: "22222222-2222-4222-8222-222222222222",
      email: "owner@example.com",
      fullName: "Haseeb",
      phone: null,
      mustChangePassword: false,
    },
    organization: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Al-Madina Mobiles",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
    branch: {
      id: "44444444-4444-4444-8444-444444444444",
      code: "MAIN",
      name: "Main branch",
    },
    roles: ["owner"],
    permissions,
    scopes: [],
    session: { expiresAt: "2026-07-17T00:00:00.000Z" },
  });
  client.setQueryData(queryKeys.dashboard, value);

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(WorkspaceDashboard),
    ),
  );
}

describe("dashboard helpers", () => {
  it("uses the shop timezone for a time-aware greeting", () => {
    expect(dashboardGreeting(new Date("2026-07-16T08:00:00Z"), "UTC")).toBe(
      "Good morning",
    );
    expect(dashboardGreeting(new Date("2026-07-16T14:00:00Z"), "UTC")).toBe(
      "Good afternoon",
    );
    expect(dashboardGreeting(new Date("2026-07-16T18:00:00Z"), "UTC")).toBe(
      "Good evening",
    );
    expect(dashboardGreeting(new Date(), "Not/A_Timezone")).toBe("Good day");
  });

  it("keeps API failure copy honest and specific", () => {
    expect(
      dashboardErrorMessage(
        new ApiError("offline", { code: "NETWORK_ERROR" }),
      ),
    ).toContain("No dashboard figures have been inferred");
    expect(
      dashboardErrorMessage(
        new ApiError("invalid", { code: "INVALID_RESPONSE" }),
      ),
    ).toContain("No unvalidated figures are shown");
  });
});

describe("WorkspaceDashboard", () => {
  const actionPermissions = [
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.DEMAND_CREATE,
    PERMISSIONS.RECOMMENDATIONS_VIEW,
    PERMISSIONS.EXTERNAL_SERVICES_RECORD,
  ];

  it("matches the prototype structure with six stable KPI tiles and live sections", () => {
    const html = renderDashboard(actionPermissions);

    expect(html.match(/min-h-32/g)).toHaveLength(6);
    for (const label of [
      "Sales today",
      "Gross profit",
      "Expenses",
      "Net operating",
      "Cash position",
      "Inventory value",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("PKR 1,234.56");
    expect(html).toContain("Needs your attention");
    expect(html).toContain("Recent sales");
    expect(html).toContain("Demand &amp; buying");
    expect(html).toContain("Digital Services");
    expect(html).toContain("Today&#x27;s tasks");
    expect(html).not.toContain("Live stock loaded");
  });

  it("renders ranking, per-sale links, action queues, and distinct coverage states", () => {
    const html = renderDashboard(actionPermissions);

    expect(html.indexOf("First ranked item")).toBeLessThan(
      html.indexOf("Second ranked item"),
    );
    expect(html).toContain(`href="/sales/${SALE_ID}"`);
    expect(html).toContain("SAL-000123");
    expect(html).toContain("Pending digital transactions");
    expect(html).toContain("Follow up with supplier");
    expect(html).toContain("Partial");
    expect(html).toContain("Restricted");
    // Distinct unavailable states are never conflated: the expenses KPI source
    // is not built (Coming soon) and the buying plan is not set up.
    expect(html).toContain("Coming soon");
    expect(html).toContain("Not configured");
    expect(html).not.toContain("Provider net commission");
  });

  it("hides write and recommendation actions when permissions are absent", () => {
    const html = renderDashboard([PERMISSIONS.REPORTS_VIEW]);

    expect(html).not.toContain("Record demand");
    expect(html).not.toContain("New sale");
    expect(html).not.toContain("Review buying plan");
    expect(html).not.toContain("Record digital service");
    expect(html).not.toContain("New transaction");
  });

  it("shows confirmed empty states without inventing records or counts", () => {
    if (!("data" in snapshot.demandAndBuying)) {
      throw new Error("The test fixture must include demand data.");
    }
    if (!("data" in snapshot.digitalServices)) {
      throw new Error("The test fixture must include digital-service data.");
    }
    const emptySnapshot: DashboardSnapshot = {
      ...snapshot,
      attention: { availability: "available", items: [] },
      recentSales: { availability: "available", items: [] },
      demandAndBuying: {
        availability: "available",
        data: { ...snapshot.demandAndBuying.data, topUnmet: [] },
      },
      digitalServices: {
        availability: "available",
        data: { ...snapshot.digitalServices.data, actionQueue: [] },
      },
      todaysTasks: { availability: "available", items: [] },
    };
    const html = renderDashboard(actionPermissions, emptySnapshot);

    expect(html).toContain("Nothing needs your attention in this snapshot");
    expect(html).toContain("No sales have been posted");
    expect(html).toContain("No unmet customer requests");
    expect(html).toContain("No digital-service action items");
    expect(html).toContain("No tasks are due");
  });
});
