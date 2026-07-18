import {
  IDEMPOTENCY_KEY_HEADER,
  resolveQuickStockInAmounts,
  type QuickStockInInput,
  type QuickStockInResult,
} from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "@/lib/api/client";
import { quickStockIn } from "@/lib/api/inventory";
import { queryKeys } from "@/lib/query/keys";

// next/link needs no router context under renderToStaticMarkup once reduced to a
// plain anchor, matching how the sibling specs stub next modules.
vi.mock("next/link", () => ({
  default: (props: { readonly href: string; readonly children: ReactNode }) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require("react") as typeof import("react")).createElement(
      "a",
      { href: props.href },
      props.children,
    ),
}));

const {
  QuickStockInErrorBanner,
  QuickStockInPage,
  QuickStockInSubmitButton,
  QuickStockInSuccess,
  buildQuickStockInInput,
  initialQuickStockInForm,
  quickStockInCapabilities,
  quickStockInErrorMessage,
  quickStockInInvalidationKeys,
  toMinorField,
} = await import("./quick-stock-in-page");

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const BRAND_ID = "55555555-5555-4555-8555-555555555555";
const PO_ID = "66666666-6666-4666-8666-666666666666";
const GR_ID = "77777777-7777-4777-8777-777777777777";
const PAYABLE_ID = "88888888-8888-4888-8888-888888888888";
const IDEMPOTENCY_KEY = "99999999-9999-4999-8999-999999999999";

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function render(client: QueryClient, node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, node),
  );
}

const baseForm = {
  ...initialQuickStockInForm(),
  productMode: "existing" as const,
  productVariantId: VARIANT_ID,
  supplierMode: "existing" as const,
  supplierId: SUPPLIER_ID,
  stockLocationId: LOCATION_ID,
  quantity: "5",
  unitCost: "100",
  sellingPrice: "150",
};

