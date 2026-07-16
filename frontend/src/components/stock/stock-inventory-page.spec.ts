import { PAGINATION, type SerializedUnitSummary } from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/stock",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const {
  STOCK_TABS,
  StockInventoryPage,
  inventoryReadErrorCopy,
  locationParametersFrom,
  movementParametersFrom,
  nextStockTabIndex,
  serializedUnitParametersFrom,
  stockBalanceParametersFrom,
  stockCapabilities,
  stockTabFrom,
  stockTabQuery,
} = await import("./stock-inventory-page");
const { allowedManualTransitions, canTransferSerializedUnit } =
  await import("./stock-action-drawer");

const VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const DESTINATION_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_ID = "44444444-4444-4444-8444-444444444444";
const MOVEMENT_ID = "55555555-5555-4555-8555-555555555555";

const balance = {
  productVariant: { id: VARIANT_ID, sku: "CASE-BLK", name: "Black case" },
  locationId: LOCATION_ID,
  locationName: "Main store",
  trackingType: "quantity",
  onHand: 8,
  reserved: 2,
  available: 6,
} as const;

const serializedUnit: SerializedUnitSummary = {
  id: UNIT_ID,
  productVariant: {
    id: VARIANT_ID,
    sku: "PHONE-256",
    name: "256 GB Black",
  },
  stockLocation: { id: LOCATION_ID, name: "Main store", code: "MAIN" },
  state: "available",
  condition: "new",
  ptaStatus: "pta_approved",
  identifiers: [{ type: "imei", value: "356938035643809" }],
  receivedAt: "2026-07-15T10:00:00.000Z",
  version: 2,
};

const locations = [
  {
    id: LOCATION_ID,
    name: "Main store",
    code: "MAIN",
    locationType: "store",
    isActive: true,
    version: 1,
  },
  {
    id: DESTINATION_ID,
    name: "Warehouse",
    code: "WH",
    locationType: "warehouse",
    isActive: true,
    version: 1,
  },
] as const;

