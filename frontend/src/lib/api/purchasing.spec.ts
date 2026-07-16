import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  cancelPurchaseOrder,
  createGoodsReceipt,
  createPurchaseOrder,
  createSupplier,
  getGoodsReceipts,
  getPurchaseOrders,
  getSuppliers,
  setSupplierActive,
  transitionPurchaseOrder,
  updateSupplier,
} from "./purchasing";

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_LINE_ID = "44444444-4444-4444-8444-444444444444";
const VARIANT_ID = "55555555-5555-4555-8555-555555555555";
const LOCATION_ID = "66666666-6666-4666-8666-666666666666";
const RECEIPT_ID = "77777777-7777-4777-8777-777777777777";
const RECEIPT_LINE_ID = "88888888-8888-4888-8888-888888888888";
const COST_ID = "99999999-9999-4999-8999-999999999999";
const PAYABLE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDEMPOTENCY_KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TIMESTAMP = "2026-07-16T01:00:00.000Z";

const contact = {
  id: CONTACT_ID,
  name: "Ali Khan",
  role: "Sales",
  phone: "+923001234567",
  email: "ali@example.com",
  isPrimary: true,
} as const;

const supplier = {
  id: SUPPLIER_ID,
  code: "MOBILE-HUB",
  name: "Mobile Hub",
  primaryContact: contact,
  paymentTermsDays: 30,
  leadTimeDays: 3,
  onTimeRateBasisPoints: null,
  isActive: true,
  version: 2,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  addressLine: "Hall Road",
  city: "Lahore",
  notes: null,
  contacts: [contact],
} as const;

const supplierSummary = {
  id: supplier.id,
  code: supplier.code,
  name: supplier.name,
  primaryContact: supplier.primaryContact,
  paymentTermsDays: supplier.paymentTermsDays,
  leadTimeDays: supplier.leadTimeDays,
  onTimeRateBasisPoints: supplier.onTimeRateBasisPoints,
  isActive: supplier.isActive,
  version: supplier.version,
  createdAt: supplier.createdAt,
  updatedAt: supplier.updatedAt,
} as const;

const productVariant = {
  id: VARIANT_ID,
  sku: "CASE-BLK",
  name: "Black case",
  trackingType: "quantity",
  condition: "new",
  ptaStatus: "not_applicable",
} as const;

const purchaseOrder = {
  id: ORDER_ID,
  number: "PO-000001",
  supplier: { id: SUPPLIER_ID, code: "MOBILE-HUB", name: "Mobile Hub" },
  status: "draft",
  orderDate: "2026-07-16",
  expectedOn: "2026-07-19",
  totalMinor: 2_000,
  totalUnits: 2,
  receivedUnits: 0,
  version: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  notes: null,
  approvedAt: null,
  orderedAt: null,
  closedAt: null,
  cancelledAt: null,
  lines: [
    {
      id: ORDER_LINE_ID,
      productVariant,
      quantityOrdered: 2,
      quantityReceived: 0,
      quantityRemaining: 2,
      unitCostMinor: 1_000,
      lineTotalMinor: 2_000,
      notes: null,
    },
  ],
} as const;

const purchaseOrderSummary = {
  id: purchaseOrder.id,
  number: purchaseOrder.number,
  supplier: purchaseOrder.supplier,
  status: purchaseOrder.status,
  orderDate: purchaseOrder.orderDate,
  expectedOn: purchaseOrder.expectedOn,
  totalMinor: purchaseOrder.totalMinor,
  totalUnits: purchaseOrder.totalUnits,
  receivedUnits: purchaseOrder.receivedUnits,
  version: purchaseOrder.version,
  createdAt: purchaseOrder.createdAt,
  updatedAt: purchaseOrder.updatedAt,
} as const;

const receipt = {
  id: RECEIPT_ID,
  number: "GRN-000001",
  purchaseOrder: { id: ORDER_ID, number: "PO-000001" },
  supplier: { id: SUPPLIER_ID, code: "MOBILE-HUB", name: "Mobile Hub" },
  supplierInvoiceReference: "INV-22",
  receivedAt: TIMESTAMP,
  lineCount: 1,
  unitCount: 2,
  actualCostTotalMinor: 2_000,
  landedCostTotalMinor: 2_100,
  payableTotalMinor: 2_000,
  createdAt: TIMESTAMP,
  invoiceDueOn: "2026-08-15",
  notes: null,
  landedCosts: [
    {
      id: COST_ID,
      kind: "freight",
      amountMinor: 100,
      reference: null,
      notes: null,
    },
  ],
  lines: [
    {
      id: RECEIPT_LINE_ID,
      purchaseOrderLineId: ORDER_LINE_ID,
      productVariant,
      stockLocation: {
        id: LOCATION_ID,
        code: "MAIN",
        name: "Main store",
      },
      quantityReceived: 2,
      unitCostMinor: 1_000,
      actualCostTotalMinor: 2_000,
      landedCostAllocatedMinor: 100,
      landedCostTotalMinor: 2_100,
      stockBatchId: PAYABLE_ID,
      serializedUnits: [],
    },
  ],
  payable: {
    id: PAYABLE_ID,
    dueOn: "2026-08-15",
    amountMinor: 2_000,
    outstandingMinor: 2_000,
    status: "open",
  },
} as const;

