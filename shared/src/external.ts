import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import { PAYMENT_METHODS } from "./enums";

/**
 * External money-service contracts (13_ §13).
 *
 * The shop RECORDS a provider transaction (JazzCash/Easypaisa/bank/utility/mobile
 * load) a cashier performs outside the system; it never executes it.
 *
 * Critical rule: the PRINCIPAL is customer money passing through and is never
 * revenue or profit. Only the fee is revenue, and
 *
 *     service_profit = fee_charged - provider_charge
 *
 * Provider and transaction TYPE are separate concerns. Every amount is an exact
 * integer number of minor units (paisa); posting recomputes fee, direction, cash
 * impact and profit on the server.
 */

/** Who the transaction was performed against. */
export const EXTERNAL_PROVIDERS = [
  "jazzcash",
  "easypaisa",
  "bank",
  "electricity",
  "gas",
  "jazz",
  "zong",
  "other",
] as const;
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number];

/** What kind of transaction it was. */
export const EXTERNAL_TRANSACTION_TYPES = [
  "money_send",
  "money_withdrawal",
  "bank_transfer",
  "utility_bill",
  "mobile_load",
] as const;
export type ExternalTransactionType =
  (typeof EXTERNAL_TRANSACTION_TYPES)[number];

/** Direction physical cash moves in the drawer. */
export const EXTERNAL_CASH_DIRECTIONS = ["cash_in", "cash_out"] as const;
export type ExternalCashDirection = (typeof EXTERNAL_CASH_DIRECTIONS)[number];

/**
 * Default cash direction is derived from the TRANSACTION TYPE, not the provider.
 * Only a withdrawal hands cash to the customer (cash_out); every other type
 * takes cash in. 13_ §13 forbids assuming every type touches cash the same way,
 * so this is explicit and the server persists an authoritative signed impact.
 */
export const EXTERNAL_DIRECTION_BY_TYPE: Readonly<
  Record<ExternalTransactionType, ExternalCashDirection>
> = Object.freeze({
  money_send: "cash_in",
  money_withdrawal: "cash_out",
  bank_transfer: "cash_in",
  utility_bill: "cash_in",
  mobile_load: "cash_in",
});

export function defaultDirectionForType(
  transactionType: ExternalTransactionType,
): ExternalCashDirection {
  return EXTERNAL_DIRECTION_BY_TYPE[transactionType];
}

// =============================================================================
// Fee model — PER STARTED PKR 1,000 BLOCK (never prorated)
// =============================================================================

/**
 * Fee configuration in integer minor units. A partial block is charged as a full
 * block (ceil): PKR 1,001 sent is billed as two 1,000 blocks. Seeded settings may
 * override the per-block amounts without a deploy.
 */
export const EXTERNAL_FEE_CONFIG = Object.freeze({
  amountBlockMinor: 100_000, // PKR 1,000
  moneySendFeePerBlockMinor: 1_000, // PKR 10 per started PKR 1,000
  moneyWithdrawalFeePerBlockMinor: 2_000, // PKR 20 per started PKR 1,000
  calculationMode: "per_started_block" as const,
});

/** Default fee-per-block (minor units) by transaction type; 0 = no default fee. */
export const DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR: Readonly<
  Record<ExternalTransactionType, number>
> = Object.freeze({
  money_send: EXTERNAL_FEE_CONFIG.moneySendFeePerBlockMinor,
  money_withdrawal: EXTERNAL_FEE_CONFIG.moneyWithdrawalFeePerBlockMinor,
  bank_transfer: 0,
  utility_bill: 0,
  mobile_load: 0,
});

/** Application-setting keys carrying the per-block fee (owner-editable, no deploy). */
export const EXTERNAL_FEE_CONFIG_KEYS = Object.freeze({
  amountBlockMinor: "external.fee.amount_block_minor",
  money_send: "external.money_send.fee_per_block_minor",
  money_withdrawal: "external.money_withdrawal.fee_per_block_minor",
});

export interface ExternalFeeConfig {
  /** Block size in minor units; defaults to EXTERNAL_FEE_CONFIG.amountBlockMinor. */
  readonly amountBlockMinor?: number | undefined;
  /** Per-type override of the fee charged per started block, in minor units. */
  readonly feePerBlockMinorByType?:
    Partial<Record<ExternalTransactionType, number>> | undefined;
}

