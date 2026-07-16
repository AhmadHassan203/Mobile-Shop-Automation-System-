import {
  CancelSaleInputSchema,
  CreateSaleDraftInputSchema,
  HoldSaleInputSchema,
  IDEMPOTENCY_KEY_HEADER,
  PostSaleInputSchema,
  PostSaleResponseSchema,
  ReplaceSaleDraftInputSchema,
  SaleDetailSchema,
  SaleListQuerySchema,
  SalePageSchema,
  SaleReceiptQuerySchema,
  SaleReceiptSchema,
  SaleReviewInputSchema,
  SaleReviewSchema,
  type CancelSaleInput,
  type CreateSaleDraftInput,
  type HoldSaleInput,
  type PostSaleInput,
  type PostSaleResponse,
  type ReplaceSaleDraftInput,
  type SaleDetail,
  type SaleListQuery,
  type SalePage,
  type SaleReceipt,
  type SaleReceiptQuery,
  type SaleReview,
  type SaleReviewInput,
} from "@mobileshop/shared";
import { z } from "zod";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const saleDetailSchema = SaleDetailSchema;
export const saleReviewSchema = SaleReviewSchema;
export const postedSaleSchema = PostSaleResponseSchema;
export const saleReceiptSchema = SaleReceiptSchema;
export const salePageSchema = SalePageSchema;

export type SaleListParameters = SaleListQuery;
export type SaleList = SalePage;
export type SaleRecord = SaleDetail;
export type SaleReviewResult = SaleReview;
export type PostedSale = PostSaleResponse;
export type SaleReceiptRecord = SaleReceipt;

function saleListPath(parameters: SaleListParameters): string {
  const parsed = SaleListQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
    sort: parsed.sort,
    direction: parsed.direction,
  });
  if (parsed.q !== undefined) query.set("q", parsed.q);
  if (parsed.status !== undefined) query.set("status", parsed.status);
  if (parsed.cashierId !== undefined) query.set("cashierId", parsed.cashierId);
  if (parsed.salespersonId !== undefined) {
    query.set("salespersonId", parsed.salespersonId);
  }
  if (parsed.paymentMethod !== undefined) {
    query.set("paymentMethod", parsed.paymentMethod);
  }
  if (parsed.from !== undefined) query.set("from", parsed.from);
  if (parsed.to !== undefined) query.set("to", parsed.to);
  return `/sales?${query.toString()}`;
}

export function getSales(
  parameters: SaleListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<SaleList> {
  return client.request(saleListPath(parameters), {
    method: "GET",
    schema: salePageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getSale(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<SaleRecord> {
  return client.request(`/sales/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: saleDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createSaleDraft(
  input: CreateSaleDraftInput,
  client: ApiClient = apiClient,
): Promise<SaleRecord> {
  return client.request("/sales", {
    method: "POST",
    schema: saleDetailSchema,
    json: CreateSaleDraftInputSchema.parse(input),
  });
}

export function replaceSaleDraft(
  id: string,
  input: ReplaceSaleDraftInput,
  client: ApiClient = apiClient,
): Promise<SaleRecord> {
  return client.request(`/sales/${encodeURIComponent(id)}`, {
    method: "PUT",
    schema: saleDetailSchema,
    json: ReplaceSaleDraftInputSchema.parse(input),
  });
}

export function reviewSale(
  id: string,
  input: SaleReviewInput,
  client: ApiClient = apiClient,
): Promise<SaleReviewResult> {
  return client.request(`/sales/${encodeURIComponent(id)}/review`, {
    method: "POST",
    schema: saleReviewSchema,
    json: SaleReviewInputSchema.parse(input),
  });
}

export function holdSale(
  id: string,
  input: HoldSaleInput,
  client: ApiClient = apiClient,
): Promise<SaleRecord> {
  return client.request(`/sales/${encodeURIComponent(id)}/hold`, {
    method: "POST",
    schema: saleDetailSchema,
    json: HoldSaleInputSchema.parse(input),
  });
}

export function cancelSale(
  id: string,
  input: CancelSaleInput,
  client: ApiClient = apiClient,
): Promise<SaleRecord> {
  return client.request(`/sales/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    schema: saleDetailSchema,
    json: CancelSaleInputSchema.parse(input),
  });
}

export function postSale(
  id: string,
  input: PostSaleInput,
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<PostedSale> {
  const key = z.uuid().parse(idempotencyKey);
  return client.request(`/sales/${encodeURIComponent(id)}/post`, {
    method: "POST",
    schema: postedSaleSchema,
    json: PostSaleInputSchema.parse(input),
    headers: { [IDEMPOTENCY_KEY_HEADER]: key },
  });
}

export function getSaleReceipt(
  id: string,
  parameters: SaleReceiptQuery,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<SaleReceiptRecord> {
  const parsed = SaleReceiptQuerySchema.parse(parameters);
  const query = new URLSearchParams({ format: parsed.format });
  return client.request(
    `/sales/${encodeURIComponent(id)}/receipt?${query.toString()}`,
    {
      method: "GET",
      schema: saleReceiptSchema,
      ...(signal === undefined ? {} : { signal }),
    },
  );
}