const result: QuickStockInResult = {
  product: {
    id: VARIANT_ID,
    name: "Galaxy A15 8/256 Black",
    sku: "SAM-A15-256-BLK",
    wasCreated: true,
  },
  supplier: { id: SUPPLIER_ID, name: "City Distributors", wasCreated: true },
  quantityAdded: 5,
  currentStockOnHand: 12,
  unitCostMinor: 10_000,
  purchaseTotalMinor: 50_000,
  sellingPriceMinor: 15_000,
  stockLocationId: LOCATION_ID,
  stockLocationName: "Main store",
  purchaseOrderId: PO_ID,
  purchaseOrderNumber: "PO-2026-014",
  goodsReceiptId: GR_ID,
  goodsReceiptNumber: "GR-2026-021",
  paymentStatus: "partial",
  paymentMethod: "digital_wallet",
  walletProvider: "jazzcash",
  paidAmountMinor: 20_000,
  remainingPayableMinor: 30_000,
  payableId: PAYABLE_ID,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("quick stock in permission boundary", () => {
  it("maps only purchases.receive to receiving capability", () => {
    expect(quickStockInCapabilities(["purchases.receive"]).canReceive).toBe(
      true,
    );
    expect(quickStockInCapabilities(["inventory.view"]).canReceive).toBe(false);
    expect(quickStockInCapabilities(undefined).canReceive).toBe(false);
  });

  it("renders a forbidden state without receiving permission", () => {
    const client = newQueryClient();
    client.setQueryData(queryKeys.currentAuth, {
      permissions: ["inventory.view"],
    });

    const html = render(client, createElement(QuickStockInPage));

    expect(html).toContain("Receiving access required");
    expect(html).toContain("No stock request was sent");
    expect(html).not.toContain("Save Purchase & Add Stock");
  });
});

describe("quick stock in form rendering", () => {
  it("renders every section, both mode toggles and the primary action label", () => {
    const client = newQueryClient();
    client.setQueryData(queryKeys.currentAuth, {
      permissions: ["purchases.receive"],
    });

    const html = render(client, createElement(QuickStockInPage));

    for (const section of [
      "Product",
      "Supplier",
      "Stock",
      "Payment",
      "Reference",
      "Summary",
    ]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("Existing product");
    expect(html).toContain("New product");
    expect(html).toContain("Existing supplier");
    expect(html).toContain("New supplier");
    expect(html).toContain("Paid in full");
    expect(html).toContain("Buy on credit");
    expect(html).toContain("Save Purchase &amp; Add Stock");
    expect(html).not.toContain("Saving…");
    // The serialized redirect notice is gone; the flow is quantity-only.
    expect(html).not.toContain("Purchasing → Goods Receipt");
  });
});

describe("quick stock in submit button state", () => {
  it("labels and enables the idle button, disables and relabels while pending", () => {
    const idle = renderToStaticMarkup(
      createElement(QuickStockInSubmitButton, { pending: false }),
    );
    expect(idle).toContain("Save Purchase &amp; Add Stock");
    // The disabled ATTRIBUTE is absent (the class list contains Tailwind
    // `disabled:` variants, so match the rendered attribute precisely).
    expect(idle).not.toContain('disabled=""');

    const pending = renderToStaticMarkup(
      createElement(QuickStockInSubmitButton, { pending: true }),
    );
    expect(pending).toContain("Saving…");
    expect(pending).toContain('disabled=""');
  });
});

describe("quick stock in payload building", () => {
  it("builds an existing-product / existing-supplier full-cash payload", () => {
    const built = buildQuickStockInInput(baseForm);

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value).toEqual({
      product: { mode: "existing", productVariantId: VARIANT_ID },
      supplier: { mode: "existing", supplierId: SUPPLIER_ID },
      stockLocationId: LOCATION_ID,
      quantity: 5,
      unitCostMinor: 10_000,
      sellingPriceMinor: 15_000,
      payment: { status: "paid_full", method: "cash" },
    });
  });

  it("builds a new-product / new-supplier payload, omitting blank optionals", () => {
    const built = buildQuickStockInInput({
      ...baseForm,
      productMode: "new",
      productName: "Galaxy A15",
      variantName: "Galaxy A15 8/256 Black",
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
      supplierMode: "new",
      supplierName: "City Distributors",
      paymentTermsDays: "30",
      unitCost: "250.50",
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.product).toEqual({
      mode: "new",
      productName: "Galaxy A15",
      variantName: "Galaxy A15 8/256 Black",
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
    });
    expect(built.value.supplier).toEqual({
      mode: "new",
      name: "City Distributors",
      paymentTermsDays: 30,
    });
    // 250.50 rupees becomes exactly 25050 paisa — never a float.
    expect(built.value.unitCostMinor).toBe(25_050);
  });

  it("receives a phone as quantity-only stock with no serial/imei fields", () => {
    const built = buildQuickStockInInput({
      ...baseForm,
      productMode: "new",
      productName: "iPhone 15",
      variantName: "iPhone 15 128GB Black",
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const serialized = JSON.stringify(built.value).toLowerCase();
    expect(serialized).not.toContain("imei");
    expect(serialized).not.toContain("serial");
    expect(serialized).not.toContain("trackingtype");
    expect(built.value.product).toEqual({
      mode: "new",
      productName: "iPhone 15",
      variantName: "iPhone 15 128GB Black",
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
    });
  });

  it("surfaces per-field errors for an empty cost and a non-positive quantity", () => {
    const built = buildQuickStockInInput({
      ...baseForm,
      quantity: "0",
      unitCost: "",
    });

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.errors.unitCost).toBeDefined();
    expect(built.errors.quantity).toBeDefined();
    expect(built.errors.sellingPrice).toBeUndefined();
  });

  it("rejects a non-numeric rupee amount with a friendly message", () => {
    expect(toMinorField("abc").error).toContain("valid amount");
    expect(toMinorField("100.5").minor).toBe(10_050);
  });
});

describe("quick stock in payment mapping", () => {
  it("maps a full JazzCash payment to digital_wallet + walletProvider", () => {
    const built = buildQuickStockInInput({
      ...baseForm,
      paymentStatus: "paid_full",
      paymentTender: "jazzcash",
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.payment).toEqual({
      status: "paid_full",
      method: "digital_wallet",
      walletProvider: "jazzcash",
    });
  });

  it("builds a partial payment with amountPaidMinor under the total", () => {
    const built = buildQuickStockInInput({
      ...baseForm,
      paymentStatus: "partial",
      paymentTender: "cash",
      amountPaid: "200", // 20000 paisa of a 50000 total
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.payment).toEqual({
      status: "partial",
      method: "cash",
      amountPaidMinor: 20_000,
    });
    // The live summary uses the shared resolver, so remaining = total − paid.
    expect(
      resolveQuickStockInAmounts({
        quantity: 5,
        unitCostMinor: 10_000,
        payment: { status: "partial", method: "cash", amountPaidMinor: 20_000 },
      }),
    ).toEqual({
      purchaseTotalMinor: 50_000,
      paidAmountMinor: 20_000,
      remainingPayableMinor: 30_000,
    });
  });

  it("rejects a partial payment that meets or exceeds the purchase total", () => {
    const built = buildQuickStockInInput({
      ...baseForm,
      paymentStatus: "partial",
      paymentTender: "cash",
      amountPaid: "500", // equals the 50000 total
    });

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.errors.amountPaid).toBeDefined();
  });

  it("builds a credit purchase with no method or amount", () => {
    const built = buildQuickStockInInput({
      ...baseForm,
      paymentStatus: "credit",
      paymentTender: "jazzcash",
      amountPaid: "999",
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.payment).toEqual({ status: "credit" });
  });
});

describe("quick stock in error copy and invalidation", () => {
  it("maps backend error codes to non-destructive receiving copy", () => {
    expect(
      quickStockInErrorMessage(
        new ApiError("Bad input.", { code: "VALIDATION_FAILED", status: 422 }),
      ),
    ).toContain("Nothing was received");
    expect(
      quickStockInErrorMessage(new ApiError("No.", { status: 403 })),
    ).toContain("do not allow receiving stock");
    expect(
      quickStockInErrorMessage(new ApiError("Down.", { code: "NETWORK_ERROR" })),
    ).toContain("could not be reached");
  });

  it("renders a backend error, its copy and the request id", () => {
    const html = renderToStaticMarkup(
      createElement(QuickStockInErrorBanner, {
        error: new ApiError("A serialized product cannot use quick stock in.", {
          code: "VALIDATION_FAILED",
          status: 422,
          requestId: "req-77",
        }),
      }),
    );
    expect(html).toContain("Stock was not received");
    expect(html).toContain("Nothing was received");
    expect(html).toContain("Ref: req-77");
  });

  it("invalidates exactly the existing read roots the receipt changes", () => {
    expect(quickStockInInvalidationKeys()).toEqual([
      queryKeys.inventoryBalancesRoot,
      queryKeys.inventoryMovementsRoot,
      queryKeys.inventoryLocationsRoot,
      queryKeys.catalogProductsRoot,
      queryKeys.purchasingOrdersRoot,
      queryKeys.purchasingReceiptsRoot,
      queryKeys.purchasingSuppliersRoot,
      queryKeys.posLookupRoot,
    ]);
  });
});

describe("quick stock in api call", () => {
  it("posts to the endpoint with the idempotency header and parses the result", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fetcher: typeof fetch = async (url, init) => {
      captured.url = String(url);
      captured.init = init ?? {};
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = new ApiClient("https://api.test/api/v1", { fetcher });

    const input: QuickStockInInput = {
      product: { mode: "existing", productVariantId: VARIANT_ID },
      supplier: { mode: "existing", supplierId: SUPPLIER_ID },
      stockLocationId: LOCATION_ID,
      quantity: 5,
      unitCostMinor: 10_000,
      sellingPriceMinor: 15_000,
      payment: {
        status: "partial",
        method: "digital_wallet",
        walletProvider: "jazzcash",
        amountPaidMinor: 20_000,
      },
    };

    const response = await quickStockIn(input, IDEMPOTENCY_KEY, client);

    expect(captured.url).toBe(
      "https://api.test/api/v1/inventory/quick-stock-in",
    );
    expect(captured.init?.method).toBe("POST");
    const headers = new Headers(captured.init?.headers);
    expect(headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(IDEMPOTENCY_KEY);
    expect(JSON.parse(String(captured.init?.body))).toMatchObject({
      quantity: 5,
      unitCostMinor: 10_000,
      payment: {
        status: "partial",
        method: "digital_wallet",
        walletProvider: "jazzcash",
        amountPaidMinor: 20_000,
      },
    });
    expect(response.goodsReceiptNumber).toBe("GR-2026-021");
    expect(response.remainingPayableMinor).toBe(30_000);
  });
});

describe("quick stock in success summary", () => {
  it("renders product, supplier, payment split, documents and follow-up links", () => {
    const html = renderToStaticMarkup(
      createElement(QuickStockInSuccess, { result, onReset: vi.fn() }),
    );

    expect(html).toContain("Stock added successfully");
    expect(html).toContain("SAM-A15-256-BLK");
    expect(html).toContain("City Distributors");
    expect(html).toContain("PO-2026-014");
    expect(html).toContain("GR-2026-021");
    expect(html).toContain("PKR 500.00"); // purchase total
    expect(html).toContain("PKR 200.00"); // paid amount
    expect(html).toContain("PKR 300.00"); // remaining payable
    expect(html).toContain("JazzCash"); // payment method label
    expect(html).toContain("Add More Stock");
    expect(html).toContain("View Purchase Record");
    expect(html).toContain('href="/stock"');
    expect(html).toContain('href="/inventory"');
    expect(html).toContain('href="/purchases"');
  });
});
