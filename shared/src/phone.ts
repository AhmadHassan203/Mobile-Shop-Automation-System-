/**
 * Pakistan phone number normalization.
 *
 * 01_PRD.md §7 requires Pakistani phone number formatting. Customer lookup at the
 * counter must succeed regardless of how staff typed the number, so uniqueness and
 * search both run against the normalized E.164 form:
 *
 *   0300-1234567, 0300 1234567, +92 300 1234567, 92-300-1234567, 3001234567
 *     -> all normalize to +923001234567
 */

export const PAKISTAN_COUNTRY_CODE = '92';

/** Pakistani mobile numbers are 10 national digits beginning with 3 (e.g. 3001234567). */
const NATIONAL_MOBILE_LENGTH = 10;

export interface PhoneNormalizationResult {
  readonly valid: boolean;
  /** E.164 form, e.g. "+923001234567". Null when the input cannot be normalized. */
  readonly normalized: string | null;
  /** National form for display, e.g. "0300-1234567". */
  readonly national: string | null;
  readonly reason?: string;
}

/**
 * Normalize a Pakistani phone number to E.164.
 *
 * Landlines and short codes are not accepted as customer contact numbers, since
 * follow-up (demand capture, WhatsApp receipts) targets mobiles. Callers needing
 * to store a landline should use a separate free-text field.
 */
export function normalizePakistanPhone(raw: string | null | undefined): PhoneNormalizationResult {
  if (raw === null || raw === undefined) {
    return { valid: false, normalized: null, national: null, reason: 'Phone number is empty' };
  }

  const hadPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D+/g, '');

  if (digits.length === 0) {
    return { valid: false, normalized: null, national: null, reason: 'Phone number is empty' };
  }

  // 00 92 ... international prefix
  if (digits.startsWith('00')) digits = digits.slice(2);
  // 92 300 1234567 (with or without a leading +)
  if (digits.startsWith(PAKISTAN_COUNTRY_CODE) && digits.length > NATIONAL_MOBILE_LENGTH) {
    digits = digits.slice(PAKISTAN_COUNTRY_CODE.length);
  } else if (hadPlus && !digits.startsWith(PAKISTAN_COUNTRY_CODE)) {
    return {
      valid: false,
      normalized: null,
      national: null,
      reason: 'Only Pakistani (+92) numbers are supported',
    };
  }
  // 0300 1234567 -> trunk prefix
  if (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length !== NATIONAL_MOBILE_LENGTH) {
    return {
      valid: false,
      normalized: null,
      national: null,
      reason: `Pakistani mobile numbers have ${NATIONAL_MOBILE_LENGTH} digits after the country code, received ${digits.length}`,
    };
  }

  if (!digits.startsWith('3')) {
    return {
      valid: false,
      normalized: null,
      national: null,
      reason: 'Pakistani mobile numbers start with 3 (e.g. 0300, 0321, 0345)',
    };
  }

  return {
    valid: true,
    normalized: `+${PAKISTAN_COUNTRY_CODE}${digits}`,
    national: `0${digits.slice(0, 3)}-${digits.slice(3)}`,
  };
}

/** Display form for a stored E.164 number. Falls back to the input when unparseable. */
export function formatPakistanPhone(e164: string): string {
  const result = normalizePakistanPhone(e164);
  return result.valid && result.national !== null ? result.national : e164;
}

/** Mask for low-trust display: +923001234567 -> 0300-***4567 */
export function maskPhone(e164: string): string {
  const result = normalizePakistanPhone(e164);
  if (!result.valid || result.national === null) return '***';
  const national = result.national.replace('-', '');
  return `${national.slice(0, 4)}-***${national.slice(-4)}`;
}
