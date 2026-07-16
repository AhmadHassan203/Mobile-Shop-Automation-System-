import {
  CreateReturnDraftInputSchema,
  ExchangeReturnInputSchema,
  IDEMPOTENCY_KEY_HEADER,
  PostReturnInputSchema,
  PostReturnResponseSchema,
  ReturnDetailSchema,
  ReturnEligibilityQuerySchema,
  ReturnEligibilitySchema,
  ReturnListQuerySchema,
  ReturnPageSchema,
  type CreateReturnDraftInput,
  type ExchangeReturnInput,
  type PostReturnInput,
  type PostReturnResponse,
  type ReturnDetail,
  type ReturnEligibility,
  type ReturnEligibilityQuery,
  type ReturnListQuery,
  type ReturnPage,
  type SaleDetail,
} from "@mobileshop/shared";
import { z } from "zod";
import { ApiError, type ApiClient } from "./client";
import { apiClient } from "./health";
import { getSale, getSales } from "./sales";

export const returnPageSchema = ReturnPageSchema;
export const returnDetailSchema = ReturnDetailSchema;
export const returnEligibilitySchema = ReturnEligibilitySchema;
export const postReturnResponseSchema = PostReturnResponseSchema;

export type ReturnListParameters = ReturnListQuery;
export type ReturnList = ReturnPage;
export type ReturnRecord = ReturnDetail;
export type ReturnEligibilityResult = ReturnEligibility;
export type ReturnEligibilityParameters = ReturnEligibilityQuery;
export type PostedReturn = PostReturnResponse;

function returnListPath(parameters: ReturnListParameters): string {
  const parsed = ReturnListQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
    sort: parsed.sort,
    direction: parsed.direction,
  });
  if (parsed.q !== undefined) query.set("q", parsed.q);
  if (parsed.status !== undefined) query.set("status", parsed.status);
  if (parsed.saleId !== undefined) query.set("saleId", parsed.saleId);
  if (parsed.customerId !== undefined) {
    query.set("customerId", parsed.customerId);
  }
  if (parsed.from !== undefined) query.set("from", parsed.from);
  if (parsed.to !== undefined) query.set("to", parsed.to);
  return `/returns?${query.toString()}`;
}

function returnEligibilityPath(query: ReturnEligibilityParameters): string {
  const parsed = ReturnEligibilityQuerySchema.parse(query);
  const search = new URLSearchParams();
  if (parsed.saleId !== undefined) search.set("saleId", parsed.saleId);
  if (parsed.invoiceNumber !== undefined) {
    search.set("invoiceNumber", parsed.invoiceNumber);
  }
  if (parsed.saleLineId !== undefined) {
    search.set("saleLineId", parsed.saleLineId);
  }
  return `/returns/eligibility?${search.toString()}`;
}

export function getReturns(
  parameters: ReturnListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ReturnList> {
  return client.request(returnListPath(parameters), {
    method: "GET",
    schema: returnPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getReturn(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ReturnRecord> {
  return client.request(`/returns/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: returnDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getReturnEligibility(
  query: ReturnEligibilityParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ReturnEligibilityResult> {
  return client.request(returnEligibilityPath(query), {
    method: "GET",
    schema: returnEligibilitySchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createReturn(
  input: CreateReturnDraftInput,
  client: ApiClient = apiClient,
): Promise<ReturnRecord> {
  return client.request("/returns", {
    method: "POST",
    schema: returnDetailSchema,
    json: CreateReturnDraftInputSchema.parse(input),
  });
}

export function postReturn(
  id: string,
  input: PostReturnInput,
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<PostedReturn> {
  const key = z.uuid().parse(idempotencyKey);
  return client.request(`/returns/${encodeURIComponent(id)}/post`, {
    method: "POST",
    schema: postReturnResponseSchema,
    json: PostReturnInputSchema.parse(input),
    headers: { [IDEMPOTENCY_KEY_HEADER]: key },
  });
}

/**
 * Request an in-place exchange for a return.
 *
 * The endpoint is intentionally stable, but the backend still answers with a
 * CONFLICT (reason `atomic_sales_posting_boundary_unavailable`) until safe
 * exchange posting exists, so this success path is currently unreachable and the
 * UI keeps the action disabled. The declared schema is the return detail an
 * eventual exchange would settle to; it is never parsed while deferred.
 */
export function exchangeReturn(
  id: string,
  input: ExchangeReturnInput,
  client: ApiClient = apiClient,
): Promise<ReturnRecord> {
  return client.request(`/returns/${encodeURIComponent(id)}/exchange`, {
    method: "POST",
    schema: returnDetailSchema,
    json: ExchangeReturnInputSchema.parse(input),
  });
}

export type ReturnSaleLookup =
  | {
      readonly availability: "found";
      readonly invoiceNumber: string;
      readonly sale: SaleDetail;
    }
  | {
      readonly availability: "not_found";
      readonly invoiceNumber: string;
    };

function normalizedInvoice(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toUpperCase()
    .slice(0, 100);
}

/**
 * Read-only proof-of-purchase lookup over the implemented Sales API.
 *
 * This deliberately does not claim return eligibility: policy windows, prior
 * returned quantities and settlement belong to the Returns eligibility endpoint.
 */
export async function lookupOriginalSaleForReturn(
  invoiceNumber: string,
  client: ApiClient = apiClient,
): Promise<ReturnSaleLookup> {
  const invoice = normalizedInvoice(invoiceNumber);
  if (invoice.length === 0) {
    throw new ApiError("Enter an invoice number to look up.", {
      code: "VALIDATION_FAILED",
    });
  }
  const matches = await getSales(
    {
      page: 1,
      pageSize: 100,
      q: invoice,
      sort: "posted_at",
      direction: "desc",
    },
    undefined,
    client,
  );
  const exact = matches.items.find(
    (sale) => sale.invoiceNumber?.toUpperCase() === invoice,
  );
  if (exact === undefined) {
    return { availability: "not_found", invoiceNumber: invoice };
  }
  const sale = await getSale(exact.id, undefined, client);
  if (sale.invoiceNumber?.toUpperCase() !== invoice) {
    throw new ApiError("The Sales API returned a different invoice detail.", {
      code: "INVALID_RESPONSE",
    });
  }
  return { availability: "found", invoiceNumber: invoice, sale };
}
