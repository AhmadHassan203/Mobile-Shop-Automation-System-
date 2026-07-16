import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getCashSessions,
  getCurrentCashSession,
  type CashSessionListParameters,
} from "@/lib/api/cash";
import { queryKeys } from "./keys";

const listDefaults = {
  placeholderData: keepPreviousData,
  staleTime: 10_000,
  meta: { authDependent: true },
} as const;

export function currentCashSessionQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.currentCashSession,
    queryFn: ({ signal }) => getCurrentCashSession(signal),
    enabled,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function cashSessionsQueryOptions(
  parameters: CashSessionListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.cashSessions(parameters),
    queryFn: ({ signal }) => getCashSessions(parameters, signal),
    enabled,
    ...listDefaults,
  });
}
