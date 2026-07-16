import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import {
  RETURN_OUTCOMES,
  RETURN_STATUSES,
  SALE_STATUSES,
} from "./enums";
import { DeviceIdentifierSchema } from "./inventory";
import { PosStockLocationSchema } from "./pricing";

/**
 * Returns/refunds contracts.
 *
 * A request selects immutable evidence from the original sale. Prices, COGS,
 * cumulative returned quantities, policy eligibility and settlement amounts
 * are always recalculated by the backend while the sale is locked.
 */
export const RETURN_CONTRACT_LIMITS = Object.freeze({
  REASON_LENGTH: LIMITS.MAX_REASON_LENGTH,
  EVIDENCE_LENGTH: 1_000,
  REFERENCE_LENGTH: 200,
  INVOICE_LENGTH: 100,
  RETURN_NUMBER_LENGTH: 100,
  NAME_LENGTH: 240,
  IDENTIFIER_LENGTH: 64,
  MAX_LINES: 100,
  MAX_QUANTITY_PER_LINE: 100_000,
});

export const RETURN_ITEM_CONDITIONS = [
  "like_new",
  "new",
  "used",
  "faulty",
  "damaged",
] as const;
export type ReturnItemCondition = (typeof RETURN_ITEM_CONDITIONS)[number];

/** Credit is resolved by the server against the receivable, never a refund rail. */
export const RETURN_REFUND_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "digital_wallet",
] as const;
export type ReturnRefundMethod = (typeof RETURN_REFUND_METHODS)[number];

export const RETURN_ELIGIBILITY_STATES = [
  "eligible",
  "window_expired",
  "fully_returned",
  "sale_not_returnable",
] as const;
export type ReturnEligibilityState =
  (typeof RETURN_ELIGIBILITY_STATES)[number];

export const RETURN_SORT_FIELDS = ["created_at", "posted_at", "total"] as const;
export const RETURN_SORT_DIRECTIONS = ["asc", "desc"] as const;

export const RETURN_EXCHANGE_UNAVAILABLE_REASON =
  "atomic_sales_posting_boundary_unavailable" as const;

export const RETURN_EXCHANGE_CAPABILITY = Object.freeze({
  available: false as const,
  reason: RETURN_EXCHANGE_UNAVAILABLE_REASON,
});

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeInvoice(value: string): string {
  return normalizeDisplayText(value).toUpperCase();
}

const requiredText = (maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().min(1).max(maximum));
const nullableText = (maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().min(1).max(maximum))
    .nullable();
const responseMoneySchema = z.number().int().safe().nonnegative();
const signedResponseMoneySchema = z.number().int().safe();
const responseVersionSchema = z.number().int().positive();
const responseTimestampSchema = z.iso.datetime();

// =============================================================================
// Inputs
// =============================================================================

export const ReturnEligibilityQuerySchema = z
  .object({
    saleId: z.uuid().optional(),
    invoiceNumber: z
      .string()
      .transform(normalizeInvoice)
      .pipe(z.string().min(1).max(RETURN_CONTRACT_LIMITS.INVOICE_LENGTH))
      .optional(),
    saleLineId: z.uuid().optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.saleId === undefined) === (query.invoiceNumber === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide exactly one of saleId or invoiceNumber.",
        path: ["saleId"],
      });
    }
  });
export type ReturnEligibilityQueryInput = z.input<
  typeof ReturnEligibilityQuerySchema
>;
export type ReturnEligibilityQuery = z.output<
  typeof ReturnEligibilityQuerySchema
>;

export const SerializedReturnDraftLineInputSchema = z
  .object({
    trackingType: z.literal("serialized"),
    saleLineId: z.uuid(),
    serializedUnitId: z.uuid(),
    identifier: z
      .string()
      .transform((value) => normalizeDisplayText(value).toUpperCase())
      .pipe(
        z
          .string()
          .min(1)
          .max(RETURN_CONTRACT_LIMITS.IDENTIFIER_LENGTH)
          .regex(/^[A-Z0-9]+$/u, "Use the normalized IMEI or serial."),
      ),
    quantity: z.literal(1).default(1),
    condition: z.enum(RETURN_ITEM_CONDITIONS),
  })
  .strict();
