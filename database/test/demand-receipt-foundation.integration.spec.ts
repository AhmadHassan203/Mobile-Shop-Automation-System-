import { execFileSync } from "node:child_process";
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
const databaseRoot = path.join(workspaceRoot, "database");
const environmentPath = path.join(workspaceRoot, ".env");
const MIGRATION_NAME = "20260717220000_0012_demand_and_receipt_snapshot";

if (existsSync(environmentPath)) {
  const fileEnvironment = parse(readFileSync(environmentPath));
  for (const key of [
    "TEST_DATABASE_URL",
    "TEST_MIGRATION_DATABASE_URL",
    "SHADOW_DATABASE_URL",
  ] as const) {
    if (process.env[key] === undefined && fileEnvironment[key] !== undefined) {
      process.env[key] = fileEnvironment[key];
    }
  }
}

function requiredUrl(
  name:
    | "TEST_DATABASE_URL"
    | "TEST_MIGRATION_DATABASE_URL"
    | "SHADOW_DATABASE_URL",
): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for database integration tests`);
  return value;
}

const runtimePool = new Pool({ connectionString: requiredUrl("TEST_DATABASE_URL"), max: 1 });
const migratorPool = new Pool({ connectionString: requiredUrl("TEST_MIGRATION_DATABASE_URL"), max: 2 });

interface Fixture {
  readonly organizationId: string;
  readonly branchId: string;
  readonly userId: string;
  readonly modelId: string;
  readonly variantId: string;
}

let fixture: Fixture;
let savepointSequence = 0;

async function expectPgError(
  client: PoolClient,
  work: () => Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  const savepoint = `expected_demand_error_${++savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await work();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    expect(error).toMatchObject(
      constraint === undefined ? { code } : { code, constraint },
    );
    return;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`Expected PostgreSQL error ${code}`);
}

