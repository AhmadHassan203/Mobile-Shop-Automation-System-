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

const MIGRATION_NAME = "20260717190000_0010_goods_receipt_idempotency";
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
  PAIR: "goods_receipts_idempotency_pair",
  HASH: "goods_receipts_request_hash_format",
  UNIQUE: "goods_receipts_idempotency_scope_key",
});

const sandboxSchema = `receipt_idempotency_${randomUUID().replaceAll("-", "")}`;
const legacyReceiptIds = Object.freeze([randomUUID(), randomUUID()]);
let savepointSequence = 0;

function quotedIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function assertDatabase(
  client: PoolClient,
  expected: "mobileshop_test",
): Promise<void> {
  const result = await client.query<{ readonly database: string }>(
    'SELECT current_database() AS "database"',
  );
  if (result.rows[0]?.database !== expected) {
    throw new Error(
      `Refusing database write against ${result.rows[0]?.database ?? "unknown"}`,
    );
  }
}

async function setSandboxSearchPath(client: PoolClient): Promise<void> {
  await client.query(
    `SET LOCAL search_path TO ${quotedIdentifier(sandboxSchema)}, public`,
  );
}

async function sandboxRollback<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await assertDatabase(client, "mobileshop_test");
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
  const savepoint = `expected_idempotency_error_${savepointSequence}`;
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

