import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getCatalogBrands,
  getCatalogCategories,
  getCatalogProduct,
  getCatalogProductModels,
  getCatalogProducts,
  getCatalogReferences,
  type BrandListParameters,
  type CategoryListParameters,
  type ProductListParameters,
  type ProductModelListParameters,
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

export function catalogProductDetailQueryOptions(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.catalogProductDetail(id),
    queryFn: ({ signal }) => getCatalogProduct(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function catalogCategoriesQueryOptions(
  parameters: CategoryListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.catalogCategories(parameters),
    queryFn: ({ signal }) => getCatalogCategories(parameters, signal),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function catalogBrandsQueryOptions(
  parameters: BrandListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.catalogBrands(parameters),
    queryFn: ({ signal }) => getCatalogBrands(parameters, signal),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function catalogProductModelsQueryOptions(
  parameters: ProductModelListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.catalogModels(parameters),
    queryFn: ({ signal }) => getCatalogProductModels(parameters, signal),
    placeholderData: keepPreviousData,
    enabled,
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
