import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import { CustomerSummarySchema } from "./customers";
import { PAYMENT_METHODS, SALE_STATUSES } from "./enums";
import { DeviceIdentifierSchema } from "./inventory";
import {
  EFFECTIVE_PRICE_SOURCES,
  PosStockLocationSchema,
} from "./pricing";

/**
 * Sales contracts for the immutable counter workflow.
 *
 * Request bodies name selected records and optimistic versions only. Tenant,
 * branch, actor, invoice number, authoritative prices/totals, COGS and profit
 * never cross the input boundary. Every amount is an exact safe integer number
 * of minor currency units; posting still recalculates and locks everything on
 * the server.
 */
export const SALE_CONTRACT_LIMITS = Object.freeze({
  NOTE_LENGTH: 500,
  REASON_LENGTH: LIMITS.MAX_REASON_LENGTH,
  REFERENCE_LENGTH: 120,
  INVOICE_LENGTH: 100,
  NAME_LENGTH: 240,
  MAX_LINES: 100,
  MAX_PAYMENT_LEGS: 10,
  MAX_QUANTITY_PER_LINE: 100_000,
  MAX_WARNINGS: 100,
});

export const SALE_CLOSED_STATUSES = ["cancelled", "returned"] as const;
export type SaleClosedStatus = (typeof SALE_CLOSED_STATUSES)[number];

export const SALE_STATUS_TRANSITIONS: Readonly<
  Record<(typeof SALE_STATUSES)[number], readonly (typeof SALE_STATUSES)[number][]>
> = Object.freeze({
  draft: ["posted", "cancelled"],
  posted: ["partially_returned", "returned"],
  cancelled: [],
  partially_returned: ["returned"],
  returned: [],
});

export function isSaleTransitionAllowed(
  from: (typeof SALE_STATUSES)[number],
  to: (typeof SALE_STATUSES)[number],
): boolean {
  return SALE_STATUS_TRANSITIONS[from].includes(to);
}

export function isSaleClosedStatus(
  status: (typeof SALE_STATUSES)[number],
): status is SaleClosedStatus {
  return (SALE_CLOSED_STATUSES as readonly string[]).includes(status);
}

export const SALE_RECEIPT_FORMATS = ["thermal", "a4"] as const;
export type SaleReceiptFormat = (typeof SALE_RECEIPT_FORMATS)[number];

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

const nullableInputText = (maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().min(1).max(maximum))
    .nullable();
const requiredInputText = (maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().min(1).max(maximum));

/** Input money may be proposed (discount/payment), never accepted as a total. */
export const SaleNonnegativeMoneyInputSchema = z
  .number()
  .int("Amount must be an integer number of minor units.")
  .safe("Amount is outside the safe integer range.")
  .nonnegative();
export const SalePositiveMoneyInputSchema = SaleNonnegativeMoneyInputSchema.positive();

const versionInputSchema = z
  .number()
  .int()
  .positive("Provide the record version you are acting on.");
const quantityInputSchema = z
  .number()
  .int()
  .positive()
  .max(SALE_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE);

const linePriceProposalShape = {
  productVariantId: z.uuid(),
  priceSource: z.enum(EFFECTIVE_PRICE_SOURCES),
  priceSourceId: z.uuid().nullable(),
  priceVersion: versionInputSchema,
};

