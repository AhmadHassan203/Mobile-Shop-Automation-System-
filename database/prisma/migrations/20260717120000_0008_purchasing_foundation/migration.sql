-- Purchasing foundation: supplier masters, mutable purchase intent, immutable
-- proof of receiving, exact landed-cost evidence and the payable created by
-- TXN-1. Migration 0007 remains untouched; this is forward-only.
--
-- Money is BIGINT minor units and capped at JavaScript MAX_SAFE_INTEGER because
-- shared contracts cross JSON as exact numbers. Quantity stock retains 0007's
-- one-row-per-(variant, location) aggregate; only its current moving weighted
-- average unit costs are added here. Historical truth stays on immutable goods
-- receipt lines, never in the aggregate bucket (ASM-005 / ASM-006).

CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'approved', 'ordered', 'partially_received', 'received', 'closed', 'cancelled');
CREATE TYPE "LandedCostKind" AS ENUM ('freight', 'customs', 'insurance', 'handling', 'tax', 'other');
CREATE TYPE "LandedCostAllocationMethod" AS ENUM ('by_value');
CREATE TYPE "PayableStatus" AS ENUM ('open', 'partially_paid', 'paid', 'cancelled');

-- 1. Extend Inventory with costing and receiving provenance ------------------

ALTER TABLE "serialized_units"
  ADD COLUMN "goods_receipt_line_id" UUID,
  ADD COLUMN "purchase_order_line_id" UUID,
  ADD CONSTRAINT "serialized_units_receipt_provenance_pair" CHECK (
    ("goods_receipt_line_id" IS NULL) = ("purchase_order_line_id" IS NULL)
  ),
  ADD CONSTRAINT "serialized_units_costs_coherent" CHECK (
    "landed_cost_minor" IS NULL OR
    ("actual_cost_minor" IS NOT NULL AND "landed_cost_minor" >= "actual_cost_minor")
  ),
  ADD CONSTRAINT "serialized_units_actual_cost_safe_integer" CHECK (
    "actual_cost_minor" IS NULL OR "actual_cost_minor" <= 9007199254740991
  ),
  ADD CONSTRAINT "serialized_units_landed_cost_safe_integer" CHECK (
    "landed_cost_minor" IS NULL OR "landed_cost_minor" <= 9007199254740991
  ),
  ADD CONSTRAINT "serialized_units_receipt_costs_complete" CHECK (
    "goods_receipt_line_id" IS NULL OR
    ("actual_cost_minor" IS NOT NULL AND "landed_cost_minor" IS NOT NULL AND "received_at" IS NOT NULL)
  );

ALTER TABLE "stock_batches"
  ADD COLUMN "actual_cost_minor" BIGINT,
  ADD COLUMN "landed_cost_minor" BIGINT,
  ADD CONSTRAINT "stock_batches_actual_cost_nonnegative" CHECK (
    "actual_cost_minor" IS NULL OR
    ("actual_cost_minor" >= 0 AND "actual_cost_minor" <= 9007199254740991)
  ),
  ADD CONSTRAINT "stock_batches_landed_cost_nonnegative" CHECK (
    "landed_cost_minor" IS NULL OR
    ("landed_cost_minor" >= 0 AND "landed_cost_minor" <= 9007199254740991)
  ),
  ADD CONSTRAINT "stock_batches_costs_coherent" CHECK (
    ("actual_cost_minor" IS NULL AND "landed_cost_minor" IS NULL) OR
    ("actual_cost_minor" IS NOT NULL AND "landed_cost_minor" IS NOT NULL AND
     "landed_cost_minor" >= "actual_cost_minor")
  );

-- 2. Supplier masters --------------------------------------------------------

CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "on_time_rate_basis_points" INTEGER,
    "address_line" VARCHAR(300),
    "city" VARCHAR(100),
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "suppliers_code_normalized" CHECK (
      "code" = upper(btrim("code")) AND
      "code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'
    ),
    CONSTRAINT "suppliers_name_nonblank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "suppliers_payment_terms_days_range" CHECK ("payment_terms_days" BETWEEN 0 AND 3650),
    CONSTRAINT "suppliers_lead_time_days_range" CHECK ("lead_time_days" BETWEEN 0 AND 365),
    CONSTRAINT "suppliers_on_time_rate_range" CHECK (
      "on_time_rate_basis_points" IS NULL OR
      "on_time_rate_basis_points" BETWEEN 0 AND 10000
    ),
    CONSTRAINT "suppliers_optional_text_nonblank" CHECK (
      ("address_line" IS NULL OR length(btrim("address_line")) > 0) AND
      ("city" IS NULL OR length(btrim("city")) > 0) AND
      ("notes" IS NULL OR length(btrim("notes")) > 0)
    ),
    CONSTRAINT "suppliers_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "supplier_contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" VARCHAR(100),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_contacts_name_nonblank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "supplier_contacts_channel_required" CHECK (
      ("phone" IS NOT NULL AND length(btrim("phone")) > 0) OR
      ("email" IS NOT NULL AND length(btrim("email")) > 0)
    ),
    CONSTRAINT "supplier_contacts_email_normalized" CHECK (
      "email" IS NULL OR "email" = lower(btrim("email"))
    ),
    CONSTRAINT "supplier_contacts_optional_text_nonblank" CHECK (
      ("role" IS NULL OR length(btrim("role")) > 0) AND
      ("phone" IS NULL OR length(btrim("phone")) > 0)
    ),
    CONSTRAINT "supplier_contacts_primary_requires_active" CHECK (
      NOT "is_primary" OR "is_active"
    )
);

