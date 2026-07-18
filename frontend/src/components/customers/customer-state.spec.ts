import type { CustomerPage, CustomerSummary } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  customerApiSearch,
  customerCapabilities,
  customerFilterFrom,
  customerInitials,
  customerKpis,
  customerListQuery,
  customerLocallyFilteredPage,
  customerPageFrom,
  customerSearchFrom,
  validateCustomerDraft,
} from "./customer-state";

const BASE_CUSTOMER: CustomerSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ali Hamza",
  phone: "+923012233445",
  marketingConsent: "granted",
  purchaseCount: 2,
  lifetimeSpendMinor: 120_000,
  receivableBalanceMinor: 15_000,
  lastVisitAt: "2026-07-16T08:00:00.000Z",
  isActive: true,
  version: 1,
  createdAt: "2026-07-15T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
};

function page(
  items: readonly CustomerSummary[],
  total = items.length,
): CustomerPage {
  return {
    items: [...items],
    page: 1,
    pageSize: 100,
    total,
    totalPages: Math.ceil(total / 100),
  };
}

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

  it("preserves unrelated query state while resetting scoped pagination", () => {
    const filtered = customerListQuery(
      new URLSearchParams("tab=profiles&page=2&customerId=customer-1"),
      { filter: "repeat", q: "  Sana  " },
    );
    expect(new URLSearchParams(filtered).get("filter")).toBe("repeat");
    expect(new URLSearchParams(filtered).get("q")).toBe("Sana");
    expect(new URLSearchParams(filtered).get("tab")).toBe("profiles");
    expect(new URLSearchParams(filtered).has("page")).toBe(false);
    expect(new URLSearchParams(filtered).get("customerId")).toBe("customer-1");

    const paged = customerListQuery(new URLSearchParams(filtered), { page: 3 });
    expect(customerPageFrom(new URLSearchParams(paged))).toBe(3);
    const cleared = customerListQuery(new URLSearchParams(paged), {
      filter: "all",
      q: " ",
      customerId: null,
    });
    expect(new URLSearchParams(cleared).has("filter")).toBe(false);
    expect(new URLSearchParams(cleared).has("q")).toBe(false);
    expect(new URLSearchParams(cleared).has("page")).toBe(false);
    expect(new URLSearchParams(cleared).has("customerId")).toBe(false);
  });

  it("normalizes search, local phone prefixes, pages and customer initials", () => {
    expect(customerSearchFrom(new URLSearchParams("q=%20Ali%20"))).toBe("Ali");
    expect(customerApiSearch("0301-2233445")).toBe("+923012233445");
    expect(customerApiSearch("92301")).toBe("+92301");
    expect(customerApiSearch("Ali Hamza")).toBe("Ali Hamza");
    expect(customerApiSearch(" ")).toBeUndefined();
    expect(customerPageFrom(new URLSearchParams("page=-5"))).toBe(1);
    expect(customerInitials("  Ali   Hamza Khan ")).toBe("AH");
    expect(customerInitials(" ")).toBe("");
  });

  it("validates the persisted customer draft", () => {
    expect(
      validateCustomerDraft({
        name: "Ali Hamza",
        phone: "0301-2233445",
        email: "ali@example.com",
        consent: "granted",
        addressLine: "Lahore",
        notes: "Restock alerts only.",
      }),
    ).toEqual({});
    expect(
      validateCustomerDraft({
        name: "A",
        phone: "123",
        email: "not-an-email",
        consent: "pending",
        addressLine: "x".repeat(501),
        notes: "x".repeat(501),
      }),
    ).toEqual({
      name: "Enter the customer's full name.",
      phone: "Enter a valid Pakistani mobile number.",
      email: "Enter a valid email address.",
      addressLine: "Address must be 500 characters or less.",
      notes: "Notes must be 500 characters or less.",
    });
  });

  it("derives exact KPIs only when the required population is complete", () => {
    const second: CustomerSummary = {
      ...BASE_CUSTOMER,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Sana Khan",
      phone: "+923009998887",
      marketingConsent: "pending",
      purchaseCount: 1,
      lifetimeSpendMinor: 80_000,
      receivableBalanceMinor: 0,
    };
    expect(
      customerKpis(page([BASE_CUSTOMER, second]), page([BASE_CUSTOMER])),
    ).toEqual({
      totalCustomers: 2,
      repeatBuyers: 1,
      lifetimeSpendMinor: 200_000,
      creditCustomers: 1,
      receivableBalanceMinor: 15_000,
      populationComplete: true,
      creditPopulationComplete: true,
    });
    expect(
      customerKpis(page([BASE_CUSTOMER], 101), page([BASE_CUSTOMER], 101)),
    ).toEqual({
      totalCustomers: 101,
      repeatBuyers: null,
      lifetimeSpendMinor: null,
      creditCustomers: 101,
      receivableBalanceMinor: null,
      populationComplete: false,
      creditPopulationComplete: false,
    });
  });

  it("applies repeat and consent filters only to a verified complete population", () => {
    const pending: CustomerSummary = {
      ...BASE_CUSTOMER,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Sana Khan",
      phone: "+923009998887",
      marketingConsent: "pending",
      purchaseCount: 1,
    };
    expect(
      customerLocallyFilteredPage(
        page([BASE_CUSTOMER, pending]),
        "repeat",
        "0301",
        1,
        25,
      )?.items,
    ).toEqual([BASE_CUSTOMER]);
    expect(
      customerLocallyFilteredPage(
        page([BASE_CUSTOMER, pending]),
        "consent",
        "Sana",
        1,
        25,
      )?.items,
    ).toEqual([pending]);
    expect(
      customerLocallyFilteredPage(
        page([BASE_CUSTOMER], 101),
        "repeat",
        "",
        1,
        25,
      ),
    ).toBeNull();
  });
});
