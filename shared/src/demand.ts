import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import { PakistanMobileInputSchema } from "./customers";
import {
  DEMAND_CHANNELS,
  DEMAND_OUTCOMES,
  DEMAND_STATUSES,
  DEMAND_URGENCIES,
  PRODUCT_CONDITIONS,
} from "./enums";

/**
 * Public Demand contracts.
 *
 * Tenant, branch, actor and salesperson identity always come from the
 * authenticated server context. Forecast qualification, dedupe membership,
 * request numbers and timestamps are response-only server decisions.
 */
export const DEMAND_CONTRACT_LIMITS = Object.freeze({
  REQUEST_NUMBER_LENGTH: 40,
  RAW_REQUEST_LENGTH: 500,
  CUSTOMER_NAME_LENGTH: 200,
  ATTRIBUTE_LENGTH: 120,
  PRODUCT_DISPLAY_NAME_LENGTH: 300,
  SKU_LENGTH: 100,
  LOST_SALE_REASON_LENGTH: 500,
  FOLLOW_UP_NOTE_LENGTH: 1_000,
  MAX_QUANTITY: 100_000,
});

/** PTA intent is a preference, not the compliance status of a stock unit. */
export const DEMAND_PTA_PREFERENCES = [
  "pta_only",
  "non_pta_ok",
  "no_preference",
] as const;
export type DemandPtaPreference = (typeof DEMAND_PTA_PREFERENCES)[number];

export const DEMAND_AVAILABILITY_STATES = [
  "available",
  "unavailable",
  "not_in_catalog",
  "unknown",
] as const;
export type DemandAvailabilityState =
  (typeof DEMAND_AVAILABILITY_STATES)[number];

export const DEMAND_UNKNOWN_AVAILABILITY_REASONS = [
  "not_checked",
  "permission_denied",
  "lookup_failed",
] as const;
export type DemandUnknownAvailabilityReason =
  (typeof DEMAND_UNKNOWN_AVAILABILITY_REASONS)[number];

export const DEMAND_LIST_VIEWS = [
  "all",
  "unavailable",
  "reserved",
  "quotation_sent",
  "price_too_high",
] as const;
export type DemandListView = (typeof DEMAND_LIST_VIEWS)[number];

export const DEMAND_MATCH_FILTERS = ["matched", "unmatched"] as const;
export type DemandMatchFilter = (typeof DEMAND_MATCH_FILTERS)[number];

export const DEMAND_FOLLOW_UP_FILTERS = ["due", "scheduled", "none"] as const;
export type DemandFollowUpFilter = (typeof DEMAND_FOLLOW_UP_FILTERS)[number];

export const DEMAND_SORT_FIELDS = [
  "requested_at",
  "follow_up_on",
  "urgency",
  "updated_at",
] as const;
export type DemandSortField = (typeof DEMAND_SORT_FIELDS)[number];

export const DEMAND_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type DemandSortDirection = (typeof DEMAND_SORT_DIRECTIONS)[number];

export const DEMAND_FOLLOW_UP_RESULTS = [
  "reached",
  "no_answer",
  "message_sent",
  "customer_replied",
  "reminder_set",
  "other",
] as const;
export type DemandFollowUpResult = (typeof DEMAND_FOLLOW_UP_RESULTS)[number];

/**
 * The prototype names six possible conversion destinations. Only `sale` has a
 * persisted, linkable production entity today. The other capabilities remain
 * visible to clients, but their values are deliberately not accepted by the
 * conversion input schema.
 */
export const DEMAND_CONVERSION_TARGETS = [
  "catalog_entry",
  "quotation",
  "reservation",
  "supplier_inquiry",
  "purchase_recommendation",
  "sale",
] as const;
export type DemandConversionTarget = (typeof DEMAND_CONVERSION_TARGETS)[number];

export const DEMAND_SUPPORTED_CONVERSION_TARGETS = ["sale"] as const;
export type DemandSupportedConversionTarget =
  (typeof DEMAND_SUPPORTED_CONVERSION_TARGETS)[number];

