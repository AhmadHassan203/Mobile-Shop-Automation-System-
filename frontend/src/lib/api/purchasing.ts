import {
  CancelPurchaseOrderInputSchema,
  CreateGoodsReceiptInputSchema,
  CreatePurchaseOrderInputSchema,
  CreateSupplierInputSchema,
  GoodsReceiptDetailSchema,
  GoodsReceiptListQuerySchema,
  GoodsReceiptPageSchema,
  PurchaseOrderDetailSchema,
  PurchaseOrderListQuerySchema,
  PurchaseOrderPageSchema,
  PurchaseOrderTransitionInputSchema,
  PurchasingVersionInputSchema,
  SupplierDetailSchema,
  SupplierListQuerySchema,
  SupplierPageSchema,
  UpdatePurchaseOrderInputSchema,
  UpdateSupplierInputSchema,
  type CancelPurchaseOrderInput,
  type CreateGoodsReceiptInput,
  type CreatePurchaseOrderInput,
  type CreateSupplierInput,
  type GoodsReceiptDetail,
  type GoodsReceiptListQuery,
  type GoodsReceiptPage,
  type PurchaseOrderDetail,
  type PurchaseOrderListQuery,
  type PurchaseOrderPage,
  type PurchaseOrderTransitionInput,
  type SupplierDetail,
  type SupplierListQuery,
  type SupplierPage,
  type UpdatePurchaseOrderInput,
  type UpdateSupplierInput,
} from "@mobileshop/shared";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const purchasingSupplierPageSchema = SupplierPageSchema;
export const purchasingSupplierDetailSchema = SupplierDetailSchema;
export const purchasingOrderPageSchema = PurchaseOrderPageSchema;
export const purchasingOrderDetailSchema = PurchaseOrderDetailSchema;
export const purchasingReceiptPageSchema = GoodsReceiptPageSchema;
export const purchasingReceiptDetailSchema = GoodsReceiptDetailSchema;

export type PurchasingSupplierList = SupplierPage;
export type PurchasingSupplier = SupplierDetail;
export type PurchasingOrderList = PurchaseOrderPage;
export type PurchasingOrder = PurchaseOrderDetail;
export type PurchasingReceiptList = GoodsReceiptPage;
export type PurchasingReceipt = GoodsReceiptDetail;
export type SupplierListParameters = SupplierListQuery;
export type PurchaseOrderListParameters = PurchaseOrderListQuery;
export type GoodsReceiptListParameters = GoodsReceiptListQuery;

interface BaseListParameters {
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string | undefined;
}

function baseListQuery(parameters: BaseListParameters): URLSearchParams {
  const query = new URLSearchParams({
    page: String(parameters.page),
    pageSize: String(parameters.pageSize),
  });
  if (parameters.q !== undefined && parameters.q.length > 0) {
    query.set("q", parameters.q);
  }
  return query;
}

function listPath(path: string, query: URLSearchParams): string {
  return `${path}?${query.toString()}`;
}

function supplierListPath(parameters: SupplierListParameters): string {
  const parsed = SupplierListQuerySchema.parse(parameters);
  const query = baseListQuery(parsed);
  if (parsed.active !== undefined) query.set("active", String(parsed.active));
  return listPath("/suppliers", query);
}

function purchaseOrderListPath(
  parameters: PurchaseOrderListParameters,
): string {
  const parsed = PurchaseOrderListQuerySchema.parse(parameters);
  const query = baseListQuery(parsed);
  if (parsed.status !== undefined) query.set("status", parsed.status);
  if (parsed.supplierId !== undefined) {
    query.set("supplierId", parsed.supplierId);
  }
  if (parsed.from !== undefined) query.set("from", parsed.from);
  if (parsed.to !== undefined) query.set("to", parsed.to);
  return listPath("/purchases", query);
}

function goodsReceiptListPath(parameters: GoodsReceiptListParameters): string {
  const parsed = GoodsReceiptListQuerySchema.parse(parameters);
  const query = baseListQuery(parsed);
  if (parsed.purchaseOrderId !== undefined) {
    query.set("purchaseOrderId", parsed.purchaseOrderId);
  }
  if (parsed.supplierId !== undefined) {
    query.set("supplierId", parsed.supplierId);
  }
  if (parsed.from !== undefined) query.set("from", parsed.from);
  if (parsed.to !== undefined) query.set("to", parsed.to);
  return listPath("/goods-receipts", query);
}

