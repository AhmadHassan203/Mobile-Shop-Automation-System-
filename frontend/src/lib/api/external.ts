import {
  CreateExternalTransactionInputSchema,
  EXTERNAL_PROVIDERS,
  EXTERNAL_TRANSACTION_TYPES,
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

// ===========================================================================
// Derived read models: per-provider service balances and the commission report.
// These have no shared contract, so the response shape is validated here and the
// exported types are the single source of truth for the pages that consume them.
// Every money field is integer minor units (paisa).
// ===========================================================================

const responseMinor = z.number().int().safe();
const nonnegativeResponseMinor = z.number().int().safe().nonnegative();
const responseCount = z.number().int().nonnegative();

export const externalProviderBalanceSchema = z.object({
  provider: z.enum(EXTERNAL_PROVIDERS),
  amountSentTodayMinor: nonnegativeResponseMinor,
  amountReceivedTodayMinor: nonnegativeResponseMinor,
  netMovementMinor: responseMinor,
  transactionCount: responseCount,
  lastTransactionAt: z.iso.datetime().nullable(),
  // Null = no configured source; the page renders "not configured", never a number.
  openingBalanceMinor: responseMinor.nullable(),
  currentBalanceMinor: responseMinor.nullable(),
  lowBalanceThresholdMinor: responseMinor.nullable(),
});

export const externalBalancesResponseSchema = z.object({
  businessDate: z.iso.date(),
  providers: z.array(externalProviderBalanceSchema),
});

export type ExternalProviderBalance = z.infer<
  typeof externalProviderBalanceSchema
>;
export type ExternalBalances = z.infer<typeof externalBalancesResponseSchema>;

export const EXTERNAL_COMMISSION_PERIODS = ["day", "week", "month"] as const;
export type ExternalCommissionPeriod =
  (typeof EXTERNAL_COMMISSION_PERIODS)[number];

const commissionTotalsSchema = z.object({
  grossFeeMinor: nonnegativeResponseMinor,
  providerCostMinor: nonnegativeResponseMinor,
  netCommissionMinor: responseMinor,
  transactionCount: responseCount,
});

export const externalCommissionResponseSchema = z.object({
  period: z.enum(EXTERNAL_COMMISSION_PERIODS),
  from: z.iso.date(),
  to: z.iso.date(),
  totals: commissionTotalsSchema,
  byProvider: z.array(
    commissionTotalsSchema.extend({ provider: z.enum(EXTERNAL_PROVIDERS) }),
  ),
  byType: z.array(
    commissionTotalsSchema.extend({
      transactionType: z.enum(EXTERNAL_TRANSACTION_TYPES),
    }),
  ),
});

export type ExternalCommissionTotals = z.infer<typeof commissionTotalsSchema>;
export type ExternalCommission = z.infer<
  typeof externalCommissionResponseSchema
>;
export type ExternalCommissionByProvider =
  ExternalCommission["byProvider"][number];
export type ExternalCommissionByType = ExternalCommission["byType"][number];

export function getExternalBalances(
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ExternalBalances> {
  return client.request("/external/balances", {
    method: "GET",
    schema: externalBalancesResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getExternalCommission(
  period: ExternalCommissionPeriod,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ExternalCommission> {
  const query = new URLSearchParams({ period });
  return client.request(`/external/commission?${query.toString()}`, {
    method: "GET",
    schema: externalCommissionResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
