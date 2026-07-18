import { z } from "zod";
import {
  QuickStockInInputSchema,
  QuickStockInResultSchema,
} from "./quick-stock-in";

/**
 * Bulk Stock In — the multi-row companion to Quick Stock In.
 *
 * Where Quick Stock In receives ONE product/supplier chain inside a single
 * atomic transaction, Bulk Stock In lets the shopkeeper enter MANY such rows on
 * one screen and save them together. Each row is, byte-for-byte, a Quick Stock
 * In request: this contract reuses `QuickStockInInputSchema` unchanged as the
 * per-row shape, so the server can hand every row straight to the existing
 * orchestrator without re-modelling any stock rule.
 *
 * Crucially this is NOT one giant transaction. Every row opens its own Quick
 * Stock In transaction, so the batch is BATCH-LEVEL partial success: a row that
 * fails its own validation/domain rules is reported as `failed` while the rows
 * that already committed stay committed. The response is therefore a per-row
 * report, never a single all-or-nothing result.
 *
 * Scope discipline is inherited from Quick Stock In: tenant, branch and actor
 * come from the authenticated session and never appear in the body; money is
 * always integer minor units.
 */

export const BULK_STOCK_IN_LIMITS = Object.freeze({
  /** A batch must carry at least one row. */
  MIN_ROWS: 1,
  /**
   * Upper bound on rows per batch. Each row is a full Quick Stock In
   * transaction, so this caps the work (and the lock footprint) of one request.
   */
  MAX_ROWS: 100,
});

/** The two terminal states a processed row can report. */
export const BULK_STOCK_IN_ROW_STATUSES = ["ok", "failed"] as const;
export type BulkStockInRowStatus = (typeof BULK_STOCK_IN_ROW_STATUSES)[number];

// =============================================================================
// Request — a batch is simply a list of Quick Stock In rows
// =============================================================================

/**
 * One bulk row === one Quick Stock In request. Reused verbatim so a row that
 * passes here is guaranteed to be a valid input for `QuickStockInService`.
 */
export const BulkStockInRowSchema = QuickStockInInputSchema;
export type BulkStockInRowInput = z.input<typeof BulkStockInRowSchema>;
export type BulkStockInRowData = z.output<typeof BulkStockInRowSchema>;

export const BulkStockInInputSchema = z
  .object({
    rows: z
      .array(BulkStockInRowSchema)
      .min(BULK_STOCK_IN_LIMITS.MIN_ROWS, "Add at least one row to stock in.")
      .max(
        BULK_STOCK_IN_LIMITS.MAX_ROWS,
        `A bulk stock-in cannot exceed ${BULK_STOCK_IN_LIMITS.MAX_ROWS} rows.`,
      ),
  })
  .strict();
export type BulkStockInInput = z.input<typeof BulkStockInInputSchema>;
export type BulkStockInData = z.output<typeof BulkStockInInputSchema>;

// =============================================================================
// Response — one entry per submitted row, in submission order
// =============================================================================

/**
 * The failure shape for a single row. `code` is one of the stable machine error
 * codes (kept as a plain string so a client treats an unknown code generically
 * rather than crashing); `field` is the dotted path of the offending field when
 * the domain error carried one.
 */
export const BulkStockInRowErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    field: z.string().min(1).optional(),
  })
  .strict();
export type BulkStockInRowError = z.infer<typeof BulkStockInRowErrorSchema>;

/**
 * Per-row outcome, discriminated on `status`: an `ok` row carries the full
 * Quick Stock In result it committed; a `failed` row carries the structured
 * error explaining why nothing was received for it. `index` is the row's
 * zero-based position in the submitted batch, so the client can line the
 * outcome up with the exact grid row.
 */
export const BulkStockInRowResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      index: z.number().int().nonnegative(),
      status: z.literal("ok"),
      result: QuickStockInResultSchema,
    })
    .strict(),
  z
    .object({
      index: z.number().int().nonnegative(),
      status: z.literal("failed"),
      error: BulkStockInRowErrorSchema,
    })
    .strict(),
]);
export type BulkStockInRowResult = z.infer<typeof BulkStockInRowResultSchema>;

export const BulkStockInResultSchema = z
  .object({
    rows: z.array(BulkStockInRowResultSchema),
    okCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((result, ctx) => {
    const ok = result.rows.filter((row) => row.status === "ok").length;
    const failed = result.rows.length - ok;
    if (ok !== result.okCount) {
      ctx.addIssue({
        code: "custom",
        message: "okCount must equal the number of ok rows.",
        path: ["okCount"],
      });
    }
    if (failed !== result.failedCount) {
      ctx.addIssue({
        code: "custom",
        message: "failedCount must equal the number of failed rows.",
        path: ["failedCount"],
      });
    }
    if (result.okCount + result.failedCount !== result.rows.length) {
      ctx.addIssue({
        code: "custom",
        message: "okCount + failedCount must equal the number of rows.",
        path: ["failedCount"],
      });
    }
  });
export type BulkStockInResult = z.infer<typeof BulkStockInResultSchema>;