export type SerializedReturnDraftLineInput = z.input<
  typeof SerializedReturnDraftLineInputSchema
>;
export type SerializedReturnDraftLineData = z.output<
  typeof SerializedReturnDraftLineInputSchema
>;

export const QuantityReturnDraftLineInputSchema = z
  .object({
    trackingType: z.literal("quantity"),
    saleLineId: z.uuid(),
    quantity: z
      .number()
      .int()
      .positive()
      .max(RETURN_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE),
    condition: z.enum(RETURN_ITEM_CONDITIONS),
  })
  .strict();
export type QuantityReturnDraftLineInput = z.input<
  typeof QuantityReturnDraftLineInputSchema
>;
export type QuantityReturnDraftLineData = z.output<
  typeof QuantityReturnDraftLineInputSchema
>;

export const ReturnDraftLineInputSchema = z.discriminatedUnion("trackingType", [
  SerializedReturnDraftLineInputSchema,
  QuantityReturnDraftLineInputSchema,
]);
export type ReturnDraftLineInput = z.input<typeof ReturnDraftLineInputSchema>;
export type ReturnDraftLineData = z.output<typeof ReturnDraftLineInputSchema>;

export const CreateReturnDraftInputSchema = z
  .object({
    saleId: z.uuid(),
    reason: requiredText(RETURN_CONTRACT_LIMITS.REASON_LENGTH),
    evidenceNote: requiredText(RETURN_CONTRACT_LIMITS.EVIDENCE_LENGTH),
    lines: z
      .array(ReturnDraftLineInputSchema)
      .min(1, "Select at least one original sale line.")
      .max(RETURN_CONTRACT_LIMITS.MAX_LINES),
  })
  .strict()
  .superRefine((draft, context) => {
    const saleLines = new Map<string, number>();
    const serializedUnits = new Map<string, number>();
    draft.lines.forEach((line, index) => {
      const firstLine = saleLines.get(line.saleLineId);
      if (firstLine !== undefined) {
        context.addIssue({
          code: "custom",
          message: `This original sale line duplicates line ${firstLine + 1}.`,
          path: ["lines", index, "saleLineId"],
        });
      }
      saleLines.set(line.saleLineId, index);
      if (line.trackingType === "serialized") {
        const firstUnit = serializedUnits.get(line.serializedUnitId);
        if (firstUnit !== undefined) {
          context.addIssue({
            code: "custom",
            message: `This serialized unit duplicates line ${firstUnit + 1}.`,
            path: ["lines", index, "serializedUnitId"],
          });
        }
        serializedUnits.set(line.serializedUnitId, index);
      }
    });
  });
export type CreateReturnDraftInput = z.input<
  typeof CreateReturnDraftInputSchema
>;
export type CreateReturnDraftData = z.output<
  typeof CreateReturnDraftInputSchema
>;

export const ReturnRefundInstructionInputSchema = z
  .object({
    method: z.enum(RETURN_REFUND_METHODS),
    reference: nullableText(RETURN_CONTRACT_LIMITS.REFERENCE_LENGTH).default(
      null,
    ),
  })
  .strict()
  .superRefine((refund, context) => {
    const requiresReference = refund.method !== "cash";
    if (requiresReference !== (refund.reference !== null)) {
      context.addIssue({
        code: "custom",
        message: requiresReference
          ? "Enter the provider or transfer reference."
          : "A cash refund cannot carry a provider reference.",
        path: ["reference"],
      });
    }
  });
export type ReturnRefundInstructionInput = z.input<
  typeof ReturnRefundInstructionInputSchema
>;
export type ReturnRefundInstructionData = z.output<
  typeof ReturnRefundInstructionInputSchema
>;

export const PostReturnInputSchema = z
  .object({
    version: z.number().int().positive(),
    refund: ReturnRefundInstructionInputSchema.nullable().default(null),
    policyOverrideReason: nullableText(
      RETURN_CONTRACT_LIMITS.REASON_LENGTH,
    ).default(null),
  })
  .strict();
