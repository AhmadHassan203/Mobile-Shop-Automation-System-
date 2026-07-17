import {
  computeExternalFeeMinor,
  computeServiceProfitMinor,
  defaultDirectionForType,
  fromMajor,
  PERMISSIONS,
  type CreateExternalTransactionInput,
  type ExternalCashDirection,
  type ExternalProvider,
  type ExternalTransaction,
  type ExternalTransactionType,
  type PaymentMethod,
} from "@mobileshop/shared";

export const EXTERNAL_PROVIDER_LABELS: Readonly<
  Record<ExternalProvider, string>
> = Object.freeze({
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  bank: "Bank",
  electricity: "Electricity bill",
  gas: "Gas bill",
  jazz: "Jazz",
  zong: "Zong",
  other: "Other",
});

export const EXTERNAL_TYPE_LABELS: Readonly<
  Record<ExternalTransactionType, string>
> = Object.freeze({
  money_send: "Money send",
  money_withdrawal: "Money withdrawal",
  bank_transfer: "Bank transfer",
  utility_bill: "Utility bill",
  mobile_load: "Mobile load",
});

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> =
  Object.freeze({
    cash: "Cash",
    bank_transfer: "Bank transfer",
    card: "Card",
    digital_wallet: "Digital wallet",
    credit: "Credit",
  });

export const CASH_DIRECTION_LABELS: Readonly<
  Record<ExternalCashDirection, string>
> = Object.freeze({
  cash_in: "Cash in — the customer hands cash to the shop",
  cash_out: "Cash out — the shop hands cash to the customer",
});

export interface ExternalCapabilities {
  readonly canView: boolean;
  readonly canCreate: boolean;
}

export function externalCapabilities(
  permissions: readonly string[] | undefined,
): ExternalCapabilities {
  const granted = new Set(permissions ?? []);
  return {
    canView: granted.has(PERMISSIONS.EXTERNAL_VIEW),
    canCreate: granted.has(PERMISSIONS.EXTERNAL_CREATE),
  };
}

export interface ExternalFormValues {
  readonly provider: ExternalProvider;
  readonly transactionType: ExternalTransactionType;
  /** Principal in major PKR units as typed by the cashier (e.g. "1000.50"). */
  readonly principalMajor: string;
  /** Optional provider charge in major PKR units; blank means none. */
  readonly providerChargeMajor: string;
  readonly paymentMethod: PaymentMethod;
  readonly providerReference: string;
  readonly accountReference: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly note: string;
}

/** Parse a major-unit money string to minor units; null when blank or invalid. */
export function minorFromMajor(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const minor = fromMajor(trimmed);
    if (!Number.isSafeInteger(minor) || minor < 0) return null;
    return minor;
  } catch {
    return null;
  }
}

/**
 * A live, client-side preview of the same figures the server will recompute.
 *
 * The principal is customer money passing through and is never revenue; only the
 * fee is revenue, and service profit is the fee less any provider charge.
 */
export interface ExternalPreview {
  readonly principalMinor: number | null;
  readonly principalValid: boolean;
  readonly providerChargeMinor: number;
  readonly feeMinor: number | null;
  readonly serviceProfitMinor: number | null;
  readonly direction: ExternalCashDirection;
}

export function externalPreview(values: ExternalFormValues): ExternalPreview {
  const principalMinor = minorFromMajor(values.principalMajor);
  const providerChargeMinor = minorFromMajor(values.providerChargeMajor) ?? 0;
  const direction = defaultDirectionForType(values.transactionType);
  const principalValid = principalMinor !== null && principalMinor > 0;
  const feeMinor = principalValid
    ? computeExternalFeeMinor(values.transactionType, principalMinor)
    : null;
  const serviceProfitMinor =
    feeMinor === null
      ? null
      : computeServiceProfitMinor(feeMinor, providerChargeMinor);
  return {
    principalMinor,
    principalValid,
    providerChargeMinor,
    feeMinor,
    serviceProfitMinor,
    direction,
  };
}