/**
 * Customer fee under the per-started-block model:
 *
 *     feeMinor = principalMinor === 0
 *       ? 0
 *       : Math.ceil(principalMinor / amountBlockMinor) * feePerBlockMinor
 *
 * Pure and exact in integer minor units. Zero principal is always zero fee.
 */
export function computeExternalFeeMinor(
  transactionType: ExternalTransactionType,
  principalMinor: number,
  config: ExternalFeeConfig = {},
): number {
  if (!Number.isSafeInteger(principalMinor) || principalMinor < 0) {
    throw new RangeError(
      "principalMinor must be a non-negative safe integer of minor units.",
    );
  }
  if (principalMinor === 0) return 0;

  const amountBlockMinor =
    config.amountBlockMinor ?? EXTERNAL_FEE_CONFIG.amountBlockMinor;
  if (!Number.isSafeInteger(amountBlockMinor) || amountBlockMinor <= 0) {
    throw new RangeError("amountBlockMinor must be a positive safe integer.");
  }
  const feePerBlockMinor =
    config.feePerBlockMinorByType?.[transactionType] ??
    DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR[transactionType];
  if (!Number.isSafeInteger(feePerBlockMinor) || feePerBlockMinor < 0) {
    throw new RangeError(
      "feePerBlockMinor must be a non-negative safe integer.",
    );
  }
  if (feePerBlockMinor === 0) return 0;

  return Math.ceil(principalMinor / amountBlockMinor) * feePerBlockMinor;
}

/** service_profit = fee_charged - provider_charge. May be negative (a real loss). */
export function computeServiceProfitMinor(
  feeChargedMinor: number,
  providerChargeMinor: number,
): number {
  return feeChargedMinor - providerChargeMinor;
}

/**
 * Authoritative signed drawer impact so cash reconciliation never relies on a
 * label alone. cash_in adds what the customer hands over (principal + fee);
 * cash_out subtracts what the shop pays out (principal less the retained fee).
 */
export function computeCashImpactMinor(
  transactionType: ExternalTransactionType,
  principalMinor: number,
  feeChargedMinor: number,
): number {
  return defaultDirectionForType(transactionType) === "cash_in"
    ? principalMinor + feeChargedMinor
    : -(principalMinor - feeChargedMinor);
}

export const EXTERNAL_CONTRACT_LIMITS = Object.freeze({
  TXN_NUMBER_LENGTH: 100,
  ACCOUNT_REFERENCE_LENGTH: 200,
  PROVIDER_REFERENCE_LENGTH: 200,
  NOTE_LENGTH: 500,
  REASON_LENGTH: LIMITS.MAX_REASON_LENGTH,
  NAME_LENGTH: 200,
  PHONE_LENGTH: 20,
});

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

const nullableInputText = (maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().min(1).max(maximum))
    .nullable();

const nonnegativeMoneyInput = z
  .number()
  .int("Amount must be an integer number of minor units.")
  .safe("Amount is outside the safe integer range.")
  .nonnegative();

const responseMoneySchema = z.number().int().safe().nonnegative();
const signedResponseMoneySchema = z.number().int().safe();
const responseTimestampSchema = z.iso.datetime();

// =============================================================================
// Inputs
// =============================================================================

/**
 * Recording request. Tenant, branch, actor, txn number, direction, cash impact
 * and the authoritative fee/profit never cross the input boundary — the server
 * derives the direction, recomputes the fee/profit and the signed cash impact.
 *
 * A cashier MAY override the computed fee, but only with a reason; the backend
 * additionally requires the external.override_fee permission for an override.
 */
