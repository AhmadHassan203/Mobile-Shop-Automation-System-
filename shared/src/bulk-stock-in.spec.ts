import { describe, expect, it } from "vitest";
import {
  BULK_STOCK_IN_LIMITS,
  BulkStockInInputSchema,
  BulkStockInResultSchema,
  BulkStockInRowResultSchema,
} from "./bulk-stock-in";

const VARIANT = "11111111-1111-4111-8111-111111111111";
const CATEGORY = "22222222-2222-4222-8222-222222222222";
const BRAND = "88888888-8888-4888-8888-888888888888";
const SUPPLIER = "33333333-3333-4333-8333-333333333333";
const LOCATION = "44444444-4444-4444-8444-444444444444";

function row(overrides: Record<string, unknown> = {}) {
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

const okResult = {
  product: { id: VARIANT, name: "Galaxy A15", sku: "SKU-1", wasCreated: false },
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

describe("BulkStockInInputSchema", () => {
  it("accepts a batch of mixed existing and new rows", () => {
    const parsed = BulkStockInInputSchema.parse({
      rows: [
        row(),
        row({
          product: {
            mode: "new",
            productName: "  Samsung  Galaxy A15  ",
            variantName: "Galaxy A15 8/256 Black",
            categoryId: CATEGORY,
            brandId: BRAND,
          },
          supplier: { mode: "new", name: "Ali Traders" },
          payment: { status: "credit" },
        }),
      ],
    });
    expect(parsed.rows).toHaveLength(2);
    // Each row is a full Quick Stock In input: normalization runs per row.
    if (parsed.rows[1]?.product.mode !== "new") throw new Error("mode");
    expect(parsed.rows[1].product.productName).toBe("Samsung Galaxy A15");
  });

  it("rejects an empty batch", () => {
    expect(BulkStockInInputSchema.safeParse({ rows: [] }).success).toBe(false);
  });

  it(`rejects more than ${BULK_STOCK_IN_LIMITS.MAX_ROWS} rows`, () => {
    const rows = Array.from({ length: BULK_STOCK_IN_LIMITS.MAX_ROWS + 1 }, () =>
      row(),
    );
    expect(BulkStockInInputSchema.safeParse({ rows }).success).toBe(false);
  });

  it("accepts exactly the maximum number of rows", () => {
    const rows = Array.from({ length: BULK_STOCK_IN_LIMITS.MAX_ROWS }, () =>
      row(),
    );
    expect(BulkStockInInputSchema.safeParse({ rows }).success).toBe(true);
  });

  it("rejects unknown extra keys on the batch (strict)", () => {
    expect(
      BulkStockInInputSchema.safeParse({ rows: [row()], hack: 1 }).success,
    ).toBe(false);
  });

  it("propagates a row's own Quick Stock In validation (partial >= total)", () => {
    expect(
      BulkStockInInputSchema.safeParse({
        rows: [
          row({
            quantity: 2,
            unitCostMinor: 100_000,
            payment: {
              status: "partial",
              method: "cash",
              amountPaidMinor: 200_000,
            },
          }),
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a row with a smuggled actor id (strict row schema)", () => {
    expect(
      BulkStockInInputSchema.safeParse({
        rows: [row({ organizationId: "99999999-9999-4999-8999-999999999999" })],
      }).success,
    ).toBe(false);
  });
});

describe("BulkStockInRowResultSchema", () => {
  it("accepts an ok row carrying a full Quick Stock In result", () => {
    const parsed = BulkStockInRowResultSchema.parse({
      index: 0,
      status: "ok",
      result: okResult,
    });
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") throw new Error("status");
    expect(parsed.result.goodsReceiptNumber).toBe("GRN-000123");
  });

  it("accepts a failed row carrying a structured error", () => {
    const parsed = BulkStockInRowResultSchema.parse({
      index: 3,
      status: "failed",
      error: {
        code: "VALIDATION_FAILED",
        message: "Bad row.",
        field: "product",
      },
    });
    if (parsed.status !== "failed") throw new Error("status");
    expect(parsed.error.field).toBe("product");
  });

  it("rejects an ok row without a result", () => {
    expect(
      BulkStockInRowResultSchema.safeParse({ index: 0, status: "ok" }).success,
    ).toBe(false);
  });

  it("rejects a failed row that also smuggles a result (strict)", () => {
    expect(
      BulkStockInRowResultSchema.safeParse({
        index: 0,
        status: "failed",
        error: { code: "NOT_FOUND", message: "gone" },
        result: okResult,
      }).success,
    ).toBe(false);
  });
});

describe("BulkStockInResultSchema", () => {
  it("accepts a reconciled partial-success batch", () => {
    const parsed = BulkStockInResultSchema.parse({
      rows: [
        { index: 0, status: "ok", result: okResult },
        {
          index: 1,
          status: "failed",
          error: { code: "NOT_FOUND", message: "Supplier not found." },
        },
      ],
      okCount: 1,
      failedCount: 1,
    });
    expect(parsed.okCount).toBe(1);
    expect(parsed.failedCount).toBe(1);
  });

  it("rejects counts that do not match the rows", () => {
    expect(
      BulkStockInResultSchema.safeParse({
        rows: [{ index: 0, status: "ok", result: okResult }],
        okCount: 2,
        failedCount: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a total that does not equal the row count", () => {
    expect(
      BulkStockInResultSchema.safeParse({
        rows: [{ index: 0, status: "ok", result: okResult }],
        okCount: 1,
        failedCount: 1,
      }).success,
    ).toBe(false);
  });
});
