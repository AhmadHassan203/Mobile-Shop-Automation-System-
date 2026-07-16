import { describe, expect, it } from "vitest";
import {
  DASHBOARD_MONEY_KPI_KEYS,
  DashboardLinkSchema,
  DashboardMoneyValueSchema,
  DashboardSnapshotSchema,
} from "./dashboard";

const unavailable = {
  availability: "unavailable" as const,
  reason: "source_not_built" as const,
  message: "The source module is not built yet.",
};

function snapshot() {
  const definitions = [
    "Posted sales for the current business day.",
    "Posted sales less recorded cost of goods sold.",
    "Approved operating expenses for the current business day.",
    "Gross profit less approved operating expenses.",
    "Counted cash in the current open cash session.",
    "On-hand inventory valued at recorded landed cost.",
  ];
  const labels = [
    "Sales today",
    "Gross profit",
    "Expenses",
    "Net operating",
    "Cash position",
    "Inventory value",
  ] as const;
  const hrefs = [
    "/finance",
    "/finance",
    "/finance",
    "/finance",
    "/closing",
    "/stock",
  ] as const;

  return {
    asOf: "2026-07-16T08:00:00.000Z",
    businessDate: "2026-07-16",
    moneyKpis: DASHBOARD_MONEY_KPI_KEYS.map((key, index) => ({
      key,
      label: labels[index],
      href: hrefs[index],
      definition: definitions[index],
      value: unavailable,
    })),
    attention: { availability: "available", items: [] },
    recentSales: unavailable,
    demandAndBuying: unavailable,
    digitalServices: unavailable,
    todaysTasks: unavailable,
    stockSummary: {
      availability: "available",
      data: {
        onHandUnits: 5,
        reservedUnits: 2,
        availableUnits: 3,
        outOfStockVariantCount: 1,
      },
    },
  };
}

describe("dashboard contracts", () => {
  it("accepts the exact six-tile prototype order", () => {
    expect(DashboardSnapshotSchema.parse(snapshot()).moneyKpis).toHaveLength(6);
  });

  it("prevents an unavailable or redacted value from carrying money", () => {
    expect(
      DashboardMoneyValueSchema.safeParse({ ...unavailable, valueMinor: 0 })
        .success,
    ).toBe(false);
    expect(
      DashboardMoneyValueSchema.safeParse({
        availability: "redacted",
        message: "Profit is restricted.",
        valueMinor: 123,
      }).success,
    ).toBe(false);
  });

  it("accepts closed dashboard routes and sale UUID drilldowns only", () => {
    expect(DashboardLinkSchema.safeParse("/purchases?tab=orders").success).toBe(
      true,
    );
    expect(
      DashboardLinkSchema.safeParse(
        "/sales/10000000-0000-4000-8000-000000000001",
      ).success,
    ).toBe(true);
    expect(DashboardLinkSchema.safeParse("https://example.com").success).toBe(
      false,
    );
    expect(DashboardLinkSchema.safeParse("/admin/secrets").success).toBe(false);
  });

  it("rejects inconsistent stock arithmetic", () => {
    const value = snapshot();
    value.stockSummary.data.availableUnits = 6;
    expect(DashboardSnapshotSchema.safeParse(value).success).toBe(false);
  });
});
