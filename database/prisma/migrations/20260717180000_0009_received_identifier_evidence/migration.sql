-- Preserve identifier slot identity and freeze the IMEI/serial evidence that
-- was recorded by a posted goods receipt. Migration 0008 remains untouched;
-- this is a forward-only hardening migration.

-- 1. Deterministic legacy backfill ------------------------------------------
--
-- Existing rows predate explicit slots. Refuse impossible legacy cardinality
-- before assigning positions so the migration never invents a third IMEI or a
-- second serial slot. Valid rows are ranked deterministically by their original
-- creation timestamp and UUID tie-breaker.

ALTER TABLE "device_identifiers"
  ADD COLUMN "position" SMALLINT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "device_identifiers"
     GROUP BY "serialized_unit_id", "identifier_type"
    HAVING count(*) > CASE "identifier_type"
      WHEN 'imei'::"DeviceIdentifierType" THEN 2
      WHEN 'serial'::"DeviceIdentifierType" THEN 1
    END
  ) THEN
    RAISE EXCEPTION 'existing device identifiers exceed the supported IMEI/serial slot cardinality'
      USING ERRCODE = '23514',
            CONSTRAINT = 'device_identifiers_type_position_valid';
  END IF;
END;
$$;

WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "serialized_unit_id", "identifier_type"
           ORDER BY "created_at", "id"
         )::SMALLINT AS "position"
    FROM "device_identifiers"
)
UPDATE "device_identifiers" AS identifier
   SET "position" = ranked."position"
  FROM ranked
 WHERE ranked."id" = identifier."id";

ALTER TABLE "device_identifiers"
  ALTER COLUMN "position" SET NOT NULL,
  ADD CONSTRAINT "device_identifiers_type_position_valid" CHECK (
    ("identifier_type" = 'imei' AND "position" IN (1, 2)) OR
    ("identifier_type" = 'serial' AND "position" = 1)
  );

CREATE UNIQUE INDEX "device_identifiers_unit_type_position_key"
  ON "device_identifiers"("serialized_unit_id", "identifier_type", "position");

-- 2. Posted identifier evidence is immutable -------------------------------
--
-- Receipt-linked units and their identifiers are created inside the same
-- atomic posting transaction (TXN-1). New identifiers are accepted only while
-- that parent receipt's posting transaction is current. Updating, reassigning
-- or deleting receipt evidence is never a legitimate posting operation, so it
-- is rejected even inside TXN-1. The 0007 statement trigger continues to
-- prohibit all device-identifier hard deletes and truncates, including
-- non-receipt rows.

CREATE FUNCTION "guard_received_device_identifier_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_receipt_txid BIGINT;
  new_receipt_txid BIGINT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT receipt."posting_txid" INTO old_receipt_txid
      FROM "serialized_units" AS unit
      JOIN "goods_receipt_lines" AS line
        ON line."id" = unit."goods_receipt_line_id"
       AND line."organization_id" = unit."organization_id"
      JOIN "goods_receipts" AS receipt
        ON receipt."id" = line."goods_receipt_id"
       AND receipt."organization_id" = line."organization_id"
     WHERE unit."id" = OLD."serialized_unit_id"
       AND unit."organization_id" = OLD."organization_id";
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT receipt."posting_txid" INTO new_receipt_txid
      FROM "serialized_units" AS unit
      JOIN "goods_receipt_lines" AS line
        ON line."id" = unit."goods_receipt_line_id"
       AND line."organization_id" = unit."organization_id"
      JOIN "goods_receipts" AS receipt
        ON receipt."id" = line."goods_receipt_id"
       AND receipt."organization_id" = line."organization_id"
     WHERE unit."id" = NEW."serialized_unit_id"
       AND unit."organization_id" = NEW."organization_id";
  END IF;

  IF TG_OP = 'INSERT' AND
     new_receipt_txid IS NOT NULL AND
     new_receipt_txid <> txid_current() THEN
    RAISE EXCEPTION 'received device identifiers are immutable after the receipt posting transaction'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND
     (old_receipt_txid IS NOT NULL OR new_receipt_txid IS NOT NULL) THEN
    RAISE EXCEPTION 'received device identifiers cannot be updated, reassigned or deleted'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "device_identifiers_received_evidence_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "device_identifiers"
FOR EACH ROW EXECUTE FUNCTION "guard_received_device_identifier_mutation"();
