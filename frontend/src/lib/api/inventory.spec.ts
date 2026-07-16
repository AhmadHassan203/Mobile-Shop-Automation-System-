import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  adjustStock,
  getInventoryMovements,
  getSerializedUnits,
  getStockBalances,
  getStockLocations,
  releaseStock,
  reserveStock,
  transferSerializedUnit,
  transferStock,
  transitionSerializedUnit,
} from "./inventory";

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const DESTINATION_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_ID = "44444444-4444-4444-8444-444444444444";
const MOVEMENT_ID = "55555555-5555-4555-8555-555555555555";

const balance = {
  productVariant: {
    id: VARIANT_ID,
    sku: "CASE-BLK",
    name: "Black case",
  },
  locationId: LOCATION_ID,
  locationName: "Main store",
  trackingType: "quantity",
  onHand: 8,
  reserved: 2,
  available: 6,
} as const;

const unit = {
  id: UNIT_ID,
  productVariant: {
    id: VARIANT_ID,
    sku: "PHONE-256",
    name: "256 GB Black",
  },
  stockLocation: {
    id: LOCATION_ID,
    name: "Main store",
    code: "MAIN",
  },
  state: "available",
  condition: "new",
  ptaStatus: "pta_approved",
  identifiers: [{ type: "imei", value: "356938035643809" }],
  receivedAt: "2026-07-15T10:00:00.000Z",
  version: 2,
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

describe("inventory read API contracts", () => {
  it("serializes balance pagination, search and filters", async () => {
    const { client, fetcher } = clientFor(page([balance]));

    await getStockBalances(
      {
        page: 2,
        pageSize: 25,
        q: "case",
        stockLocationId: LOCATION_ID,
        trackingType: "quantity",
      },
      undefined,
      client,
    );

    const [rawUrl, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.pathname).toBe("/api/v1/inventory");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "25",
      q: "case",
      stockLocationId: LOCATION_ID,
      trackingType: "quantity",
    });
    expect(init.method).toBe("GET");
  });

  it("rejects a balance whose available quantity is not derived correctly", async () => {
    const { client } = clientFor(page([{ ...balance, available: 7 }]));

    await expect(
      getStockBalances({ page: 1, pageSize: 25 }, undefined, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects cost, price and organization fields in a balance response", async () => {
    const { client } = clientFor(
      page([
        {
          ...balance,
          costMinor: 100,
          priceMinor: 200,
          organizationId: UNIT_ID,
        },
      ]),
    );

    await expect(
      getStockBalances({ page: 1, pageSize: 25 }, undefined, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("serializes serialized-unit lifecycle filters", async () => {
    const { client, fetcher } = clientFor(page([unit]));

    await getSerializedUnits(
      {
        page: 1,
        pageSize: 25,
        q: "356938",
        stockLocationId: LOCATION_ID,
        state: "available",
        condition: "new",
        ptaStatus: "pta_approved",
      },
      undefined,
      client,
    );

    const url = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/v1/serialized-units");
    expect(url.searchParams.get("state")).toBe("available");
    expect(url.searchParams.get("condition")).toBe("new");
    expect(url.searchParams.get("ptaStatus")).toBe("pta_approved");
  });

  it("rejects a serialized unit that leaks landed cost", async () => {
    const { client } = clientFor(page([{ ...unit, landedCostMinor: 125_000 }]));

    await expect(
      getSerializedUnits({ page: 1, pageSize: 25 }, undefined, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("serializes movement and location filters on their real routes", async () => {
    const movement = {
      id: MOVEMENT_ID,
      productVariant: balance.productVariant,
      stockLocationId: LOCATION_ID,
      serializedUnitId: null,
      stockBatchId: UNIT_ID,
      movementType: "adjustment_in",
      quantity: 3,
      fromState: null,
      toState: null,
      referenceType: "opening_balance",
      referenceId: null,
      reason: "Counted opening stock",
      occurredAt: "2026-07-15T10:00:00.000Z",
    } as const;
    const movements = clientFor(page([movement]));
    const locations = clientFor(
      page([
        {
          id: LOCATION_ID,
          name: "Main store",
          code: "MAIN",
          locationType: "store",
          isActive: true,
          version: 1,
        },
      ]),
    );

    await getInventoryMovements(
      {
        page: 1,
        pageSize: 25,
        stockLocationId: LOCATION_ID,
        movementType: "adjustment_in",
      },
      undefined,
      movements.client,
    );
    await getStockLocations(
      { page: 1, pageSize: 25, active: true, locationType: "store" },
      undefined,
      locations.client,
    );

    expect(
      new URL(movements.fetcher.mock.calls[0]?.[0] as string).pathname,
    ).toBe("/api/v1/inventory/movements");
    const locationUrl = new URL(locations.fetcher.mock.calls[0]?.[0] as string);
    expect(locationUrl.pathname).toBe("/api/v1/locations");
    expect(locationUrl.searchParams.get("active")).toBe("true");
    expect(locationUrl.searchParams.get("locationType")).toBe("store");
  });
});

describe("inventory mutation API contracts", () => {
  it("posts a strict adjustment without tenant or cost fields", async () => {
    const { client, fetcher } = clientFor(balance);

    await adjustStock(
      {
        productVariantId: VARIANT_ID,
        stockLocationId: LOCATION_ID,
        movementType: "adjustment_in",
        quantity: 3,
        adjustmentReason: "opening_balance",
        reason: "Counted opening stock",
      },
      client,
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("https://api.test/api/v1/inventory/adjustments");
    expect(init.method).toBe("POST");
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("costMinor");
    expect(body).toMatchObject({
      quantity: 3,
      adjustmentReason: "opening_balance",
    });
  });

  it("uses the product id in the reservation release path and body", async () => {
    const { client, fetcher } = clientFor(balance);

    await releaseStock(
      {
        productVariantId: VARIANT_ID,
        stockLocationId: LOCATION_ID,
        quantity: 1,
      },
      client,
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.test/api/v1/inventory/reservations/${VARIANT_ID}`,
    );
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toMatchObject({
      productVariantId: VARIANT_ID,
    });
  });

  it("posts reserve and transfer to distinct endpoints", async () => {
    const reserve = clientFor(balance);
    const transfer = clientFor(
      page([balance, { ...balance, locationId: DESTINATION_ID }]),
    );

    await reserveStock(
      {
        productVariantId: VARIANT_ID,
        stockLocationId: LOCATION_ID,
        quantity: 1,
      },
      reserve.client,
    );
    await transferStock(
      {
        productVariantId: VARIANT_ID,
        fromStockLocationId: LOCATION_ID,
        toStockLocationId: DESTINATION_ID,
        quantity: 1,
        reason: "Move to warehouse",
      },
      transfer.client,
    );

    expect(reserve.fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.test/api/v1/inventory/reservations",
    );
    expect(transfer.fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.test/api/v1/inventory/transfers",
    );
  });

  it("rejects a transfer to the same location before sending a request", () => {
    const { client, fetcher } = clientFor(page([]));

    expect(() =>
      transferStock(
        {
          productVariantId: VARIANT_ID,
          fromStockLocationId: LOCATION_ID,
          toStockLocationId: LOCATION_ID,
          quantity: 1,
          reason: "Invalid",
        },
        client,
      ),
    ).toThrow("Choose a destination different from the source location");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("carries the loaded unit version on state and location actions", async () => {
    const detail = {
      ...unit,
      createdAt: "2026-07-15T10:00:00.000Z",
      updatedAt: "2026-07-15T10:00:00.000Z",
    };
    const transition = clientFor({ ...detail, state: "reserved", version: 3 });
    const transfer = clientFor({
      ...detail,
      stockLocation: { ...detail.stockLocation, id: DESTINATION_ID },
      version: 3,
    });

    await transitionSerializedUnit(
      UNIT_ID,
      { toState: "reserved", reason: "Held for customer", version: 2 },
      transition.client,
    );
    await transferSerializedUnit(
      UNIT_ID,
      {
        toStockLocationId: DESTINATION_ID,
        reason: "Move to warehouse",
        version: 2,
      },
      transfer.client,
    );

    const [transitionUrl, transitionInit] = transition.fetcher.mock
      .calls[0] as [string, RequestInit];
    const [transferUrl, transferInit] = transfer.fetcher.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(transitionUrl).toContain(`/serialized-units/${UNIT_ID}/transition`);
    expect(transferUrl).toContain(`/serialized-units/${UNIT_ID}/transfer`);
    expect(JSON.parse(String(transitionInit.body))).toMatchObject({
      version: 2,
    });
    expect(JSON.parse(String(transferInit.body))).toMatchObject({ version: 2 });
  });
});