export const DEMAND_CONVERSION_UNAVAILABLE_REASONS = [
  "catalog_workflow_required",
  "quotation_module_unavailable",
  "persisted_reservation_unavailable",
  "supplier_inquiry_module_unavailable",
  "recommendation_module_unavailable",
] as const;
export type DemandConversionUnavailableReason =
  (typeof DEMAND_CONVERSION_UNAVAILABLE_REASONS)[number];

const demandConversionCapabilitySchema = z.discriminatedUnion("target", [
  z
    .object({
      target: z.literal("sale"),
      available: z.literal(true),
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      target: z.literal("catalog_entry"),
      available: z.literal(false),
      reason: z.literal("catalog_workflow_required"),
    })
    .strict(),
  z
    .object({
      target: z.literal("quotation"),
      available: z.literal(false),
      reason: z.literal("quotation_module_unavailable"),
    })
    .strict(),
  z
    .object({
      target: z.literal("reservation"),
      available: z.literal(false),
      reason: z.literal("persisted_reservation_unavailable"),
    })
    .strict(),
  z
    .object({
      target: z.literal("supplier_inquiry"),
      available: z.literal(false),
      reason: z.literal("supplier_inquiry_module_unavailable"),
    })
    .strict(),
  z
    .object({
      target: z.literal("purchase_recommendation"),
      available: z.literal(false),
      reason: z.literal("recommendation_module_unavailable"),
    })
    .strict(),
]);
export const DemandConversionCapabilitySchema =
  demandConversionCapabilitySchema;
export type DemandConversionCapability = z.infer<
  typeof DemandConversionCapabilitySchema
>;

export const DEMAND_CONVERSION_CAPABILITIES = Object.freeze([
  {
    target: "catalog_entry",
    available: false,
    reason: "catalog_workflow_required",
  },
  {
    target: "quotation",
    available: false,
    reason: "quotation_module_unavailable",
  },
  {
    target: "reservation",
    available: false,
    reason: "persisted_reservation_unavailable",
  },
  {
    target: "supplier_inquiry",
    available: false,
    reason: "supplier_inquiry_module_unavailable",
  },
  {
    target: "purchase_recommendation",
    available: false,
    reason: "recommendation_module_unavailable",
  },
  { target: "sale", available: true, reason: null },
] as const satisfies readonly DemandConversionCapability[]);

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

const requiredText = (label: string, maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(
      z
        .string()
        .min(1, `Enter ${label}.`)
        .max(maximum, `${label} must be ${maximum} characters or fewer.`),
    );

const nullableText = (label: string, maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(
      z
        .string()
        .min(1, `${label} cannot be blank.`)
        .max(maximum, `${label} must be ${maximum} characters or fewer.`),
    )
    .nullable();

const responseText = (maximum: number) => z.string().min(1).max(maximum);
const responseNullableText = (maximum: number) =>
  responseText(maximum).nullable();
const positiveVersionSchema = z.number().int().positive();
const nonnegativeCountSchema = z.number().int().nonnegative();
const nonnegativeMoneyMinorSchema = z.number().int().safe().nonnegative();
const responseTimestampSchema = z.iso.datetime();
const responseBusinessDateSchema = z.iso.date();
const responsePhoneSchema = z
  .string()
  .regex(/^\+923\d{9}$/, "Demand phone must be normalized PK E.164.");

const pageInputSchema = z.coerce
  .number()
  .int()
  .positive()
  .default(PAGINATION.DEFAULT_PAGE);
const pageSizeInputSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(PAGINATION.MAX_PAGE_SIZE)
  .default(PAGINATION.DEFAULT_PAGE_SIZE);
const optionalSearchInputSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = normalizeDisplayText(value);
  return normalized.length === 0 ? undefined : normalized;
}, z.string().max(LIMITS.MAX_SEARCH_TERM_LENGTH).optional());

// =============================================================================
// Requested item, budget and capture-time availability
// =============================================================================

const itemPreferenceInputShape = {
  desiredBrand: nullableText(
    "Desired brand",
    DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
  ),
  desiredModel: nullableText(
    "Desired model",
    DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
  ),
  desiredVariant: nullableText(
    "Desired variant",
    DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
  ),
  desiredRam: nullableText(
    "Desired RAM",
    DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
  ),
  desiredStorage: nullableText(
    "Desired storage",
    DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
  ),
  desiredColor: nullableText(
    "Desired colour",
    DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
  ),
  conditionPreference: z.enum(PRODUCT_CONDITIONS).nullable(),
};

