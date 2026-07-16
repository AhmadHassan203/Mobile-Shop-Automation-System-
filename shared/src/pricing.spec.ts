import { describe, expect, it } from "vitest";
import {
  EffectiveSalePriceSchema,
  PosSellableItemSchema,
  PosSellableLookupQuerySchema,
  PosSellablePageSchema,
  SetVariantDefaultPriceInputSchema,
  VariantDefaultPriceResponseSchema,
} from "./pricing";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const UNIT_ID = "33333333-3333-4333-8333-333333333333";
const PRICE_ID = "44444444-4444-4444-8444-444444444444";

const effectivePrice = {
  currency: "PKR",
  unitPriceMinor: 25_000,
  minimumUnitPriceMinor: 22_000,
  source: "price_rule",
  sourceId: PRICE_ID,
  version: 3,
  effectiveAt: "2026-07-16T10:00:00.000Z",
} as const;

const identity = {
  productVariantId: VARIANT_ID,
  sku: "CASE-BLK",
  name: "Black case",
  brandName: "Baseus",
  modelName: "Protective case",
  categoryName: "Accessories",
  condition: "new",
  ptaStatus: "not_applicable",
  productVersion: 2,
  effectivePrice,
} as const;

const location = { id: LOCATION_ID, code: "MAIN", name: "Main store" } as const;

describe("POS sellable pricing query", () => {
  it("normalizes search and applies bounded pagination defaults", () => {
    expect(
      PosSellableLookupQuerySchema.parse({ q: "  iPhone   15  " }),
    ).toEqual({
      page: 1,
      pageSize: 25,
      q: "iPhone 15",
    });
  });

  it("never accepts tenant, branch or actor scope from the browser", () => {
    expect(
      PosSellableLookupQuerySchema.safeParse({
        q: "phone",
        branchId: LOCATION_ID,
      }).success,
    ).toBe(false);
  });
});

