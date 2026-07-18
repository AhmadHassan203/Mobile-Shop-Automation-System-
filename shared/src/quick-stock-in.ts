import { z } from "zod";
import { LIMITS } from "./constants";
import { NonnegativeMoneyMinorSchema } from "./purchasing";

/**
 * Quick Stock In — one-screen contract for the simplified stock-entry flow.
 *
 * The shopkeeper experiences a single action ("Save Purchase & Add Stock"), but
 * the server still records the full chain internally, inside ONE Prisma
 * transaction that either fully commits or fully rolls back: product + supplier
 * reuse-or-create, a purchase order, its receivable transition, a goods receipt,
 * a stock batch, a `purchase_receive` inventory movement, the payment posting,
 * the supplier payable for any unpaid remainder, the financial-ledger entries
 * and the new selling price.
 *
 * Scope discipline (matches the rest of shared/): tenant, branch and actor come
 * from the authenticated session and never appear here. Cost/price/payment are
 * plain minor-unit integers, exactly as the purchasing contract models money.
 *
 * This flow is deliberately QUANTITY-ONLY. It never asks for, validates or
 * requires an IMEI/serial, and it creates quantity-tracked stock even for
 * phones. The serialized/IMEI infrastructure is untouched — it is simply not
 * used here.
 */

export const QUICK_STOCK_IN_LIMITS = Object.freeze({
  /** product_models.name / product_variants.name are VARCHAR(200). */
  NAME_LENGTH: 200,
  /** product_variants.sku VARCHAR(60); also covers a typed barcode. */
  SKU_LENGTH: 60,
  /** suppliers.name VARCHAR(200). */
  SUPPLIER_NAME_LENGTH: 200,
  /** suppliers.code VARCHAR(40). */
  SUPPLIER_CODE_LENGTH: 40,
  /** supplier_contacts.phone — kept short and human. */
  PHONE_LENGTH: 40,
  /** A single quick stock-in cannot exceed the movement ledger's INTEGER column. */
  MAX_QUANTITY: 1_000_000,
  /** Supplier invoice / payment reference text kept short. */
  REFERENCE_LENGTH: 200,
  MAX_NOTE_LENGTH: LIMITS.MAX_NOTE_LENGTH,
  /** Net 0-365 days is a sane ceiling for informal supplier terms. */
  MAX_PAYMENT_TERMS_DAYS: 365,
});

/** Default deterministic prefix for a supplier code generated from a typed name. */
export const QUICK_SUPPLIER_CODE_PREFIX = "SUP";

/**
 * Payment tender, aligned with the database `PaymentMethod` enum. JazzCash and
 * EasyPaisa are both `digital_wallet`; the specific provider is preserved in
 * `walletProvider` so finance reports still identify the actual service and the
 * money moves against the correct provider-float account.
 */
export const QUICK_STOCK_IN_TENDERS = [
  "cash",
  "bank_transfer",
  "digital_wallet",
] as const;
export type QuickStockInTender = (typeof QUICK_STOCK_IN_TENDERS)[number];

export const QUICK_STOCK_IN_WALLET_PROVIDERS = [
  "jazzcash",
  "easypaisa",
] as const;
export type QuickStockInWalletProvider =
  (typeof QUICK_STOCK_IN_WALLET_PROVIDERS)[number];

export const QUICK_STOCK_IN_PAYMENT_STATUSES = [
  "paid_full",
  "partial",
  "credit",
] as const;
export type QuickStockInPaymentStatus =
  (typeof QUICK_STOCK_IN_PAYMENT_STATUSES)[number];

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

/** Supplier codes are compared upper-case; whitespace becomes `-`. */
export function normalizeSupplierCode(value: string): string {
  return normalizeDisplayText(value).replace(/\s+/g, "-").toUpperCase();
}

const requiredName = (label: string, max = QUICK_STOCK_IN_LIMITS.NAME_LENGTH) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(
      z
        .string()
        .min(1, `Enter a ${label}.`)
        .max(max, `${label} must be ${max} characters or fewer.`),
    );

const optionalShortText = (max: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().max(max))
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

const quantitySchema = z
  .number()
  .int("Quantity must be a whole number.")
  .positive("Enter a quantity of at least 1.")
  .max(
    QUICK_STOCK_IN_LIMITS.MAX_QUANTITY,
    `Quantity must be ${QUICK_STOCK_IN_LIMITS.MAX_QUANTITY} or fewer.`,
  );

// =============================================================================
// Product selection — reuse an existing variant, or create one inline
// =============================================================================

export const QuickStockInExistingProductSchema = z
  .object({
    mode: z.literal("existing"),
    productVariantId: z.uuid(),
  })
  .strict();

