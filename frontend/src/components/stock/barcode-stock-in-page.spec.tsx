import type { PosSellableItem } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import { initialBulkBatch, type BulkBatchState } from "./bulk-stock-in-page";
import {
  barcodeLineToForm,
  buildBarcodeBatch,
  existingLine,
  matchScannedItem,
  minorToInput,
  newLine,
  type BarcodeLine,
} from "./barcode-stock-in-page";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID_2 = "22222222-2222-4222-8222-222222222222";
const BRAND_ID = "55555555-5555-4555-8555-555555555555";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";

/** A minimal POS item — matchScannedItem only reads trackingType, sku, name. */
function posItem(
  overrides: Partial<{ productVariantId: string; sku: string; name: string; trackingType: "quantity" | "serialized" }>,
): PosSellableItem {
  return {
    productVariantId: VARIANT_ID,
    sku: "GALAXY-A15",
    name: "Galaxy A15",
    trackingType: "quantity",
    ...overrides,
  } as unknown as PosSellableItem;
}

function batch(overrides: Partial<BulkBatchState> = {}): BulkBatchState {
  return {
    ...initialBulkBatch(),
    stockLocationId: LOCATION_ID,
    supplierName: "Ali Traders",
    ...overrides,
  };
}

describe("minorToInput", () => {
  it("renders paisa as a two-decimal rupee string", () => {
    expect(minorToInput(2_800_000)).toBe("28000.00");
    expect(minorToInput(0)).toBe("0.00");
  });
});

describe("matchScannedItem", () => {
  it("prefers an exact SKU match and ignores serialized rows", () => {
    const items = [
      posItem({ trackingType: "serialized", sku: "OTHER" }),
      posItem({ productVariantId: VARIANT_ID_2, sku: "NOMATCH" }),
      posItem({ productVariantId: VARIANT_ID, sku: "GALAXY-A15" }),
    ];
    expect(matchScannedItem(items, "galaxy-a15")?.productVariantId).toBe(
      VARIANT_ID,
    );
  });

  it("falls back to the first quantity item when nothing matches exactly", () => {
    const items = [posItem({ productVariantId: VARIANT_ID_2, sku: "AAA" })];
    expect(matchScannedItem(items, "8901234")?.productVariantId).toBe(
      VARIANT_ID_2,
    );
  });

  it("returns undefined when there are no quantity items", () => {
    expect(matchScannedItem([], "x")).toBeUndefined();
    expect(
      matchScannedItem([posItem({ trackingType: "serialized" })], "x"),
    ).toBeUndefined();
  });
});

describe("existingLine / newLine factories", () => {
  it("prefills an existing line's selling price from the effective price", () => {
    const line = existingLine("k", {
      productVariantId: VARIANT_ID,
      name: "Galaxy A15",
      barcode: "8901",
      unitPriceMinor: 3_300_000,
    });
    expect(line.mode).toBe("existing");
    expect(line.productVariantId).toBe(VARIANT_ID);
    expect(line.sellingPrice).toBe("33000.00");
    expect(line.unitCost).toBe(""); // the buyer still enters purchase cost
  });

  it("creates a new line carrying the scanned barcode", () => {
    const line = newLine("k", "8901234567890");
    expect(line.mode).toBe("new");
    expect(line.barcode).toBe("8901234567890");
  });
});

describe("barcodeLineToForm", () => {
  it("maps an existing line to the existing-product Quick Stock In form", () => {
    const line: BarcodeLine = {
      ...existingLine("k", {
        productVariantId: VARIANT_ID,
        name: "Galaxy A15",
        barcode: "8901",
        unitPriceMinor: 3_300_000,
      }),
      unitCost: "28000",
    };
    const form = barcodeLineToForm(line, batch());
    expect(form.productMode).toBe("existing");
    expect(form.productVariantId).toBe(VARIANT_ID);
    expect(form.supplierName).toBe("Ali Traders");
    expect(form.stockLocationId).toBe(LOCATION_ID);
  });

  it("maps a new line to a new-product form with the barcode as SKU", () => {
    const line: BarcodeLine = {
      ...newLine("k", "8901"),
      productName: "Redmi 13",
      brandId: BRAND_ID,
      categoryId: CATEGORY_ID,
    };
    const form = barcodeLineToForm(line, batch());
    expect(form.productMode).toBe("new");
    expect(form.productName).toBe("Redmi 13");
    expect(form.variantName).toBe("Redmi 13");
    expect(form.sku).toBe("8901");
    expect(form.brandId).toBe(BRAND_ID);
  });
});

describe("buildBarcodeBatch", () => {
  function readyExisting(): BarcodeLine {
    return {
      ...existingLine("e", {
        productVariantId: VARIANT_ID,
        name: "Galaxy A15",
        barcode: "8901",
        unitPriceMinor: 3_300_000,
      }),
      unitCost: "28000",
    };
  }

  function readyNew(): BarcodeLine {
    return {
      ...newLine("n", "7777"),
      productName: "Redmi 13",
      brandId: BRAND_ID,
      categoryId: CATEGORY_ID,
      unitCost: "18000",
      sellingPrice: "21000",
    };
  }

  it("builds a batch mixing existing and new lines", () => {
    const result = buildBarcodeBatch([readyExisting(), readyNew()], batch());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toHaveLength(2);
    expect(result.value.rows[0]?.product.mode).toBe("existing");
    expect(result.value.rows[1]?.product.mode).toBe("new");
    expect(result.labels).toEqual(["Galaxy A15", "Redmi 13"]);
  });

  it("errors with no lines, no location, or no supplier", () => {
    expect(buildBarcodeBatch([], batch()).ok).toBe(false);
    const noLoc = buildBarcodeBatch([readyExisting()], batch({ stockLocationId: "" }));
    expect(noLoc.ok).toBe(false);
    if (!noLoc.ok) expect(noLoc.formError).toMatch(/location/i);
    const noSupplier = buildBarcodeBatch(
      [readyExisting()],
      batch({ supplierName: "" }),
    );
    expect(noSupplier.ok).toBe(false);
    if (!noSupplier.ok) expect(noSupplier.formError).toMatch(/supplier/i);
  });

  it("reports per-line errors keyed by index for an incomplete new line", () => {
    const result = buildBarcodeBatch(
      [readyExisting(), { ...newLine("n", "7777"), unitCost: "1", sellingPrice: "2" }],
      batch(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rowErrors.some((e) => e.index === 1)).toBe(true);
  });
});
