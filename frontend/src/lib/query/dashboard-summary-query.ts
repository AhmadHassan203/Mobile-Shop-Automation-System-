import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getDailyFinancialSummary,
  type DailyFinancialSummaryParameters,
} from "@/lib/api/dashboard-summary";
import { queryKeys } from "./keys";

export function dailyFinancialSummaryQueryOptions(
  parameters: DailyFinancialSummaryParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.dashboardSummary(parameters),
    queryFn: ({ signal }) => getDailyFinancialSummary(parameters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    meta: { authDependent: true },
  });
}