export type PostReturnInput = z.input<typeof PostReturnInputSchema>;
export type PostReturnData = z.output<typeof PostReturnInputSchema>;

/** The endpoint is intentionally stable even while safe exchange posting is unavailable. */
export const ExchangeReturnInputSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export type ExchangeReturnInput = z.input<typeof ExchangeReturnInputSchema>;
export type ExchangeReturnData = z.output<typeof ExchangeReturnInputSchema>;

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
const optionalSearchSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = normalizeDisplayText(value);
  return normalized.length === 0 ? undefined : normalized;
}, z.string().max(LIMITS.MAX_SEARCH_TERM_LENGTH).optional());

export const ReturnListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchSchema,
    status: z.enum(RETURN_STATUSES).optional(),
    saleId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sort: z.enum(RETURN_SORT_FIELDS).default("created_at"),
    direction: z.enum(RETURN_SORT_DIRECTIONS).default("desc"),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
      context.addIssue({
        code: "custom",
        message: "The start date must not be after the end date.",
        path: ["from"],
      });
    }
  });
export type ReturnListQueryInput = z.input<typeof ReturnListQuerySchema>;
export type ReturnListQuery = z.output<typeof ReturnListQuerySchema>;

// =============================================================================
// Responses and structural redaction
// =============================================================================

const availableContactSchema = z
  .object({
    availability: z.literal("available"),
    phone: z.string().min(1).max(20).nullable(),
  })
  .strict();
const redactedContactSchema = z
  .object({ availability: z.literal("redacted") })
  .strict();
export const ReturnCustomerContactSchema = z.discriminatedUnion(
  "availability",
  [availableContactSchema, redactedContactSchema],
);
export type ReturnCustomerContact = z.infer<
  typeof ReturnCustomerContactSchema
>;

const availableReturnProfitSchema = z
  .object({
    availability: z.literal("available"),
    cogsReversalMinor: responseMoneySchema,
    grossProfitReversalMinor: signedResponseMoneySchema,
  })
  .strict();
const redactedReturnProfitSchema = z
  .object({ availability: z.literal("redacted") })
  .strict();
export const ReturnProfitSchema = z.discriminatedUnion("availability", [
  availableReturnProfitSchema,
  redactedReturnProfitSchema,
]);
export type ReturnProfit = z.infer<typeof ReturnProfitSchema>;

export const ReturnExchangeCapabilitySchema = z
  .object({
    available: z.literal(false),
    reason: z.literal(RETURN_EXCHANGE_UNAVAILABLE_REASON),
  })
  .strict();
export type ReturnExchangeCapability = z.infer<
  typeof ReturnExchangeCapabilitySchema
>;

export const ReturnCustomerReferenceSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(200),
    contact: ReturnCustomerContactSchema,
  })
  .strict();
export type ReturnCustomerReference = z.infer<
  typeof ReturnCustomerReferenceSchema
>;

export const ReturnSaleReferenceSchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z.string().min(1).max(RETURN_CONTRACT_LIMITS.INVOICE_LENGTH),
    status: z.enum(SALE_STATUSES),
    postedAt: responseTimestampSchema,
    returnWindowDays: z.number().int().nonnegative(),
    returnDeadline: responseTimestampSchema,
    customer: ReturnCustomerReferenceSchema.nullable(),
  })
  .strict();
export type ReturnSaleReference = z.infer<typeof ReturnSaleReferenceSchema>;

