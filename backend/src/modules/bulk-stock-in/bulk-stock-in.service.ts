import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  BulkStockInResultSchema,
  isDomainError,
  type BulkStockInData,
  type BulkStockInResult,
  type BulkStockInRowError,
  type BulkStockInRowResult,
  type DomainError,
} from "@mobileshop/shared";
import {
  QuickStockInService,
  type QuickStockInActorContext,
} from "../quick-stock-in/quick-stock-in.service";

/**
 * The batch shares Quick Stock In's actor context exactly — same tenant, branch,
 * scope and permission set — because every row is processed as a Quick Stock In.
 */
export type BulkStockInActorContext = QuickStockInActorContext;

/**
 * Derive a row's idempotency key deterministically from the batch key and the
 * row's index.
 *
 * The goods-receipt idempotency column is a UUID, and Quick Stock In treats its
 * key as the whole-request idempotency lock, so the derived value must be a
 * valid UUID and must be stable across a batch retry. We hash
 * `batchKey:index` and format the digest as an RFC-4122 v5 (name-based) UUID:
 * re-submitting the same batch key reproduces the identical per-row keys, so
 * each row replays its own original result rather than double-posting.
 */
function rowIdempotencyKey(batchKey: string, index: number): string {
  const digest = createHash("sha256")
    .update(`bulk-stock-in:${batchKey}:${index}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  digest[12] = "5"; // Version 5 (name-based).
  digest[16] = ((parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const hex = digest.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Flatten a domain error into the contract's per-row error shape. */
function toRowError(error: DomainError): BulkStockInRowError {
  const field =
    error.details === undefined ? undefined : Object.keys(error.details)[0];
  return {
    code: error.code,
    message: error.message,
    ...(field !== undefined ? { field } : {}),
  };
}

/**
 * Bulk Stock In — the multi-row orchestrator built ON TOP of Quick Stock In.
 *
 * It owns no stock logic of its own: it injects {@link QuickStockInService} and
 * replays each row through `quickStockIn`, which still performs the full atomic
 * chain (product/supplier reuse-or-create, purchase order, approval, goods
 * receipt, stock batch, `purchase_receive` movement, payment split and price)
 * inside that row's OWN transaction.
 *
 * Because each row commits independently, the batch is BATCH-LEVEL partial
 * success: a row that raises a `DomainError` is recorded as `failed` and the
 * loop moves on, leaving already-committed rows intact. An unexpected
 * (non-domain) error is left to bubble up, since it indicates a fault rather
 * than a rejected row. The per-row idempotency keys are derived from the batch
 * key, so retrying the whole batch is safe and never double-posts.
 */
@Injectable()
export class BulkStockInService {
  constructor(private readonly quickStockIn: QuickStockInService) {}

  async bulkStockIn(
    context: BulkStockInActorContext,
    input: BulkStockInData,
    batchIdempotencyKey: string,
  ): Promise<BulkStockInResult> {
    const rows: BulkStockInRowResult[] = [];
    let okCount = 0;
    let failedCount = 0;

    for (let index = 0; index < input.rows.length; index += 1) {
      const rowInput = input.rows[index];
      if (rowInput === undefined) continue; // Unreachable; satisfies the checker.
      const rowKey = rowIdempotencyKey(batchIdempotencyKey, index);
      try {
        // Each row opens its own Quick Stock In transaction and commits alone.
        // eslint-disable-next-line no-await-in-loop -- rows are posted sequentially so a failure never rolls back a committed row and the connection pool is not exhausted.
        const result = await this.quickStockIn.quickStockIn(
          context,
          rowInput,
          rowKey,
        );
        rows.push({ index, status: "ok", result });
        okCount += 1;
      } catch (error) {
        // A rejected row is expected: record it and keep the batch going. Any
        // non-domain fault is genuinely unexpected and is allowed to propagate.
        if (!isDomainError(error)) throw error;
        rows.push({ index, status: "failed", error: toRowError(error) });
        failedCount += 1;
      }
    }

    // Defensive: guarantee the response honours the shared contract invariants.
    return BulkStockInResultSchema.parse({ rows, okCount, failedCount });
  }
}