function refinePriceSource(
  line: {
    readonly priceSource: (typeof EFFECTIVE_PRICE_SOURCES)[number];
    readonly priceSourceId: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (line.priceSource === "price_rule" && line.priceSourceId === null) {
    context.addIssue({
      code: "custom",
      message: "A rule-derived price must identify its source rule.",
      path: ["priceSourceId"],
    });
  }
  if (line.priceSource === "variant_default" && line.priceSourceId !== null) {
    context.addIssue({
      code: "custom",
      message: "A variant default price cannot name a price rule.",
      path: ["priceSourceId"],
    });
  }
}

/** Exactly one physical unit, current unit version and current location. */
export const SerializedSaleDraftLineInputSchema = z
  .object({
    ...linePriceProposalShape,
    trackingType: z.literal("serialized"),
    serializedUnitId: z.uuid(),
    serializedUnitVersion: versionInputSchema,
    locationId: z.uuid(),
  })
  .strict()
  .superRefine(refinePriceSource);
export type SerializedSaleDraftLineInput = z.input<
  typeof SerializedSaleDraftLineInputSchema
>;
export type SerializedSaleDraftLineData = z.output<
  typeof SerializedSaleDraftLineInputSchema
>;

/** Quantity stock is always tied to one location and one stock-batch version. */
export const QuantitySaleDraftLineInputSchema = z
  .object({
    ...linePriceProposalShape,
    trackingType: z.literal("quantity"),
    locationId: z.uuid(),
    quantity: quantityInputSchema,
    stockVersion: versionInputSchema,
  })
  .strict()
  .superRefine(refinePriceSource);
export type QuantitySaleDraftLineInput = z.input<
  typeof QuantitySaleDraftLineInputSchema
>;
export type QuantitySaleDraftLineData = z.output<
  typeof QuantitySaleDraftLineInputSchema
>;

export const SaleDraftLineInputSchema = z.discriminatedUnion("trackingType", [
  SerializedSaleDraftLineInputSchema,
  QuantitySaleDraftLineInputSchema,
]);
export type SaleDraftLineInput = z.input<typeof SaleDraftLineInputSchema>;
export type SaleDraftLineData = z.output<typeof SaleDraftLineInputSchema>;

interface DraftLinesShape {
  readonly lines: readonly SaleDraftLineData[];
  readonly requestedDiscountMinor: number;
  readonly discountReason: string | null;
}

function refineDraftLines(
  sale: DraftLinesShape,
  context: z.RefinementCtx,
): void {
  if (sale.requestedDiscountMinor > 0 && sale.discountReason === null) {
    context.addIssue({
      code: "custom",
      message: "Enter a reason for the requested sale discount.",
      path: ["discountReason"],
    });
  }
  const serializedUnits = new Map<string, number>();
  const quantitySelections = new Map<string, number>();
  sale.lines.forEach((line, index) => {
    if (line.trackingType === "serialized") {
      const first = serializedUnits.get(line.serializedUnitId);
      if (first !== undefined) {
        context.addIssue({
          code: "custom",
          message: `This serialized unit duplicates line ${first + 1}.`,
          path: ["lines", index, "serializedUnitId"],
        });
      }
      serializedUnits.set(line.serializedUnitId, index);
      return;
    }
    const key = `${line.productVariantId}:${line.locationId}`;
    const first = quantitySelections.get(key);
    if (first !== undefined) {
      context.addIssue({
        code: "custom",
        message: `This product and location duplicate line ${first + 1}.`,
        path: ["lines", index, "locationId"],
      });
    }
    quantitySelections.set(key, index);
  });
}

const saleDraftShape = {
  /** Null explicitly means an anonymous walk-in sale. */
  customerId: z.uuid().nullable(),
  note: nullableInputText(SALE_CONTRACT_LIMITS.NOTE_LENGTH).default(null),
  requestedDiscountMinor: SaleNonnegativeMoneyInputSchema.default(0),
  discountReason: nullableInputText(SALE_CONTRACT_LIMITS.REASON_LENGTH).default(
    null,
  ),
  lines: z
    .array(SaleDraftLineInputSchema)
    .min(1, "Add at least one sale line.")
    .max(SALE_CONTRACT_LIMITS.MAX_LINES),
};

export const CreateSaleDraftInputSchema = z
  .object(saleDraftShape)
  .strict()
  .superRefine(refineDraftLines);
export type CreateSaleDraftInput = z.input<typeof CreateSaleDraftInputSchema>;
export type CreateSaleDraftData = z.output<typeof CreateSaleDraftInputSchema>;

export const ReplaceSaleDraftInputSchema = z
  .object({ ...saleDraftShape, version: versionInputSchema })
  .strict()
  .superRefine(refineDraftLines);
export type ReplaceSaleDraftInput = z.input<
  typeof ReplaceSaleDraftInputSchema
>;
export type ReplaceSaleDraftData = z.output<
  typeof ReplaceSaleDraftInputSchema
>;

export const SaleVersionInputSchema = z
  .object({ version: versionInputSchema })
  .strict();
export type SaleVersionInput = z.input<typeof SaleVersionInputSchema>;
export type SaleVersionData = z.output<typeof SaleVersionInputSchema>;

export const HoldSaleInputSchema = z
  .object({
    version: versionInputSchema,
    note: nullableInputText(SALE_CONTRACT_LIMITS.NOTE_LENGTH).default(null),
  })
  .strict();
export type HoldSaleInput = z.input<typeof HoldSaleInputSchema>;
export type HoldSaleData = z.output<typeof HoldSaleInputSchema>;

export const CancelSaleInputSchema = z
  .object({
    version: versionInputSchema,
    reason: requiredInputText(SALE_CONTRACT_LIMITS.REASON_LENGTH),
  })
  .strict();
export type CancelSaleInput = z.input<typeof CancelSaleInputSchema>;
export type CancelSaleData = z.output<typeof CancelSaleInputSchema>;

export const SaleReviewInputSchema = SaleVersionInputSchema;
export type SaleReviewInput = SaleVersionInput;
export type SaleReviewData = SaleVersionData;

// =============================================================================
// Posting and payment legs
// =============================================================================

export const SalePaymentLegInputSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amountMinor: SalePositiveMoneyInputSchema,
    reference: nullableInputText(SALE_CONTRACT_LIMITS.REFERENCE_LENGTH).default(
      null,
    ),
  })
  .strict()
  .superRefine((payment, context) => {
    const needsReference = [
      "bank_transfer",
      "card",
      "digital_wallet",
    ].includes(payment.method);
    if (needsReference && payment.reference === null) {
      context.addIssue({
        code: "custom",
        message: "Enter the provider or transfer reference.",
        path: ["reference"],
      });
    }
    if (!needsReference && payment.reference !== null) {
      context.addIssue({
        code: "custom",
        message: "Cash and credit legs cannot carry a provider reference.",
        path: ["reference"],
      });
    }
  });
