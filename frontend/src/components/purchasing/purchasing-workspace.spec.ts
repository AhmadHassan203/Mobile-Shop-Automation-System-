import { PAGINATION, PERMISSIONS } from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PurchasingOrderList,
  PurchasingReceiptList,
  PurchasingSupplierList,
} from "@/lib/api/purchasing";
import { queryKeys } from "@/lib/query/keys";
import {
  orderParametersFrom,
  receiptParametersFrom,
  supplierParametersFrom,
} from "./purchasing-state";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/purchases",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const { PurchasingWorkspace } = await import("./purchasing-workspace");

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const RECEIPT_ID = "44444444-4444-4444-8444-444444444444";

const supplierSummary = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "Lahore Mobile Distribution",
  primaryContact: {
    id: CONTACT_ID,
    name: "Ali Khan",
    role: "Sales",
    phone: "+92 300 1111111",
    email: "ali@example.test",
    isPrimary: true,
  },
  paymentTermsDays: 30,
  leadTimeDays: 3,
  onTimeRateBasisPoints: 9_250,
  isActive: true,
  version: 2,
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-10T10:00:00.000Z",
} as const;

const supplierPage: PurchasingSupplierList = {
  items: [supplierSummary],
  page: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
  total: 1,
  totalPages: 1,
};

const orderPage: PurchasingOrderList = {
  items: [
    {
      id: ORDER_ID,
      number: "PO-2026-0001",
      supplier: {
        id: SUPPLIER_ID,
        code: supplierSummary.code,
        name: supplierSummary.name,
      },
      status: "ordered",
      orderDate: "2026-07-12",
      expectedOn: "2026-07-18",
      totalMinor: 450_000,
      totalUnits: 3,
      receivedUnits: 1,
      version: 3,
      createdAt: "2026-07-12T10:00:00.000Z",
      updatedAt: "2026-07-15T10:00:00.000Z",
    },
  ],
  page: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
  total: 1,
  totalPages: 1,
};

const receiptPage: PurchasingReceiptList = {
  items: [
    {
      id: RECEIPT_ID,
      number: "GR-2026-0001",
      purchaseOrder: { id: ORDER_ID, number: "PO-2026-0001" },
      supplier: {
        id: SUPPLIER_ID,
        code: supplierSummary.code,
        name: supplierSummary.name,
      },
      supplierInvoiceReference: "INV-7788",
      receivedAt: "2026-07-15T11:30:00.000Z",
      lineCount: 1,
      unitCount: 1,
      actualCostTotalMinor: 150_000,
      landedCostTotalMinor: 155_000,
      payableTotalMinor: 150_000,
      createdAt: "2026-07-15T11:30:00.000Z",
    },
  ],
  page: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
  total: 1,
  totalPages: 1,
};

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function seedAuth(client: QueryClient, permissions: readonly string[]): void {
  client.setQueryData(queryKeys.currentAuth, { permissions });
}

function seedSupplierReferences(client: QueryClient): void {
  client.setQueryData(
    queryKeys.purchasingSuppliers({ page: 1, pageSize: 100 }),
    { ...supplierPage, pageSize: 100 },
  );
}

function render(client: QueryClient, node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, node),
  );
}

beforeEach(() => {
  navigation.search = "";
  navigation.replace.mockReset();
});

