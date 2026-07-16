import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { CashSessionListParameters } from "@/lib/api/cash";
import { cashSessionsQueryOptions, currentCashSessionQueryOptions } from "./cash-query";
import { queryKeys } from "./keys";

const LIST_PARAMETERS: CashSessionListParameters = {
  page: 1,
  pageSize: 25,
  status: "open",
};

describe("Cash session queries", () => {
  it("keys the current-session read and can be disabled", () => {
    const options = currentCashSessionQueryOptions(true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.currentCashSession);
    expect(options.meta).toEqual({ authDependent: true });
    expect(currentCashSessionQueryOptions(false).enabled).toBe(false);
  });

  it("keys the history list by its complete server parameters", () => {
    const options = cashSessionsQueryOptions(LIST_PARAMETERS, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.cashSessions(LIST_PARAMETERS));
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(cashSessionsQueryOptions(LIST_PARAMETERS, false).enabled).toBe(
      false,
    );
  });
});
