import type { PurchaseOrderDetail } from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query/keys";
import { PurchaseOrderDetailDrawer } from "./purchase-order-detail-drawer";

const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const TIMESTAMP = "2026-07-16T01:00:00.000Z";

const order: PurchaseOrderDetail = {
  id: ORDER_ID,
  number: "PO-2026-0001",
  supplier: {
    id: "11111111-1111-4111-8111-111111111111",
    code: "SUP-001",
    name: "Mobile Hub",
  },
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
      id: "44444444-4444-4444-8444-444444444444",
      productVariant: {
        id: "55555555-5555-4555-8555-555555555555",
        sku: "CASE-BLK",
        name: "Black case",
        trackingType: "quantity",
        condition: "new",
        ptaStatus: "not_applicable",
      },
      quantityOrdered: 2,
      quantityReceived: 0,
      quantityRemaining: 2,
      unitCostMinor: 1_000,
      lineTotalMinor: 2_000,
      notes: null,
    },
  ],
};

function renderOrder(
  value: PurchaseOrderDetail,
  permissions: { readonly canEdit: boolean; readonly canOrder: boolean },
): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKeys.purchasingOrder(value.id), value);

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(PurchaseOrderDetailDrawer, {
        orderId: value.id,
        canEdit: permissions.canEdit,
        canOrder: permissions.canOrder,
        canApprove: false,
        canReceive: false,
        onClose: vi.fn(),
        onEdit: vi.fn(),
        onReceive: vi.fn(),
        onChanged: vi.fn(),
      }),
    ),
  );
}

describe("purchase order detail permission affordances", () => {
  it("hides the draft editor when reference reads are unavailable", () => {
    const html = renderOrder(order, { canEdit: false, canOrder: true });

    expect(html).not.toContain(">Edit</button>");
  });

  it("preserves the create-permission lifecycle transition", () => {
    const html = renderOrder(
      {
        ...order,
        status: "approved",
        approvedAt: TIMESTAMP,
        version: 2,
      },
      { canEdit: false, canOrder: true },
    );

    expect(html).toContain("Mark ordered");
  });
});