export type SalePaymentLegInput = z.input<
  typeof SalePaymentLegInputSchema
>;
export type SalePaymentLegData = z.output<
  typeof SalePaymentLegInputSchema
>;

/**
 * The sum is bounded for exact arithmetic, but is deliberately not compared to
 * a client total because no total is accepted. Posting compares these legs to
 * the server-recomputed sale total inside the database transaction.
 */
export const PostSaleInputSchema = z
  .object({
    version: versionInputSchema,
    payments: z
      .array(SalePaymentLegInputSchema)
      .max(SALE_CONTRACT_LIMITS.MAX_PAYMENT_LEGS),
  })
  .strict()
  .superRefine((input, context) => {
    const total = input.payments.reduce(
      (sum, payment) => sum + BigInt(payment.amountMinor),
      0n,
    );
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
      context.addIssue({
        code: "custom",
        message: "Payment allocation is outside the exact money range.",
        path: ["payments"],
      });
    }
    if (
      input.payments.filter((payment) => payment.method === "credit").length >
      1
    ) {
      context.addIssue({
        code: "custom",
        message: "Use at most one credit allocation.",
        path: ["payments"],
      });
    }
  });
export type PostSaleInput = z.input<typeof PostSaleInputSchema>;
export type PostSaleData = z.output<typeof PostSaleInputSchema>;

// =============================================================================
// Server-computed response values
// =============================================================================

const nonnegativeResponseMoneySchema = z.number().int().safe().nonnegative();
const signedResponseMoneySchema = z.number().int().safe();
const responseVersionSchema = z.number().int().positive();
const responseTimestampSchema = z.iso.datetime();

const availableSaleProfitSchema = z
  .object({
    availability: z.literal("available"),
    cogsMinor: nonnegativeResponseMoneySchema,
    grossProfitMinor: signedResponseMoneySchema,
    grossMarginBasisPoints: z.number().int().safe().nullable(),
  })
  .strict();
const redactedSaleProfitSchema = z
  .object({ availability: z.literal("redacted") })
  .strict();

/** A redacted profit object structurally cannot carry cost or profit fields. */
export const SaleProfitSchema = z.discriminatedUnion("availability", [
  availableSaleProfitSchema,
  redactedSaleProfitSchema,
]);
export type SaleProfit = z.infer<typeof SaleProfitSchema>;

export const SaleProductSnapshotSchema = z
  .object({
    id: z.uuid(),
    sku: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Z0-9][A-Z0-9._/-]*$/),
    name: z.string().min(1).max(SALE_CONTRACT_LIMITS.NAME_LENGTH),
  })
  .strict();
export type SaleProductSnapshot = z.infer<
  typeof SaleProductSnapshotSchema
>;

const saleLineAmountShape = {
  id: z.uuid(),
  product: SaleProductSnapshotSchema,
  location: PosStockLocationSchema,
  priceVersion: responseVersionSchema,
  unitPriceMinor: nonnegativeResponseMoneySchema,
  lineSubtotalMinor: nonnegativeResponseMoneySchema,
  discountMinor: nonnegativeResponseMoneySchema,
  lineTotalMinor: nonnegativeResponseMoneySchema,
  discountReason: z
    .string()
    .min(1)
    .max(SALE_CONTRACT_LIMITS.REASON_LENGTH)
    .nullable(),
  profit: SaleProfitSchema,
};

interface SaleLineAmounts {
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly lineSubtotalMinor: number;
  readonly discountMinor: number;
  readonly lineTotalMinor: number;
  readonly discountReason: string | null;
  readonly profit: SaleProfit;
}

