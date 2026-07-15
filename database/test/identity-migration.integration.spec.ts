import { randomUUID } from "node:crypto";
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
  if (!value)
    throw new Error(`${name} is required for database integration tests`);
  return value;
}

const runtimePool = new Pool({
  connectionString: requiredUrl("TEST_DATABASE_URL"),
  max: 2,
});
const migratorPool = new Pool({
  connectionString: requiredUrl("TEST_MIGRATION_DATABASE_URL"),
  max: 1,
});

interface TenantFixture {
  readonly organizationId: string;
  readonly branchId: string;
  readonly locationId: string;
  readonly userId: string;
  readonly roleId: string;
}

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    return await work(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function expectPgError(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(
      `Expected PostgreSQL error ${expectedCode}, but the statement succeeded`,
    );
  } catch (error) {
    expect(error).toMatchObject({ code: expectedCode });
  }
}

async function createTenant(
  client: PoolClient,
  suffix = randomUUID().slice(0, 8),
): Promise<TenantFixture> {
  const fixture: TenantFixture = {
    organizationId: randomUUID(),
    branchId: randomUUID(),
    locationId: randomUUID(),
    userId: randomUUID(),
    roleId: randomUUID(),
  };

  await client.query(
    `INSERT INTO organizations (id, name, updated_at)
     VALUES ($1, $2, now())`,
    [fixture.organizationId, `Test Organization ${suffix}`],
  );
  await client.query(
    `INSERT INTO branches (id, organization_id, code, name, is_default, updated_at)
     VALUES ($1, $2, $3, $4, true, now())`,
    [
      fixture.branchId,
      fixture.organizationId,
      `B-${suffix}`,
      `Branch ${suffix}`,
    ],
  );
  await client.query(
    `INSERT INTO stock_locations
       (id, organization_id, branch_id, code, name, is_default, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, now())`,
    [
      fixture.locationId,
      fixture.organizationId,
      fixture.branchId,
      `L-${suffix}`,
      `Location ${suffix}`,
    ],
  );
  await client.query(
    `INSERT INTO users
       (id, organization_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [
      fixture.userId,
      fixture.organizationId,
      `user-${suffix}@example.test`,
      "not-a-real-test-password-hash",
      `User ${suffix}`,
    ],
  );
  await client.query(
    `INSERT INTO roles (id, organization_id, code, name, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [
      fixture.roleId,
      fixture.organizationId,
      `role-${suffix}`,
      `Role ${suffix}`,
    ],
  );

  return fixture;
}

describe("0001 identity and access migration invariants", () => {
  beforeAll(async () => {
    const result = await migratorPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(result.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);
  });

  afterAll(async () => {
    await Promise.all([runtimePool.end(), migratorPool.end()]);
  });

  it("blocks cross-organization role assignment in the database", async () => {
    await transaction(runtimePool, async (client) => {
      const first = await createTenant(client, "tenant-a");
      const second = await createTenant(client, "tenant-b");

      await expectPgError(
        client.query(
          `INSERT INTO user_roles (id, organization_id, user_id, role_id)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), first.organizationId, first.userId, second.roleId],
        ),
        "23503",
      );
    });
  });

  it("rejects non-normalized and duplicate case-insensitive email identity", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "email-normalized");

      await expectPgError(
        client.query(
          `INSERT INTO users
             (id, organization_id, email, password_hash, full_name, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [
            randomUUID(),
            fixture.organizationId,
            "UPPER@EXAMPLE.TEST",
            "hash",
            "Upper Case",
          ],
        ),
        "23514",
      );
    });

    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "email-duplicate");
      const existingEmail = `user-email-duplicate@example.test`;

      await expectPgError(
        client.query(
          `INSERT INTO users
             (id, organization_id, email, password_hash, full_name, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [
            randomUUID(),
            fixture.organizationId,
            existingEmail,
            "hash",
            "Duplicate Email",
          ],
        ),
        "23505",
      );
    });
  });

  it("allows at most one default branch and stock location per scope", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "default-branch");

      await expectPgError(
        client.query(
          `INSERT INTO branches
             (id, organization_id, code, name, is_default, updated_at)
           VALUES ($1, $2, 'SECOND', 'Second default', true, now())`,
          [randomUUID(), fixture.organizationId],
        ),
        "23505",
      );
    });

    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "default-location");

      await expectPgError(
        client.query(
          `INSERT INTO stock_locations
             (id, organization_id, branch_id, code, name, is_default, updated_at)
           VALUES ($1, $2, $3, 'SECOND', 'Second default', true, now())`,
          [randomUUID(), fixture.organizationId, fixture.branchId],
        ),
        "23505",
      );
    });
  });

  it("rejects duplicate whole-branch scope rows despite a nullable location", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "scope");
      const values = [fixture.organizationId, fixture.userId, fixture.branchId];

      await client.query(
        `INSERT INTO user_scope_access (id, organization_id, user_id, branch_id, location_id)
         VALUES ($1, $2, $3, $4, NULL)`,
        [randomUUID(), ...values],
      );
      await expectPgError(
        client.query(
          `INSERT INTO user_scope_access (id, organization_id, user_id, branch_id, location_id)
           VALUES ($1, $2, $3, $4, NULL)`,
          [randomUUID(), ...values],
        ),
        "23505",
      );
    });
  });

  it("rejects duplicate sequence scope when nullable keys match", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "sequence");
      await client.query(
        `INSERT INTO number_sequences (id, organization_id, branch_id, key, period_key, updated_at)
         VALUES ($1, $2, NULL, 'sale_invoice', NULL, now())`,
        [randomUUID(), fixture.organizationId],
      );
      await expectPgError(
        client.query(
          `INSERT INTO number_sequences (id, organization_id, branch_id, key, period_key, updated_at)
           VALUES ($1, $2, NULL, 'sale_invoice', NULL, now())`,
          [randomUUID(), fixture.organizationId],
        ),
        "23505",
      );
    });
  });

  it("rejects negative login counters and invalid session dates", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "checks");
      await expectPgError(
        client.query("UPDATE users SET failed_login_count = -1 WHERE id = $1", [
          fixture.userId,
        ]),
        "23514",
      );
    });

    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "session");
      await expectPgError(
        client.query(
          `INSERT INTO sessions
             (id, organization_id, user_id, token_hash, branch_id, expires_at, created_at, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, now() - interval '1 second', now(), now())`,
          [
            randomUUID(),
            fixture.organizationId,
            fixture.userId,
            "a".repeat(64),
            fixture.branchId,
          ],
        ),
        "23514",
      );
    });
  });

  it("denies runtime DDL and audit mutation privileges", async () => {
    await transaction(runtimePool, async (client) => {
      await expectPgError(
        client.query(
          "CREATE TABLE runtime_role_must_not_create_tables (id integer)",
        ),
        "42501",
      );
    });

    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "audit-runtime");
      const auditId = randomUUID();
      await client.query(
        `INSERT INTO audit_events (id, organization_id, branch_id, actor_user_id, action, entity_type)
         VALUES ($1, $2, $3, $4, 'test.created', 'test')`,
        [auditId, fixture.organizationId, fixture.branchId, fixture.userId],
      );
      await expectPgError(
        client.query("UPDATE audit_events SET action = $1 WHERE id = $2", [
          "test.changed",
          auditId,
        ]),
        "42501",
      );
    });
  });

  it("blocks audit mutation for the owning migration role through a trigger", async () => {
    await transaction(migratorPool, async (client) => {
      const fixture = await createTenant(client, "audit-trigger");
      const auditId = randomUUID();
      await client.query(
        `INSERT INTO audit_events (id, organization_id, branch_id, actor_user_id, action, entity_type)
         VALUES ($1, $2, $3, $4, 'test.created', 'test')`,
        [auditId, fixture.organizationId, fixture.branchId, fixture.userId],
      );
      await expectPgError(
        client.query("DELETE FROM audit_events WHERE id = $1", [auditId]),
        "55000",
      );
    });
  });

  it("keeps login-attempt evidence append-only for runtime and migration roles", async () => {
    await transaction(runtimePool, async (client) => {
      await client.query(
        `INSERT INTO login_attempts (id, email, succeeded, failure_reason)
         VALUES ($1, $2, false, 'test_failure')`,
        [randomUUID(), `attempt-${randomUUID()}@example.test`],
      );
      await expectPgError(
        client.query("UPDATE login_attempts SET failure_reason = 'changed'"),
        "42501",
      );
    });

    await transaction(migratorPool, async (client) => {
      const attemptId = randomUUID();
      await client.query(
        `INSERT INTO login_attempts (id, email, succeeded, failure_reason)
         VALUES ($1, $2, false, 'test_failure')`,
        [attemptId, `attempt-${randomUUID()}@example.test`],
      );
      await expectPgError(
        client.query("DELETE FROM login_attempts WHERE id = $1", [attemptId]),
        "55000",
      );
    });
  });

  it("requires user deactivation instead of hard deletion", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createTenant(client, "runtime-delete");
      await expectPgError(
        client.query("DELETE FROM users WHERE id = $1", [fixture.userId]),
        "42501",
      );
    });

    await transaction(migratorPool, async (client) => {
      const fixture = await createTenant(client, "migrator-delete");
      await expectPgError(
        client.query("DELETE FROM users WHERE id = $1", [fixture.userId]),
        "55000",
      );
    });
  });
});