const itemPreferenceResponseShape = {
  desiredBrand: responseNullableText(DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
  desiredModel: responseNullableText(DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
  desiredVariant: responseNullableText(DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
  desiredRam: responseNullableText(DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
  desiredStorage: responseNullableText(DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
  desiredColor: responseNullableText(DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
  conditionPreference: z.enum(PRODUCT_CONDITIONS).nullable(),
};

/** Raw wording is captured on create and is intentionally absent from update. */
export const CreateDemandRequestItemInputSchema = z.discriminatedUnion(
  "match",
  [
    z
      .object({
        match: z.literal("matched"),
        rawRequestText: requiredText(
          "what the customer requested",
          DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH,
        ),
        productVariantId: z.uuid(),
        ...itemPreferenceInputShape,
      })
      .strict(),
    z
      .object({
        match: z.literal("unmatched"),
        rawRequestText: requiredText(
          "what the customer requested",
          DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH,
        ),
        ...itemPreferenceInputShape,
      })
      .strict(),
  ],
);
export type CreateDemandRequestItemInput = z.input<
  typeof CreateDemandRequestItemInputSchema
>;
export type CreateDemandRequestItemData = z.output<
  typeof CreateDemandRequestItemInputSchema
>;

/**
 * Replace payloads repeat the captured match identity and may change only its
 * preference fields. Services reject match/unmatch or product-ID changes so
 * immutable availability and forecast-dedupe evidence cannot become
 * contradictory. `rawRequestText` is absent and can never be rewritten.
 */
export const UpdateDemandRequestItemInputSchema = z.discriminatedUnion(
  "match",
  [
    z
      .object({
        match: z.literal("matched"),
        productVariantId: z.uuid(),
        ...itemPreferenceInputShape,
      })
      .strict(),
    z
      .object({
        match: z.literal("unmatched"),
        ...itemPreferenceInputShape,
      })
      .strict(),
  ],
);
export type UpdateDemandRequestItemInput = z.input<
  typeof UpdateDemandRequestItemInputSchema
>;
export type UpdateDemandRequestItemData = z.output<
  typeof UpdateDemandRequestItemInputSchema
>;

export const DemandMatchedProductReferenceSchema = z
  .object({
    id: z.uuid(),
    sku: responseText(DEMAND_CONTRACT_LIMITS.SKU_LENGTH),
    displayName: responseText(
      DEMAND_CONTRACT_LIMITS.PRODUCT_DISPLAY_NAME_LENGTH,
    ),
  })
  .strict();
export type DemandMatchedProductReference = z.infer<
  typeof DemandMatchedProductReferenceSchema
>;

export const DemandRequestItemSchema = z.discriminatedUnion("match", [
  z
    .object({
      match: z.literal("matched"),
      rawRequestText: responseText(DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH),
      productVariant: DemandMatchedProductReferenceSchema,
      ...itemPreferenceResponseShape,
    })
    .strict(),
  z
    .object({
      match: z.literal("unmatched"),
      rawRequestText: responseText(DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH),
      ...itemPreferenceResponseShape,
    })
    .strict(),
]);
export type DemandRequestItem = z.infer<typeof DemandRequestItemSchema>;

export const DemandRequestItemSummarySchema = z.discriminatedUnion("match", [
  z
    .object({
      match: z.literal("matched"),
      rawRequestText: responseText(DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH),
      productVariant: DemandMatchedProductReferenceSchema,
    })
    .strict(),
  z
    .object({
      match: z.literal("unmatched"),
      rawRequestText: responseText(DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH),
    })
    .strict(),
]);
export type DemandRequestItemSummary = z.infer<
  typeof DemandRequestItemSummarySchema
>;

export const DemandBudgetSchema = z
  .object({
    minimumMinor: nonnegativeMoneyMinorSchema.nullable(),
    maximumMinor: nonnegativeMoneyMinorSchema.nullable(),
  })
  .strict()
  .superRefine((budget, context) => {
    if (
      budget.minimumMinor !== null &&
      budget.maximumMinor !== null &&
      budget.minimumMinor > budget.maximumMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Minimum budget cannot exceed maximum budget.",
        path: ["minimumMinor"],
      });
    }
  });
export type DemandBudget = z.infer<typeof DemandBudgetSchema>;

const pricedAvailabilityShape = {
  checkedAt: z.iso.datetime(),
  unitPriceMinor: nonnegativeMoneyMinorSchema.nullable(),
};

/** Immutable evidence of what availability the capture flow could establish. */
export const DemandAvailabilitySnapshotSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("available"),
      ...pricedAvailabilityShape,
      availableQuantity: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      state: z.literal("unavailable"),
      ...pricedAvailabilityShape,
      availableQuantity: z.literal(0),
    })
    .strict(),
  z
    .object({
      state: z.literal("not_in_catalog"),
      checkedAt: z.iso.datetime(),
      availableQuantity: z.null(),
      unitPriceMinor: z.null(),
    })
    .strict(),
  z
    .object({
      state: z.literal("unknown"),
      reason: z.enum(DEMAND_UNKNOWN_AVAILABILITY_REASONS),
      checkedAt: z.iso.datetime().nullable(),
      availableQuantity: z.null(),
      unitPriceMinor: z.null(),
    })
    .strict(),
]);
export type DemandAvailabilitySnapshot = z.infer<
  typeof DemandAvailabilitySnapshotSchema