function refineSaleLineAmounts(
  line: SaleLineAmounts,
  context: z.RefinementCtx,
): void {
  const expectedSubtotal = BigInt(line.unitPriceMinor) * BigInt(line.quantity);
  if (expectedSubtotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    context.addIssue({
      code: "custom",
      message: "Line subtotal is outside the exact money range.",
      path: ["lineSubtotalMinor"],
    });
  } else if (BigInt(line.lineSubtotalMinor) !== expectedSubtotal) {
    context.addIssue({
      code: "custom",
      message: "Line subtotal does not equal unit price times quantity.",
      path: ["lineSubtotalMinor"],
    });
  }
  if (line.discountMinor > line.lineSubtotalMinor) {
    context.addIssue({
      code: "custom",
      message: "Line discount cannot exceed the line subtotal.",
      path: ["discountMinor"],
    });
  }
  if (line.lineTotalMinor !== line.lineSubtotalMinor - line.discountMinor) {
    context.addIssue({
      code: "custom",
      message: "Line total does not reconcile with subtotal and discount.",
      path: ["lineTotalMinor"],
    });
  }
  if (line.discountMinor > 0 && line.discountReason === null) {
    context.addIssue({
      code: "custom",
      message: "A discounted line must retain its reason.",
      path: ["discountReason"],
    });
  }
  if (
    line.profit.availability === "available" &&
    line.profit.grossProfitMinor !==
      line.lineTotalMinor - line.profit.cogsMinor
  ) {
    context.addIssue({
      code: "custom",
      message: "Line gross profit does not equal total less COGS.",
      path: ["profit", "grossProfitMinor"],
    });
  }
}

export const SerializedSaleLineSchema = z
  .object({
    ...saleLineAmountShape,
    trackingType: z.literal("serialized"),
    quantity: z.literal(1),
    serializedUnit: z
      .object({
        id: z.uuid(),
        identifiers: z.array(DeviceIdentifierSchema).min(1).max(4),
      })
      .strict(),
  })
  .strict()
  .superRefine(refineSaleLineAmounts);

export const QuantitySaleLineSchema = z
  .object({
    ...saleLineAmountShape,
    trackingType: z.literal("quantity"),
    quantity: z
      .number()
      .int()
      .positive()
      .max(SALE_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE),
  })
  .strict()
  .superRefine(refineSaleLineAmounts);

export const SaleLineSchema = z.discriminatedUnion("trackingType", [
  SerializedSaleLineSchema,
  QuantitySaleLineSchema,
]);
export type SaleLine = z.infer<typeof SaleLineSchema>;

export const SaleTotalsSchema = z
  .object({
    subtotalMinor: nonnegativeResponseMoneySchema,
    discountMinor: nonnegativeResponseMoneySchema,
    totalMinor: nonnegativeResponseMoneySchema,
  })
  .strict()
  .superRefine((totals, context) => {
    if (totals.discountMinor > totals.subtotalMinor) {
      context.addIssue({
        code: "custom",
        message: "Discount cannot exceed subtotal.",
        path: ["discountMinor"],
      });
    }
    if (totals.totalMinor !== totals.subtotalMinor - totals.discountMinor) {
      context.addIssue({
        code: "custom",
        message: "Sale total does not reconcile with subtotal and discount.",
        path: ["totalMinor"],
      });
    }
  });
export type SaleTotals = z.infer<typeof SaleTotalsSchema>;

export const SaleCustomerReferenceSchema = CustomerSummarySchema.pick({
  id: true,
  name: true,
  phone: true,
}).strict();
export type SaleCustomerReference = z.infer<
  typeof SaleCustomerReferenceSchema
>;

export const SaleUserReferenceSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string().min(1).max(200),
  })
  .strict();
export type SaleUserReference = z.infer<typeof SaleUserReferenceSchema>;

export const SalePaymentSchema = z
  .object({
    id: z.uuid(),
    method: z.enum(PAYMENT_METHODS),
    amountMinor: nonnegativeResponseMoneySchema.positive(),
    reference: z
      .string()
      .min(1)
      .max(SALE_CONTRACT_LIMITS.REFERENCE_LENGTH)
      .nullable(),
    recordedAt: responseTimestampSchema,
  })
  .strict()
  .superRefine((payment, context) => {
    const needsReference = [
      "bank_transfer",
      "card",
      "digital_wallet",
    ].includes(payment.method);
    if (needsReference !== (payment.reference !== null)) {
      context.addIssue({
        code: "custom",
        message: needsReference
          ? "This payment method requires its recorded reference."
          : "Cash and credit payments cannot carry a provider reference.",
        path: ["reference"],
      });
    }
  });
export type SalePayment = z.infer<typeof SalePaymentSchema>;

export const SaleSettlementSchema = z
  .object({
    payments: z.array(SalePaymentSchema).max(SALE_CONTRACT_LIMITS.MAX_PAYMENT_LEGS),
    paidMinor: nonnegativeResponseMoneySchema,
    receivableMinor: nonnegativeResponseMoneySchema,
  })
  .strict()
  .superRefine((settlement, context) => {
    const paid = settlement.payments
      .filter((payment) => payment.method !== "credit")
      .reduce((sum, payment) => sum + BigInt(payment.amountMinor), 0n);
    const receivable = settlement.payments
      .filter((payment) => payment.method === "credit")
      .reduce((sum, payment) => sum + BigInt(payment.amountMinor), 0n);
    if (paid !== BigInt(settlement.paidMinor)) {
      context.addIssue({
        code: "custom",
        message: "Paid amount does not match non-credit payment legs.",
        path: ["paidMinor"],
      });
    }
    if (receivable !== BigInt(settlement.receivableMinor)) {
      context.addIssue({
        code: "custom",
        message: "Receivable amount does not match the credit leg.",
        path: ["receivableMinor"],
      });
    }
  });
