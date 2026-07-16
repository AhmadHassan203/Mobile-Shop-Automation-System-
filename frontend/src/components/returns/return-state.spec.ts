import {
  CreateReturnDraftInputSchema,
  PERMISSIONS,
  type ReturnEligibility,
  type SaleLine,
  type SaleSummary,
} from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  RETURN_BACKEND_GAPS,
  buildCreateReturnInput,
  canSubmitReturnIntake,
  exactInvoiceSale,
  normalizeReturnInvoice,
  returnCapabilities,
  returnLineIdentifier,
  returnLineLabel,
  returnOutcomeImpact,
  returnRouteQuery,
  returnTabFrom,
  validateReturnIntake,
  type ReturnIntakeDraft,
} from "./return-state";

const IDS = {
  sale: "11111111-1111-4111-8111-111111111111",
  line: "22222222-2222-4222-8222-222222222222",
  line2: "2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a",
  variant: "33333333-3333-4333-8333-333333333333",
  variant2: "3b3b3b3b-3b3b-4b3b-8b3b-3b3b3b3b3b3b",
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
const summary: SaleSummary = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: "INV-000001",
  customer: null,
  lineCount: 1,
  unitCount: 2,
  totalMinor: 2_000,
  paymentMethods: ["cash"],
  profit: { availability: "redacted" },
  cashier: { id: IDS.user, fullName: "Haseeb Ahmed" },
  salesperson: { id: IDS.user, fullName: "Haseeb Ahmed" },
  heldAt: null,
  postedAt: TIMESTAMP,
  createdAt: TIMESTAMP,
  version: 2,
};

const eligibility: ReturnEligibility = {
  state: "eligible",
  eligible: true,
  requiresOverride: false,
  sale: {
    id: IDS.sale,
    invoiceNumber: "INV-000001",
    status: "posted",
    postedAt: TIMESTAMP,
    returnWindowDays: 7,
    returnDeadline: TIMESTAMP,
    customer: null,
  },
  policy: {
    windowDaysSnapshot: 7,
    deadline: TIMESTAMP,
    checkedAt: TIMESTAMP,
    expired: false,
    overridden: false,
    overrideReason: null,
    overriddenBy: null,
    overriddenAt: null,
  },
  lines: [
    {
      trackingType: "serialized",
      saleLineId: IDS.line,
      product: { id: IDS.variant, sku: "PH-1", name: "Phone" },
      location: { id: IDS.location, code: "MAIN", name: "Main store" },
      soldQuantity: 1,
      returnedQuantity: 0,
      remainingQuantity: 1,
      refundableMinor: 50_000,
      profit: { availability: "redacted" },
      serializedUnit: {
        id: IDS.unit,
        identifiers: [{ type: "imei", value: "356938035643809" }],
      },
    },
    {
      trackingType: "quantity",
      saleLineId: IDS.line2,
      product: { id: IDS.variant2, sku: "CASE-BLK", name: "Black case" },
      location: { id: IDS.location, code: "MAIN", name: "Main store" },
      soldQuantity: 3,
      returnedQuantity: 1,
      remainingQuantity: 2,
      refundableMinor: 2_000,
      profit: { availability: "redacted" },
    },
  ],
  exchange: {
    available: false,
    reason: "atomic_sales_posting_boundary_unavailable",
  },
};

const validDraft: ReturnIntakeDraft = {
  reason: "Not charging (DOA)",
  evidenceNote: "Bench test observed no charging response.",
  selections: { [IDS.line]: { condition: "faulty", quantity: 1 } },
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

  it("requires verified eligibility, a selected line and recorded evidence", () => {
    expect(validateReturnIntake(eligibility, validDraft)).toEqual({});
    expect(
      validateReturnIntake(eligibility, {
        reason: "Other",
        evidenceNote: "",
        selections: {},
      }),
    ).toEqual({
      lines: "Select at least one returnable line.",
      evidenceNote:
        "Record the observed evidence; it is never generated automatically.",
    });
    expect(validateReturnIntake(null, validDraft)).toEqual({
      form: "Check eligibility for a posted invoice first.",
    });
  });

  it("bounds a quantity line to what remains and blocks a fully-returned sale", () => {
    expect(
      validateReturnIntake(eligibility, {
        reason: "Other",
        evidenceNote: "Two units returned, both scuffed.",
        selections: { [IDS.line2]: { condition: "used", quantity: 5 } },
      }),
    ).toEqual({ lines: "Enter a return quantity within what remains." });

    const fully: ReturnEligibility = {
      ...eligibility,
      state: "fully_returned",
      eligible: false,
    };
    expect(validateReturnIntake(fully, validDraft).form).toBe(
      "Every eligible line on this sale has already been returned.",
    );
    expect(canSubmitReturnIntake(fully, validDraft)).toBe(false);
    expect(canSubmitReturnIntake(null, validDraft)).toBe(false);
    expect(canSubmitReturnIntake(eligibility, validDraft)).toBe(true);
  });

  it("builds a contract-valid multi-line create input from selected lines", () => {
    const input = buildCreateReturnInput(eligibility, {
      reason: "Screen / display fault",
      evidenceNote: "Cracked panel and a scuffed case on arrival.",
      selections: {
        [IDS.line]: { condition: "damaged", quantity: 1 },
        [IDS.line2]: { condition: "used", quantity: 2 },
      },
    });

    expect(input.saleId).toBe(IDS.sale);
    expect(input.reason).toBe("Screen / display fault");
    expect(input.lines).toEqual([
      {
        trackingType: "serialized",
        saleLineId: IDS.line,
        serializedUnitId: IDS.unit,
        identifier: "356938035643809",
        quantity: 1,
        condition: "damaged",
      },
      {
        trackingType: "quantity",
        saleLineId: IDS.line2,
        quantity: 2,
        condition: "used",
      },
    ]);
    expect(() => CreateReturnDraftInputSchema.parse(input)).not.toThrow();
  });

  it("keeps every outcome impact generic when server evidence is unavailable", () => {
    expect(returnOutcomeImpact("restock")).toHaveLength(3);
    expect(returnOutcomeImpact("repair")).toHaveLength(3);
    expect(returnOutcomeImpact("write_off").join(" ")).toContain(
      "loss amount is unavailable",
    );
    expect(returnOutcomeImpact("write_off").join(" ")).not.toMatch(
      /Rs\.?\s*\d/u,
    );
  });

  it("publishes only the still-unimplemented backend gaps", () => {
    expect(RETURN_BACKEND_GAPS.map((gap) => gap.id)).toEqual([
      "exchange",
      "warranty",
      "report",
    ]);
    expect(RETURN_BACKEND_GAPS.every((gap) => gap.endpoint.length > 0)).toBe(
      true,
    );
  });
});
