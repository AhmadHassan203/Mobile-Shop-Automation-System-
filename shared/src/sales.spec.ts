import { describe, expect, it } from "vitest";
import {
  CancelSaleInputSchema,
  CreateSaleDraftInputSchema,
  isSaleClosedStatus,
  isSaleTransitionAllowed,
  PostSaleInputSchema,
  PostSaleResponseSchema,
  SaleDetailSchema,
  SaleListQuerySchema,
  SaleProfitSchema,
  SaleReceiptSchema,
  SaleRecentSummarySchema,
  SaleReviewSchema,
  SerializedSaleDraftLineInputSchema,
} from "./sales";

const IDS = {
  sale: "11111111-1111-4111-8111-111111111111",
  line: "22222222-2222-4222-8222-222222222222",
  variant: "33333333-3333-4333-8333-333333333333",
  location: "44444444-4444-4444-8444-444444444444",
  unit: "55555555-5555-4555-8555-555555555555",
  price: "66666666-6666-4666-8666-666666666666",
  payment: "77777777-7777-4777-8777-777777777777",
  user: "88888888-8888-4888-8888-888888888888",
} as const;
const TIMESTAMP = "2026-07-16T10:00:00.000Z";

const quantityDraftLine = {
  trackingType: "quantity",
  productVariantId: IDS.variant,
  locationId: IDS.location,
  quantity: 2,
  stockVersion: 4,
  priceSource: "variant_default",
  priceSourceId: null,
  priceVersion: 3,
} as const;

const location = { id: IDS.location, code: "MAIN", name: "Main store" };
const line = {
  id: IDS.line,
  trackingType: "quantity",
  product: { id: IDS.variant, sku: "CASE-BLK", name: "Black case" },
  location,
  priceVersion: 3,
  quantity: 2,
  unitPriceMinor: 1_000,
  lineSubtotalMinor: 2_000,
  discountMinor: 200,
  lineTotalMinor: 1_800,
  discountReason: "Loyal customer",
  profit: {
    availability: "available",
    cogsMinor: 1_200,
    grossProfitMinor: 600,
    grossMarginBasisPoints: 3_333,
  },
} as const;
const totals = { subtotalMinor: 2_000, discountMinor: 200, totalMinor: 1_800 };
const payment = {
  id: IDS.payment,
  method: "cash",
  amountMinor: 1_800,
  reference: null,
  recordedAt: TIMESTAMP,
} as const;
const settlement = {
  payments: [payment],
  paidMinor: 1_800,
  receivableMinor: 0,
};
const user = { id: IDS.user, fullName: "Haseeb Ahmed" };

const detail = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: "INV-000001",
  customer: null,
  currency: "PKR",
  note: null,
  discountReason: "Loyal customer",
  hold: null,
  lines: [line],
  totals,
  settlement,
  profit: line.profit,
  cashier: user,
  salesperson: user,
  version: 2,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  postedAt: TIMESTAMP,
  cancelledAt: null,
} as const;

const receipt = {
  saleId: IDS.sale,
  invoiceNumber: "INV-000001",
  currency: "PKR",
  issuedAt: TIMESTAMP,
  shop: {
    organizationName: "Al-Madina Mobiles",
    branchName: "Main branch",
    addressLine: null,
    phone: null,
  },
  customer: null,
  cashier: user,
  salesperson: user,
  lines: [
    {
      id: IDS.line,
      trackingType: "quantity",
      product: line.product,
      locationName: "Main store",
      quantity: 2,
      unitPriceMinor: 1_000,
      lineSubtotalMinor: 2_000,
      discountMinor: 200,
      lineTotalMinor: 1_800,
      discountReason: "Loyal customer",
    },
  ],
  totals,
  settlement,
  footer: null,
} as const;