export type SaleSettlement = z.infer<typeof SaleSettlementSchema>;

interface SaleAggregateShape {
  readonly lines: readonly SaleLine[];
  readonly totals: SaleTotals;
  readonly profit: SaleProfit;
}

function refineSaleAggregate(
  sale: SaleAggregateShape,
  context: z.RefinementCtx,
): void {
  const subtotal = sale.lines.reduce(
    (sum, line) => sum + BigInt(line.lineSubtotalMinor),
    0n,
  );
  const discount = sale.lines.reduce(
    (sum, line) => sum + BigInt(line.discountMinor),
    0n,
  );
  const total = sale.lines.reduce(
    (sum, line) => sum + BigInt(line.lineTotalMinor),
    0n,
  );
  const aggregateEntries = [
    ["subtotalMinor", subtotal],
    ["discountMinor", discount],
    ["totalMinor", total],
  ] as const;
  for (const [field, calculated] of aggregateEntries) {
    if (calculated > BigInt(Number.MAX_SAFE_INTEGER)) {
      context.addIssue({
        code: "custom",
        message: "Sale aggregation is outside the exact money range.",
        path: ["totals", field],
      });
    } else if (BigInt(sale.totals[field]) !== calculated) {
      context.addIssue({
        code: "custom",
        message: `${field} does not match the sale lines.`,
        path: ["totals", field],
      });
    }
  }

  const availableLineProfits = sale.lines.filter(
    (line) => line.profit.availability === "available",
  );
  if (sale.profit.availability === "redacted") {
    if (availableLineProfits.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A redacted sale cannot expose line profit.",
        path: ["profit"],
      });
    }
    return;
  }
  if (availableLineProfits.length !== sale.lines.length) {
    context.addIssue({
      code: "custom",
      message: "Available sale profit requires available profit on every line.",
      path: ["profit"],
    });
    return;
  }
  const cogs = availableLineProfits.reduce(
    (sum, line) =>
      sum +
      BigInt(
        line.profit.availability === "available" ? line.profit.cogsMinor : 0,
      ),
    0n,
  );
  if (cogs !== BigInt(sale.profit.cogsMinor)) {
    context.addIssue({
      code: "custom",
      message: "Sale COGS does not match line COGS.",
      path: ["profit", "cogsMinor"],
    });
  }
  if (
    sale.profit.grossProfitMinor !==
    sale.totals.totalMinor - sale.profit.cogsMinor
  ) {
    context.addIssue({
      code: "custom",
      message: "Sale gross profit does not equal total less COGS.",
      path: ["profit", "grossProfitMinor"],
    });
  }
}

export const SALE_REVIEW_WARNING_CODES = [
  "price_changed",
  "stock_changed",
  "stock_unavailable",
  "discount_requires_authorization",
  "below_minimum_price",
  "below_minimum_margin",
  "cash_session_required",
  "credit_requires_customer",
  "credit_requires_authorization",
] as const;
export type SaleReviewWarningCode =
  (typeof SALE_REVIEW_WARNING_CODES)[number];

export const SaleReviewWarningSchema = z
  .object({
    code: z.enum(SALE_REVIEW_WARNING_CODES),
    severity: z.enum(["blocking", "warning", "info"]),
    message: z.string().min(1).max(500),
    lineId: z.uuid().nullable(),
  })
  .strict();
export type SaleReviewWarning = z.infer<typeof SaleReviewWarningSchema>;

export const SaleReviewSchema = z
  .object({
    saleId: z.uuid(),
    version: responseVersionSchema,
    customer: SaleCustomerReferenceSchema.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    discountReason: z
      .string()
      .min(1)
      .max(SALE_CONTRACT_LIMITS.REASON_LENGTH)
      .nullable(),
    lines: z.array(SaleLineSchema).min(1).max(SALE_CONTRACT_LIMITS.MAX_LINES),
    totals: SaleTotalsSchema,
    profit: SaleProfitSchema,
    warnings: z
      .array(SaleReviewWarningSchema)
      .max(SALE_CONTRACT_LIMITS.MAX_WARNINGS),
    canPost: z.boolean(),
    reviewedAt: responseTimestampSchema,
  })
  .strict()
  .superRefine((review, context) => {
    refineSaleAggregate(review, context);
    const hasBlocking = review.warnings.some(
      (warning) => warning.severity === "blocking",
    );
    if (review.canPost === hasBlocking) {
      context.addIssue({
        code: "custom",
        message: "canPost must be false exactly when a blocking warning exists.",
        path: ["canPost"],
      });
    }
  });
