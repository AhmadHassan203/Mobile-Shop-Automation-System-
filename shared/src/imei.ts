/**
 * IMEI / serial normalization and validation.
 *
 * Rule 05_RULES.md §1.1: every serialized device must have a unique IMEI or serial
 * before becoming saleable. Uniqueness is enforced on the NORMALIZED value, so that
 * "356938-035643809" and "356938035643809" cannot both enter stock as separate phones.
 */

/** A GSM IMEI is 15 digits: 14 identity digits + 1 Luhn check digit. */
export const IMEI_LENGTH = 15;

/** IMEISV (software version) variants are 16 digits and carry no check digit. */
export const IMEISV_LENGTH = 16;

export type ImeiValidationCode =
  | 'EMPTY'
  | 'NON_DIGIT'
  | 'BAD_LENGTH'
  | 'CHECKSUM_FAILED'
  | 'ALL_SAME_DIGIT';

export interface ImeiValidationResult {
  readonly valid: boolean;
  readonly normalized: string | null;
  readonly code?: ImeiValidationCode;
  readonly message?: string;
}

/**
 * Normalize an IMEI for storage and uniqueness comparison.
 *
 * Strips every character that is not a digit — staff paste values containing
 * spaces, hyphens, dots and invisible characters copied from spreadsheets or
 * WhatsApp. Returns null when nothing usable remains.
 */
export function normalizeImei(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = raw.replace(/\D+/g, '');
  return digits.length === 0 ? null : digits;
}

/**
 * Normalize a serial number for storage and uniqueness comparison.
 *
 * Serials are alphanumeric, so unlike IMEI we keep letters — uppercased, with
 * separators and whitespace removed, so "sn-abc 123" and "SNABC123" collide.
 */
export function normalizeSerial(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.replace(/[^0-9A-Za-z]+/g, '').toUpperCase();
  return cleaned.length === 0 ? null : cleaned;
}

/**
 * Luhn checksum, used by IMEI's 15th digit.
 * Doubles every second digit from the right; digits above 9 have their digits summed.
 */
export function luhnChecksumValid(digits: string): boolean {
  if (digits.length === 0 || /\D/.test(digits)) return false;

  let total = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const char = digits[i];
    if (char === undefined) return false;
    let value = char.charCodeAt(0) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    total += value;
    double = !double;
  }
  return total % 10 === 0;
}

/** Compute the Luhn check digit for the first 14 digits of an IMEI. */
export function computeImeiCheckDigit(first14: string): number {
  if (first14.length !== 14 || /\D/.test(first14)) {
    throw new Error('computeImeiCheckDigit expects exactly 14 digits');
  }
  let total = 0;
  let double = true; // position 15 is the check digit, so digit 14 is doubled
  for (let i = first14.length - 1; i >= 0; i -= 1) {
    const char = first14[i];
    if (char === undefined) throw new Error('Unexpected undefined digit');
    let value = char.charCodeAt(0) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    total += value;
    double = !double;
  }
  return (10 - (total % 10)) % 10;
}

/**
 * Validate an IMEI.
 *
 * `requireChecksum` defaults to true. It can be relaxed per-configuration because
 * a small number of legitimate devices (and most test/demo handsets) carry IMEIs
 * that fail Luhn; blocking receiving outright would stop real stock entering the
 * system. When relaxed, the caller is expected to raise a data-quality exception
 * rather than silently accept.
 */
export function validateImei(
  raw: string | null | undefined,
  options: { requireChecksum?: boolean; allowImeiSv?: boolean } = {},
): ImeiValidationResult {
  const { requireChecksum = true, allowImeiSv = false } = options;

  const normalized = normalizeImei(raw);
  if (normalized === null) {
    return { valid: false, normalized: null, code: 'EMPTY', message: 'IMEI is empty' };
  }

  const original = String(raw ?? '');
  if (/[A-Za-z]/.test(original)) {
    return {
      valid: false,
      normalized,
      code: 'NON_DIGIT',
      message: 'IMEI must contain digits only',
    };
  }

  const allowedLengths = allowImeiSv ? [IMEI_LENGTH, IMEISV_LENGTH] : [IMEI_LENGTH];
  if (!allowedLengths.includes(normalized.length)) {
    return {
      valid: false,
      normalized,
      code: 'BAD_LENGTH',
      message: `IMEI must be ${allowedLengths.join(' or ')} digits, received ${normalized.length}`,
    };
  }

  // 000000000000000 and similar placeholders pass Luhn but are never real devices.
  if (/^(\d)\1+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      code: 'ALL_SAME_DIGIT',
      message: 'IMEI cannot be a single repeated digit',
    };
  }

  if (requireChecksum && normalized.length === IMEI_LENGTH && !luhnChecksumValid(normalized)) {
    return {
      valid: false,
      normalized,
      code: 'CHECKSUM_FAILED',
      message: 'IMEI checksum (Luhn) failed',
    };
  }

  return { valid: true, normalized };
}

export interface BulkImeiRow {
  readonly line: number;
  readonly raw: string;
  readonly normalized: string | null;
  readonly valid: boolean;
  readonly code?: ImeiValidationCode | 'DUPLICATE_IN_BATCH';
  readonly message?: string;
}

export interface BulkImeiResult {
  readonly rows: readonly BulkImeiRow[];
  readonly validNormalized: readonly string[];
  readonly duplicatesInBatch: readonly string[];
  readonly hasErrors: boolean;
}

/**
 * Parse pasted multi-line IMEI input (13_ §10: "bulk IMEI entry using spreadsheet
 * rows and multi-line paste with pre-save duplicate validation").
 *
 * Detects duplicates WITHIN the pasted batch. Duplicates against existing stock
 * are a database-level concern and are checked inside the receiving transaction.
 */
export function parseBulkImeiInput(
  input: string,
  options: { requireChecksum?: boolean; allowImeiSv?: boolean } = {},
): BulkImeiResult {
  const lines = input
    .split(/\r?\n|,|;|\t/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const seen = new Map<string, number>();
  const duplicates = new Set<string>();
  const rows: BulkImeiRow[] = [];

  lines.forEach((raw, index) => {
    const result = validateImei(raw, options);
    const line = index + 1;

    if (result.valid && result.normalized !== null) {
      const firstSeenAt = seen.get(result.normalized);
      if (firstSeenAt !== undefined) {
        duplicates.add(result.normalized);
        rows.push({
          line,
          raw,
          normalized: result.normalized,
          valid: false,
          code: 'DUPLICATE_IN_BATCH',
          message: `Duplicate of line ${firstSeenAt}`,
        });
        return;
      }
      seen.set(result.normalized, line);
      rows.push({ line, raw, normalized: result.normalized, valid: true });
      return;
    }

    rows.push({
      line,
      raw,
      normalized: result.normalized,
      valid: false,
      ...(result.code === undefined ? {} : { code: result.code }),
      ...(result.message === undefined ? {} : { message: result.message }),
    });
  });

  return {
    rows,
    validNormalized: rows.filter((r) => r.valid && r.normalized !== null).map((r) => r.normalized as string),
    duplicatesInBatch: [...duplicates],
    hasErrors: rows.some((r) => !r.valid),
  };
}

/** Mask an IMEI for display in low-trust contexts: 356938035643809 -> 35693******3809 */
export function maskImei(imei: string): string {
  const normalized = normalizeImei(imei);
  if (normalized === null || normalized.length < 9) return '***';
  const head = normalized.slice(0, 5);
  const tail = normalized.slice(-4);
  return `${head}${'*'.repeat(normalized.length - 9)}${tail}`;
}