export const QuickStockInNewProductSchema = z
  .object({
    mode: z.literal("new"),
    /** The product/model display name, e.g. "Galaxy A15". */
    productName: requiredName("product name"),
    /** Optional distinct model name; falls back to productName when omitted. */
    productModelName: optionalShortText(QUICK_STOCK_IN_LIMITS.NAME_LENGTH),
    /** The sellable variant name, e.g. "Galaxy A15 8/256 Black". */
    variantName: requiredName("variant name"),
    categoryId: z.uuid(),
    brandId: z.uuid(),
    /** Optional SKU/barcode; a deterministic SKU is generated when omitted. */
    sku: optionalShortText(QUICK_STOCK_IN_LIMITS.SKU_LENGTH),
  })
  .strict();

export const QuickStockInProductSchema = z.discriminatedUnion("mode", [
  QuickStockInExistingProductSchema,
  QuickStockInNewProductSchema,
]);

// =============================================================================
// Supplier selection — existing, or typed-new
// =============================================================================

export const QuickStockInExistingSupplierSchema = z
  .object({
    mode: z.literal("existing"),
    supplierId: z.uuid(),
  })
  .strict();

export const QuickStockInNewSupplierSchema = z
  .object({
    mode: z.literal("new"),
    name: requiredName(
      "supplier name",
      QUICK_STOCK_IN_LIMITS.SUPPLIER_NAME_LENGTH,
    ),
    /** The only other detail a shopkeeper is asked for; stored as the primary contact. */
    phone: optionalShortText(QUICK_STOCK_IN_LIMITS.PHONE_LENGTH),
    /** Optional; a deterministic code is generated from the name when omitted. */
    code: optionalShortText(QUICK_STOCK_IN_LIMITS.SUPPLIER_CODE_LENGTH),
    paymentTermsDays: z
      .number()
      .int()
      .min(0)
      .max(QUICK_STOCK_IN_LIMITS.MAX_PAYMENT_TERMS_DAYS)
      .optional(),
  })
  .strict();

export const QuickStockInSupplierSchema = z.discriminatedUnion("mode", [
  QuickStockInExistingSupplierSchema,
  QuickStockInNewSupplierSchema,
]);

// =============================================================================
// Payment
// =============================================================================

const walletProviderSchema = z.enum(QUICK_STOCK_IN_WALLET_PROVIDERS);
const tenderSchema = z.enum(QUICK_STOCK_IN_TENDERS);
const paymentReferenceSchema = optionalShortText(
  QUICK_STOCK_IN_LIMITS.REFERENCE_LENGTH,
);

/**
 * `walletProvider` is required exactly when the tender is `digital_wallet`, and
 * forbidden otherwise. Shared as a helper because both the paid-in-full and
 * partial branches enforce it identically.
 */
function refineTender(
  payment: {
    readonly method: QuickStockInTender;
    readonly walletProvider?: QuickStockInWalletProvider | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (payment.method === "digital_wallet" && !payment.walletProvider) {
    ctx.addIssue({
      code: "custom",
      message: "Choose JazzCash or EasyPaisa for a wallet payment.",
      path: ["walletProvider"],
    });
  }
  if (payment.method !== "digital_wallet" && payment.walletProvider) {
    ctx.addIssue({
      code: "custom",
      message: "A wallet provider only applies to a wallet payment.",
      path: ["walletProvider"],
    });
  }
}

export const QuickStockInPaymentSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("paid_full"),
      method: tenderSchema,
      walletProvider: walletProviderSchema.nullable().optional(),
      reference: paymentReferenceSchema,
    })
    .strict()
    .superRefine(refineTender),
  z
    .object({
      status: z.literal("partial"),
      method: tenderSchema,
      walletProvider: walletProviderSchema.nullable().optional(),
      amountPaidMinor: NonnegativeMoneyMinorSchema.positive(
        "A partial payment must be greater than zero.",
      ),
      reference: paymentReferenceSchema,
    })
    .strict()
    .superRefine(refineTender),
  z.object({ status: z.literal("credit") }).strict(),
]);
export type QuickStockInPaymentInput = z.input<
  typeof QuickStockInPaymentSchema
>;
export type QuickStockInPaymentData = z.output<
  typeof QuickStockInPaymentSchema
>;

// =============================================================================
// Request
// =============================================================================

export const QuickStockInInputSchema = z
  .object({
    product: QuickStockInProductSchema,
    supplier: QuickStockInSupplierSchema,
    stockLocationId: z.uuid(),
    quantity: quantitySchema,
    unitCostMinor: NonnegativeMoneyMinorSchema,
    sellingPriceMinor: NonnegativeMoneyMinorSchema,
    payment: QuickStockInPaymentSchema,
    supplierReference: optionalShortText(
      QUICK_STOCK_IN_LIMITS.REFERENCE_LENGTH,
    ),
    notes: optionalShortText(QUICK_STOCK_IN_LIMITS.MAX_NOTE_LENGTH),
  })
  .strict()
  .superRefine((input, ctx) => {
    // purchaseTotal = quantity × unitCost. A partial payment must be strictly
    // between zero and the total; paid-in-full and credit are exact by
    // construction and need no amount in the body.
    const purchaseTotal = BigInt(input.unitCostMinor) * BigInt(input.quantity);
    if (input.payment.status === "partial") {
      const paid = BigInt(input.payment.amountPaidMinor);
      if (paid >= purchaseTotal) {
        ctx.addIssue({
          code: "custom",
          message:
            "A partial payment must be less than the purchase total. Use Paid in full instead.",
          path: ["payment", "amountPaidMinor"],
        });
      }
    }
  });
