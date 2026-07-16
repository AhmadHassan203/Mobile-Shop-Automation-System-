-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('draft', 'posted', 'cancelled');

-- CreateEnum
CREATE TYPE "ReturnItemCondition" AS ENUM ('like_new', 'new', 'used', 'faulty', 'damaged');

-- CreateEnum
CREATE TYPE "ReturnOutcome" AS ENUM ('restock', 'quarantine', 'supplier_warranty', 'write_off', 'repair');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FinancialEntrySourceType" ADD VALUE 'return';
ALTER TYPE "FinancialEntrySourceType" ADD VALUE 'refund';

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "credited_minor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "customer_id" UUID,
    "return_number" VARCHAR(100),
    "status" "ReturnStatus" NOT NULL DEFAULT 'draft',
    "reason" VARCHAR(500) NOT NULL,
    "evidence_note" VARCHAR(1000) NOT NULL,
    "total_refund_minor" BIGINT NOT NULL DEFAULT 0,
    "total_cogs_reversal_minor" BIGINT NOT NULL DEFAULT 0,
    "receivable_credit_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "return_window_days_snapshot" INTEGER NOT NULL,
    "return_deadline" TIMESTAMPTZ(3) NOT NULL,
    "policy_checked_at" TIMESTAMPTZ(3) NOT NULL,
    "policy_expired" BOOLEAN NOT NULL,
    "policy_overridden" BOOLEAN NOT NULL DEFAULT false,
    "policy_override_reason" VARCHAR(500),
    "policy_overridden_by_user_id" UUID,
    "policy_overridden_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "post_request_id" UUID,
    "post_request_hash" CHAR(64),
    "posted_at" TIMESTAMPTZ(3),
    "business_date" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sale_line_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "serialized_unit_id" UUID,
    "tracking_type_snapshot" "TrackingType" NOT NULL,
    "product_name_snapshot" VARCHAR(240) NOT NULL,
    "sku_snapshot" VARCHAR(100) NOT NULL,
    "identifier_snapshot" VARCHAR(140),
    "quantity" INTEGER NOT NULL,
    "refund_minor" BIGINT NOT NULL,
    "cogs_reversal_minor" BIGINT NOT NULL,
    "condition" "ReturnItemCondition" NOT NULL,
    "outcome" "ReturnOutcome",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "refund_number" VARCHAR(100) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "financial_account_id" UUID NOT NULL,
    "reference" VARCHAR(200),
    "cash_session_id" UUID,
    "refunded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "business_date" DATE NOT NULL,
    "processed_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "returns_organization_id_branch_id_status_created_at_idx" ON "returns"("organization_id", "branch_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "returns_organization_id_sale_id_status_idx" ON "returns"("organization_id", "sale_id", "status");