export type SaleReview = z.infer<typeof SaleReviewSchema>;

export const SaleHoldSchema = z
  .object({
    heldAt: responseTimestampSchema,
    heldBy: SaleUserReferenceSchema,
    note: z
      .string()
      .min(1)
      .max(SALE_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
  })
  .strict();
export type SaleHold = z.infer<typeof SaleHoldSchema>;

export const SaleDetailSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(SALE_STATUSES),
    invoiceNumber: z
      .string()
      .min(1)
      .max(SALE_CONTRACT_LIMITS.INVOICE_LENGTH)
      .nullable(),
    customer: SaleCustomerReferenceSchema.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    note: z.string().min(1).max(SALE_CONTRACT_LIMITS.NOTE_LENGTH).nullable(),
    discountReason: z
      .string()
      .min(1)
      .max(SALE_CONTRACT_LIMITS.REASON_LENGTH)
      .nullable(),
    hold: SaleHoldSchema.nullable(),
    lines: z.array(SaleLineSchema).min(1).max(SALE_CONTRACT_LIMITS.MAX_LINES),
    totals: SaleTotalsSchema,
    settlement: SaleSettlementSchema,
    profit: SaleProfitSchema,
    cashier: SaleUserReferenceSchema.nullable(),
    salesperson: SaleUserReferenceSchema.nullable(),
    version: responseVersionSchema,
    createdAt: responseTimestampSchema,
    updatedAt: responseTimestampSchema,
    postedAt: responseTimestampSchema.nullable(),
    cancelledAt: responseTimestampSchema.nullable(),
  })
  .strict()
  .superRefine((sale, context) => {
    refineSaleAggregate(sale, context);
    const posted = ["posted", "partially_returned", "returned"].includes(
      sale.status,
    );
    if (posted !== (sale.invoiceNumber !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only a successfully posted sale has an invoice number.",
        path: ["invoiceNumber"],
      });
    }
    if (posted !== (sale.postedAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "Posted timestamp does not match sale status.",
        path: ["postedAt"],
      });
    }
    if ((sale.status === "cancelled") !== (sale.cancelledAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "Cancelled timestamp does not match sale status.",
        path: ["cancelledAt"],
      });
    }
    if (sale.status !== "draft" && sale.hold !== null) {
      context.addIssue({
        code: "custom",
        message: "Only a draft sale can be held.",
        path: ["hold"],
      });
    }
    if (sale.totals.discountMinor > 0 && sale.discountReason === null) {
      context.addIssue({
        code: "custom",
        message: "A discounted sale must retain its reason.",
        path: ["discountReason"],
      });
    }
    const settled =
      BigInt(sale.settlement.paidMinor) +
      BigInt(sale.settlement.receivableMinor);
    if (posted) {
      if (settled !== BigInt(sale.totals.totalMinor)) {
        context.addIssue({
          code: "custom",
          message: "Payment plus receivable must equal the posted sale total.",
          path: ["settlement"],
        });
      }
    } else if (
      sale.settlement.payments.length > 0 ||
      sale.settlement.paidMinor !== 0 ||
      sale.settlement.receivableMinor !== 0
    ) {
      context.addIssue({
        code: "custom",
        message: "An unposted sale cannot carry payment allocations.",
        path: ["settlement"],
      });
    }
  });
export type SaleDetail = z.infer<typeof SaleDetailSchema>;

// =============================================================================
// Receipt: customer-facing exact evidence, intentionally without COGS/profit
// =============================================================================

const receiptLineAmountShape = {
  id: z.uuid(),
  product: SaleProductSnapshotSchema,
  locationName: z.string().min(1).max(200),
  unitPriceMinor: nonnegativeResponseMoneySchema,
  lineSubtotalMinor: nonnegativeResponseMoneySchema,
  discountMinor: nonnegativeResponseMoneySchema,
  lineTotalMinor: nonnegativeResponseMoneySchema,
  discountReason: z
    .string()
    .min(1)
    .max(SALE_CONTRACT_LIMITS.REASON_LENGTH)
    .nullable(),
};

function refineReceiptLine(
  line: {
    readonly quantity: number;
    readonly unitPriceMinor: number;
    readonly lineSubtotalMinor: number;
    readonly discountMinor: number;
    readonly lineTotalMinor: number;
    readonly discountReason: string | null;
  },
  context: z.RefinementCtx,
): void {
  const subtotal = BigInt(line.unitPriceMinor) * BigInt(line.quantity);
  if (
    subtotal > BigInt(Number.MAX_SAFE_INTEGER) ||
    subtotal !== BigInt(line.lineSubtotalMinor)
  ) {
    context.addIssue({
      code: "custom",
      message: "Receipt line subtotal does not reconcile.",
      path: ["lineSubtotalMinor"],
    });
  }
  if (
    line.discountMinor > line.lineSubtotalMinor ||
    line.lineTotalMinor !== line.lineSubtotalMinor - line.discountMinor
  ) {
    context.addIssue({
      code: "custom",
      message: "Receipt line total does not reconcile.",
      path: ["lineTotalMinor"],
    });
  }
  if (line.discountMinor > 0 && line.discountReason === null) {
    context.addIssue({
      code: "custom",
      message: "A receipt discount must retain its reason.",
      path: ["discountReason"],
    });
  }
}

