/**
 * Money handling for MobileShop OS.
 *
 * Non-negotiable rule (05_RULES.md §7, 13_ §23.11): money is stored and computed
 * as INTEGER MINOR UNITS (paisa for PKR). Floating point never touches a money
 * value, because binary floats cannot represent decimal fractions exactly and
 * the resulting drift corrupts COGS, cash reconciliation and profit.
 */

/** Integer minor units (e.g. paisa). Branded so a raw number cannot be passed by mistake. */
export type Minor = number & { readonly __brand: "MinorUnits" };

export const CURRENCY_PKR = "PKR" as const;

/** Minor units per major unit, keyed by ISO-4217 code. PKR: 1 rupee = 100 paisa. */
export const CURRENCY_MINOR_EXPONENT: Readonly<Record<string, number>> =
  Object.freeze({
    PKR: 2,
  });

/** Largest integer that is exactly representable; guards against silent precision loss. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${label} must be an integer number of minor units, received ${value}`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      `${label} exceeds the safe integer range (${MAX_SAFE})`,
    );
  }
}

/** Assert-and-brand a raw integer as minor units. */
export function toMinor(value: number, label = "amount"): Minor {
  assertSafeInteger(value, label);
  return value as Minor;
}

export function zero(): Minor {
  return 0 as Minor;
}

/**
 * Convert a major-unit amount (rupees) to minor units (paisa).
 *
 * Accepts a string to preserve exactness ("1234.56"). A number input is
 * permitted for ergonomics but is rejected when it carries more decimal places
 * than the currency supports, since such a value has already lost precision.
 */
export function fromMajor(
  value: string | number,
  currency: string = CURRENCY_PKR,
): Minor {
  const exponent = CURRENCY_MINOR_EXPONENT[currency];
  if (exponent === undefined) {
    throw new MoneyError(`Unknown currency: ${currency}`);
  }

  const text = typeof value === "number" ? String(value) : value.trim();
  if (text === "") {
    throw new MoneyError("Empty money value");
  }

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new MoneyError(`Invalid money value: ${text}`);
  }

  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > exponent) {
    throw new MoneyError(
      `Money value ${text} has more than ${exponent} decimal places for ${currency}`,
    );
  }

  const padded = fraction.padEnd(exponent, "0");
  const combined = `${whole}${padded}`;
  const magnitude = Number(combined);
  assertSafeInteger(magnitude, `money value ${text}`);

  return (sign === "-" ? -magnitude : magnitude) as Minor;
}

/** Render minor units as a plain decimal string ("123456" -> "1234.56"). No grouping, no symbol. */
export function toMajorString(
  amount: Minor,
  currency: string = CURRENCY_PKR,
): string {
  const exponent = CURRENCY_MINOR_EXPONENT[currency];
  if (exponent === undefined) {
    throw new MoneyError(`Unknown currency: ${currency}`);
  }
  const negative = amount < 0;
  const digits = Math.abs(amount)
    .toString()
    .padStart(exponent + 1, "0");
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  const body = exponent === 0 ? whole : `${whole}.${fraction}`;
  return negative ? `-${body}` : body;
}

export function add(a: Minor, b: Minor): Minor {
  const sum = a + b;
  assertSafeInteger(sum, "sum");
  return sum as Minor;
}

export function subtract(a: Minor, b: Minor): Minor {
  const difference = a - b;
  assertSafeInteger(difference, "difference");
  return difference as Minor;
}

export function sum(amounts: readonly Minor[]): Minor {
  return amounts.reduce<Minor>((acc, value) => add(acc, value), zero());
}

export function negate(amount: Minor): Minor {
  return -(amount as number) as Minor;
}

export function isZero(amount: Minor): boolean {
  return amount === 0;
}

export function compare(a: Minor, b: Minor): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Multiply money by an integer quantity. Exact — the common POS line-total case.
 */
export function multiplyByQuantity(amount: Minor, quantity: number): Minor {
  if (!Number.isInteger(quantity)) {
    throw new MoneyError(`Quantity must be an integer, received ${quantity}`);
  }
  const product = amount * quantity;
  assertSafeInteger(product, "product");
  return product as Minor;
}

