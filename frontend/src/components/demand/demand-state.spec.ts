import { describe, expect, it } from "vitest";
import {
  demandCapabilities,
  demandDraftToCreateInput,
  demandFilterFrom,
  demandListQuery,
  demandOutcomeCategory,
  hasDemandDraftErrors,
  parseDemandBudget,
  validateDemandDraft,
  type DemandDraft,
} from "./demand-state";

function draft(overrides: Partial<DemandDraft> = {}): DemandDraft {
  return {
    productVariantId: "",
    customerName: "",
    requestText: "Infinix Hot 50 256 GB",
    variantDetails: "Green · New",
    quantity: "2",
    budget: "40k–46k",
    ptaPreference: "pta_only",
    urgency: "within_week",
    channel: "walk_in",
    phone: "0301-2233445",
    followUp: "2026-07-20",
    note: "Ready to buy.",
    consentToContact: true,
    tradeInInterest: false,
    ...overrides,
  };
}

describe("customer demand workspace state", () => {
  it("derives every action and reference-read capability independently", () => {
    expect(
      demandCapabilities([
        "demand.view",
        "demand.create",
        "catalog.view",
        "inventory.view",
        "pricing.view",
      ]),
    ).toEqual({
      canView: true,
      canCreate: true,
      canManage: false,
      canViewCustomers: false,
      canViewCatalog: true,
      canViewInventory: true,
      canViewPricing: true,
    });
  });

  it("preserves create-only cashier access without inventing ledger access", () => {
    expect(demandCapabilities(["demand.create"])).toMatchObject({
      canView: false,
      canCreate: true,
      canManage: false,
    });
  });

  it("defaults unknown filters and preserves the POS product deep link", () => {
    expect(demandFilterFrom(new URLSearchParams("filter=reserved"))).toBe(
      "reserved",
    );
    expect(demandFilterFrom(new URLSearchParams("filter=nope"))).toBe("all");

    const query = demandListQuery(
      new URLSearchParams(
        "page=3&productVariantId=11111111-1111-4111-8111-111111111111",
      ),
      "unavailable",
    );
    const parsed = new URLSearchParams(query);
    expect(parsed.get("filter")).toBe("unavailable");
    expect(parsed.get("productVariantId")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(parsed.has("page")).toBe(false);
  });

  it("maps both shared outcome codes and prototype copy to stable filters", () => {
    expect(demandOutcomeCategory("unavailable")).toBe("unavailable");
    expect(demandOutcomeCategory("sold_immediately")).toBe("reserved");
    expect(demandOutcomeCategory("Quotation sent")).toBe("quotation");
    expect(demandOutcomeCategory("price_too_high")).toBe("price");
    expect(demandOutcomeCategory("customer_postponed")).toBe("other");
  });

  it("accepts a catalog match without requiring duplicate free text", () => {
    const errors = validateDemandDraft(
      draft({
        productVariantId: "11111111-1111-4111-8111-111111111111",
        requestText: "",
      }),
    );
    expect(errors).toEqual({});
    expect(hasDemandDraftErrors(errors)).toBe(false);
  });

  it("validates unmatched capture without inventing catalog or availability", () => {
    const errors = validateDemandDraft(
      draft({
        requestText: "x",
        variantDetails: "x".repeat(241),
        quantity: "0",
        budget: "x".repeat(121),
        phone: "123",
        followUp: "tomorrow",
        note: "x".repeat(501),
      }),
    );
    expect(errors).toEqual({
      requestText: "Match a catalog product or describe the request.",
      variantDetails: "Variant details must be 120 characters or less.",
      quantity: "Quantity must be a whole number from 1 to 100,000.",
      budget: "Enter one budget or a range, for example 40000–46000.",
      phone: "Enter a valid Pakistani mobile number or leave it blank.",
      followUp: "Choose a valid follow-up date.",
    });
    expect(hasDemandDraftErrors(errors)).toBe(true);
  });

  it("parses exact rupee and k-shorthand budgets without floating point", () => {
    expect(parseDemandBudget("40k–46k")).toEqual({
      minimumMinor: 4_000_000,
      maximumMinor: 4_600_000,
    });
    expect(parseDemandBudget("PKR 40,000")).toEqual({
      minimumMinor: 4_000_000,
      maximumMinor: 4_000_000,
    });
    expect(() => parseDemandBudget("46000-40000")).toThrow();
  });

  it("adapts an unmatched drawer draft to the strict production capture contract", () => {
    const input = demandDraftToCreateInput(
      draft({ customerName: "  Ayesha   Khan " }),
      undefined,
      null,
      "2026-07-16T10:00:00.000Z",
    );
    expect(input).toMatchObject({
      item: {
        match: "unmatched",
        rawRequestText: "Infinix Hot 50 256 GB",
      },
      customerName: "Ayesha Khan",
      customerPhone: "+923012233445",
      budget: { minimumMinor: 4_000_000, maximumMinor: 4_600_000 },
      availabilitySnapshot: {
        state: "not_in_catalog",
        checkedAt: "2026-07-16T10:00:00.000Z",
      },
    });
  });
});