const serializedReceiptLineSchema = z
  .object({
    ...receiptLineAmountShape,
    trackingType: z.literal("serialized"),
    quantity: z.literal(1),
    identifiers: z.array(DeviceIdentifierSchema).min(1).max(4),
  })
  .strict()
  .superRefine(refineReceiptLine);

const quantityReceiptLineSchema = z
  .object({
    ...receiptLineAmountShape,
    trackingType: z.literal("quantity"),
    quantity: z
      .number()
      .int()
      .positive()
      .max(SALE_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE),
  })
  .strict()
  .superRefine(refineReceiptLine);

export const SaleReceiptLineSchema = z.discriminatedUnion("trackingType", [
  serializedReceiptLineSchema,
  quantityReceiptLineSchema,
]);
export type SaleReceiptLine = z.infer<typeof SaleReceiptLineSchema>;

export const SaleReceiptSchema = z
  .object({
    saleId: z.uuid(),
    invoiceNumber: z
      .string()
      .min(1)
      .max(SALE_CONTRACT_LIMITS.INVOICE_LENGTH),
    currency: z.string().regex(/^[A-Z]{3}$/),
    issuedAt: responseTimestampSchema,
    shop: z
      .object({
        organizationName: z.string().min(1).max(200),
        branchName: z.string().min(1).max(200),
        addressLine: z.string().min(1).max(500).nullable(),
        phone: z.string().min(1).max(30).nullable(),
      })
      .strict(),
    customer: SaleCustomerReferenceSchema.nullable(),
    cashier: SaleUserReferenceSchema,
    salesperson: SaleUserReferenceSchema.nullable(),
    lines: z
      .array(SaleReceiptLineSchema)
      .min(1)
      .max(SALE_CONTRACT_LIMITS.MAX_LINES),
    totals: SaleTotalsSchema,
    settlement: SaleSettlementSchema,
    footer: z.string().min(1).max(500).nullable(),
  })
  .strict()
  .superRefine((receipt, context) => {
    const subtotal = receipt.lines.reduce(
      (sum, line) => sum + BigInt(line.lineSubtotalMinor),
      0n,
    );
    const discount = receipt.lines.reduce(
      (sum, line) => sum + BigInt(line.discountMinor),
      0n,
    );
    const total = receipt.lines.reduce(
      (sum, line) => sum + BigInt(line.lineTotalMinor),
      0n,
    );
    if (
      subtotal !== BigInt(receipt.totals.subtotalMinor) ||
      discount !== BigInt(receipt.totals.discountMinor) ||
      total !== BigInt(receipt.totals.totalMinor)
    ) {
      context.addIssue({
        code: "custom",
        message: "Receipt totals do not match its lines.",
        path: ["totals"],
      });
    }
    if (
      BigInt(receipt.settlement.paidMinor) +
        BigInt(receipt.settlement.receivableMinor) !==
      BigInt(receipt.totals.totalMinor)
    ) {
      context.addIssue({
        code: "custom",
        message: "Receipt settlement does not equal its exact total.",
        path: ["settlement"],
      });
    }
  });
export type SaleReceipt = z.infer<typeof SaleReceiptSchema>;

export const PostSaleResponseSchema = z
  .object({
    sale: SaleDetailSchema,
    receipt: SaleReceiptSchema,
    idempotencyReplay: z.boolean(),
  })
  .strict()
  .superRefine((response, context) => {
    if (
      response.sale.id !== response.receipt.saleId ||
      response.sale.invoiceNumber !== response.receipt.invoiceNumber
    ) {
      context.addIssue({
        code: "custom",
        message: "Posted sale and receipt identity do not match.",
        path: ["receipt"],
      });
    }
    if (
      response.sale.totals.totalMinor !== response.receipt.totals.totalMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Posted sale and receipt totals do not match.",
        path: ["receipt", "totals"],
      });
    }
  });
export type PostSaleResponse = z.infer<typeof PostSaleResponseSchema>;

// =============================================================================
// List, recent and receipt-read contracts
// =============================================================================

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

export const SALE_SORT_FIELDS = ["posted_at", "total"] as const;
export const SALE_SORT_DIRECTIONS = ["asc", "desc"] as const;

