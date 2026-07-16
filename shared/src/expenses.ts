import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import { PAYMENT_METHODS } from "./enums";

/**
 * Operating-expense contracts.
 *
 * An expense is an append-only outflow of shop money against a category. Tenant,
 * branch, actor, expense number and business date never cross the input
 * boundary; the server allocates the number and derives the business date on
 * posting. Every amount is an exact integer number of minor units.
 */

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "supplies",
  "transport",
  "marketing",
  "maintenance",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CONTRACT_LIMITS = Object.freeze({
  EXPENSE_NUMBER_LENGTH: 100,
  NOTE_LENGTH: 500,
});

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

const requiredInputText = (maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().min(1).max(maximum));

const positiveMoneyInput = z
  .number()
  .int("Amount must be an integer number of minor units.")
  .safe("Amount is outside the safe integer range.")
  .positive();

const responseMoneySchema = z.number().int().safe().nonnegative();
const responseTimestampSchema = z.iso.datetime();

// =============================================================================
// Inputs
// =============================================================================

export const CreateExpenseInputSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES),
    amountMinor: positiveMoneyInput,
    paymentMethod: z.enum(PAYMENT_METHODS),
    note: requiredInputText(EXPENSE_CONTRACT_LIMITS.NOTE_LENGTH),
    /** When the money was actually spent; defaults to the posting time server-side. */
    spentAt: z.iso.datetime().optional(),
  })
  .strict();
export type CreateExpenseInput = z.input<typeof CreateExpenseInputSchema>;
export type CreateExpenseData = z.output<typeof CreateExpenseInputSchema>;

// =============================================================================
// Responses
// =============================================================================

export const ExpenseSchema = z
  .object({
    id: z.uuid(),
    expenseNumber: z
      .string()
      .min(1)
      .max(EXPENSE_CONTRACT_LIMITS.EXPENSE_NUMBER_LENGTH),
    category: z.enum(EXPENSE_CATEGORIES),
    amountMinor: responseMoneySchema.positive(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    note: z.string().min(1).max(EXPENSE_CONTRACT_LIMITS.NOTE_LENGTH),
    businessDate: z.iso.date(),
    spentAt: responseTimestampSchema,
    createdAt: responseTimestampSchema,
  })
  .strict();
export type Expense = z.infer<typeof ExpenseSchema>;

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

export const ExpenseListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchSchema,
    category: z.enum(EXPENSE_CATEGORIES).optional(),
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
export type ExpenseListQueryInput = z.input<typeof ExpenseListQuerySchema>;
export type ExpenseListQuery = z.output<typeof ExpenseListQuerySchema>;

export const ExpensePageSchema = createPageEnvelopeSchema(ExpenseSchema);
export type ExpensePage = z.infer<typeof ExpensePageSchema>;
