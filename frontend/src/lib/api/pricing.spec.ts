import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { getPosLookup, setVariantDefaultPrice } from "./pricing";

const VARIANT_ID = "20000000-0000-4000-8000-000000000001";

const DEFAULT_PRICE_RESPONSE = {
  productVariantId: VARIANT_ID,
  effectivePrice: {
    currency: "PKR",
    unitPriceMinor: 250_000,
    minimumUnitPriceMinor: 200_000,
    source: "variant_default" as const,
    sourceId: null,
    version: 5,
    effectiveAt: "2026-07-16T10:00:00.000Z",
  },
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

describe("POS pricing API", () => {
  it("uses the canonical scoped lookup and serializes only lookup filters", async () => {
    const page = {
      items: [],
      page: 2,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    };
    const { client, fetcher } = clientFor(page);

    await expect(
      getPosLookup(
        {
          page: 2,
          pageSize: 25,
          q: "Galaxy A56",
          trackingType: "serialized",
        },
        undefined,
        client,
      ),
    ).resolves.toEqual(page);

    const [rawUrl, init] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(rawUrl));
    expect(url.pathname).toBe("/api/v1/pricing/pos-lookup");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "25",
      q: "Galaxy A56",
      trackingType: "serialized",
    });
    expect(init?.method).toBe("GET");
  });

  it("rejects tenant identifiers in an expanded response", async () => {
    const { client } = clientFor({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      organizationId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(
      getPosLookup({ page: 1, pageSize: 25 }, undefined, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("sends the strict optimistic default-price payload with PUT", async () => {
    const { client, fetcher } = clientFor(DEFAULT_PRICE_RESPONSE);

    await expect(
      setVariantDefaultPrice(
        VARIANT_ID,
        {
          unitPriceMinor: 250_000,
          minimumUnitPriceMinor: 200_000,
          productVersion: 4,
        },
        client,
      ),
    ).resolves.toEqual(DEFAULT_PRICE_RESPONSE);

    const [rawUrl, init] = fetcher.mock.calls[0] ?? [];
    expect(new URL(String(rawUrl)).pathname).toBe(
      `/api/v1/pricing/variants/${VARIANT_ID}/default`,
    );
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      unitPriceMinor: 250_000,
      minimumUnitPriceMinor: 200_000,
      productVersion: 4,
    });
  });

  it("rejects scope or cost smuggling before opening the network", () => {
    const { client, fetcher } = clientFor(DEFAULT_PRICE_RESPONSE);

    expect(() =>
      setVariantDefaultPrice(
        VARIANT_ID,
        {
          unitPriceMinor: 250_000,
          minimumUnitPriceMinor: 200_000,
          productVersion: 4,
          landedCostMinor: 100_000,
          organizationId: "10000000-0000-4000-8000-000000000001",
        } as never,
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a default-price response expanded with cost", async () => {
    const { client } = clientFor({
      ...DEFAULT_PRICE_RESPONSE,
      effectivePrice: {
        ...DEFAULT_PRICE_RESPONSE.effectivePrice,
        actualCostMinor: 100_000,
      },
    });

    await expect(
      setVariantDefaultPrice(
        VARIANT_ID,
        {
          unitPriceMinor: 250_000,
          minimumUnitPriceMinor: 200_000,
          productVersion: 4,
        },
        client,
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