describe("sale draft inputs", () => {
  it("uses a sale-level discount and explicit null for a walk-in", () => {
    const parsed = CreateSaleDraftInputSchema.parse({
      customerId: null,
      requestedDiscountMinor: 200,
      discountReason: "  Loyal   customer ",
      lines: [quantityDraftLine],
    });
    expect(parsed.discountReason).toBe("Loyal customer");
    expect(parsed.customerId).toBeNull();
    expect(parsed.lines[0]).not.toHaveProperty("requestedDiscountMinor");
  });

  it("requires a reason for discount and never accepts trusted amounts or scope", () => {
    expect(
      CreateSaleDraftInputSchema.safeParse({
        customerId: null,
        requestedDiscountMinor: 1,
        discountReason: null,
        lines: [quantityDraftLine],
      }).success,
    ).toBe(false);
    for (const leaked of [
      { organizationId: IDS.sale },
      { branchId: IDS.sale },
      { actorUserId: IDS.user },
      { invoiceNumber: "INV-FAKE" },
      { totalMinor: 1_800 },
      { cogsMinor: 1_200 },
      { grossProfitMinor: 600 },
    ]) {
      expect(
        CreateSaleDraftInputSchema.safeParse({
          customerId: null,
          lines: [quantityDraftLine],
          ...leaked,
        }).success,
      ).toBe(false);
    }
  });

  it("requires exact source identity and exactly one serialized unit selection", () => {
    const serialized = {
      trackingType: "serialized",
      productVariantId: IDS.variant,
      locationId: IDS.location,
      serializedUnitId: IDS.unit,
      serializedUnitVersion: 2,
      priceSource: "price_rule",
      priceSourceId: IDS.price,
      priceVersion: 1,
    } as const;
    expect(
      SerializedSaleDraftLineInputSchema.safeParse(serialized).success,
    ).toBe(true);
    expect(
      SerializedSaleDraftLineInputSchema.safeParse({
        ...serialized,
        priceSourceId: null,
      }).success,
    ).toBe(false);
    expect(
      SerializedSaleDraftLineInputSchema.safeParse({
        ...serialized,
        quantity: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate serialized units and duplicate quantity locations", () => {
    expect(
      CreateSaleDraftInputSchema.safeParse({
        customerId: null,
        lines: [quantityDraftLine, quantityDraftLine],
      }).success,
    ).toBe(false);
  });

  it("requires version and reason when cancelling", () => {
    expect(
      CancelSaleInputSchema.safeParse({ version: 3, reason: "Customer left" })
        .success,
    ).toBe(true);
    expect(
      CancelSaleInputSchema.safeParse({ version: 3, reason: " " }).success,
    ).toBe(false);
  });
});

describe("sale posting boundary", () => {
  it("validates payment-leg shape without accepting or comparing a client total", () => {
    expect(
      PostSaleInputSchema.safeParse({
        version: 2,
        payments: [
          { method: "cash", amountMinor: 500, reference: null },
          {
            method: "bank_transfer",
            amountMinor: 700,
            reference: "TX-001",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      PostSaleInputSchema.safeParse({
        version: 2,
        totalMinor: 1_200,
        payments: [{ method: "cash", amountMinor: 1_200, reference: null }],
      }).success,
    ).toBe(false);
  });

  it("enforces provider references, exact safe money and one credit leg", () => {
    expect(
      PostSaleInputSchema.safeParse({
        version: 2,
        payments: [{ method: "card", amountMinor: 100, reference: null }],
      }).success,
    ).toBe(false);
    expect(
      PostSaleInputSchema.safeParse({
        version: 2,
        payments: [
          { method: "cash", amountMinor: Number.MAX_SAFE_INTEGER + 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      PostSaleInputSchema.safeParse({
        version: 2,
        payments: [
          { method: "credit", amountMinor: 100, reference: null },
          { method: "credit", amountMinor: 100, reference: null },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("sale responses, receipt and redaction", () => {
  it("makes redacted profit structurally unable to carry COGS or profit", () => {
    expect(
      SaleProfitSchema.safeParse({ availability: "redacted" }).success,
    ).toBe(true);
    expect(
      SaleProfitSchema.safeParse({
        availability: "redacted",
        cogsMinor: 1_200,
        grossProfitMinor: 600,
      }).success,
    ).toBe(false);
  });

  it("reconciles server line totals, profit, settlement and posted identity", () => {
    expect(SaleDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      SaleDetailSchema.safeParse({
        ...detail,
        totals: { ...totals, totalMinor: 1_801 },
      }).success,
    ).toBe(false);
  });

  it("validates server review blockers rather than trusting the browser", () => {
    expect(
      SaleReviewSchema.safeParse({
        saleId: IDS.sale,
        version: 1,
        customer: null,
        currency: "PKR",
        discountReason: "Loyal customer",
        lines: [line],
        totals,
        profit: line.profit,
        warnings: [],
        canPost: true,
        reviewedAt: TIMESTAMP,
      }).success,
    ).toBe(true);
    expect(
      SaleReviewSchema.safeParse({
        saleId: IDS.sale,
        version: 1,
        customer: null,
        currency: "PKR",
        discountReason: "Loyal customer",
        lines: [line],
        totals,
        profit: line.profit,
        warnings: [
          {
            code: "stock_unavailable",
            severity: "blocking",
            message: "Stock changed.",
            lineId: IDS.line,
          },
        ],
        canPost: true,
        reviewedAt: TIMESTAMP,
      }).success,
    ).toBe(false);
  });

  it("keeps the exact customer receipt free of profit and reconciled to payments", () => {
    expect(SaleReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(JSON.stringify(SaleReceiptSchema.parse(receipt))).not.toMatch(
      /cogs|profit/i,
    );
    expect(
      SaleReceiptSchema.safeParse({
        ...receipt,
        totals: { ...totals, totalMinor: 1_799 },
      }).success,
    ).toBe(false);
  });

  it("returns one idempotent posted sale and its matching receipt", () => {
    expect(
      PostSaleResponseSchema.safeParse({
        sale: detail,
        receipt,
        idempotencyReplay: false,
      }).success,
    ).toBe(true);
    expect(
      PostSaleResponseSchema.safeParse({
        sale: detail,
        receipt: { ...receipt, saleId: IDS.line },
        idempotencyReplay: true,
      }).success,
    ).toBe(false);
  });
});

describe("sale lifecycle and list surfaces", () => {
  it("closes only terminal statuses and exposes explicit allowed transitions", () => {
    expect(isSaleTransitionAllowed("draft", "posted")).toBe(true);
    expect(isSaleTransitionAllowed("posted", "cancelled")).toBe(false);
    expect(isSaleTransitionAllowed("partially_returned", "returned")).toBe(
      true,
    );
    expect(isSaleClosedStatus("cancelled")).toBe(true);
    expect(isSaleClosedStatus("posted")).toBe(false);
  });

  it("filters the current scoped branch without accepting a branch input", () => {
    expect(
      SaleListQuerySchema.parse({ from: "2026-07-01", to: "2026-07-16" }),
    ).toMatchObject({ page: 1, pageSize: 25, sort: "posted_at" });
    expect(
      SaleListQuerySchema.safeParse({ branchId: IDS.location }).success,
    ).toBe(false);
    expect(
      SaleListQuerySchema.safeParse({
        from: "2026-07-17",
        to: "2026-07-16",
      }).success,
    ).toBe(false);
  });

  it("keeps recent summaries strict and permission-redactable", () => {
    expect(
      SaleRecentSummarySchema.safeParse({
        id: IDS.sale,
        invoiceNumber: "INV-000001",
        postedAt: TIMESTAMP,
        customerName: "Walk-in customer",
        itemSummary: "2 × Black case",
        paymentMethods: ["cash"],
        totalMinor: 1_800,
        profit: { availability: "redacted" },
      }).success,
    ).toBe(true);
  });
});