function page<T>(items: readonly T[]) {
  return {
    items,
    page: 1,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  };
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function seedAuth(client: QueryClient, permissions: readonly string[]): void {
  client.setQueryData(queryKeys.currentAuth, { permissions });
}

function seedLocations(client: QueryClient): void {
  client.setQueryData(
    queryKeys.inventoryLocations({
      page: 1,
      pageSize: PAGINATION.MAX_PAGE_SIZE,
      active: true,
    }),
    {
      ...page(locations),
      pageSize: PAGINATION.MAX_PAGE_SIZE,
    },
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

describe("stock route URL state", () => {
  it("defaults unknown tabs to balances and preserves other state when switching", () => {
    expect(stockTabFrom(new URLSearchParams(""))).toBe("balances");
    expect(stockTabFrom(new URLSearchParams("tab=unknown"))).toBe("balances");
    expect(stockTabFrom(new URLSearchParams("tab=units"))).toBe("units");

    const query = new URLSearchParams(
      stockTabQuery(new URLSearchParams("q=case&page=2"), "movements"),
    );
    expect(query.get("tab")).toBe("movements");
    expect(query.get("q")).toBe("case");
    expect(query.get("page")).toBe("2");
  });

  it("uses accessible wrapping arrow, Home and End tab navigation", () => {
    const length = STOCK_TABS.length;
    expect(nextStockTabIndex(0, "ArrowLeft", length)).toBe(length - 1);
    expect(nextStockTabIndex(length - 1, "ArrowRight", length)).toBe(0);
    expect(nextStockTabIndex(2, "Home", length)).toBe(0);
    expect(nextStockTabIndex(0, "End", length)).toBe(length - 1);
    expect(nextStockTabIndex(0, "Enter", length)).toBeNull();
  });

  it("parses each tab's namespaced filters and ignores a tampered UUID", () => {
    expect(
      stockBalanceParametersFrom(
        new URLSearchParams(
          `q=case&page=3&trackingType=quantity&locationId=${LOCATION_ID}`,
        ),
      ),
    ).toMatchObject({
      q: "case",
      page: 3,
      trackingType: "quantity",
      stockLocationId: LOCATION_ID,
    });
    expect(
      serializedUnitParametersFrom(
        new URLSearchParams("uq=3569&ustate=available&ulocationId=not-a-uuid"),
      ),
    ).toEqual({
      page: 1,
      pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
      q: "3569",
      state: "available",
    });
    expect(
      movementParametersFrom(
        new URLSearchParams("movementType=reserve&mpage=2"),
      ),
    ).toMatchObject({ movementType: "reserve", page: 2 });
    expect(
      locationParametersFrom(
        new URLSearchParams("locationType=warehouse&lactive=false"),
      ),
    ).toMatchObject({ locationType: "warehouse", active: false });
  });
});

describe("stock permission boundaries", () => {
  it("maps each action to its exact server-provided permission", () => {
    expect(stockCapabilities(["inventory.view", "inventory.reserve"])).toEqual({
      canView: true,
      canAdjust: false,
      canReserve: true,
      canTransfer: false,
      canViewCatalog: false,
      canManageLocations: false,
    });
  });

  it("renders a forbidden state and creates no inventory query without inventory.view", () => {
    const client = newQueryClient();
    seedAuth(client, ["catalog.view"]);

    const html = render(client, createElement(StockInventoryPage));

    expect(html).toContain("Inventory access required");
    expect(html).toContain("No inventory request was sent");
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey[0] === "inventory"),
    ).toBe(false);
  });

  it("shows real balances but no mutation controls to a view-only user", () => {
    const client = newQueryClient();
    seedAuth(client, ["inventory.view"]);
    seedLocations(client);
    client.setQueryData(
      queryKeys.inventoryBalances(
        stockBalanceParametersFrom(new URLSearchParams("")),
      ),
      page([balance]),
    );

    const html = render(client, createElement(StockInventoryPage));

    expect(html).toContain("CASE-BLK");
    expect(html).toContain("Black case");
    expect(html).not.toContain(">Adjust</button>");
    expect(html).not.toContain(">Reserve</button>");
    expect(html).not.toContain(">Transfer</button>");
  });

  it("shows only granted quantity actions and never an inferred delete", () => {
    const client = newQueryClient();
    seedAuth(client, [
      "inventory.view",
      "inventory.adjust",
      "inventory.reserve",
      "inventory.transfer",
    ]);
    seedLocations(client);
    client.setQueryData(
      queryKeys.inventoryBalances(
        stockBalanceParametersFrom(new URLSearchParams("")),
      ),
      page([balance]),
    );

    const html = render(client, createElement(StockInventoryPage));

    expect(html).toContain(">Adjust</button>");
    expect(html).toContain(">Reserve</button>");
    expect(html).toContain(">Release</button>");
    expect(html).toContain(">Transfer</button>");
    expect(html).not.toMatch(/>\s*Delete\s*</);
  });
});

describe("stock inventory rendering", () => {
  it("renders an honest empty state without fake stock or IMEIs", () => {
    const client = newQueryClient();
    seedAuth(client, ["inventory.view"]);
    seedLocations(client);
    client.setQueryData(
      queryKeys.inventoryBalances(
        stockBalanceParametersFrom(new URLSearchParams("")),
      ),
      page([]),
    );

    const html = render(client, createElement(StockInventoryPage));

    expect(html).toContain("No recorded stock balances");
    expect(html).toContain("no demo quantity is inserted");
    expect(html).not.toContain("356938035643809");
  });

  it("renders named serialized units and safe unit actions", () => {
    navigation.search = "tab=units";
    const client = newQueryClient();
    seedAuth(client, [
      "inventory.view",
      "inventory.adjust",
      "inventory.transfer",
    ]);
    seedLocations(client);
    client.setQueryData(
      queryKeys.inventorySerializedUnits(
        serializedUnitParametersFrom(new URLSearchParams(navigation.search)),
      ),
      page([serializedUnit]),
    );

    const html = render(client, createElement(StockInventoryPage));

    expect(html).toContain("356938035643809");
    expect(html).toContain("PHONE-256");
    expect(html).toContain("Reserve / state");
    expect(html).toContain(">Transfer</button>");
    expect(allowedManualTransitions("available")).not.toContain("sold");
    expect(canTransferSerializedUnit(serializedUnit)).toBe(true);
    expect(
      canTransferSerializedUnit({ ...serializedUnit, state: "written_off" }),
    ).toBe(false);
  });

  it("renders movement rows from the append-only API page", () => {
    navigation.search = "tab=movements";
    const client = newQueryClient();
    seedAuth(client, ["inventory.view"]);
    seedLocations(client);
    client.setQueryData(
      queryKeys.inventoryMovements(
        movementParametersFrom(new URLSearchParams(navigation.search)),
      ),
      page([
        {
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
        },
      ]),
    );

    const html = render(client, createElement(StockInventoryPage));

    expect(html).toContain("Adjustment In");
    expect(html).toContain("Counted opening stock");
    expect(html).toContain("append-only stock ledger");
  });

  it("renders location status from the API and does not claim edit capability", () => {
    navigation.search = "tab=locations";
    const client = newQueryClient();
    seedAuth(client, ["inventory.view"]);
    client.setQueryData(
      queryKeys.inventoryLocations(
        locationParametersFrom(new URLSearchParams(navigation.search)),
      ),
      page(locations),
    );

    const html = render(client, createElement(StockInventoryPage));

    expect(html).toContain("Main store");
    expect(html).toContain("Warehouse");
    expect(html).toContain("not location configuration");
    expect(html).not.toContain("Edit location");
  });

  it("distinguishes contract rejection from an offline read", () => {
    expect(
      inventoryReadErrorCopy(
        new ApiError("Bad shape", { code: "INVALID_RESPONSE", status: 200 }),
      ).description,
    ).toContain("strict inventory contract");
    expect(
      inventoryReadErrorCopy(new ApiError("Offline", { code: "NETWORK_ERROR" }))
        .description,
    ).toContain("No cached demo stock");
  });

  it("does not render cost, price or organization identifiers from stock rows", () => {
    const client = newQueryClient();
    seedAuth(client, ["inventory.view"]);
    seedLocations(client);
    client.setQueryData(
      queryKeys.inventoryBalances(
        stockBalanceParametersFrom(new URLSearchParams("")),
      ),
      page([balance]),
    );

    const html = render(client, createElement(StockInventoryPage));
    expect(html).not.toMatch(/costMinor|priceMinor|organizationId|landedCost/i);
  });
});
