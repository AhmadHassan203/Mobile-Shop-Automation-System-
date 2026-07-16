import type { DashboardSnapshot } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { getDashboard } from "./dashboard";

const unavailable = {
  availability: "unavailable",
  reason: "source_not_built",
  message: "This source is not built yet.",
} as const;

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
      value: unavailable,
    },
    {
      key: "expenses",
      label: "Expenses",
      href: "/finance",
      definition: "Approved expenses in the current business day.",
      value: unavailable,
    },
    {
      key: "net_operating",
      label: "Net operating",
      href: "/finance",
      definition: "Gross profit less approved operating expenses.",
      value: unavailable,
    },
    {
      key: "cash_position",
      label: "Cash position",
      href: "/closing",
      definition: "Expected drawer cash in open sessions.",
      value: unavailable,
    },
    {
      key: "inventory_value",
      label: "Inventory value",
      href: "/stock",
      definition: "On-hand stock valued at recorded cost.",
      value: unavailable,
    },
  ],
  attention: unavailable,
  recentSales: unavailable,
  demandAndBuying: unavailable,
  digitalServices: unavailable,
  todaysTasks: unavailable,
  stockSummary: unavailable,
};

function clientFor(payload: unknown) {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    client: new ApiClient("https://api.test/api/v1", { fetcher }),
    fetcher,
  };
}

describe("dashboard API", () => {
  it("loads the complete snapshot through one canonical reports request", async () => {
    const { client, fetcher } = clientFor(snapshot);

    await expect(getDashboard(undefined, client)).resolves.toEqual(snapshot);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/reports/dashboard");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
  });

  it("rejects extra tenant fields instead of trusting an expanded response", async () => {
    const { client } = clientFor({
      ...snapshot,
      organizationId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(getDashboard(undefined, client)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects unsafe money values and never renders them as dashboard data", async () => {
    const { client } = clientFor({
      ...snapshot,
      moneyKpis: snapshot.moneyKpis.map((item, index) =>
        index === 0
          ? {
              ...item,
              value: {
                availability: "available",
                valueMinor: Number.MAX_SAFE_INTEGER + 1,
                meta: "invalid",
              },
            }
          : item,
      ),
    });

    await expect(getDashboard(undefined, client)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