export const CreateExternalTransactionInputSchema = z
  .object({
    provider: z.enum(EXTERNAL_PROVIDERS),
    transactionType: z.enum(EXTERNAL_TRANSACTION_TYPES),
    principalMinor: nonnegativeMoneyInput,
    /** Optional override; when omitted the server applies the configured block fee. */
    feeChargedMinor: nonnegativeMoneyInput.optional(),
    /** Required when feeChargedMinor is present (a manual override). */
    feeOverrideReason: nullableInputText(
      EXTERNAL_CONTRACT_LIMITS.REASON_LENGTH,
    ).default(null),
    providerChargeMinor: nonnegativeMoneyInput.default(0),
    paymentMethod: z.enum(PAYMENT_METHODS),
    /** The provider's receipt / reference number for this transaction. */
    providerReference: nullableInputText(
      EXTERNAL_CONTRACT_LIMITS.PROVIDER_REFERENCE_LENGTH,
    ).default(null),
    /** The target account/number or bill reference the transaction was for. */
    accountReference: nullableInputText(
      EXTERNAL_CONTRACT_LIMITS.ACCOUNT_REFERENCE_LENGTH,
    ).default(null),
    customerId: z.uuid().nullable().default(null),
    customerName: nullableInputText(
      EXTERNAL_CONTRACT_LIMITS.NAME_LENGTH,
    ).default(null),
    customerPhone: nullableInputText(
      EXTERNAL_CONTRACT_LIMITS.PHONE_LENGTH,
    ).default(null),
    note: nullableInputText(EXTERNAL_CONTRACT_LIMITS.NOTE_LENGTH).default(null),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.feeChargedMinor !== undefined &&
      input.feeOverrideReason === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A manual fee override requires a reason.",
        path: ["feeOverrideReason"],
      });
    }
    if (
      input.feeChargedMinor === undefined &&
      input.feeOverrideReason !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "An override reason is only valid with a fee override.",
        path: ["feeOverrideReason"],
      });
    }
  });
export type CreateExternalTransactionInput = z.input<
  typeof CreateExternalTransactionInputSchema
>;
export type CreateExternalTransactionData = z.output<
  typeof CreateExternalTransactionInputSchema
>;

// =============================================================================
// Responses
// =============================================================================

export const ExternalTransactionSchema = z
  .object({
    id: z.uuid(),
    txnNumber: z
      .string()
      .min(1)
      .max(EXTERNAL_CONTRACT_LIMITS.TXN_NUMBER_LENGTH),
    provider: z.enum(EXTERNAL_PROVIDERS),
    transactionType: z.enum(EXTERNAL_TRANSACTION_TYPES),
    direction: z.enum(EXTERNAL_CASH_DIRECTIONS),
    principalMinor: responseMoneySchema,
    feeChargedMinor: responseMoneySchema,
    providerChargeMinor: responseMoneySchema,
    serviceProfitMinor: signedResponseMoneySchema,
    cashImpactMinor: signedResponseMoneySchema,
    feeOverridden: z.boolean(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    providerReference: z
      .string()
      .min(1)
      .max(EXTERNAL_CONTRACT_LIMITS.PROVIDER_REFERENCE_LENGTH)
      .nullable(),
    accountReference: z
      .string()
      .min(1)
      .max(EXTERNAL_CONTRACT_LIMITS.ACCOUNT_REFERENCE_LENGTH)
      .nullable(),
    customerId: z.uuid().nullable(),
    customerName: z
      .string()
      .min(1)
      .max(EXTERNAL_CONTRACT_LIMITS.NAME_LENGTH)
      .nullable(),
    customerPhone: z
      .string()
      .min(1)
      .max(EXTERNAL_CONTRACT_LIMITS.PHONE_LENGTH)
      .nullable(),
    note: z
      .string()
      .min(1)
      .max(EXTERNAL_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
    businessDate: z.iso.date(),
    createdAt: responseTimestampSchema,
  })
  .strict()
  .superRefine((txn, context) => {
    if (
      txn.serviceProfitMinor !==
      txn.feeChargedMinor - txn.providerChargeMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Service profit must equal fee charged minus provider charge.",
        path: ["serviceProfitMinor"],
      });
    }
  });
export type ExternalTransaction = z.infer<typeof ExternalTransactionSchema>;

// =============================================================================
// List
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

export const ExternalTransactionListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchSchema,
    provider: z.enum(EXTERNAL_PROVIDERS).optional(),
    transactionType: z.enum(EXTERNAL_TRANSACTION_TYPES).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
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
export type ExternalTransactionListQueryInput = z.input<
  typeof ExternalTransactionListQuerySchema
>;
export type ExternalTransactionListQuery = z.output<
  typeof ExternalTransactionListQuerySchema
>;

export const ExternalTransactionPageSchema = createPageEnvelopeSchema(
  ExternalTransactionSchema,
);
export type ExternalTransactionPage = z.infer<
  typeof ExternalTransactionPageSchema
>;
