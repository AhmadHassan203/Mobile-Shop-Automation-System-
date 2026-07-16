import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { lookupOriginalSaleForReturn } from "./returns";

const IDS = {
  sale: "11111111-1111-4111-8111-111111111111",
  line: "22222222-2222-4222-8222-222222222222",
  variant: "33333333-3333-4333-8333-333333333333",
  location: "44444444-4444-4444-8444-444444444444",
  user: "55555555-5555-4555-8555-555555555555",
  payment: "66666666-6666-4666-8666-666666666666",
} as const;
const TIMESTAMP = "2026-07-16T10:00:00.000Z";
const summary = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: "INV-000001",
  customer: null,
  lineCount: 1,
  unitCount: 2,
  totalMinor: 2_000,
  paymentMethods: ["cash"],
  profit: { availability: "redacted" },
  cashier: { id: IDS.user, fullName: "Haseeb Ahmed" },
  salesperson: { id: IDS.user, fullName: "Haseeb Ahmed" },
  heldAt: null,
  postedAt: TIMESTAMP,
  createdAt: TIMESTAMP,
  version: 2,
} as const;
const detail = {
  id: IDS.sale,
  status: "posted",
  invoiceNumber: "INV-000001",
  customer: null,
  currency: "PKR",
  note: null,
  discountReason: null,
  hold: null,
  lines: [
    {
      id: IDS.line,
      trackingType: "quantity",
      product: { id: IDS.variant, sku: "CASE-BLK", name: "Black case" },
      location: { id: IDS.location, code: "MAIN", name: "Main store" },
      priceVersion: 3,
      quantity: 2,
      unitPriceMinor: 1_000,
      lineSubtotalMinor: 2_000,
      discountMinor: 0,
      lineTotalMinor: 2_000,
      discountReason: null,
      profit: { availability: "redacted" },
    },
  ],
  totals: { subtotalMinor: 2_000, discountMinor: 0, totalMinor: 2_000 },
  settlement: {
    payments: [
      {
        id: IDS.payment,
        method: "cash",
        amountMinor: 2_000,
        reference: null,
        recordedAt: TIMESTAMP,
      },
    ],
    paidMinor: 2_000,
    receivableMinor: 0,
  },
  profit: { availability: "redacted" },
  cashier: summary.cashier,
  salesperson: summary.salesperson,
  version: 2,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  postedAt: TIMESTAMP,
  cancelledAt: null,
} as const;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Returns proof-of-purchase adapter", () => {
  it("finds one exact invoice through Sales list then loads strict detail", async () => {
    const page = {
      items: [summary],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(page))
      .mockResolvedValueOnce(jsonResponse(detail));
    const client = new ApiClient("https://api.test/api/v1", { fetcher });

    await expect(
      lookupOriginalSaleForReturn("  inv-000001  ", client),
    ).resolves.toEqual({
      availability: "found",
      invoiceNumber: "INV-000001",
      sale: detail,
    });

    const listUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(listUrl.pathname).toBe("/api/v1/sales");
    expect(listUrl.searchParams.get("q")).toBe("INV-000001");
    expect(listUrl.searchParams.get("pageSize")).toBe("100");
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      `https://api.test/api/v1/sales/${IDS.sale}`,
    );
  });

  it("blocks a fuzzy or absent invoice without requesting arbitrary detail", async () => {
    const page = {
      items: [summary],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(page));
    const client = new ApiClient("https://api.test/api/v1", { fetcher });

    await expect(
      lookupOriginalSaleForReturn("INV-0000", client),
    ).resolves.toEqual({
      availability: "not_found",
      invoiceNumber: "INV-0000",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty lookup before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("https://api.test/api/v1", { fetcher });
    await expect(lookupOriginalSaleForReturn(" ", client)).rejects.toMatchObject(
      { code: "VALIDATION_FAILED" },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
