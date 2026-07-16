import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import { CustomerSummarySchema } from "./customers";
import { PAYMENT_METHODS, SALE_STATUSES } from "./enums";
import { DeviceIdentifierSchema } from "./inventory";
import { PosStockLocationSchema } from "./pricing";

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
  priceVersion: versionInputSchema,
  requestedDiscountMinor: SaleNonnegativeMoneyInputSchema.default(0),
  discountReason: nullableInputText(SALE_CONTRACT_LIMITS.REASON_LENGTH).default(
    null,
  ),
};

function refineDiscountProposal(
  line: {
    readonly requestedDiscountMinor: number;
    readonly discountReason: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (line.requestedDiscountMinor > 0 && line.discountReason === null) {
    context.addIssue({
      code: "custom",
      message: "Enter a reason for the requested discount.",
      path: ["discountReason"],
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
  .superRefine(refineDiscountProposal);
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
  .superRefine(refineDiscountProposal);
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
}

function refineDraftLines(
  sale: DraftLinesShape,
  context: z.RefinementCtx,
): void {
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