export const SaleListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchSchema,
    status: z.enum(SALE_STATUSES).optional(),
    cashierId: z.uuid().optional(),
    salespersonId: z.uuid().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    sort: z.enum(SALE_SORT_FIELDS).default("posted_at"),
    direction: z.enum(SALE_SORT_DIRECTIONS).default("desc"),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      query.from > query.to
    ) {
      context.addIssue({
        code: "custom",
        message: "The start date must not be after the end date.",
        path: ["from"],
      });
    }
  });
export type SaleListQueryInput = z.input<typeof SaleListQuerySchema>;
export type SaleListQuery = z.output<typeof SaleListQuerySchema>;

export const SaleReceiptQuerySchema = z
  .object({ format: z.enum(SALE_RECEIPT_FORMATS).default("thermal") })
  .strict();
export type SaleReceiptQueryInput = z.input<typeof SaleReceiptQuerySchema>;
export type SaleReceiptQuery = z.output<typeof SaleReceiptQuerySchema>;

const saleSummaryShape = {
  id: z.uuid(),
  status: z.enum(SALE_STATUSES),
  invoiceNumber: z
    .string()
    .min(1)
    .max(SALE_CONTRACT_LIMITS.INVOICE_LENGTH)
    .nullable(),
  customer: SaleCustomerReferenceSchema.nullable(),
  lineCount: z.number().int().positive().max(SALE_CONTRACT_LIMITS.MAX_LINES),
  unitCount: z.number().int().positive(),
  totalMinor: nonnegativeResponseMoneySchema,
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length),
  profit: SaleProfitSchema,
  cashier: SaleUserReferenceSchema.nullable(),
  salesperson: SaleUserReferenceSchema.nullable(),
  heldAt: responseTimestampSchema.nullable(),
  postedAt: responseTimestampSchema.nullable(),
  createdAt: responseTimestampSchema,
  version: responseVersionSchema,
};

function refineSaleSummary(
  summary: {
    readonly status: (typeof SALE_STATUSES)[number];
    readonly invoiceNumber: string | null;
    readonly postedAt: string | null;
    readonly heldAt: string | null;
    readonly paymentMethods: readonly (typeof PAYMENT_METHODS)[number][];
  },
  context: z.RefinementCtx,
): void {
  const posted = ["posted", "partially_returned", "returned"].includes(
    summary.status,
  );
  if (posted !== (summary.invoiceNumber !== null)) {
    context.addIssue({
      code: "custom",
      message: "Invoice number does not match sale status.",
      path: ["invoiceNumber"],
    });
  }
  if (posted !== (summary.postedAt !== null)) {
    context.addIssue({
      code: "custom",
      message: "Posted timestamp does not match sale status.",
      path: ["postedAt"],
    });
  }
  if (summary.status !== "draft" && summary.heldAt !== null) {
    context.addIssue({
      code: "custom",
      message: "Only a draft can have a held timestamp.",
      path: ["heldAt"],
    });
  }
  if (new Set(summary.paymentMethods).size !== summary.paymentMethods.length) {
    context.addIssue({
      code: "custom",
      message: "Payment methods must be unique in a summary.",
      path: ["paymentMethods"],
    });
  }
  if (!posted && summary.paymentMethods.length > 0) {
    context.addIssue({
      code: "custom",
      message: "An unposted sale cannot list payment methods.",
      path: ["paymentMethods"],
    });
  }
}

export const SaleSummarySchema = z
  .object(saleSummaryShape)
  .strict()
  .superRefine(refineSaleSummary);
export type SaleSummary = z.infer<typeof SaleSummarySchema>;

export const SaleRecentSummarySchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z
      .string()
      .min(1)
      .max(SALE_CONTRACT_LIMITS.INVOICE_LENGTH),
    postedAt: responseTimestampSchema,
    customerName: z.string().min(1).max(200),
    itemSummary: z.string().min(1).max(300),
    paymentMethods: z
      .array(z.enum(PAYMENT_METHODS))
      .min(1)
      .max(PAYMENT_METHODS.length),
    totalMinor: nonnegativeResponseMoneySchema,
    profit: SaleProfitSchema,
  })
  .strict()
  .superRefine((summary, context) => {
    if (
      new Set(summary.paymentMethods).size !== summary.paymentMethods.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Payment methods must be unique in a recent-sale summary.",
        path: ["paymentMethods"],
      });
    }
  });
export type SaleRecentSummary = z.infer<typeof SaleRecentSummarySchema>;

export const SaleRecentListQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(20).default(6),
  })
  .strict();
export type SaleRecentListQueryInput = z.input<
  typeof SaleRecentListQuerySchema
>;
export type SaleRecentListQuery = z.output<
  typeof SaleRecentListQuerySchema
>;

export const SalePageSchema = createPageEnvelopeSchema(SaleSummarySchema);
export type SalePage = z.infer<typeof SalePageSchema>;
