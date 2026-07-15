-- Inventory foundation: physical stock, the IMEI namespace and the append-only
-- movement ledger. Balances are DERIVED from this ledger plus the unit and
-- batch rows; there is deliberately no stored balance table, because a cached
-- total is one bug away from disagreeing with the ledger that produced it.
--
-- `stock_locations` already exists and is applied (0001), so it is extended
-- here rather than recreated: it only lacked an optimistic concurrency token
-- and the no-hard-delete protection the catalog tables received in 0005. Its
-- `kind` column and the "StockLocationKind" enum already carry exactly the
-- store/warehouse/virtual vocabulary this slice needs, so no parallel type is
-- introduced. 0001-0006 are applied and are never edited; every correction
-- here is forward-only.
--
-- Cost columns on serialized_units are reserved for the purchasing slice. They
-- exist so receiving has somewhere to put a landed cost, and NO inventory
-- contract names them: shared/src/inventory.ts neither accepts nor exposes
-- them (13_ §8 — a salesperson must never see supplier cost).

CREATE TYPE "SerializedStockState" AS ENUM ('pending_verification', 'quarantined', 'available', 'reserved', 'sold', 'returned_inspection', 'defective', 'supplier_warranty', 'customer_warranty', 'repair', 'written_off', 'purchase_returned');
CREATE TYPE "MovementType" AS ENUM ('purchase_receive', 'sale', 'sale_return', 'purchase_return', 'transfer_out', 'transfer_in', 'reserve', 'release', 'adjustment_in', 'adjustment_out', 'damage', 'write_off', 'repair_issue', 'repair_return');
CREATE TYPE "DeviceIdentifierType" AS ENUM ('imei', 'serial');

-- 1. Optimistic concurrency for stock locations -------------------------------
-- Mirrors what 0006 did for the catalog reference tables.

ALTER TABLE "stock_locations"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "stock_locations_version_positive" CHECK ("version" > 0);

-- 2. Physical stock -----------------------------------------------------------

CREATE TABLE "serialized_units" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "state" "SerializedStockState" NOT NULL,
    "condition" "ProductCondition" NOT NULL,
    "pta_status" "PtaStatus" NOT NULL,
    "received_at" TIMESTAMPTZ(3),
    "actual_cost_minor" BIGINT,
    "landed_cost_minor" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "serialized_units_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "serialized_units_version_positive" CHECK ("version" > 0),
    CONSTRAINT "serialized_units_actual_cost_nonnegative" CHECK ("actual_cost_minor" IS NULL OR "actual_cost_minor" >= 0),
    CONSTRAINT "serialized_units_landed_cost_nonnegative" CHECK ("landed_cost_minor" IS NULL OR "landed_cost_minor" >= 0)
);

-- IMEI1, IMEI2 and serial share ONE uniqueness namespace per organization, so
-- the same IMEI cannot be imei1 on one handset and imei2 on another. That is
-- the entire reason this is a table and not three columns on the unit above.
CREATE TABLE "device_identifiers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "serialized_unit_id" UUID NOT NULL,
    "identifier_type" "DeviceIdentifierType" NOT NULL,
    "normalized_value" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_identifiers_pkey" PRIMARY KEY ("id"),
    -- The normalized alphabet produced by shared/src/imei.ts normalizeImei
    -- (digits) and normalizeSerial (upper-case alphanumerics). A raw value such
    -- as "356938-035643809" cannot be stored, so uniqueness cannot be dodged by
    -- storing an un-normalized spelling of a value already in stock.
    CONSTRAINT "device_identifiers_normalized_value_format" CHECK ("normalized_value" ~ '^[A-Z0-9]+$')
);

CREATE TABLE "stock_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_batches_version_positive" CHECK ("version" > 0),
    -- 13_ §23: negative stock is blocked at the DATABASE, not merely in the API.
    CONSTRAINT "stock_batches_on_hand_nonnegative" CHECK ("quantity_on_hand" >= 0),
    CONSTRAINT "stock_batches_reserved_valid" CHECK ("quantity_reserved" >= 0 AND "quantity_reserved" <= "quantity_on_hand")
);

-- 3. The append-only ledger ---------------------------------------------------

CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "serialized_unit_id" UUID,
    "stock_batch_id" UUID,
    "stock_location_id" UUID NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from_state" "SerializedStockState",
    "to_state" "SerializedStockState",
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "reason" VARCHAR(500),
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
    -- Direction comes from movement_type via MOVEMENT_ON_HAND_SIGN, never from
    -- a negative quantity: a movement with the wrong sign is unrepresentable.
    CONSTRAINT "inventory_movements_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "inventory_movements_target_exclusive" CHECK (("serialized_unit_id" IS NOT NULL) <> ("stock_batch_id" IS NOT NULL)),
    CONSTRAINT "inventory_movements_serialized_quantity" CHECK ("serialized_unit_id" IS NULL OR "quantity" = 1),
    -- Lifecycle states describe one physical device, so a batch movement can
    -- never carry them.
    CONSTRAINT "inventory_movements_states_serialized_only" CHECK ("serialized_unit_id" IS NOT NULL OR ("from_state" IS NULL AND "to_state" IS NULL))
);

