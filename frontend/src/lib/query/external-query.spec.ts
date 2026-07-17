import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { ExternalTransactionListParameters } from "@/lib/api/external";
import { queryKeys } from "./keys";
import {
  externalTransactionQueryOptions,
  externalTransactionsQueryOptions,
} from "./external-query";

const LIST_PARAMETERS: ExternalTransactionListParameters = {
  page: 1,
  pageSize: 10,
  provider: "jazzcash",
};

describe("External transaction queries", () => {
  it("keys the list by its complete server parameters and can be disabled", () => {
    const options = externalTransactionsQueryOptions(LIST_PARAMETERS, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.external(LIST_PARAMETERS));
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.meta).toEqual({ authDependent: true });
    expect(
      externalTransactionsQueryOptions(LIST_PARAMETERS, false).enabled,
    ).toBe(false);
  });

  it("permission-disables and identity-guards the detail read", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(externalTransactionQueryOptions(id, true)).toMatchObject({
      enabled: true,
      queryKey: queryKeys.externalTransaction(id),
    });
    expect(externalTransactionQueryOptions(id, false).enabled).toBe(false);
    expect(externalTransactionQueryOptions("", true).enabled).toBe(false);
  });
});
