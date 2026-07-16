import type { PosSellableItem } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  addCartSelection,
  buildSaleDraftInput,
  cartStalenessReasons,
  cartTotals,
  cartUnitCount,
  parsePkrMajorInput,
  paymentLegs,
  paymentTotal,
  posAvailableCount,
  posCapabilities,
  setCartQuantity,
} from "./pos-state";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const RULE_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-07-16T08:00:00.000Z";

const common = {
  productVariantId: PRODUCT_ID,
  sku: "PH-SAMSUNG-A55-256",
  name: "256 GB Navy",
  brandName: "Samsung",
  modelName: "Galaxy A55",
  categoryName: "Phones",
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
  productVersion: 4,
  effectivePrice: {
    currency: "PKR",
    unitPriceMinor: 12_500_000,
    minimumUnitPriceMinor: 12_000_000,
    source: "price_rule" as const,
    sourceId: RULE_ID,
    version: 7,
    effectiveAt: NOW,
  },
};

const quantityLocation = {
  location: { id: LOCATION_ID, code: "MAIN", name: "Main counter" },
  availableQuantity: 3,
  stockVersion: 8,
};

const quantityItem: PosSellableItem = {
  ...common,
  trackingType: "quantity",
  stock: {
    availability: "saleable",
    locationChoices: [quantityLocation],
  },
};

const serializedItem: PosSellableItem = {
  ...common,
  trackingType: "serialized",
  stock: {
    availability: "saleable",
    serializedUnitChoices: [
      {
        serializedUnitId: UNIT_ID,
        unitVersion: 9,
        location: { id: LOCATION_ID, code: "MAIN", name: "Main counter" },
        condition: "new",
        ptaStatus: "pta_approved",
        identifiers: [{ type: "imei", value: "356789012345678" }],
      },
    ],
  },
};

describe("POS permission boundaries", () => {
  it("maps every prototype affordance to an exact server permission", () => {
    expect(
      posCapabilities([
        "catalog.view",
        "pricing.manage",
        "sales.create",
        "sales.post",
        "pricing.view",
        "payments.collect",
        "sales.view_profit",
        "sales.discount",
        "customers.view",
        "customers.manage",
        "demand.create",
      ]),
    ).toEqual({
      canViewCatalog: true,
      canManagePricing: true,
      canCreateSale: true,
      canPostSale: true,
      canViewPricing: true,
      canCollectPayment: true,
      canViewProfit: true,
      canDiscount: true,
      canViewCustomers: true,
      canManageCustomers: true,
      canRecordDemand: true,
    });
  });
});

describe("POS stock and cart state", () => {
  it("keeps priced out-of-stock rows visible but never adds them", () => {
    const out: PosSellableItem = {
      ...quantityItem,
      stock: { availability: "out_of_stock" },
    };
    expect(posAvailableCount(out)).toBe(0);
    expect(addCartSelection([], out, LOCATION_ID)).toEqual([]);
  });

  it("adds and caps an exact quantity location with its stock version", () => {
    let cart = addCartSelection([], quantityItem, LOCATION_ID);
    cart = addCartSelection(cart, quantityItem, LOCATION_ID);
    cart = setCartQuantity(cart, cart[0]!.key, 99);

    expect(cartUnitCount(cart)).toBe(3);
    expect(cart[0]).toMatchObject({
      trackingType: "quantity",
      quantity: 3,
      stockVersion: 8,
      location: { id: LOCATION_ID },
    });
    expect(buildSaleDraftInput(cart, null, 0, null).lines[0]).toEqual({
      trackingType: "quantity",
      productVariantId: PRODUCT_ID,
      priceSource: "price_rule",
      priceSourceId: RULE_ID,
      priceVersion: 7,
      locationId: LOCATION_ID,
      quantity: 3,
      stockVersion: 8,
    });
  });

  it("adds only the real serialized unit returned by pricing and never duplicates it", () => {
    let cart = addCartSelection([], serializedItem, "not-a-unit");
    expect(cart).toEqual([]);
    cart = addCartSelection(cart, serializedItem, UNIT_ID);
    cart = addCartSelection(cart, serializedItem, UNIT_ID);

    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({
      trackingType: "serialized",
      serializedUnitId: UNIT_ID,
      serializedUnitVersion: 9,
      identifiers: [{ type: "imei", value: "356789012345678" }],
    });
  });

  it("uses exact minor-unit totals and one sale-level discount", () => {
    const cart = setCartQuantity(
      addCartSelection([], quantityItem, LOCATION_ID),
      `Q:${PRODUCT_ID}:${LOCATION_ID}`,
      2,
    );
    expect(parsePkrMajorInput("1,000")).toBeNull();
    expect(parsePkrMajorInput("1000.50")).toBe(100_050);
    expect(cartTotals(cart, 100_000)).toEqual({
      subtotalMinor: 25_000_000,
      discountMinor: 100_000,
      totalMinor: 24_900_000,
    });
    expect(cartTotals(cart, 25_000_001)).toBeNull();
  });

  it("maps split payment labels to backend methods and validates references", () => {
    const valid = paymentLegs([
      { method: "cash", amountMinor: 5_000, reference: null },
      { method: "digital_wallet", amountMinor: 7_500, reference: "JC-42" },
    ]);
    expect(valid).toEqual([
      { method: "cash", amountMinor: 5_000, reference: null },
      { method: "digital_wallet", amountMinor: 7_500, reference: "JC-42" },
    ]);
    expect(paymentTotal(valid!)).toBe(12_500);
    expect(
      paymentLegs([{ method: "card", amountMinor: 100, reference: null }]),
    ).toBeNull();
  });

  it("detects changed authoritative price and stock snapshots", () => {
    const cart = addCartSelection([], quantityItem, LOCATION_ID);
    expect(cartStalenessReasons(cart, [quantityItem])).toEqual([]);
    expect(
      cartStalenessReasons(cart, [
        {
          ...quantityItem,
          effectivePrice: { ...quantityItem.effectivePrice, version: 8 },
        },
      ]),
    ).toEqual([`${quantityItem.sku}: authoritative price changed.`]);
    expect(
      cartStalenessReasons(cart, [
        {
          ...quantityItem,
          stock: {
            availability: "saleable",
            locationChoices: [
              {
                ...quantityLocation,
                stockVersion: 9,
              },
            ],
          },
        },
      ]),
    ).toEqual([`${quantityItem.sku}: location stock changed.`]);
  });
});