export function getSuppliers(
  parameters: SupplierListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PurchasingSupplierList> {
  return client.request(supplierListPath(parameters), {
    method: "GET",
    schema: purchasingSupplierPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getSupplier(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PurchasingSupplier> {
  return client.request(`/suppliers/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: purchasingSupplierDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createSupplier(
  input: CreateSupplierInput,
  client: ApiClient = apiClient,
): Promise<PurchasingSupplier> {
  const body = CreateSupplierInputSchema.parse(input);
  return client.request("/suppliers", {
    method: "POST",
    schema: purchasingSupplierDetailSchema,
    json: body,
  });
}

export function updateSupplier(
  id: string,
  input: UpdateSupplierInput,
  client: ApiClient = apiClient,
): Promise<PurchasingSupplier> {
  const body = UpdateSupplierInputSchema.parse(input);
  return client.request(`/suppliers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    schema: purchasingSupplierDetailSchema,
    json: body,
  });
}

export function setSupplierActive(
  id: string,
  version: number,
  active: boolean,
  client: ApiClient = apiClient,
): Promise<PurchasingSupplier> {
  const body = PurchasingVersionInputSchema.parse({ version });
  const action = active ? "activate" : "deactivate";
  return client.request(`/suppliers/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    schema: purchasingSupplierDetailSchema,
    json: body,
  });
}

export function getPurchaseOrders(
  parameters: PurchaseOrderListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PurchasingOrderList> {
  return client.request(purchaseOrderListPath(parameters), {
    method: "GET",
    schema: purchasingOrderPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getPurchaseOrder(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PurchasingOrder> {
  return client.request(`/purchases/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: purchasingOrderDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  client: ApiClient = apiClient,
): Promise<PurchasingOrder> {
  const body = CreatePurchaseOrderInputSchema.parse(input);
  return client.request("/purchases", {
    method: "POST",
    schema: purchasingOrderDetailSchema,
    json: body,
  });
}

export function updatePurchaseOrder(
  id: string,
  input: UpdatePurchaseOrderInput,
  client: ApiClient = apiClient,
): Promise<PurchasingOrder> {
  const body = UpdatePurchaseOrderInputSchema.parse(input);
  return client.request(`/purchases/${encodeURIComponent(id)}`, {
    method: "PATCH",
    schema: purchasingOrderDetailSchema,
    json: body,
  });
}

export function transitionPurchaseOrder(
  id: string,
  action: "approve" | "order" | "close",
  input: PurchaseOrderTransitionInput,
  client: ApiClient = apiClient,
): Promise<PurchasingOrder> {
  const body = PurchaseOrderTransitionInputSchema.parse(input);
  return client.request(`/purchases/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    schema: purchasingOrderDetailSchema,
    json: body,
  });
}

export function cancelPurchaseOrder(
  id: string,
  input: CancelPurchaseOrderInput,
  client: ApiClient = apiClient,
): Promise<PurchasingOrder> {
  const body = CancelPurchaseOrderInputSchema.parse(input);
  return client.request(`/purchases/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    schema: purchasingOrderDetailSchema,
    json: body,
  });
}

export function getGoodsReceipts(
  parameters: GoodsReceiptListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PurchasingReceiptList> {
  return client.request(goodsReceiptListPath(parameters), {
    method: "GET",
    schema: purchasingReceiptPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getGoodsReceipt(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PurchasingReceipt> {
  return client.request(`/goods-receipts/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: purchasingReceiptDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createGoodsReceipt(
  input: CreateGoodsReceiptInput,
  client: ApiClient = apiClient,
): Promise<PurchasingReceipt> {
  const body = CreateGoodsReceiptInputSchema.parse(input);
  return client.request("/goods-receipts", {
    method: "POST",
    schema: purchasingReceiptDetailSchema,
    json: body,
  });
}
