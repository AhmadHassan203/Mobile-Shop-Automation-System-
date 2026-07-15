-- CreateEnum
CREATE TYPE "StockLocationKind" AS ENUM ('store', 'warehouse', 'virtual');

-- CreateEnum
CREATE TYPE "AuditSensitivity" AS ENUM ('normal', 'restricted');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('boolean', 'integer', 'money_minor', 'string', 'json');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Karachi',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address_line" VARCHAR(300),
    "city" VARCHAR(100) NOT NULL DEFAULT 'Lahore',
    "phone" VARCHAR(20),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" "StockLocationKind" NOT NULL DEFAULT 'store',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_user_id" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_scope_access" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "location_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_scope_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "branch_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "failure_reason" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "request_id" VARCHAR(128),
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64),
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "before_hash" CHAR(64),
    "after_hash" CHAR(64),
    "reason" VARCHAR(500),
    "request_id" VARCHAR(128),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "sensitivity" "AuditSensitivity" NOT NULL DEFAULT 'normal',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "value_type" "SettingValueType" NOT NULL DEFAULT 'json',
    "description" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "key" VARCHAR(60) NOT NULL,
    "prefix" VARCHAR(20) NOT NULL DEFAULT '',
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "period_key" VARCHAR(10),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_organization_id_is_active_idx" ON "branches"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_code_key" ON "branches"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_id_organization_id_key" ON "branches"("id", "organization_id");

-- CreateIndex
CREATE INDEX "stock_locations_organization_id_branch_id_is_active_idx" ON "stock_locations"("organization_id", "branch_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_organization_id_branch_id_code_key" ON "stock_locations"("organization_id", "branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_id_organization_id_branch_id_key" ON "stock_locations"("id", "organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "users_organization_id_is_active_idx" ON "users"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_organization_id_key" ON "users"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_code_key" ON "roles"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_organization_id_key" ON "roles"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "user_roles_organization_id_role_id_idx" ON "user_roles"("organization_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_organization_id_user_id_role_id_key" ON "user_roles"("organization_id", "user_id", "role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_scope_access_organization_id_user_id_idx" ON "user_scope_access"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_scope_access_organization_id_user_id_branch_id_locatio_key" ON "user_scope_access"("organization_id", "user_id", "branch_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_organization_id_user_id_idx" ON "sessions"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_email_attempted_at_idx" ON "login_attempts"("email", "attempted_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_address_attempted_at_idx" ON "login_attempts"("ip_address", "attempted_at");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_occurred_at_idx" ON "audit_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit_events"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_action_occurred_at_idx" ON "audit_events"("action", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "application_settings_organization_id_branch_id_key_key" ON "application_settings"("organization_id", "branch_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_organization_id_branch_id_key_period_key_key" ON "number_sequences"("organization_id", "branch_id", "key", "period_key");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_organization_id_fkey" FOREIGN KEY ("role_id", "organization_id") REFERENCES "roles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_user_id_organization_id_fkey" FOREIGN KEY ("assigned_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_scope_access" ADD CONSTRAINT "user_scope_access_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_scope_access" ADD CONSTRAINT "user_scope_access_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_scope_access" ADD CONSTRAINT "user_scope_access_location_id_organization_id_branch_id_fkey" FOREIGN KEY ("location_id", "organization_id", "branch_id") REFERENCES "stock_locations"("id", "organization_id", "branch_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_updated_by_organization_id_fkey" FOREIGN KEY ("updated_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Database-enforced invariants Prisma cannot express
-- =============================================================================

-- Normalized identity and non-negative/version/date invariants.
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "organizations_timezone_check" CHECK (length(btrim("timezone")) > 0);

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_code_check" CHECK (length(btrim("code")) > 0);

ALTER TABLE "stock_locations"
  ADD CONSTRAINT "stock_locations_code_check" CHECK (length(btrim("code")) > 0);

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "users_failed_login_count_check" CHECK ("failed_login_count" >= 0);

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_code_normalized_check" CHECK ("code" = lower(btrim("code")));

ALTER TABLE "permissions"
  ADD CONSTRAINT "permissions_key_normalized_check" CHECK (
    "key" = lower(btrim("key")) AND position('.' in "key") > 1
  );

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_expiry_check" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "sessions_revocation_check" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at"),
  ADD CONSTRAINT "sessions_last_seen_check" CHECK ("last_seen_at" >= "created_at");

ALTER TABLE "login_attempts"
  ADD CONSTRAINT "login_attempts_email_normalized_check" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "login_attempts_outcome_check" CHECK (
    ("succeeded" AND "failure_reason" IS NULL)
    OR (NOT "succeeded" AND "failure_reason" IS NOT NULL)
  );

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_action_check" CHECK (length(btrim("action")) > 0),
  ADD CONSTRAINT "audit_events_entity_type_check" CHECK (length(btrim("entity_type")) > 0),
  ADD CONSTRAINT "audit_events_before_hash_check" CHECK (
    "before_hash" IS NULL OR "before_hash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "audit_events_after_hash_check" CHECK (
    "after_hash" IS NULL OR "after_hash" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "application_settings"
  ADD CONSTRAINT "application_settings_key_check" CHECK (length(btrim("key")) > 0),
  ADD CONSTRAINT "application_settings_version_check" CHECK ("version" >= 1);

ALTER TABLE "number_sequences"
  ADD CONSTRAINT "number_sequences_key_check" CHECK (length(btrim("key")) > 0),
  ADD CONSTRAINT "number_sequences_next_value_check" CHECK ("next_value" >= 1),
  ADD CONSTRAINT "number_sequences_padding_check" CHECK ("padding" BETWEEN 1 AND 20);

-- PostgreSQL regular UNIQUE indexes treat NULL values as distinct. These
-- indexes enforce organization/branch defaults and nullable-scope uniqueness.
CREATE UNIQUE INDEX "branches_one_default_per_organization_uq"
  ON "branches" ("organization_id") WHERE "is_default";

CREATE UNIQUE INDEX "stock_locations_one_default_per_branch_uq"
  ON "stock_locations" ("branch_id") WHERE "is_default";

CREATE UNIQUE INDEX "users_organization_email_ci_uq"
  ON "users" ("organization_id", lower("email"));

CREATE UNIQUE INDEX "user_scope_access_whole_branch_uq"
  ON "user_scope_access" ("organization_id", "user_id", "branch_id")
  WHERE "location_id" IS NULL;

CREATE UNIQUE INDEX "application_settings_scope_key_uq"
  ON "application_settings" ("organization_id", "branch_id", "key") NULLS NOT DISTINCT;

CREATE UNIQUE INDEX "number_sequences_scope_key_uq"
  ON "number_sequences" ("organization_id", "branch_id", "key", "period_key") NULLS NOT DISTINCT;

-- Audit history is append-only at both the privilege and database-trigger layer.
CREATE FUNCTION "reject_audit_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; write a compensating event instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_event_mutation"();

GRANT USAGE ON TYPE "StockLocationKind", "AuditSensitivity", "SettingValueType" TO mobileshop_app;
GRANT SELECT, INSERT ON TABLE "audit_events" TO mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events" FROM mobileshop_app;
