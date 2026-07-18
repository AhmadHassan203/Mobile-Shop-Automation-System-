import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  createReturn,
  exchangeReturn,
  getReturn,
  getReturnEligibility,
  getReturns,
  lookupOriginalSaleForReturn,
  postReturn,
} from "./returns";

const IDS = {
  sale: "11111111-1111-4111-8111-111111111111",
  saleLine: "22222222-2222-4222-8222-222222222222",
  variant: "33333333-3333-4333-8333-333333333333",
  location: "44444444-4444-4444-8444-444444444444",
  user: "55555555-5555-4555-8555-555555555555",
  payment: "66666666-6666-4666-8666-666666666666",
  ret: "77777777-7777-4777-8777-777777777777",
  retLine: "88888888-8888-4888-8888-888888888888",
  unit: "99999999-9999-4999-8999-999999999999",
  idempotency: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as const;
const TIMESTAMP = "2026-07-16T10:00:00.000Z";

// --- Sales fixtures for the proof-of-purchase adapter -----------------------
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
const saleDetail = {
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
      id: IDS.saleLine,
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

// --- Returns fixtures -------------------------------------------------------
const returnSaleRef = {
  id: IDS.sale,
  invoiceNumber: "INV-000001",
  status: "posted",
  postedAt: TIMESTAMP,
  returnWindowDays: 7,
  returnDeadline: TIMESTAMP,
  customer: null,
} as const;
const returnPolicy = {
  windowDaysSnapshot: 7,
  deadline: TIMESTAMP,
  checkedAt: TIMESTAMP,
  expired: false,
  overridden: false,
  overrideReason: null,
  overriddenBy: null,
  overriddenAt: null,
} as const;
const exchangeCapability = {
  available: false,
  reason: "atomic_sales_posting_boundary_unavailable",
} as const;
const returnDetail = {
  id: IDS.ret,
  returnNumber: "RET-000001",
  status: "draft",
  sale: returnSaleRef,
  reason: "Not charging (DOA)",
  evidenceNote: "Bench test observed no charging response.",
  currency: "PKR",
  lines: [
    {
      id: IDS.retLine,
      saleLineId: IDS.saleLine,
      trackingType: "serialized",
      product: { id: IDS.variant, sku: "PH-1", name: "Phone" },
      location: { id: IDS.location, code: "MAIN", name: "Main store" },
      quantity: 1,
      refundMinor: 50_000,
      condition: "faulty",
      outcome: null,
      profit: { availability: "redacted" },
      serializedUnit: {
        id: IDS.unit,
        identifiers: [{ type: "imei", value: "356938035643809" }],
      },
    },
  ],
  totals: {
    refundMinor: 50_000,
    receivableCreditMinor: 50_000,
    refundedMinor: 0,
    profit: { availability: "redacted" },
  },
  refund: null,
  policy: returnPolicy,
  approvedBy: null,
  exchange: exchangeCapability,
  version: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  postedAt: null,
} as const;
const returnSummary = {
  id: IDS.ret,
  returnNumber: "RET-000001",
  status: "draft",
  sale: returnSaleRef,
  reason: "Not charging (DOA)",
  lineCount: 1,
  unitCount: 1,
  totalRefundMinor: 50_000,
  policyExpired: false,
  postedAt: null,
  createdAt: TIMESTAMP,
  version: 1,
} as const;
const eligibility = {
  state: "eligible",
  eligible: true,
  requiresOverride: false,
  sale: returnSaleRef,
  policy: returnPolicy,
  lines: [
    {
      trackingType: "serialized",
      saleLineId: IDS.saleLine,
      product: { id: IDS.variant, sku: "PH-1", name: "Phone" },
      location: { id: IDS.location, code: "MAIN", name: "Main store" },
      soldQuantity: 1,
      returnedQuantity: 0,
      remainingQuantity: 1,
      refundableMinor: 50_000,
      profit: { availability: "redacted" },
      serializedUnit: {
        id: IDS.unit,
        identifiers: [{ type: "imei", value: "356938035643809" }],
      },
    },
  ],
  exchange: exchangeCapability,
} as const;
const postedReturn = {
  return: {
    ...returnDetail,
    status: "posted",
    postedAt: TIMESTAMP,
    version: 2,
  },
  idempotencyReplay: false,
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientFor(payload: unknown, status = 200) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(jsonResponse(payload, status));
  return {
    client: new ApiClient("https://api.test/api/v1", { fetcher }),
    fetcher,
  };
}

describe("Returns proof-of-purchase adapter", () => {
  it("finds one exact invoice through Sales list then loads strict detail", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(page([summary])))
      .mockResolvedValueOnce(jsonResponse(saleDetail));
    const client = new ApiClient("https://api.test/api/v1", { fetcher });

    await expect(
      lookupOriginalSaleForReturn("  inv-000001  ", client),
    ).resolves.toEqual({
      availability: "found",
      invoiceNumber: "INV-000001",
      sale: saleDetail,
    });

    const listUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(listUrl.pathname).toBe("/api/v1/sales");
    expect(listUrl.searchParams.get("q")).toBe("INV-000001");
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      `https://api.test/api/v1/sales/${IDS.sale}`,
    );
  });

  it("rejects an empty lookup before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("https://api.test/api/v1", { fetcher });
    await expect(
      lookupOriginalSaleForReturn(" ", client),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Returns read API contracts", () => {
  it("serializes queue status, search and date filters on /returns", async () => {
    const { client, fetcher } = clientFor(page([returnSummary]));

    await getReturns(
      {
        page: 2,
        pageSize: 25,
        q: "RET-000001",
        status: "draft",
        saleId: IDS.sale,
        from: "2026-07-01",
        to: "2026-07-31",
        sort: "created_at",
        direction: "desc",
      },
      undefined,
      client,
    );

    const url = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/v1/returns");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "25",
      q: "RET-000001",
      status: "draft",
      saleId: IDS.sale,
      from: "2026-07-01",
      to: "2026-07-31",
      sort: "created_at",
      direction: "desc",
    });
  });

  it("loads a strict return detail by id", async () => {
    const { client, fetcher } = clientFor(returnDetail);

    await expect(getReturn(IDS.ret, undefined, client)).resolves.toMatchObject({
      id: IDS.ret,
      status: "draft",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://api.test/api/v1/returns/${IDS.ret}`,
    );
  });

  it("normalizes an invoice eligibility query and parses the result", async () => {
    const { client, fetcher } = clientFor(eligibility);

    await expect(
      getReturnEligibility({ invoiceNumber: "inv-000001" }, undefined, client),
    ).resolves.toMatchObject({ state: "eligible", eligible: true });

    const url = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/v1/returns/eligibility");
    expect(url.searchParams.get("invoiceNumber")).toBe("INV-000001");
  });

  it("rejects a return whose settlement does not reconcile", async () => {
    const broken = clientFor({
      ...returnDetail,
      totals: { ...returnDetail.totals, refundMinor: 40_000 },
    });

    await expect(
      getReturn(IDS.ret, undefined, broken.client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("Returns mutation API contracts", () => {
  it("posts a multi-line draft without tenant-owned or settlement fields", async () => {
    const { client, fetcher } = clientFor(returnDetail);

    await createReturn(
      {
        saleId: IDS.sale,
        reason: "Not charging (DOA)",
        evidenceNote: "Bench test observed no charging response.",
        lines: [
          {
            trackingType: "serialized",
            saleLineId: IDS.saleLine,
            serializedUnitId: IDS.unit,
            identifier: "356938035643809",
            quantity: 1,
            condition: "faulty",
          },
        ],
      },
      client,
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("https://api.test/api/v1/returns");
    expect(init.method).toBe("POST");
    expect(body.saleId).toBe(IDS.sale);
    expect(Array.isArray(body.lines)).toBe(true);
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("totals");
  });

  it("posts a return under an idempotency key and defaults the settlement", async () => {
    const { client, fetcher } = clientFor(postedReturn);

    await postReturn(IDS.ret, { version: 1 }, IDS.idempotency, client);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe(`https://api.test/api/v1/returns/${IDS.ret}/post`);
    expect(body.version).toBe(1);
    expect(body.refund).toBeNull();
    expect(body.policyOverrideReason).toBeNull();
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      IDS.idempotency,
    );
  });

  it("rejects an invalid post retry key before any request is sent", () => {
    const { client, fetcher } = clientFor(postedReturn);

    expect(() =>
      postReturn(IDS.ret, { version: 1 }, "not-a-uuid", client),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces the deferred exchange conflict from the stable endpoint", async () => {
    const { client, fetcher } = clientFor(
      {
        code: "CONFLICT",
        message: "atomic_sales_posting_boundary_unavailable",
      },
      409,
    );

    await expect(
      exchangeReturn(IDS.ret, { version: 1 }, client),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.test/api/v1/returns/${IDS.ret}/exchange`);
    expect(JSON.parse(String(init.body))).toEqual({ version: 1 });
  });
});
