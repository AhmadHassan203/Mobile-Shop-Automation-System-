import { randomUUID } from "node:crypto";
import type { Prisma } from "@mobileshop/database";

interface LockedNumberSequence {
  readonly id: string;
  readonly prefix: string;
  readonly nextValue: number;
  readonly padding: number;
  readonly periodKey: string | null;
}

export interface DocumentNumberScope {
  readonly organizationId: string;
  /** Null allocates an organization-wide sequence (for example customers). */
  readonly branchId: string | null;
}

export interface AllocateDocumentNumberOptions {
  readonly key: string;
  readonly defaultPrefix: string;
  readonly periodKey?: string | null;
  readonly padding?: number;
}

/**
 * Allocate one gapless human-facing number inside the caller's transaction.
 *
 * The advisory lock protects first-row creation as well as increments. The
 * number is consumed only if the surrounding transaction commits, so a failed
 * sale never leaves an unexplained invoice gap.
 */
export async function allocateDocumentNumber(
  tx: Prisma.TransactionClient,
  scope: DocumentNumberScope,
  options: AllocateDocumentNumberOptions,
): Promise<string> {
  const periodKey = options.periodKey ?? null;
  const padding = options.padding ?? 6;
  const lockKey = `${scope.organizationId}:${scope.branchId ?? "organization"}:${options.key}:${periodKey ?? ""}`;

  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  const candidateId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO number_sequences (
      id,
      organization_id,
      branch_id,
      key,
      prefix,
      next_value,
      padding,
      period_key,
      updated_at
    ) VALUES (
      ${candidateId}::uuid,
      ${scope.organizationId}::uuid,
      ${scope.branchId}::uuid,
      ${options.key},
      ${options.defaultPrefix},
      1,
      ${padding},
      ${periodKey},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT DO NOTHING`;

  const sequences = await tx.$queryRaw<readonly LockedNumberSequence[]>`
    SELECT id,
           prefix,
           next_value AS "nextValue",
           padding,
           period_key AS "periodKey"
      FROM number_sequences
     WHERE organization_id = ${scope.organizationId}::uuid
       AND branch_id IS NOT DISTINCT FROM ${scope.branchId}::uuid
       AND key = ${options.key}
       AND period_key IS NOT DISTINCT FROM ${periodKey}
     FOR UPDATE`;
  const sequence = sequences[0];
  if (sequence === undefined) {
    throw new Error(`Number sequence ${options.key} could not be allocated`);
  }

  const update = await tx.numberSequence.updateMany({
    where: {
      id: sequence.id,
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      key: options.key,
      periodKey,
      nextValue: sequence.nextValue,
    },
    data: { nextValue: { increment: 1 } },
  });
  if (update.count !== 1) {
    throw new Error(`Number sequence ${options.key} changed concurrently`);
  }

  const period = sequence.periodKey === null ? "" : `${sequence.periodKey}-`;
  return `${sequence.prefix}${period}${String(sequence.nextValue).padStart(
    sequence.padding,
    "0",
  )}`;
}
