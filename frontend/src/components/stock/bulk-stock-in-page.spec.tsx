import { describe, expect, it } from "vitest";
import {
  buildBulkStockInInput,
  initialBulkBatch,
  isBulkRowBlank,
  makeBulkRow,
  parsePastedBulkRows,
  rowToQuickStockInForm,
  type BulkBatchState,
  type BulkRowState,
} from "./bulk-stock-in-page";

const BRAND_ID = "55555555-5555-4555-8555-555555555555";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const BRAND_ID_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function row(overrides: Partial<BulkRowState> = {}): BulkRowState {
  return {
    ...makeBulkRow("k"),
    productName: "Galaxy A15",
    brandId: BRAND_ID,
    categoryId: CATEGORY_ID,
    quantity: "5",
    unitCost: "28000",
    sellingPrice: "33000",
    ...overrides,
  };
}

function batch(overrides: Partial<BulkBatchState> = {}): BulkBatchState {
  return {
    ...initialBulkBatch(),
    stockLocationId: LOCATION_ID,
    supplierName: "Ali Traders",
    supplierPhone: "03001234567",
    ...overrides,
  };
}

describe("isBulkRowBlank", () => {
  it("treats a freshly added row as blank (quantity default aside)", () => {
    expect(isBulkRowBlank(makeBulkRow("k"))).toBe(true);
  });

  it("is not blank once any meaningful field is filled", () => {
    expect(isBulkRowBlank(makeBulkRow("k"))).toBe(true);
    expect(isBulkRowBlank({ ...makeBulkRow("k"), productName: "X" })).toBe(
      false,
    );
    expect(isBulkRowBlank({ ...makeBulkRow("k"), barcode: "890" })).toBe(false);
  });
});

describe("rowToQuickStockInForm", () => {
  it("maps to a new-product, new-supplier Quick Stock In form and falls back the variant name", () => {
    const form = rowToQuickStockInForm(row({ variantName: "" }), batch());
    expect(form.productMode).toBe("new");
    expect(form.supplierMode).toBe("new");
    expect(form.variantName).toBe("Galaxy A15"); // falls back to product name
    expect(form.supplierName).toBe("Ali Traders"); // batch default
    expect(form.stockLocationId).toBe(LOCATION_ID);
  });

  it("lets a per-row supplier override the batch default", () => {
    const form = rowToQuickStockInForm(
      row({ supplierName: "Bilal Mobiles", supplierPhone: "03119998877" }),
      batch(),
    );
    expect(form.supplierName).toBe("Bilal Mobiles");
    expect(form.supplierPhone).toBe("03119998877");
  });
});

describe("buildBulkStockInInput", () => {
  it("builds a valid batch of new-product rows with the barcode as SKU", () => {
    const result = buildBulkStockInInput(
      [row({ barcode: "8901234567890" }), row({ productName: "Redmi 13" })],
      batch(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toHaveLength(2);
    expect(result.labels).toEqual(["Galaxy A15", "Redmi 13"]);
    const first = result.value.rows[0];
    expect(first?.product.mode).toBe("new");
    if (first?.product.mode === "new") {
      expect(first.product.sku).toBe("8901234567890");
      expect(first.product.brandId).toBe(BRAND_ID);
    }
    expect(first?.supplier.mode).toBe("new");
    if (first?.supplier.mode === "new") {
      expect(first.supplier.name).toBe("Ali Traders");
    }
    expect(first?.quantity).toBe(5);
    // 28,000 rupees -> 2,800,000 minor units.
    expect(first?.unitCostMinor).toBe(2_800_000);
  });

  it("skips blank rows and errors when nothing is left", () => {
    const result = buildBulkStockInInput(
      [makeBulkRow("a"), makeBulkRow("b")],
      batch(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toMatch(/at least one row/i);
  });

  it("requires a stock location", () => {
    const result = buildBulkStockInInput(
      [row()],
      batch({ stockLocationId: "" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.formError).toMatch(/stock location/i);
  });

  it("requires a default supplier only when a row omits its own", () => {
    const noDefault = buildBulkStockInInput(
      [row()],
      batch({ supplierName: "" }),
    );
    expect(noDefault.ok).toBe(false);
    if (!noDefault.ok) {
      expect(noDefault.formError).toMatch(/default supplier/i);
    }
    // With a per-row supplier the missing default is fine.
    const withRowSupplier = buildBulkStockInInput(
      [row({ supplierName: "Bilal Mobiles" })],
      batch({ supplierName: "" }),
    );
    expect(withRowSupplier.ok).toBe(true);
  });

  it("reports per-row field errors keyed by grid index", () => {
    const result = buildBulkStockInInput(
      [row(), row({ productName: "", variantName: "" })],
      batch(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0]?.index).toBe(1);
  });
});

describe("parsePastedBulkRows", () => {
  const brandsByName = new Map([
    ["samsung", BRAND_ID],
    ["xiaomi", BRAND_ID_2],
  ]);
  const categoriesByName = new Map([
    ["phones", CATEGORY_ID],
    ["accessories", CATEGORY_ID_2],
  ]);

  it("maps tab-separated columns and resolves brand/category by name", () => {
    const parsed = parsePastedBulkRows(
      "Galaxy A15\tSamsung\tPhones\t8/256\t8901\t5\t28000\t33000\tAli Traders\t03001234567",
      brandsByName,
      categoriesByName,
      (i) => `p-${i}`,
    );
    expect(parsed).toHaveLength(1);
    const only = parsed[0];
    expect(only?.productName).toBe("Galaxy A15");
    expect(only?.brandId).toBe(BRAND_ID);
    expect(only?.categoryId).toBe(CATEGORY_ID);
    expect(only?.barcode).toBe("8901");
    expect(only?.quantity).toBe("5");
    expect(only?.unitCost).toBe("28000");
    expect(only?.supplierName).toBe("Ali Traders");
  });

  it("leaves an unmatched brand/category blank and ignores empty lines", () => {
    const parsed = parsePastedBulkRows(
      "Nokia 105,Nokia,Featurephones,,,3,1500,2000\n\n",
      brandsByName,
      categoriesByName,
      (i) => `p-${i}`,
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.brandId).toBe(""); // "Nokia" not in the map
    expect(parsed[0]?.categoryId).toBe(""); // "Featurephones" not in the map
    expect(parsed[0]?.quantity).toBe("3");
  });
});
