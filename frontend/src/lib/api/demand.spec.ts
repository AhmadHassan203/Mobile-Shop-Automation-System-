import {
  DEMAND_CONVERSION_CAPABILITIES,
  type PosSellablePage,
  type ProductSummary,
} from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  DemandCaptureProductSchema,
  appendDemandFollowUp,
  adaptDemandCaptureProduct,
  convertDemandRequest,
  createDemandRequest,
  getDemandConversionCapabilities,
  getDemandRequest,
  getDemandRequests,
  transitionDemandRequestStatus,
  updateDemandRequest,
} from "./demand";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const MODEL_ID = "33333333-3333-4333-8333-333333333333";
const BRAND_ID = "44444444-4444-4444-8444-444444444444";
const CATEGORY_ID = "55555555-5555-4555-8555-555555555555";
const UNIT_ID = "66666666-6666-4666-8666-666666666666";
const NOW = "2026-07-16T10:00:00.000Z";
const DEMAND_ID = "77777777-7777-4777-8777-777777777777";
const FOLLOW_UP_ID = "88888888-8888-4888-8888-888888888888";
const SALE_ID = "99999999-9999-4999-8999-999999999999";

const product: ProductSummary = {
  id: PRODUCT_ID,
  productModel: {
    id: MODEL_ID,
    name: "Galaxy A55",
    brand: { id: BRAND_ID, name: "Samsung" },
    category: { id: CATEGORY_ID, name: "Phones" },
  },
  sku: "PH-SAMSUNG-A55-256",
  name: "256 GB Navy",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  ram: "8 GB",
  storage: "256 GB",
  color: "Navy",
  region: "PK",
  warrantyType: "official",
  warrantyMonths: 12,
  isActive: true,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const demand = {
  id: DEMAND_ID,
  requestNumber: "DM-000001",
  requestedAt: NOW,
  item: {
    match: "matched" as const,
    rawRequestText: "Samsung Galaxy A55 256 GB",
    productVariant: {
      id: PRODUCT_ID,
      sku: product.sku,
      displayName: "Samsung Galaxy A55 · 256 GB Navy",
    },
    desiredBrand: "Samsung",
    desiredModel: "Galaxy A55",
    desiredVariant: "256 GB Navy",
    desiredRam: "8 GB",
    desiredStorage: "256 GB",
    desiredColor: "Navy",
    conditionPreference: "new" as const,
  },
  contact: {
    customerId: null,
    customerName: null,
    customerPhone: null,
    consentToContact: false,
  },
  quantity: 1,
  budget: { minimumMinor: 12_000_000, maximumMinor: 13_000_000 },
  ptaPreference: "pta_only" as const,
  urgency: "within_week" as const,
  channel: "walk_in" as const,
  status: "new" as const,
  outcome: "unknown" as const,
  availabilityState: "available" as const,
  followUpOn: null,
  qualifiedForBuyingPlan: false,
  countsTowardForecast: false,
  version: 2,
  createdAt: NOW,
  updatedAt: NOW,
  availabilitySnapshot: {
    state: "available" as const,
    checkedAt: NOW,
    availableQuantity: 2,
    unitPriceMinor: 12_500_000,
  },
  tradeInInterest: false,
  note: null,
  lostSaleReason: null,
  dedupeGroupId: null,
  followUps: [],
  conversion: null,
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
  const body = fetcher.mock.calls[0]?.[1]?.body;
  return body === undefined ? undefined : JSON.parse(String(body));
}

function page(
  stock: PosSellablePage["items"][number]["stock"],
): PosSellablePage {
  return {
    items: [
      {
        productVariantId: PRODUCT_ID,
        sku: product.sku,
        name: product.name,
        brandName: product.productModel.brand.name,
        modelName: product.productModel.name,
        categoryName: product.productModel.category.name,
        trackingType: "serialized",
        condition: "new",
        ptaStatus: "pta_approved",
        productVersion: 1,
        effectivePrice: {
          currency: "PKR",
          unitPriceMinor: 12_500_000,
          minimumUnitPriceMinor: 12_000_000,
          source: "variant_default",
          sourceId: null,
          version: 2,
          effectiveAt: NOW,
        },
        stock,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  } as PosSellablePage;
}

describe("Demand capture adapter", () => {
  it("keeps lookup permission and transport failures distinct from unpriced", () => {
    expect(
      adaptDemandCaptureProduct(product, undefined, "permission_denied"),
    ).toMatchObject({
      availability: "lookup_unavailable",
      reason: "permission",
    });
    expect(
      adaptDemandCaptureProduct(product, undefined, "request_failed"),
    ).toMatchObject({
      availability: "lookup_unavailable",
      reason: "request_failed",
    });
    expect(
      adaptDemandCaptureProduct(
        product,
        {
          items: [],
          page: 1,
          pageSize: 100,
          total: 0,
          totalPages: 0,
        },
        "ready",
      ),
    ).toMatchObject({ availability: "price_not_configured" });
  });

  it("retains a priced out-of-stock product as qualified-demand evidence", () => {
    expect(
      adaptDemandCaptureProduct(
        product,
        page({ availability: "out_of_stock" }),
        "ready",
      ),
    ).toEqual({
      productVariantId: PRODUCT_ID,
      sku: product.sku,
      displayName: "Samsung Galaxy A55 · 256 GB Navy",
      trackingType: "serialized",
      availability: "out_of_stock",
      currency: "PKR",
      unitPriceMinor: 12_500_000,
    });
  });

  it("summarizes only real serialized choices and locations", () => {
    const result = adaptDemandCaptureProduct(
      product,
      page({
        availability: "saleable",
        serializedUnitChoices: [
          {
            serializedUnitId: UNIT_ID,
            unitVersion: 3,
            location: {
              id: LOCATION_ID,
              code: "MAIN",
              name: "Main counter",
            },
            condition: "new",
            ptaStatus: "pta_approved",
            identifiers: [{ type: "imei", value: "356789012345678" }],
          },
        ],
      }),
      "ready",
    );
    expect(result).toMatchObject({
      availability: "saleable",
      availableQuantity: 1,
      locationNames: ["Main counter"],
    });
  });

  it("keeps the local response strict and free of invented demand fields", () => {
    expect(
      DemandCaptureProductSchema.safeParse({
        ...adaptDemandCaptureProduct(product, undefined, "checking"),
        qualifiedDemandCount: 12,
      }).success,
    ).toBe(false);
  });
});

describe("Demand API", () => {
  it("serializes every scoped ledger filter and validates the KPI envelope", async () => {
    const result = {
      page: {
        items: [
          {
            id: demand.id,
            requestNumber: demand.requestNumber,
            requestedAt: demand.requestedAt,
            item: {
              match: demand.item.match,
              rawRequestText: demand.item.rawRequestText,
              productVariant: demand.item.productVariant,
            },
            contact: demand.contact,
            quantity: demand.quantity,
            budget: demand.budget,
            ptaPreference: demand.ptaPreference,
            urgency: demand.urgency,
            channel: demand.channel,
            status: demand.status,
            outcome: demand.outcome,
            availabilityState: demand.availabilityState,
            followUpOn: demand.followUpOn,
            qualifiedForBuyingPlan: demand.qualifiedForBuyingPlan,
            countsTowardForecast: demand.countsTowardForecast,
            version: demand.version,
            createdAt: demand.createdAt,
            updatedAt: demand.updatedAt,
          },
        ],
        page: 2,
        pageSize: 25,
        total: 26,
        totalPages: 2,
      },
      kpis: {
        asOf: NOW,
        businessDate: "2026-07-16",
        totalRequests: 26,
        unavailableMissed: 4,
        reservedOrQuoted: 3,
        followUpsDue: 2,
      },
    };
    const { client, fetcher } = clientFor(result);

    await expect(
      getDemandRequests(
        {
          page: 2,
          pageSize: 25,
          q: "Galaxy",
          view: "unavailable",
          status: "sourcing",
          outcome: "unavailable",
          urgency: "within_week",
          channel: "walk_in",
          match: "matched",
          availability: "unavailable",
          followUp: "due",
          fromDate: "2026-07-01",
          toDate: "2026-07-16",
          sort: "requested_at",
          direction: "desc",
        },
        undefined,
        client,
      ),
    ).resolves.toEqual(result);

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/demand");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: "Galaxy",
      view: "unavailable",
      status: "sourcing",
      followUp: "due",
      fromDate: "2026-07-01",
      toDate: "2026-07-16",
    });
  });

  it("uses the production detail and honest capability routes", async () => {
    const detailClient = clientFor(demand);
    await expect(
      getDemandRequest(DEMAND_ID, undefined, detailClient.client),
    ).resolves.toEqual(demand);
    expect(String(detailClient.fetcher.mock.calls[0]?.[0])).toContain(
      `/demand/${DEMAND_ID}`,
    );

    const capabilityClient = clientFor(DEMAND_CONVERSION_CAPABILITIES);
    await expect(
      getDemandConversionCapabilities(undefined, capabilityClient.client),
    ).resolves.toEqual(DEMAND_CONVERSION_CAPABILITIES);
    expect(String(capabilityClient.fetcher.mock.calls[0]?.[0])).toContain(
      "/demand/conversion-capabilities",
    );
  });

  it("sends strict create, replace, status, follow-up and sale-link payloads", async () => {
    const createInput = {
      item: {
        match: "matched" as const,
        rawRequestText: demand.item.rawRequestText,
        productVariantId: PRODUCT_ID,
        desiredBrand: "Samsung",
        desiredModel: "Galaxy A55",
        desiredVariant: "256 GB Navy",
        desiredRam: "8 GB",
        desiredStorage: "256 GB",
        desiredColor: "Navy",
        conditionPreference: "new" as const,
      },
      customerId: null,
      customerName: null,
      customerPhone: null,
      consentToContact: false,
      quantity: 1,
      budget: demand.budget,
      ptaPreference: "pta_only" as const,
      urgency: "within_week" as const,
      channel: "walk_in" as const,
      tradeInInterest: false,
      followUpOn: null,
      note: null,
      availabilitySnapshot: demand.availabilitySnapshot,
    };
    const createClient = clientFor(demand);
    await createDemandRequest(createInput, createClient.client);
    expect(requestBody(createClient.fetcher)).toEqual(createInput);

    const updateClient = clientFor(demand);
    await updateDemandRequest(
      DEMAND_ID,
      {
        item: {
          match: "matched",
          productVariantId: PRODUCT_ID,
          desiredBrand: "Samsung",
          desiredModel: "Galaxy A55",
          desiredVariant: "256 GB Navy",
          desiredRam: "8 GB",
          desiredStorage: "256 GB",
          desiredColor: "Navy",
          conditionPreference: "new",
        },
        customerId: null,
        customerName: null,
        customerPhone: null,
        consentToContact: false,
        quantity: 1,
        budget: demand.budget,
        ptaPreference: "pta_only",
        urgency: "within_week",
        channel: "walk_in",
        tradeInInterest: false,
        followUpOn: null,
        note: null,
        version: 2,
      },
      updateClient.client,
    );
    expect(requestBody(updateClient.fetcher)).not.toHaveProperty(
      "availabilitySnapshot",
    );
    expect(requestBody(updateClient.fetcher)).not.toHaveProperty(
      "rawRequestText",
    );

    const statusClient = clientFor({
      demandRequestId: DEMAND_ID,
      status: "sourcing",
      outcome: "unknown",
      lostSaleReason: null,
      version: 3,
      updatedAt: NOW,
    });
    await transitionDemandRequestStatus(
      DEMAND_ID,
      { status: "sourcing", outcome: "unknown", lostSaleReason: null, version: 2 },
      statusClient.client,
    );
    expect(requestBody(statusClient.fetcher)).toMatchObject({ version: 2 });

    const followUpClient = clientFor({
      followUp: {
        id: FOLLOW_UP_ID,
        demandRequestId: DEMAND_ID,
        occurredAt: NOW,
        channel: "phone",
        result: "reached",
        note: "Customer remains interested.",
        nextFollowUpOn: null,
        createdBy: { id: LOCATION_ID, displayName: "Demand User" },
        createdAt: NOW,
      },
      requestVersion: 3,
      nextFollowUpOn: null,
    });
    await appendDemandFollowUp(
      DEMAND_ID,
      {
        occurredAt: NOW,
        channel: "phone",
        result: "reached",
        note: "Customer remains interested.",
        nextFollowUpOn: null,
      },
      followUpClient.client,
    );
    expect(String(followUpClient.fetcher.mock.calls[0]?.[0])).toContain(
      "/follow-ups",
    );

    const conversionClient = clientFor({
      demandRequestId: DEMAND_ID,
      target: "sale",
      targetId: SALE_ID,
      status: "converted_to_sale",
      outcome: "sold_immediately",
      convertedAt: NOW,
      version: 3,
    });
    await convertDemandRequest(
      DEMAND_ID,
      { target: "sale", saleId: SALE_ID, version: 2 },
      conversionClient.client,
    );
    expect(requestBody(conversionClient.fetcher)).toEqual({
      target: "sale",
      saleId: SALE_ID,
      version: 2,
    });
  });
});
