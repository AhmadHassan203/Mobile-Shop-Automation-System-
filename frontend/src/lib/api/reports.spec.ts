import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  getReorderSuggestions,
  getTopBrands,
  getTrendingProducts,
  reorderReportSchema,
} from "./reports";

const VARIANT_ID = "20000000-0000-4000-8000-000000000001";
const BRAND_ID = "30000000-0000-4000-8000-000000000002";

function clientFor(payload: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  return { client: new ApiClient("https://api.test/api/v1", { fetcher }), fetcher };
}

const REORDER = {
  windowDays: 30,
  generatedAt: "2026-07-18T06:00:00.000Z",
  businessDate: "2026-07-18",
  signal: "recommendations",
  earlySignal: true,
  analysis: {
    analyzedVariants: 2,
    variantsWithSales: 1,
    variantsWithStock: 2,
    variantsWithDemand: 0,
    windowUnitsSold: 3,
  },
  totalEstCostMinor: 150_000,
  totalExpProfitMinor: 90_000,
  costCoverage: { costed: 1, total: 1 },
  suggestions: [],
};

const TRENDING = {
  windowDays: 30,
  from: "2026-06-18",
  to: "2026-07-18",
  previousFrom: "2026-05-19",
  previousTo: "2026-06-17",
  rankingBasis: "Ranked by recent units, frequency and growth.",
  earlySignal: true,
  items: [
    {
      productVariantId: VARIANT_ID,
      name: "Galaxy A15",
      sku: "GAL-A15",
      unitsSold: 3,
      revenueMinor: 99_000,
      grossProfitMinor: 12_000,
      salesCount: 2,
      demandOpenCount: 1,
      previousUnitsSold: 0,
      growthBasisPoints: null,
      isNew: true,
      trendScore: 500,
    },
  ],
};

const TOP_BRANDS = {
  period: "month",
  from: "2026-07-01",
  to: "2026-07-18",
  rankingBasis: "Ranked by posted-sales revenue.",
  earlySignal: false,
  items: [
    {
      brandId: BRAND_ID,
      brandName: "Samsung",
      unitsSold: 10,
      revenueMinor: 500_000,
      grossProfitMinor: 60_000,
      salesCount: 5,
      productCount: 3,
    },
  ],
};

describe("reports intelligence API", () => {
  it("parses the reorder report including signal, earlySignal and analysis", async () => {
    const { client } = clientFor(REORDER);
    const report = await getReorderSuggestions(
      { windowDays: 30, limit: 20 },
      undefined,
      client,
    );
    expect(report.signal).toBe("recommendations");
    expect(report.earlySignal).toBe(true);
    expect(report.analysis.analyzedVariants).toBe(2);
    expect(report.analysis.windowUnitsSold).toBe(3);
  });

  it("rejects a reorder report missing the new engine-state fields", () => {
    const legacy = {
      windowDays: 30,
      generatedAt: "2026-07-18T06:00:00.000Z",
      businessDate: "2026-07-18",
      totalEstCostMinor: 0,
      totalExpProfitMinor: 0,
      costCoverage: { costed: 0, total: 0 },
      suggestions: [],
    };
    expect(reorderReportSchema.safeParse(legacy).success).toBe(false);
  });

  it("fetches trending products with the window and limit filters", async () => {
    const { client, fetcher } = clientFor(TRENDING);
    const report = await getTrendingProducts(
      { windowDays: 30, limit: 8 },
      undefined,
      client,
    );
    expect(report.items[0]?.isNew).toBe(true);
    expect(report.items[0]?.growthBasisPoints).toBeNull();
    expect(report.earlySignal).toBe(true);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/reports/dashboard/trending-products");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      windowDays: "30",
      limit: "8",
    });
  });

  it("fetches top brands with the period and limit filters", async () => {
    const { client, fetcher } = clientFor(TOP_BRANDS);
    const report = await getTopBrands(
      { period: "month", limit: 8 },
      undefined,
      client,
    );
    expect(report.items[0]?.brandName).toBe("Samsung");
    expect(report.period).toBe("month");
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/reports/dashboard/top-brands");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      period: "month",
      limit: "8",
    });
  });
});
