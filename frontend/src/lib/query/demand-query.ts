import { PAGINATION } from "@mobileshop/shared";
import { queryOptions } from "@tanstack/react-query";
import { getCatalogProduct, getCatalogProducts } from "@/lib/api/catalog";
import {
  getDemandConversionCapabilities,
  getDemandRequest,
  getDemandRequests,
  type DemandListParameters,
} from "@/lib/api/demand";
import { getPosLookup } from "@/lib/api/pricing";
import { queryKeys } from "./keys";

const CAPTURE_CATALOG_PARAMETERS = {
  page: 1,
  pageSize: PAGINATION.MAX_PAGE_SIZE,
  active: true,
} as const;

export function demandRequestsQueryOptions(
  parameters: DemandListParameters,
  enabled = true,
) {
  return queryOptions({
    queryKey: queryKeys.demandRequests(parameters),
    queryFn: ({ signal }) => getDemandRequests(parameters, signal),
    enabled,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function demandRequestQueryOptions(id: string, enabled = true) {
  return queryOptions({
    queryKey: queryKeys.demandRequest(id),
    queryFn: ({ signal }) => getDemandRequest(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function demandConversionCapabilitiesQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: queryKeys.demandConversionCapabilities,
    queryFn: ({ signal }) => getDemandConversionCapabilities(signal),
    enabled,
    staleTime: 60_000,
    meta: { authDependent: true },
  });
}

export function demandCaptureCatalogQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: queryKeys.catalogProducts(CAPTURE_CATALOG_PARAMETERS),
    queryFn: ({ signal }) =>
      getCatalogProducts(CAPTURE_CATALOG_PARAMETERS, signal),
    enabled,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function demandCaptureProductQueryOptions(
  productVariantId: string,
  enabled = true,
) {
  return queryOptions({
    queryKey: queryKeys.catalogProductDetail(productVariantId),
    queryFn: ({ signal }) => getCatalogProduct(productVariantId, signal),
    enabled: enabled && productVariantId.length > 0,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function demandCaptureAvailabilityQueryOptions(
  sku: string,
  enabled = true,
) {
  const parameters = {
    page: 1,
    pageSize: PAGINATION.MAX_PAGE_SIZE,
    q: sku,
  } as const;
  return queryOptions({
    queryKey: queryKeys.posLookup(parameters),
    queryFn: ({ signal }) => getPosLookup(parameters, signal),
    enabled: enabled && sku.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}
