import type { SaleDetail, SaleSummary } from "@mobileshop/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SaleDetailView, SaleNotFoundState } from "./sale-detail-page";
import {
  formatSaleMoney,
  SaleRecordsTable,
  saleRecordsParametersFrom,
} from "./sales-records-page";

const IDS = {
  sale: "11111111-1111-4111-8111-111111111111",
  line: "22222222-2222-4222-8222-222222222222",
  variant: "33333333-3333-4333-8333-333333333333",
  location: "44444444-4444-4444-8444-444444444444",
  cashier: "66666666-6666-4666-8666-666666666666",
  customer: "77777777-7777-4777-8777-777777777777",
  payment: "88888888-8888-4888-8888-888888888888",
} as const;
const NOW = "2026-07-16T10:00:00.000Z";
const CURRENCY = "PKR";
const TZ = "Asia/Karachi";

const postedSummary: SaleSummary = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: "INV-000042",
  customer: { id: IDS.customer, name: "Bilal Khan", phone: "+923001234567" },
  lineCount: 1,
  unitCount: 2,
  totalMinor: 1_800,
  paymentMethods: ["cash"],
  profit: {
    availability: "available",
    cogsMinor: 1_000,
    grossProfitMinor: 800,
    grossMarginBasisPoints: 4_444,
  },
  cashier: { id: IDS.cashier, fullName: "Ayesha Malik" },
  salesperson: null,
  heldAt: null,
  postedAt: NOW,
  createdAt: NOW,
  version: 2,
};

const quantityLine: SaleDetail["lines"][number] = {
  id: IDS.line,
  trackingType: "quantity",
  product: { id: IDS.variant, sku: "CASE-BLK", name: "Black case" },
  location: { id: IDS.location, code: "MAIN", name: "Main counter" },
  priceVersion: 1,
  quantity: 2,
  unitPriceMinor: 1_000,
  lineSubtotalMinor: 2_000,
  discountMinor: 200,
  lineTotalMinor: 1_800,
  discountReason: "Loyal customer",
  profit: {
    availability: "available",
    cogsMinor: 1_000,
    grossProfitMinor: 800,
    grossMarginBasisPoints: 4_444,
  },
};

const postedDetail: SaleDetail = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: "INV-000042",
  customer: { id: IDS.customer, name: "Bilal Khan", phone: "+923001234567" },
  currency: CURRENCY,
  note: null,
  discountReason: "Loyal customer",
  hold: null,
  lines: [quantityLine],
  totals: { subtotalMinor: 2_000, discountMinor: 200, totalMinor: 1_800 },
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
  profit: {
    availability: "available",
    cogsMinor: 1_000,
    grossProfitMinor: 800,
    grossMarginBasisPoints: 4_444,
  },
  cashier: { id: IDS.cashier, fullName: "Ayesha Malik" },
  salesperson: null,
  version: 2,
  createdAt: NOW,
  updatedAt: NOW,
  postedAt: NOW,
  cancelledAt: null,
};

const redactedDetail: SaleDetail = {
  ...postedDetail,
  lines: [{ ...quantityLine, profit: { availability: "redacted" } }],
  profit: { availability: "redacted" },
};

describe("Sale records list", () => {
  it("renders real posted sales with invoice, customer, payment and profit", () => {
    const html = renderToStaticMarkup(
      <SaleRecordsTable
        canViewProfit
        currency={CURRENCY}
        items={[postedSummary]}
        timezone={TZ}
      />,
    );
    expect(html).toContain("INV-000042");
    expect(html).toContain("/sales/" + IDS.sale);
    expect(html).toContain("Bilal Khan");
    expect(html).toContain("Cash");
    expect(html).toContain("Posted");
    expect(html).toContain(formatSaleMoney(1_800, CURRENCY));
    // Gross profit column and value are visible with the profit permission.
    expect(html).toContain("Gross profit");
    expect(html).toContain(formatSaleMoney(800, CURRENCY));
    // No prototype/placeholder scaffolding.
    expect(html).not.toMatch(/prototype|coming soon|reserved for/i);
  });

  it("hides the gross profit column without the profit permission", () => {
    const html = renderToStaticMarkup(
      <SaleRecordsTable
        canViewProfit={false}
        currency={CURRENCY}
        items={[postedSummary]}
        timezone={TZ}
      />,
    );
    expect(html).toContain("INV-000042");
    expect(html).not.toContain("Gross profit");
    expect(html).not.toContain(formatSaleMoney(800, CURRENCY));
  });
});