const receiptSummary = {
  id: receipt.id,
  number: receipt.number,
  purchaseOrder: receipt.purchaseOrder,
  supplier: receipt.supplier,
  supplierInvoiceReference: receipt.supplierInvoiceReference,
  receivedAt: receipt.receivedAt,
  lineCount: receipt.lineCount,
  unitCount: receipt.unitCount,
  actualCostTotalMinor: receipt.actualCostTotalMinor,
  landedCostTotalMinor: receipt.landedCostTotalMinor,
  payableTotalMinor: receipt.payableTotalMinor,
  createdAt: receipt.createdAt,
} as const;

function page<T>(items: readonly T[]) {
  return {
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  };
}

function clientFor(payload: unknown) {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    client: new ApiClient("https://api.test/api/v1", { fetcher }),
    fetcher,
  };
}

describe("purchasing read API contracts", () => {
  it("serializes supplier search and active filters on the canonical route", async () => {
    const { client, fetcher } = clientFor(page([supplierSummary]));

    await getSuppliers(
      { page: 2, pageSize: 25, q: "mobile", active: true },
      undefined,
      client,
    );

    const [rawUrl, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.pathname).toBe("/api/v1/suppliers");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "25",
      q: "mobile",
      active: "true",
    });
    expect(init.method).toBe("GET");
  });

  it("serializes purchase-order status, supplier and date filters", async () => {
    const { client, fetcher } = clientFor(page([purchaseOrderSummary]));

    await getPurchaseOrders(
      {
        page: 1,
        pageSize: 25,
        status: "draft",
        supplierId: SUPPLIER_ID,
        from: "2026-07-01",
        to: "2026-07-31",
      },
      undefined,
      client,
    );

    const url = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/v1/purchases");
    expect(url.searchParams.get("status")).toBe("draft");
    expect(url.searchParams.get("supplierId")).toBe(SUPPLIER_ID);
    expect(url.searchParams.get("from")).toBe("2026-07-01");
    expect(url.searchParams.get("to")).toBe("2026-07-31");
  });

  it("serializes goods-receipt evidence filters", async () => {
    const { client, fetcher } = clientFor(page([receiptSummary]));

    await getGoodsReceipts(
      {
        page: 1,
        pageSize: 25,
        q: "INV-22",
        purchaseOrderId: ORDER_ID,
        supplierId: SUPPLIER_ID,
        from: "2026-07-16",
        to: "2026-07-16",
      },
      undefined,
      client,
    );

    const url = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/v1/goods-receipts");
    expect(url.searchParams.get("purchaseOrderId")).toBe(ORDER_ID);
    expect(url.searchParams.get("supplierId")).toBe(SUPPLIER_ID);
  });

  it("rejects tenant leakage and broken financial reconciliation in responses", async () => {
    const suppliers = clientFor(
      page([{ ...supplierSummary, organizationId: SUPPLIER_ID }]),
    );
    const receipts = clientFor(
      page([{ ...receiptSummary, payableTotalMinor: 2_100 }]),
    );

    await expect(
      getSuppliers({ page: 1, pageSize: 25 }, undefined, suppliers.client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(
      getGoodsReceipts({ page: 1, pageSize: 25 }, undefined, receipts.client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("purchasing mutation API contracts", () => {
  it("normalizes a supplier and never sends tenant-owned fields", async () => {
    const { client, fetcher } = clientFor(supplier);

    await createSupplier(
      {
        code: " mobile hub ",
        name: " Mobile Hub ",
        contacts: [
          {
            name: " Ali Khan ",
            email: " ALI@EXAMPLE.COM ",
            isPrimary: true,
          },
        ],
      },
      client,
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("https://api.test/api/v1/suppliers");
    expect(init.method).toBe("POST");
    expect(body).toMatchObject({ code: "MOBILE-HUB", name: "Mobile Hub" });
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("branchId");
  });

  it("carries optimistic versions on supplier update and activation", async () => {
    const updated = clientFor({ ...supplier, version: 3 });
    const deactivated = clientFor({
      ...supplier,
      isActive: false,
      version: 3,
    });

    await updateSupplier(
      SUPPLIER_ID,
      {
        code: supplier.code,
        name: supplier.name,
        contacts: [],
        paymentTermsDays: 30,
        leadTimeDays: 3,
        version: 2,
      },
      updated.client,
    );
    await setSupplierActive(SUPPLIER_ID, 2, false, deactivated.client);

    expect(updated.fetcher.mock.calls[0]?.[0]).toBe(
      `https://api.test/api/v1/suppliers/${SUPPLIER_ID}`,
    );
    expect(
      JSON.parse(String(updated.fetcher.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({ version: 2 });
    expect(deactivated.fetcher.mock.calls[0]?.[0]).toBe(
      `https://api.test/api/v1/suppliers/${SUPPLIER_ID}/deactivate`,
    );
  });

  it("creates a draft PO without accepting stock or tenant counters", async () => {
    const { client, fetcher } = clientFor(purchaseOrder);

    await createPurchaseOrder(
      {
        supplierId: SUPPLIER_ID,
        expectedOn: "2026-07-19",
        lines: [
          { productVariantId: VARIANT_ID, quantity: 2, unitCostMinor: 1_000 },
        ],
      },
      client,
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("https://api.test/api/v1/purchases");
    expect(body).not.toHaveProperty("stock");
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("totalMinor");
  });

  it("uses distinct lifecycle routes and requires a cancellation reason", async () => {
    const approved = clientFor({
      ...purchaseOrder,
      status: "approved",
      approvedAt: TIMESTAMP,
      version: 2,
    });
    const cancelled = clientFor({
      ...purchaseOrder,
      status: "cancelled",
      cancelledAt: TIMESTAMP,
      version: 2,
    });

    await transitionPurchaseOrder(
      ORDER_ID,
      "approve",
      { version: 1 },
      approved.client,
    );
    await cancelPurchaseOrder(
      ORDER_ID,
      { version: 1, reason: "Supplier cannot fulfill" },
      cancelled.client,
    );

    expect(approved.fetcher.mock.calls[0]?.[0]).toContain(
      `/purchases/${ORDER_ID}/approve`,
    );
    expect(cancelled.fetcher.mock.calls[0]?.[0]).toContain(
      `/purchases/${ORDER_ID}/cancel`,
    );
    expect(() =>
      cancelPurchaseOrder(
        ORDER_ID,
        { version: 1, reason: "" },
        cancelled.client,
      ),
    ).toThrow();
  });

  it("posts only receipt evidence inputs and leaves totals server-owned", async () => {
    const { client, fetcher } = clientFor(receipt);

    await createGoodsReceipt(
      {
        purchaseOrderId: ORDER_ID,
        supplierInvoiceReference: "INV-22",
        invoiceDueOn: "2026-08-15",
        landedCosts: [{ kind: "freight", amountMinor: 100 }],
        lines: [
          {
            purchaseOrderLineId: ORDER_LINE_ID,
            trackingType: "quantity",
            stockLocationId: LOCATION_ID,
            unitCostMinor: 1_000,
            quantity: 2,
          },
        ],
      },
      IDEMPOTENCY_KEY,
      client,
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("https://api.test/api/v1/goods-receipts");
    expect(body).not.toHaveProperty("actualCostTotalMinor");
    expect(body).not.toHaveProperty("landedCostTotalMinor");
    expect(body).not.toHaveProperty("payableTotalMinor");
    expect(body).not.toHaveProperty("organizationId");
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      IDEMPOTENCY_KEY,
    );
  });

  it("rejects smuggled receipt totals before any request is sent", () => {
    const { client, fetcher } = clientFor(receipt);

    expect(() =>
      createGoodsReceipt(
        {
          purchaseOrderId: ORDER_ID,
          lines: [
            {
              purchaseOrderLineId: ORDER_LINE_ID,
              trackingType: "quantity",
              stockLocationId: LOCATION_ID,
              unitCostMinor: 1_000,
              quantity: 1,
            },
          ],
          actualCostTotalMinor: 1,
        } as never,
        IDEMPOTENCY_KEY,
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an invalid receipt retry key before any request is sent", () => {
    const { client, fetcher } = clientFor(receipt);

    expect(() =>
      createGoodsReceipt(
        {
          purchaseOrderId: ORDER_ID,
          lines: [
            {
              purchaseOrderLineId: ORDER_LINE_ID,
              trackingType: "quantity",
              stockLocationId: LOCATION_ID,
              unitCostMinor: 1_000,
              quantity: 1,
            },
          ],
        },
        "not-a-uuid",
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
