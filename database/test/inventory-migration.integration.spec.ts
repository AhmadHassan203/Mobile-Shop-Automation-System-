import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  INVENTORY_CONTRACT_LIMITS,
  normalizeStockLocationCode,
} from "@mobileshop/shared";
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
  max: 1,
});

const MIGRATION_NAME = "20260717000000_0007_inventory_foundation";

/** Constraint names asserted by the tests, spelled exactly as 0007 creates them. */
const CONSTRAINTS = Object.freeze({
  IDENTIFIER_UNIQUE: "device_identifiers_organization_id_normalized_value_key",
  IDENTIFIER_FORMAT: "device_identifiers_normalized_value_format",
  IDENTIFIER_UNIT_FK:
    "device_identifiers_serialized_unit_id_organization_id_fkey",
  BATCH_ON_HAND: "stock_batches_on_hand_nonnegative",
  BATCH_RESERVED: "stock_batches_reserved_valid",
  BATCH_UNIQUE:
    "stock_batches_organization_id_product_variant_id_stock_loca_key",
  BATCH_VARIANT_FK: "stock_batches_product_variant_id_organization_id_fkey",
  BATCH_LOCATION_FK:
    "stock_batches_stock_location_id_organization_id_branch_id_fkey",
  MOVEMENT_QUANTITY: "inventory_movements_quantity_positive",
  MOVEMENT_TARGET: "inventory_movements_target_exclusive",
  MOVEMENT_SERIALIZED_QUANTITY: "inventory_movements_serialized_quantity",
  MOVEMENT_STATES: "inventory_movements_states_serialized_only",
  MOVEMENT_UNIT_FK:
    "inventory_movements_serialized_unit_id_organization_id_fkey",
  MOVEMENT_BATCH_FK: "inventory_movements_stock_batch_id_organization_id_fkey",
  MOVEMENT_LOCATION_FK:
    "inventory_movements_stock_location_id_organization_id_bran_fkey",
  MOVEMENT_ACTOR_FK: "inventory_movements_actor_user_id_organization_id_fkey",
  MOVEMENT_VARIANT_FK:
    "inventory_movements_product_variant_id_organization_id_fkey",
  UNIT_VARIANT_FK: "serialized_units_product_variant_id_organization_id_fkey",
  UNIT_LOCATION_FK:
    "serialized_units_stock_location_id_organization_id_branch__fkey",
  LOCATION_CODE_UNIQUE: "stock_locations_organization_id_branch_id_code_key",
});
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

/**
 * Applies 0007 only when it is genuinely absent.
 *
 * Other agents share this database, so this never drops, truncates or rewrites
 * anything: the presence of `serialized_units` is the sole gate, and the Prisma
 * ledger row is recorded with the real file checksum so a later
 * `migrate deploy` neither re-applies nor reports drift.
 */
async function ensureInventoryMigrationApplied(): Promise<void> {
  const applied = await migratorPool.query<{ readonly exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'serialized_units'
     ) AS exists`,
  );
  if (applied.rows[0]?.exists === true) {
    return;
  }

  const sql = readFileSync(migrationSqlPath);
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = await migratorPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql.toString("utf8"));
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

interface InventoryFixture {
  readonly organizationId: string;
  readonly branchId: string;
  readonly stockLocationId: string;
  readonly productVariantId: string;
  readonly userId: string;
  readonly locationCode: string;
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

let savepointSequence = 0;

/**
 * Asserts a statement is refused by PostgreSQL with a specific SQLSTATE, and
 * optionally by a specific named constraint.
 *
 * Naming the constraint matters: a bare "23514" only proves that *some* CHECK
 * fired, so a test could pass while the constraint it claims to prove is
 * missing and an unrelated one rejects the row for its own reasons.
 */
async function expectPgError(
  client: PoolClient,
  work: () => Promise<unknown>,
  expectedCode: string,
  expectedConstraint?: string,
): Promise<void> {
  savepointSequence += 1;
  const savepoint = `expected_inventory_error_${savepointSequence}`;
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

function shortId(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

async function createOrganization(
  client: PoolClient,
  suffix: string,
): Promise<string> {
  const organizationId = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, updated_at)
     VALUES ($1, $2, now())`,
    [organizationId, `Inventory Test ${suffix}`],
  );
  return organizationId;
}

