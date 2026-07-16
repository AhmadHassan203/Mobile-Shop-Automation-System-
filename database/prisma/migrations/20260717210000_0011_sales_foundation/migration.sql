-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('draft', 'posted', 'cancelled', 'partially_returned', 'returned');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'card', 'digital_wallet', 'credit');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('open', 'closing_pending', 'closed', 'reviewed', 'reopened_with_authorization');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "FinancialAccountSubtype" AS ENUM ('physical_cash', 'bank', 'provider_float', 'receivable', 'inventory_asset', 'sales_revenue', 'sales_discount', 'cost_of_goods_sold', 'tax_payable', 'other');

-- CreateEnum
CREATE TYPE "FinancialEntrySourceType" AS ENUM ('sale', 'payment', 'receivable', 'opening_balance');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('open', 'partially_paid', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "CustomerMarketingConsentStatus" AS ENUM ('pending', 'granted', 'declined', 'withdrawn');

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "price_list_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "min_price_minor" BIGINT,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_number" VARCHAR(60) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "phone_e164" VARCHAR(20),
    "phone_raw" VARCHAR(40),
    "email" VARCHAR(255),
    "marketing_consent" "CustomerMarketingConsentStatus" NOT NULL DEFAULT 'pending',
    "address_line" VARCHAR(500),
    "credit_limit_minor" BIGINT NOT NULL DEFAULT 0,
    "notes" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "session_number" VARCHAR(100) NOT NULL,
    "cashier_user_id" UUID NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'open',
    "opening_cash_minor" BIGINT NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "business_date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "account_type" "FinancialAccountType" NOT NULL,
    "account_subtype" "FinancialAccountSubtype" NOT NULL,
    "normal_balance" "LedgerDirection" NOT NULL,
    "low_balance_threshold_minor" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "invoice_number" VARCHAR(100),
    "customer_id" UUID,
    "customer_name_snapshot" VARCHAR(200) NOT NULL,
    "customer_phone_snapshot" VARCHAR(20),
    "salesperson_user_id" UUID NOT NULL,
    "cashier_user_id" UUID NOT NULL,
    "cash_session_id" UUID,
    "status" "SaleStatus" NOT NULL DEFAULT 'draft',
    "subtotal_minor" BIGINT NOT NULL DEFAULT 0,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "total_minor" BIGINT NOT NULL DEFAULT 0,
    "cogs_minor" BIGINT NOT NULL DEFAULT 0,
    "gross_profit_minor" BIGINT NOT NULL DEFAULT 0,
    "discount_reason" VARCHAR(500),
    "note" VARCHAR(500),
    "discount_approved_by_user_id" UUID,
    "held_at" TIMESTAMPTZ(3),
    "held_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_user_id" UUID,
    "cancellation_reason" VARCHAR(500),
    "return_window_days" INTEGER NOT NULL DEFAULT 7,
    "posted_at" TIMESTAMPTZ(3),
    "business_date" DATE,
    "post_request_id" UUID,
    "post_request_hash" CHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "price_entry_id" UUID,
    "serialized_unit_id" UUID,
    "tracking_type_snapshot" "TrackingType" NOT NULL,
    "product_name_snapshot" VARCHAR(240) NOT NULL,
    "sku_snapshot" VARCHAR(100) NOT NULL,
    "imei_snapshot" VARCHAR(140),
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "price_version_snapshot" INTEGER NOT NULL,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "discount_reason" VARCHAR(500),
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "line_total_minor" BIGINT NOT NULL,
    "unit_cogs_minor" BIGINT NOT NULL,
    "cogs_minor" BIGINT NOT NULL,
    "gross_profit_minor" BIGINT NOT NULL,
    "warranty_type_snapshot" "WarrantyType" NOT NULL,
    "warranty_months_snapshot" INTEGER,
    "is_manual_line" BOOLEAN NOT NULL DEFAULT false,
    "unit_sale_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "payment_number" VARCHAR(100) NOT NULL,
    "customer_id" UUID,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "financial_account_id" UUID NOT NULL,
    "reference" VARCHAR(200),
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "business_date" DATE NOT NULL,
    "cash_session_id" UUID,
    "received_by_user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "paid_minor" BIGINT NOT NULL DEFAULT 0,
    "balance_minor" BIGINT NOT NULL,
    "due_on" DATE NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'open',
    "approved_by_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "sale_id" UUID,
    "receivable_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "entry_group_id" UUID NOT NULL,
    "source_type" "FinancialEntrySourceType" NOT NULL,
    "source_id" UUID,
    "source_key" VARCHAR(240) NOT NULL,
    "financial_account_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "business_date" DATE NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_lists_organization_id_is_active_effective_from_idx" ON "price_lists"("organization_id", "is_active", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_organization_id_code_key" ON "price_lists"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_id_organization_id_key" ON "price_lists"("id", "organization_id");

-- CreateIndex
CREATE INDEX "price_entries_organization_id_product_variant_id_effective__idx" ON "price_entries"("organization_id", "product_variant_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "price_entries_organization_id_price_list_id_product_variant_key" ON "price_entries"("organization_id", "price_list_id", "product_variant_id", "branch_id", "effective_from") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "price_entries_id_organization_id_product_variant_id_key" ON "price_entries"("id", "organization_id", "product_variant_id");

-- CreateIndex
CREATE INDEX "customers_organization_id_is_active_full_name_idx" ON "customers"("organization_id", "is_active", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_customer_number_key" ON "customers"("organization_id", "customer_number");

-- CreateIndex
CREATE UNIQUE INDEX "customers_id_organization_id_key" ON "customers"("id", "organization_id");

-- CreateIndex
CREATE INDEX "cash_sessions_organization_id_branch_id_business_date_idx" ON "cash_sessions"("organization_id", "branch_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_organization_id_branch_id_session_number_key" ON "cash_sessions"("organization_id", "branch_id", "session_number");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_id_organization_id_branch_id_key" ON "cash_sessions"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "financial_accounts_organization_id_branch_id_account_subtyp_idx" ON "financial_accounts"("organization_id", "branch_id", "account_subtype", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_organization_id_branch_id_code_key" ON "financial_accounts"("organization_id", "branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_id_organization_id_branch_id_key" ON "financial_accounts"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "sales_organization_id_branch_id_business_date_posted_at_idx" ON "sales"("organization_id", "branch_id", "business_date", "posted_at");

-- CreateIndex
CREATE INDEX "sales_organization_id_customer_id_posted_at_idx" ON "sales"("organization_id", "customer_id", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_organization_id_branch_id_invoice_number_key" ON "sales"("organization_id", "branch_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_organization_id_branch_id_post_request_id_key" ON "sales"("organization_id", "branch_id", "post_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_id_organization_id_key" ON "sales"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_id_organization_id_branch_id_key" ON "sales"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_id_organization_id_branch_id_customer_id_key" ON "sales"("id", "organization_id", "branch_id", "customer_id");

-- CreateIndex
CREATE INDEX "sale_lines_organization_id_product_variant_id_idx" ON "sale_lines"("organization_id", "product_variant_id");

-- CreateIndex
CREATE INDEX "sale_lines_organization_id_serialized_unit_id_idx" ON "sale_lines"("organization_id", "serialized_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_lines_organization_id_sale_id_line_number_key" ON "sale_lines"("organization_id", "sale_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "sale_lines_id_organization_id_key" ON "sale_lines"("id", "organization_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_branch_id_business_date_received_a_idx" ON "payments"("organization_id", "branch_id", "business_date", "received_at");

-- CreateIndex
CREATE INDEX "payments_organization_id_cash_session_id_idx" ON "payments"("organization_id", "cash_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_branch_id_payment_number_key" ON "payments"("organization_id", "branch_id", "payment_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_branch_id_idempotency_key_key" ON "payments"("organization_id", "branch_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_organization_id_branch_id_key" ON "payments"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "receivables_organization_id_branch_id_status_due_on_idx" ON "receivables"("organization_id", "branch_id", "status", "due_on");

-- CreateIndex
CREATE INDEX "receivables_organization_id_customer_id_status_idx" ON "receivables"("organization_id", "customer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_organization_id_sale_id_key" ON "receivables"("organization_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_sale_id_organization_id_branch_id_customer_id_key" ON "receivables"("sale_id", "organization_id", "branch_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_id_organization_id_branch_id_key" ON "receivables"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "payment_allocations_organization_id_sale_id_idx" ON "payment_allocations"("organization_id", "sale_id");

-- CreateIndex
CREATE INDEX "payment_allocations_organization_id_receivable_id_idx" ON "payment_allocations"("organization_id", "receivable_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_organization_id_payment_id_sale_id_key" ON "payment_allocations"("organization_id", "payment_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_organization_id_payment_id_receivable_i_key" ON "payment_allocations"("organization_id", "payment_id", "receivable_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_id_organization_id_key" ON "payment_allocations"("id", "organization_id");

-- CreateIndex
CREATE INDEX "financial_entries_organization_id_financial_account_id_busi_idx" ON "financial_entries"("organization_id", "financial_account_id", "business_date");

-- CreateIndex
CREATE INDEX "financial_entries_organization_id_source_type_source_id_idx" ON "financial_entries"("organization_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "financial_entries_organization_id_entry_group_id_idx" ON "financial_entries"("organization_id", "entry_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_organization_id_source_key_key" ON "financial_entries"("organization_id", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entries_id_organization_id_key" ON "financial_entries"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "serialized_units_id_organization_id_branch_id_product_varia_key" ON "serialized_units"("id", "organization_id", "branch_id", "product_variant_id", "stock_location_id");

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_price_list_id_organization_id_fkey" FOREIGN KEY ("price_list_id", "organization_id") REFERENCES "price_lists"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashier_user_id_organization_id_fkey" FOREIGN KEY ("cashier_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_user_id_organization_id_fkey" FOREIGN KEY ("opened_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_salesperson_user_id_organization_id_fkey" FOREIGN KEY ("salesperson_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_user_id_organization_id_fkey" FOREIGN KEY ("cashier_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_organization_id_branch_id_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_approved_by_user_id_organization_id_fkey" FOREIGN KEY ("discount_approved_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_held_by_user_id_organization_id_fkey" FOREIGN KEY ("held_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_user_id_organization_id_fkey" FOREIGN KEY ("cancelled_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_organization_id_branch_id_fkey" FOREIGN KEY ("sale_id", "organization_id", "branch_id") REFERENCES "sales"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_stock_location_id_organization_id_branch_id_fkey" FOREIGN KEY ("stock_location_id", "organization_id", "branch_id") REFERENCES "stock_locations"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_variant_id_organization_id_tracking_typ_fkey" FOREIGN KEY ("product_variant_id", "organization_id", "tracking_type_snapshot") REFERENCES "product_variants"("id", "organization_id", "tracking_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_price_entry_id_organization_id_product_variant__fkey" FOREIGN KEY ("price_entry_id", "organization_id", "product_variant_id") REFERENCES "price_entries"("id", "organization_id", "product_variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_serialized_unit_id_organization_id_branch_id_pr_fkey" FOREIGN KEY ("serialized_unit_id", "organization_id", "branch_id", "product_variant_id", "stock_location_id") REFERENCES "serialized_units"("id", "organization_id", "branch_id", "product_variant_id", "stock_location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_financial_account_id_organization_id_branch_id_fkey" FOREIGN KEY ("financial_account_id", "organization_id", "branch_id") REFERENCES "financial_accounts"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_organization_id_branch_id_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_user_id_organization_id_fkey" FOREIGN KEY ("received_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_sale_id_organization_id_branch_id_customer_id_fkey" FOREIGN KEY ("sale_id", "organization_id", "branch_id", "customer_id") REFERENCES "sales"("id", "organization_id", "branch_id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_approved_by_user_id_organization_id_fkey" FOREIGN KEY ("approved_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_organization_id_branch_id_fkey" FOREIGN KEY ("payment_id", "organization_id", "branch_id") REFERENCES "payments"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_sale_id_organization_id_branch_id_fkey" FOREIGN KEY ("sale_id", "organization_id", "branch_id") REFERENCES "sales"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_receivable_id_organization_id_branch_i_fkey" FOREIGN KEY ("receivable_id", "organization_id", "branch_id") REFERENCES "receivables"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_financial_account_id_organization_id_bra_fkey" FOREIGN KEY ("financial_account_id", "organization_id", "branch_id") REFERENCES "financial_accounts"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 1. Exact values, lifecycle shape, and deterministic scope -----------------
-- API money is a JavaScript safe integer. PostgreSQL bigint protects storage;
-- these checks also protect exact transport and arithmetic at every boundary.

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_default_price_safe_check"
    CHECK ("default_price_minor" IS NULL OR "default_price_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "product_variants_min_price_safe_check"
    CHECK ("min_price_minor" IS NULL OR "min_price_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "product_variants_price_floor_check"
    CHECK ("default_price_minor" IS NULL OR "min_price_minor" IS NULL OR "min_price_minor" <= "default_price_minor");

ALTER TABLE "price_lists"
  ADD CONSTRAINT "price_lists_code_nonblank_check" CHECK (length(btrim("code")) > 0),
  ADD CONSTRAINT "price_lists_name_nonblank_check" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "price_lists_range_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
  ADD CONSTRAINT "price_lists_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "price_entries"
  ADD CONSTRAINT "price_entries_price_safe_check" CHECK ("price_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "price_entries_min_price_safe_check" CHECK ("min_price_minor" IS NULL OR "min_price_minor" BETWEEN 0 AND "price_minor"),
  ADD CONSTRAINT "price_entries_range_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

CREATE INDEX "price_entries_effective_branch_lookup_idx"
  ON "price_entries" ("organization_id", "branch_id", "product_variant_id", "effective_from" DESC);

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_number_nonblank_check" CHECK (length(btrim("customer_number")) > 0),
  ADD CONSTRAINT "customers_name_nonblank_check" CHECK (length(btrim("full_name")) > 0),
  ADD CONSTRAINT "customers_phone_e164_check" CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^[+]923[0-9]{9}$'),
  ADD CONSTRAINT "customers_email_nonblank_check" CHECK ("email" IS NULL OR length(btrim("email")) > 0),
  ADD CONSTRAINT "customers_address_nonblank_check" CHECK ("address_line" IS NULL OR length(btrim("address_line")) > 0),
  ADD CONSTRAINT "customers_credit_limit_safe_check" CHECK ("credit_limit_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "customers_version_positive_check" CHECK ("version" > 0);

CREATE UNIQUE INDEX "customers_organization_phone_uq"
  ON "customers" ("organization_id", "phone_e164")
  WHERE "phone_e164" IS NOT NULL AND "deleted_at" IS NULL;

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_number_nonblank_check" CHECK (length(btrim("session_number")) > 0),
  ADD CONSTRAINT "cash_sessions_opening_cash_safe_check" CHECK ("opening_cash_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "cash_sessions_closed_shape_check" CHECK (
    ("status" IN ('closed', 'reviewed') AND "closed_at" IS NOT NULL) OR
    ("status" IN ('open', 'closing_pending', 'reopened_with_authorization') AND "closed_at" IS NULL)
  ),
  ADD CONSTRAINT "cash_sessions_version_positive_check" CHECK ("version" > 0);

CREATE UNIQUE INDEX "cash_sessions_one_active_cashier_uq"
  ON "cash_sessions" ("organization_id", "branch_id", "cashier_user_id")
  WHERE "status" IN ('open', 'closing_pending', 'reopened_with_authorization');

ALTER TABLE "financial_accounts"
  ADD CONSTRAINT "financial_accounts_code_nonblank_check" CHECK (length(btrim("code")) > 0),
  ADD CONSTRAINT "financial_accounts_name_nonblank_check" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "financial_accounts_threshold_safe_check" CHECK ("low_balance_threshold_minor" IS NULL OR "low_balance_threshold_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "financial_accounts_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_invoice_nonblank_check" CHECK ("invoice_number" IS NULL OR length(btrim("invoice_number")) > 0),
  ADD CONSTRAINT "sales_customer_name_nonblank_check" CHECK (length(btrim("customer_name_snapshot")) > 0),
  ADD CONSTRAINT "sales_customer_phone_check" CHECK ("customer_phone_snapshot" IS NULL OR "customer_phone_snapshot" ~ '^[+]923[0-9]{9}$'),
  ADD CONSTRAINT "sales_subtotal_safe_check" CHECK ("subtotal_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sales_discount_safe_check" CHECK ("discount_minor" BETWEEN 0 AND "subtotal_minor"),
  ADD CONSTRAINT "sales_tax_safe_check" CHECK ("tax_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sales_total_safe_check" CHECK ("total_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sales_cogs_safe_check" CHECK ("cogs_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sales_profit_safe_check" CHECK ("gross_profit_minor" BETWEEN -9007199254740991 AND 9007199254740991),
  ADD CONSTRAINT "sales_total_identity_check" CHECK ("total_minor" = "subtotal_minor" - "discount_minor" + "tax_minor"),
  ADD CONSTRAINT "sales_profit_identity_check" CHECK ("gross_profit_minor" = "total_minor" - "cogs_minor"),
  ADD CONSTRAINT "sales_discount_reason_check" CHECK ("discount_minor" = 0 OR ("discount_reason" IS NOT NULL AND length(btrim("discount_reason")) > 0)),
  ADD CONSTRAINT "sales_optional_text_nonblank_check" CHECK (
    ("note" IS NULL OR length(btrim("note")) > 0) AND
    ("cancellation_reason" IS NULL OR length(btrim("cancellation_reason")) > 0)
  ),
  ADD CONSTRAINT "sales_post_request_pair_check" CHECK (("post_request_id" IS NULL) = ("post_request_hash" IS NULL)),
  ADD CONSTRAINT "sales_post_request_hash_check" CHECK ("post_request_hash" IS NULL OR "post_request_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sales_posted_shape_check" CHECK (
    ("status" IN ('posted', 'partially_returned', 'returned') AND "invoice_number" IS NOT NULL AND "posted_at" IS NOT NULL AND "business_date" IS NOT NULL AND "post_request_id" IS NOT NULL) OR
    ("status" IN ('draft', 'cancelled') AND "invoice_number" IS NULL AND "posted_at" IS NULL AND "business_date" IS NULL AND "post_request_id" IS NULL)
  ),
  ADD CONSTRAINT "sales_hold_pair_check" CHECK (("held_at" IS NULL) = ("held_by_user_id" IS NULL)),
  ADD CONSTRAINT "sales_hold_draft_only_check" CHECK ("held_at" IS NULL OR "status" = 'draft'),
  ADD CONSTRAINT "sales_cancelled_shape_check" CHECK (
    ("status" = 'cancelled' AND "cancelled_at" IS NOT NULL AND "cancelled_by_user_id" IS NOT NULL AND "cancellation_reason" IS NOT NULL) OR
    ("status" <> 'cancelled' AND "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND "cancellation_reason" IS NULL)
  ),
  ADD CONSTRAINT "sales_return_window_check" CHECK ("return_window_days" >= 0),
  ADD CONSTRAINT "sales_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "sale_lines"
  ADD CONSTRAINT "sale_lines_number_positive_check" CHECK ("line_number" > 0),
  ADD CONSTRAINT "sale_lines_quantity_positive_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sale_lines_price_version_check" CHECK ("price_version_snapshot" > 0),
  ADD CONSTRAINT "sale_lines_product_name_nonblank_check" CHECK (length(btrim("product_name_snapshot")) > 0),
  ADD CONSTRAINT "sale_lines_sku_nonblank_check" CHECK (length(btrim("sku_snapshot")) > 0),
  ADD CONSTRAINT "sale_lines_tracking_shape_check" CHECK (
    ("tracking_type_snapshot" = 'serialized' AND "serialized_unit_id" IS NOT NULL AND "imei_snapshot" IS NOT NULL AND length(btrim("imei_snapshot")) > 0 AND "quantity" = 1) OR
    ("tracking_type_snapshot" = 'quantity' AND "serialized_unit_id" IS NULL AND "imei_snapshot" IS NULL AND NOT "unit_sale_active")
  ),
  ADD CONSTRAINT "sale_lines_unit_price_safe_check" CHECK ("unit_price_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sale_lines_discount_safe_check" CHECK ("discount_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sale_lines_tax_safe_check" CHECK ("tax_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sale_lines_total_safe_check" CHECK ("line_total_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sale_lines_unit_cogs_safe_check" CHECK ("unit_cogs_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sale_lines_cogs_safe_check" CHECK ("cogs_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "sale_lines_profit_safe_check" CHECK ("gross_profit_minor" BETWEEN -9007199254740991 AND 9007199254740991),
  ADD CONSTRAINT "sale_lines_total_identity_check" CHECK (
    "line_total_minor"::numeric = "unit_price_minor"::numeric * "quantity" - "discount_minor" + "tax_minor" AND
    "discount_minor"::numeric <= "unit_price_minor"::numeric * "quantity"
  ),
  ADD CONSTRAINT "sale_lines_cogs_identity_check" CHECK ("cogs_minor"::numeric = "unit_cogs_minor"::numeric * "quantity"),
  ADD CONSTRAINT "sale_lines_profit_identity_check" CHECK ("gross_profit_minor" = "line_total_minor" - "cogs_minor"),
  ADD CONSTRAINT "sale_lines_discount_reason_check" CHECK ("discount_minor" = 0 OR ("discount_reason" IS NOT NULL AND length(btrim("discount_reason")) > 0)),
  ADD CONSTRAINT "sale_lines_warranty_shape_check" CHECK (
    ("warranty_type_snapshot" = 'none' AND "warranty_months_snapshot" IS NULL) OR
    ("warranty_type_snapshot" <> 'none' AND "warranty_months_snapshot" > 0)
  );

CREATE UNIQUE INDEX "sale_lines_active_serialized_unit_uq"
  ON "sale_lines" ("organization_id", "serialized_unit_id")
  WHERE "serialized_unit_id" IS NOT NULL AND "unit_sale_active";

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_number_nonblank_check" CHECK (length(btrim("payment_number")) > 0),
  ADD CONSTRAINT "payments_amount_safe_check" CHECK ("amount_minor" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "payments_cash_session_shape_check" CHECK (("payment_method" = 'cash') = ("cash_session_id" IS NOT NULL)),
  ADD CONSTRAINT "payments_reference_shape_check" CHECK (
    ("payment_method" IN ('bank_transfer', 'card', 'digital_wallet') AND "reference" IS NOT NULL AND length(btrim("reference")) > 0) OR
    ("payment_method" IN ('cash', 'credit') AND "reference" IS NULL)
  );

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_amount_safe_check" CHECK ("amount_minor" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "receivables_paid_safe_check" CHECK ("paid_minor" BETWEEN 0 AND "amount_minor"),
  ADD CONSTRAINT "receivables_balance_identity_check" CHECK ("balance_minor" = "amount_minor" - "paid_minor"),
  ADD CONSTRAINT "receivables_status_shape_check" CHECK (
    ("status" = 'open' AND "paid_minor" = 0 AND "balance_minor" = "amount_minor") OR
    ("status" = 'partially_paid' AND "paid_minor" > 0 AND "paid_minor" < "amount_minor") OR
    ("status" = 'paid' AND "paid_minor" = "amount_minor" AND "balance_minor" = 0) OR
    ("status" = 'cancelled')
  ),
  ADD CONSTRAINT "receivables_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_target_xor_check" CHECK (("sale_id" IS NULL) <> ("receivable_id" IS NULL)),
  ADD CONSTRAINT "payment_allocations_amount_safe_check" CHECK ("amount_minor" BETWEEN 1 AND 9007199254740991);

ALTER TABLE "financial_entries"
  ADD CONSTRAINT "financial_entries_source_key_nonblank_check" CHECK (length(btrim("source_key")) > 0),
  ADD CONSTRAINT "financial_entries_description_nonblank_check" CHECK (length(btrim("description")) > 0),
  ADD CONSTRAINT "financial_entries_amount_safe_check" CHECK ("amount_minor" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "financial_entries_source_shape_check" CHECK (
    ("source_type" = 'opening_balance' AND "source_id" IS NULL) OR
    ("source_type" <> 'opening_balance' AND "source_id" IS NOT NULL)
  );

-- 2. No hard delete and immutable financial/posting evidence ----------------

CREATE FUNCTION "reject_sales_hard_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% cannot be hard-deleted or truncated', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "price_lists_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "price_lists" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "customers_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "customers" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "cash_sessions_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "cash_sessions" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "financial_accounts_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "financial_accounts" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "sales_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "sales" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "sale_lines_no_truncate" BEFORE TRUNCATE ON "sale_lines" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();
CREATE TRIGGER "receivables_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "receivables" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_hard_delete"();

CREATE FUNCTION "reject_sales_append_only_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "price_entries_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "price_entries" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_append_only_mutation"();
CREATE TRIGGER "payments_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "payments" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_append_only_mutation"();
CREATE TRIGGER "payment_allocations_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "payment_allocations" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_append_only_mutation"();
CREATE TRIGGER "financial_entries_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "financial_entries" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_append_only_mutation"();

-- A sale may be assembled, held, replaced, posted, or cancelled only while
-- its previous state is draft. Once posting creates financial truth, neither
-- its immutable snapshots nor its status may be rewritten by ordinary DML.
CREATE FUNCTION "guard_sale_after_draft"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" <> 'draft' THEN
    RAISE EXCEPTION 'a posted or closed sale is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
     NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'a sale identity and tenant scope are immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "sales_after_draft_guard"
BEFORE UPDATE ON "sales"
FOR EACH ROW EXECUTE FUNCTION "guard_sale_after_draft"();

CREATE FUNCTION "guard_sale_line_draft"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "SaleStatus";
  target_sale_id UUID;
  target_organization_id UUID;
  price_branch_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
    NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
    NEW."sale_id" IS DISTINCT FROM OLD."sale_id" OR
    NEW."created_at" IS DISTINCT FROM OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'a sale line identity, parent, and tenant scope are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_sale_id := OLD."sale_id";
    target_organization_id := OLD."organization_id";
  ELSE
    target_sale_id := NEW."sale_id";
    target_organization_id := NEW."organization_id";
  END IF;

  SELECT "status" INTO parent_status
    FROM "sales"
   WHERE "id" = target_sale_id
     AND "organization_id" = target_organization_id
   FOR UPDATE;

  IF parent_status IS NULL THEN
    RETURN COALESCE(NEW, OLD); -- The FK reports a missing parent precisely.
  END IF;

  IF parent_status <> 'draft' THEN
    RAISE EXCEPTION 'sale lines cannot be changed after the sale leaves draft'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP <> 'DELETE' AND NEW."price_entry_id" IS NOT NULL THEN
    SELECT "branch_id" INTO price_branch_id
      FROM "price_entries"
     WHERE "id" = NEW."price_entry_id"
       AND "organization_id" = NEW."organization_id"
       AND "product_variant_id" = NEW."product_variant_id";

    IF FOUND AND price_branch_id IS NOT NULL AND price_branch_id <> NEW."branch_id" THEN
      RAISE EXCEPTION 'a sale line price must be organization-wide or match the sale branch'
        USING ERRCODE = '23514', CONSTRAINT = 'sale_lines_price_branch_scope';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "sale_lines_draft_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "sale_lines"
FOR EACH ROW EXECUTE FUNCTION "guard_sale_line_draft"();

CREATE FUNCTION "protect_receivable_source"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
     NEW."branch_id" IS DISTINCT FROM OLD."branch_id" OR
     NEW."customer_id" IS DISTINCT FROM OLD."customer_id" OR
     NEW."sale_id" IS DISTINCT FROM OLD."sale_id" OR
     NEW."amount_minor" IS DISTINCT FROM OLD."amount_minor" OR
     NEW."approved_by_user_id" IS DISTINCT FROM OLD."approved_by_user_id" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'a receivable source, approval, and original amount are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "receivables_source_immutable"
BEFORE UPDATE ON "receivables"
FOR EACH ROW EXECUTE FUNCTION "protect_receivable_source"();

-- 3. Deferred final-state reconciliation -----------------------------------
-- Draft create/replace and posting may touch header and lines in any order.
-- Constraint triggers inspect the final transaction state at COMMIT.

CREATE FUNCTION "assert_sale_reconciles"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_sale_id UUID;
  sale_status "SaleStatus";
  sale_subtotal NUMERIC;
  sale_discount NUMERIC;
  sale_tax NUMERIC;
  sale_total NUMERIC;
  sale_cogs NUMERIC;
  sale_profit NUMERIC;
  line_count BIGINT;
  line_subtotal NUMERIC;
  line_discount NUMERIC;
  line_tax NUMERIC;
  line_total NUMERIC;
  line_cogs NUMERIC;
  line_profit NUMERIC;
  inactive_serialized BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    target_sale_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target_sale_id := OLD."sale_id";
  ELSE
    target_sale_id := NEW."sale_id";
  END IF;

  SELECT "status", "subtotal_minor", "discount_minor", "tax_minor",
         "total_minor", "cogs_minor", "gross_profit_minor"
    INTO sale_status, sale_subtotal, sale_discount, sale_tax,
         sale_total, sale_cogs, sale_profit
    FROM "sales"
   WHERE "id" = target_sale_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         COALESCE(sum("unit_price_minor"::numeric * "quantity"), 0),
         COALESCE(sum("discount_minor"::numeric), 0),
         COALESCE(sum("tax_minor"::numeric), 0),
         COALESCE(sum("line_total_minor"::numeric), 0),
         COALESCE(sum("cogs_minor"::numeric), 0),
         COALESCE(sum("gross_profit_minor"::numeric), 0),
         count(*) FILTER (WHERE "tracking_type_snapshot" = 'serialized' AND NOT "unit_sale_active")
    INTO line_count, line_subtotal, line_discount, line_tax,
         line_total, line_cogs, line_profit, inactive_serialized
    FROM "sale_lines"
   WHERE "sale_id" = target_sale_id;

  IF line_count = 0 OR
     line_subtotal <> sale_subtotal OR
     line_discount <> sale_discount OR
     line_tax <> sale_tax OR
     line_total <> sale_total OR
     line_cogs <> sale_cogs OR
     line_profit <> sale_profit OR
     (sale_status IN ('posted', 'partially_returned', 'returned') AND inactive_serialized <> 0) THEN
    RAISE EXCEPTION 'sale header and immutable line snapshots do not reconcile'
      USING ERRCODE = '23514', CONSTRAINT = 'sales_lines_totals_reconcile';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "sales_reconcile_after_header"
AFTER INSERT OR UPDATE ON "sales"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_sale_reconciles"();

CREATE CONSTRAINT TRIGGER "sales_reconcile_after_line"
AFTER INSERT OR UPDATE OR DELETE ON "sale_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_sale_reconciles"();

CREATE FUNCTION "assert_payment_allocations_reconcile"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_payment_id UUID;
  payment_amount NUMERIC;
  allocation_count BIGINT;
  allocation_amount NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    target_payment_id := NEW."id";
  ELSE
    target_payment_id := NEW."payment_id";
  END IF;

  SELECT "amount_minor"::numeric INTO payment_amount
    FROM "payments"
   WHERE "id" = target_payment_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), COALESCE(sum("amount_minor"::numeric), 0)
    INTO allocation_count, allocation_amount
    FROM "payment_allocations"
   WHERE "payment_id" = target_payment_id;

  IF allocation_count = 0 OR allocation_amount <> payment_amount THEN
    RAISE EXCEPTION 'payment allocations must exist and exactly equal the payment amount'
      USING ERRCODE = '23514', CONSTRAINT = 'payments_allocations_reconcile';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "payments_reconcile_after_payment"
AFTER INSERT ON "payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_payment_allocations_reconcile"();

CREATE CONSTRAINT TRIGGER "payments_reconcile_after_allocation"
AFTER INSERT ON "payment_allocations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_payment_allocations_reconcile"();

-- 4. Runtime privileges -----------------------------------------------------

GRANT USAGE ON TYPE "SaleStatus", "PaymentMethod", "CashSessionStatus", "LedgerDirection", "FinancialAccountType", "FinancialAccountSubtype", "FinancialEntrySourceType", "ReceivableStatus", "CustomerMarketingConsentStatus" TO mobileshop_app;

GRANT SELECT, INSERT, UPDATE ON TABLE "price_lists", "customers", "cash_sessions", "financial_accounts", "sales", "receivables" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "price_lists", "customers", "cash_sessions", "financial_accounts", "sales", "receivables" FROM mobileshop_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sale_lines" TO mobileshop_app;
REVOKE TRUNCATE ON TABLE "sale_lines" FROM mobileshop_app;

GRANT SELECT, INSERT ON TABLE "price_entries", "payments", "payment_allocations", "financial_entries" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "price_entries", "payments", "payment_allocations", "financial_entries" FROM mobileshop_app;