-- CreateIndex
CREATE INDEX "returns_organization_id_customer_id_created_at_idx" ON "returns"("organization_id", "customer_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "returns_organization_id_branch_id_return_number_key" ON "returns"("organization_id", "branch_id", "return_number");

-- CreateIndex
CREATE UNIQUE INDEX "returns_organization_id_branch_id_post_request_id_key" ON "returns"("organization_id", "branch_id", "post_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_id_organization_id_branch_id_key" ON "returns"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "return_lines_organization_id_sale_id_sale_line_id_idx" ON "return_lines"("organization_id", "sale_id", "sale_line_id");

-- CreateIndex
CREATE INDEX "return_lines_organization_id_serialized_unit_id_idx" ON "return_lines"("organization_id", "serialized_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_lines_organization_id_return_id_sale_line_id_key" ON "return_lines"("organization_id", "return_id", "sale_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_lines_organization_id_return_id_serialized_unit_id_key" ON "return_lines"("organization_id", "return_id", "serialized_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_lines_id_organization_id_key" ON "return_lines"("id", "organization_id");

-- CreateIndex
CREATE INDEX "refunds_organization_id_branch_id_business_date_refunded_at_idx" ON "refunds"("organization_id", "branch_id", "business_date", "refunded_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_organization_id_branch_id_return_id_key" ON "refunds"("organization_id", "branch_id", "return_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_return_id_organization_id_branch_id_key" ON "refunds"("return_id", "organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_organization_id_branch_id_refund_number_key" ON "refunds"("organization_id", "branch_id", "refund_number");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_id_organization_id_branch_id_key" ON "refunds"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_lines_id_organization_id_sale_id_key" ON "sale_lines"("id", "organization_id", "sale_id");

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_id_organization_id_branch_id_fkey" FOREIGN KEY ("sale_id", "organization_id", "branch_id") REFERENCES "sales"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_created_by_user_id_organization_id_fkey" FOREIGN KEY ("created_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_approved_by_user_id_organization_id_fkey" FOREIGN KEY ("approved_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_policy_overridden_by_user_id_organization_id_fkey" FOREIGN KEY ("policy_overridden_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_organization_id_branch_id_fkey" FOREIGN KEY ("return_id", "organization_id", "branch_id") REFERENCES "returns"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_sale_id_organization_id_branch_id_fkey" FOREIGN KEY ("sale_id", "organization_id", "branch_id") REFERENCES "sales"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_sale_line_id_organization_id_sale_id_fkey" FOREIGN KEY ("sale_line_id", "organization_id", "sale_id") REFERENCES "sale_lines"("id", "organization_id", "sale_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_product_variant_id_organization_id_tracking_t_fkey" FOREIGN KEY ("product_variant_id", "organization_id", "tracking_type_snapshot") REFERENCES "product_variants"("id", "organization_id", "tracking_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_stock_location_id_organization_id_branch_id_fkey" FOREIGN KEY ("stock_location_id", "organization_id", "branch_id") REFERENCES "stock_locations"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_serialized_unit_id_organization_id_branch_id__fkey" FOREIGN KEY ("serialized_unit_id", "organization_id", "branch_id", "product_variant_id", "stock_location_id") REFERENCES "serialized_units"("id", "organization_id", "branch_id", "product_variant_id", "stock_location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_return_id_organization_id_branch_id_fkey" FOREIGN KEY ("return_id", "organization_id", "branch_id") REFERENCES "returns"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_financial_account_id_organization_id_branch_id_fkey" FOREIGN KEY ("financial_account_id", "organization_id", "branch_id") REFERENCES "financial_accounts"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cash_session_id_organization_id_branch_id_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_user_id_organization_id_fkey" FOREIGN KEY ("processed_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 0013 completion — value guards, immutability, and runtime privilege repair.
--
-- Everything below is raw SQL that the Prisma datamodel does not express (CHECK
-- constraints, triggers, GRANT/REVOKE). `migrate diff --from-migrations
-- --to-schema` therefore continues to report "No difference detected", so 0011
-- and 0012 stay frozen and this migration remains strictly forward-only.
-- ============================================================================

-- 1. Value and shape guards for the Returns / Refund tables -------------------
ALTER TABLE "returns"
  ADD CONSTRAINT "returns_reason_nonblank_check" CHECK (length(btrim("reason")) > 0),
  ADD CONSTRAINT "returns_evidence_nonblank_check" CHECK (length(btrim("evidence_note")) > 0),
  ADD CONSTRAINT "returns_refund_safe_check" CHECK ("total_refund_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "returns_cogs_safe_check" CHECK ("total_cogs_reversal_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "returns_receivable_credit_safe_check" CHECK ("receivable_credit_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "returns_refunded_bounds_check" CHECK ("refunded_minor" BETWEEN 0 AND "total_refund_minor"),
  ADD CONSTRAINT "returns_window_days_check" CHECK ("return_window_days_snapshot" >= 0),
  ADD CONSTRAINT "returns_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "returns_override_pair_check" CHECK (
    (NOT "policy_overridden" AND "policy_override_reason" IS NULL
      AND "policy_overridden_by_user_id" IS NULL AND "policy_overridden_at" IS NULL)
    OR ("policy_overridden" AND "policy_override_reason" IS NOT NULL
      AND "policy_overridden_by_user_id" IS NOT NULL AND "policy_overridden_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "returns_post_request_pair_check" CHECK (("post_request_id" IS NULL) = ("post_request_hash" IS NULL)),
  ADD CONSTRAINT "returns_post_request_hash_check" CHECK ("post_request_hash" IS NULL OR "post_request_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "returns_posted_shape_check" CHECK (
    "status" <> 'posted' OR (
      "return_number" IS NOT NULL AND "posted_at" IS NOT NULL
      AND "business_date" IS NOT NULL AND "post_request_id" IS NOT NULL
    )
  );

ALTER TABLE "return_lines"
  ADD CONSTRAINT "return_lines_quantity_check" CHECK ("quantity" BETWEEN 1 AND 100000),
  ADD CONSTRAINT "return_lines_refund_safe_check" CHECK ("refund_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "return_lines_cogs_safe_check" CHECK ("cogs_reversal_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "return_lines_product_name_nonblank_check" CHECK (length(btrim("product_name_snapshot")) > 0),
  ADD CONSTRAINT "return_lines_sku_nonblank_check" CHECK (length(btrim("sku_snapshot")) > 0),
  ADD CONSTRAINT "return_lines_identifier_nonblank_check" CHECK ("identifier_snapshot" IS NULL OR length(btrim("identifier_snapshot")) > 0),
  ADD CONSTRAINT "return_lines_serialized_shape_check" CHECK (
    ("tracking_type_snapshot" = 'serialized' AND "serialized_unit_id" IS NOT NULL AND "quantity" = 1)
    OR ("tracking_type_snapshot" = 'quantity' AND "serialized_unit_id" IS NULL)
  );

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive_check" CHECK ("amount_minor" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "refunds_number_nonblank_check" CHECK (length(btrim("refund_number")) > 0),
  ADD CONSTRAINT "refunds_reference_nonblank_check" CHECK ("reference" IS NULL OR length(btrim("reference")) > 0);

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_credited_safe_check" CHECK ("credited_minor" BETWEEN 0 AND 9007199254740991);

-- 2. Narrow Sales guard update: legitimate returns may advance a posted sale's
--    status within the returned family (and only version/updated_at move with
--    it). Every financial snapshot posting made true remains immutable, so the
--    guard still refuses ordinary edits to closed sales as a database backstop.
CREATE OR REPLACE FUNCTION "guard_sale_after_draft"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
     NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'a sale identity and tenant scope are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = 'draft' THEN
    RETURN NEW;
  END IF;

  IF (OLD."status" = 'posted' AND NEW."status" IN ('partially_returned', 'returned'))
     OR (OLD."status" = 'partially_returned' AND NEW."status" IN ('partially_returned', 'returned')) THEN
    IF NEW."invoice_number" IS DISTINCT FROM OLD."invoice_number" OR
       NEW."customer_id" IS DISTINCT FROM OLD."customer_id" OR
       NEW."customer_name_snapshot" IS DISTINCT FROM OLD."customer_name_snapshot" OR
       NEW."customer_phone_snapshot" IS DISTINCT FROM OLD."customer_phone_snapshot" OR
       NEW."salesperson_user_id" IS DISTINCT FROM OLD."salesperson_user_id" OR
       NEW."cashier_user_id" IS DISTINCT FROM OLD."cashier_user_id" OR
       NEW."cash_session_id" IS DISTINCT FROM OLD."cash_session_id" OR
       NEW."subtotal_minor" IS DISTINCT FROM OLD."subtotal_minor" OR
       NEW."discount_minor" IS DISTINCT FROM OLD."discount_minor" OR
       NEW."tax_minor" IS DISTINCT FROM OLD."tax_minor" OR
       NEW."total_minor" IS DISTINCT FROM OLD."total_minor" OR
       NEW."cogs_minor" IS DISTINCT FROM OLD."cogs_minor" OR
       NEW."gross_profit_minor" IS DISTINCT FROM OLD."gross_profit_minor" OR
       NEW."discount_reason" IS DISTINCT FROM OLD."discount_reason" OR
       NEW."note" IS DISTINCT FROM OLD."note" OR
       NEW."discount_approved_by_user_id" IS DISTINCT FROM OLD."discount_approved_by_user_id" OR
       NEW."held_at" IS DISTINCT FROM OLD."held_at" OR
       NEW."held_by_user_id" IS DISTINCT FROM OLD."held_by_user_id" OR
       NEW."cancelled_at" IS DISTINCT FROM OLD."cancelled_at" OR
       NEW."cancelled_by_user_id" IS DISTINCT FROM OLD."cancelled_by_user_id" OR
       NEW."cancellation_reason" IS DISTINCT FROM OLD."cancellation_reason" OR
       NEW."return_window_days" IS DISTINCT FROM OLD."return_window_days" OR
       NEW."posted_at" IS DISTINCT FROM OLD."posted_at" OR
       NEW."business_date" IS DISTINCT FROM OLD."business_date" OR
       NEW."post_request_id" IS DISTINCT FROM OLD."post_request_id" OR
       NEW."post_request_hash" IS DISTINCT FROM OLD."post_request_hash" OR
       NEW."receipt_snapshot" IS DISTINCT FROM OLD."receipt_snapshot" THEN
      RAISE EXCEPTION 'a posted sale is immutable except for its return status'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'a posted or closed sale is immutable'
    USING ERRCODE = '55000';
END;
$$;

-- 3. Returns immutability: a return is freely assembled while draft, then frozen
--    once posted or cancelled (mirrors guard_sale_after_draft).
CREATE FUNCTION "guard_return_after_draft"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
     NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
     NEW."sale_id" IS DISTINCT FROM OLD."sale_id" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'a return identity and tenant scope are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" <> 'draft' THEN
    RAISE EXCEPTION 'a posted or cancelled return is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER "returns_after_draft_guard"
BEFORE UPDATE ON "returns"
FOR EACH ROW EXECUTE FUNCTION "guard_return_after_draft"();

-- Return lines may only be added, changed or removed while their parent return
-- is still draft; their identity and tenant scope are always immutable.
CREATE FUNCTION "guard_return_line_draft"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "ReturnStatus";
  target_return_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
    NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
    NEW."return_id" IS DISTINCT FROM OLD."return_id" OR
    NEW."sale_id" IS DISTINCT FROM OLD."sale_id" OR
    NEW."sale_line_id" IS DISTINCT FROM OLD."sale_line_id" OR
    NEW."created_at" IS DISTINCT FROM OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'a return line identity and tenant scope are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_return_id := OLD."return_id";
  ELSE
    target_return_id := NEW."return_id";
  END IF;

  SELECT "status" INTO parent_status FROM "returns" WHERE "id" = target_return_id;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'return lines may only change while the return is draft'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "return_lines_draft_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "return_lines"
FOR EACH ROW EXECUTE FUNCTION "guard_return_line_draft"();

-- 4. No-hard-delete and append-only protections for the new tables (reusing the
--    generic 0011 guard functions). Returns/return_lines are retained forever;
--    refunds are immutable financial evidence.
CREATE TRIGGER "returns_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "returns" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "return_lines_no_truncate" BEFORE TRUNCATE ON "return_lines" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "refunds_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "refunds" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_append_only_mutation"();

-- 5. Runtime privilege repair. Re-assert the intended least-privilege matrix for
--    every runtime module so any environment whose schema-scoped grants drifted
--    is explicitly corrected, and grant the new Returns tables. Append-only and
--    no-hard-delete revocations are re-applied last so those protections are
--    never widened. GRANT/REVOKE are idempotent, so this is safe to replay.
GRANT USAGE ON TYPE "ReturnStatus", "ReturnItemCondition", "ReturnOutcome" TO mobileshop_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mobileshop_app;

-- Catalog
GRANT SELECT, INSERT, UPDATE ON TABLE "categories", "brands", "product_models", "product_variants", "product_aliases", "product_barcodes" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "categories", "brands", "product_models", "product_variants", "product_aliases", "product_barcodes" FROM mobileshop_app;

-- Inventory
GRANT SELECT, INSERT, UPDATE ON TABLE "stock_locations", "serialized_units", "stock_batches", "device_identifiers" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "stock_locations", "serialized_units", "stock_batches", "device_identifiers" FROM mobileshop_app;
GRANT SELECT, INSERT ON TABLE "inventory_movements" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "inventory_movements" FROM mobileshop_app;

-- Purchasing
GRANT SELECT, INSERT, UPDATE ON TABLE "suppliers", "supplier_contacts", "purchase_orders", "purchase_order_lines", "payables" TO mobileshop_app;
GRANT DELETE ON TABLE "purchase_order_lines" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "suppliers", "supplier_contacts", "purchase_orders", "payables" FROM mobileshop_app;
REVOKE TRUNCATE ON TABLE "purchase_order_lines" FROM mobileshop_app;
GRANT SELECT, INSERT ON TABLE "goods_receipts", "goods_receipt_lines", "goods_receipt_landed_costs" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "goods_receipts", "goods_receipt_lines", "goods_receipt_landed_costs" FROM mobileshop_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "number_sequences" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "number_sequences" FROM mobileshop_app;

-- Sales and financial ledger
GRANT SELECT, INSERT, UPDATE ON TABLE "price_lists", "customers", "cash_sessions", "financial_accounts", "sales", "receivables" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "price_lists", "customers", "cash_sessions", "financial_accounts", "sales", "receivables" FROM mobileshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sale_lines" TO mobileshop_app;
REVOKE TRUNCATE ON TABLE "sale_lines" FROM mobileshop_app;
GRANT SELECT, INSERT ON TABLE "price_entries", "payments", "payment_allocations", "financial_entries" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "price_entries", "payments", "payment_allocations", "financial_entries" FROM mobileshop_app;

-- Demand
GRANT SELECT, INSERT, UPDATE ON TABLE "demand_requests", "demand_request_items" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "demand_requests", "demand_request_items" FROM mobileshop_app;
GRANT SELECT, INSERT ON TABLE "demand_follow_ups" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "demand_follow_ups" FROM mobileshop_app;

-- Returns (new)
GRANT SELECT, INSERT, UPDATE ON TABLE "returns" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "returns" FROM mobileshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "return_lines" TO mobileshop_app;
REVOKE TRUNCATE ON TABLE "return_lines" FROM mobileshop_app;
GRANT SELECT, INSERT ON TABLE "refunds" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "refunds" FROM mobileshop_app;

-- Audit history stays append-only for the runtime role regardless of the above.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events" FROM mobileshop_app;