>;

// =============================================================================
// Create and replace-update inputs
// =============================================================================

const customerContactInputShape = {
  customerId: z.uuid().nullable(),
  customerName: nullableText(
    "Customer name",
    DEMAND_CONTRACT_LIMITS.CUSTOMER_NAME_LENGTH,
  ),
  customerPhone: PakistanMobileInputSchema.nullable(),
  consentToContact: z.boolean(),
};

const demandEditableInputShape = {
  ...customerContactInputShape,
  quantity: z
    .number()
    .int()
    .positive()
    .max(DEMAND_CONTRACT_LIMITS.MAX_QUANTITY),
  budget: DemandBudgetSchema,
  ptaPreference: z.enum(DEMAND_PTA_PREFERENCES),
  urgency: z.enum(DEMAND_URGENCIES),
  channel: z.enum(DEMAND_CHANNELS),
  tradeInInterest: z.boolean(),
  followUpOn: z.iso.date().nullable(),
  note: nullableText("Note", LIMITS.MAX_NOTE_LENGTH),
};

interface DemandContactAndSchedule {
  readonly customerPhone: string | null;
  readonly consentToContact: boolean;
  readonly followUpOn: string | null;
}

function refineDemandContact(
  demand: DemandContactAndSchedule,
  context: z.RefinementCtx,
): void {
  if (demand.consentToContact && demand.customerPhone === null) {
    context.addIssue({
      code: "custom",
      message:
        "A phone number is required before contact consent can be captured.",
      path: ["customerPhone"],
    });
  }
  if (
    demand.followUpOn !== null &&
    (demand.customerPhone === null || !demand.consentToContact)
  ) {
    context.addIssue({
      code: "custom",
      message: "A follow-up requires a phone number and consent to contact.",
      path: ["followUpOn"],
    });
  }
}

interface DemandItemAndAvailability {
  readonly item: { readonly match: "matched" | "unmatched" };
  readonly availabilitySnapshot: DemandAvailabilitySnapshot;
}

function refineCaptureAvailability(
  demand: DemandItemAndAvailability,
  context: z.RefinementCtx,
): void {
  if (
    demand.item.match === "matched" &&
    demand.availabilitySnapshot.state === "not_in_catalog"
  ) {
    context.addIssue({
      code: "custom",
      message: "A matched catalog item cannot be marked as not in the catalog.",
      path: ["availabilitySnapshot", "state"],
    });
  }
  if (
    demand.item.match === "unmatched" &&
    (demand.availabilitySnapshot.state === "available" ||
      demand.availabilitySnapshot.state === "unavailable")
  ) {
    context.addIssue({
      code: "custom",
      message: "Stock availability requires an exact catalog match.",
      path: ["availabilitySnapshot", "state"],
    });
  }
}

