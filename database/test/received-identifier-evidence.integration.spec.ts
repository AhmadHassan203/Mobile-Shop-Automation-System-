import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workspaceRoot =
  path.basename(process.cwd()).toLowerCase() === "database"
    ? path.resolve(process.cwd(), "..")
    : process.cwd();

const testEnvironmentPath = path.join(workspaceRoot, ".env");
if (existsSync(testEnvironmentPath)) {
  const fileEnvironment = parse(readFileSync(testEnvironmentPath));
  for (const key of [
    "TEST_DATABASE_URL",
    "TEST_MIGRATION_DATABASE_URL",
  ] as const) {
    const value = fileEnvironment[key];
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = value;
    }
  }
}

function requiredUrl(
  name: "TEST_DATABASE_URL" | "TEST_MIGRATION_DATABASE_URL",
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for database integration tests`);
  }
  return value;
}

const runtimePool = new Pool({
  connectionString: requiredUrl("TEST_DATABASE_URL"),
  max: 2,
});
const migratorPool = new Pool({
  connectionString: requiredUrl("TEST_MIGRATION_DATABASE_URL"),
  max: 2,
});

const MIGRATION_NAME = "20260717180000_0009_received_identifier_evidence";
const databasePackageRoot =
  path.basename(process.cwd()).toLowerCase() === "database"
    ? process.cwd()
    : path.join(workspaceRoot, "database");
const migrationSqlPath = path.join(
  databasePackageRoot,
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);
const migrationSql = readFileSync(migrationSqlPath, "utf8");

const CONSTRAINTS = Object.freeze({
  TYPE_POSITION: "device_identifiers_type_position_valid",
  SLOT_UNIQUE: "device_identifiers_unit_type_position_key",
});

const BACKFILL = Object.freeze({
  organizationId: "00000000-0000-4000-8000-000000000001",
  unitId: "00000000-0000-4000-8000-000000000002",
  imeiOneId: "00000000-0000-4000-8000-000000000101",
  imeiTwoId: "00000000-0000-4000-8000-000000000102",
  serialId: "00000000-0000-4000-8000-000000000103",
});

interface PostedIdentifierFixture {
  readonly organizationId: string;
  readonly receivedUnitId: string;
  readonly imeiOneId: string;
  readonly imeiTwoId: string;
  readonly serialId: string;
}

let postedFixture: PostedIdentifierFixture | undefined;
let savepointSequence = 0;
const sandboxSchema = `identifier_evidence_${randomUUID().replaceAll("-", "")}`;

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function setSandboxSearchPath(client: PoolClient): Promise<void> {
  await client.query(
    `SET LOCAL search_path TO ${quotedIdentifier(sandboxSchema)}, public`,
  );
}

async function sandboxTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await setSandboxSearchPath(client);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function sandboxRollback<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await setSandboxSearchPath(client);
    return await work(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function expectPgError(
  client: PoolClient,
  work: () => Promise<unknown>,
  expectedCode: string,
  expectedConstraint?: string,
): Promise<void> {
  savepointSequence += 1;
  const savepoint = `expected_identifier_error_${savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);

  try {
    await work();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    expect(error).toMatchObject(
      expectedConstraint === undefined
        ? { code: expectedCode }
        : { code: expectedCode, constraint: expectedConstraint },
    );
    return;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(
    `Expected PostgreSQL error ${expectedCode}${
      expectedConstraint === undefined ? "" : ` (${expectedConstraint})`
    }, but the statement succeeded`,
  );
}

async function expectRuntimeTransactionError(
  work: (client: PoolClient) => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  const client = await runtimePool.connect();
  await client.query("BEGIN");
  try {
    await setSandboxSearchPath(client);
    await work(client);
  } catch (error) {
    expect(error).toMatchObject({ code: expectedCode });
    return;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
  throw new Error(
    `Expected PostgreSQL error ${expectedCode}, but TXN succeeded`,
  );
}

async function ensureMigrationApplied(): Promise<void> {
  const applied = await migratorPool.query<{ readonly exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'device_identifiers'
          AND column_name = 'position'
     ) AS exists`,
  );
  if (applied.rows[0]?.exists === true) return;

  const prerequisite = await migratorPool.query<{ readonly exists: boolean }>(
    `SELECT to_regclass('goods_receipts') IS NOT NULL AS exists`,
  );
  if (prerequisite.rows[0]?.exists !== true) {
    throw new Error("0008 purchasing foundation must be applied before 0009");
  }

  const checksum = createHash("sha256").update(migrationSql).digest("hex");
  const client = await migratorPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(migrationSql);
    await client.query(
      `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, started_at,
          applied_steps_count)
       VALUES ($1, $2, now(), $3, now(), 1)`,
      [randomUUID(), checksum, MIGRATION_NAME],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createBackfillSandbox(): Promise<void> {
  const client = await migratorPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${quotedIdentifier(sandboxSchema)}`);
    await setSandboxSearchPath(client);
    await client.query(`
      CREATE TYPE "DeviceIdentifierType" AS ENUM ('imei', 'serial');

      CREATE TABLE "goods_receipts" (
        "id" UUID PRIMARY KEY,
        "organization_id" UUID NOT NULL,
        "posting_txid" BIGINT NOT NULL
      );
      CREATE TABLE "goods_receipt_lines" (
        "id" UUID PRIMARY KEY,
        "organization_id" UUID NOT NULL,
        "goods_receipt_id" UUID NOT NULL
      );
      CREATE TABLE "serialized_units" (
        "id" UUID PRIMARY KEY,
        "organization_id" UUID NOT NULL,
        "goods_receipt_line_id" UUID
      );
      CREATE TABLE "device_identifiers" (
        "id" UUID PRIMARY KEY,
        "organization_id" UUID NOT NULL,
        "serialized_unit_id" UUID NOT NULL,
        "identifier_type" "DeviceIdentifierType" NOT NULL,
        "normalized_value" VARCHAR(64) NOT NULL,
        "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "device_identifiers_serialized_unit_fkey"
          FOREIGN KEY ("serialized_unit_id") REFERENCES "serialized_units"("id")
      );
      CREATE UNIQUE INDEX "device_identifiers_organization_id_normalized_value_key"
        ON "device_identifiers"("organization_id", "normalized_value");

      INSERT INTO "serialized_units"
        ("id", "organization_id", "goods_receipt_line_id")
      VALUES
        ('${BACKFILL.unitId}', '${BACKFILL.organizationId}', NULL);

      -- Reverse insertion order and tie created_at. The UUID tie-breaker, not
      -- insertion order, must make ...101 IMEI 1 and ...102 IMEI 2.
      INSERT INTO "device_identifiers"
        ("id", "organization_id", "serialized_unit_id", "identifier_type",
         "normalized_value", "created_at")
      VALUES
        ('${BACKFILL.imeiTwoId}', '${BACKFILL.organizationId}',
         '${BACKFILL.unitId}', 'imei', '356938035643817',
         '2026-01-01T00:00:00Z'),
        ('${BACKFILL.imeiOneId}', '${BACKFILL.organizationId}',
         '${BACKFILL.unitId}', 'imei', '356938035643809',
         '2026-01-01T00:00:00Z'),
        ('${BACKFILL.serialId}', '${BACKFILL.organizationId}',
         '${BACKFILL.unitId}', 'serial', 'LEGACYSERIAL1',
         '2025-12-31T00:00:00Z');
    `);
    await client.query(migrationSql);
    await client.query(
      `GRANT USAGE ON SCHEMA ${quotedIdentifier(sandboxSchema)} TO mobileshop_app`,
    );
    await client.query(
      'GRANT USAGE ON TYPE "DeviceIdentifierType" TO mobileshop_app',
    );
    await client.query(
      `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ${quotedIdentifier(
        sandboxSchema,
      )} TO mobileshop_app`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

afterAll(async () => {
  await migratorPool.query(
    `DROP SCHEMA IF EXISTS ${quotedIdentifier(sandboxSchema)} CASCADE`,
  );
  await Promise.all([runtimePool.end(), migratorPool.end()]);
});

describe("0009 received identifier evidence migration", () => {
  beforeAll(async () => {
    await ensureMigrationApplied();
    await createBackfillSandbox();
  });

  it("records 0009 once with the required column, constraint, index and trigger", async () => {
    const ledger = await migratorPool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
         FROM _prisma_migrations
        WHERE migration_name = $1
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL`,
      [MIGRATION_NAME],
    );
    expect(ledger.rows[0]?.count).toBe("1");

    const column = await migratorPool.query<{
      readonly dataType: string;
      readonly isNullable: string;
    }>(
      `SELECT data_type AS "dataType", is_nullable AS "isNullable"
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'device_identifiers'
          AND column_name = 'position'`,
    );
    expect(column.rows).toEqual([{ dataType: "smallint", isNullable: "NO" }]);

    const objects = await migratorPool.query<{
      readonly checkExists: boolean;
      readonly indexExists: boolean;
      readonly triggerExists: boolean;
    }>(
      `SELECT
         to_regclass($1) IS NOT NULL AS "indexExists",
         EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conrelid = 'device_identifiers'::regclass
              AND conname = $2
         ) AS "checkExists",
         EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'device_identifiers'::regclass
              AND tgname = 'device_identifiers_received_evidence_guard'
              AND NOT tgisinternal
         ) AS "triggerExists"`,
      [CONSTRAINTS.SLOT_UNIQUE, CONSTRAINTS.TYPE_POSITION],
    );
    expect(objects.rows[0]).toEqual({
      checkExists: true,
      indexExists: true,
      triggerExists: true,
    });
  });

  it("backfills legacy IMEI and serial slots by created_at then id", async () => {
    await sandboxRollback(migratorPool, async (client) => {
      const identifiers = await client.query<{
        readonly id: string;
        readonly identifierType: "imei" | "serial";
        readonly position: number;
      }>(
        `SELECT id::text AS id, identifier_type AS "identifierType", position
           FROM device_identifiers
          WHERE serialized_unit_id = $1
          ORDER BY identifier_type, position`,
        [BACKFILL.unitId],
      );
      expect(identifiers.rows).toEqual([
        {
          id: BACKFILL.imeiOneId,
          identifierType: "imei",
          position: 1,
        },
        {
          id: BACKFILL.imeiTwoId,
          identifierType: "imei",
          position: 2,
        },
        {
          id: BACKFILL.serialId,
          identifierType: "serial",
          position: 1,
        },
      ]);
    });
  });

  it("enforces NOT NULL, valid type/position pairs and one row per slot", async () => {
    await sandboxRollback(migratorPool, async (client) => {
      const organizationId = randomUUID();
      const unitId = randomUUID();
      await client.query(
        `INSERT INTO serialized_units
           (id, organization_id, goods_receipt_line_id)
         VALUES ($1, $2, NULL)`,
        [unitId, organizationId],
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO device_identifiers
               (id, organization_id, serialized_unit_id, identifier_type,
                normalized_value)
             VALUES ($1, $2, $3, 'imei', '111111111111111')`,
            [randomUUID(), organizationId, unitId],
          ),
        "23502",
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO device_identifiers
               (id, organization_id, serialized_unit_id, identifier_type,
                position, normalized_value)
             VALUES ($1, $2, $3, 'imei', 3, '222222222222222')`,
            [randomUUID(), organizationId, unitId],
          ),
        "23514",
        CONSTRAINTS.TYPE_POSITION,
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO device_identifiers
               (id, organization_id, serialized_unit_id, identifier_type,
                position, normalized_value)
             VALUES ($1, $2, $3, 'serial', 2, 'SERIALTWO')`,
            [randomUUID(), organizationId, unitId],
          ),
        "23514",
        CONSTRAINTS.TYPE_POSITION,
      );

      await client.query(
        `INSERT INTO device_identifiers
           (id, organization_id, serialized_unit_id, identifier_type,
            position, normalized_value)
         VALUES
           ($1, $2, $3, 'imei', 1, '333333333333333'),
           ($4, $2, $3, 'imei', 2, '444444444444444'),
           ($5, $2, $3, 'serial', 1, 'VALIDSERIAL')`,
        [randomUUID(), organizationId, unitId, randomUUID(), randomUUID()],
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO device_identifiers
               (id, organization_id, serialized_unit_id, identifier_type,
                position, normalized_value)
             VALUES ($1, $2, $3, 'imei', 1, '555555555555555')`,
            [randomUUID(), organizationId, unitId],
          ),
        "23505",
        CONSTRAINTS.SLOT_UNIQUE,
      );
    });
  });

  it("allows runtime INSERTS but refuses updates and reassignment inside TXN-1", async () => {
    postedFixture = await sandboxTransaction(runtimePool, async (client) => {
      const organizationId = randomUUID();
      const holdingUnitId = randomUUID();
      const receivedUnitId = randomUUID();
      const receiptId = randomUUID();
      const receiptLineId = randomUUID();
      const imeiOneId = randomUUID();
      const imeiTwoId = randomUUID();
      const serialId = randomUUID();
      const holdingIdentifierId = randomUUID();

      await client.query(
        `INSERT INTO serialized_units
           (id, organization_id, goods_receipt_line_id)
         VALUES ($1, $2, NULL)`,
        [holdingUnitId, organizationId],
      );
      await client.query(
        `INSERT INTO device_identifiers
           (id, organization_id, serialized_unit_id, identifier_type,
            position, normalized_value)
         VALUES ($1, $2, $3, 'imei', 1, '666666666666666')`,
        [holdingIdentifierId, organizationId, holdingUnitId],
      );
      await client.query(
        `INSERT INTO goods_receipts (id, organization_id, posting_txid)
         VALUES ($1, $2, txid_current())`,
        [receiptId, organizationId],
      );
      await client.query(
        `INSERT INTO goods_receipt_lines
           (id, organization_id, goods_receipt_id)
         VALUES ($1, $2, $3)`,
        [receiptLineId, organizationId, receiptId],
      );
      await client.query(
        `INSERT INTO serialized_units
           (id, organization_id, goods_receipt_line_id)
         VALUES ($1, $2, $3)`,
        [receivedUnitId, organizationId, receiptLineId],
      );
      await client.query(
        `INSERT INTO device_identifiers
           (id, organization_id, serialized_unit_id, identifier_type,
            position, normalized_value)
         VALUES
           ($1, $2, $3, 'imei', 1, '777777777777777'),
           ($4, $2, $3, 'imei', 2, '676767676767676'),
           ($5, $2, $3, 'serial', 1, 'POSTEDSERIAL1')`,
        [imeiOneId, organizationId, receivedUnitId, imeiTwoId, serialId],
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `UPDATE device_identifiers
                SET normalized_value = '787878787878787'
              WHERE id = $1`,
            [imeiOneId],
          ),
        "55000",
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `UPDATE device_identifiers
                SET serialized_unit_id = $2
              WHERE id = $1`,
            [holdingIdentifierId, receivedUnitId],
          ),
        "55000",
      );

      return {
        organizationId,
        receivedUnitId,
        imeiOneId,
        imeiTwoId,
        serialId,
      };
    });

    await sandboxRollback(runtimePool, async (client) => {
      const rows = await client.query<{ readonly position: number }>(
        `SELECT position
           FROM device_identifiers
          WHERE serialized_unit_id = $1
          ORDER BY identifier_type, position`,
        [postedFixture?.receivedUnitId],
      );
      expect(rows.rows.map((row) => row.position)).toEqual([1, 2, 1]);
    });
  });

  it("rejects later INSERT, UPDATE, reassignment and DELETE", async () => {
    if (postedFixture === undefined) {
      throw new Error("posted identifier fixture was not created");
    }

    await expectRuntimeTransactionError(
      (client) =>
        client.query(
          `INSERT INTO device_identifiers
             (id, organization_id, serialized_unit_id, identifier_type,
              position, normalized_value)
           VALUES ($1, $2, $3, 'imei', 1, '888888888888888')`,
          [
            randomUUID(),
            postedFixture?.organizationId,
            postedFixture?.receivedUnitId,
          ],
        ),
      "55000",
    );
    await expectRuntimeTransactionError(
      (client) =>
        client.query(
          `UPDATE device_identifiers
              SET normalized_value = '999999999999999'
            WHERE id = $1`,
          [postedFixture?.imeiOneId],
        ),
      "55000",
    );

    const newUnitId = randomUUID();
    await sandboxTransaction(runtimePool, (client) =>
      client.query(
        `INSERT INTO serialized_units
           (id, organization_id, goods_receipt_line_id)
         VALUES ($1, $2, NULL)`,
        [newUnitId, postedFixture?.organizationId],
      ),
    );
    await expectRuntimeTransactionError(
      (client) =>
        client.query(
          `UPDATE device_identifiers
              SET serialized_unit_id = $2
            WHERE id = $1`,
          [postedFixture?.imeiTwoId, newUnitId],
        ),
      "55000",
    );

    await sandboxRollback(migratorPool, async (client) => {
      await expectPgError(
        client,
        () =>
          client.query("DELETE FROM device_identifiers WHERE id = $1", [
            postedFixture?.serialId,
          ]),
        "55000",
      );
    });
  });

  it("leaves non-receipt identifiers mutable under existing runtime rules", async () => {
    await sandboxRollback(runtimePool, async (client) => {
      const organizationId = randomUUID();
      const unitId = randomUUID();
      const identifierId = randomUUID();
      await client.query(
        `INSERT INTO serialized_units
           (id, organization_id, goods_receipt_line_id)
         VALUES ($1, $2, NULL)`,
        [unitId, organizationId],
      );
      await client.query(
        `INSERT INTO device_identifiers
           (id, organization_id, serialized_unit_id, identifier_type,
            position, normalized_value)
         VALUES ($1, $2, $3, 'imei', 1, '121212121212121')`,
        [identifierId, organizationId, unitId],
      );
      await client.query(
        `UPDATE device_identifiers
            SET normalized_value = '131313131313131', position = 2
          WHERE id = $1`,
        [identifierId],
      );
      const stored = await client.query<{
        readonly normalizedValue: string;
        readonly position: number;
      }>(
        `SELECT normalized_value AS "normalizedValue", position
           FROM device_identifiers WHERE id = $1`,
        [identifierId],
      );
      expect(stored.rows[0]).toEqual({
        normalizedValue: "131313131313131",
        position: 2,
      });
    });
  });

  it("preserves least-privilege runtime access on the production table", async () => {
    const grants = await migratorPool.query<{ readonly privilege: string }>(
      `SELECT privilege_type AS privilege
         FROM information_schema.role_table_grants
        WHERE grantee = 'mobileshop_app'
          AND table_schema = current_schema()
          AND table_name = 'device_identifiers'
        ORDER BY privilege_type`,
    );
    expect(grants.rows.map((row) => row.privilege)).toEqual([
      "INSERT",
      "SELECT",
      "UPDATE",
    ]);
  });
});