-- 3. Purchase intent ---------------------------------------------------------

CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID,
    "ordered_by_user_id" UUID,
    "closed_by_user_id" UUID,
    "cancelled_by_user_id" UUID,
    "number" VARCHAR(100) NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "order_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "expected_on" DATE,
    "notes" VARCHAR(500),
    "approved_at" TIMESTAMPTZ(3),
    "ordered_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_orders_number_nonblank" CHECK (
      "number" = btrim("number") AND length("number") > 0
    ),
    CONSTRAINT "purchase_orders_expected_on_valid" CHECK (
      "expected_on" IS NULL OR "expected_on" >= "order_date"
    ),
    CONSTRAINT "purchase_orders_notes_nonblank" CHECK (
      "notes" IS NULL OR length(btrim("notes")) > 0
    ),
    CONSTRAINT "purchase_orders_version_positive" CHECK ("version" > 0),
    CONSTRAINT "purchase_orders_actor_timestamp_pairs" CHECK (
      ("approved_at" IS NULL) = ("approved_by_user_id" IS NULL) AND
      ("ordered_at" IS NULL) = ("ordered_by_user_id" IS NULL) AND
      ("closed_at" IS NULL) = ("closed_by_user_id" IS NULL) AND
      ("cancelled_at" IS NULL) = ("cancelled_by_user_id" IS NULL)
    ),
    CONSTRAINT "purchase_orders_approval_timestamp_valid" CHECK (
      ("status" = 'draft' AND "approved_at" IS NULL) OR
      "status" = 'cancelled' OR
      ("status" IN ('approved', 'ordered', 'partially_received', 'received', 'closed') AND "approved_at" IS NOT NULL)
    ),
    CONSTRAINT "purchase_orders_ordered_timestamp_valid" CHECK (
      ("ordered_at" IS NULL OR "status" IN ('ordered', 'partially_received', 'received', 'closed', 'cancelled')) AND
      ("status" <> 'ordered' OR "ordered_at" IS NOT NULL)
    ),
    CONSTRAINT "purchase_orders_closed_timestamp_valid" CHECK (
      ("status" = 'closed') = ("closed_at" IS NOT NULL) AND
      ("status" = 'closed') = ("closed_by_user_id" IS NOT NULL)
    ),
    CONSTRAINT "purchase_orders_cancelled_metadata_valid" CHECK (
      ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL) AND
      ("status" = 'cancelled') = ("cancelled_by_user_id" IS NOT NULL) AND
      ("status" = 'cancelled') = ("cancellation_reason" IS NOT NULL) AND
      ("cancellation_reason" IS NULL OR length(btrim("cancellation_reason")) > 0)
    )
);

CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,
    "unit_cost_minor" BIGINT NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_lines_line_number_range" CHECK ("line_number" BETWEEN 1 AND 200),
    CONSTRAINT "purchase_order_lines_quantity_ordered_range" CHECK ("quantity_ordered" BETWEEN 1 AND 100000),
    CONSTRAINT "purchase_order_lines_quantity_received_valid" CHECK (
      "quantity_received" BETWEEN 0 AND "quantity_ordered"
    ),
    CONSTRAINT "purchase_order_lines_unit_cost_nonnegative" CHECK (
      "unit_cost_minor" BETWEEN 0 AND 9007199254740991
    ),
    CONSTRAINT "purchase_order_lines_notes_nonblank" CHECK (
      "notes" IS NULL OR length(btrim("notes")) > 0
    )
);

-- 4. Immutable receipt evidence and payable ---------------------------------

CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "received_by_user_id" UUID NOT NULL,
    "number" VARCHAR(100) NOT NULL,
    "supplier_invoice_reference" VARCHAR(100),
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoice_due_on" DATE NOT NULL,
    "notes" VARCHAR(500),
    "landed_cost_allocation_method" "LandedCostAllocationMethod" NOT NULL DEFAULT 'by_value',
    "actual_cost_total_minor" BIGINT NOT NULL,
    "landed_cost_total_minor" BIGINT NOT NULL,
    "payable_total_minor" BIGINT NOT NULL,
    "posting_txid" BIGINT NOT NULL DEFAULT txid_current(),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipts_number_nonblank" CHECK (
      "number" = btrim("number") AND length("number") > 0
    ),
    CONSTRAINT "goods_receipts_reference_nonblank" CHECK (
      "supplier_invoice_reference" IS NULL OR length(btrim("supplier_invoice_reference")) > 0
    ),
    CONSTRAINT "goods_receipts_notes_nonblank" CHECK (
      "notes" IS NULL OR length(btrim("notes")) > 0
    ),
    CONSTRAINT "goods_receipts_invoice_due_on_valid" CHECK (
      "invoice_due_on" >= ("received_at" AT TIME ZONE 'UTC')::date
    ),
    CONSTRAINT "goods_receipts_money_nonnegative" CHECK (
      "actual_cost_total_minor" BETWEEN 0 AND 9007199254740991 AND
      "landed_cost_total_minor" BETWEEN 0 AND 9007199254740991 AND
      "payable_total_minor" BETWEEN 0 AND 9007199254740991
    ),
    CONSTRAINT "goods_receipts_totals_ordered" CHECK (
      "landed_cost_total_minor" >= "actual_cost_total_minor" AND
      "payable_total_minor" = "actual_cost_total_minor"
    ),
    CONSTRAINT "goods_receipts_posting_txid_positive" CHECK ("posting_txid" > 0)
);

CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "tracking_type" "TrackingType" NOT NULL,
    "quantity_received" INTEGER NOT NULL,
    "unit_cost_minor" BIGINT NOT NULL,
    "actual_cost_total_minor" BIGINT NOT NULL,
    "landed_cost_allocated_minor" BIGINT NOT NULL,
    "landed_cost_total_minor" BIGINT NOT NULL,
    "stock_batch_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipt_lines_quantity_range" CHECK ("quantity_received" BETWEEN 1 AND 100000),
    CONSTRAINT "goods_receipt_lines_money_nonnegative" CHECK (
      "unit_cost_minor" BETWEEN 0 AND 9007199254740991 AND
      "actual_cost_total_minor" BETWEEN 0 AND 9007199254740991 AND
      "landed_cost_allocated_minor" BETWEEN 0 AND 9007199254740991 AND
      "landed_cost_total_minor" BETWEEN 0 AND 9007199254740991
    ),
    CONSTRAINT "goods_receipt_lines_actual_total_reconciles" CHECK (
      "actual_cost_total_minor"::numeric = "unit_cost_minor"::numeric * "quantity_received"::numeric
    ),
    CONSTRAINT "goods_receipt_lines_landed_total_reconciles" CHECK (
      "landed_cost_total_minor"::numeric = "actual_cost_total_minor"::numeric + "landed_cost_allocated_minor"::numeric
    ),
    CONSTRAINT "goods_receipt_lines_tracking_target_valid" CHECK (
      ("tracking_type" = 'quantity' AND "stock_batch_id" IS NOT NULL) OR
      ("tracking_type" = 'serialized' AND "stock_batch_id" IS NULL)
    )
);

CREATE TABLE "goods_receipt_landed_costs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "kind" "LandedCostKind" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reference" VARCHAR(100),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_landed_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipt_landed_costs_amount_positive" CHECK (
      "amount_minor" BETWEEN 1 AND 9007199254740991
    ),
    CONSTRAINT "goods_receipt_landed_costs_optional_text_nonblank" CHECK (
      ("reference" IS NULL OR length(btrim("reference")) > 0) AND
      ("notes" IS NULL OR length(btrim("notes")) > 0)
    )
);

CREATE TABLE "payables" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "paid_minor" BIGINT NOT NULL DEFAULT 0,
    "outstanding_minor" BIGINT NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payables_money_nonnegative" CHECK (
      "amount_minor" BETWEEN 0 AND 9007199254740991 AND
      "paid_minor" BETWEEN 0 AND "amount_minor" AND
      "outstanding_minor" BETWEEN 0 AND "amount_minor"
    ),
    CONSTRAINT "payables_balance_reconciles" CHECK (
      "outstanding_minor" = "amount_minor" - "paid_minor"
    ),
    CONSTRAINT "payables_status_reconciles" CHECK (
      ("status" = 'open' AND "paid_minor" = 0 AND "outstanding_minor" = "amount_minor") OR
      ("status" = 'partially_paid' AND "paid_minor" > 0 AND "outstanding_minor" > 0) OR
      ("status" = 'paid' AND "outstanding_minor" = 0) OR
      ("status" = 'cancelled' AND "outstanding_minor" = 0)
    ),
    CONSTRAINT "payables_version_positive" CHECK ("version" > 0)
);

-- 5. Search, uniqueness and composite-reference indexes ---------------------

CREATE INDEX "suppliers_organization_id_is_active_name_idx" ON "suppliers"("organization_id", "is_active", "name");
CREATE UNIQUE INDEX "suppliers_organization_id_code_key" ON "suppliers"("organization_id", "code");
CREATE UNIQUE INDEX "suppliers_id_organization_id_key" ON "suppliers"("id", "organization_id");