describe("authoritative POS item pricing", () => {
  it("carries location-specific quantity choices with a stock version", () => {
    const result = PosSellableItemSchema.parse({
      ...identity,
      trackingType: "quantity",
      stock: {
        availability: "saleable",
        locationChoices: [{ location, availableQuantity: 7, stockVersion: 4 }],
      },
    });

    expect(result.trackingType).toBe("quantity");
    if (result.trackingType === "quantity") {
      expect(result.stock.availability).toBe("saleable");
    }
  });

  it("offers only real serialized unit, version, location and identifiers", () => {
    const result = PosSellableItemSchema.parse({
      ...identity,
      trackingType: "serialized",
      stock: {
        availability: "saleable",
        serializedUnitChoices: [
          {
            serializedUnitId: UNIT_ID,
            unitVersion: 5,
            location,
            condition: "new",
            ptaStatus: "pta_approved",
            identifiers: [{ type: "imei", value: "356938035643809" }],
          },
        ],
      },
    });

    expect(result.trackingType).toBe("serialized");
    if (
      result.trackingType === "serialized" &&
      result.stock.availability === "saleable"
    ) {
      expect(result.stock.serializedUnitChoices[0]?.serializedUnitId).toBe(
        UNIT_ID,
      );
    }
  });

  it("keeps a priced out-of-stock product visible without selectable choices", () => {
    expect(
      PosSellableItemSchema.safeParse({
        ...identity,
        trackingType: "quantity",
        stock: { availability: "out_of_stock" },
      }).success,
    ).toBe(true);
    expect(
      PosSellableItemSchema.safeParse({
        ...identity,
        trackingType: "quantity",
        stock: {
          availability: "out_of_stock",
          locationChoices: [],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate choices and empty saleable branches", () => {
    expect(
      PosSellableItemSchema.safeParse({
        ...identity,
        trackingType: "quantity",
        stock: {
          availability: "saleable",
          locationChoices: [
            { location, availableQuantity: 2, stockVersion: 1 },
            { location, availableQuantity: 1, stockVersion: 2 },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      PosSellableItemSchema.safeParse({
        ...identity,
        trackingType: "serialized",
        stock: { availability: "saleable", serializedUnitChoices: [] },
      }).success,
    ).toBe(false);
  });

  it("enforces exact safe money and price-source identity", () => {
    expect(
      EffectiveSalePriceSchema.safeParse({
        ...effectivePrice,
        minimumUnitPriceMinor: 30_000,
      }).success,
    ).toBe(false);
    expect(
      EffectiveSalePriceSchema.safeParse({
        ...effectivePrice,
        unitPriceMinor: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      EffectiveSalePriceSchema.safeParse({
        ...effectivePrice,
        source: "variant_default",
        sourceId: PRICE_ID,
      }).success,
    ).toBe(false);
    expect(
      EffectiveSalePriceSchema.safeParse({
        ...effectivePrice,
        source: "variant_default",
        sourceId: null,
      }).success,
    ).toBe(true);
  });

  it("rejects leaked cost, margin and tenant fields from lookup responses", () => {
    for (const leaked of [
      { organizationId: VARIANT_ID },
      { landedCostMinor: 10_000 },
      { grossProfitMinor: 15_000 },
    ]) {
      expect(
        PosSellableItemSchema.safeParse({
          ...identity,
          ...leaked,
          trackingType: "quantity",
          stock: { availability: "out_of_stock" },
        }).success,
      ).toBe(false);
    }
  });

  it("wraps mixed saleable and out-of-stock results in a strict page", () => {
    expect(
      PosSellablePageSchema.safeParse({
        items: [
          {
            ...identity,
            trackingType: "quantity",
            stock: { availability: "out_of_stock" },
          },
        ],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      }).success,
    ).toBe(true);
  });
});

describe("variant default-price management", () => {
  it("accepts only safe money with the product version the editor read", () => {
    expect(
      SetVariantDefaultPriceInputSchema.parse({
        unitPriceMinor: 250_000,
        minimumUnitPriceMinor: 200_000,
        productVersion: 4,
      }),
    ).toEqual({
      unitPriceMinor: 250_000,
      minimumUnitPriceMinor: 200_000,
      productVersion: 4,
    });
  });

  it("rejects an inverted floor, unsafe money, and smuggled scope or cost", () => {
    expect(
      SetVariantDefaultPriceInputSchema.safeParse({
        unitPriceMinor: 200_000,
        minimumUnitPriceMinor: 250_000,
        productVersion: 4,
      }).success,
    ).toBe(false);
    expect(
      SetVariantDefaultPriceInputSchema.safeParse({
        unitPriceMinor: Number.MAX_SAFE_INTEGER + 1,
        minimumUnitPriceMinor: 0,
        productVersion: 4,
      }).success,
    ).toBe(false);
    for (const leaked of [
      { organizationId: VARIANT_ID },
      { branchId: LOCATION_ID },
      { landedCostMinor: 10_000 },
    ]) {
      expect(
        SetVariantDefaultPriceInputSchema.safeParse({
          unitPriceMinor: 250_000,
          minimumUnitPriceMinor: 200_000,
          productVersion: 4,
          ...leaked,
        }).success,
      ).toBe(false);
    }
  });

  it("returns strict default-price evidence without tenant or cost fields", () => {
    const response = {
      productVariantId: VARIANT_ID,
      effectivePrice: {
        currency: "PKR",
        unitPriceMinor: 250_000,
        minimumUnitPriceMinor: 200_000,
        source: "variant_default",
        sourceId: null,
        version: 5,
        effectiveAt: "2026-07-16T10:00:00.000Z",
      },
    } as const;

    expect(VariantDefaultPriceResponseSchema.safeParse(response).success).toBe(
      true,
    );
    expect(
      VariantDefaultPriceResponseSchema.safeParse({
        ...response,
        actualCostMinor: 100_000,
      }).success,
    ).toBe(false);
  });
});