export type RoundingMode = "half_up" | "half_even" | "up" | "down";

/**
 * Round a non-integer intermediate to whole minor units.
 * `half_up` is the default: it matches how a Pakistani shop counter rounds cash
 * and is what staff expect to see on a receipt.
 */
export function roundToMinor(
  value: number,
  mode: RoundingMode = "half_up",
): Minor {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Cannot round non-finite value: ${value}`);
  }
  let rounded: number;
  switch (mode) {
    case "up":
      rounded = Math.ceil(value);
      break;
    case "down":
      rounded = Math.floor(value);
      break;
    case "half_even": {
      const floor = Math.floor(value);
      const diff = value - floor;
      if (diff > 0.5) rounded = floor + 1;
      else if (diff < 0.5) rounded = floor;
      else rounded = floor % 2 === 0 ? floor : floor + 1;
      break;
    }
    case "half_up":
    default:
      // Math.round is asymmetric for negatives (-0.5 -> -0). Round the magnitude
      // and restore the sign so -2.5 becomes -3, matching "half away from zero".
      rounded = Math.sign(value) * Math.round(Math.abs(value));
      break;
  }
  return toMinor(rounded, "rounded value");
}

/**
 * Apply a percentage (e.g. discount or tax) to a money amount.
 * `percent` is a decimal percentage such as 17 for 17%.
 */
export function percentOf(
  amount: Minor,
  percent: number,
  mode: RoundingMode = "half_up",
): Minor {
  if (!Number.isFinite(percent)) {
    throw new MoneyError(`Percent must be finite, received ${percent}`);
  }
  return roundToMinor((amount * percent) / 100, mode);
}

/**
 * Split an amount across weights without losing or inventing a single paisa.
 *
 * Used for landed-cost allocation across received units and for proportional
 * splits. Uses the largest-remainder method: floor every share, then hand the
 * leftover minor units to the entries with the largest fractional remainders.
 * The returned shares always sum exactly to `amount`.
 */
export function allocateByWeights(
  amount: Minor,
  weights: readonly number[],
): Minor[] {
  if (weights.length === 0) {
    throw new MoneyError("Cannot allocate across zero weights");
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new MoneyError("Allocation weights must be finite and non-negative");
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) {
    throw new MoneyError("Allocation weights must sum to a positive value");
  }

  const sign = amount < 0 ? -1 : 1;
  const magnitude = Math.abs(amount);

  const exact = weights.map((w) => (magnitude * w) / totalWeight);
  const floored = exact.map((v) => Math.floor(v));
  let remainder = magnitude - floored.reduce((acc, v) => acc + v, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const shares = [...floored];
  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    const target = order[i];
    if (target === undefined) break;
    shares[target.index] = (shares[target.index] ?? 0) + 1;
    remainder -= 1;
  }

  return shares.map((v) => toMinor(sign * v, "allocated share"));
}

/** Split evenly across `parts`, distributing any remainder one paisa at a time. */
export function allocateEvenly(amount: Minor, parts: number): Minor[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`Parts must be a positive integer, received ${parts}`);
  }
  return allocateByWeights(amount, new Array<number>(parts).fill(1));
}

/** Format for display, e.g. "PKR 1,234.56". Display only — never for storage or comparison. */
export function formatMoney(
  amount: Minor,
  currency: string = CURRENCY_PKR,
  options: { withSymbol?: boolean; locale?: string } = {},
): string {
  const { withSymbol = true, locale = "en-PK" } = options;
  const exponent = CURRENCY_MINOR_EXPONENT[currency] ?? 2;
  const major = toMajorString(amount, currency);
  const negative = major.startsWith("-");
  const [whole = "0", fraction] = (negative ? major.slice(1) : major).split(
    ".",
  );
  const grouped = Number(whole).toLocaleString(locale, { useGrouping: true });
  const body =
    exponent === 0
      ? grouped
      : `${grouped}.${fraction ?? "".padEnd(exponent, "0")}`;
  const signed = negative ? `-${body}` : body;
  return withSymbol ? `${currency} ${signed}` : signed;
}
