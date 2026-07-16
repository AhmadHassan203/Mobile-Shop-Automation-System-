import {
  CreateExternalTransactionInputSchema,
  ExternalTransactionListQuerySchema,
  ExternalTransactionPageSchema,
  ExternalTransactionSchema,
  IDEMPOTENCY_KEY_HEADER,
  type CreateExternalTransactionInput,
  type ExternalTransaction,
  type ExternalTransactionListQuery,
  type ExternalTransactionPage,
} from "@mobileshop/shared";
import { z } from "zod";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const externalTransactionSchema = ExternalTransactionSchema;
export const externalTransactionPageSchema = ExternalTransactionPageSchema;

export type ExternalTransactionListParameters = ExternalTransactionListQuery;
export type ExternalTransactionRecord = ExternalTransaction;
export type ExternalTransactionList = ExternalTransactionPage;

function externalListPath(
  parameters: ExternalTransactionListParameters,
): string {
  const parsed = ExternalTransactionListQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
  });
  if (parsed.q !== undefined) query.set("q", parsed.q);
  if (parsed.provider !== undefined) query.set("provider", parsed.provider);
  if (parsed.transactionType !== undefined) {
    query.set("transactionType", parsed.transactionType);
  }
  if (parsed.from !== undefined) query.set("from", parsed.from);
  if (parsed.to !== undefined) query.set("to", parsed.to);
  return `/external?${query.toString()}`;
}

export function getExternalTransactions(
  parameters: ExternalTransactionListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ExternalTransactionList> {
  return client.request(externalListPath(parameters), {
    method: "GET",
    schema: externalTransactionPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getExternalTransaction(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ExternalTransactionRecord> {
  return client.request(`/external/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: externalTransactionSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

/**
 * Record a completed external provider transaction.
 *
 * The idempotency key is a UUID the caller generates once per logical submit and
 * reuses across retries, so a network retry never records the transaction twice.
 * The server recomputes fee, direction, signed cash impact and service profit;
 * the parsed input never carries those authoritative fields.
 */
export function createExternalTransaction(
  input: CreateExternalTransactionInput,
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<ExternalTransactionRecord> {
  const body = CreateExternalTransactionInputSchema.parse(input);
  const key = z.uuid().parse(idempotencyKey);
  return client.request("/external", {
    method: "POST",
    headers: { [IDEMPOTENCY_KEY_HEADER]: key },
    schema: externalTransactionSchema,
    json: body,
  });
}
