import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getGoodsReceipt,
  getGoodsReceipts,
  getPurchaseOrder,
  getPurchaseOrders,
  getSupplier,
  getSuppliers,
  type GoodsReceiptListParameters,
  type PurchaseOrderListParameters,
  type SupplierListParameters,
} from "@/lib/api/purchasing";
import { queryKeys } from "./keys";

const listDefaults = {
  placeholderData: keepPreviousData,
  staleTime: 10_000,
  meta: { authDependent: true },
} as const;

export function suppliersQueryOptions(
  parameters: SupplierListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.purchasingSuppliers(parameters),
    queryFn: ({ signal }) => getSuppliers(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function supplierQueryOptions(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.purchasingSupplier(id),
    queryFn: ({ signal }) => getSupplier(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function purchaseOrdersQueryOptions(
  parameters: PurchaseOrderListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.purchasingOrders(parameters),
    queryFn: ({ signal }) => getPurchaseOrders(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function purchaseOrderQueryOptions(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.purchasingOrder(id),
    queryFn: ({ signal }) => getPurchaseOrder(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function goodsReceiptsQueryOptions(
  parameters: GoodsReceiptListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.purchasingReceipts(parameters),
    queryFn: ({ signal }) => getGoodsReceipts(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function goodsReceiptQueryOptions(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.purchasingReceipt(id),
    queryFn: ({ signal }) => getGoodsReceipt(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}
