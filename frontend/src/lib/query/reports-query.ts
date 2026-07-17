import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getReorderSuggestions,
  getSalesTrend,
  getTopProducts,
  type ReorderSuggestionsParameters,
  type SalesTrendParameters,
  type TopProductsParameters,
} from "@/lib/api/reports";
import { queryKeys } from "./keys";

export function salesTrendQueryOptions(
  parameters: SalesTrendParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.reportsSalesTrend(parameters),
    queryFn: ({ signal }) => getSalesTrend(parameters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    meta: { authDependent: true },
  });
}

export function topProductsQueryOptions(
  parameters: TopProductsParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.reportsTopProducts(parameters),
    queryFn: ({ signal }) => getTopProducts(parameters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    meta: { authDependent: true },
  });
}

export function reorderSuggestionsQueryOptions(
  parameters: ReorderSuggestionsParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.reorderSuggestions(parameters),
    queryFn: ({ signal }) => getReorderSuggestions(parameters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    meta: { authDependent: true },
  });
}
