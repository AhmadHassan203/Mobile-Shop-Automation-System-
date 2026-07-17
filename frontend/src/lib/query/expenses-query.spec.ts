import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { ExpenseListParameters } from "@/lib/api/expenses";
import { expensesQueryOptions } from "./expenses-query";
import { queryKeys } from "./keys";

const LIST_PARAMETERS: ExpenseListParameters = {
  page: 1,
  pageSize: 20,
  category: "rent",
};

describe("Expense queries", () => {
  it("keys the list by its complete server parameters and can be disabled", () => {
    const options = expensesQueryOptions(LIST_PARAMETERS, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.expenses(LIST_PARAMETERS));
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.meta).toEqual({ authDependent: true });
    expect(expensesQueryOptions(LIST_PARAMETERS, false).enabled).toBe(false);
  });
});
