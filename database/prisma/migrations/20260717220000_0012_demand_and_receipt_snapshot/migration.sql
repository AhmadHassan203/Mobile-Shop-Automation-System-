-- Demand and immutable receipt evidence. This migration is forward-only:
-- existing posted sales keep a nullable legacy receipt fallback, while every
-- new posting can atomically persist the complete JSON receipt payload.

-- 1. Types and immutable Sales receipt evidence -----------------------------

CREATE TYPE "DemandStatus" AS ENUM ('new', 'contacted', 'sourcing', 'available', 'customer_notified', 'converted_to_sale', 'not_interested', 'closed');
CREATE TYPE "DemandOutcome" AS ENUM ('sold_immediately', 'reserved', 'quotation_sent', 'unavailable', 'price_too_high', 'customer_postponed', 'bought_elsewhere', 'incompatible_requirement', 'invalid_or_fraudulent', 'unknown');
CREATE TYPE "DemandUrgency" AS ENUM ('immediate', 'within_week', 'within_month', 'flexible');
CREATE TYPE "DemandChannel" AS ENUM ('walk_in', 'phone', 'whatsapp', 'referral', 'other');
CREATE TYPE "DemandPtaPreference" AS ENUM ('pta_only', 'non_pta_ok', 'no_preference');
CREATE TYPE "DemandAvailabilityState" AS ENUM ('available', 'unavailable', 'not_in_catalog', 'unknown');
CREATE TYPE "DemandUnknownAvailabilityReason" AS ENUM ('not_checked', 'permission_denied', 'lookup_failed');
CREATE TYPE "DemandConversionTargetType" AS ENUM ('catalog_entry', 'quotation', 'reservation', 'supplier_inquiry', 'purchase_recommendation', 'sale');
CREATE TYPE "DemandFollowUpResult" AS ENUM ('reached', 'no_answer', 'message_sent', 'customer_replied', 'reminder_set', 'other');

ALTER TABLE "sales" ADD COLUMN "receipt_snapshot" JSONB;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_receipt_snapshot_shape_check" CHECK (
    "receipt_snapshot" IS NULL OR (
      jsonb_typeof("receipt_snapshot") = 'object' AND
      "status" IN ('posted', 'partially_returned', 'returned')
    )
  ),
  ADD CONSTRAINT "sales_posted_receipt_snapshot_required_check" CHECK (
    "status" NOT IN ('posted', 'partially_returned', 'returned') OR
    "receipt_snapshot" IS NOT NULL
  ) NOT VALID;

-- 2. Demand interaction, requested items and append-only follow-ups ----------

CREATE TABLE "demand_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "request_number" VARCHAR(40) NOT NULL,
    "customer_id" UUID,
    "customer_name" VARCHAR(200),
    "contact_phone_e164" VARCHAR(20),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "budget_min_minor" BIGINT,
    "budget_max_minor" BIGINT,
    "pta_preference" "DemandPtaPreference" NOT NULL DEFAULT 'no_preference',
    "urgency" "DemandUrgency" NOT NULL DEFAULT 'within_week',
    "channel" "DemandChannel" NOT NULL DEFAULT 'walk_in',
    "status" "DemandStatus" NOT NULL DEFAULT 'new',
    "outcome" "DemandOutcome" NOT NULL DEFAULT 'unknown',
    "availability_state" "DemandAvailabilityState" NOT NULL DEFAULT 'unknown',
    "availability_unknown_reason" "DemandUnknownAvailabilityReason",
    "available_quantity_snapshot" INTEGER,
    "availability_checked_at" TIMESTAMPTZ(3),
    "unit_price_minor_snapshot" BIGINT,
    "follow_up_on" DATE,
    "consent_to_contact" BOOLEAN NOT NULL DEFAULT false,
    "trade_in_interest" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(500),
    "lost_sale_reason" VARCHAR(500),
    "dedupe_group_id" UUID,
    "converted_target_type" "DemandConversionTargetType",
    "converted_target_id" UUID,
    "converted_at" TIMESTAMPTZ(3),
    "salesperson_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demand_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demand_request_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "demand_request_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "raw_request_text" VARCHAR(500) NOT NULL,
    "matched_product_variant_id" UUID,
    "matched_product_model_id" UUID,
    "desired_brand" VARCHAR(120),
    "desired_model" VARCHAR(120),
    "desired_variant" VARCHAR(120),
    "desired_ram" VARCHAR(120),
    "desired_storage" VARCHAR(120),
    "desired_color" VARCHAR(120),
    "condition_preference" "ProductCondition",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demand_request_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demand_follow_ups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "demand_request_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "channel" "DemandChannel" NOT NULL,
    "result" "DemandFollowUpResult" NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "next_follow_up_on" DATE,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_follow_ups_pkey" PRIMARY KEY ("id")
);