export const ReturnPolicySchema = z
  .object({
    windowDaysSnapshot: z.number().int().nonnegative(),
    deadline: responseTimestampSchema,
    checkedAt: responseTimestampSchema,
    expired: z.boolean(),
    overridden: z.boolean(),
    overrideReason: z
      .string()
      .min(1)
      .max(RETURN_CONTRACT_LIMITS.REASON_LENGTH)
      .nullable(),
    overriddenBy: z
      .object({ id: z.uuid(), fullName: z.string().min(1).max(200) })
      .strict()
      .nullable(),
    overriddenAt: responseTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((policy, context) => {
    const hasEvidence =
      policy.overrideReason !== null &&
      policy.overriddenBy !== null &&
      policy.overriddenAt !== null;
    if (policy.overridden !== hasEvidence) {
      context.addIssue({
        code: "custom",
        message: "Policy override evidence must be complete and consistent.",
        path: ["overridden"],
      });
    }
  });
export type ReturnPolicy = z.infer<typeof ReturnPolicySchema>;

const returnEligibilityLineShape = {
  saleLineId: z.uuid(),
  product: z
    .object({
      id: z.uuid(),
      sku: z.string().min(1).max(100),
      name: z.string().min(1).max(RETURN_CONTRACT_LIMITS.NAME_LENGTH),
    })
    .strict(),
  location: PosStockLocationSchema,
  soldQuantity: z.number().int().positive(),
  returnedQuantity: z.number().int().nonnegative(),
  remainingQuantity: z.number().int().nonnegative(),
  refundableMinor: responseMoneySchema,
  profit: ReturnProfitSchema,
};

export const SerializedReturnEligibilityLineSchema = z
  .object({
    ...returnEligibilityLineShape,
    trackingType: z.literal("serialized"),
    soldQuantity: z.literal(1),
    returnedQuantity: z.union([z.literal(0), z.literal(1)]),
    remainingQuantity: z.union([z.literal(0), z.literal(1)]),
    serializedUnit: z
      .object({
        id: z.uuid(),
        identifiers: z.array(DeviceIdentifierSchema).min(1).max(4),
      })
      .strict(),
  })
  .strict();

export const QuantityReturnEligibilityLineSchema = z
  .object({
    ...returnEligibilityLineShape,
    trackingType: z.literal("quantity"),
  })
  .strict();

export const ReturnEligibilityLineSchema = z.discriminatedUnion(
  "trackingType",
  [SerializedReturnEligibilityLineSchema, QuantityReturnEligibilityLineSchema],
);
export type ReturnEligibilityLine = z.infer<
  typeof ReturnEligibilityLineSchema
>;

export const ReturnEligibilitySchema = z
  .object({
    state: z.enum(RETURN_ELIGIBILITY_STATES),
    eligible: z.boolean(),
    requiresOverride: z.boolean(),
    sale: ReturnSaleReferenceSchema,
    policy: ReturnPolicySchema,
    lines: z.array(ReturnEligibilityLineSchema).max(RETURN_CONTRACT_LIMITS.MAX_LINES),
    exchange: ReturnExchangeCapabilitySchema,
  })
  .strict()
  .superRefine((eligibility, context) => {
    if (eligibility.eligible !== (eligibility.state === "eligible")) {
      context.addIssue({
        code: "custom",
        message: "Eligibility state and eligible flag disagree.",
        path: ["eligible"],
      });
    }
    if (
      eligibility.requiresOverride !==
      (eligibility.state === "window_expired")
    ) {
      context.addIssue({
        code: "custom",
        message: "Only an expired return window requires an override.",
        path: ["requiresOverride"],
      });
    }
  });
export type ReturnEligibility = z.infer<typeof ReturnEligibilitySchema>;

const returnLineShape = {
  id: z.uuid(),
  saleLineId: z.uuid(),
  product: z
    .object({
      id: z.uuid(),
      sku: z.string().min(1).max(100),
      name: z.string().min(1).max(RETURN_CONTRACT_LIMITS.NAME_LENGTH),
    })
    .strict(),
  location: PosStockLocationSchema,
  quantity: z
    .number()
    .int()
    .positive()
    .max(RETURN_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE),
  refundMinor: responseMoneySchema,
  condition: z.enum(RETURN_ITEM_CONDITIONS),
  outcome: z.enum(RETURN_OUTCOMES).nullable(),
  profit: ReturnProfitSchema,
};

export const SerializedReturnLineSchema = z
  .object({
    ...returnLineShape,
    trackingType: z.literal("serialized"),
    quantity: z.literal(1),
    serializedUnit: z
      .object({
        id: z.uuid(),
        identifiers: z.array(DeviceIdentifierSchema).min(1).max(4),
      })
      .strict(),
  })
  .strict();
export const QuantityReturnLineSchema = z
  .object({ ...returnLineShape, trackingType: z.literal("quantity") })
  .strict();
export const ReturnLineSchema = z.discriminatedUnion("trackingType", [
  SerializedReturnLineSchema,
  QuantityReturnLineSchema,
]);
export type ReturnLine = z.infer<typeof ReturnLineSchema>;

export const ReturnRefundSchema = z
  .object({
    id: z.uuid(),
    refundNumber: z.string().min(1).max(RETURN_CONTRACT_LIMITS.RETURN_NUMBER_LENGTH),
    method: z.enum(RETURN_REFUND_METHODS),
    amountMinor: responseMoneySchema.positive(),
    reference: z
      .string()
      .min(1)
      .max(RETURN_CONTRACT_LIMITS.REFERENCE_LENGTH)
      .nullable(),
    refundedAt: responseTimestampSchema,
  })
  .strict();
export type ReturnRefund = z.infer<typeof ReturnRefundSchema>;

export const ReturnTotalsSchema = z
  .object({
    refundMinor: responseMoneySchema,
    receivableCreditMinor: responseMoneySchema,
    refundedMinor: responseMoneySchema,
    profit: ReturnProfitSchema,
  })
  .strict()
  .superRefine((totals, context) => {
    if (
      totals.refundMinor !==
      totals.receivableCreditMinor + totals.refundedMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Return settlement does not reconcile.",
        path: ["refundMinor"],
      });
    }
  });