export const CreateDemandRequestInputSchema = z
  .object({
    item: CreateDemandRequestItemInputSchema,
    ...demandEditableInputShape,
    availabilitySnapshot: DemandAvailabilitySnapshotSchema,
  })
  .strict()
  .superRefine((demand, context) => {
    refineDemandContact(demand, context);
    refineCaptureAvailability(demand, context);
  });
export type CreateDemandRequestInput = z.input<
  typeof CreateDemandRequestInputSchema
>;
export type CreateDemandRequestData = z.output<
  typeof CreateDemandRequestInputSchema
>;

/**
 * Replace semantics for mutable request data. Original wording, capture-time
 * availability, status, outcome and forecast decisions are deliberately absent.
 */
export const UpdateDemandRequestInputSchema = z
  .object({
    item: UpdateDemandRequestItemInputSchema,
    ...demandEditableInputShape,
    version: positiveVersionSchema,
  })
  .strict()
  .superRefine(refineDemandContact);
export type UpdateDemandRequestInput = z.input<
  typeof UpdateDemandRequestInputSchema
>;
export type UpdateDemandRequestData = z.output<
  typeof UpdateDemandRequestInputSchema
>;

// =============================================================================
// List query, response records and KPIs
// =============================================================================

export const DemandListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchInputSchema,
    view: z.enum(DEMAND_LIST_VIEWS).default("all"),
    status: z.enum(DEMAND_STATUSES).optional(),
    outcome: z.enum(DEMAND_OUTCOMES).optional(),
    urgency: z.enum(DEMAND_URGENCIES).optional(),
    channel: z.enum(DEMAND_CHANNELS).optional(),
    match: z.enum(DEMAND_MATCH_FILTERS).optional(),
    availability: z.enum(DEMAND_AVAILABILITY_STATES).optional(),
    followUp: z.enum(DEMAND_FOLLOW_UP_FILTERS).optional(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
    sort: z.enum(DEMAND_SORT_FIELDS).default("requested_at"),
    direction: z.enum(DEMAND_SORT_DIRECTIONS).default("desc"),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.fromDate !== undefined &&
      query.toDate !== undefined &&
      query.fromDate > query.toDate
    ) {
      context.addIssue({
        code: "custom",
        message: "fromDate cannot be after toDate.",
        path: ["fromDate"],
      });
    }
  });
export type DemandListQueryInput = z.input<typeof DemandListQuerySchema>;
export type DemandListQuery = z.output<typeof DemandListQuerySchema>;

export const DemandContactSchema = z
  .object({
    customerId: z.uuid().nullable(),
    customerName: responseNullableText(
      DEMAND_CONTRACT_LIMITS.CUSTOMER_NAME_LENGTH,
    ),
    customerPhone: responsePhoneSchema.nullable(),
    consentToContact: z.boolean(),
  })
  .strict()
  .superRefine((contact, context) => {
    if (contact.consentToContact && contact.customerPhone === null) {
      context.addIssue({
        code: "custom",
        message: "Contact consent requires a normalized phone number.",
        path: ["customerPhone"],
      });
    }
  });
export type DemandContact = z.infer<typeof DemandContactSchema>;

const requestNumberSchema = z
  .string()
  .min(1)
  .max(DEMAND_CONTRACT_LIMITS.REQUEST_NUMBER_LENGTH)
  .regex(/^DM-[A-Z0-9][A-Z0-9-]*$/, "Invalid demand request number.");

const demandRequestSummaryShape = {
  id: z.uuid(),
  requestNumber: requestNumberSchema,
  requestedAt: responseTimestampSchema,
  item: DemandRequestItemSummarySchema,
  contact: DemandContactSchema,
  quantity: z
    .number()
    .int()
    .positive()
    .max(DEMAND_CONTRACT_LIMITS.MAX_QUANTITY),
  budget: DemandBudgetSchema,
  ptaPreference: z.enum(DEMAND_PTA_PREFERENCES),
  urgency: z.enum(DEMAND_URGENCIES),
  channel: z.enum(DEMAND_CHANNELS),
  status: z.enum(DEMAND_STATUSES),
  outcome: z.enum(DEMAND_OUTCOMES),
  availabilityState: z.enum(DEMAND_AVAILABILITY_STATES),
  followUpOn: responseBusinessDateSchema.nullable(),
  qualifiedForBuyingPlan: z.boolean(),
  countsTowardForecast: z.boolean(),
  version: positiveVersionSchema,
  createdAt: responseTimestampSchema,
  updatedAt: responseTimestampSchema,
};

