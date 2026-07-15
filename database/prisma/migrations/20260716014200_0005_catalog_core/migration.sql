-- Catalog core: sellable definitions only. Physical stock/IMEI records belong
-- to the Inventory slice and cannot enter through these tables or APIs.

CREATE TYPE "TrackingType" AS ENUM ('serialized', 'quantity');
CREATE TYPE "ProductCondition" AS ENUM ('new', 'used', 'open_box', 'refurbished');
CREATE TYPE "PtaStatus" AS ENUM ('pta_approved', 'non_pta', 'pta_pending', 'not_applicable', 'unknown');
CREATE TYPE "WarrantyType" AS ENUM ('official', 'local', 'shop', 'none', 'supplier');

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_category_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "categories_name_nonempty" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "categories_slug_normalized" CHECK ("slug" = lower("slug") AND length(btrim("slug")) > 0)
);

CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "brands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brands_name_nonempty" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "brands_slug_normalized" CHECK ("slug" = lower("slug") AND length(btrim("slug")) > 0)
);

CREATE TABLE "product_models" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "canonical_name" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_models_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_models_name_nonempty" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "product_models_canonical_name_normalized" CHECK ("canonical_name" = lower("canonical_name") AND length(btrim("canonical_name")) > 0)
);

CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_model_id" UUID NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "tracking_type" "TrackingType" NOT NULL,
    "condition" "ProductCondition" NOT NULL,
    "pta_status" "PtaStatus" NOT NULL,
    "ram" VARCHAR(100),
    "storage" VARCHAR(100),
    "color" VARCHAR(100),
    "region" VARCHAR(100),
    "warranty_type" "WarrantyType" NOT NULL DEFAULT 'none',
    "warranty_months" INTEGER,
    "attributes" JSONB,
    "default_price_minor" BIGINT,
    "min_price_minor" BIGINT,
    "reorder_point" INTEGER,
    "case_pack_size" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_variants_sku_format" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
    CONSTRAINT "product_variants_name_nonempty" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "product_variants_warranty_months_valid" CHECK (
      ("warranty_type" = 'none' AND "warranty_months" IS NULL) OR
      ("warranty_type" <> 'none' AND "warranty_months" IS NOT NULL AND "warranty_months" BETWEEN 1 AND 120)
    ),
    CONSTRAINT "product_variants_default_price_nonnegative" CHECK ("default_price_minor" IS NULL OR "default_price_minor" >= 0),
    CONSTRAINT "product_variants_min_price_nonnegative" CHECK ("min_price_minor" IS NULL OR "min_price_minor" >= 0),
    CONSTRAINT "product_variants_reorder_point_nonnegative" CHECK ("reorder_point" IS NULL OR "reorder_point" >= 0),
    CONSTRAINT "product_variants_case_pack_positive" CHECK ("case_pack_size" IS NULL OR "case_pack_size" > 0),
    CONSTRAINT "product_variants_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "product_aliases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "alias" VARCHAR(200) NOT NULL,
    "normalized_alias" VARCHAR(200) NOT NULL,
    "source" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_aliases_alias_nonempty" CHECK (length(btrim("alias")) > 0),
    CONSTRAINT "product_aliases_normalized" CHECK ("normalized_alias" = lower("normalized_alias") AND length(btrim("normalized_alias")) > 0)
);

CREATE TABLE "product_barcodes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "barcode" VARCHAR(128) NOT NULL,
    "barcode_type" VARCHAR(30),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_barcodes_value_format" CHECK (length("barcode") > 0 AND "barcode" !~ '[[:space:]]')
);

CREATE INDEX "categories_organization_id_parent_category_id_is_active_idx" ON "categories"("organization_id", "parent_category_id", "is_active");
CREATE UNIQUE INDEX "categories_organization_id_slug_key" ON "categories"("organization_id", "slug");
CREATE UNIQUE INDEX "categories_id_organization_id_key" ON "categories"("id", "organization_id");

