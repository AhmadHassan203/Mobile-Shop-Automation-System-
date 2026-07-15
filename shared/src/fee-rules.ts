/**
 * External money service fee calculation (13_ §13).
 *
 * The shop records send/withdrawal transactions that a cashier performs externally
 * (Easypaisa, JazzCash, bank app, etc.). The system does NOT execute the provider
 * transaction; it records it for cash control and reporting.
 *
 * Critical rule (13_ §23.15): the PRINCIPAL is never revenue or profit. Only the
 * customer fee is revenue, and:
 *
 *     service_profit = customer_fee - provider_charge - other_direct_expense
 *
 * Default business configuration (13_ §13) — seeded, never hardcoded as behavior:
 *   Send:       PKR 10 per PKR 1,000
 *   Withdrawal: PKR 20 per PKR 1,000
 */

import {
  type Minor,
  type RoundingMode,
  add,
  roundToMinor,
  subtract,
  toMinor,
  zero,
} from "./money";
import type { FeeCalculationMode } from "./enums";

/**
 * A resolved fee rule snapshot.
 *
 * Snapshotted onto each transaction so that changing a rule later never rewrites
 * the fee history of transactions already posted.
 */
export interface FeeRule {
  readonly mode: FeeCalculationMode;
  /** Block size in minor units (PKR 1,000 = 100000 paisa). Required for block modes. */
  readonly blockAmountMinor?: Minor | undefined;
  /** Fee charged per block, or the flat fee when mode is `fixed`. */
  readonly feePerBlockMinor?: Minor | undefined;
  /** Percentage of principal, e.g. 1.5 for 1.5%. Required for `percentage`. */
  readonly percentageRate?: number | undefined;
  readonly minFeeMinor?: Minor | undefined;
  readonly maxFeeMinor?: Minor | undefined;
  readonly rounding?: RoundingMode | undefined;
}

export interface FeeCalculationResult {
  readonly feeMinor: Minor;
  /** Fee before min/max clamping — shown in the UI so staff can see why a floor/cap applied. */
  readonly rawFeeMinor: Minor;
  /** Whole/partial blocks the principal spanned. Null for non-block modes. */
  readonly blocksCharged: number | null;
  readonly clampedByMin: boolean;
  readonly clampedByMax: boolean;
  /** Human-readable derivation, e.g. "2 started blocks x PKR 10.00". */
  readonly explanation: string;
}

export class FeeRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeeRuleError";
  }
}

/** PKR 1,000 expressed in paisa — the default block for send/withdrawal rules. */
export const DEFAULT_BLOCK_AMOUNT_MINOR = 100_000 as Minor;

/** PKR 10.00 per PKR 1,000 sent (13_ §13). */
export const DEFAULT_SEND_FEE_PER_BLOCK_MINOR = 1_000 as Minor;

/** PKR 20.00 per PKR 1,000 withdrawn (13_ §13). */
export const DEFAULT_WITHDRAWAL_FEE_PER_BLOCK_MINOR = 2_000 as Minor;

/**
 * Default partial-block behavior.
 *
 * 13_ §13 asks for this to be confirmed rather than assumed, and the approved
 * prototype settles it: `assets/digital.js` calcFee computes SLAB fees as
 *
 *     Math.ceil(amount / blockSize) * feePerBlock
 *
 * i.e. every started block is charged in full (PKR 1,500 sent -> 2 blocks -> PKR 20),
 * with seeded defaults of 10/1,000 sent and 20/1,000 received. `per_started_block`
 * therefore reproduces approved behavior. It remains a seeded rule value that is
 * changeable per provider without a code change (see docs/ASSUMPTIONS.md ASM-003).
 */
export const DEFAULT_PARTIAL_BLOCK_MODE: FeeCalculationMode =
  "per_started_block";

/**
 * Prototype fee-mode names mapped to production modes.
 *
 * The prototype offers three modes; 13_ §13 requires four. Note the naming trap:
 * the prototype's "PROPORTIONAL" is a percentage of the principal, NOT a pro-rated
 * block, so it maps to `percentage`. `proportional_block` is genuinely new.
 */
export const PROTOTYPE_FEE_MODE_MAP: Readonly<
  Record<string, FeeCalculationMode>
> = Object.freeze({
  SLAB: "per_started_block",
  PROPORTIONAL: "percentage",
  FLAT: "fixed",
});

function requirePositiveBlock(rule: FeeRule): Minor {
  const block = rule.blockAmountMinor;
  if (block === undefined || block <= 0) {
    throw new FeeRuleError(
      `Fee mode "${rule.mode}" requires a positive blockAmountMinor`,
    );
  }
  return block;
}

function requireFeePerBlock(rule: FeeRule): Minor {
  const fee = rule.feePerBlockMinor;
  if (fee === undefined || fee < 0) {
    throw new FeeRuleError(
      `Fee mode "${rule.mode}" requires a non-negative feePerBlockMinor`,
    );
  }
  return fee;
}

/**
 * Calculate the customer fee for a principal amount under a fee rule.
 *
 * `principalMinor` must be >= 0. Rounding defaults to half_up.
 */
