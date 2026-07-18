import { describe, expect, it } from "vitest";
import { resolveScannedProduct } from "./product-catalog-page";

const A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sku: "PH-A15-256" };
const B = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sku: "PH-REDMI-128" };

describe("catalog barcode scan resolution", () => {
  it("resolves a matching search hit to the existing product (no duplicate)", () => {
    expect(resolveScannedProduct([A, B], "8901234567890")).toEqual({
      kind: "existing",
      productId: A.id,
    });
  });

  it("prefers an exact SKU match over search order", () => {
    expect(resolveScannedProduct([A, B], "ph-redmi-128")).toEqual({
      kind: "existing",
      productId: B.id,
    });
  });

  it("treats an empty result as a new product carrying the scanned barcode", () => {
    expect(resolveScannedProduct([], " 8909999 ")).toEqual({
      kind: "new",
      barcode: "8909999",
    });
  });
});