describe("saleRecordsParametersFrom", () => {
  it("maps search, status, method and a valid date range", () => {
    const parameters = saleRecordsParametersFrom(
      new URLSearchParams({
        q: "INV-42",
        status: "posted",
        method: "cash",
        from: "2026-07-01",
        to: "2026-07-16",
        page: "3",
      }),
    );
    expect(parameters).toMatchObject({
      page: 3,
      q: "INV-42",
      status: "posted",
      paymentMethod: "cash",
      from: "2026-07-01",
      to: "2026-07-16",
      sort: "posted_at",
      direction: "desc",
    });
  });

  it("drops an inverted date range and invalid enum values", () => {
    const parameters = saleRecordsParametersFrom(
      new URLSearchParams({
        from: "2026-07-20",
        to: "2026-07-01",
        status: "nonsense",
        method: "gold",
      }),
    );
    expect(parameters.to).toBeUndefined();
    expect(parameters.from).toBe("2026-07-20");
    expect(parameters.status).toBeUndefined();
    expect(parameters.paymentMethod).toBeUndefined();
    expect(parameters.page).toBe(1);
  });
});

describe("Sale detail", () => {
  it("renders the full sale with reconciling line items, totals and payment", () => {
    const html = renderToStaticMarkup(
      <SaleDetailView
        branchName="Main branch"
        organizationName="Al-Madina Mobiles"
        sale={postedDetail}
        timezone={TZ}
      />,
    );
    expect(html).toContain("INV-000042");
    expect(html).toContain("Al-Madina Mobiles");
    expect(html).toContain("Main branch");
    expect(html).toContain("Ayesha Malik");
    expect(html).toContain("Bilal Khan");
    expect(html).toContain("Black case");
    expect(html).toContain("CASE-BLK");
    // Unit price, discount, line total and totals all reconcile on screen.
    expect(html).toContain(formatSaleMoney(1_000, CURRENCY));
    expect(html).toContain(formatSaleMoney(200, CURRENCY));
    expect(html).toContain(formatSaleMoney(2_000, CURRENCY));
    expect(html).toContain(formatSaleMoney(1_800, CURRENCY));
    // Payment breakdown renders the method and amount.
    expect(html).toContain("Cash");
    expect(html).toContain("Paid now");
    // Gross profit shown with the permission.
    expect(html).toContain(formatSaleMoney(800, CURRENCY));
    expect(html).toContain("margin");
    expect(html).not.toMatch(/prototype|reserved for|substitute|coming soon/i);
  });

  it("restricts profit for a redacted sale", () => {
    const html = renderToStaticMarkup(
      <SaleDetailView
        branchName="Main branch"
        organizationName="Al-Madina Mobiles"
        sale={redactedDetail}
        timezone={TZ}
      />,
    );
    expect(html).toContain("Profit is restricted");
    expect(html).not.toMatch(/gross profit/i);
  });

  it("shows a friendly not-found state without substituting a sale", () => {
    const html = renderToStaticMarkup(
      <SaleNotFoundState id={IDS.sale} />,
    );
    expect(html).toContain("This sale was not found");
    expect(html).toContain(IDS.sale);
    expect(html).toContain("/sales");
    expect(html).not.toMatch(/prototype|reserved for/i);
  });
});
