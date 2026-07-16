import { describe, expect, it } from "vitest";
import type { DailyFinancialSummaryParameters } from "@/lib/api/dashboard-summary";
import { dailyFinancialSummaryQueryOptions } from "./dashboard-summary-query";
import { queryKeys } from "./keys";

const PARAMETERS: DailyFinancialSummaryParameters = { period: "week" };

describe("Daily financial summary query", () => {
  it("keys the summary by its period query and can be disabled", () => {
    const options = dailyFinancialSummaryQueryOptions(PARAMETERS, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.dashboardSummary(PARAMETERS));
    expect(options.meta).toEqual({ authDependent: true });
    expect(dailyFinancialSummaryQueryOptions(PARAMETERS, false).enabled).toBe(
      false,
    );
  });
});
