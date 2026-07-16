import { describe, expect, it } from "vitest";
import {
  AppendDemandFollowUpInputSchema,
  AppendDemandFollowUpResultSchema,
  ConvertDemandRequestInputSchema,
  CreateDemandRequestInputSchema,
  DEMAND_CONVERSION_CAPABILITIES,
  DEMAND_CONVERSION_TARGETS,
  DEMAND_SUPPORTED_CONVERSION_TARGETS,
  DemandAvailabilitySnapshotSchema,
  DemandConversionCapabilitySchema,
  DemandConversionResultSchema,
  DemandKpisSchema,
  DemandListQuerySchema,
  DemandListResultSchema,
  DemandRequestDetailSchema,
  DemandRequestItemSchema,
  DemandStatusTransitionResultSchema,
  TransitionDemandStatusInputSchema,
  UpdateDemandRequestInputSchema,
} from "./demand";

const IDS = {
  demand: "10000000-0000-4000-8000-000000000001",
  product: "10000000-0000-4000-8000-000000000002",
  customer: "10000000-0000-4000-8000-000000000003",
  user: "10000000-0000-4000-8000-000000000004",
  followUp: "10000000-0000-4000-8000-000000000005",
  sale: "10000000-0000-4000-8000-000000000006",
  dedupeGroup: "10000000-0000-4000-8000-000000000007",
} as const;

const itemPreferences = {
  desiredBrand: "Apple",
  desiredModel: "iPhone 16 Pro",
  desiredVariant: "256 GB · any colour",
  desiredRam: null,
  desiredStorage: "256 GB",
  desiredColor: null,
  conditionPreference: "new" as const,
};

const budget = { minimumMinor: 40_000_00, maximumMinor: 46_000_00 };
const availability = {
  state: "unavailable" as const,
  checkedAt: "2026-07-16T08:00:00.000Z",
  availableQuantity: 0 as const,
  unitPriceMinor: 45_000_00,
};

function createFixture() {
  return {
    item: {
      match: "matched" as const,
      rawRequestText: "  iPhone 16 Pro 256 — any colour  ",
      productVariantId: IDS.product,
      ...itemPreferences,
    },
    customerId: IDS.customer,
    customerName: "  Ahmad   Hassan ",
    customerPhone: "0300-1234567",
    consentToContact: true,
    quantity: 2,
    budget,
    ptaPreference: "pta_only" as const,
    urgency: "within_week" as const,
    channel: "walk_in" as const,
    tradeInInterest: false,
    followUpOn: "2026-07-18",
    note: "  Prefers a dark colour. ",
    availabilitySnapshot: availability,
  };
}

function updateFixture() {
  return {
    item: {
      match: "matched" as const,
      productVariantId: IDS.product,
      ...itemPreferences,
    },
    customerId: IDS.customer,
    customerName: "Ahmad Hassan",
    customerPhone: "+923001234567",
    consentToContact: true,
    quantity: 2,
    budget,
    ptaPreference: "pta_only" as const,
    urgency: "within_week" as const,
    channel: "walk_in" as const,
    tradeInInterest: false,
    followUpOn: "2026-07-18",
    note: "Prefers a dark colour.",
    version: 3,
  };
}

const contact = {
  customerId: IDS.customer,
  customerName: "Ahmad Hassan",
  customerPhone: "+923001234567",
  consentToContact: true,
};

const summary = {
  id: IDS.demand,
  requestNumber: "DM-5001",
  requestedAt: "2026-07-16T08:00:01.000Z",
  item: {
    match: "matched" as const,
    rawRequestText: "iPhone 16 Pro 256 — any colour",
    productVariant: {
      id: IDS.product,
      sku: "APL-IP16P-256",
      displayName: "Apple iPhone 16 Pro · 256 GB · New",
    },
  },
  contact,
  quantity: 2,
  budget,
  ptaPreference: "pta_only" as const,
  urgency: "within_week" as const,
  channel: "walk_in" as const,
  status: "new" as const,
  outcome: "unavailable" as const,
  availabilityState: "unavailable" as const,
  followUpOn: "2026-07-18",
  qualifiedForBuyingPlan: true,
  countsTowardForecast: true,
  version: 1,
  createdAt: "2026-07-16T08:00:01.000Z",
  updatedAt: "2026-07-16T08:00:01.000Z",
};

const followUp = {
  id: IDS.followUp,
  demandRequestId: IDS.demand,
  occurredAt: "2026-07-17T08:30:00.000Z",
  channel: "phone" as const,
  result: "reached" as const,
  note: "Customer is still interested.",
  nextFollowUpOn: "2026-07-20",
  createdBy: { id: IDS.user, displayName: "Sales User" },
  createdAt: "2026-07-17T08:31:00.000Z",
};

function detailFixture() {
  return {
    ...summary,
    item: {
      ...summary.item,
      ...itemPreferences,
    },
    availabilitySnapshot: availability,
    tradeInInterest: false,
    note: "Prefers a dark colour.",
    lostSaleReason: "Exact item was out of stock.",
    dedupeGroupId: IDS.dedupeGroup,
    followUps: [followUp],
    conversion: null,
  };
}

