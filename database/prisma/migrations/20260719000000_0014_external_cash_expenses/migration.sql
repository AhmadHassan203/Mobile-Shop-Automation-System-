-- CreateEnum
CREATE TYPE "ExternalProvider" AS ENUM ('jazzcash', 'easypaisa', 'bank', 'electricity', 'gas', 'jazz', 'zong', 'other');

-- CreateEnum
CREATE TYPE "ExternalTransactionType" AS ENUM ('money_send', 'money_withdrawal', 'bank_transfer', 'utility_bill', 'mobile_load');

-- CreateEnum
CREATE TYPE "ExternalCashDirection" AS ENUM ('cash_in', 'cash_out');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('rent', 'utilities', 'salaries', 'supplies', 'transport', 'marketing', 'maintenance', 'other');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FinancialAccountSubtype" ADD VALUE 'service_revenue';
ALTER TYPE "FinancialAccountSubtype" ADD VALUE 'service_float';
ALTER TYPE "FinancialAccountSubtype" ADD VALUE 'expense';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FinancialEntrySourceType" ADD VALUE 'external_transaction';
ALTER TYPE "FinancialEntrySourceType" ADD VALUE 'expense';

-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "closed_by_user_id" UUID,
ADD COLUMN     "closing_counted_minor" BIGINT,
ADD COLUMN     "closing_expected_minor" BIGINT,
ADD COLUMN     "closing_note" VARCHAR(500),
ADD COLUMN     "closing_variance_minor" BIGINT;

-- CreateTable
CREATE TABLE "external_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "txn_number" VARCHAR(100) NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "transaction_type" "ExternalTransactionType" NOT NULL,
    "direction" "ExternalCashDirection" NOT NULL,
    "principal_minor" BIGINT NOT NULL,
    "fee_charged_minor" BIGINT NOT NULL,
    "provider_charge_minor" BIGINT NOT NULL DEFAULT 0,
    "service_profit_minor" BIGINT NOT NULL,
    "cash_impact_minor" BIGINT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "financial_account_id" UUID NOT NULL,
    "cash_session_id" UUID,
    "customer_id" UUID,
    "customer_name_snapshot" VARCHAR(200),
    "customer_phone_snapshot" VARCHAR(20),
    "provider_reference" VARCHAR(200),
    "account_reference" VARCHAR(200),
    "note" VARCHAR(500),
    "business_date" DATE NOT NULL,
    "request_id" UUID,
    "request_hash" CHAR(64),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "expense_number" VARCHAR(100) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "financial_account_id" UUID NOT NULL,
    "cash_session_id" UUID,
    "note" VARCHAR(500) NOT NULL,
    "business_date" DATE NOT NULL,
    "spent_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_transactions_organization_id_branch_id_business_da_idx" ON "external_transactions"("organization_id", "branch_id", "business_date", "created_at" DESC);

