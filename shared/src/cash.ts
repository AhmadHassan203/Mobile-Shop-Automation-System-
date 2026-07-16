import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { PAGINATION } from "./constants";
import { CASH_SESSION_STATUSES } from "./enums";

/**
 * Cash-drawer session contracts (13_ §14).
 *
 * A session opens with a counted opening float and closes with a counted amount
 * the server reconciles against the expected drawer balance. The expected and
 * variance amounts are always computed on the server; a request names only its
 * counted cash and the optimistic version it is acting on. Amounts are exact
 * integer minor units.
 */

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

const versionInputSchema = z
  .number()
  .int()
  .positive("Provide the record version you are acting on.");

const responseMoneySchema = z.number().int().safe().nonnegative();
const signedResponseMoneySchema = z.number().int().safe();
const responseVersionSchema = z.number().int().positive();
const responseTimestampSchema = z.iso.datetime();

export const CASH_SESSION_CONTRACT_LIMITS = Object.freeze({
  SESSION_NUMBER_LENGTH: 100,
  NOTE_LENGTH: 500,
});

// =============================================================================
// Inputs
// =============================================================================

export const OpenCashSessionInputSchema = z
  .object({
    openingCashMinor: nonnegativeMoneyInput,
  })
  .strict();
export type OpenCashSessionInput = z.input<typeof OpenCashSessionInputSchema>;
export type OpenCashSessionData = z.output<typeof OpenCashSessionInputSchema>;

export const CloseCashSessionInputSchema = z
  .object({
    version: versionInputSchema,
    countedCashMinor: nonnegativeMoneyInput,
    note: nullableInputText(CASH_SESSION_CONTRACT_LIMITS.NOTE_LENGTH).default(
      null,
    ),
  })
  .strict();
export type CloseCashSessionInput = z.input<typeof CloseCashSessionInputSchema>;
export type CloseCashSessionData = z.output<typeof CloseCashSessionInputSchema>;

// =============================================================================
// Responses
// =============================================================================

export const CashSessionCashierSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string().min(1).max(200),
  })
  .strict();
export type CashSessionCashier = z.infer<typeof CashSessionCashierSchema>;

export const CashSessionSchema = z
  .object({
    id: z.uuid(),
    sessionNumber: z
      .string()
      .min(1)
      .max(CASH_SESSION_CONTRACT_LIMITS.SESSION_NUMBER_LENGTH),
    status: z.enum(CASH_SESSION_STATUSES),
    openingCashMinor: responseMoneySchema,
    /** Present once the session is closed; the expected drawer balance at close. */
    expectedCashMinor: responseMoneySchema.nullable(),
    countedCashMinor: responseMoneySchema.nullable(),
    /** counted - expected. Signed: a shortfall is negative. Null while open. */
    varianceMinor: signedResponseMoneySchema.nullable(),
    openedAt: responseTimestampSchema,
    closedAt: responseTimestampSchema.nullable(),
    cashier: CashSessionCashierSchema,
    version: responseVersionSchema,
  })
  .strict()
  .superRefine((session, context) => {
    const closed =
      session.closedAt !== null ||
      session.countedCashMinor !== null ||
      session.expectedCashMinor !== null ||
      session.varianceMinor !== null;
    const fullyClosed =
      session.closedAt !== null &&
      session.countedCashMinor !== null &&
      session.expectedCashMinor !== null &&
      session.varianceMinor !== null;
    if (closed && !fullyClosed) {
      context.addIssue({
        code: "custom",
        message: "Closing evidence must be complete and consistent.",
        path: ["varianceMinor"],
      });
      return;
    }
    if (
      fullyClosed &&
      session.varianceMinor !==
        (session.countedCashMinor ?? 0) - (session.expectedCashMinor ?? 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Variance must equal counted cash minus expected cash.",
        path: ["varianceMinor"],
      });
    }
  });
export type CashSession = z.infer<typeof CashSessionSchema>;

export const CashSessionSummarySchema = z
  .object({
    id: z.uuid(),
    sessionNumber: z
      .string()
      .min(1)
      .max(CASH_SESSION_CONTRACT_LIMITS.SESSION_NUMBER_LENGTH),
    status: z.enum(CASH_SESSION_STATUSES),
    openingCashMinor: responseMoneySchema,
    varianceMinor: signedResponseMoneySchema.nullable(),
    openedAt: responseTimestampSchema,
    closedAt: responseTimestampSchema.nullable(),
    cashier: CashSessionCashierSchema,
    version: responseVersionSchema,
  })
  .strict();
export type CashSessionSummary = z.infer<typeof CashSessionSummarySchema>;

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

export const CashSessionListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    status: z.enum(CASH_SESSION_STATUSES).optional(),
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
export type CashSessionListQueryInput = z.input<
  typeof CashSessionListQuerySchema
>;
export type CashSessionListQuery = z.output<typeof CashSessionListQuerySchema>;

export const CashSessionPageSchema = createPageEnvelopeSchema(
  CashSessionSummarySchema,
);
export type CashSessionPage = z.infer<typeof CashSessionPageSchema>;