-- 3. Exact shape and safe-domain constraints --------------------------------

ALTER TABLE "demand_requests"
  ADD CONSTRAINT "demand_requests_request_number_shape_check"
    CHECK ("request_number" ~ '^DM-[A-Z0-9][A-Z0-9-]*$'),
  ADD CONSTRAINT "demand_requests_customer_name_nonblank_check"
    CHECK ("customer_name" IS NULL OR length(btrim("customer_name")) > 0),
  ADD CONSTRAINT "demand_requests_contact_phone_e164_check"
    CHECK ("contact_phone_e164" IS NULL OR "contact_phone_e164" ~ '^\+923[0-9]{9}$'),
  ADD CONSTRAINT "demand_requests_quantity_safe_check"
    CHECK ("quantity" BETWEEN 1 AND 100000),
  ADD CONSTRAINT "demand_requests_budget_min_safe_check"
    CHECK ("budget_min_minor" IS NULL OR "budget_min_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "demand_requests_budget_max_safe_check"
    CHECK ("budget_max_minor" IS NULL OR "budget_max_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "demand_requests_budget_order_check" CHECK (
    "budget_min_minor" IS NULL OR "budget_max_minor" IS NULL OR
    "budget_max_minor" >= "budget_min_minor"
  ),
  ADD CONSTRAINT "demand_requests_version_positive_check"
    CHECK ("version" > 0),
  ADD CONSTRAINT "demand_requests_availability_snapshot_check" CHECK (
    (
      "availability_state" = 'available' AND
      "availability_unknown_reason" IS NULL AND
      "available_quantity_snapshot" BETWEEN 1 AND 1000000 AND
      "availability_checked_at" IS NOT NULL
    ) OR (
      "availability_state" = 'unavailable' AND
      "availability_unknown_reason" IS NULL AND
      "available_quantity_snapshot" = 0 AND
      "availability_checked_at" IS NOT NULL
    ) OR (
      "availability_state" = 'not_in_catalog' AND
      "availability_unknown_reason" IS NULL AND
      "available_quantity_snapshot" IS NULL AND
      "availability_checked_at" IS NOT NULL AND
      "unit_price_minor_snapshot" IS NULL
    ) OR (
      "availability_state" = 'unknown' AND
      "availability_unknown_reason" IS NOT NULL AND
      "available_quantity_snapshot" IS NULL AND
      "unit_price_minor_snapshot" IS NULL
    )
  ),
  ADD CONSTRAINT "demand_requests_availability_price_safe_check"
    CHECK ("unit_price_minor_snapshot" IS NULL OR "unit_price_minor_snapshot" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "demand_requests_consent_contact_check"
    CHECK (NOT "consent_to_contact" OR "contact_phone_e164" IS NOT NULL),
  ADD CONSTRAINT "demand_requests_follow_up_consent_check"
    CHECK ("follow_up_on" IS NULL OR ("consent_to_contact" AND "contact_phone_e164" IS NOT NULL)),
  ADD CONSTRAINT "demand_requests_note_nonblank_check"
    CHECK ("note" IS NULL OR length(btrim("note")) > 0),
  ADD CONSTRAINT "demand_requests_lost_sale_reason_nonblank_check"
    CHECK ("lost_sale_reason" IS NULL OR length(btrim("lost_sale_reason")) > 0),
  ADD CONSTRAINT "demand_requests_conversion_pair_check" CHECK (
    ("converted_target_type" IS NULL) = ("converted_target_id" IS NULL) AND
    ("converted_target_type" IS NULL) = ("converted_at" IS NULL)
  ),
  ADD CONSTRAINT "demand_requests_converted_sale_status_check" CHECK (
    (
      "status" = 'converted_to_sale' AND
      "outcome" = 'sold_immediately' AND
      "converted_target_type" = 'sale'
    ) OR (
      "status" <> 'converted_to_sale' AND
      "converted_target_type" IS DISTINCT FROM 'sale'
    )
  ),
  ADD CONSTRAINT "demand_requests_notified_contact_check"
    CHECK ("status" <> 'customer_notified' OR ("consent_to_contact" AND "contact_phone_e164" IS NOT NULL));

ALTER TABLE "demand_request_items"
  ADD CONSTRAINT "demand_request_items_line_number_positive_check"
    CHECK ("line_number" > 0),
  ADD CONSTRAINT "demand_request_items_raw_text_nonblank_check"
    CHECK (length(btrim("raw_request_text")) > 0),
  ADD CONSTRAINT "demand_request_items_matched_or_raw_check" CHECK (
    "matched_product_variant_id" IS NOT NULL OR
    "matched_product_model_id" IS NOT NULL OR
    length(btrim("raw_request_text")) > 0
  ),
  ADD CONSTRAINT "demand_request_items_preferences_nonblank_check" CHECK (
    ("desired_brand" IS NULL OR length(btrim("desired_brand")) > 0) AND
    ("desired_model" IS NULL OR length(btrim("desired_model")) > 0) AND
    ("desired_variant" IS NULL OR length(btrim("desired_variant")) > 0) AND
    ("desired_ram" IS NULL OR length(btrim("desired_ram")) > 0) AND
    ("desired_storage" IS NULL OR length(btrim("desired_storage")) > 0) AND
    ("desired_color" IS NULL OR length(btrim("desired_color")) > 0)
  );

ALTER TABLE "demand_follow_ups"
  ADD CONSTRAINT "demand_follow_ups_note_nonblank_check"
    CHECK (length(btrim("note")) > 0);

-- 4. Uniqueness and operational indexes -------------------------------------

CREATE INDEX "demand_requests_organization_id_branch_id_status_follow_up__idx" ON "demand_requests"("organization_id", "branch_id", "status", "follow_up_on");
CREATE INDEX "demand_requests_organization_id_branch_id_outcome_created_a_idx" ON "demand_requests"("organization_id", "branch_id", "outcome", "created_at" DESC);
CREATE INDEX "demand_requests_organization_id_branch_id_urgency_created_a_idx" ON "demand_requests"("organization_id", "branch_id", "urgency", "created_at" DESC);
CREATE INDEX "demand_requests_organization_id_branch_id_channel_created_a_idx" ON "demand_requests"("organization_id", "branch_id", "channel", "created_at" DESC);
CREATE INDEX "demand_requests_organization_id_customer_id_created_at_idx" ON "demand_requests"("organization_id", "customer_id", "created_at" DESC);
CREATE INDEX "demand_requests_organization_id_branch_id_dedupe_group_id_idx" ON "demand_requests"("organization_id", "branch_id", "dedupe_group_id");
CREATE INDEX "demand_requests_organization_id_branch_id_converted_target__idx" ON "demand_requests"("organization_id", "branch_id", "converted_target_type", "converted_target_id");
CREATE UNIQUE INDEX "demand_requests_organization_id_branch_id_request_number_key" ON "demand_requests"("organization_id", "branch_id", "request_number");
CREATE UNIQUE INDEX "demand_requests_id_organization_id_branch_id_key" ON "demand_requests"("id", "organization_id", "branch_id");

CREATE INDEX "demand_request_items_organization_id_matched_product_varian_idx" ON "demand_request_items"("organization_id", "matched_product_variant_id", "created_at" DESC);
CREATE INDEX "demand_request_items_organization_id_matched_product_model__idx" ON "demand_request_items"("organization_id", "matched_product_model_id", "created_at" DESC);
CREATE INDEX "demand_request_items_organization_id_branch_id_demand_reque_idx" ON "demand_request_items"("organization_id", "branch_id", "demand_request_id");
CREATE UNIQUE INDEX "demand_request_items_organization_id_demand_request_id_line_key" ON "demand_request_items"("organization_id", "demand_request_id", "line_number");
CREATE UNIQUE INDEX "demand_request_items_id_organization_id_branch_id_key" ON "demand_request_items"("id", "organization_id", "branch_id");

CREATE INDEX "demand_follow_ups_organization_id_branch_id_demand_request__idx" ON "demand_follow_ups"("organization_id", "branch_id", "demand_request_id", "created_at");
CREATE INDEX "demand_follow_ups_organization_id_branch_id_next_follow_up__idx" ON "demand_follow_ups"("organization_id", "branch_id", "next_follow_up_on");
CREATE INDEX "demand_follow_ups_organization_id_actor_user_id_created_at_idx" ON "demand_follow_ups"("organization_id", "actor_user_id", "created_at");
CREATE UNIQUE INDEX "demand_follow_ups_id_organization_id_branch_id_key" ON "demand_follow_ups"("id", "organization_id", "branch_id");

-- 5. Tenant- and branch-scoped foreign keys ---------------------------------

ALTER TABLE "demand_requests" ADD CONSTRAINT "demand_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_requests" ADD CONSTRAINT "demand_requests_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_requests" ADD CONSTRAINT "demand_requests_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_requests" ADD CONSTRAINT "demand_requests_salesperson_user_id_organization_id_fkey" FOREIGN KEY ("salesperson_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "demand_request_items" ADD CONSTRAINT "demand_request_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_request_items" ADD CONSTRAINT "demand_request_items_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_request_items" ADD CONSTRAINT "demand_request_items_demand_request_id_organization_id_bra_fkey" FOREIGN KEY ("demand_request_id", "organization_id", "branch_id") REFERENCES "demand_requests"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_request_items" ADD CONSTRAINT "demand_request_items_matched_product_variant_id_organizati_fkey" FOREIGN KEY ("matched_product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_request_items" ADD CONSTRAINT "demand_request_items_matched_product_model_id_organization_fkey" FOREIGN KEY ("matched_product_model_id", "organization_id") REFERENCES "product_models"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "demand_follow_ups" ADD CONSTRAINT "demand_follow_ups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_follow_ups" ADD CONSTRAINT "demand_follow_ups_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_follow_ups" ADD CONSTRAINT "demand_follow_ups_demand_request_id_organization_id_branch_fkey" FOREIGN KEY ("demand_request_id", "organization_id", "branch_id") REFERENCES "demand_requests"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demand_follow_ups" ADD CONSTRAINT "demand_follow_ups_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Immutable evidence, lifecycle concurrency and scoped logical targets ----

CREATE FUNCTION "reject_demand_hard_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'demand history cannot be hard-deleted; close the request instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "demand_requests_no_hard_delete"
BEFORE DELETE OR TRUNCATE ON "demand_requests"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_demand_hard_delete"();

CREATE TRIGGER "demand_request_items_no_hard_delete"
BEFORE DELETE OR TRUNCATE ON "demand_request_items"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_demand_hard_delete"();

CREATE FUNCTION "guard_demand_request_update"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
     NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
     NEW."request_number" IS DISTINCT FROM OLD."request_number" OR
     NEW."salesperson_user_id" IS DISTINCT FROM OLD."salesperson_user_id" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'demand request identity, scope, number and creator are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'a demand request update must advance version exactly once'
      USING ERRCODE = '23514',
            CONSTRAINT = 'demand_requests_version_advance_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "demand_requests_update_guard"
BEFORE UPDATE ON "demand_requests"
FOR EACH ROW EXECUTE FUNCTION "guard_demand_request_update"();

CREATE FUNCTION "guard_demand_request_item_update"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
     NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
     NEW."demand_request_id" IS DISTINCT FROM OLD."demand_request_id" OR
     NEW."line_number" IS DISTINCT FROM OLD."line_number" OR
     NEW."raw_request_text" IS DISTINCT FROM OLD."raw_request_text" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'demand item identity, scope and original wording are immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "demand_request_items_update_guard"
BEFORE UPDATE ON "demand_request_items"
FOR EACH ROW EXECUTE FUNCTION "guard_demand_request_item_update"();

CREATE FUNCTION "assert_demand_item_catalog_match"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."matched_product_variant_id" IS NOT NULL AND
     NEW."matched_product_model_id" IS NOT NULL AND
     NOT EXISTS (
       SELECT 1
         FROM "product_variants"
        WHERE "id" = NEW."matched_product_variant_id"
          AND "organization_id" = NEW."organization_id"
          AND "product_model_id" = NEW."matched_product_model_id"
     ) THEN
    RAISE EXCEPTION 'matched demand variant does not belong to the matched model'
      USING ERRCODE = '23514',
            CONSTRAINT = 'demand_request_items_catalog_match_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "demand_request_items_catalog_match_guard"
BEFORE INSERT OR UPDATE OF "matched_product_variant_id", "matched_product_model_id", "organization_id"
ON "demand_request_items"
FOR EACH ROW EXECUTE FUNCTION "assert_demand_item_catalog_match"();

-- The public capture contract contains exactly one item. Availability may be
-- available/unavailable only for an exact variant match; unmatched wording may
-- honestly record not-in-catalog or an unknown lookup result. Deferred checks
-- let the header and item be inserted or replaced in either order in one tx.
CREATE FUNCTION "assert_demand_item_availability_shape"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_request_id UUID;
  target_organization_id UUID;
  target_branch_id UUID;
  target_availability "DemandAvailabilityState";
  item_count INTEGER;
  variant_match_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'demand_requests' THEN
    target_request_id := NEW."id";
    target_organization_id := NEW."organization_id";
    target_branch_id := NEW."branch_id";
    target_availability := NEW."availability_state";
  ELSE
    target_request_id := NEW."demand_request_id";
    target_organization_id := NEW."organization_id";
    target_branch_id := NEW."branch_id";

    SELECT "availability_state"
      INTO target_availability
      FROM "demand_requests"
     WHERE "id" = target_request_id
       AND "organization_id" = target_organization_id
       AND "branch_id" = target_branch_id;

    IF NOT FOUND THEN
      RETURN NULL; -- The scoped FK supplies the precise missing-parent error.
    END IF;
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE "matched_product_variant_id" IS NOT NULL)::integer
    INTO item_count, variant_match_count
    FROM "demand_request_items"
   WHERE "demand_request_id" = target_request_id
     AND "organization_id" = target_organization_id
     AND "branch_id" = target_branch_id;

  IF item_count <> 1 THEN
    RAISE EXCEPTION 'a demand request must contain exactly one requested item'
      USING ERRCODE = '23514',
            CONSTRAINT = 'demand_requests_exactly_one_item_check';
  END IF;

  IF variant_match_count = 1 AND target_availability = 'not_in_catalog' THEN
    RAISE EXCEPTION 'a matched demand item cannot be marked not in catalog'
      USING ERRCODE = '23514',
            CONSTRAINT = 'demand_requests_matched_availability_check';
  END IF;

  IF variant_match_count = 0 AND target_availability IN ('available', 'unavailable') THEN
    RAISE EXCEPTION 'stock availability requires an exact catalog variant match'
      USING ERRCODE = '23514',
            CONSTRAINT = 'demand_requests_unmatched_availability_check';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "demand_requests_item_availability_reconcile"
AFTER INSERT OR UPDATE ON "demand_requests"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_demand_item_availability_shape"();

CREATE CONSTRAINT TRIGGER "demand_request_items_availability_reconcile"
AFTER INSERT OR UPDATE ON "demand_request_items"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_demand_item_availability_shape"();

-- converted_target is intentionally polymorphic. Only sale conversion is
-- currently supported by the public contract, so validate that concrete target
-- now. Future modules must extend this function before accepting their targets.
CREATE FUNCTION "assert_demand_conversion_target"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."converted_target_type" = 'sale' AND NOT EXISTS (
    SELECT 1
      FROM "sales"
     WHERE "id" = NEW."converted_target_id"
       AND "organization_id" = NEW."organization_id"
       AND "branch_id" = NEW."branch_id"
       AND "status" IN ('posted', 'partially_returned', 'returned')
  ) THEN
    RAISE EXCEPTION 'converted sale must be a posted sale in the same organization and branch'
      USING ERRCODE = '23503',
            CONSTRAINT = 'demand_requests_converted_sale_scope_fkey';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "demand_requests_conversion_target_guard"
BEFORE INSERT OR UPDATE OF "converted_target_type", "converted_target_id", "organization_id", "branch_id", "status"
ON "demand_requests"
FOR EACH ROW EXECUTE FUNCTION "assert_demand_conversion_target"();

CREATE FUNCTION "guard_demand_follow_up_insert"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_consent BOOLEAN;
  request_phone VARCHAR(20);
BEGIN
  IF NEW."channel" IN ('phone', 'whatsapp') OR NEW."next_follow_up_on" IS NOT NULL THEN
    SELECT "consent_to_contact", "contact_phone_e164"
      INTO request_consent, request_phone
      FROM "demand_requests"
     WHERE "id" = NEW."demand_request_id"
       AND "organization_id" = NEW."organization_id"
       AND "branch_id" = NEW."branch_id"
     FOR KEY SHARE;

    IF NOT FOUND OR request_consent IS DISTINCT FROM true OR request_phone IS NULL THEN
      RAISE EXCEPTION 'contact follow-up requires captured consent and a contact phone'
        USING ERRCODE = '23514',
              CONSTRAINT = 'demand_follow_ups_contact_consent_check';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "demand_follow_ups_insert_guard"
BEFORE INSERT ON "demand_follow_ups"
FOR EACH ROW EXECUTE FUNCTION "guard_demand_follow_up_insert"();

CREATE FUNCTION "reject_demand_follow_up_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'demand follow-ups are append-only; add a new history row instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "demand_follow_ups_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "demand_follow_ups"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_demand_follow_up_mutation"();

-- 7. Runtime privilege repair ------------------------------------------------
-- Migrations may be deployed by a role other than mobileshop_migrator, so its
-- ALTER DEFAULT PRIVILEGES do not reliably cover later tables. Pin the complete
-- Sales read/write set explicitly and keep append-only evidence insert-only.

GRANT USAGE ON TYPE
  "StockLocationKind", "TrackingType", "ProductCondition", "PtaStatus",
  "WarrantyType", "SerializedStockState", "MovementType",
  "DeviceIdentifierType", "SaleStatus", "PaymentMethod",
  "CashSessionStatus", "LedgerDirection", "FinancialAccountType",
  "FinancialAccountSubtype", "FinancialEntrySourceType",
  "ReceivableStatus", "CustomerMarketingConsentStatus",
  "AuditSensitivity", "SettingValueType",
  "DemandStatus", "DemandOutcome", "DemandUrgency", "DemandChannel",
  "DemandPtaPreference", "DemandAvailabilityState",
  "DemandUnknownAvailabilityReason", "DemandConversionTargetType",
  "DemandFollowUpResult"
TO mobileshop_app;

GRANT SELECT ON TABLE
  "organizations", "branches", "users",
  "categories", "brands", "product_models", "product_variants",
  "stock_locations", "serialized_units", "device_identifiers", "stock_batches",
  "price_lists", "price_entries", "customers", "cash_sessions",
  "financial_accounts", "sales", "sale_lines", "payments",
  "payment_allocations", "receivables", "application_settings",
  "number_sequences"
TO mobileshop_app;

GRANT INSERT, UPDATE ON TABLE "sales" TO mobileshop_app;
GRANT INSERT, UPDATE, DELETE ON TABLE "sale_lines" TO mobileshop_app;
GRANT UPDATE ON TABLE "serialized_units", "stock_batches", "cash_sessions" TO mobileshop_app;
GRANT INSERT ON TABLE "inventory_movements", "payments", "payment_allocations", "financial_entries", "audit_events" TO mobileshop_app;
GRANT INSERT, UPDATE ON TABLE "receivables" TO mobileshop_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "number_sequences" TO mobileshop_app;

-- Restore the privilege half of append-only protection even when default
-- privileges granted broad DML before this migration ran.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "inventory_movements", "payments", "payment_allocations", "financial_entries", "audit_events" FROM mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "sales", "receivables", "number_sequences", "cash_sessions", "serialized_units", "stock_batches" FROM mobileshop_app;
REVOKE TRUNCATE ON TABLE "sale_lines" FROM mobileshop_app;

REVOKE ALL PRIVILEGES ON TABLE "demand_requests", "demand_request_items", "demand_follow_ups" FROM mobileshop_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "demand_requests", "demand_request_items" TO mobileshop_app;
GRANT SELECT, INSERT ON TABLE "demand_follow_ups" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "demand_requests", "demand_request_items" FROM mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "demand_follow_ups" FROM mobileshop_app;