export function calculateFee(
  principalMinor: Minor,
  rule: FeeRule,
): FeeCalculationResult {
  if (principalMinor < 0) {
    throw new FeeRuleError(`Principal cannot be negative: ${principalMinor}`);
  }

  const rounding: RoundingMode = rule.rounding ?? "half_up";
  let rawFee: Minor;
  let blocksCharged: number | null = null;
  let explanation: string;

  switch (rule.mode) {
    case "fixed": {
      rawFee = requireFeePerBlock(rule);
      explanation = `Flat fee of ${formatMinorForExplanation(rawFee)}`;
      break;
    }

    case "per_started_block": {
      const block = requirePositiveBlock(rule);
      const feePerBlock = requireFeePerBlock(rule);
      blocksCharged =
        principalMinor === 0 ? 0 : Math.ceil(principalMinor / block);
      rawFee = toMinor(blocksCharged * feePerBlock, "fee");
      explanation =
        `${blocksCharged} started block${blocksCharged === 1 ? "" : "s"}` +
        ` x ${formatMinorForExplanation(feePerBlock)} per ${formatMinorForExplanation(block)}`;
      break;
    }

    case "proportional_block": {
      const block = requirePositiveBlock(rule);
      const feePerBlock = requireFeePerBlock(rule);
      const exactBlocks = principalMinor / block;
      blocksCharged = exactBlocks;
      rawFee = roundToMinor(exactBlocks * feePerBlock, rounding);
      explanation =
        `${exactBlocks.toFixed(3)} block${exactBlocks === 1 ? "" : "s"} (pro-rata)` +
        ` x ${formatMinorForExplanation(feePerBlock)} per ${formatMinorForExplanation(block)}`;
      break;
    }

    case "percentage": {
      const rate = rule.percentageRate;
      if (rate === undefined || !Number.isFinite(rate) || rate < 0) {
        throw new FeeRuleError(
          'Fee mode "percentage" requires a non-negative percentageRate',
        );
      }
      rawFee = roundToMinor((principalMinor * rate) / 100, rounding);
      explanation = `${rate}% of ${formatMinorForExplanation(principalMinor)}`;
      break;
    }

    default: {
      const exhaustive: never = rule.mode;
      throw new FeeRuleError(`Unsupported fee mode: ${String(exhaustive)}`);
    }
  }

  let feeMinor = rawFee;
  let clampedByMin = false;
  let clampedByMax = false;

  if (rule.minFeeMinor !== undefined && feeMinor < rule.minFeeMinor) {
    feeMinor = rule.minFeeMinor;
    clampedByMin = true;
    explanation += `; raised to minimum fee ${formatMinorForExplanation(rule.minFeeMinor)}`;
  }
  if (rule.maxFeeMinor !== undefined && feeMinor > rule.maxFeeMinor) {
    feeMinor = rule.maxFeeMinor;
    clampedByMax = true;
    explanation += `; capped at maximum fee ${formatMinorForExplanation(rule.maxFeeMinor)}`;
  }

  return {
    feeMinor,
    rawFeeMinor: rawFee,
    blocksCharged,
    clampedByMin,
    clampedByMax,
    explanation,
  };
}

/**
 * Service profit for one external transaction (13_ §13).
 *
 *     service_profit = customer_fee - provider_charge - other_direct_expense
 *
 * The principal is deliberately absent: it is customer money passing through and
 * is never revenue. May be negative when the provider charges more than the
 * customer was billed; that is a real (and reportable) loss, not an error.
 */
export function calculateServiceProfit(input: {
  customerFeeMinor: Minor;
  providerChargeMinor?: Minor | undefined;
  otherDirectExpenseMinor?: Minor | undefined;
}): Minor {
  const providerCharge = input.providerChargeMinor ?? zero();
  const otherExpense = input.otherDirectExpenseMinor ?? zero();
  return subtract(
    subtract(input.customerFeeMinor, providerCharge),
    otherExpense,
  );
}

/**
 * Net cash the drawer moves by for an external transaction.
 *
 * 13_ §13: "Cash direction must be explicit and configurable because provider
 * workflows may differ. Do not assume every send or withdrawal affects physical
 * cash the same way." So this returns the magnitude only; the caller supplies the
 * configured direction and applies the sign.
 */
export function calculateCashImpactMagnitude(input: {
  principalMinor: Minor;
  customerFeeMinor: Minor;
  principalAffectsCash: boolean;
  feeAffectsCash: boolean;
}): Minor {
  let total = zero();
  if (input.principalAffectsCash) total = add(total, input.principalMinor);
  if (input.feeAffectsCash) total = add(total, input.customerFeeMinor);
  return total;
}

/** Local formatter — avoids importing display code into the calculation path. */
function formatMinorForExplanation(amount: Minor): string {
  const negative = amount < 0;
  const digits = Math.abs(amount).toString().padStart(3, "0");
  const whole = digits.slice(0, digits.length - 2);
  const fraction = digits.slice(digits.length - 2);
  return `${negative ? "-" : ""}PKR ${Number(whole).toLocaleString("en-PK")}.${fraction}`;
}
