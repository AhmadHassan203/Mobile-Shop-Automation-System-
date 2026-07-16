import {
  CreateExpenseInputSchema,
  ExpenseListQuerySchema,
  ExpensePageSchema,
  ExpenseSchema,
  type CreateExpenseInput,
  type Expense,
  type ExpenseListQuery,
  type ExpensePage,
} from "@mobileshop/shared";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const expenseSchema = ExpenseSchema;
export const expensePageSchema = ExpensePageSchema;

export type ExpenseListParameters = ExpenseListQuery;
export type ExpenseRecord = Expense;
export type ExpenseList = ExpensePage;

function expenseListPath(parameters: ExpenseListParameters): string {
  const parsed = ExpenseListQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
  });
  if (parsed.q !== undefined) query.set("q", parsed.q);
  if (parsed.category !== undefined) query.set("category", parsed.category);
  if (parsed.from !== undefined) query.set("from", parsed.from);
  if (parsed.to !== undefined) query.set("to", parsed.to);
  return `/expenses?${query.toString()}`;
}

export function getExpenses(
  parameters: ExpenseListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ExpenseList> {
  return client.request(expenseListPath(parameters), {
    method: "GET",
    schema: expensePageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createExpense(
  input: CreateExpenseInput,
  client: ApiClient = apiClient,
): Promise<ExpenseRecord> {
  const body = CreateExpenseInputSchema.parse(input);
  return client.request("/expenses", {
    method: "POST",
    schema: expenseSchema,
    json: body,
  });
}