CREATE INDEX "supplier_contacts_organization_id_supplier_id_is_active_idx" ON "supplier_contacts"("organization_id", "supplier_id", "is_active");
CREATE UNIQUE INDEX "supplier_contacts_id_organization_id_key" ON "supplier_contacts"("id", "organization_id");
CREATE UNIQUE INDEX "supplier_contacts_one_active_primary_uq"
  ON "supplier_contacts"("organization_id", "supplier_id")
  WHERE "is_active" AND "is_primary";

CREATE INDEX "purchase_orders_organization_id_branch_id_status_order_date_idx" ON "purchase_orders"("organization_id", "branch_id", "status", "order_date");
CREATE INDEX "purchase_orders_organization_id_supplier_id_order_date_idx" ON "purchase_orders"("organization_id", "supplier_id", "order_date");
CREATE UNIQUE INDEX "purchase_orders_organization_id_branch_id_number_key" ON "purchase_orders"("organization_id", "branch_id", "number");
CREATE UNIQUE INDEX "purchase_orders_normalized_number_uq" ON "purchase_orders"("organization_id", "branch_id", upper("number"));
CREATE UNIQUE INDEX "purchase_orders_id_organization_id_key" ON "purchase_orders"("id", "organization_id");
CREATE UNIQUE INDEX "purchase_orders_id_organization_id_branch_id_supplier_id_key" ON "purchase_orders"("id", "organization_id", "branch_id", "supplier_id");

CREATE INDEX "purchase_order_lines_organization_id_product_variant_id_idx" ON "purchase_order_lines"("organization_id", "product_variant_id");
CREATE UNIQUE INDEX "purchase_order_lines_organization_id_purchase_order_id_line_key" ON "purchase_order_lines"("organization_id", "purchase_order_id", "line_number");
CREATE UNIQUE INDEX "purchase_order_lines_organization_id_purchase_order_id_prod_key" ON "purchase_order_lines"("organization_id", "purchase_order_id", "product_variant_id");
CREATE UNIQUE INDEX "purchase_order_lines_id_organization_id_key" ON "purchase_order_lines"("id", "organization_id");
CREATE UNIQUE INDEX "purchase_order_lines_id_organization_id_product_variant_id_key" ON "purchase_order_lines"("id", "organization_id", "product_variant_id");
CREATE UNIQUE INDEX "purchase_order_lines_id_organization_id_purchase_order_id_p_key" ON "purchase_order_lines"("id", "organization_id", "purchase_order_id", "product_variant_id");

CREATE INDEX "goods_receipts_organization_id_purchase_order_id_received_a_idx" ON "goods_receipts"("organization_id", "purchase_order_id", "received_at");
CREATE INDEX "goods_receipts_organization_id_supplier_id_received_at_idx" ON "goods_receipts"("organization_id", "supplier_id", "received_at");
CREATE UNIQUE INDEX "goods_receipts_organization_id_branch_id_number_key" ON "goods_receipts"("organization_id", "branch_id", "number");
CREATE UNIQUE INDEX "goods_receipts_normalized_number_uq" ON "goods_receipts"("organization_id", "branch_id", upper("number"));
CREATE UNIQUE INDEX "goods_receipts_supplier_invoice_reference_uq"
  ON "goods_receipts"("organization_id", "supplier_id", upper(btrim("supplier_invoice_reference")))
  WHERE "supplier_invoice_reference" IS NOT NULL;
CREATE UNIQUE INDEX "goods_receipts_id_organization_id_key" ON "goods_receipts"("id", "organization_id");
CREATE UNIQUE INDEX "goods_receipts_id_organization_id_branch_id_key" ON "goods_receipts"("id", "organization_id", "branch_id");
CREATE UNIQUE INDEX "goods_receipts_id_organization_id_branch_id_purchase_order__key" ON "goods_receipts"("id", "organization_id", "branch_id", "purchase_order_id");
CREATE UNIQUE INDEX "goods_receipts_id_organization_id_branch_id_supplier_id_key" ON "goods_receipts"("id", "organization_id", "branch_id", "supplier_id");

CREATE INDEX "goods_receipt_lines_organization_id_purchase_order_line_id_idx" ON "goods_receipt_lines"("organization_id", "purchase_order_line_id");
CREATE INDEX "goods_receipt_lines_organization_id_product_variant_id_crea_idx" ON "goods_receipt_lines"("organization_id", "product_variant_id", "created_at");
CREATE UNIQUE INDEX "goods_receipt_lines_organization_id_goods_receipt_id_purcha_key" ON "goods_receipt_lines"("organization_id", "goods_receipt_id", "purchase_order_line_id", "stock_location_id");
CREATE UNIQUE INDEX "goods_receipt_lines_id_organization_id_key" ON "goods_receipt_lines"("id", "organization_id");
CREATE UNIQUE INDEX "goods_receipt_lines_id_organization_id_product_variant_id_p_key" ON "goods_receipt_lines"("id", "organization_id", "product_variant_id", "purchase_order_line_id");

CREATE INDEX "goods_receipt_landed_costs_organization_id_goods_receipt_id_idx" ON "goods_receipt_landed_costs"("organization_id", "goods_receipt_id");
CREATE UNIQUE INDEX "goods_receipt_landed_costs_id_organization_id_key" ON "goods_receipt_landed_costs"("id", "organization_id");

