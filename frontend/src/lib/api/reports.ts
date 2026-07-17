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

export const reorderReportSchema = z.object({
  windowDays: z.number().int(),
  generatedAt: z.string(),
  businessDate: z.string(),
  totalEstCostMinor: z.number().int(),
  totalExpProfitMinor: z.number().int(),
  costCoverage: z.object({
    costed: z.number().int(),
    total: z.number().int(),
  }),
  suggestions: z.array(reorderSuggestionSchema),
});

export type ReorderSuggestion = z.infer<typeof reorderSuggestionSchema>;
export type ReorderReport = z.infer<typeof reorderReportSchema>;

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
