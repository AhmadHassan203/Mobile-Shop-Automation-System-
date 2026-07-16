import { describe, expect, it } from "vitest";
import {
  CreateCustomerInputSchema,
  CustomerDetailSchema,
  CustomerListQuerySchema,
  CustomerPageSchema,
  CustomerSensitiveFieldsSchema,
  CustomerSummarySchema,
  PakistanMobileInputSchema,
  UpdateCustomerInputSchema,
} from "./customers";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const TIMESTAMP = "2026-07-16T10:00:00.000Z";

const summary = {
  id: CUSTOMER_ID,
  name: "Ali Hamza",
  phone: "+923001234567",
  marketingConsent: "pending",
  purchaseCount: 2,
  lifetimeSpendMinor: 125_000,
  receivableBalanceMinor: 10_000,
  lastVisitAt: TIMESTAMP,
  isActive: true,
  version: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
} as const;

describe("Pakistan customer phone boundary", () => {
  it("normalizes common PK counter formats to one E.164 identity", () => {
    for (const input of [
      "0300-1234567",
      "0300 1234567",
      "+92 300 1234567",
      "92-300-1234567",
      "3001234567",
    ]) {
      expect(PakistanMobileInputSchema.parse(input)).toBe("+923001234567");
    }
  });

  it("rejects foreign, landline and malformed numbers", () => {
    for (const input of ["+1 202 555 0100", "042-1234567", "0300-123"] ) {
      expect(PakistanMobileInputSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("customer mutations", () => {
  it("normalizes identity text, phone and email and applies safe defaults", () => {
    expect(
      CreateCustomerInputSchema.parse({
        name: "  Ali   Hamza ",
        phone: "0300-1234567",
        email: " ALI@EXAMPLE.COM ",
      }),
    ).toEqual({
      name: "Ali Hamza",
      phone: "+923001234567",
      email: "ali@example.com",
      marketingConsent: "pending",
      addressLine: null,
      notes: null,
    });
  });

  it("uses full replace semantics and an optimistic version for updates", () => {
    const result = UpdateCustomerInputSchema.parse({
      name: "Ali Hamza",
      phone: "+923001234567",
      email: null,
      marketingConsent: "granted",
      addressLine: null,
      notes: null,
      version: 4,
    });
    expect(result.version).toBe(4);
    expect(
      UpdateCustomerInputSchema.safeParse({
        name: "Ali Hamza",
        phone: "+923001234567",
        version: 4,
      }).success,
    ).toBe(false);
  });

  it("never accepts tenant, branch, actor, aggregates or sensitive identity", () => {
    for (const leaked of [
      { organizationId: CUSTOMER_ID },
      { branchId: CUSTOMER_ID },
      { createdByUserId: CUSTOMER_ID },
      { lifetimeSpendMinor: 10_000 },
      { nationalIdentityReference: "35202-1234567-1" },
    ]) {
      expect(
        CreateCustomerInputSchema.safeParse({
          name: "Ali Hamza",
          phone: "0300-1234567",
          ...leaked,
        }).success,
      ).toBe(false);
    }
  });
});

describe("customer reads and redaction", () => {
  it("accepts only normalized PK response phones and safe money", () => {
    expect(CustomerSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      CustomerSummarySchema.safeParse({ ...summary, phone: "0300-1234567" })
        .success,
    ).toBe(false);
    expect(
      CustomerSummarySchema.safeParse({
        ...summary,
        lifetimeSpendMinor: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });

  it("makes sensitive availability structural, not nullable leakage", () => {
    expect(
      CustomerSensitiveFieldsSchema.safeParse({ availability: "redacted" })
        .success,
    ).toBe(true);
    expect(
      CustomerSensitiveFieldsSchema.safeParse({
        availability: "redacted",
        nationalIdentityReference: "35202-1234567-1",
      }).success,
    ).toBe(false);
    expect(
      CustomerSensitiveFieldsSchema.safeParse({
        availability: "available",
        nationalIdentityReference: "35202-1234567-1",
        externalReference: null,
      }).success,
    ).toBe(true);
  });

  it("keeps detail strict for both authorized and redacted callers", () => {
    const detail = {
      ...summary,
      email: "ali@example.com",
      addressLine: null,
      notes: null,
      sensitive: { availability: "redacted" },
    } as const;
    expect(CustomerDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      CustomerDetailSchema.safeParse({
        ...detail,
        organizationId: CUSTOMER_ID,
      }).success,
    ).toBe(false);
  });

  it("parses bounded list/search filters without client branch scope", () => {
    expect(
      CustomerListQuerySchema.parse({
        q: "  Ali   0300 ",
        hasReceivable: "true",
      }),
    ).toEqual({
      page: 1,
      pageSize: 25,
      q: "Ali 0300",
      hasReceivable: true,
      sort: "name",
      direction: "asc",
    });
    expect(
      CustomerListQuerySchema.safeParse({ branchId: CUSTOMER_ID }).success,
    ).toBe(false);
  });

  it("uses a reconciled strict page envelope", () => {
    expect(
      CustomerPageSchema.safeParse({
        items: [summary],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      }).success,
    ).toBe(true);
  });
});
