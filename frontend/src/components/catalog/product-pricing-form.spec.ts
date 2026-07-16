import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  ProductPricingForm,
  productPriceDraftFrom,
  productPriceInputFromDraft,
  productPriceSaveErrorMessage,
} from "./product-pricing-form";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

const DEFAULT_PRICE = {
  currency: "PKR",
  unitPriceMinor: 12_500_025,
  minimumUnitPriceMinor: 12_000_001,
  source: "variant_default" as const,
  sourceId: null,
  version: 3,
  effectiveAt: "2026-07-16T10:00:00.000Z",
};

describe("product default-price form state", () => {
  it("converts decimal PKR to exact integer paisa with the catalog version", () => {
    expect(
      productPriceInputFromDraft(
        { sellingPrice: "1234.56", minimumPrice: "1000.01" },
        7,
      ),
    ).toEqual({
      ok: true,
      input: {
        unitPriceMinor: 123_456,
        minimumUnitPriceMinor: 100_001,
        productVersion: 7,
      },
    });
  });

  it("rejects fractions below one paisa and an inverted minimum", () => {
    const precision = productPriceInputFromDraft(
      { sellingPrice: "1.001", minimumPrice: "0.00" },
      3,
    );
    const inverted = productPriceInputFromDraft(
      { sellingPrice: "100.00", minimumPrice: "100.01" },
      3,
    );

    expect(precision).toMatchObject({
      ok: false,
      errors: { sellingPrice: expect.stringContaining("2 decimal") },
    });
    expect(inverted).toMatchObject({
      ok: false,
      errors: { minimumPrice: expect.stringContaining("cannot exceed") },
    });
  });

  it("prefills only a default price, never an overriding rule", () => {
    expect(productPriceDraftFrom(DEFAULT_PRICE)).toEqual({
      sellingPrice: "125000.25",
      minimumPrice: "120000.01",
    });
    expect(
      productPriceDraftFrom({
        ...DEFAULT_PRICE,
        source: "price_rule",
        sourceId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({ sellingPrice: "", minimumPrice: "" });
  });

  it("renders a managed form with exact prefilled values", () => {
    const html = renderToStaticMarkup(
      createElement(ProductPricingForm, {
        canManage: true,
        effectivePrice: DEFAULT_PRICE,
        onSaved: vi.fn(),
        productVariantId: PRODUCT_ID,
        productVersion: 3,
      }),
    );

    expect(html).toContain("Selling price (PKR)");
    expect(html).toContain('value="125000.25"');
    expect(html).toContain('value="120000.01"');
    expect(html).toContain("Save default price");
  });

  it("renders view-only copy and no mutation control without pricing.manage", () => {
    const html = renderToStaticMarkup(
      createElement(ProductPricingForm, {
        canManage: false,
        effectivePrice: DEFAULT_PRICE,
        onSaved: vi.fn(),
        productVariantId: PRODUCT_ID,
        productVersion: 3,
      }),
    );

    expect(html).toContain("pricing.manage");
    expect(html).not.toContain("Save default price");
  });

  it("turns an optimistic conflict into actionable reload copy", () => {
    expect(
      productPriceSaveErrorMessage(
        new ApiError("Conflict", { code: "OPTIMISTIC_LOCK_FAILED" }),
      ),
    ).toContain("Reload it and reapply");
  });
});
