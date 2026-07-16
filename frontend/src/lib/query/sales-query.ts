import { queryOptions } from "@tanstack/react-query";
import {
  getSale,
  getSaleReceipt,
  getSales,
  type SaleListParameters,
} from "@/lib/api/sales";
import { queryKeys } from "./keys";

export function salesQueryOptions(
  parameters: SaleListParameters,
  enabled = true,
) {
  return queryOptions({
    queryKey: queryKeys.sales(parameters),
    queryFn: ({ signal }) => getSales(parameters, signal),
    enabled,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function saleQueryOptions(id: string, enabled = true) {
  return queryOptions({
    queryKey: queryKeys.sale(id),
    queryFn: ({ signal }) => getSale(id, signal),
    enabled,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function saleReceiptQueryOptions(id: string, enabled = true) {
  return queryOptions({
    queryKey: queryKeys.saleReceipt(id, "thermal"),
    queryFn: ({ signal }) => getSaleReceipt(id, { format: "thermal" }, signal),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    meta: { authDependent: true },
  });
}
