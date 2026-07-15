import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getCatalogProducts,
  getCatalogReferences,
  type ProductListParameters,
} from "@/lib/api/catalog";
import { queryKeys } from "./keys";

export function catalogProductsQueryOptions(parameters: ProductListParameters) {
  return queryOptions({
    queryKey: queryKeys.catalogProducts(parameters),
    queryFn: ({ signal }) => getCatalogProducts(parameters, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function catalogReferencesQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.catalogReferences,
    queryFn: ({ signal }) => getCatalogReferences(signal),
    enabled,
    staleTime: 5 * 60_000,
    meta: { authDependent: true },
  });
}