async function transaction(
  pool: Pool,
  work: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    await work(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function forceDeferredChecks(client: PoolClient): Promise<void> {
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
}

function token(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

async function createCommittedFixture(): Promise<Fixture> {
  const client = await migratorPool.connect();
  await client.query("BEGIN");
  try {
    const organizationId = randomUUID();
    const branchId = randomUUID();
    const userId = randomUUID();
    const categoryId = randomUUID();
    const brandId = randomUUID();
    const modelId = randomUUID();
    const variantId = randomUUID();
    const locationId = randomUUID();
    const suffix = token();
    await client.query(
      `INSERT INTO organizations (id, name, updated_at) VALUES ($1, $2, now())`,
      [organizationId, `Demand Test ${suffix}`],
    );
    await client.query(
      `INSERT INTO branches (id, organization_id, code, name, updated_at)
       VALUES ($1, $2, $3, $4, now())`,
      [branchId, organizationId, `BR-${suffix}`, `Branch ${suffix}`],
    );
    await client.query(
      `INSERT INTO users (id, organization_id, email, password_hash, full_name, updated_at)
       VALUES ($1, $2, $3, 'test-hash', 'Demand Test User', now())`,
      [userId, organizationId, `demand-${randomUUID()}@example.test`],
    );
    await client.query(
      `INSERT INTO categories (id, organization_id, name, slug, updated_at)
       VALUES ($1, $2, $3, $4, now())`,
      [categoryId, organizationId, `Phones ${suffix}`, `phones-${suffix.toLowerCase()}`],
    );
    await client.query(
      `INSERT INTO brands (id, organization_id, name, slug, updated_at)
       VALUES ($1, $2, $3, $4, now())`,
      [brandId, organizationId, `Brand ${suffix}`, `brand-${suffix.toLowerCase()}`],
    );
    await client.query(
      `INSERT INTO product_models
         (id, organization_id, brand_id, category_id, name, canonical_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [modelId, organizationId, brandId, categoryId, `Model ${suffix}`, `model ${suffix.toLowerCase()}`],
    );
    await client.query(
      `INSERT INTO product_variants
         (id, organization_id, product_model_id, sku, name, tracking_type,
          condition, pta_status, warranty_type, default_price_minor, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'quantity', 'new', 'pta_approved',
               'none', 50000, now())`,
      [variantId, organizationId, modelId, `SKU-${suffix}`, `Variant ${suffix}`],
    );
    await client.query(
      `INSERT INTO stock_locations
         (id, organization_id, branch_id, code, name, kind, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'store', now())`,
      [locationId, organizationId, branchId, `LOC-${suffix}`, `Store ${suffix}`],
    );
    await client.query(
      `INSERT INTO stock_batches
         (id, organization_id, branch_id, product_variant_id, stock_location_id,
          quantity_on_hand, quantity_reserved, actual_cost_minor,
          landed_cost_minor, updated_at)
       VALUES ($1, $2, $3, $4, $5, 5, 0, 30000, 32000, now())`,
      [randomUUID(), organizationId, branchId, variantId, locationId],
    );
    await client.query("COMMIT");
    return { organizationId, branchId, userId, modelId, variantId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertDemand(
  client: PoolClient,
  options: { readonly matched: boolean; readonly contact: boolean },
): Promise<{ readonly requestId: string; readonly itemId: string }> {
  const requestId = randomUUID();
  const itemId = randomUUID();
  const phone = options.contact ? "+923001234567" : null;
  const state = options.matched ? "unavailable" : "not_in_catalog";
  await client.query(
    `INSERT INTO demand_requests
       (id, organization_id, branch_id, request_number, customer_name,
        contact_phone_e164, quantity, budget_min_minor, budget_max_minor,
        pta_preference, urgency, channel, outcome, availability_state,
        availability_unknown_reason, available_quantity_snapshot,
        availability_checked_at, unit_price_minor_snapshot, follow_up_on,
        consent_to_contact, trade_in_interest, salesperson_user_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 40000, 50000, 'pta_only',
             'within_week', 'walk_in', 'unavailable', $7, NULL, $8, now(),
             $9, $10, $11, false, $12, now())`,
    [
      requestId,
      fixture.organizationId,
      fixture.branchId,
      `DM-${token()}`,
      options.contact ? "Ayesha Customer" : null,
      phone,
      state,
      options.matched ? 0 : null,
      options.matched ? 50000 : null,
      options.contact ? "2026-07-20" : null,
      options.contact,
      fixture.userId,
    ],
  );
  await client.query(
    `INSERT INTO demand_request_items
       (id, organization_id, branch_id, demand_request_id, line_number,
        raw_request_text, matched_product_variant_id, matched_product_model_id,
        desired_brand, desired_model, desired_variant, desired_ram,
        desired_storage, desired_color, condition_preference, updated_at)
     VALUES ($1, $2, $3, $4, 1, 'iPhone 16 Pro 256 GB any colour',
             $5, $6, 'Apple', 'iPhone 16 Pro', '256 GB', '8 GB', '256 GB',
             'Green', 'new', now())`,
    [
      itemId,
      fixture.organizationId,
      fixture.branchId,
      requestId,
      options.matched ? fixture.variantId : null,
      options.matched ? fixture.modelId : null,
    ],
  );
  return { requestId, itemId };
}

beforeAll(async () => {
  const database = await migratorPool.query<{ readonly name: string }>(
    `SELECT current_database() AS name`,
  );
  if (database.rows[0]?.name !== "mobileshop_test") {
    throw new Error("Demand integration tests may run only against mobileshop_test");
  }
  const ledger = await migratorPool.query<{ readonly applied: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM _prisma_migrations
        WHERE migration_name = $1 AND finished_at IS NOT NULL
     ) AS applied`,
    [MIGRATION_NAME],
  );
  if (ledger.rows[0]?.applied !== true) throw new Error(`${MIGRATION_NAME} is not applied`);
  fixture = await createCommittedFixture();
});

afterAll(async () => {
  await Promise.all([runtimePool.end(), migratorPool.end()]);
});

describe("0012 demand and immutable receipt foundation", () => {
  it("keeps migration history aligned with Prisma and installs the evidence guards", async () => {
    const prismaCli = path.join(
      databaseRoot,
      "node_modules",
      "prisma",
      "build",
      "index.js",
    );
    const output = execFileSync(
      process.execPath,
      [
        prismaCli,
        "migrate",
        "diff",
        "--from-migrations",
        "prisma/migrations",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      ],
      {
        cwd: databaseRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          MIGRATION_DATABASE_URL: requiredUrl("TEST_MIGRATION_DATABASE_URL"),
          SHADOW_DATABASE_URL: requiredUrl("SHADOW_DATABASE_URL"),
        },
      },
    );
    expect(output).toContain("No difference detected");

    const triggerRows = await migratorPool.query<{
      readonly name: string;
      readonly definition: string;
    }>(
      `SELECT tgname AS name, pg_get_triggerdef(oid) AS definition
         FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname = ANY($1::text[])`,
      [[
        "demand_requests_no_hard_delete",
        "demand_request_items_no_hard_delete",
        "demand_follow_ups_append_only",
      ]],
    );
    const triggerDefinitions = new Map(
      triggerRows.rows.map(({ name, definition }) => [name, definition]),
    );
    for (const name of [
      "demand_requests_no_hard_delete",
      "demand_request_items_no_hard_delete",
    ]) {
      expect(triggerDefinitions.get(name)).toContain("DELETE");
      expect(triggerDefinitions.get(name)).toContain("TRUNCATE");
    }
    const followUpGuard = triggerDefinitions.get("demand_follow_ups_append_only");
    expect(followUpGuard).toContain("UPDATE");
    expect(followUpGuard).toContain("DELETE");
    expect(followUpGuard).toContain("TRUNCATE");
  }, 30_000);

  it("enforces Demand shapes, immutable wording, no hard delete, and append-only follow-ups", async () => {
    await transaction(runtimePool, async (client) => {
      const anonymous = await insertDemand(client, { matched: false, contact: false });
      await forceDeferredChecks(client);

      await expectPgError(
        client,
        () => client.query(`UPDATE demand_request_items SET raw_request_text = 'rewritten', updated_at = now() WHERE id = $1`, [anonymous.itemId]),
        "55000",
      );
      await expectPgError(
        client,
        () => client.query(`UPDATE demand_requests SET note = 'without version', updated_at = now() WHERE id = $1`, [anonymous.requestId]),
        "23514",
        "demand_requests_version_advance_check",
      );
      await expectPgError(
        client,
        async () => {
          await client.query(
            `UPDATE demand_requests
                SET availability_state = 'available',
                    available_quantity_snapshot = 1,
                    unit_price_minor_snapshot = 50000,
                    version = version + 1,
                    updated_at = now()
              WHERE id = $1`,
            [anonymous.requestId],
          );
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        },
        "23514",
        "demand_requests_unmatched_availability_check",
      );
      await expectPgError(client, () => client.query(`DELETE FROM demand_request_items WHERE id = $1`, [anonymous.itemId]), "42501");
      await expectPgError(client, () => client.query(`DELETE FROM demand_requests WHERE id = $1`, [anonymous.requestId]), "42501");
      await expectPgError(
        client,
        () => client.query(
          `INSERT INTO demand_follow_ups
             (id, organization_id, branch_id, demand_request_id, occurred_at,
              channel, result, note, actor_user_id)
           VALUES ($1, $2, $3, $4, now(), 'whatsapp', 'message_sent',
                   'No consent', $5)`,
          [randomUUID(), fixture.organizationId, fixture.branchId, anonymous.requestId, fixture.userId],
        ),
        "23514",
        "demand_follow_ups_contact_consent_check",
      );

      const contacted = await insertDemand(client, { matched: true, contact: true });
      await forceDeferredChecks(client);
      const followUpId = randomUUID();
      await client.query(
        `INSERT INTO demand_follow_ups
           (id, organization_id, branch_id, demand_request_id, occurred_at,
            channel, result, note, next_follow_up_on, actor_user_id)
         VALUES ($1, $2, $3, $4, now(), 'whatsapp', 'message_sent',
                 'Customer asked for a restock alert', DATE '2026-07-22', $5)`,
        [followUpId, fixture.organizationId, fixture.branchId, contacted.requestId, fixture.userId],
      );
      await expectPgError(client, () => client.query(`UPDATE demand_follow_ups SET note = 'changed' WHERE id = $1`, [followUpId]), "42501");
      await expectPgError(client, () => client.query(`DELETE FROM demand_follow_ups WHERE id = $1`, [followUpId]), "42501");
    });
  });

  it("repairs runtime Sales reads/locks and grants only append operations for follow-up history", async () => {
    await transaction(runtimePool, async (client) => {
      await client.query("SET LOCAL ROLE mobileshop_app");
      await client.query(`SELECT id FROM product_variants WHERE false`);
      await client.query(`SELECT id FROM stock_batches WHERE false FOR UPDATE`);
      const demand = await insertDemand(client, { matched: true, contact: true });
      await forceDeferredChecks(client);
      await client.query(
        `INSERT INTO demand_follow_ups
           (id, organization_id, branch_id, demand_request_id, occurred_at,
            channel, result, note, actor_user_id)
         VALUES ($1, $2, $3, $4, now(), 'whatsapp', 'message_sent',
                 'Runtime append works', $5)`,
        [randomUUID(), fixture.organizationId, fixture.branchId, demand.requestId, fixture.userId],
      );
      await client.query(`UPDATE demand_requests SET note = 'runtime update', version = version + 1, updated_at = now() WHERE id = $1`, [demand.requestId]);
      await expectPgError(client, () => client.query(`DELETE FROM demand_requests WHERE id = $1`, [demand.requestId]), "42501");
      await expectPgError(client, () => client.query(`UPDATE demand_follow_ups SET note = 'forbidden' WHERE demand_request_id = $1`, [demand.requestId]), "42501");
    });
  });

  it("allows legacy posted-null receipts but requires and freezes snapshots on new postings", async () => {
    const metadata = await migratorPool.query<{ readonly convalidated: boolean }>(
      `SELECT convalidated FROM pg_constraint
        WHERE conname = 'sales_posted_receipt_snapshot_required_check'`,
    );
    expect(metadata.rows[0]?.convalidated).toBe(false);

    await transaction(migratorPool, async (client) => {
      const saleId = randomUUID();
      await client.query(
        `INSERT INTO sales
           (id, organization_id, branch_id, customer_name_snapshot,
            salesperson_user_id, cashier_user_id, status, updated_at)
         VALUES ($1, $2, $3, 'Walk-in Customer', $4, $4, 'draft', now())`,
        [saleId, fixture.organizationId, fixture.branchId, fixture.userId],
      );
      const posting = `status = 'posted', invoice_number = 'INV-${token()}',
        posted_at = now(), business_date = DATE '2026-07-17',
        post_request_id = '${randomUUID()}', post_request_hash = repeat('a', 64),
        version = version + 1, updated_at = now()`;
      await expectPgError(
        client,
        () => client.query(`UPDATE sales SET ${posting} WHERE id = $1`, [saleId]),
        "23514",
        "sales_posted_receipt_snapshot_required_check",
      );
      await client.query(
        `UPDATE sales SET ${posting}, receipt_snapshot = $2::jsonb WHERE id = $1`,
        [saleId, JSON.stringify({ saleId, invoiceNumber: "immutable" })],
      );
      await expectPgError(
        client,
        () => client.query(`UPDATE sales SET receipt_snapshot = '{"changed":true}'::jsonb WHERE id = $1`, [saleId]),
        "55000",
      );
    });
  });
});
