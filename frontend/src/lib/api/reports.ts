import { z } from "zod";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

/**
 * Reporting and buying-intelligence read models.
 *
 * These endpoints are internal read models (not part of the shared public
 * contract), so their response shapes are validated by locally-defined Zod
 * schemas here rather than imported from `@mobileshop/shared`. Every money field
 * is an exact integer number of minor units, already safely converted server-side.
 */

const salesTrendPointSchema = z.object({
  businessDate: z.string(),
  salesRevenueMinor: z.number().int(),
  cogsMinor: z.number().int(),
  grossProfitMinor: z.number().int(),
  salesCount: z.number().int(),
});

export const salesTrendReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  days: z.number().int(),
  points: z.array(salesTrendPointSchema),
});

export type SalesTrendPoint = z.infer<typeof salesTrendPointSchema>;
export type SalesTrendReport = z.infer<typeof salesTrendReportSchema>;

const topProductRowSchema = z.object({
  productVariantId: z.string(),
  name: z.string(),
  sku: z.string(),
  unitsSold: z.number().int(),
  revenueMinor: z.number().int(),
  cogsMinor: z.number().int(),
  grossProfitMinor: z.number().int(),
});

export const TOP_PRODUCTS_PERIODS = ["day", "week", "month"] as const;
export type TopProductsPeriod = (typeof TOP_PRODUCTS_PERIODS)[number];

export const topProductsReportSchema = z.object({
  period: z.enum(TOP_PRODUCTS_PERIODS),
  from: z.string(),
  to: z.string(),
  items: z.array(topProductRowSchema),
});

export type TopProductRow = z.infer<typeof topProductRowSchema>;
export type TopProductsReport = z.infer<typeof topProductsReportSchema>;

const reorderSuggestionSchema = z.object({
  productVariantId: z.string(),
  name: z.string(),
  sku: z.string(),
  onHandUnits: z.number().int(),
  reservedUnits: z.number().int(),
  availableUnits: z.number().int(),
  reorderPoint: z.number().int().nullable(),
  windowUnitsSold: z.number().int(),
  demandOpenCount: z.number().int(),
  coverDaysRemaining: z.number().int().nullable(),
  recommendedQty: z.number().int(),
  unitLandedCostMinor: z.number().int().nullable(),
  estCostMinor: z.number().int().nullable(),
  unitProfitMinor: z.number().int().nullable(),
  expProfitMinor: z.number().int().nullable(),
  roiBasisPoints: z.number().int().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  score: z.number().int(),
});

export const REORDER_SIGNALS = [
  "recommendations",
  "no_reorder_needed",
  "insufficient_data",
] as const;
export type ReorderSignal = (typeof REORDER_SIGNALS)[number];

const reorderAnalysisSchema = z.object({
  analyzedVariants: z.number().int(),
  variantsWithSales: z.number().int(),
  variantsWithStock: z.number().int(),
  variantsWithDemand: z.number().int(),
  windowUnitsSold: z.number().int(),
});

export const reorderReportSchema = z.object({
  windowDays: z.number().int(),
  generatedAt: z.string(),
  businessDate: z.string(),
  // Explicit engine state so an empty list is never mistaken for "no data".
  signal: z.enum(REORDER_SIGNALS),
  earlySignal: z.boolean(),
  analysis: reorderAnalysisSchema,
  totalEstCostMinor: z.number().int(),
  totalExpProfitMinor: z.number().int(),
  costCoverage: z.object({
    costed: z.number().int(),
    total: z.number().int(),
  }),
  suggestions: z.array(reorderSuggestionSchema),
});

export type ReorderSuggestion = z.infer<typeof reorderSuggestionSchema>;
export type ReorderAnalysis = z.infer<typeof reorderAnalysisSchema>;
export type ReorderReport = z.infer<typeof reorderReportSchema>;

// Trending products — ranked by recent momentum, growth vs the prior window.
const trendingProductRowSchema = z.object({
  productVariantId: z.string(),
  name: z.string(),
  sku: z.string(),
  unitsSold: z.number().int(),
  revenueMinor: z.number().int(),
  grossProfitMinor: z.number().int(),
  salesCount: z.number().int(),
  demandOpenCount: z.number().int(),
  previousUnitsSold: z.number().int(),
  growthBasisPoints: z.number().int().nullable(),
  isNew: z.boolean(),
  trendScore: z.number().int(),
});

export const trendingProductsReportSchema = z.object({
  windowDays: z.number().int(),
  from: z.string(),
  to: z.string(),
  previousFrom: z.string(),
  previousTo: z.string(),
  rankingBasis: z.string(),
  earlySignal: z.boolean(),
  items: z.array(trendingProductRowSchema),
});