describe("Demand capture and immutable request evidence", () => {
  it("normalizes Pakistani mobile and display text without losing raw wording", () => {
    const parsed = CreateDemandRequestInputSchema.parse(createFixture());

    expect(parsed.customerPhone).toBe("+923001234567");
    expect(parsed.customerName).toBe("Ahmad Hassan");
    expect(parsed.item.rawRequestText).toBe("iPhone 16 Pro 256 — any colour");
    expect(parsed.availabilitySnapshot).toEqual(availability);
  });

  it("supports an unmatched request and an honest not-in-catalog snapshot", () => {
    const fixture = createFixture();
    const parsed = CreateDemandRequestInputSchema.parse({
      ...fixture,
      item: {
        match: "unmatched",
        rawRequestText: "Redmi Note, around 45k",
        ...itemPreferences,
      },
      availabilitySnapshot: {
        state: "not_in_catalog",
        checkedAt: availability.checkedAt,
        availableQuantity: null,
        unitPriceMinor: null,
      },
    });

    expect(parsed.item.match).toBe("unmatched");
  });

  it("rejects false stock claims for unmatched requests and false catalog claims for matches", () => {
    const fixture = createFixture();
    expect(
      CreateDemandRequestInputSchema.safeParse({
        ...fixture,
        item: {
          match: "unmatched",
          rawRequestText: "Something not listed",
          ...itemPreferences,
        },
      }).success,
    ).toBe(false);
    expect(
      CreateDemandRequestInputSchema.safeParse({
        ...fixture,
        availabilitySnapshot: {
          state: "not_in_catalog",
          checkedAt: availability.checkedAt,
          availableQuantity: null,
          unitPriceMinor: null,
        },
      }).success,
    ).toBe(false);
  });

  it("distinguishes unknown lookup failure from an actual stockout", () => {
    expect(
      DemandAvailabilitySnapshotSchema.parse({
        state: "unknown",
        reason: "permission_denied",
        checkedAt: "2026-07-16T08:00:00.000Z",
        availableQuantity: null,
        unitPriceMinor: null,
      }).state,
    ).toBe("unknown");
    expect(
      DemandAvailabilitySnapshotSchema.safeParse({
        state: "unknown",
        reason: "permission_denied",
        checkedAt: null,
        availableQuantity: 0,
        unitPriceMinor: null,
      }).success,
    ).toBe(false);
  });

  it("requires normalized-capable PK mobile and consent before scheduling contact", () => {
    const fixture = createFixture();
    expect(
      CreateDemandRequestInputSchema.safeParse({
        ...fixture,
        customerPhone: "555-0100",
      }).success,
    ).toBe(false);
    expect(
      CreateDemandRequestInputSchema.safeParse({
        ...fixture,
        customerPhone: null,
        consentToContact: true,
      }).success,
    ).toBe(false);
    expect(
      CreateDemandRequestInputSchema.safeParse({
        ...fixture,
        consentToContact: false,
      }).success,
    ).toBe(false);
  });

  it("uses exact safe minor-unit budget and orders a range", () => {
    const fixture = createFixture();
    for (const invalidBudget of [
      { minimumMinor: 20.5, maximumMinor: 30_00 },
      { minimumMinor: -1, maximumMinor: 30_00 },
      { minimumMinor: 40_00, maximumMinor: 30_00 },
      { minimumMinor: Number.MAX_SAFE_INTEGER + 1, maximumMinor: null },
    ]) {
      expect(
        CreateDemandRequestInputSchema.safeParse({
          ...fixture,
          budget: invalidBudget,
        }).success,
      ).toBe(false);
    }
  });

  it("allows a later catalog match but rejects rewriting raw wording or capture evidence", () => {
    expect(UpdateDemandRequestInputSchema.parse(updateFixture()).version).toBe(
      3,
    );
    expect(
      UpdateDemandRequestInputSchema.safeParse({
        ...updateFixture(),
        item: {
          ...updateFixture().item,
          rawRequestText: "rewritten",
        },
      }).success,
    ).toBe(false);
    expect(
      UpdateDemandRequestInputSchema.safeParse({
        ...updateFixture(),
        availabilitySnapshot: availability,
      }).success,
    ).toBe(false);
  });

  it("returns the captured wording alongside a later matched product", () => {
    expect(DemandRequestItemSchema.parse(detailFixture().item)).toEqual(
      detailFixture().item,
    );
  });
});

