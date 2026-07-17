import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getExpenses, type ExpenseListParameters } from "@/lib/api/expenses";
import { queryKeys } from "./keys";

export function expensesQueryOptions(
  parameters: ExpenseListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.expenses(parameters),
    queryFn: ({ signal }) => getExpenses(parameters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}