CREATE INDEX "payables_organization_id_supplier_id_status_due_on_idx" ON "payables"("organization_id", "supplier_id", "status", "due_on");
CREATE INDEX "payables_organization_id_status_due_on_idx" ON "payables"("organization_id", "status", "due_on");
CREATE UNIQUE INDEX "payables_organization_id_goods_receipt_id_key" ON "payables"("organization_id", "goods_receipt_id");
CREATE UNIQUE INDEX "payables_goods_receipt_id_organization_id_branch_id_supplie_key" ON "payables"("goods_receipt_id", "organization_id", "branch_id", "supplier_id");
CREATE UNIQUE INDEX "payables_id_organization_id_key" ON "payables"("id", "organization_id");

CREATE UNIQUE INDEX "product_variants_id_organization_id_tracking_type_key" ON "product_variants"("id", "organization_id", "tracking_type");
CREATE UNIQUE INDEX "stock_batches_id_organization_id_branch_id_product_variant__key" ON "stock_batches"("id", "organization_id", "branch_id", "product_variant_id", "stock_location_id");

-- 6. Tenant-consistent source relationships ---------------------------------

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplier_id_organization_id_fkey" FOREIGN KEY ("supplier_id", "organization_id") REFERENCES "suppliers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_organization_id_fkey" FOREIGN KEY ("supplier_id", "organization_id") REFERENCES "suppliers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_organization_id_fkey" FOREIGN KEY ("created_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_user_id_organization_id_fkey" FOREIGN KEY ("approved_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ordered_by_user_id_organization_id_fkey" FOREIGN KEY ("ordered_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_closed_by_user_id_organization_id_fkey" FOREIGN KEY ("closed_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_user_id_organization_id_fkey" FOREIGN KEY ("cancelled_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_organization_id_fkey" FOREIGN KEY ("purchase_order_id", "organization_id") REFERENCES "purchase_orders"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_organization_id_fkey" FOREIGN KEY ("supplier_id", "organization_id") REFERENCES "suppliers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_organization_id_branch_id_fkey" FOREIGN KEY ("purchase_order_id", "organization_id", "branch_id", "supplier_id") REFERENCES "purchase_orders"("id", "organization_id", "branch_id", "supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_user_id_organization_id_fkey" FOREIGN KEY ("received_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_organization_id_branc_fkey" FOREIGN KEY ("goods_receipt_id", "organization_id", "branch_id", "purchase_order_id") REFERENCES "goods_receipts"("id", "organization_id", "branch_id", "purchase_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_organization_id_fkey" FOREIGN KEY ("purchase_order_line_id", "organization_id", "purchase_order_id", "product_variant_id") REFERENCES "purchase_order_lines"("id", "organization_id", "purchase_order_id", "product_variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_product_variant_id_organization_id_tra_fkey" FOREIGN KEY ("product_variant_id", "organization_id", "tracking_type") REFERENCES "product_variants"("id", "organization_id", "tracking_type") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_stock_location_id_organization_id_bran_fkey" FOREIGN KEY ("stock_location_id", "organization_id", "branch_id") REFERENCES "stock_locations"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_stock_batch_id_organization_id_branch__fkey" FOREIGN KEY ("stock_batch_id", "organization_id", "branch_id", "product_variant_id", "stock_location_id") REFERENCES "stock_batches"("id", "organization_id", "branch_id", "product_variant_id", "stock_location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_landed_costs" ADD CONSTRAINT "goods_receipt_landed_costs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_landed_costs" ADD CONSTRAINT "goods_receipt_landed_costs_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_landed_costs" ADD CONSTRAINT "goods_receipt_landed_costs_goods_receipt_id_organization_i_fkey" FOREIGN KEY ("goods_receipt_id", "organization_id", "branch_id") REFERENCES "goods_receipts"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payables" ADD CONSTRAINT "payables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_organization_id_fkey" FOREIGN KEY ("supplier_id", "organization_id") REFERENCES "suppliers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_goods_receipt_id_organization_id_branch_id_suppli_fkey" FOREIGN KEY ("goods_receipt_id", "organization_id", "branch_id", "supplier_id") REFERENCES "goods_receipts"("id", "organization_id", "branch_id", "supplier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "serialized_units" ADD CONSTRAINT "serialized_units_purchase_order_line_id_organization_id_pr_fkey" FOREIGN KEY ("purchase_order_line_id", "organization_id", "product_variant_id") REFERENCES "purchase_order_lines"("id", "organization_id", "product_variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "serialized_units" ADD CONSTRAINT "serialized_units_goods_receipt_line_id_organization_id_pro_fkey" FOREIGN KEY ("goods_receipt_line_id", "organization_id", "product_variant_id", "purchase_order_line_id") REFERENCES "goods_receipt_lines"("id", "organization_id", "product_variant_id", "purchase_order_line_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Mutable-document and posted-evidence guards -----------------------------

CREATE FUNCTION "reject_purchasing_hard_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'purchasing records cannot be hard-deleted; deactivate, cancel or reverse them instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "suppliers_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "suppliers" FOR EACH STATEMENT EXECUTE FUNCTION "reject_purchasing_hard_delete"();
CREATE TRIGGER "supplier_contacts_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "supplier_contacts" FOR EACH STATEMENT EXECUTE FUNCTION "reject_purchasing_hard_delete"();
CREATE TRIGGER "purchase_orders_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "purchase_orders" FOR EACH STATEMENT EXECUTE FUNCTION "reject_purchasing_hard_delete"();
CREATE TRIGGER "purchase_order_lines_no_truncate" BEFORE TRUNCATE ON "purchase_order_lines" FOR EACH STATEMENT EXECUTE FUNCTION "reject_purchasing_hard_delete"();
CREATE TRIGGER "payables_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "payables" FOR EACH STATEMENT EXECUTE FUNCTION "reject_purchasing_hard_delete"();
CREATE TRIGGER "number_sequences_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "number_sequences" FOR EACH STATEMENT EXECUTE FUNCTION "reject_purchasing_hard_delete"();

-- Draft updates use replace-style line persistence. A draft line has no posted
-- commercial or inventory meaning, so it may be deleted; after approval every
-- line is retained as document history. Purchase-order headers never hard-delete.
CREATE FUNCTION "guard_purchase_order_line_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "PurchaseOrderStatus";
BEGIN
  SELECT "status" INTO parent_status
    FROM "purchase_orders"
   WHERE "id" = OLD."purchase_order_id"
     AND "organization_id" = OLD."organization_id"
   FOR UPDATE;

  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'purchase order lines cannot be deleted after the order leaves draft'
      USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "purchase_order_lines_delete_guard"
BEFORE DELETE ON "purchase_order_lines"
FOR EACH ROW EXECUTE FUNCTION "guard_purchase_order_line_delete"();

CREATE FUNCTION "reject_posted_receipt_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'posted goods receipts are immutable; use a purchase return or reversal'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "goods_receipts_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "goods_receipts" FOR EACH STATEMENT EXECUTE FUNCTION "reject_posted_receipt_mutation"();
CREATE TRIGGER "goods_receipt_lines_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "goods_receipt_lines" FOR EACH STATEMENT EXECUTE FUNCTION "reject_posted_receipt_mutation"();
CREATE TRIGGER "goods_receipt_landed_costs_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "goods_receipt_landed_costs" FOR EACH STATEMENT EXECUTE FUNCTION "reject_posted_receipt_mutation"();

-- Once approved, the commercial intent is fixed. Receiving may advance status,
-- version and received counters, but cannot silently rewrite what was ordered.
CREATE FUNCTION "guard_purchase_order_after_draft"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'draft' AND NEW."status" IN ('approved', 'cancelled')) OR
    (OLD."status" = 'approved' AND NEW."status" IN ('ordered', 'partially_received', 'received', 'cancelled')) OR
    (OLD."status" = 'ordered' AND NEW."status" IN ('partially_received', 'received', 'cancelled')) OR
    (OLD."status" = 'partially_received' AND NEW."status" IN ('received', 'closed')) OR
    (OLD."status" = 'received' AND NEW."status" = 'closed')
  ) THEN
    RAISE EXCEPTION 'invalid purchase order status transition from % to %', OLD."status", NEW."status"
      USING ERRCODE = '23514', CONSTRAINT = 'purchase_orders_status_transition';
  END IF;

  IF NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id" THEN
    RAISE EXCEPTION 'a purchase order creator is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF (OLD."approved_at" IS NOT NULL AND (
        NEW."approved_at" IS DISTINCT FROM OLD."approved_at" OR
        NEW."approved_by_user_id" IS DISTINCT FROM OLD."approved_by_user_id"
      )) OR
     (OLD."ordered_at" IS NOT NULL AND (
        NEW."ordered_at" IS DISTINCT FROM OLD."ordered_at" OR
        NEW."ordered_by_user_id" IS DISTINCT FROM OLD."ordered_by_user_id"
      )) OR
     (OLD."closed_at" IS NOT NULL AND (
        NEW."closed_at" IS DISTINCT FROM OLD."closed_at" OR
        NEW."closed_by_user_id" IS DISTINCT FROM OLD."closed_by_user_id"
      )) OR
     (OLD."cancelled_at" IS NOT NULL AND (
        NEW."cancelled_at" IS DISTINCT FROM OLD."cancelled_at" OR
        NEW."cancelled_by_user_id" IS DISTINCT FROM OLD."cancelled_by_user_id" OR
        NEW."cancellation_reason" IS DISTINCT FROM OLD."cancellation_reason"
      )) THEN
    RAISE EXCEPTION 'purchase order lifecycle history is immutable once recorded'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" <> 'draft' AND (
    NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
    NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
    NEW."supplier_id" IS DISTINCT FROM OLD."supplier_id" OR
    NEW."number" IS DISTINCT FROM OLD."number" OR
    NEW."order_date" IS DISTINCT FROM OLD."order_date" OR
    NEW."expected_on" IS DISTINCT FROM OLD."expected_on" OR
    NEW."notes" IS DISTINCT FROM OLD."notes"
  ) THEN
    RAISE EXCEPTION 'an approved purchase order cannot have its commercial terms rewritten'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_orders_after_draft_guard"
BEFORE UPDATE ON "purchase_orders"
FOR EACH ROW EXECUTE FUNCTION "guard_purchase_order_after_draft"();

CREATE FUNCTION "guard_purchase_order_line_after_draft"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "PurchaseOrderStatus";
BEGIN
  SELECT "status" INTO parent_status
    FROM "purchase_orders"
   WHERE "id" = NEW."purchase_order_id"
     AND "organization_id" = NEW."organization_id"
   FOR UPDATE;

  IF parent_status IS NULL THEN
    RETURN NEW; -- The FK reports the missing/cross-tenant parent precisely.
  END IF;

  IF TG_OP = 'INSERT' AND parent_status <> 'draft' THEN
    RAISE EXCEPTION 'lines cannot be added after a purchase order leaves draft'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND parent_status <> 'draft' AND (
    NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
    NEW."purchase_order_id" IS DISTINCT FROM OLD."purchase_order_id" OR
    NEW."product_variant_id" IS DISTINCT FROM OLD."product_variant_id" OR
    NEW."line_number" IS DISTINCT FROM OLD."line_number" OR
    NEW."quantity_ordered" IS DISTINCT FROM OLD."quantity_ordered" OR
    NEW."unit_cost_minor" IS DISTINCT FROM OLD."unit_cost_minor" OR
    NEW."notes" IS DISTINCT FROM OLD."notes"
  ) THEN
    RAISE EXCEPTION 'an approved purchase order line cannot be rewritten'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_order_lines_after_draft_guard"
BEFORE INSERT OR UPDATE ON "purchase_order_lines"
FOR EACH ROW EXECUTE FUNCTION "guard_purchase_order_line_after_draft"();

CREATE FUNCTION "protect_payable_source"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
     NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
     NEW."supplier_id" IS DISTINCT FROM OLD."supplier_id" OR
     NEW."goods_receipt_id" IS DISTINCT FROM OLD."goods_receipt_id" OR
     NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor" THEN
    RAISE EXCEPTION 'a payable source and original amount are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payables_source_immutable"
BEFORE UPDATE ON "payables"
FOR EACH ROW EXECUTE FUNCTION "protect_payable_source"();

-- 8. Receipt children belong to the posting transaction ---------------------

CREATE FUNCTION "guard_receipt_child_posting_transaction"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt_txid BIGINT;
BEGIN
  SELECT "posting_txid" INTO receipt_txid
    FROM "goods_receipts"
   WHERE "id" = NEW."goods_receipt_id"
     AND "organization_id" = NEW."organization_id";

  IF receipt_txid IS NOT NULL AND receipt_txid <> txid_current() THEN
    RAISE EXCEPTION 'posted goods receipt children can only be created in the receipt posting transaction'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "goods_receipt_lines_same_transaction"
BEFORE INSERT ON "goods_receipt_lines"
FOR EACH ROW EXECUTE FUNCTION "guard_receipt_child_posting_transaction"();
CREATE TRIGGER "goods_receipt_landed_costs_same_transaction"
BEFORE INSERT ON "goods_receipt_landed_costs"
FOR EACH ROW EXECUTE FUNCTION "guard_receipt_child_posting_transaction"();
CREATE TRIGGER "payables_same_transaction"
BEFORE INSERT ON "payables"
FOR EACH ROW EXECUTE FUNCTION "guard_receipt_child_posting_transaction"();

CREATE FUNCTION "guard_serialized_unit_receipt_provenance"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt_txid BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."goods_receipt_line_id" IS NOT NULL THEN
    IF NEW."goods_receipt_line_id" IS DISTINCT FROM OLD."goods_receipt_line_id" OR
       NEW."purchase_order_line_id" IS DISTINCT FROM OLD."purchase_order_line_id" OR
       NEW."actual_cost_minor" IS DISTINCT FROM OLD."actual_cost_minor" OR
       NEW."landed_cost_minor" IS DISTINCT FROM OLD."landed_cost_minor" OR
       NEW."received_at" IS DISTINCT FROM OLD."received_at" THEN
      RAISE EXCEPTION 'serialized receipt provenance and received costs are immutable'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."goods_receipt_line_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r."posting_txid" INTO receipt_txid
    FROM "goods_receipt_lines" l
    JOIN "goods_receipts" r
      ON r."id" = l."goods_receipt_id"
     AND r."organization_id" = l."organization_id"
   WHERE l."id" = NEW."goods_receipt_line_id"
     AND l."organization_id" = NEW."organization_id";

  IF receipt_txid IS NOT NULL AND receipt_txid <> txid_current() THEN
    RAISE EXCEPTION 'serialized receiving provenance can only be assigned while posting its receipt'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "serialized_units_receipt_provenance_guard"
BEFORE INSERT OR UPDATE OF "goods_receipt_line_id", "purchase_order_line_id", "actual_cost_minor", "landed_cost_minor", "received_at" ON "serialized_units"
FOR EACH ROW EXECUTE FUNCTION "guard_serialized_unit_receipt_provenance"();

-- 9. Deferred end-of-transaction reconciliation -----------------------------
-- Parent, lines, landed-cost entries and payable are inserted in any order
-- inside TXN-1. This constraint trigger checks their FINAL committed state.

CREATE FUNCTION "assert_goods_receipt_reconciles"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt_id UUID;
  receipt_actual NUMERIC;
  receipt_landed NUMERIC;
  receipt_payable NUMERIC;
  received_date DATE;
  line_count BIGINT;
  line_actual NUMERIC;
  line_allocated NUMERIC;
  line_landed NUMERIC;
  landed_entries NUMERIC;
  payable_count BIGINT;
  payable_amount NUMERIC;
  payable_due DATE;
BEGIN
  -- A CASE expression validates both record-field references. Use procedural
  -- branches because the receipt header has `id`, while child rows expose
  -- `goods_receipt_id`.
  IF TG_TABLE_NAME = 'goods_receipts' THEN
    receipt_id := NEW."id";
  ELSE
    receipt_id := NEW."goods_receipt_id";
  END IF;

  SELECT "actual_cost_total_minor", "landed_cost_total_minor",
         "payable_total_minor", ("received_at" AT TIME ZONE 'UTC')::date
    INTO receipt_actual, receipt_landed, receipt_payable, received_date
    FROM "goods_receipts"
   WHERE "id" = receipt_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         COALESCE(sum("actual_cost_total_minor"::numeric), 0),
         COALESCE(sum("landed_cost_allocated_minor"::numeric), 0),
         COALESCE(sum("landed_cost_total_minor"::numeric), 0)
    INTO line_count, line_actual, line_allocated, line_landed
    FROM "goods_receipt_lines"
   WHERE "goods_receipt_id" = receipt_id;

  SELECT COALESCE(sum("amount_minor"::numeric), 0)
    INTO landed_entries
    FROM "goods_receipt_landed_costs"
   WHERE "goods_receipt_id" = receipt_id;

  SELECT count(*), max("amount_minor"::numeric), max("due_on")
    INTO payable_count, payable_amount, payable_due
    FROM "payables"
   WHERE "goods_receipt_id" = receipt_id;

  IF line_count = 0 OR
     line_actual <> receipt_actual OR
     line_landed <> receipt_landed OR
     line_allocated <> landed_entries OR
     payable_count <> 1 OR
     payable_amount <> receipt_payable OR
     payable_due < received_date THEN
    RAISE EXCEPTION 'goods receipt lines, landed costs and payable do not reconcile'
      USING ERRCODE = '23514', CONSTRAINT = 'goods_receipts_totals_reconcile';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "goods_receipts_reconcile_after_receipt"
AFTER INSERT ON "goods_receipts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_goods_receipt_reconciles"();
CREATE CONSTRAINT TRIGGER "goods_receipts_reconcile_after_line"
AFTER INSERT ON "goods_receipt_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_goods_receipt_reconciles"();
CREATE CONSTRAINT TRIGGER "goods_receipts_reconcile_after_landed_cost"
AFTER INSERT ON "goods_receipt_landed_costs"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_goods_receipt_reconciles"();
CREATE CONSTRAINT TRIGGER "goods_receipts_reconcile_after_payable"
AFTER INSERT OR UPDATE ON "payables"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_goods_receipt_reconciles"();

-- 10. Runtime privileges -----------------------------------------------------

GRANT USAGE ON TYPE "PurchaseOrderStatus", "LandedCostKind", "LandedCostAllocationMethod", "PayableStatus" TO mobileshop_app;

GRANT SELECT, INSERT, UPDATE ON TABLE "suppliers", "supplier_contacts", "purchase_orders", "purchase_order_lines", "payables" TO mobileshop_app;
GRANT DELETE ON TABLE "purchase_order_lines" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "suppliers", "supplier_contacts", "purchase_orders", "payables" FROM mobileshop_app;
REVOKE TRUNCATE ON TABLE "purchase_order_lines" FROM mobileshop_app;

GRANT SELECT, INSERT ON TABLE "goods_receipts", "goods_receipt_lines", "goods_receipt_landed_costs" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "goods_receipts", "goods_receipt_lines", "goods_receipt_landed_costs" FROM mobileshop_app;

-- Existing safe number_sequences already has positive/padding checks and a
-- NULLS NOT DISTINCT scope key from 0001. Purchasing consumes it under a row
-- lock; deleting a counter could reuse an issued number, so runtime cannot.
GRANT SELECT, INSERT, UPDATE ON TABLE "number_sequences" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "number_sequences" FROM mobileshop_app;
