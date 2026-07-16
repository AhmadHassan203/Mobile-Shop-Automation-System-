import { describe, expect, it } from "vitest";
import {
  demandCapabilities,
  demandFilterFrom,
  demandListQuery,
  demandOutcomeCategory,
  validateDemandDraft,
} from "./demand-state";

describe("customer demand workspace state", () => {
  it("derives every action and reference-read capability independently", () => {
    expect(
      demandCapabilities([
        "demand.view",
        "demand.create",
        "catalog.view",
        "inventory.view",
      ]),
    ).toEqual({
      canView: true,
      canCreate: true,
      canManage: false,
      canViewCustomers: false,
      canViewCatalog: true,
      canViewInventory: true,
    });
  });

  it("defaults unknown filters and writes filters without losing other state", () => {
    expect(demandFilterFrom(new URLSearchParams("filter=reserved"))).toBe(
      "reserved",
    );
    expect(demandFilterFrom(new URLSearchParams("filter=nope"))).toBe("all");

    const query = demandListQuery(
      new URLSearchParams("page=3&source=walk-in"),
      "unavailable",
    );
    expect(new URLSearchParams(query).get("filter")).toBe("unavailable");
    expect(new URLSearchParams(query).get("source")).toBe("walk-in");
    expect(
      new URLSearchParams(
        demandListQuery(new URLSearchParams(query), "all"),
      ).has("filter"),
    ).toBe(false);
  });

  it("maps prototype-style outcome copy into stable filter categories", () => {
    expect(demandOutcomeCategory("Unavailable — out of stock")).toBe(
      "unavailable",
    );
    expect(demandOutcomeCategory("Sold immediately")).toBe("reserved");
    expect(demandOutcomeCategory("Quotation sent")).toBe("quotation");
    expect(demandOutcomeCategory("Price too high — bought elsewhere")).toBe(
      "price",
    );
    expect(demandOutcomeCategory("Customer postponed")).toBe("other");
  });

  it("validates capture drafts without inventing catalog or availability data", () => {
    expect(
      validateDemandDraft({
        request: "Infinix Hot 50 256 GB",
        variant: "Green, new",
        quantity: "2",
        budget: "40k-46k",
        phone: "0301-2233445",
        followUp: "2026-07-20",
        note: "Ready to buy.",
      }),
    ).toEqual({});
    expect(
      validateDemandDraft({
        request: "x",
        variant: "",
        quantity: "0",
        budget: "",
        phone: "123",
        followUp: "tomorrow",
        note: "x".repeat(501),
      }),
    ).toEqual({
      request: "Describe what the customer requested.",
      quantity: "Quantity must be a whole number from 1 to 999.",
      phone: "Enter a valid Pakistani mobile number or leave it blank.",
      followUp: "Choose a valid follow-up date.",
      note: "Note must be 500 characters or less.",
    });
  });
});
