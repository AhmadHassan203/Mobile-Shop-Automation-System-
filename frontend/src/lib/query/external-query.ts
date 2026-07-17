import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getExternalBalances,
  getExternalCommission,
  getExternalTransaction,
  getExternalTransactions,
  type ExternalCommissionPeriod,
  type ExternalTransactionListParameters,
} from "@/lib/api/external";
import { queryKeys } from "./keys";

const listDefaults = {
  placeholderData: keepPreviousData,
  staleTime: 10_000,
  meta: { authDependent: true },
} as const;

export function externalTransactionsQueryOptions(
  parameters: ExternalTransactionListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.external(parameters),
    queryFn: ({ signal }) => getExternalTransactions(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function externalTransactionQueryOptions(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.externalTransaction(id),
    queryFn: ({ signal }) => getExternalTransaction(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function externalBalancesQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.externalBalances,
    queryFn: ({ signal }) => getExternalBalances(signal),
    enabled,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function externalCommissionQueryOptions(
  period: ExternalCommissionPeriod,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.externalCommission(period),
    queryFn: ({ signal }) => getExternalCommission(period, signal),
    enabled,
    ...listDefaults,
  });
}