async function insertBranch(
  client: PoolClient,
  organizationId: string,
): Promise<string> {
  const branchId = randomUUID();
  const code = `BR-${shortId()}`;
  await client.query(
    `INSERT INTO branches (id, organization_id, code, name, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [branchId, organizationId, code, `Branch ${code}`],
  );
  return branchId;
}

async function insertStockLocation(
  client: PoolClient,
  organizationId: string,
  branchId: string,
  code = `LOC-${shortId()}`,
): Promise<string> {
  const stockLocationId = randomUUID();
  await client.query(
    `INSERT INTO stock_locations
       (id, organization_id, branch_id, code, name, kind, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'store', now())`,
    [stockLocationId, organizationId, branchId, code, `Location ${code}`],
  );
  return stockLocationId;
}

async function insertProductVariant(
  client: PoolClient,
  organizationId: string,
): Promise<string> {
  const suffix = shortId();
  const slugSuffix = suffix.toLowerCase();
  const categoryId = randomUUID();
  const brandId = randomUUID();
  const productModelId = randomUUID();
  const productVariantId = randomUUID();

  await client.query(
    `INSERT INTO categories (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [categoryId, organizationId, `Phones ${suffix}`, `phones-${slugSuffix}`],
  );
  await client.query(
    `INSERT INTO brands (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [brandId, organizationId, `Brand ${suffix}`, `brand-${slugSuffix}`],
  );
  await client.query(
    `INSERT INTO product_models
       (id, organization_id, brand_id, category_id, name, canonical_name,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      productModelId,
      organizationId,
      brandId,
      categoryId,
      `Model ${suffix}`,
      `model ${slugSuffix}`,
    ],
  );
  await client.query(
    `INSERT INTO product_variants
       (id, organization_id, product_model_id, sku, name, tracking_type,
        condition, pta_status, warranty_type, warranty_months, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'serialized', 'new', 'pta_approved',
             'none', NULL, now())`,
    [
      productVariantId,
      organizationId,
      productModelId,
      `SKU-${suffix}`,
      `Variant ${suffix}`,
    ],
  );
  return productVariantId;
}

async function insertUser(
  client: PoolClient,
  organizationId: string,
): Promise<string> {
  const userId = randomUUID();
  await client.query(
    `INSERT INTO users
       (id, organization_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, $3, 'test-hash', 'Inventory Test User', now())`,
    [userId, organizationId, `inventory-${randomUUID()}@example.test`],
  );
  return userId;
}

async function createInventoryFixture(
  client: PoolClient,
  label: string,
): Promise<InventoryFixture> {
  const suffix = `${label}-${shortId()}`;
  const organizationId = await createOrganization(client, suffix);
  const branchId = await insertBranch(client, organizationId);
  const locationCode = `LOC-${shortId()}`;
  const stockLocationId = await insertStockLocation(
    client,
    organizationId,
    branchId,
    locationCode,
  );
  const productVariantId = await insertProductVariant(client, organizationId);
  const userId = await insertUser(client, organizationId);

  return {
    organizationId,
    branchId,
    stockLocationId,
    productVariantId,
    userId,
    locationCode,
  };
}

interface SerializedUnitOverrides {
  readonly organizationId?: string;
  readonly branchId?: string;
  readonly productVariantId?: string;
  readonly stockLocationId?: string;
  readonly state?: string;
}

async function insertSerializedUnit(
  client: PoolClient,
  fixture: InventoryFixture,
  overrides: SerializedUnitOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO serialized_units
       (id, organization_id, branch_id, product_variant_id, stock_location_id,
        state, condition, pta_status, received_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'new', 'pta_approved', now(), now())`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      overrides.branchId ?? fixture.branchId,
      overrides.productVariantId ?? fixture.productVariantId,
      overrides.stockLocationId ?? fixture.stockLocationId,
      overrides.state ?? "available",
    ],
  );
  return id;
}

async function insertIdentifier(
  client: PoolClient,
  organizationId: string,
  serializedUnitId: string,
  identifierType: "imei" | "serial",
  position: 1 | 2,
  normalizedValue: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO device_identifiers
       (id, organization_id, serialized_unit_id, identifier_type,
        position, normalized_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      organizationId,
      serializedUnitId,
      identifierType,
      position,
      normalizedValue,
    ],
  );
  return id;
}

interface StockBatchOverrides {
  readonly organizationId?: string;
  readonly branchId?: string;
  readonly productVariantId?: string;
  readonly stockLocationId?: string;
  readonly quantityOnHand?: number;
  readonly quantityReserved?: number;
}

async function insertStockBatch(
  client: PoolClient,
  fixture: InventoryFixture,
  overrides: StockBatchOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO stock_batches
       (id, organization_id, branch_id, product_variant_id, stock_location_id,
        quantity_on_hand, quantity_reserved, received_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      overrides.branchId ?? fixture.branchId,
      overrides.productVariantId ?? fixture.productVariantId,
      overrides.stockLocationId ?? fixture.stockLocationId,
      overrides.quantityOnHand ?? 10,
      overrides.quantityReserved ?? 0,
    ],
  );
  return id;
}

interface MovementOverrides {
  readonly organizationId?: string;
  readonly branchId?: string;
  readonly productVariantId?: string;
  readonly stockLocationId?: string;
  readonly serializedUnitId?: string | null;
  readonly stockBatchId?: string | null;
  readonly movementType?: string;
  readonly quantity?: number;
  readonly fromState?: string | null;
  readonly toState?: string | null;
  readonly actorUserId?: string;
}

async function insertMovement(
  client: PoolClient,
  fixture: InventoryFixture,
  overrides: MovementOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO inventory_movements
       (id, organization_id, branch_id, product_variant_id, serialized_unit_id,
        stock_batch_id, stock_location_id, movement_type, quantity, from_state,
        to_state, reason, actor_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      overrides.branchId ?? fixture.branchId,
      overrides.productVariantId ?? fixture.productVariantId,
      overrides.serializedUnitId ?? null,
      overrides.stockBatchId ?? null,
      overrides.stockLocationId ?? fixture.stockLocationId,
      overrides.movementType ?? "adjustment_in",
      overrides.quantity ?? 1,
      overrides.fromState ?? null,
      overrides.toState ?? null,
      "Integration test movement",
      overrides.actorUserId ?? fixture.userId,
    ],
  );
  return id;
}

afterAll(async () => {
  await Promise.all([runtimePool.end(), migratorPool.end()]);
});

describe("0007 inventory foundation migration invariants", () => {
  beforeAll(async () => {
    await ensureInventoryMigrationApplied();

    const result = await migratorPool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
       FROM _prisma_migrations
       WHERE migration_name = $1
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL`,
      [MIGRATION_NAME],
    );
    expect(Number(result.rows[0]?.count ?? 0)).toBe(1);
  });

  describe("device_identifiers: the IMEI namespace", () => {
    it("refuses the same identifier twice in one organization, whatever its type or owning unit", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "imei-unique");
        const unitA = await insertSerializedUnit(client, fixture);
        const unitB = await insertSerializedUnit(client, fixture);
        const imei = "356938035643809";

        await insertIdentifier(
          client,
          fixture.organizationId,
          unitA,
          "imei",
          1,
          imei,
        );

        // The same value on the same unit, same type.
        await expectPgError(
          client,
          () =>
            insertIdentifier(
              client,
              fixture.organizationId,
              unitA,
              "imei",
              2,
              imei,
            ),
          "23505",
          CONSTRAINTS.IDENTIFIER_UNIQUE,
        );

        // A different TYPE must not open a second namespace: an IMEI already in
        // stock cannot be re-admitted by calling it a serial.
        await expectPgError(
          client,
          () =>
            insertIdentifier(
              client,
              fixture.organizationId,
              unitA,
              "serial",
              1,
              imei,
            ),
          "23505",
          CONSTRAINTS.IDENTIFIER_UNIQUE,
        );

        // Unit A's imei1 vs unit B's imei2: one namespace per organization, so
        // the second handset cannot claim the first handset's IMEI in any slot.
        await expectPgError(
          client,
          () =>
            insertIdentifier(
              client,
              fixture.organizationId,
              unitB,
              "imei",
              2,
              imei,
            ),
          "23505",
          CONSTRAINTS.IDENTIFIER_UNIQUE,
        );
        await expectPgError(
          client,
          () =>
            insertIdentifier(
              client,
              fixture.organizationId,
              unitB,
              "serial",
              1,
              imei,
            ),
          "23505",
          CONSTRAINTS.IDENTIFIER_UNIQUE,
        );

        // Uniqueness is per organization, so a different value is still fine on
        // the same unit — the constraint is not blanket-rejecting.
        await insertIdentifier(
          client,
          fixture.organizationId,
          unitA,
          "imei",
          2,
          "356938035643810",
        );
      });
    });

    it("allows the identical IMEI in a different organization", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createInventoryFixture(client, "imei-org-a");
        const second = await createInventoryFixture(client, "imei-org-b");
        const imei = "351756051523999";

        const firstUnit = await insertSerializedUnit(client, first);
        const secondUnit = await insertSerializedUnit(client, second);

        await insertIdentifier(
          client,
          first.organizationId,
          firstUnit,
          "imei",
          1,
          imei,
        );
        await insertIdentifier(
          client,
          second.organizationId,
          secondUnit,
          "imei",
          1,
          imei,
        );

        const rows = await client.query<{ readonly count: string }>(
          `SELECT count(*)::text AS count
             FROM device_identifiers
            WHERE normalized_value = $1
              AND organization_id = ANY($2::uuid[])`,
          [imei, [first.organizationId, second.organizationId]],
        );
        expect(rows.rows[0]?.count).toBe("2");
      });
    });

    it("refuses an un-normalized spelling that would dodge uniqueness", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "imei-format");
        const unit = await insertSerializedUnit(client, fixture);

        for (const invalid of [
          "356938-035643809",
          "356938 035643809",
          "35693803564380a",
          "",
        ]) {
          await expectPgError(
            client,
            () =>
              insertIdentifier(
                client,
                fixture.organizationId,
                unit,
                "imei",
                1,
                invalid,
              ),
            "23514",
            CONSTRAINTS.IDENTIFIER_FORMAT,
          );
        }

        // Upper-case alphanumeric serials are the accepted alphabet.
        await insertIdentifier(
          client,
          fixture.organizationId,
          unit,
          "serial",
          1,
          "F17GQ2PBJC6L",
        );
      });
    });

    it("accepts an identifier at the exact shared IDENTIFIER_LENGTH maximum", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "imei-max");
        const unit = await insertSerializedUnit(client, fixture);
        const maximal = "A".repeat(INVENTORY_CONTRACT_LIMITS.IDENTIFIER_LENGTH);

        await insertIdentifier(
          client,
          fixture.organizationId,
          unit,
          "serial",
          1,
          maximal,
        );

        const stored = await client.query<{ readonly length: number }>(
          `SELECT char_length(normalized_value)::int AS length
             FROM device_identifiers
            WHERE organization_id = $1 AND normalized_value = $2`,
          [fixture.organizationId, maximal],
        );
        expect(stored.rows[0]?.length).toBe(
          INVENTORY_CONTRACT_LIMITS.IDENTIFIER_LENGTH,
        );

        await expectPgError(
          client,
          () =>
            insertIdentifier(
              client,
              fixture.organizationId,
              unit,
              "serial",
              1,
              `${maximal}A`,
            ),
          "22001",
        );
      });
    });
  });

  describe("stock_batches: quantities can never go impossible", () => {
    it("rejects negative on-hand stock on insert and on update", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "batch-negative");

        await expectPgError(
          client,
          () => insertStockBatch(client, fixture, { quantityOnHand: -1 }),
          "23514",
          CONSTRAINTS.BATCH_ON_HAND,
        );

        const batchId = await insertStockBatch(client, fixture, {
          quantityOnHand: 3,
        });
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET quantity_on_hand = quantity_on_hand - 4 WHERE id = $1",
              [batchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_ON_HAND,
        );

        // Draining to exactly zero stays legal.
        await client.query(
          "UPDATE stock_batches SET quantity_on_hand = 0 WHERE id = $1",
          [batchId],
        );
        const drained = await client.query<{ readonly quantityOnHand: number }>(
          `SELECT quantity_on_hand AS "quantityOnHand"
             FROM stock_batches WHERE id = $1`,
          [batchId],
        );
        expect(drained.rows[0]?.quantityOnHand).toBe(0);
      });
    });

    it("rejects a reservation larger than on-hand and a negative reservation", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "batch-reserved");

        await expectPgError(
          client,
          () =>
            insertStockBatch(client, fixture, {
              quantityOnHand: 5,
              quantityReserved: 6,
            }),
          "23514",
          CONSTRAINTS.BATCH_RESERVED,
        );
        await expectPgError(
          client,
          () =>
            insertStockBatch(client, fixture, {
              quantityOnHand: 5,
              quantityReserved: -1,
            }),
          "23514",
          CONSTRAINTS.BATCH_RESERVED,
        );

        const batchId = await insertStockBatch(client, fixture, {
          quantityOnHand: 5,
          quantityReserved: 5,
        });

        // Reserving everything is allowed; over-reserving by one is not.
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET quantity_reserved = 6 WHERE id = $1",
              [batchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_RESERVED,
        );

        // Shipping out on-hand while a reservation still stands would leave
        // reserved > on_hand, so the CHECK must catch the lowering side too.
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET quantity_on_hand = 4 WHERE id = $1",
              [batchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_RESERVED,
        );

        await client.query(
          `UPDATE stock_batches
              SET quantity_on_hand = 4, quantity_reserved = 4
            WHERE id = $1`,
          [batchId],
        );
        const settled = await client.query<{
          readonly quantityOnHand: number;
          readonly quantityReserved: number;
        }>(
          `SELECT quantity_on_hand AS "quantityOnHand",
                  quantity_reserved AS "quantityReserved"
             FROM stock_batches WHERE id = $1`,
          [batchId],
        );
        expect(settled.rows[0]).toEqual({
          quantityOnHand: 4,
          quantityReserved: 4,
        });
      });
    });

    it("allows exactly one batch row per variant per location and scopes it by tenant", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createInventoryFixture(client, "batch-unique-a");
        const second = await createInventoryFixture(client, "batch-unique-b");

        await insertStockBatch(client, first);
        await expectPgError(
          client,
          () => insertStockBatch(client, first),
          "23505",
          CONSTRAINTS.BATCH_UNIQUE,
        );

        // A second location in the same organization gets its own batch row.
        const otherLocationId = await insertStockLocation(
          client,
          first.organizationId,
          first.branchId,
        );
        await insertStockBatch(client, first, {
          stockLocationId: otherLocationId,
        });

        // A second variant at the original location likewise.
        const otherVariantId = await insertProductVariant(
          client,
          first.organizationId,
        );
        await insertStockBatch(client, first, {
          productVariantId: otherVariantId,
        });

        // Another organization is untouched by the first organization's rows.
        await insertStockBatch(client, second);

        const counted = await client.query<{ readonly count: string }>(
          `SELECT count(*)::text AS count
             FROM stock_batches WHERE organization_id = $1`,
          [first.organizationId],
        );
        expect(counted.rows[0]?.count).toBe("3");
      });
    });
  });

  describe("inventory_movements: the ledger's shape", () => {
    it("rejects a zero or negative quantity", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "movement-qty");
        const batchId = await insertStockBatch(client, fixture);

        for (const quantity of [0, -1, -25]) {
          await expectPgError(
            client,
            () =>
              insertMovement(client, fixture, {
                stockBatchId: batchId,
                quantity,
              }),
            "23514",
            CONSTRAINTS.MOVEMENT_QUANTITY,
          );
        }

        // Direction is carried by movement_type, not by the sign of quantity.
        await insertMovement(client, fixture, {
          stockBatchId: batchId,
          movementType: "adjustment_out",
          quantity: 4,
        });
      });
    });

    it("requires exactly one of serialized_unit_id and stock_batch_id", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "movement-target");
        const batchId = await insertStockBatch(client, fixture);
        const unitId = await insertSerializedUnit(client, fixture);

        // Neither target: a movement of nothing.
        await expectPgError(
          client,
          () =>
            insertMovement(client, fixture, {
              serializedUnitId: null,
              stockBatchId: null,
            }),
          "23514",
          CONSTRAINTS.MOVEMENT_TARGET,
        );

        // Both targets: one movement double-counted across two ledgers.
        await expectPgError(
          client,
          () =>
            insertMovement(client, fixture, {
              serializedUnitId: unitId,
              stockBatchId: batchId,
            }),
          "23514",
          CONSTRAINTS.MOVEMENT_TARGET,
        );

        await insertMovement(client, fixture, { stockBatchId: batchId });
        await insertMovement(client, fixture, { serializedUnitId: unitId });
      });
    });

    it("pins a serialized movement to a quantity of exactly one", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(
          client,
          "movement-serialized",
        );
        const unitId = await insertSerializedUnit(client, fixture);

        for (const quantity of [2, 5]) {
          await expectPgError(
            client,
            () =>
              insertMovement(client, fixture, {
                serializedUnitId: unitId,
                quantity,
              }),
            "23514",
            CONSTRAINTS.MOVEMENT_SERIALIZED_QUANTITY,
          );
        }

        await insertMovement(client, fixture, {
          serializedUnitId: unitId,
          quantity: 1,
        });

        // A batch movement is free to carry a quantity above one.
        const batchId = await insertStockBatch(client, fixture);
        await insertMovement(client, fixture, {
          stockBatchId: batchId,
          quantity: 7,
        });
      });
    });

    it("keeps lifecycle states off batch movements", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "movement-states");
        const batchId = await insertStockBatch(client, fixture);
        const unitId = await insertSerializedUnit(client, fixture);

        for (const [fromState, toState] of [
          ["available", null],
          [null, "reserved"],
          ["available", "reserved"],
        ] as const) {
          await expectPgError(
            client,
            () =>
              insertMovement(client, fixture, {
                stockBatchId: batchId,
                fromState,
                toState,
              }),
            "23514",
            CONSTRAINTS.MOVEMENT_STATES,
          );
        }

        await insertMovement(client, fixture, {
          serializedUnitId: unitId,
          movementType: "reserve",
          fromState: "available",
          toState: "reserved",
        });
      });
    });

    it("is append-only: the runtime role may insert and read but never rewrite history", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "movement-append");
        const batchId = await insertStockBatch(client, fixture);
        const movementId = await insertMovement(client, fixture, {
          stockBatchId: batchId,
          quantity: 3,
        });

        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE inventory_movements SET quantity = 99 WHERE id = $1",
              [movementId],
            ),
          "42501",
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE inventory_movements SET reason = 'rewritten' WHERE false",
            ),
          "42501",
        );
        await expectPgError(
          client,
          () =>
            client.query("DELETE FROM inventory_movements WHERE id = $1", [
              movementId,
            ]),
          "42501",
        );
        await expectPgError(
          client,
          () => client.query("DELETE FROM inventory_movements WHERE false"),
          "42501",
        );
        await expectPgError(
          client,
          () => client.query("TRUNCATE TABLE inventory_movements"),
          "42501",
        );

        const stored = await client.query<{ readonly quantity: number }>(
          "SELECT quantity FROM inventory_movements WHERE id = $1",
          [movementId],
        );
        expect(stored.rows[0]?.quantity).toBe(3);
      });
    });

    it("is append-only behind the privilege layer too: the trigger stops a privileged role", async () => {
      // The runtime REVOKE hides the trigger behind a privilege error, so the
      // trigger itself is only observable through a role that holds UPDATE.
      await transaction(migratorPool, async (client) => {
        const fixture = await createInventoryFixture(client, "movement-trig");
        const batchId = await insertStockBatch(client, fixture);
        const movementId = await insertMovement(client, fixture, {
          stockBatchId: batchId,
        });

        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE inventory_movements SET quantity = 99 WHERE id = $1",
              [movementId],
            ),
          "55000",
        );
        await expectPgError(
          client,
          () =>
            client.query("DELETE FROM inventory_movements WHERE id = $1", [
              movementId,
            ]),
          "55000",
        );
      });
    });
  });

  describe("no-hard-delete protection", () => {
    it("denies runtime DELETE and TRUNCATE on every inventory table", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "no-delete");
        const unitId = await insertSerializedUnit(client, fixture);
        await insertIdentifier(
          client,
          fixture.organizationId,
          unitId,
          "imei",
          1,
          `35693803564${Math.floor(Math.random() * 9000 + 1000)}`,
        );
        await insertStockBatch(client, fixture);

        for (const table of [
          "stock_locations",
          "serialized_units",
          "stock_batches",
          "device_identifiers",
        ] as const) {
          await expectPgError(
            client,
            () =>
              client.query(`DELETE FROM ${table} WHERE organization_id = $1`, [
                fixture.organizationId,
              ]),
            "42501",
          );
          await expectPgError(
            client,
            () => client.query(`TRUNCATE TABLE ${table}`),
            "42501",
          );
        }
      });
    });

    it("keeps the no-hard-delete triggers firing for a privileged role", async () => {
      await transaction(migratorPool, async (client) => {
        const fixture = await createInventoryFixture(client, "trigger-delete");
        const unitId = await insertSerializedUnit(client, fixture);
        await insertIdentifier(
          client,
          fixture.organizationId,
          unitId,
          "serial",
          1,
          `SN${shortId()}${shortId()}`,
        );
        await insertStockBatch(client, fixture);

        for (const table of [
          "device_identifiers",
          "stock_batches",
          "serialized_units",
          "stock_locations",
        ] as const) {
          await expectPgError(
            client,
            () =>
              client.query(`DELETE FROM ${table} WHERE organization_id = $1`, [
                fixture.organizationId,
              ]),
            "55000",
          );
        }
      });
    });
  });

  describe("tenant isolation through composite foreign keys", () => {
    it("refuses a serialized unit that borrows another organization's variant, location or branch", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createInventoryFixture(client, "iso-unit-a");
        const second = await createInventoryFixture(client, "iso-unit-b");

        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, first, {
              productVariantId: second.productVariantId,
            }),
          "23503",
          CONSTRAINTS.UNIT_VARIANT_FK,
        );
        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, first, {
              stockLocationId: second.stockLocationId,
            }),
          "23503",
          CONSTRAINTS.UNIT_LOCATION_FK,
        );
        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, first, {
              branchId: second.branchId,
            }),
          "23503",
        );
      });
    });

    it("refuses a device identifier attached to another organization's unit", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createInventoryFixture(client, "iso-ident-a");
        const second = await createInventoryFixture(client, "iso-ident-b");
        const secondUnit = await insertSerializedUnit(client, second);

        await expectPgError(
          client,
          () =>
            insertIdentifier(
              client,
              first.organizationId,
              secondUnit,
              "imei",
              1,
              "359072061112223",
            ),
          "23503",
          CONSTRAINTS.IDENTIFIER_UNIT_FK,
        );
      });
    });

    it("refuses a stock batch that borrows another organization's variant, location or branch", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createInventoryFixture(client, "iso-batch-a");
        const second = await createInventoryFixture(client, "iso-batch-b");

        await expectPgError(
          client,
          () =>
            insertStockBatch(client, first, {
              productVariantId: second.productVariantId,
            }),
          "23503",
          CONSTRAINTS.BATCH_VARIANT_FK,
        );
        await expectPgError(
          client,
          () =>
            insertStockBatch(client, first, {
              stockLocationId: second.stockLocationId,
            }),
          "23503",
          CONSTRAINTS.BATCH_LOCATION_FK,
        );
        await expectPgError(
          client,
          () => insertStockBatch(client, first, { branchId: second.branchId }),
          "23503",
        );
      });
    });

    it("refuses a movement that borrows another organization's unit, batch, location or actor", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createInventoryFixture(client, "iso-move-a");
        const second = await createInventoryFixture(client, "iso-move-b");
        const secondUnit = await insertSerializedUnit(client, second);
        const secondBatch = await insertStockBatch(client, second);
        const firstBatch = await insertStockBatch(client, first);

        await expectPgError(
          client,
          () => insertMovement(client, first, { serializedUnitId: secondUnit }),
          "23503",
          CONSTRAINTS.MOVEMENT_UNIT_FK,
        );
        await expectPgError(
          client,
          () => insertMovement(client, first, { stockBatchId: secondBatch }),
          "23503",
          CONSTRAINTS.MOVEMENT_BATCH_FK,
        );
        await expectPgError(
          client,
          () =>
            insertMovement(client, first, {
              stockBatchId: firstBatch,
              stockLocationId: second.stockLocationId,
            }),
          "23503",
          CONSTRAINTS.MOVEMENT_LOCATION_FK,
        );
        await expectPgError(
          client,
          () =>
            insertMovement(client, first, {
              stockBatchId: firstBatch,
              actorUserId: second.userId,
            }),
          "23503",
          CONSTRAINTS.MOVEMENT_ACTOR_FK,
        );
        await expectPgError(
          client,
          () =>
            insertMovement(client, first, {
              stockBatchId: firstBatch,
              productVariantId: second.productVariantId,
            }),
          "23503",
          CONSTRAINTS.MOVEMENT_VARIANT_FK,
        );
      });
    });

    it("forces a unit's branch to agree with the branch of the location holding it", async () => {
      // The stock_location foreign keys carry branch_id as well as
      // organization_id, so an in-tenant but wrong-branch pairing is rejected
      // too — not just a cross-tenant one.
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "branch-agree");
        const otherBranchId = await insertBranch(
          client,
          fixture.organizationId,
        );
        const otherBranchLocationId = await insertStockLocation(
          client,
          fixture.organizationId,
          otherBranchId,
        );

        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, fixture, {
              stockLocationId: otherBranchLocationId,
            }),
          "23503",
          CONSTRAINTS.UNIT_LOCATION_FK,
        );
        await expectPgError(
          client,
          () =>
            insertStockBatch(client, fixture, {
              stockLocationId: otherBranchLocationId,
            }),
          "23503",
          CONSTRAINTS.BATCH_LOCATION_FK,
        );

        // Moving both together is the supported way to sit in another branch.
        await insertSerializedUnit(client, fixture, {
          branchId: otherBranchId,
          stockLocationId: otherBranchLocationId,
        });
      });
    });
  });

  describe("optimistic concurrency tokens", () => {
    it("defaults every inventory version column to 1", async () => {
      const columns = await runtimePool.query<{
        readonly tableName: string;
        readonly isNullable: string;
        readonly columnDefault: string | null;
        readonly dataType: string;
      }>(
        `SELECT table_name AS "tableName",
                is_nullable AS "isNullable",
                column_default AS "columnDefault",
                data_type AS "dataType"
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND column_name = 'version'
            AND table_name IN
              ('stock_locations', 'serialized_units', 'stock_batches')
          ORDER BY table_name`,
      );
      expect(columns.rows).toEqual([
        {
          tableName: "serialized_units",
          isNullable: "NO",
          columnDefault: "1",
          dataType: "integer",
        },
        {
          tableName: "stock_batches",
          isNullable: "NO",
          columnDefault: "1",
          dataType: "integer",
        },
        {
          tableName: "stock_locations",
          isNullable: "NO",
          columnDefault: "1",
          dataType: "integer",
        },
      ]);

      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "version-default");
        const unitId = await insertSerializedUnit(client, fixture);
        const batchId = await insertStockBatch(client, fixture);

        const seeded = await client.query<{ readonly version: number }>(
          `SELECT version FROM stock_locations WHERE id = $1
           UNION ALL
           SELECT version FROM serialized_units WHERE id = $2
           UNION ALL
           SELECT version FROM stock_batches WHERE id = $3`,
          [fixture.stockLocationId, unitId, batchId],
        );
        expect(seeded.rows.map((row) => row.version)).toEqual([1, 1, 1]);
      });
    });

    it("rejects a zero or negative version on every inventory table", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "version-check");
        const unitId = await insertSerializedUnit(client, fixture);
        const batchId = await insertStockBatch(client, fixture);

        const targets = [
          ["stock_locations", fixture.stockLocationId],
          ["serialized_units", unitId],
          ["stock_batches", batchId],
        ] as const;

        for (const [table, id] of targets) {
          for (const invalidVersion of [0, -1]) {
            await expectPgError(
              client,
              () =>
                client.query(`UPDATE ${table} SET version = $1 WHERE id = $2`, [
                  invalidVersion,
                  id,
                ]),
              "23514",
            );
          }

          // The positive path still moves, so the CHECK is not blanket-rejecting.
          await client.query(
            `UPDATE ${table} SET version = version + 1 WHERE id = $1`,
            [id],
          );
          const bumped = await client.query<{ readonly version: number }>(
            `SELECT version FROM ${table} WHERE id = $1`,
            [id],
          );
          expect(bumped.rows[0]?.version).toBe(2);
        }
      });
    });
  });

  describe("stock_locations", () => {
    it("scopes location code uniqueness by tenant and branch", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createInventoryFixture(client, "loc-code-a");
        const second = await createInventoryFixture(client, "loc-code-b");

        // Same organization, same branch, same code: rejected.
        await expectPgError(
          client,
          () =>
            insertStockLocation(
              client,
              first.organizationId,
              first.branchId,
              first.locationCode,
            ),
          "23505",
          CONSTRAINTS.LOCATION_CODE_UNIQUE,
        );

        // The applied uniqueness is (organization_id, branch_id, code), so the
        // same code in a SECOND BRANCH of the same organization is accepted:
        // "SHELF-A" is a per-branch shelf name, not a tenant-wide one.
        const otherBranchId = await insertBranch(client, first.organizationId);
        await insertStockLocation(
          client,
          first.organizationId,
          otherBranchId,
          first.locationCode,
        );

        // The same code in a different ORGANIZATION is always accepted.
        await insertStockLocation(
          client,
          second.organizationId,
          second.branchId,
          first.locationCode,
        );

        const rows = await client.query<{ readonly count: string }>(
          `SELECT count(*)::text AS count
             FROM stock_locations
            WHERE code = $1
              AND organization_id = ANY($2::uuid[])`,
          [first.locationCode, [first.organizationId, second.organizationId]],
        );
        expect(rows.rows[0]?.count).toBe("3");
      });
    });

    it("accepts a location code at the exact shared CODE_LENGTH maximum", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "loc-code-max");
        const maximal = normalizeStockLocationCode(
          "C".repeat(INVENTORY_CONTRACT_LIMITS.CODE_LENGTH),
        );
        expect(maximal).toHaveLength(INVENTORY_CONTRACT_LIMITS.CODE_LENGTH);

        const locationId = await insertStockLocation(
          client,
          fixture.organizationId,
          fixture.branchId,
          maximal,
        );
        const stored = await client.query<{ readonly length: number }>(
          `SELECT char_length(code)::int AS length
             FROM stock_locations WHERE id = $1`,
          [locationId],
        );
        expect(stored.rows[0]?.length).toBe(
          INVENTORY_CONTRACT_LIMITS.CODE_LENGTH,
        );

        // One character past the contract maximum is refused by the column, so
        // the shared limit and the applied VARCHAR(20) agree exactly.
        await expectPgError(
          client,
          () =>
            insertStockLocation(
              client,
              fixture.organizationId,
              fixture.branchId,
              `${maximal}C`,
            ),
          "22001",
        );
      });
    });
  });

  describe("serialized_units", () => {
    it("keeps reserved cost columns nullable, non-negative and outside every contract", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "unit-cost");
        const unitId = await insertSerializedUnit(client, fixture);

        const defaults = await client.query<{
          readonly actualCostMinor: string | null;
          readonly landedCostMinor: string | null;
        }>(
          `SELECT actual_cost_minor AS "actualCostMinor",
                  landed_cost_minor AS "landedCostMinor"
             FROM serialized_units WHERE id = $1`,
          [unitId],
        );
        expect(defaults.rows[0]).toEqual({
          actualCostMinor: null,
          landedCostMinor: null,
        });

        for (const column of [
          "actual_cost_minor",
          "landed_cost_minor",
        ] as const) {
          await expectPgError(
            client,
            () =>
              client.query(
                `UPDATE serialized_units SET ${column} = -1 WHERE id = $1`,
                [unitId],
              ),
            "23514",
          );
          await client.query(
            `UPDATE serialized_units SET ${column} = 0 WHERE id = $1`,
            [unitId],
          );
        }
      });
    });

    it("stores every serialized stock state the shared enum declares", async () => {
      const states = await runtimePool.query<{ readonly label: string }>(
        `SELECT e.enumlabel AS label
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'SerializedStockState'
          ORDER BY e.enumsortorder`,
      );
      expect(states.rows.map((row) => row.label)).toEqual([
        "pending_verification",
        "quarantined",
        "available",
        "reserved",
        "sold",
        "returned_inspection",
        "defective",
        "supplier_warranty",
        "customer_warranty",
        "repair",
        "written_off",
        "purchase_returned",
      ]);

      await transaction(runtimePool, async (client) => {
        const fixture = await createInventoryFixture(client, "unit-states");
        for (const row of states.rows) {
          await insertSerializedUnit(client, fixture, { state: row.label });
        }

        const stored = await client.query<{ readonly count: string }>(
          `SELECT count(DISTINCT state)::text AS count
             FROM serialized_units WHERE organization_id = $1`,
          [fixture.organizationId],
        );
        expect(stored.rows[0]?.count).toBe(String(states.rows.length));
      });
    });
  });
});