export const DemandRequestSummarySchema = z
  .object(demandRequestSummaryShape)
  .strict();
export type DemandRequestSummary = z.infer<typeof DemandRequestSummarySchema>;

export const DemandKpisSchema = z
  .object({
    asOf: responseTimestampSchema,
    businessDate: responseBusinessDateSchema,
    totalRequests: nonnegativeCountSchema,
    unavailableMissed: nonnegativeCountSchema,
    reservedOrQuoted: nonnegativeCountSchema,
    followUpsDue: nonnegativeCountSchema,
  })
  .strict()
  .superRefine((kpis, context) => {
    for (const key of [
      "unavailableMissed",
      "reservedOrQuoted",
      "followUpsDue",
    ] as const) {
      if (kpis[key] > kpis.totalRequests) {
        context.addIssue({
          code: "custom",
          message: `${key} cannot exceed totalRequests.`,
          path: [key],
        });
      }
    }
  });
export type DemandKpis = z.infer<typeof DemandKpisSchema>;

export const DemandPageSchema = createPageEnvelopeSchema(
  DemandRequestSummarySchema,
);
export type DemandPage = z.infer<typeof DemandPageSchema>;

/** One GET result keeps prototype KPIs and its paginated ledger consistent. */
export const DemandListResultSchema = z
  .object({
    page: DemandPageSchema,
    kpis: DemandKpisSchema,
  })
  .strict();
export type DemandListResult = z.infer<typeof DemandListResultSchema>;

// =============================================================================
// Follow-up history and request detail
// =============================================================================

export const AppendDemandFollowUpInputSchema = z
  .object({
    occurredAt: z.iso.datetime(),
    channel: z.enum(DEMAND_CHANNELS),
    result: z.enum(DEMAND_FOLLOW_UP_RESULTS),
    note: requiredText(
      "a follow-up note",
      DEMAND_CONTRACT_LIMITS.FOLLOW_UP_NOTE_LENGTH,
    ),
    nextFollowUpOn: z.iso.date().nullable(),
  })
  .strict();
export type AppendDemandFollowUpInput = z.input<
  typeof AppendDemandFollowUpInputSchema
>;
export type AppendDemandFollowUpData = z.output<
  typeof AppendDemandFollowUpInputSchema
>;

export const DemandActorReferenceSchema = z
  .object({
    id: z.uuid(),
    displayName: responseText(DEMAND_CONTRACT_LIMITS.CUSTOMER_NAME_LENGTH),
  })
  .strict();
export type DemandActorReference = z.infer<typeof DemandActorReferenceSchema>;

export const DemandFollowUpSchema = z
  .object({
    id: z.uuid(),
    demandRequestId: z.uuid(),
    occurredAt: responseTimestampSchema,
    channel: z.enum(DEMAND_CHANNELS),
    result: z.enum(DEMAND_FOLLOW_UP_RESULTS),
    note: responseText(DEMAND_CONTRACT_LIMITS.FOLLOW_UP_NOTE_LENGTH),
    nextFollowUpOn: responseBusinessDateSchema.nullable(),
    createdBy: DemandActorReferenceSchema,
    createdAt: responseTimestampSchema,
  })
  .strict();
export type DemandFollowUp = z.infer<typeof DemandFollowUpSchema>;

export const AppendDemandFollowUpResultSchema = z
  .object({
    followUp: DemandFollowUpSchema,
    requestVersion: positiveVersionSchema,
    nextFollowUpOn: responseBusinessDateSchema.nullable(),
  })
  .strict();
export type AppendDemandFollowUpResult = z.infer<
  typeof AppendDemandFollowUpResultSchema
>;

export const DemandSaleConversionReferenceSchema = z
  .object({
    target: z.literal("sale"),
    targetId: z.uuid(),
    convertedAt: responseTimestampSchema,
  })
  .strict();
