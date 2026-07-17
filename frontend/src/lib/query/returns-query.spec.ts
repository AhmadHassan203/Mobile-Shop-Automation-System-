import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { ReturnListParameters } from "@/lib/api/returns";
import { queryKeys } from "./keys";
import {
  returnEligibilityQueryOptions,
  returnQueryOptions,
  returnsQueryOptions,
} from "./returns-query";

const LIST_PARAMETERS: ReturnListParameters = {
  page: 2,
  pageSize: 25,
  status: "draft",
  sort: "created_at",
  direction: "desc",
};

describe("Returns queue queries", () => {
  it("keys the queue by its complete server parameters and can be disabled", () => {
    const options = returnsQueryOptions(LIST_PARAMETERS, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.returns(LIST_PARAMETERS));
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.meta).toEqual({ authDependent: true });
    expect(returnsQueryOptions(LIST_PARAMETERS, false).enabled).toBe(false);
  });

  it("permission-disables and identity-guards the detail read", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(returnQueryOptions(id, true)).toMatchObject({
      enabled: true,
      queryKey: queryKeys.return(id),
    });
    expect(returnQueryOptions(id, false).enabled).toBe(false);
    expect(returnQueryOptions("", true).enabled).toBe(false);
  });

  it("keys eligibility by its exact query and only runs when enabled", () => {
    const query = { invoiceNumber: "INV-000001" } as const;
    const options = returnEligibilityQueryOptions(query, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.returnEligibility(query));
    expect(returnEligibilityQueryOptions(query, false).enabled).toBe(false);
  });
});