export type QuickStockInInput = z.input<typeof QuickStockInInputSchema>;
export type QuickStockInData = z.output<typeof QuickStockInInputSchema>;

/**
 * Resolve the paid / remaining split for a parsed request. Shared by the server
 * (authoritative) and available to the client for the live summary, so both
 * compute the identical figures.
 */
export function resolveQuickStockInAmounts(input: {
  readonly quantity: number;
  readonly unitCostMinor: number;
  readonly payment: QuickStockInPaymentData;
}): {
  readonly purchaseTotalMinor: number;
  readonly paidAmountMinor: number;
  readonly remainingPayableMinor: number;
} {
  const purchaseTotalMinor = input.unitCostMinor * input.quantity;
  let paidAmountMinor: number;
  switch (input.payment.status) {
    case "paid_full":
      paidAmountMinor = purchaseTotalMinor;
      break;
    case "partial":
      paidAmountMinor = input.payment.amountPaidMinor;
      break;
    case "credit":
      paidAmountMinor = 0;
      break;
  }
  return {
    purchaseTotalMinor,
    paidAmountMinor,
    remainingPayableMinor: purchaseTotalMinor - paidAmountMinor,
  };
}

// =============================================================================
// Response — the success state the shopkeeper sees
// =============================================================================

const responseMoneySchema = z.number().int().safe().nonnegative();

export const QuickStockInResultSchema = z
  .object({
    product: z
      .object({
        id: z.uuid(),
        name: z.string().min(1),
        sku: z.string().min(1),
        wasCreated: z.boolean(),
      })
      .strict(),
    supplier: z
      .object({
        id: z.uuid(),
        name: z.string().min(1),
        wasCreated: z.boolean(),
      })
      .strict(),
    quantityAdded: z.number().int().positive(),
    /** Stock on hand for this variant/location AFTER the receipt. */
    currentStockOnHand: z.number().int().nonnegative(),
    unitCostMinor: responseMoneySchema,
    purchaseTotalMinor: responseMoneySchema,
    sellingPriceMinor: responseMoneySchema,
    stockLocationId: z.uuid(),
    stockLocationName: z.string().min(1),
    purchaseOrderId: z.uuid(),
    purchaseOrderNumber: z.string().min(1),
    goodsReceiptId: z.uuid(),
    goodsReceiptNumber: z.string().min(1),
    // Payment / payable
    paymentStatus: z.enum(QUICK_STOCK_IN_PAYMENT_STATUSES),
    /** Null for a pure credit purchase (no tender taken). */
    paymentMethod: z.enum(QUICK_STOCK_IN_TENDERS).nullable(),
    walletProvider: z.enum(QUICK_STOCK_IN_WALLET_PROVIDERS).nullable(),
    paidAmountMinor: responseMoneySchema,
    remainingPayableMinor: responseMoneySchema,
    /**
     * The supplier payable for this receipt. The database mandates exactly one
     * payable per goods receipt (a deferred reconciliation trigger), so a
     * fully-paid purchase is represented as a settled payable
     * (`remainingPayableMinor === 0`, status `paid`) rather than no row at all.
     * The unpaid amount is always `remainingPayableMinor`.
     */
    payableId: z.uuid(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (
      result.purchaseTotalMinor !==
      result.unitCostMinor * result.quantityAdded
    ) {
      ctx.addIssue({
        code: "custom",
        message: "purchaseTotal must equal unitCost × quantity.",
        path: ["purchaseTotalMinor"],
      });
    }
    if (
      result.paidAmountMinor + result.remainingPayableMinor !==
      result.purchaseTotalMinor
    ) {
      ctx.addIssue({
        code: "custom",
        message: "paid + remaining must equal the purchase total.",
        path: ["remainingPayableMinor"],
      });
    }
    if (result.paymentStatus === "credit" && result.paidAmountMinor !== 0) {
      ctx.addIssue({
        code: "custom",
        message: "A credit purchase pays nothing up front.",
        path: ["paidAmountMinor"],
      });
    }
    if (result.paymentStatus === "credit" && result.paymentMethod !== null) {
      ctx.addIssue({
        code: "custom",
        message: "A credit purchase records no payment method.",
        path: ["paymentMethod"],
      });
    }
    if (result.paymentStatus !== "credit" && result.paymentMethod === null) {
      ctx.addIssue({
        code: "custom",
        message: "A paid purchase must record its payment method.",
        path: ["paymentMethod"],
      });
    }
    if (
      result.walletProvider !== null &&
      result.paymentMethod !== "digital_wallet"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A wallet provider only applies to a wallet payment.",
        path: ["walletProvider"],
      });
    }
  });
export type QuickStockInResult = z.infer<typeof QuickStockInResultSchema>;
