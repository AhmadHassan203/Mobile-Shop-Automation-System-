import { describe, expect, it } from "vitest";
import {
  QuickStockInInputSchema,
  QuickStockInResultSchema,
  resolveQuickStockInAmounts,
} from "./quick-stock-in";

const VARIANT = "11111111-1111-4111-8111-111111111111";
const CATEGORY = "22222222-2222-4222-8222-222222222222";
const BRAND = "88888888-8888-4888-8888-888888888888";
const SUPPLIER = "33333333-3333-4333-8333-333333333333";
const LOCATION = "44444444-4444-4444-8444-444444444444";

function base(overrides: Record<string, unknown> = {}) {
  return {
    product: { mode: "existing", productVariantId: VARIANT },
    supplier: { mode: "existing", supplierId: SUPPLIER },
    stockLocationId: LOCATION,
    quantity: 5,
    unitCostMinor: 42_000,
    sellingPriceMinor: 44_500,
    payment: { status: "paid_full", method: "cash" },
    ...overrides,
  };
}

describe("QuickStockInInputSchema", () => {
  it("accepts an existing product paid in full by cash", () => {
    const parsed = QuickStockInInputSchema.parse(base());
    expect(parsed.payment.status).toBe("paid_full");
  });

  it("accepts a new product created inline on credit", () => {
    const parsed = QuickStockInInputSchema.parse(
      base({
        product: {
          mode: "new",
          productName: "  Samsung  Galaxy A15  ",
          variantName: "Galaxy A15 8/256 Black",
          categoryId: CATEGORY,
          brandId: BRAND,
        },
        supplier: { mode: "new", name: "Ali Traders", paymentTermsDays: 30 },
        payment: { status: "credit" },
      }),
    );
    if (parsed.product.mode !== "new") throw new Error("mode");
    expect(parsed.product.productName).toBe("Samsung Galaxy A15");
  });

  it("accepts a JazzCash wallet payment with a preserved provider", () => {
    const parsed = QuickStockInInputSchema.parse(
      base({
        payment: {
          status: "paid_full",
          method: "digital_wallet",
          walletProvider: "jazzcash",
          reference: "TXN-123",
        },
      }),
    );
    if (parsed.payment.status !== "paid_full") throw new Error("status");
    expect(parsed.payment.walletProvider).toBe("jazzcash");
  });

  it("rejects a wallet payment without a provider", () => {
    expect(
      QuickStockInInputSchema.safeParse(
        base({ payment: { status: "paid_full", method: "digital_wallet" } }),
      ).success,
    ).toBe(false);
  });

  it("rejects a wallet provider on a non-wallet tender", () => {
    expect(
      QuickStockInInputSchema.safeParse(
        base({
          payment: {
            status: "paid_full",
            method: "cash",
            walletProvider: "easypaisa",
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts a valid partial payment below the total", () => {
    const parsed = QuickStockInInputSchema.parse(
      base({
        quantity: 2,
        unitCostMinor: 100_000, // total 200,000
        payment: {
          status: "partial",
          method: "bank_transfer",
          amountPaidMinor: 50_000,
        },
      }),
    );
    if (parsed.payment.status !== "partial") throw new Error("status");
    expect(parsed.payment.amountPaidMinor).toBe(50_000);
  });

  it("rejects a partial payment not less than the total", () => {
    expect(
      QuickStockInInputSchema.safeParse(
        base({
          quantity: 2,
          unitCostMinor: 100_000,
          payment: {
            status: "partial",
            method: "cash",
            amountPaidMinor: 200_000,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects non-positive quantity and negative money", () => {
    expect(
      QuickStockInInputSchema.safeParse(base({ quantity: 0 })).success,
    ).toBe(false);
    expect(
      QuickStockInInputSchema.safeParse(base({ unitCostMinor: -1 })).success,
    ).toBe(false);
    expect(
      QuickStockInInputSchema.safeParse(base({ sellingPriceMinor: 12.5 }))
        .success,
    ).toBe(false);
  });

  it("rejects unknown extra keys and smuggled actor ids (strict)", () => {
    expect(QuickStockInInputSchema.safeParse(base({ hack: 1 })).success).toBe(
      false,
    );
    expect(
      QuickStockInInputSchema.safeParse(
        base({ organizationId: "99999999-9999-4999-8999-999999999999" }),
      ).success,
    ).toBe(false);
  });

  it("rejects a new product missing category/brand", () => {
    expect(
      QuickStockInInputSchema.safeParse(
        base({
          product: { mode: "new", productName: "X", variantName: "X base" },
        }),
      ).success,
    ).toBe(false);
  });
});

describe("resolveQuickStockInAmounts", () => {
  it("computes paid-in-full as the whole total", () => {
    const r = resolveQuickStockInAmounts({
      quantity: 5,
      unitCostMinor: 42_000,
      payment: { status: "paid_full", method: "cash" },
    });
    expect(r).toEqual({
      purchaseTotalMinor: 210_000,
      paidAmountMinor: 210_000,
      remainingPayableMinor: 0,
    });
  });

  it("computes the partial remainder", () => {
    const r = resolveQuickStockInAmounts({
      quantity: 2,
      unitCostMinor: 100_000,
      payment: {
        status: "partial",
        method: "bank_transfer",
        amountPaidMinor: 50_000,
      },
    });
    expect(r.remainingPayableMinor).toBe(150_000);
  });

  it("computes credit as a full payable", () => {
    const r = resolveQuickStockInAmounts({
      quantity: 3,
      unitCostMinor: 100_000,
      payment: { status: "credit" },
    });
    expect(r).toEqual({
      purchaseTotalMinor: 300_000,
      paidAmountMinor: 0,
      remainingPayableMinor: 300_000,
    });
  });
});

describe("QuickStockInResultSchema", () => {
  const result = {
    product: {
      id: VARIANT,
      name: "Galaxy A15",
      sku: "SKU-1",
      wasCreated: false,
    },
    supplier: { id: SUPPLIER, name: "Ali Traders", wasCreated: false },
    quantityAdded: 5,
    currentStockOnHand: 5,
    unitCostMinor: 42_000,
    purchaseTotalMinor: 210_000,
    sellingPriceMinor: 44_500,
    stockLocationId: LOCATION,
    stockLocationName: "Main Store",
    purchaseOrderId: "55555555-5555-4555-8555-555555555555",
    purchaseOrderNumber: "PO-000123",
    goodsReceiptId: "66666666-6666-4666-8666-666666666666",
    goodsReceiptNumber: "GRN-000123",
    paymentStatus: "paid_full",
    paymentMethod: "cash",
    walletProvider: null,
    paidAmountMinor: 210_000,
    remainingPayableMinor: 0,
    payableId: "77777777-7777-4777-8777-777777777777",
  };

  it("accepts a fully-paid result (settled payable, zero remaining)", () => {
    const parsed = QuickStockInResultSchema.parse(result);
    expect(parsed.remainingPayableMinor).toBe(0);
    expect(parsed.payableId).toBe("77777777-7777-4777-8777-777777777777");
  });

  it("accepts a credit result with a full payable", () => {
    const parsed = QuickStockInResultSchema.parse({
      ...result,
      paymentStatus: "credit",
      paymentMethod: null,
      paidAmountMinor: 0,
      remainingPayableMinor: 210_000,
      payableId: "77777777-7777-4777-8777-777777777777",
    });
    expect(parsed.remainingPayableMinor).toBe(210_000);
  });

  it("rejects paid + remaining that do not reconcile to the total", () => {
    expect(
      QuickStockInResultSchema.safeParse({
        ...result,
        paymentStatus: "partial",
        paidAmountMinor: 100_000,
        remainingPayableMinor: 50_000,
        payableId: "77777777-7777-4777-8777-777777777777",
      }).success,
    ).toBe(false);
  });
});
