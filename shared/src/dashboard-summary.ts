import { z } from "zod";

/**
 * Daily financial summary contract.
 *
 * A single reconciled roll-up for one business day, week or month: sales
 * revenue and COGS produce gross profit; service profit from external
 * transactions is added and expenses subtracted to give an estimated net
 * profit. Every amount is an exact integer number of minor units. "Estimated"
 * is deliberate — this is an operational roll-up, not the posted ledger.
 */

export const FINANCIAL_SUMMARY_PERIODS = ["day", "week", "month"] as const;
export type FinancialSummaryPeriod =
  (typeof FINANCIAL_SUMMARY_PERIODS)[number];

const responseMoneySchema = z.number().int().safe().nonnegative();
const signedResponseMoneySchema = z.number().int().safe();
const responseCountSchema = z.number().int().safe().nonnegative();

export const DailyFinancialSummaryQuerySchema = z
  .object({
    period: z.enum(FINANCIAL_SUMMARY_PERIODS).default("day"),
    /** Anchor date inside the period; defaults to the current business date. */
    date: z.iso.date().optional(),
  })
  .strict();
export type DailyFinancialSummaryQueryInput = z.input<
  typeof DailyFinancialSummaryQuerySchema
>;
export type DailyFinancialSummaryQuery = z.output<
  typeof DailyFinancialSummaryQuerySchema
>;

export const DailyFinancialSummarySchema = z
  .object({
    period: z.enum(FINANCIAL_SUMMARY_PERIODS),
    /** Inclusive business-date range the summary covers. */
    from: z.iso.date(),
    to: z.iso.date(),
    salesRevenueMinor: responseMoneySchema,
    /** Order-level discounts applied to posted sales (contra-revenue memo). */
    discountsMinor: responseMoneySchema,
    /** Posted customer refunds in the period (contra-revenue memo). */
    returnsMinor: responseMoneySchema,
    /** Sales revenue net of posted returns; signed (a heavy-refund day can be negative). */
    netSalesMinor: signedResponseMoneySchema,
    cogsMinor: responseMoneySchema,
    grossProfitMinor: signedResponseMoneySchema,
    serviceProfitMinor: signedResponseMoneySchema,
    expensesMinor: responseMoneySchema,
    estimatedNetProfitMinor: signedResponseMoneySchema,
    salesCount: responseCountSchema,
    externalTxnCount: responseCountSchema,
  })
  .strict()
  .superRefine((summary, context) => {
    if (summary.from > summary.to) {
      context.addIssue({
        code: "custom",
        message: "The start date must not be after the end date.",
        path: ["from"],
      });
    }
    if (
      summary.grossProfitMinor !==
      summary.salesRevenueMinor - summary.cogsMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Gross profit must equal sales revenue minus COGS.",
        path: ["grossProfitMinor"],
      });
    }
    if (summary.netSalesMinor !== summary.salesRevenueMinor - summary.returnsMinor) {
      context.addIssue({
        code: "custom",
        message: "Net sales must equal sales revenue minus returns.",
        path: ["netSalesMinor"],
      });
    }
    if (
      summary.estimatedNetProfitMinor !==
      summary.grossProfitMinor +
        summary.serviceProfitMinor -
        summary.expensesMinor
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Estimated net profit must equal gross profit plus service profit less expenses.",
        path: ["estimatedNetProfitMinor"],
      });
    }
  });
export type DailyFinancialSummary = z.infer<
  typeof DailyFinancialSummarySchema
>;
