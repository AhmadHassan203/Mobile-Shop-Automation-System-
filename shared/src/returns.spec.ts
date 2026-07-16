import { describe, expect, it } from "vitest";
import {
  CreateReturnDraftInputSchema,
  PostReturnInputSchema,
  RETURN_EXCHANGE_CAPABILITY,
  ReturnCustomerContactSchema,
  ReturnEligibilityQuerySchema,
  ReturnEligibilitySchema,
  ReturnTotalsSchema,
} from "./returns";

const ids = {
  sale: "10000000-0000-4000-8000-000000000001",
  line: "10000000-0000-4000-8000-000000000002",
  unit: "10000000-0000-4000-8000-000000000003",
  product: "10000000-0000-4000-8000-000000000004",
  location: "10000000-0000-4000-8000-000000000005",
};

describe("returns contracts", () => {
  it("requires exactly one proof-of-purchase lookup key and normalizes invoices", () => {
    expect(
      ReturnEligibilityQuerySchema.parse({ invoiceNumber: "  inv- 42 " }),
    ).toEqual({ invoiceNumber: "INV- 42" });
    expect(
      ReturnEligibilityQuerySchema.safeParse({
        saleId: ids.sale,
        invoiceNumber: "INV-42",
      }).success,
    ).toBe(false);
    expect(ReturnEligibilityQuerySchema.safeParse({}).success).toBe(false);
  });

  it("accepts exact original serialized evidence and rejects duplicate sale lines", () => {
    const line = {
      trackingType: "serialized" as const,
      saleLineId: ids.line,
      serializedUnitId: ids.unit,
      identifier: " 356938035643809 ",
      condition: "faulty" as const,
    };
    const parsed = CreateReturnDraftInputSchema.parse({
      saleId: ids.sale,
      reason: " Not charging ",
      evidenceNote: " Device does not draw current. ",
      lines: [line],
    });
    expect(parsed.lines[0]).toMatchObject({
      quantity: 1,
      identifier: "356938035643809",
    });
    expect(
      CreateReturnDraftInputSchema.safeParse({
        saleId: ids.sale,
        reason: "Not charging",
        evidenceNote: "Observed at counter",
        lines: [line, { ...line, serializedUnitId: ids.product }],
      }).success,
    ).toBe(false);
  });

  it("keeps provider references mandatory and cash references absent", () => {
    expect(
      PostReturnInputSchema.safeParse({
        version: 1,
        refund: { method: "bank_transfer", reference: null },
      }).success,
    ).toBe(false);
    expect(
      PostReturnInputSchema.safeParse({
        version: 1,
        refund: { method: "cash", reference: "BANK-1" },
      }).success,
    ).toBe(false);
    expect(
      PostReturnInputSchema.parse({
        version: 1,
        refund: { method: "card", reference: " PSP-42 " },
      }).refund,
    ).toEqual({ method: "card", reference: "PSP-42" });
  });

  it("makes sensitive contact and profit structural redactions", () => {
    expect(
      ReturnCustomerContactSchema.safeParse({
        availability: "redacted",
        phone: "+923001234567",
      }).success,
    ).toBe(false);
    expect(
      ReturnTotalsSchema.safeParse({
        refundMinor: 1_000,
        receivableCreditMinor: 400,
        refundedMinor: 600,
        profit: { availability: "redacted" },
      }).success,
    ).toBe(true);
    expect(
      ReturnTotalsSchema.safeParse({
        refundMinor: 1_001,
        receivableCreditMinor: 400,
        refundedMinor: 600,
        profit: { availability: "redacted" },
      }).success,
    ).toBe(false);
  });

  it("distinguishes an expired override path from ordinary eligibility", () => {
    const now = "2026-07-16T10:00:00.000Z";
    const eligibility = {
      state: "window_expired" as const,
      eligible: false,
      requiresOverride: true,
      sale: {
        id: ids.sale,
        invoiceNumber: "INV-42",
        status: "posted" as const,
        postedAt: "2026-07-01T10:00:00.000Z",
        returnWindowDays: 7,
        returnDeadline: "2026-07-08T10:00:00.000Z",
        customer: null,
      },
      policy: {
        windowDaysSnapshot: 7,
        deadline: "2026-07-08T10:00:00.000Z",
        checkedAt: now,
        expired: true,
        overridden: false,
        overrideReason: null,
        overriddenBy: null,
        overriddenAt: null,
      },
      lines: [
        {
          trackingType: "quantity" as const,
          saleLineId: ids.line,
          product: { id: ids.product, sku: "CAB-1", name: "USB cable" },
          location: { id: ids.location, code: "MAIN", name: "Main" },
          soldQuantity: 2,
          returnedQuantity: 0,
          remainingQuantity: 2,
          refundableMinor: 2_000,
          profit: { availability: "redacted" as const },
        },
      ],
      exchange: RETURN_EXCHANGE_CAPABILITY,
    };
    expect(ReturnEligibilitySchema.safeParse(eligibility).success).toBe(true);
    expect(
      ReturnEligibilitySchema.safeParse({
        ...eligibility,
        requiresOverride: false,
      }).success,
    ).toBe(false);
  });
});