CREATE INDEX "serialized_units_organization_id_product_variant_id_state_idx" ON "serialized_units"("organization_id", "product_variant_id", "state");
CREATE INDEX "serialized_units_organization_id_stock_location_id_state_idx" ON "serialized_units"("organization_id", "stock_location_id", "state");
CREATE INDEX "serialized_units_organization_id_received_at_idx" ON "serialized_units"("organization_id", "received_at");
CREATE UNIQUE INDEX "serialized_units_id_organization_id_key" ON "serialized_units"("id", "organization_id");

CREATE INDEX "device_identifiers_organization_id_serialized_unit_id_idx" ON "device_identifiers"("organization_id", "serialized_unit_id");
-- The critical constraint: one IMEI or serial per organization, full stop.
CREATE UNIQUE INDEX "device_identifiers_organization_id_normalized_value_key" ON "device_identifiers"("organization_id", "normalized_value");

-- One batch row per variant per location.
CREATE UNIQUE INDEX "stock_batches_organization_id_product_variant_id_stock_loca_key" ON "stock_batches"("organization_id", "product_variant_id", "stock_location_id");
CREATE UNIQUE INDEX "stock_batches_id_organization_id_key" ON "stock_batches"("id", "organization_id");

CREATE INDEX "inventory_movements_organization_id_product_variant_id_occu_idx" ON "inventory_movements"("organization_id", "product_variant_id", "occurred_at");
CREATE INDEX "inventory_movements_organization_id_serialized_unit_id_occu_idx" ON "inventory_movements"("organization_id", "serialized_unit_id", "occurred_at");
CREATE INDEX "inventory_movements_organization_id_movement_type_occurred__idx" ON "inventory_movements"("organization_id", "movement_type", "occurred_at");
CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

-- Tenant-consistent composite foreign keys prevent a valid ID from another
-- organization being attached to the caller's stock. The stock_location keys
-- deliberately carry branch_id as well as organization_id: that is what forces
-- a unit's branch to agree with the branch of the location holding it.
ALTER TABLE "serialized_units" ADD CONSTRAINT "serialized_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "serialized_units" ADD CONSTRAINT "serialized_units_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "serialized_units" ADD CONSTRAINT "serialized_units_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "serialized_units" ADD CONSTRAINT "serialized_units_stock_location_id_organization_id_branch__fkey" FOREIGN KEY ("stock_location_id", "organization_id", "branch_id") REFERENCES "stock_locations"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_identifiers" ADD CONSTRAINT "device_identifiers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_identifiers" ADD CONSTRAINT "device_identifiers_serialized_unit_id_organization_id_fkey" FOREIGN KEY ("serialized_unit_id", "organization_id") REFERENCES "serialized_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_stock_location_id_organization_id_branch_id_fkey" FOREIGN KEY ("stock_location_id", "organization_id", "branch_id") REFERENCES "stock_locations"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branch_id_organization_id_fkey" FOREIGN KEY ("branch_id", "organization_id") REFERENCES "branches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_variant_id_organization_id_fkey" FOREIGN KEY ("product_variant_id", "organization_id") REFERENCES "product_variants"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_serialized_unit_id_organization_id_fkey" FOREIGN KEY ("serialized_unit_id", "organization_id") REFERENCES "serialized_units"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_stock_batch_id_organization_id_fkey" FOREIGN KEY ("stock_batch_id", "organization_id") REFERENCES "stock_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_stock_location_id_organization_id_bran_fkey" FOREIGN KEY ("stock_location_id", "organization_id", "branch_id") REFERENCES "stock_locations"("id", "organization_id", "branch_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Stock records are retired, never hard-deleted ----------------------------
-- Same shape as reject_catalog_hard_delete (0005), under its own name: these
-- are inventory records, and a shared function would tie the two slices'
-- messages together for no benefit.

CREATE FUNCTION "reject_inventory_hard_delete"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory records cannot be hard-deleted; retire or adjust them instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "stock_locations_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "stock_locations" FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_hard_delete"();
CREATE TRIGGER "serialized_units_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "serialized_units" FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_hard_delete"();
CREATE TRIGGER "stock_batches_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "stock_batches" FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_hard_delete"();
CREATE TRIGGER "device_identifiers_no_hard_delete" BEFORE DELETE OR TRUNCATE ON "device_identifiers" FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_hard_delete"();

-- 5. The ledger is append-only ------------------------------------------------
-- A correction is a new compensating movement, never an edit to history. This
-- mirrors reject_audit_event_mutation (0001) and is enforced at both the
-- trigger and the privilege layer, so neither a defect nor direct SQL through
-- the application role can rewrite what happened to stock.

CREATE FUNCTION "reject_inventory_movement_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements is append-only; post a compensating movement instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "inventory_movements_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "inventory_movements"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_movement_mutation"();

-- 6. Privileges ---------------------------------------------------------------
-- Default privileges from 0003 grant DML on new objects; revoke the destructive
-- rights explicitly. The runtime role may read and append to the ledger, and
-- nothing more.

GRANT USAGE ON TYPE "SerializedStockState", "MovementType", "DeviceIdentifierType" TO mobileshop_app;
REVOKE DELETE, TRUNCATE ON TABLE "stock_locations", "serialized_units", "stock_batches", "device_identifiers" FROM mobileshop_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "inventory_movements" FROM mobileshop_app;