describe("Demand list, KPIs and detail contracts", () => {
  it("normalizes list defaults and validates date windows", () => {
    expect(DemandListQuerySchema.parse({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50,
      view: "all",
      sort: "requested_at",
      direction: "desc",
    });
    expect(
      DemandListQuerySchema.safeParse({
        fromDate: "2026-07-20",
        toDate: "2026-07-10",
      }).success,
    ).toBe(false);
    expect(DemandListQuerySchema.safeParse({ unknown: "scope" }).success).toBe(
      false,
    );
  });

  it("accepts the exact prototype KPI set and rejects impossible counts", () => {
    const kpis = {
      asOf: "2026-07-16T09:00:00.000Z",
      businessDate: "2026-07-16",
      totalRequests: 12,
      unavailableMissed: 6,
      reservedOrQuoted: 3,
      followUpsDue: 2,
    };
    expect(DemandKpisSchema.parse(kpis)).toEqual(kpis);
    expect(
      DemandKpisSchema.safeParse({ ...kpis, unavailableMissed: 13 }).success,
    ).toBe(false);
  });

  it("wraps a strict page and KPI snapshot", () => {
    const result = {
      page: {
        items: [summary],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      },
      kpis: {
        asOf: "2026-07-16T09:00:00.000Z",
        businessDate: "2026-07-16",
        totalRequests: 1,
        unavailableMissed: 1,
        reservedOrQuoted: 0,
        followUpsDue: 0,
      },
    };
    expect(DemandListResultSchema.parse(result)).toEqual(result);
    expect(
      DemandListResultSchema.safeParse({
        ...result,
        page: { ...result.page, totalPages: 2 },
      }).success,
    ).toBe(false);
  });

  it("parses a detail with immutable availability, dedupe and follow-up history", () => {
    expect(DemandRequestDetailSchema.parse(detailFixture())).toEqual(
      detailFixture(),
    );
  });

  it("requires conversion evidence exactly when status is converted", () => {
    const converted = {
      ...detailFixture(),
      status: "converted_to_sale" as const,
      outcome: "sold_immediately" as const,
      conversion: {
        target: "sale" as const,
        targetId: IDS.sale,
        convertedAt: "2026-07-18T10:00:00.000Z",
      },
    };
    expect(
      DemandRequestDetailSchema.parse(converted).conversion,
    ).not.toBeNull();
    expect(
      DemandRequestDetailSchema.safeParse({ ...converted, conversion: null })
        .success,
    ).toBe(false);
    expect(
      DemandRequestDetailSchema.safeParse({
        ...detailFixture(),
        availabilityState: "available",
      }).success,
    ).toBe(false);
  });
});

describe("Demand transitions, append-only follow-up and conversion", () => {
  it("versions manual status transitions and reserves converted status for conversion", () => {
    const input = {
      status: "contacted",
      outcome: "customer_postponed",
      lostSaleReason: "Customer asked to wait until payday.",
      version: 2,
    };
    expect(TransitionDemandStatusInputSchema.parse(input)).toEqual(input);
    expect(
      TransitionDemandStatusInputSchema.safeParse({
        ...input,
        status: "converted_to_sale",
      }).success,
    ).toBe(false);
    expect(
      DemandStatusTransitionResultSchema.parse({
        demandRequestId: IDS.demand,
        ...input,
        version: 3,
        updatedAt: "2026-07-17T09:00:00.000Z",
      }).version,
    ).toBe(3);
  });

  it("accepts append data only and keeps server identity/actor out of input", () => {
    const input = {
      occurredAt: followUp.occurredAt,
      channel: followUp.channel,
      result: followUp.result,
      note: followUp.note,
      nextFollowUpOn: followUp.nextFollowUpOn,
    };
    expect(AppendDemandFollowUpInputSchema.parse(input)).toEqual(input);
    expect(
      AppendDemandFollowUpInputSchema.safeParse({
        ...input,
        id: IDS.followUp,
      }).success,
    ).toBe(false);
    expect(
      AppendDemandFollowUpResultSchema.parse({
        followUp,
        requestVersion: 2,
        nextFollowUpOn: "2026-07-20",
      }).followUp.id,
    ).toBe(IDS.followUp);
  });

  it("exposes every prototype conversion target and an exact capability reason", () => {
    expect(DEMAND_CONVERSION_CAPABILITIES).toHaveLength(
      DEMAND_CONVERSION_TARGETS.length,
    );
    expect(
      DEMAND_CONVERSION_CAPABILITIES.map((capability) => capability.target),
    ).toEqual(DEMAND_CONVERSION_TARGETS);
    for (const capability of DEMAND_CONVERSION_CAPABILITIES) {
      expect(DemandConversionCapabilitySchema.parse(capability)).toEqual(
        capability,
      );
    }
    expect(DEMAND_SUPPORTED_CONVERSION_TARGETS).toEqual(["sale"]);
  });

  it("accepts only linking an existing sale and returns an atomic conversion result", () => {
    expect(
      ConvertDemandRequestInputSchema.parse({
        target: "sale",
        saleId: IDS.sale,
        version: 2,
      }),
    ).toEqual({ target: "sale", saleId: IDS.sale, version: 2 });

    for (const target of DEMAND_CONVERSION_TARGETS.filter(
      (candidate) => candidate !== "sale",
    )) {
      expect(
        ConvertDemandRequestInputSchema.safeParse({
          target,
          targetId: IDS.product,
          version: 2,
        }).success,
      ).toBe(false);
    }

    const result = {
      demandRequestId: IDS.demand,
      target: "sale" as const,
      targetId: IDS.sale,
      status: "converted_to_sale" as const,
      outcome: "sold_immediately" as const,
      convertedAt: "2026-07-18T10:00:00.000Z",
      version: 3,
    };
    expect(DemandConversionResultSchema.parse(result)).toEqual(result);
  });
});