export type ExternalInputResult =
  | { readonly ok: true; readonly input: CreateExternalTransactionInput }
  | { readonly ok: false; readonly error: string };

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Build the strict create input from the form, or a message naming the first
 * blocking problem. Empty optional fields are omitted so the contract's null
 * defaults apply; the server derives txn number, direction, fee and profit.
 */
export function buildExternalInput(
  values: ExternalFormValues,
): ExternalInputResult {
  const principalMinor = minorFromMajor(values.principalMajor);
  if (principalMinor === null || principalMinor <= 0) {
    return { ok: false, error: "Enter a principal amount greater than zero." };
  }

  let providerChargeMinor: number | undefined;
  if (values.providerChargeMajor.trim().length > 0) {
    const parsed = minorFromMajor(values.providerChargeMajor);
    if (parsed === null) {
      return { ok: false, error: "The provider charge is not a valid amount." };
    }
    providerChargeMinor = parsed;
  }

  const providerReference = optionalText(values.providerReference);
  const accountReference = optionalText(values.accountReference);
  const customerName = optionalText(values.customerName);
  const customerPhone = optionalText(values.customerPhone);
  const note = optionalText(values.note);

  return {
    ok: true,
    input: {
      provider: values.provider,
      transactionType: values.transactionType,
      principalMinor,
      paymentMethod: values.paymentMethod,
      ...(providerChargeMinor === undefined ? {} : { providerChargeMinor }),
      ...(providerReference === undefined ? {} : { providerReference }),
      ...(accountReference === undefined ? {} : { accountReference }),
      ...(customerName === undefined ? {} : { customerName }),
      ...(customerPhone === undefined ? {} : { customerPhone }),
      ...(note === undefined ? {} : { note }),
    },
  };
}

/**
 * Mint a fresh idempotency key for a brand-new logical transaction.
 *
 * A UUID is generated per logical transaction — never per submit attempt — so
 * that retries can reuse it. Overridable in tests via {@link
 * RecordExternalTransactionOptions.generateKey}.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface RecordExternalTransactionOptions {
  /**
   * The idempotency key already held for this logical transaction, or `null`
   * when none has been minted yet (first submit, or after a success/reset).
   */
  readonly heldKey: string | null;
  /**
   * Persist the key for the logical transaction. Called with the freshly minted
   * key so a later retry reuses it, and with `null` after a confirmed success so
   * the next logical transaction starts clean.
   */
  readonly setHeldKey: (key: string | null) => void;
  /**
   * The idempotent create call. It receives the caller-owned key and must not
   * mint its own, so every retry travels to the server under the same key.
   */
  readonly create: (
    input: CreateExternalTransactionInput,
    idempotencyKey: string,
  ) => Promise<ExternalTransaction>;
  /** Key factory, overridable so tests are deterministic. */
  readonly generateKey?: () => string;
}

/**
 * Record one submit attempt of a logical external transaction under a stable,
 * retry-safe idempotency key.
 *
 * The key is minted lazily on the first attempt and **persisted before the
 * request is sent**, so that a timeout, a network failure or any other uncertain
 * (thrown) response leaves the same key in place for the next attempt — the
 * server therefore records the transaction at most once no matter how many times
 * the cashier retries. Only a confirmed success (a resolved 2xx record) retires
 * the key, after which the next logical transaction mints a fresh one.
 */
export async function recordExternalTransaction(
  input: CreateExternalTransactionInput,
  options: RecordExternalTransactionOptions,
): Promise<ExternalTransaction> {
  const generateKey = options.generateKey ?? newIdempotencyKey;
  // Reuse the key already held for this logical transaction; mint one only when
  // none exists yet, and persist it up front so a thrown response below still
  // leaves it available for an idempotent retry.
  const idempotencyKey = options.heldKey ?? generateKey();
  if (options.heldKey === null) options.setHeldKey(idempotencyKey);
  const saved = await options.create(input, idempotencyKey);
  // Reached only on a confirmed success — a thrown response skips this line and
  // keeps the held key. Retire the key so the next transaction starts fresh.
  options.setHeldKey(null);
  return saved;
}