-- CreateIndex
CREATE INDEX "external_transactions_organization_id_transaction_type_busi_idx" ON "external_transactions"("organization_id", "transaction_type", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "external_transactions_organization_id_branch_id_txn_number_key" ON "external_transactions"("organization_id", "branch_id", "txn_number");

-- CreateIndex
CREATE UNIQUE INDEX "external_transactions_organization_id_branch_id_request_id_key" ON "external_transactions"("organization_id", "branch_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_transactions_id_organization_id_branch_id_key" ON "external_transactions"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "expenses_organization_id_branch_id_business_date_idx" ON "expenses"("organization_id", "branch_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_organization_id_branch_id_expense_number_key" ON "expenses"("organization_id", "branch_id", "expense_number");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_id_organization_id_branch_id_key" ON "expenses"("id", "organization_id", "branch_id");

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_user_id_organization_id_fkey" FOREIGN KEY ("closed_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transactions" ADD CONSTRAINT "external_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transactions" ADD CONSTRAINT "external_transactions_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transactions" ADD CONSTRAINT "external_transactions_customer_id_organization_id_fkey" FOREIGN KEY ("customer_id", "organization_id") REFERENCES "customers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transactions" ADD CONSTRAINT "external_transactions_financial_account_id_organization_id_fkey" FOREIGN KEY ("financial_account_id", "organization_id", "branch_id") REFERENCES "financial_accounts"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transactions" ADD CONSTRAINT "external_transactions_cash_session_id_organization_id_bran_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_transactions" ADD CONSTRAINT "external_transactions_created_by_user_id_organization_id_fkey" FOREIGN KEY ("created_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_financial_account_id_organization_id_branch_id_fkey" FOREIGN KEY ("financial_account_id", "organization_id", "branch_id") REFERENCES "financial_accounts"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_session_id_organization_id_branch_id_fkey" FOREIGN KEY ("cash_session_id", "organization_id", "branch_id") REFERENCES "cash_sessions"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_organization_id_fkey" FOREIGN KEY ("recorded_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- 0014 completion — value guards + append-only + runtime privileges (raw SQL).
-- Invisible to `migrate diff`; keeps 0011-0013 frozen and this migration
-- forward-only. Money is integer minor units; principal is never profit.
-- ============================================================================

-- 1. Value + integrity guards
ALTER TABLE "external_transactions"
  ADD CONSTRAINT "external_txn_principal_safe_check" CHECK ("principal_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "external_txn_fee_safe_check" CHECK ("fee_charged_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "external_txn_provider_charge_safe_check" CHECK ("provider_charge_minor" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "external_txn_profit_identity_check" CHECK ("service_profit_minor" = "fee_charged_minor" - "provider_charge_minor"),
  ADD CONSTRAINT "external_txn_cash_impact_safe_check" CHECK ("cash_impact_minor" BETWEEN -9007199254740991 AND 9007199254740991),
  ADD CONSTRAINT "external_txn_request_pair_check" CHECK (("request_id" IS NULL) = ("request_hash" IS NULL)),
  ADD CONSTRAINT "external_txn_request_hash_check" CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_positive_check" CHECK ("amount_minor" BETWEEN 1 AND 9007199254740991),
  ADD CONSTRAINT "expenses_note_nonblank_check" CHECK (length(btrim("note")) > 0);

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_closing_safe_check" CHECK (
    ("closing_counted_minor" IS NULL OR "closing_counted_minor" BETWEEN 0 AND 9007199254740991)
    AND ("closing_expected_minor" IS NULL OR "closing_expected_minor" BETWEEN 0 AND 9007199254740991)
  ),
  ADD CONSTRAINT "cash_sessions_variance_identity_check" CHECK (
    "closing_variance_minor" IS NULL
    OR "closing_variance_minor" = "closing_counted_minor" - "closing_expected_minor"
  );

-- 2. Append-only financial records: external_transactions + expenses are never
--    updated or deleted (a correction is a new compensating record).
CREATE TRIGGER "external_transactions_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "external_transactions" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_append_only_mutation"();
CREATE TRIGGER "expenses_immutable" BEFORE UPDATE OR DELETE OR TRUNCATE ON "expenses" FOR EACH STATEMENT EXECUTE FUNCTION "reject_sales_append_only_mutation"();

-- 3. Runtime privilege grants (mobileshop_app), mirroring the 0011-0013 matrix.
GRANT USAGE ON TYPE "ExternalProvider", "ExternalTransactionType", "ExternalCashDirection", "ExpenseCategory" TO mobileshop_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO mobileshop_app;

GRANT SELECT, INSERT ON TABLE "external_transactions", "expenses" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "external_transactions", "expenses" FROM mobileshop_app;

-- cash_sessions keeps its 0011/0013 grants (SELECT/INSERT/UPDATE); close is an UPDATE.
GRANT SELECT, INSERT, UPDATE ON TABLE "cash_sessions" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "cash_sessions" FROM mobileshop_app;

-- Audit stays append-only regardless of the above.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events" FROM mobileshop_app;
