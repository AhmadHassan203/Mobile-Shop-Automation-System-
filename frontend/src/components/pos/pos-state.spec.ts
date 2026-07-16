import type { ProductSummary, StockBalance } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  POS_SERVICE_AVAILABILITY,
  addCartProduct,
  buildPosProducts,
  cartUnitCount,
  checkoutBlockers,
  posCapabilities,
  posFlowSteps,
  setCartQuantity,
} from "./pos-state";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";

const product = {
  id: PRODUCT_ID,
  productModel: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Galaxy A55",
    brand: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Samsung",
    },
    category: {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Phones",
    },
  },
  sku: "PH-SAMSUNG-A55-256",
  name: "256 GB Navy",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  ram: "8 GB",
  storage: "256 GB",
  color: "Navy",
  region: "PK",
  warrantyType: "official",
  warrantyMonths: 12,
  isActive: true,
  version: 1,
  createdAt: "2026-07-16T08:00:00.000Z",
  updatedAt: "2026-07-16T08:00:00.000Z",
} satisfies ProductSummary;

const balance: StockBalance = {
  productVariant: {
    id: PRODUCT_ID,
    sku: product.sku,
    name: product.name,
  },
  locationId: LOCATION_ID,
  locationName: "Main counter",
  trackingType: "serialized",
  onHand: 3,
  reserved: 1,
  available: 2,
};

describe("POS permission boundaries", () => {
  it("maps every counter affordance to its exact server permission", () => {
    expect(
      posCapabilities([
        "catalog.view",
        "inventory.view",
        "sales.create",
        "payments.collect",
      ]),
    ).toEqual({
      canViewCatalog: true,
      canViewInventory: true,
      canCreateSale: true,
      canPostSale: false,
      canViewPricing: false,
      canCollectPayment: true,
      canViewProfit: false,
      canDiscount: false,
      canViewCustomers: false,
      canManageCustomers: false,
    });
  });

  it("keeps posting blocked even for a fully authorized user while APIs are absent", () => {
    const capabilities = posCapabilities([
      "catalog.view",
      "inventory.view",
      "sales.create",
      "sales.post",
      "pricing.view",
      "payments.collect",
    ]);
    const products = buildPosProducts([product], [balance]);
    const cart = addCartProduct([], products[0]!);

    expect(
      checkoutBlockers(capabilities, POS_SERVICE_AVAILABILITY, cart),
    ).toEqual([
      "The pricing read API has not been implemented yet.",
      "The payment collection API has not been implemented yet.",
      "The atomic sale-posting API has not been implemented yet.",
    ]);
  });
});

describe("POS stock and cart state", () => {
  it("builds products only from real catalog identity and derived balances", () => {
    expect(buildPosProducts([product], [balance])).toEqual([
      {
        id: PRODUCT_ID,
        sku: product.sku,
        name: product.name,
        brandName: "Samsung",
        modelName: "Galaxy A55",
        categoryName: "Phones",
        trackingType: "serialized",
        available: 2,
        onHand: 3,
        reserved: 1,
        locationNames: ["Main counter"],
      },
    ]);
  });

  it("never lets a local draft exceed the server-returned stock snapshot", () => {
    const posProduct = buildPosProducts([product], [balance])[0]!;
    let cart = addCartProduct([], posProduct);
    cart = addCartProduct(cart, posProduct);
    cart = addCartProduct(cart, posProduct);

    expect(cartUnitCount(cart)).toBe(2);
    expect(setCartQuantity(cart, PRODUCT_ID, 99)[0]?.quantity).toBe(2);
    expect(setCartQuantity(cart, PRODUCT_ID, 0)).toEqual([]);
  });

  it("shows the complete seven-step workflow and blocks unsafe stages", () => {
    const posProduct = buildPosProducts([product], [balance])[0]!;
    const cart = addCartProduct([], posProduct);

    expect(posFlowSteps(true, cart).map((step) => step.label)).toEqual([
      "Find",
      "Select",
      "Cart",
      "Customer",
      "Payment",
      "Review",
      "Complete",
    ]);
    expect(posFlowSteps(true, cart).slice(-3).map((step) => step.status)).toEqual([
      "blocked",
      "blocked",
      "blocked",
    ]);
  });
});