export type DemandSaleConversionReference = z.infer<
  typeof DemandSaleConversionReferenceSchema
>;

export const DemandRequestDetailSchema = z
  .object({
    ...demandRequestSummaryShape,
    item: DemandRequestItemSchema,
    availabilitySnapshot: DemandAvailabilitySnapshotSchema,
    tradeInInterest: z.boolean(),
    note: responseNullableText(LIMITS.MAX_NOTE_LENGTH),
    lostSaleReason: responseNullableText(
      DEMAND_CONTRACT_LIMITS.LOST_SALE_REASON_LENGTH,
    ),
    dedupeGroupId: z.uuid().nullable(),
    followUps: z.array(DemandFollowUpSchema),
    conversion: DemandSaleConversionReferenceSchema.nullable(),
  })
  .strict()
  .superRefine((detail, context) => {
    if (detail.availabilityState !== detail.availabilitySnapshot.state) {
      context.addIssue({
        code: "custom",
        message: "availabilityState must match the capture snapshot.",
        path: ["availabilityState"],
      });
    }
    if (detail.status === "converted_to_sale" && detail.conversion === null) {
      context.addIssue({
        code: "custom",
        message: "A converted request must reference its sale.",
        path: ["conversion"],
      });
    }
    if (detail.status !== "converted_to_sale" && detail.conversion !== null) {
      context.addIssue({
        code: "custom",
        message: "Only a converted request may reference a sale.",
        path: ["conversion"],
      });
    }
  });
export type DemandRequestDetail = z.infer<typeof DemandRequestDetailSchema>;

// =============================================================================
// Versioned status transition and supported conversion
// =============================================================================

/** `converted_to_sale` belongs exclusively to the atomic conversion endpoint. */
export const DEMAND_MANUAL_STATUS_TARGETS = [
  "new",
  "contacted",
  "sourcing",
  "available",
  "customer_notified",
  "not_interested",
  "closed",
] as const;
export type DemandManualStatusTarget =
  (typeof DEMAND_MANUAL_STATUS_TARGETS)[number];

export const TransitionDemandStatusInputSchema = z
  .object({
    status: z.enum(DEMAND_MANUAL_STATUS_TARGETS),
    outcome: z.enum(DEMAND_OUTCOMES),
    lostSaleReason: nullableText(
      "Lost-sale reason",
      DEMAND_CONTRACT_LIMITS.LOST_SALE_REASON_LENGTH,
    ),
    version: positiveVersionSchema,
  })
  .strict();
export type TransitionDemandStatusInput = z.input<
  typeof TransitionDemandStatusInputSchema
>;
export type TransitionDemandStatusData = z.output<
  typeof TransitionDemandStatusInputSchema
>;

export const DemandStatusTransitionResultSchema = z
  .object({
    demandRequestId: z.uuid(),
    status: z.enum(DEMAND_MANUAL_STATUS_TARGETS),
    outcome: z.enum(DEMAND_OUTCOMES),
    lostSaleReason: responseNullableText(
      DEMAND_CONTRACT_LIMITS.LOST_SALE_REASON_LENGTH,
    ),
    version: positiveVersionSchema,
    updatedAt: responseTimestampSchema,
  })
  .strict();
export type DemandStatusTransitionResult = z.infer<
  typeof DemandStatusTransitionResultSchema
>;

/** Links a request to an already-posted, same-scope sale. */
export const ConvertDemandRequestInputSchema = z
  .object({
    target: z.literal("sale"),
    saleId: z.uuid(),
    version: positiveVersionSchema,
  })
  .strict();
export type ConvertDemandRequestInput = z.input<
  typeof ConvertDemandRequestInputSchema
>;
export type ConvertDemandRequestData = z.output<
  typeof ConvertDemandRequestInputSchema
>;

export const DemandConversionResultSchema = z
  .object({
    demandRequestId: z.uuid(),
    target: z.literal("sale"),
    targetId: z.uuid(),
    status: z.literal("converted_to_sale"),
    outcome: z.literal("sold_immediately"),
    convertedAt: responseTimestampSchema,
    version: positiveVersionSchema,
  })
  .strict();
export type DemandConversionResult = z.infer<
  typeof DemandConversionResultSchema
>;