export type ReturnTotals = z.infer<typeof ReturnTotalsSchema>;

export const ReturnSummarySchema = z
  .object({
    id: z.uuid(),
    returnNumber: z
      .string()
      .min(1)
      .max(RETURN_CONTRACT_LIMITS.RETURN_NUMBER_LENGTH)
      .nullable(),
    status: z.enum(RETURN_STATUSES),
    sale: ReturnSaleReferenceSchema,
    reason: z.string().min(1).max(RETURN_CONTRACT_LIMITS.REASON_LENGTH),
    lineCount: z.number().int().positive().max(RETURN_CONTRACT_LIMITS.MAX_LINES),
    unitCount: z.number().int().positive(),
    totalRefundMinor: responseMoneySchema,
    policyExpired: z.boolean(),
    postedAt: responseTimestampSchema.nullable(),
    createdAt: responseTimestampSchema,
    version: responseVersionSchema,
  })
  .strict();
export type ReturnSummary = z.infer<typeof ReturnSummarySchema>;

export const ReturnDetailSchema = z
  .object({
    id: z.uuid(),
    returnNumber: z
      .string()
      .min(1)
      .max(RETURN_CONTRACT_LIMITS.RETURN_NUMBER_LENGTH)
      .nullable(),
    status: z.enum(RETURN_STATUSES),
    sale: ReturnSaleReferenceSchema,
    reason: z.string().min(1).max(RETURN_CONTRACT_LIMITS.REASON_LENGTH),
    evidenceNote: z.string().min(1).max(RETURN_CONTRACT_LIMITS.EVIDENCE_LENGTH),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    lines: z.array(ReturnLineSchema).min(1).max(RETURN_CONTRACT_LIMITS.MAX_LINES),
    totals: ReturnTotalsSchema,
    refund: ReturnRefundSchema.nullable(),
    policy: ReturnPolicySchema,
    approvedBy: z
      .object({ id: z.uuid(), fullName: z.string().min(1).max(200) })
      .strict()
      .nullable(),
    exchange: ReturnExchangeCapabilitySchema,
    version: responseVersionSchema,
    createdAt: responseTimestampSchema,
    updatedAt: responseTimestampSchema,
    postedAt: responseTimestampSchema.nullable(),
  })
  .strict();
export type ReturnDetail = z.infer<typeof ReturnDetailSchema>;

export const PostReturnResponseSchema = z
  .object({
    return: ReturnDetailSchema,
    idempotencyReplay: z.boolean(),
  })
  .strict();
export type PostReturnResponse = z.infer<typeof PostReturnResponseSchema>;

export const ReturnPageSchema = createPageEnvelopeSchema(ReturnSummarySchema);
export type ReturnPage = z.infer<typeof ReturnPageSchema>;

