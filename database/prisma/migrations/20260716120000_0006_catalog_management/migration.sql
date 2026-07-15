-- Catalog management: what the create-only slice (0005) could not express.
-- 0005 is applied and is never edited; every correction here is forward-only.
--
-- Three gaps close here:
--   1. Reference data had no optimistic concurrency token, so two managers
--      editing one category would silently overwrite each other.
--   2. Aliases and barcodes were unconditionally unique AND protected from
--      hard delete, so a mistyped barcode was burned inside the organization
--      forever. Deactivation plus partial uniqueness frees the value without
--      weakening the no-hard-delete protection.
--   3. The category tree had no cycle backstop; only a composite tenant key.

-- 1. Optimistic concurrency for reference data -------------------------------
-- product_variants already carries "version" from 0005.

ALTER TABLE "categories"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "categories_version_positive" CHECK ("version" > 0);

ALTER TABLE "brands"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "brands_version_positive" CHECK ("version" > 0);

ALTER TABLE "product_models"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "product_models_version_positive" CHECK ("version" > 0);

-- 2. Category tree integrity --------------------------------------------------
-- The composite foreign key in 0005 already blocks a cross-tenant parent. These
-- add the two structural rules it cannot express: no self-parent, and no cycle.

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parent_not_self"
  CHECK ("parent_category_id" IS DISTINCT FROM "id");

CREATE FUNCTION "reject_category_cycle"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ancestor_id UUID := NEW."parent_category_id";
  hops INTEGER := 0;
BEGIN
  -- Walking ancestors is only race-free if concurrent re-parents within one
  -- organization are serialized: two transactions could otherwise each add one
  -- safe-looking edge and commit a cycle between them. The lock is per
  -- organization and transaction-scoped, and only taken when a parent is set.
  PERFORM pg_advisory_xact_lock(
    hashtext('categories.parent_category_id'),
    hashtext(NEW."organization_id"::text)
  );

  WHILE ancestor_id IS NOT NULL LOOP
    IF ancestor_id = NEW."id" THEN
      RAISE EXCEPTION 'category % cannot be its own ancestor', NEW."id"
        USING ERRCODE = '23514';
    END IF;
    hops := hops + 1;
    IF hops > 64 THEN
      RAISE EXCEPTION 'category ancestry exceeds the supported depth'
        USING ERRCODE = '23514';
    END IF;
    SELECT "parent_category_id" INTO ancestor_id
      FROM "categories" WHERE "id" = ancestor_id;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "categories_no_cycle"
  BEFORE INSERT OR UPDATE OF "parent_category_id" ON "categories"
  FOR EACH ROW
  WHEN (NEW."parent_category_id" IS NOT NULL)
  EXECUTE FUNCTION "reject_category_cycle"();

-- 3. Reversible alias and barcode maintenance ---------------------------------
-- Deactivation, not deletion: the 0005 no-hard-delete triggers and REVOKEs
-- stay exactly as they are. Uniqueness becomes partial so a retired value can
-- be reused, which is the whole point of being able to correct a typo.

ALTER TABLE "product_aliases"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX "product_aliases_organization_id_normalized_alias_key";
CREATE UNIQUE INDEX "product_aliases_organization_id_normalized_alias_key"
  ON "product_aliases"("organization_id", "normalized_alias")
  WHERE "is_active";

ALTER TABLE "product_barcodes"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- A retired barcode must not stay flagged primary; with this invariant the
-- pre-existing one-primary-per-variant partial index from 0005 keeps holding
-- without needing to be rebuilt.
ALTER TABLE "product_barcodes"
  ADD CONSTRAINT "product_barcodes_primary_requires_active"
  CHECK (NOT "is_primary" OR "is_active");

DROP INDEX "product_barcodes_organization_id_barcode_key";
CREATE UNIQUE INDEX "product_barcodes_organization_id_barcode_key"
  ON "product_barcodes"("organization_id", "barcode")
  WHERE "is_active";
