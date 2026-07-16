import {
  DailyFinancialSummaryQuerySchema,
  DailyFinancialSummarySchema,
  type DailyFinancialSummary,
  type DailyFinancialSummaryQueryInput,
} from "@mobileshop/shared";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const dailyFinancialSummarySchema = DailyFinancialSummarySchema;
export type DailyFinancialSummaryData = DailyFinancialSummary;
export type DailyFinancialSummaryParameters = DailyFinancialSummaryQueryInput;

function summaryPath(parameters: DailyFinancialSummaryParameters): string {
  const parsed = DailyFinancialSummaryQuerySchema.parse(parameters);
  const query = new URLSearchParams({ period: parsed.period });
  if (parsed.date !== undefined) query.set("date", parsed.date);
  return `/reports/dashboard/summary?${query.toString()}`;
}

/**
 * The reconciled financial roll-up for one business day, week or month. The
 * server owns every figure; the browser never combines domain pages on its own.
 */
export function getDailyFinancialSummary(
  parameters: DailyFinancialSummaryParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<DailyFinancialSummaryData> {
  return client.request(summaryPath(parameters), {
    method: "GET",
    schema: dailyFinancialSummarySchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
