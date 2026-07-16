import type { SaleDetail, SaleLine, SaleSummary } from "@mobileshop/shared";
import { PERMISSIONS } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  RETURN_BACKEND_GAPS,
  exactInvoiceSale,
  normalizeReturnInvoice,
  returnCapabilities,
  returnLineIdentifier,
  returnLineLabel,
  returnOutcomeImpact,
  returnRouteQuery,
  returnTabFrom,
  validateReturnDraft,
} from "./return-state";

const IDS = {
  sale: "11111111-1111-4111-8111-111111111111",
  line: "22222222-2222-4222-8222-222222222222",
  variant: "33333333-3333-4333-8333-333333333333",
  location: "44444444-4444-4444-8444-444444444444",
  unit: "55555555-5555-4555-8555-555555555555",
  user: "66666666-6666-4666-8666-666666666666",
} as const;
const TIMESTAMP = "2026-07-16T10:00:00.000Z";
const quantityLine: SaleLine = {
  id: IDS.line,
  trackingType: "quantity",
  product: { id: IDS.variant, sku: "CASE-BLK", name: "Black case" },
  location: { id: IDS.location, code: "MAIN", name: "Main store" },
  priceVersion: 3,
  quantity: 2,
  unitPriceMinor: 1_000,
  lineSubtotalMinor: 2_000,
  discountMinor: 0,
  lineTotalMinor: 2_000,
  discountReason: null,
  profit: { availability: "redacted" },
};
const detail: SaleDetail = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: "INV-000001",
  customer: null,
  currency: "PKR",
  note: null,
  discountReason: null,
  hold: null,
  lines: [quantityLine],
  totals: { subtotalMinor: 2_000, discountMinor: 0, totalMinor: 2_000 },
  settlement: {
    payments: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        method: "cash",
        amountMinor: 2_000,
        reference: null,
        recordedAt: TIMESTAMP,
      },
    ],
    paidMinor: 2_000,
    receivableMinor: 0,
  },
  profit: { availability: "redacted" },
  cashier: { id: IDS.user, fullName: "Haseeb Ahmed" },
  salesperson: { id: IDS.user, fullName: "Haseeb Ahmed" },
  version: 2,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  postedAt: TIMESTAMP,
  cancelledAt: null,
};
const summary: SaleSummary = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: detail.invoiceNumber,
  customer: null,
  lineCount: 1,
  unitCount: 2,
  totalMinor: 2_000,
  paymentMethods: ["cash"],
  profit: { availability: "redacted" },
  cashier: detail.cashier,
  salesperson: detail.salesperson,
  heldAt: null,
  postedAt: TIMESTAMP,
  createdAt: TIMESTAMP,
  version: 2,
};

describe("returns workspace state", () => {
  it("derives view, intake, approval, Sales lookup and reporting separately", () => {
    expect(
      returnCapabilities([
        PERMISSIONS.RETURNS_VIEW,
        PERMISSIONS.RETURNS_CREATE,
        PERMISSIONS.SALES_VIEW,
      ]),
    ).toEqual({
      canView: true,
      canCreate: true,
      canApprove: false,
      canViewSales: true,
      canViewReports: false,
    });
  });

  it("makes the Warranty tab linkable while preserving unrelated query state", () => {
    const query = returnRouteQuery(
      new URLSearchParams("source=dashboard"),
      "warranty",
    );
    expect(returnTabFrom(new URLSearchParams(query))).toBe("warranty");
    expect(new URLSearchParams(query).get("source")).toBe("dashboard");
    expect(
      new URLSearchParams(
        returnRouteQuery(new URLSearchParams(query), "returns"),
      ).has("tab"),
    ).toBe(false);
  });

  it("normalizes invoice lookup and requires an exact invoice match", () => {
    expect(normalizeReturnInvoice("  inv-000001  ")).toBe("INV-000001");
    expect(exactInvoiceSale([summary], "inv-000001")).toEqual(summary);
    expect(exactInvoiceSale([summary], "INV-0000")).toBeNull();
  });

  it("labels serialized and quantity lines from verified Sales evidence", () => {
    const serialized: SaleLine = {
      ...quantityLine,
      trackingType: "serialized",
      quantity: 1,
      lineSubtotalMinor: 1_000,
      lineTotalMinor: 1_000,
      serializedUnit: {
        id: IDS.unit,
        identifiers: [{ type: "imei", value: "356938035643809" }],
      },
    };
    expect(returnLineIdentifier(quantityLine)).toBeNull();
    expect(returnLineLabel(quantityLine)).toContain("Qty 2");
    expect(returnLineIdentifier(serialized)).toBe("356938035643809");
    expect(returnLineLabel(serialized)).toContain("IMEI 356938035643809");
  });

  it("requires verified sale/line evidence and never generates inspection prose", () => {
    expect(
      validateReturnDraft(
        {
          invoiceNumber: "INV-000001",
          saleLineId: IDS.line,
          reason: "Not charging (DOA)",
          condition: "Faulty",
          evidence: "Bench test observed no charging response.",
        },
        detail,
      ),
    ).toEqual({});
    expect(
      validateReturnDraft(
        {
          invoiceNumber: "INV-UNKNOWN",
          saleLineId: "",
          reason: "Not charging (DOA)",
          condition: "Faulty",
          evidence: "",
        },
        null,
      ),
    ).toEqual({
      invoiceNumber: "The entered invoice has not been verified.",
      saleLineId: "Select a line from the verified original sale.",
      evidence:
        "Record the observed evidence; it is never generated automatically.",
    });
  });

  it("keeps every outcome impact generic when server evidence is unavailable", () => {
    expect(returnOutcomeImpact("restock")).toHaveLength(3);
    expect(returnOutcomeImpact("write_off").join(" ")).toContain(
      "loss amount is unavailable",
    );
    expect(returnOutcomeImpact("write_off").join(" ")).not.toMatch(/Rs\.?\s*\d/u);
  });

  it("publishes the complete backend gap registry", () => {
    expect(RETURN_BACKEND_GAPS.map((gap) => gap.id)).toEqual([
      "queue",
      "eligibility",
      "outcome",
      "exchange",
      "warranty",
      "report",
    ]);
    expect(RETURN_BACKEND_GAPS.every((gap) => gap.endpoint.length > 0)).toBe(
      true,
    );
  });
});
