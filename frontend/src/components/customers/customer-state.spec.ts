import { describe, expect, it } from "vitest";
import {
  customerCapabilities,
  customerFilterFrom,
  customerInitials,
  customerListQuery,
  customerSearchFrom,
  validateCustomerDraft,
} from "./customer-state";

describe("customer workspace state", () => {
  it("derives independent read, manage, sensitive, demand and sale grants", () => {
    expect(
      customerCapabilities([
        "customers.view",
        "customers.manage",
        "demand.create",
      ]),
    ).toEqual({
      canView: true,
      canManage: true,
      canViewSensitive: false,
      canCreateDemand: true,
      canCreateSales: false,
    });
  });

  it("accepts known filters and safely defaults unknown filters", () => {
    expect(customerFilterFrom(new URLSearchParams("filter=credit"))).toBe(
      "credit",
    );
    expect(customerFilterFrom(new URLSearchParams("filter=unknown"))).toBe(
      "all",
    );
  });

  it("preserves unrelated query state and removes default values", () => {
    const filtered = customerListQuery(
      new URLSearchParams("tab=profiles&page=2"),
      { filter: "repeat", q: "  Sana  " },
    );
    expect(new URLSearchParams(filtered).get("filter")).toBe("repeat");
    expect(new URLSearchParams(filtered).get("q")).toBe("Sana");
    expect(new URLSearchParams(filtered).get("tab")).toBe("profiles");

    const cleared = customerListQuery(new URLSearchParams(filtered), {
      filter: "all",
      q: " ",
    });
    expect(new URLSearchParams(cleared).has("filter")).toBe(false);
    expect(new URLSearchParams(cleared).has("q")).toBe(false);
  });

  it("normalizes search and customer initials", () => {
    expect(customerSearchFrom(new URLSearchParams("q=%20Ali%20"))).toBe("Ali");
    expect(customerInitials("  Ali   Hamza Khan ")).toBe("AH");
    expect(customerInitials(" ")).toBe("");
  });

  it("validates a local draft without claiming it can be persisted", () => {
    expect(
      validateCustomerDraft({
        name: "Ali Hamza",
        phone: "0301-2233445",
        consent: "yes",
        notes: "Restock alerts only.",
      }),
    ).toEqual({});
    expect(
      validateCustomerDraft({
        name: "A",
        phone: "123",
        consent: "pending",
        notes: "x".repeat(501),
      }),
    ).toEqual({
      name: "Enter the customer's full name.",
      phone: "Enter a valid Pakistani mobile number.",
      notes: "Notes must be 500 characters or less.",
    });
  });
});
