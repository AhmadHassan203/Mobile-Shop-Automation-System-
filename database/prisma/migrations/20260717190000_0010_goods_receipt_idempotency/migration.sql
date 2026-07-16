-- Add durable request identity to goods-receipt posting. Existing receipts are
-- intentionally left with both columns NULL; new application code can opt into
-- atomic replay detection without rewriting historical evidence.

ALTER TABLE "goods_receipts"
  ADD COLUMN "idempotency_key" UUID,
  ADD COLUMN "request_hash" CHAR(64),
  ADD CONSTRAINT "goods_receipts_idempotency_pair" CHECK (
    ("idempotency_key" IS NULL) = ("request_hash" IS NULL)
  ),
  ADD CONSTRAINT "goods_receipts_request_hash_format" CHECK (
    "request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$'
  );

-- NULL idempotency keys remain unlimited for legacy rows. A present key is
-- unique only inside its tenant/branch posting scope.
CREATE UNIQUE INDEX "goods_receipts_idempotency_scope_key"
  ON "goods_receipts"("organization_id", "branch_id", "idempotency_key");
