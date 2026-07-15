/**
 * Business date/time helpers.
 *
 * Rule 05_RULES.md §9: "Use UTC-consistent storage and Asia/Karachi display."
 *
 * Every timestamp is stored as UTC. Every *business day* boundary (daily sales,
 * cash session closing, aging) is computed in Asia/Karachi. Getting this wrong
 * puts an evening sale on the wrong day's report, which is exactly the kind of
 * silent reconciliation error the system exists to prevent.
 *
 * Pakistan observes UTC+05:00 year-round with no DST, but offsets are resolved
 * through the IANA database rather than hardcoded, so a future rule change does
 * not require a code change.
 */

export const BUSINESS_TIMEZONE = 'Asia/Karachi';

/** Calendar date in the business timezone, formatted YYYY-MM-DD. */
export type BusinessDate = string & { readonly __brand: 'BusinessDate' };

const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export class DateTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateTimeError';
  }
}

/** The business-timezone calendar date for an instant. */
export function toBusinessDate(instant: Date = new Date()): BusinessDate {
  if (Number.isNaN(instant.getTime())) throw new DateTimeError('Invalid date');
  return DATE_PARTS_FORMATTER.format(instant) as BusinessDate;
}

export function isBusinessDate(value: string): value is BusinessDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function parseBusinessDate(value: string): BusinessDate {
  if (!isBusinessDate(value)) {
    throw new DateTimeError(`Invalid business date (expected YYYY-MM-DD): ${value}`);
  }
  return value;
}

/**
 * UTC offset in minutes for the business timezone at a given instant.
 * Derived from the IANA database rather than assumed.
 */
export function businessOffsetMinutes(instant: Date = new Date()): number {
  // Format the instant as if it were UTC wall-clock in the business zone, then
  // measure how far that wall-clock time sits from the true UTC instant.
  const parts = DATE_TIME_FORMATTER.formatToParts(instant);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (part === undefined) throw new DateTimeError(`Missing date part: ${type}`);
    return Number(part.value);
  };
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour') % 24,
    lookup('minute'),
    lookup('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The UTC instant at which a business day starts (00:00:00.000 local). */
export function businessDayStartUtc(date: BusinessDate): Date {
  const naive = new Date(`${date}T00:00:00.000Z`);
  // Subtract the offset to convert local wall-clock to UTC, then re-resolve in
  // case the first guess landed on the far side of an offset change.
  const firstGuess = new Date(naive.getTime() - businessOffsetMinutes(naive) * 60_000);
  const corrected = new Date(naive.getTime() - businessOffsetMinutes(firstGuess) * 60_000);
  return corrected;
}

/** The UTC instant at which a business day ends (exclusive: next day's 00:00). */
export function businessDayEndUtc(date: BusinessDate): Date {
  return businessDayStartUtc(addBusinessDays(date, 1));
}

/** Half-open UTC range [start, end) covering one business day — safe for SQL BETWEEN-style filters. */
export function businessDayRangeUtc(date: BusinessDate): { start: Date; end: Date } {
  return { start: businessDayStartUtc(date), end: businessDayEndUtc(date) };
}

export function addBusinessDays(date: BusinessDate, days: number): BusinessDate {
  if (!Number.isInteger(days)) throw new DateTimeError('days must be an integer');
  const base = new Date(`${date}T12:00:00.000Z`); // midday avoids any DST edge
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10) as BusinessDate;
}

/** Whole days from `from` to `to` (negative when `to` precedes `from`). */
export function businessDaysBetween(from: BusinessDate, to: BusinessDate): number {
  const a = Date.parse(`${from}T12:00:00.000Z`);
  const b = Date.parse(`${to}T12:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Inclusive rolling window ending on `end`, e.g. the last 30 days.
 * `days` counts the end date itself, so days=30 spans end-29 .. end.
 */
export function rollingWindow(end: BusinessDate, days: number): { from: BusinessDate; to: BusinessDate } {
  if (!Number.isInteger(days) || days <= 0) {
    throw new DateTimeError(`days must be a positive integer, received ${days}`);
  }
  return { from: addBusinessDays(end, -(days - 1)), to: end };
}

/** Format an instant for display in the business timezone. */
export function formatBusinessDateTime(
  instant: Date,
  options: { withSeconds?: boolean } = {},
): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(options.withSeconds === true ? { second: '2-digit' as const } : {}),
    hour12: true,
  });
  return formatter.format(instant);
}

/** Age in whole days of an instant, measured in business days. Used for stock aging. */
export function ageInDays(since: Date, now: Date = new Date()): number {
  return businessDaysBetween(toBusinessDate(since), toBusinessDate(now));
}