export type TrendingProductRow = z.infer<typeof trendingProductRowSchema>;
export type TrendingProductsReport = z.infer<
  typeof trendingProductsReportSchema
>;

// Top brands — ranked by real posted-sales performance for the period.
const topBrandRowSchema = z.object({
  brandId: z.string(),
  brandName: z.string(),
  unitsSold: z.number().int(),
  revenueMinor: z.number().int(),
  grossProfitMinor: z.number().int(),
  salesCount: z.number().int(),
  productCount: z.number().int(),
});

export const topBrandsReportSchema = z.object({
  period: z.enum(TOP_PRODUCTS_PERIODS),
  from: z.string(),
  to: z.string(),
  rankingBasis: z.string(),
  earlySignal: z.boolean(),
  items: z.array(topBrandRowSchema),
});

export type TopBrandRow = z.infer<typeof topBrandRowSchema>;
export type TopBrandsReport = z.infer<typeof topBrandsReportSchema>;

export interface SalesTrendParameters {
  readonly days?: number;
}

export function getSalesTrend(
  parameters: SalesTrendParameters = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<SalesTrendReport> {
  const query = new URLSearchParams();
  if (parameters.days !== undefined) query.set("days", String(parameters.days));
  const suffix = query.toString();
  return client.request(
    `/reports/dashboard/sales-trend${suffix.length === 0 ? "" : `?${suffix}`}`,
    {
      method: "GET",
      schema: salesTrendReportSchema,
      ...(signal === undefined ? {} : { signal }),
    },
  );
}

export interface TopProductsParameters {
  readonly period?: TopProductsPeriod;
  readonly limit?: number;
}

export function getTopProducts(
  parameters: TopProductsParameters = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<TopProductsReport> {
  const query = new URLSearchParams();
  if (parameters.period !== undefined) query.set("period", parameters.period);
  if (parameters.limit !== undefined) {
    query.set("limit", String(parameters.limit));
  }
  const suffix = query.toString();
  return client.request(
    `/reports/dashboard/top-products${suffix.length === 0 ? "" : `?${suffix}`}`,
    {
      method: "GET",
      schema: topProductsReportSchema,
      ...(signal === undefined ? {} : { signal }),
    },
  );
}

export interface ReorderSuggestionsParameters {
  readonly windowDays?: number;
  readonly limit?: number;
}

export function getReorderSuggestions(
  parameters: ReorderSuggestionsParameters = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ReorderReport> {
  const query = new URLSearchParams();
  if (parameters.windowDays !== undefined) {
    query.set("windowDays", String(parameters.windowDays));
  }
  if (parameters.limit !== undefined) {
    query.set("limit", String(parameters.limit));
  }
  const suffix = query.toString();
  return client.request(
    `/reports/dashboard/reorder-suggestions${suffix.length === 0 ? "" : `?${suffix}`}`,
    {
      method: "GET",
      schema: reorderReportSchema,
      ...(signal === undefined ? {} : { signal }),
    },
  );
}

export interface TrendingProductsParameters {
  readonly windowDays?: number;
  readonly limit?: number;
}

export function getTrendingProducts(
  parameters: TrendingProductsParameters = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<TrendingProductsReport> {
  const query = new URLSearchParams();
  if (parameters.windowDays !== undefined) {
    query.set("windowDays", String(parameters.windowDays));
  }
  if (parameters.limit !== undefined) {
    query.set("limit", String(parameters.limit));
  }
  const suffix = query.toString();
  return client.request(
    `/reports/dashboard/trending-products${suffix.length === 0 ? "" : `?${suffix}`}`,
    {
      method: "GET",
      schema: trendingProductsReportSchema,
      ...(signal === undefined ? {} : { signal }),
    },
  );
}

export interface TopBrandsParameters {
  readonly period?: TopProductsPeriod;
  readonly limit?: number;
}

export function getTopBrands(
  parameters: TopBrandsParameters = {},
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<TopBrandsReport> {
  const query = new URLSearchParams();
  if (parameters.period !== undefined) query.set("period", parameters.period);
  if (parameters.limit !== undefined) {
    query.set("limit", String(parameters.limit));
  }
  const suffix = query.toString();
  return client.request(
    `/reports/dashboard/top-brands${suffix.length === 0 ? "" : `?${suffix}`}`,
    {
      method: "GET",
      schema: topBrandsReportSchema,
      ...(signal === undefined ? {} : { signal }),
    },
  );
}
