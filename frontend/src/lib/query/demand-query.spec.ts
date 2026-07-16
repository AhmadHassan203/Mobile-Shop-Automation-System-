import { PAGINATION } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import { queryKeys } from "./keys";
import {
  demandCaptureAvailabilityQueryOptions,
  demandCaptureCatalogQueryOptions,
  demandCaptureProductQueryOptions,
  demandConversionCapabilitiesQueryOptions,
  demandRequestQueryOptions,
  demandRequestsQueryOptions,
} from "./demand-query";

describe("Demand capture dependency queries", () => {
  it("shares the active catalog cache and can be permission-disabled", () => {
    const options = demandCaptureCatalogQueryOptions(false);
    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual(
      queryKeys.catalogProducts({
        page: 1,
        pageSize: PAGINATION.MAX_PAGE_SIZE,
        active: true,
      }),
    );
  });

  it("uses one exact product identity for a POS deep link", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const options = demandCaptureProductQueryOptions(id, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.catalogProductDetail(id));
    expect(demandCaptureProductQueryOptions("", true).enabled).toBe(false);
  });

  it("keys the scoped availability lookup by selected SKU only", () => {
    const options = demandCaptureAvailabilityQueryOptions(
      "PH-SAMSUNG-A55-256",
      true,
    );
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(
      queryKeys.posLookup({
        page: 1,
        pageSize: PAGINATION.MAX_PAGE_SIZE,
        q: "PH-SAMSUNG-A55-256",
      }),
    );
    expect(demandCaptureAvailabilityQueryOptions("", true).enabled).toBe(false);
  });
});

describe("Demand production queries", () => {
  it("keys scoped ledgers by their complete server parameters", () => {
    const parameters = {
      page: 2,
      pageSize: 25,
      view: "unavailable" as const,
      sort: "requested_at" as const,
      direction: "desc" as const,
    };
    const options = demandRequestsQueryOptions(parameters, true);
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual(queryKeys.demandRequests(parameters));
    expect(demandRequestsQueryOptions(parameters, false).enabled).toBe(false);
  });

  it("permission-disables detail and capability reads without changing keys", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(demandRequestQueryOptions(id, false)).toMatchObject({
      enabled: false,
      queryKey: queryKeys.demandRequest(id),
    });
    expect(demandRequestQueryOptions("", true).enabled).toBe(false);
    expect(demandConversionCapabilitiesQueryOptions(false)).toMatchObject({
      enabled: false,
      queryKey: queryKeys.demandConversionCapabilities,
    });
  });
});
