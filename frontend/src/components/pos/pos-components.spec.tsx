import type {
  PosSellableItem,
  ProductSummary,
  SaleReceipt,
  SaleReview,
} from "@mobileshop/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ProductResults,
  ReceiptContent,
  ReviewContent,
} from "./pos-components";

const IDS = {
  sale: "11111111-1111-4111-8111-111111111111",
  line: "22222222-2222-4222-8222-222222222222",
  variant: "33333333-3333-4333-8333-333333333333",
  location: "44444444-4444-4444-8444-444444444444",
  unit: "55555555-5555-4555-8555-555555555555",
  user: "66666666-6666-4666-8666-666666666666",
  payment: "77777777-7777-4777-8777-777777777777",
  model: "88888888-8888-4888-8888-888888888888",
  brand: "99999999-9999-4999-8999-999999999999",
  category: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as const;
const NOW = "2026-07-16T10:00:00.000Z";
const location = { id: IDS.location, code: "MAIN", name: "Main counter" };

const commonItem = {
  productVariantId: IDS.variant,
  sku: "PH-SAMSUNG-A55-256",
  name: "256 GB Navy",
  brandName: "Samsung",
  modelName: "Galaxy A55",
  categoryName: "Phones",
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
  productVersion: 1,
  effectivePrice: {
    currency: "PKR",
    unitPriceMinor: 12_500_000,
    minimumUnitPriceMinor: 12_000_000,
    source: "variant_default" as const,
    sourceId: null,
    version: 1,
    effectiveAt: NOW,
  },
};

const serialized: PosSellableItem = {
  ...commonItem,
  trackingType: "serialized",
  stock: {
    availability: "saleable",
    serializedUnitChoices: [
      {
        serializedUnitId: IDS.unit,
        unitVersion: 2,
        location,
        condition: "new",
        ptaStatus: "pta_approved",
        identifiers: [{ type: "imei", value: "356789012345678" }],
      },
    ],
  },
};

const outOfStock: PosSellableItem = {
  ...commonItem,
  productVariantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sku: "CASE-BLK",
  name: "Black case",
  trackingType: "quantity",
  stock: { availability: "out_of_stock" },
};

const unpriced: ProductSummary = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  productModel: {
    id: IDS.model,
    name: "Charger 25W",
    brand: { id: IDS.brand, name: "Samsung" },
    category: { id: IDS.category, name: "Accessories" },
  },
  sku: "CHG-SAM-25W",
  name: "White",
  trackingType: "quantity",
  condition: "new",
  ptaStatus: "not_applicable",
  ram: null,
  storage: null,
  color: "White",
  region: null,
  warrantyType: "none",
  warrantyMonths: null,
  isActive: true,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const reviewLine = {
  id: IDS.line,
  trackingType: "quantity" as const,
  product: { id: IDS.variant, sku: "CASE-BLK", name: "Black case" },
  location,
  priceVersion: 1,
  quantity: 2,
  unitPriceMinor: 1_000,
  lineSubtotalMinor: 2_000,
  discountMinor: 200,
  lineTotalMinor: 1_800,
  discountReason: "Loyal customer",
  profit: { availability: "redacted" as const },
};

const review: SaleReview = {
  saleId: IDS.sale,
  version: 2,
  customer: null,
  currency: "PKR",
  discountReason: "Loyal customer",
  lines: [reviewLine],
  totals: { subtotalMinor: 2_000, discountMinor: 200, totalMinor: 1_800 },
  profit: { availability: "redacted" },
  warnings: [
    {
      code: "cash_session_required",
      severity: "blocking",
      message: "Open a cash session before posting.",
      lineId: null,
    },
  ],
  canPost: false,
  reviewedAt: NOW,
};

const receipt: SaleReceipt = {
  saleId: IDS.sale,
  invoiceNumber: "INV-000001",
  currency: "PKR",
  issuedAt: NOW,
  shop: {
    organizationName: "Al-Madina Mobiles",
    branchName: "Main branch",
    addressLine: "Hall Road, Lahore",
    phone: null,
  },
  customer: null,
  cashier: { id: IDS.user, fullName: "Haseeb Ahmed" },
  salesperson: null,
  lines: [
    {
      id: IDS.line,
      trackingType: "quantity",
      product: reviewLine.product,
      locationName: location.name,
      quantity: 2,
      unitPriceMinor: 1_000,
      lineSubtotalMinor: 2_000,
      discountMinor: 200,
      lineTotalMinor: 1_800,
      discountReason: "Loyal customer",
    },
  ],
  totals: review.totals,
  settlement: {
    payments: [
      {
        id: IDS.payment,
        method: "cash",
        amountMinor: 1_800,
        reference: null,
        recordedAt: NOW,
      },
    ],
    paidMinor: 1_800,
    receivableMinor: 0,
  },
  footer: "Thank you",
};

describe("POS prototype surfaces", () => {
  it("shows priced OOS demand, real IMEI selection, and disabled unpriced catalog rows", () => {
    const html = renderToStaticMarkup(
      <ProductResults
        canManagePricing
        canRecordDemand
        items={[outOfStock, serialized]}
        onAdd={vi.fn()}
        onChoice={vi.fn()}
        pricingAvailable
        selectedChoices={{}}
        unpricedItems={[unpriced]}
      />,
    );

    expect(html).toContain("Out of stock");
    expect(html).toContain("record demand");
    expect(html).toContain("Choose real IMEI / unit");
    expect(html).toContain("356789012345678");
    expect(html).toContain("Price not configured");
    expect(html).toContain("Open catalog / pricing");
  });

  it("renders server warnings while keeping redacted profit structural", () => {
    const html = renderToStaticMarkup(<ReviewContent review={review} />);
    expect(html).toContain("Open a cash session before posting.");
    expect(html).toContain("Blocking");
    expect(html).toContain("Profit is restricted");
    expect(html).not.toContain("Cost basis");
  });

  it("renders an immutable customer receipt without profit or COGS", () => {
    const html = renderToStaticMarkup(<ReceiptContent receipt={receipt} />);
    expect(html).toContain("INV-000001");
    expect(html).toContain("Al-Madina Mobiles");
    expect(html).toContain("Cashier: Haseeb Ahmed");
    expect(html).not.toMatch(/cogs|gross profit/i);
  });
});