describe("purchasing workspace permissions and routing", () => {
  it("renders real order data, all permitted tabs, and create controls", () => {
    // Add stock is the default tab; this case asserts the Purchase orders tab.
    navigation.search = "tab=orders";
    const client = newClient();
    seedAuth(client, [
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.SUPPLIERS_VIEW,
      PERMISSIONS.CATALOG_VIEW,
      PERMISSIONS.PURCHASES_CREATE,
      PERMISSIONS.PURCHASES_APPROVE,
      PERMISSIONS.PURCHASES_RECEIVE,
    ]);
    client.setQueryData(
      queryKeys.purchasingOrders(orderParametersFrom(new URLSearchParams())),
      orderPage,
    );
    seedSupplierReferences(client);

    const html = render(client, createElement(PurchasingWorkspace));

    expect(html).toContain('role="tablist"');
    expect(html).toContain("Add stock");
    expect(html).toContain("Purchase orders");
    expect(html).toContain("Suppliers");
    expect(html).toContain("Receipts");
    expect(html).toContain("PO-2026-0001");
    expect(html).toContain("Lahore Mobile Distribution");
    expect(html).toContain("New purchase order");
    expect(html).toContain("PKR 4,500.00");
  });

  it("shows Add stock as the default tab and embeds Quick Stock In (no duplicate header)", () => {
    navigation.search = "";
    const client = newClient();
    seedAuth(client, [
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.SUPPLIERS_VIEW,
      PERMISSIONS.PURCHASES_RECEIVE,
    ]);

    const html = render(client, createElement(PurchasingWorkspace));

    // The Add-stock panel is active by default and renders the reused Quick
    // Stock In form, without its own standalone page header.
    expect(html).toContain('id="purchasing-panel-add-stock"');
    expect(html).toContain("Save Purchase &amp; Add Stock");
    expect(html).not.toContain("Inventory · Quick Stock In");
  });

  it("hides draft forms when a creator cannot read every reference API", () => {
    const withoutCatalog = newClient();
    seedAuth(withoutCatalog, [
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.PURCHASES_CREATE,
      PERMISSIONS.SUPPLIERS_VIEW,
    ]);
    withoutCatalog.setQueryData(
      queryKeys.purchasingOrders(orderParametersFrom(new URLSearchParams())),
      orderPage,
    );
    seedSupplierReferences(withoutCatalog);

    const withoutSupplier = newClient();
    seedAuth(withoutSupplier, [
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.PURCHASES_CREATE,
      PERMISSIONS.CATALOG_VIEW,
    ]);
    withoutSupplier.setQueryData(
      queryKeys.purchasingOrders(orderParametersFrom(new URLSearchParams())),
      orderPage,
    );

    expect(
      render(withoutCatalog, createElement(PurchasingWorkspace)),
    ).not.toContain("New purchase order");
    expect(
      render(withoutSupplier, createElement(PurchasingWorkspace)),
    ).not.toContain("New purchase order");
  });

  it("renders no purchasing query or controls without purchasing permissions", () => {
    const client = newClient();
    seedAuth(client, [PERMISSIONS.CATALOG_VIEW]);

    const html = render(client, createElement(PurchasingWorkspace));

    expect(html).toContain("Purchasing access required");
    expect(html).toContain("No purchasing request was sent");
    expect(html).not.toContain('role="tablist"');
    expect(
      client
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[0] === "purchasing"),
    ).toHaveLength(0);
  });

  it("falls back to Suppliers for a supplier-only user and hides purchase tabs", () => {
    const client = newClient();
    seedAuth(client, [PERMISSIONS.SUPPLIERS_VIEW]);
    client.setQueryData(
      queryKeys.purchasingSuppliers(
        supplierParametersFrom(new URLSearchParams()),
      ),
      supplierPage,
    );

    const html = render(client, createElement(PurchasingWorkspace));

    expect(html).toContain('id="purchasing-tab-suppliers"');
    expect(html).not.toContain('id="purchasing-tab-orders"');
    expect(html).not.toContain('id="purchasing-tab-receipts"');
    expect(html).toContain("SUP-001");
    expect(html).not.toContain("New supplier");
  });

  it("routes directly to receipt history and renders reconciled API totals", () => {
    navigation.search = "tab=receipts";
    const client = newClient();
    seedAuth(client, [PERMISSIONS.PURCHASES_VIEW, PERMISSIONS.SUPPLIERS_VIEW]);
    client.setQueryData(
      queryKeys.purchasingReceipts(
        receiptParametersFrom(new URLSearchParams(navigation.search)),
      ),
      receiptPage,
    );
    seedSupplierReferences(client);

    const html = render(client, createElement(PurchasingWorkspace));

    expect(html).toContain('id="purchasing-panel-receipts"');
    expect(html).toContain("GR-2026-0001");
    expect(html).toContain("INV-7788");
    expect(html).toContain("PKR 1,500.00");
    expect(html).toContain("PKR 1,550.00");
    expect(html).not.toContain("New purchase order");
  });
});