CREATE INDEX "brands_organization_id_is_active_name_idx" ON "brands"("organization_id", "is_active", "name");
CREATE UNIQUE INDEX "brands_organization_id_slug_key" ON "brands"("organization_id", "slug");
CREATE UNIQUE INDEX "brands_id_organization_id_key" ON "brands"("id", "organization_id");

CREATE INDEX "product_models_organization_id_category_id_is_active_idx" ON "product_models"("organization_id", "category_id", "is_active");
CREATE INDEX "product_models_organization_id_brand_id_is_active_idx" ON "product_models"("organization_id", "brand_id", "is_active");
CREATE UNIQUE INDEX "product_models_organization_id_brand_id_canonical_name_key" ON "product_models"("organization_id", "brand_id", "canonical_name");
CREATE UNIQUE INDEX "product_models_id_organization_id_key" ON "product_models"("id", "organization_id");

CREATE INDEX "product_variants_organization_id_product_model_id_is_active_idx" ON "product_variants"("organization_id", "product_model_id", "is_active");
CREATE INDEX "product_variants_organization_id_name_idx" ON "product_variants"("organization_id", "name");
CREATE UNIQUE INDEX "product_variants_organization_id_sku_key" ON "product_variants"("organization_id", "sku");
CREATE UNIQUE INDEX "product_variants_id_organization_id_key" ON "product_variants"("id", "organization_id");

CREATE INDEX "product_aliases_organization_id_product_variant_id_idx" ON "product_aliases"("organization_id", "product_variant_id");
CREATE UNIQUE INDEX "product_aliases_organization_id_normalized_alias_key" ON "product_aliases"("organization_id", "normalized_alias");

CREATE INDEX "product_barcodes_organization_id_product_variant_id_idx" ON "product_barcodes"("organization_id", "product_variant_id");
CREATE UNIQUE INDEX "product_barcodes_organization_id_barcode_key" ON "product_barcodes"("organization_id", "barcode");
CREATE UNIQUE INDEX "product_barcodes_one_primary_per_variant" ON "product_barcodes"("product_variant_id") WHERE "is_primary";

-- Tenant-consistent composite foreign keys prevent a valid ID from another
-- organization being attached to the caller's catalog tree.
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_organization_id_fkey" FOREIGN KEY ("parent_category_id", "organization_id") REFERENCES "categories"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_brand_id_organization_id_fkey" FOREIGN KEY ("brand_id", "organization_id") REFERENCES "brands"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_category_id_organization_id_fkey" FOREIGN KEY ("category_id", "organization_id") REFERENCES "categories"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_model_id_organization_id_fkey" FOREIGN KEY ("product_model_id", "organization_id") REFERENCES "product_models"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Master data is deactivated, never hard-deleted. The trigger protects against
-- direct SQL as well as a future application defect.
CREATE FUNCTION "reject_catalog_hard_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'catalog records cannot be hard-deleted; deactivate them instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "categories_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "categories" FOR EACH STATEMENT EXECUTE FUNCTION "reject_catalog_hard_delete"();
CREATE TRIGGER "brands_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "brands" FOR EACH STATEMENT EXECUTE FUNCTION "reject_catalog_hard_delete"();
CREATE TRIGGER "product_models_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "product_models" FOR EACH STATEMENT EXECUTE FUNCTION "reject_catalog_hard_delete"();
CREATE TRIGGER "product_variants_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "product_variants" FOR EACH STATEMENT EXECUTE FUNCTION "reject_catalog_hard_delete"();
CREATE TRIGGER "product_aliases_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "product_aliases" FOR EACH STATEMENT EXECUTE FUNCTION "reject_catalog_hard_delete"();
CREATE TRIGGER "product_barcodes_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "product_barcodes" FOR EACH STATEMENT EXECUTE FUNCTION "reject_catalog_hard_delete"();

-- Default privileges from 0003 grant DML to new objects. Revoke destructive
-- rights explicitly and reassert the pre-existing 0004 evidence protections.
REVOKE DELETE, TRUNCATE ON TABLE "categories", "brands", "product_models", "product_variants", "product_aliases", "product_barcodes" FROM mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events", "login_attempts" FROM mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "users" FROM mobileshop_app;