async function ensureMigrationApplied(): Promise<void> {
  const client = await migratorPool.connect();
  try {
    await assertDatabase(client, "mobileshop_test");
    const applied = await client.query<{ readonly exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'goods_receipts'
            AND column_name = 'idempotency_key'
       ) AS exists`,
    );
    if (applied.rows[0]?.exists === true) return;

    const prerequisite = await client.query<{ readonly exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'device_identifiers'
            AND column_name = 'position'
       ) AS exists`,
    );
    if (prerequisite.rows[0]?.exists !== true) {
      throw new Error("0009 must be applied before 0010");
    }

    const checksum = createHash("sha256").update(migrationSql).digest("hex");
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

async function createLegacySandbox(): Promise<void> {
  const client = await migratorPool.connect();
  try {
    await assertDatabase(client, "mobileshop_test");
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${quotedIdentifier(sandboxSchema)}`);
    await setSandboxSearchPath(client);
    await client.query(`
      CREATE TABLE goods_receipts (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL,
        branch_id UUID NOT NULL
      );
      INSERT INTO goods_receipts (id, organization_id, branch_id)
      VALUES
        ('${legacyReceiptIds[0]}', '${randomUUID()}', '${randomUUID()}'),
        ('${legacyReceiptIds[1]}', '${randomUUID()}', '${randomUUID()}');
    `);
    await client.query(migrationSql);
    await client.query(
      `GRANT USAGE ON SCHEMA ${quotedIdentifier(sandboxSchema)} TO mobileshop_app`,
    );
    await client.query(
      `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA ${quotedIdentifier(
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
  const client = await migratorPool.connect();
  try {
    await assertDatabase(client, "mobileshop_test");
    await client.query(
      `DROP SCHEMA IF EXISTS ${quotedIdentifier(sandboxSchema)} CASCADE`,
    );
  } finally {
    client.release();
  }
  await Promise.all([runtimePool.end(), migratorPool.end()]);
});

describe("0010 goods receipt idempotency migration", () => {
  beforeAll(async () => {
    await ensureMigrationApplied();
    await createLegacySandbox();
  });

  it("records 0010 and creates the exact nullable columns and database objects", async () => {
    const ledger = await migratorPool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
         FROM _prisma_migrations
        WHERE migration_name = $1
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL`,
      [MIGRATION_NAME],
    );
    expect(ledger.rows[0]?.count).toBe("1");

    const columns = await migratorPool.query<{
      readonly columnName: string;
      readonly dataType: string;
      readonly isNullable: string;
      readonly maximumLength: number | null;
    }>(
      `SELECT column_name AS "columnName", data_type AS "dataType",
              is_nullable AS "isNullable",
              character_maximum_length::int AS "maximumLength"
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'goods_receipts'
          AND column_name IN ('idempotency_key', 'request_hash')
        ORDER BY column_name`,
    );
    expect(columns.rows).toEqual([
      {
        columnName: "idempotency_key",
        dataType: "uuid",
        isNullable: "YES",
        maximumLength: null,
      },
      {
        columnName: "request_hash",
        dataType: "character",
        isNullable: "YES",
        maximumLength: 64,
      },
    ]);

    const objects = await migratorPool.query<{
      readonly hashCheck: boolean;
      readonly pairCheck: boolean;
      readonly uniqueIndex: boolean;
    }>(
      `SELECT
         to_regclass($1) IS NOT NULL AS "uniqueIndex",
         EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conrelid = 'goods_receipts'::regclass AND conname = $2
         ) AS "pairCheck",
         EXISTS (
           SELECT 1 FROM pg_constraint
            WHERE conrelid = 'goods_receipts'::regclass AND conname = $3
         ) AS "hashCheck"`,
      [CONSTRAINTS.UNIQUE, CONSTRAINTS.PAIR, CONSTRAINTS.HASH],
    );
    expect(objects.rows[0]).toEqual({
      hashCheck: true,
      pairCheck: true,
      uniqueIndex: true,
    });
  });

  it("leaves every pre-0010 receipt with both evidence columns null", async () => {
    await sandboxRollback(migratorPool, async (client) => {
      const legacy = await client.query<{
        readonly id: string;
        readonly idempotencyKey: string | null;
        readonly requestHash: string | null;
      }>(
        `SELECT id::text AS id, idempotency_key::text AS "idempotencyKey",
                request_hash::text AS "requestHash"
           FROM goods_receipts
          WHERE id = ANY($1::uuid[])
          ORDER BY id`,
        [[...legacyReceiptIds].sort()],
      );
      expect(legacy.rows).toEqual(
        [...legacyReceiptIds]
          .sort()
          .map((id) => ({ id, idempotencyKey: null, requestHash: null })),
      );
    });
  });

  it("requires idempotency key and request hash together", async () => {
    await sandboxRollback(migratorPool, async (client) => {
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO goods_receipts
               (id, organization_id, branch_id, idempotency_key, request_hash)
             VALUES ($1, $2, $3, $4, NULL)`,
            [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
          ),
        "23514",
        CONSTRAINTS.PAIR,
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO goods_receipts
               (id, organization_id, branch_id, idempotency_key, request_hash)
             VALUES ($1, $2, $3, NULL, $4)`,
            [randomUUID(), randomUUID(), randomUUID(), "a".repeat(64)],
          ),
        "23514",
        CONSTRAINTS.PAIR,
      );
    });
  });

  it("accepts exactly lowercase SHA-256 hex and rejects malformed hashes", async () => {
    await sandboxRollback(migratorPool, async (client) => {
      const organizationId = randomUUID();
      const branchId = randomUUID();
      for (const malformed of [
        "a".repeat(63),
        "A".repeat(64),
        "g".repeat(64),
      ]) {
        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO goods_receipts
                 (id, organization_id, branch_id, idempotency_key,
                  request_hash)
               VALUES ($1, $2, $3, $4, $5)`,
              [randomUUID(), organizationId, branchId, randomUUID(), malformed],
            ),
          "23514",
          CONSTRAINTS.HASH,
        );
      }

      const id = randomUUID();
      const hash = createHash("sha256")
        .update("canonical request")
        .digest("hex");
      await client.query(
        `INSERT INTO goods_receipts
           (id, organization_id, branch_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, organizationId, branchId, randomUUID(), hash],
      );
      const stored = await client.query<{ readonly requestHash: string }>(
        `SELECT request_hash::text AS "requestHash"
           FROM goods_receipts WHERE id = $1`,
        [id],
      );
      expect(stored.rows[0]?.requestHash).toBe(hash);
    });
  });

  it("makes a key unique inside one organization and branch only", async () => {
    await sandboxRollback(migratorPool, async (client) => {
      const organizationId = randomUUID();
      const otherOrganizationId = randomUUID();
      const branchId = randomUUID();
      const otherBranchId = randomUUID();
      const key = randomUUID();
      const hash = "b".repeat(64);

      await client.query(
        `INSERT INTO goods_receipts
           (id, organization_id, branch_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), organizationId, branchId, key, hash],
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO goods_receipts
               (id, organization_id, branch_id, idempotency_key, request_hash)
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), organizationId, branchId, key, "c".repeat(64)],
          ),
        "23505",
        CONSTRAINTS.UNIQUE,
      );

      await client.query(
        `INSERT INTO goods_receipts
           (id, organization_id, branch_id, idempotency_key, request_hash)
         VALUES
           ($1, $2, $3, $4, $5),
           ($6, $7, $8, $4, $5),
           ($9, $2, $3, NULL, NULL),
           ($10, $2, $3, NULL, NULL)`,
        [
          randomUUID(),
          organizationId,
          otherBranchId,
          key,
          hash,
          randomUUID(),
          otherOrganizationId,
          branchId,
          randomUUID(),
          randomUUID(),
        ],
      );
    });
  });

  it("keeps runtime INSERT privilege usable with the new columns", async () => {
    await sandboxRollback(runtimePool, async (client) => {
      const hash = createHash("sha256").update("runtime request").digest("hex");
      const id = randomUUID();
      await client.query(
        `INSERT INTO goods_receipts
           (id, organization_id, branch_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, randomUUID(), randomUUID(), randomUUID(), hash],
      );
      const stored = await client.query<{ readonly count: string }>(
        `SELECT count(*)::text AS count FROM goods_receipts WHERE id = $1`,
        [id],
      );
      expect(stored.rows[0]?.count).toBe("1");
    });
  });
});
