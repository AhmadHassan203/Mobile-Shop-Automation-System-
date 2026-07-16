import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getExternalTransaction,
  getExternalTransactions,
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
