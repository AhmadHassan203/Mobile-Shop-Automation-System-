import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  createSaleDraft,
  getSales,
  holdSale,
  postSale,
  replaceSaleDraft,
  reviewSale,
} from "./sales";

const SALE_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const CASHIER_ID = "44444444-4444-4444-8444-444444444444";
const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";
const draftInput = {
  customerId: null,
  note: null,
  requestedDiscountMinor: 0,
  discountReason: null,
  lines: [
    {
      trackingType: "quantity" as const,
      productVariantId: VARIANT_ID,
      priceSource: "variant_default" as const,
      priceSourceId: null,
      priceVersion: 3,
      locationId: LOCATION_ID,
      quantity: 2,
      stockVersion: 4,
    },
  ],
};

function clientFor(payload: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
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

function requestBody(fetcher: ReturnType<typeof vi.fn<typeof fetch>>) {
  const init = fetcher.mock.calls[0]?.[1];
  return init?.body === undefined ? undefined : JSON.parse(String(init.body));
}

describe("sales API", () => {
  it("serializes a scoped sales-ledger query without tenant parameters", async () => {
    const page = {
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    };
    const { client, fetcher } = clientFor(page);

    await expect(
      getSales(
        {
          page: 1,
          pageSize: 25,
          status: "posted",
          cashierId: CASHIER_ID,
          paymentMethod: "cash",
          from: "2026-07-01",
          to: "2026-07-16",
          sort: "posted_at",
          direction: "desc",
        },
        undefined,
        client,
      ),
    ).resolves.toEqual(page);

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/sales");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      status: "posted",
      cashierId: CASHIER_ID,
      paymentMethod: "cash",
      from: "2026-07-01",
      to: "2026-07-16",
      sort: "posted_at",
      direction: "desc",
    });
    expect(url.searchParams.has("organizationId")).toBe(false);
    expect(url.searchParams.has("branchId")).toBe(false);
  });

  it("sends only selection identities and optimistic versions through the draft lifecycle", async () => {
    const create = clientFor({});
    await expect(
      createSaleDraft(draftInput, create.client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(String(create.fetcher.mock.calls[0]?.[0]).endsWith("/sales")).toBe(
      true,
    );
    expect(create.fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(requestBody(create.fetcher)).toEqual(draftInput);
    expect(requestBody(create.fetcher)).not.toHaveProperty("totalMinor");

    const replace = clientFor({});
    await expect(
      replaceSaleDraft(SALE_ID, { ...draftInput, version: 5 }, replace.client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(replace.fetcher.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(requestBody(replace.fetcher)).toMatchObject({ version: 5 });

    const review = clientFor({});
    await expect(
      reviewSale(SALE_ID, { version: 6 }, review.client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(
      String(review.fetcher.mock.calls[0]?.[0]).endsWith(
        `/sales/${SALE_ID}/review`,
      ),
    ).toBe(true);
    expect(requestBody(review.fetcher)).toEqual({ version: 6 });

    const hold = clientFor({});
    await expect(
      holdSale(SALE_ID, { version: 6, note: null }, hold.client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(
      String(hold.fetcher.mock.calls[0]?.[0]).endsWith(
        `/sales/${SALE_ID}/hold`,
      ),
    ).toBe(true);
    expect(requestBody(hold.fetcher)).toEqual({ version: 6, note: null });
  });

  it("posts version and payment legs with the stable idempotency header", async () => {
    const { client, fetcher } = clientFor({});
    await expect(
      postSale(
        SALE_ID,
        {
          version: 7,
          payments: [{ method: "cash", amountMinor: 1_800, reference: null }],
        },
        IDEMPOTENCY_KEY,
        client,
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(
      String(fetcher.mock.calls[0]?.[0]).endsWith(`/sales/${SALE_ID}/post`),
    ).toBe(true);
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(
      IDEMPOTENCY_KEY,
    );
    expect(requestBody(fetcher)).toEqual({
      version: 7,
      payments: [{ method: "cash", amountMinor: 1_800, reference: null }],
    });
  });

  it("rejects an invalid payment leg before sending a post request", async () => {
    const { client, fetcher } = clientFor({});

    expect(() =>
      postSale(
        SALE_ID,
        {
          version: 2,
          payments: [
            { method: "cash", amountMinor: 100_000, reference: "not allowed" },
          ],
        },
        "22222222-2222-4222-8222-222222222222",
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
