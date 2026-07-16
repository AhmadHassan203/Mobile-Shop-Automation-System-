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
const databaseRoot = path.join(workspaceRoot, "database");
const environmentPath = path.join(workspaceRoot, ".env");

if (existsSync(environmentPath)) {
  const fileEnvironment = parse(readFileSync(environmentPath));
  for (const key of [
    "TEST_DATABASE_URL",
    "TEST_MIGRATION_DATABASE_URL",
  ] as const) {
    if (process.env[key] === undefined && fileEnvironment[key] !== undefined) {
      process.env[key] = fileEnvironment[key];
    }
  }
}

function requiredUrl(
  name: "TEST_DATABASE_URL" | "TEST_MIGRATION_DATABASE_URL",
): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for database integration tests`);
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

const MIGRATION_NAME = "20260717210000_0011_sales_foundation";
const migrationPath = path.join(
  databaseRoot,
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);

const CONSTRAINTS = Object.freeze({
  CUSTOMER_PHONE: "customers_organization_phone_uq",
  PRICE_SCOPE_KEY:
    "price_entries_organization_id_price_list_id_product_variant_key",
  SALE_TOTALS: "sales_lines_totals_reconcile",
  SALE_CANCELLED: "sales_cancelled_shape_check",
  LINE_TRACKING: "sale_lines_tracking_shape_check",
  ACTIVE_UNIT: "sale_lines_active_serialized_unit_uq",
  ALLOCATION_TARGET: "payment_allocations_target_xor_check",
  ALLOCATION_TOTAL: "payments_allocations_reconcile",
  RECEIVABLE_BALANCE: "receivables_balance_identity_check",
});

async function ensureMigrationApplied(): Promise<void> {
  const database = await migratorPool.query<{ readonly name: string }>(
    `SELECT current_database() AS name`,
  );
  if (database.rows[0]?.name !== "mobileshop_test") {
    throw new Error(
      `Sales integration migration is restricted to mobileshop_test; received ${database.rows[0]?.name ?? "unknown"}`,
    );
  }

  const state = await migratorPool.query<{
    readonly table_exists: boolean;
    readonly ledger_exists: boolean;
  }>(
    `SELECT to_regclass('sales') IS NOT NULL AS table_exists,
            EXISTS (
              SELECT 1 FROM _prisma_migrations
               WHERE migration_name = $1 AND finished_at IS NOT NULL
            ) AS ledger_exists`,
    [MIGRATION_NAME],
  );
  const current = state.rows[0];
  if (current?.table_exists === true && current.ledger_exists === true) return;
  if (current?.table_exists !== current?.ledger_exists) {
    throw new Error("0011 sales migration schema and migration ledger disagree");
  }

  const prerequisite = await migratorPool.query<{ readonly exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'goods_receipts'
          AND column_name = 'idempotency_key'
     ) AS exists`,
  );
  if (prerequisite.rows[0]?.exists !== true) {
    throw new Error("0010 goods-receipt idempotency must exist before 0011");
  }

  const sql = readFileSync(migrationPath);
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
async function expectPgError(
  client: PoolClient,
  work: () => Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  savepointSequence += 1;
  const savepoint = `expected_sales_error_${savepointSequence}`;
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
  throw new Error(
    `Expected PostgreSQL error ${code}${constraint === undefined ? "" : ` (${constraint})`}`,
  );
}

async function forceDeferredChecks(client: PoolClient): Promise<void> {
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
}

function suffix(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

interface BaseFixture {
  readonly organizationId: string;
  readonly branchId: string;
  readonly stockLocationId: string;
  readonly quantityVariantId: string;
  readonly serializedVariantId: string;
  readonly userId: string;
}

interface SaleFixture extends BaseFixture {
  readonly customerId: string;
  readonly saleId: string;
  readonly lineId: string;
}

async function insertOrganization(
  client: PoolClient,
  label: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, updated_at)
     VALUES ($1, $2, now())`,
    [id, `Sales Test ${label}-${suffix()}`],
  );
  return id;
}

async function insertBranch(
  client: PoolClient,
  organizationId: string,
): Promise<string> {
  const id = randomUUID();
  const code = `BR-${suffix()}`;
  await client.query(
    `INSERT INTO branches (id, organization_id, code, name, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [id, organizationId, code, `Branch ${code}`],
  );
  return id;
}

async function insertLocation(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): Promise<string> {
  const id = randomUUID();
  const code = `LOC-${suffix()}`;
  await client.query(
    `INSERT INTO stock_locations
       (id, organization_id, branch_id, code, name, kind, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'store', now())`,
    [id, organizationId, branchId, code, `Location ${code}`],
  );
  return id;
}

async function insertUser(
  client: PoolClient,
  organizationId: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO users
       (id, organization_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, $3, 'test-hash', 'Sales Test User', now())`,
    [id, organizationId, `sales-${randomUUID()}@example.test`],
  );
  return id;
}

async function insertVariant(
  client: PoolClient,
  organizationId: string,
  trackingType: "quantity" | "serialized",
): Promise<string> {
  const token = suffix();
  const slug = token.toLowerCase();
  const categoryId = randomUUID();
  const brandId = randomUUID();
  const modelId = randomUUID();
  const variantId = randomUUID();
  await client.query(
    `INSERT INTO categories (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [categoryId, organizationId, `Category ${token}`, `category-${slug}`],
  );
  await client.query(
    `INSERT INTO brands (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [brandId, organizationId, `Brand ${token}`, `brand-${slug}`],
  );
  await client.query(
    `INSERT INTO product_models
       (id, organization_id, brand_id, category_id, name, canonical_name,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [modelId, organizationId, brandId, categoryId, `Model ${token}`, `model ${slug}`],
  );
  await client.query(
    `INSERT INTO product_variants
       (id, organization_id, product_model_id, sku, name, tracking_type,
        condition, pta_status, warranty_type, default_price_minor,
        min_price_minor, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, 'none', 500, 450, now())`,
    [
      variantId,
      organizationId,
      modelId,
      `SKU-${token}`,
      `Variant ${token}`,
      trackingType,
      trackingType === "serialized" ? "pta_approved" : "not_applicable",
    ],
  );
  return variantId;
}

async function createBaseFixture(
  client: PoolClient,
  label: string,
): Promise<BaseFixture> {
  const organizationId = await insertOrganization(client, label);
  const branchId = await insertBranch(client, organizationId);
  const stockLocationId = await insertLocation(client, organizationId, branchId);
  const userId = await insertUser(client, organizationId);
  const quantityVariantId = await insertVariant(
    client,
    organizationId,
    "quantity",
  );
  const serializedVariantId = await insertVariant(
    client,
    organizationId,
    "serialized",
  );
  return {
    organizationId,
    branchId,
    stockLocationId,
    quantityVariantId,
    serializedVariantId,
    userId,
  };
}

async function insertCustomer(
  client: PoolClient,
  organizationId: string,
  phone = `+923${Math.floor(100_000_000 + Math.random() * 900_000_000)}`,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO customers
       (id, organization_id, customer_number, full_name, phone_e164,
        phone_raw, marketing_consent, address_line, updated_at)
     VALUES ($1, $2, $3, 'Ayesha Customer', $4, $4, 'granted',
             'Hall Road, Lahore', now())`,
    [id, organizationId, `CUS-${suffix()}`, phone],
  );
  return id;
}

async function insertDraftQuantitySale(
  client: PoolClient,
  fixture: BaseFixture,
  customerId: string | null,
  label: string,
  held = false,
): Promise<{ readonly saleId: string; readonly lineId: string }> {
  const saleId = randomUUID();
  const lineId = randomUUID();
  await client.query(
    `INSERT INTO sales
       (id, organization_id, branch_id, customer_id,
        customer_name_snapshot, customer_phone_snapshot,
        salesperson_user_id, cashier_user_id, status,
        subtotal_minor, discount_minor, tax_minor, total_minor,
        cogs_minor, gross_profit_minor, discount_reason, note,
        held_at, held_by_user_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'draft',
             1000, 100, 50, 950, 600, 350, 'Counter offer', $8,
             $9, $10, now())`,
    [
      saleId,
      fixture.organizationId,
      fixture.branchId,
      customerId,
      customerId === null ? "Walk-in Customer" : "Ayesha Customer",
      customerId === null ? null : "+923001234567",
      fixture.userId,
      `Sale note ${label}`,
      held ? new Date().toISOString() : null,
      held ? fixture.userId : null,
    ],
  );
  await client.query(
    `INSERT INTO sale_lines
       (id, organization_id, branch_id, sale_id, stock_location_id,
        line_number, product_variant_id, tracking_type_snapshot,
        product_name_snapshot, sku_snapshot, quantity, unit_price_minor,
        price_version_snapshot, discount_minor, discount_reason, tax_minor,
        line_total_minor, unit_cogs_minor, cogs_minor, gross_profit_minor,
        warranty_type_snapshot, unit_sale_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, $6, 'quantity',
             'Quantity Product Snapshot', $7, 2, 500, 1, 100,
             'Counter offer', 50, 950, 300, 600, 350, 'none', false, now())`,
    [
      lineId,
      fixture.organizationId,
      fixture.branchId,
      saleId,
      fixture.stockLocationId,
      fixture.quantityVariantId,
      `SKU-${suffix()}`,
    ],
  );
  return { saleId, lineId };
}

async function postSale(
  client: PoolClient,
  saleId: string,
  invoiceNumber: string,
  postRequestId: string = randomUUID(),
): Promise<void> {
  await client.query(
    `UPDATE sales
        SET status = 'posted', invoice_number = $2, posted_at = now(),
            business_date = DATE '2026-07-17', post_request_id = $3,
            post_request_hash = repeat('a', 64), version = version + 1,
            receipt_snapshot = '{}'::jsonb,
            held_at = NULL, held_by_user_id = NULL, updated_at = now()
      WHERE id = $1`,
    [saleId, invoiceNumber, postRequestId],
  );
}

async function createPostedQuantitySale(
  client: PoolClient,
  label: string,
): Promise<SaleFixture> {
  const fixture = await createBaseFixture(client, label);
  const customerId = await insertCustomer(client, fixture.organizationId);
  const sale = await insertDraftQuantitySale(client, fixture, customerId, label);
  await postSale(client, sale.saleId, `INV-${suffix()}`);
  await forceDeferredChecks(client);
  return { ...fixture, customerId, ...sale };
}

async function insertSerializedUnit(
  client: PoolClient,
  fixture: BaseFixture,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO serialized_units
       (id, organization_id, branch_id, product_variant_id,
        stock_location_id, state, condition, pta_status, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'available', 'new',
             'pta_approved', now())`,
    [
      id,
      fixture.organizationId,
      fixture.branchId,
      fixture.serializedVariantId,
      fixture.stockLocationId,
    ],
  );
  return id;
}

async function createPostedSerializedSale(
  client: PoolClient,
  label: string,
): Promise<SaleFixture & { readonly serializedUnitId: string }> {
  const fixture = await createBaseFixture(client, label);
  const customerId = await insertCustomer(client, fixture.organizationId);
  const serializedUnitId = await insertSerializedUnit(client, fixture);
  const saleId = randomUUID();
  const lineId = randomUUID();
  await client.query(
    `INSERT INTO sales
       (id, organization_id, branch_id, customer_id,
        customer_name_snapshot, customer_phone_snapshot,
        salesperson_user_id, cashier_user_id, status, subtotal_minor,
        discount_minor, tax_minor, total_minor, cogs_minor,
        gross_profit_minor, updated_at)
     VALUES ($1, $2, $3, $4, 'Ayesha Customer', '+923001234567',
             $5, $5, 'draft', 1000, 0, 0, 1000, 700, 300, now())`,
    [saleId, fixture.organizationId, fixture.branchId, customerId, fixture.userId],
  );
  await client.query(
    `INSERT INTO sale_lines
       (id, organization_id, branch_id, sale_id, stock_location_id,
        line_number, product_variant_id, serialized_unit_id,
        tracking_type_snapshot, product_name_snapshot, sku_snapshot,
        imei_snapshot, quantity, unit_price_minor, price_version_snapshot,
        discount_minor, tax_minor, line_total_minor, unit_cogs_minor,
        cogs_minor, gross_profit_minor, warranty_type_snapshot,
        unit_sale_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $7, 'serialized',
             'Serialized Product Snapshot', $8, '356789012345678', 1,
             1000, 1, 0, 0, 1000, 700, 700, 300, 'none', false, now())`,
    [
      lineId,
      fixture.organizationId,
      fixture.branchId,
      saleId,
      fixture.stockLocationId,
      fixture.serializedVariantId,
      serializedUnitId,
      `SKU-${suffix()}`,
    ],
  );
  await client.query(
    `UPDATE sale_lines SET unit_sale_active = true, updated_at = now()
      WHERE id = $1`,
    [lineId],
  );
  await postSale(client, saleId, `INV-${suffix()}`);
  await forceDeferredChecks(client);
  return { ...fixture, customerId, saleId, lineId, serializedUnitId };
}

async function insertCashSession(
  client: PoolClient,
  fixture: BaseFixture,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO cash_sessions
       (id, organization_id, branch_id, session_number, cashier_user_id,
        opened_by_user_id, opening_cash_minor, business_date, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5, 20000, DATE '2026-07-17', now())`,
    [id, fixture.organizationId, fixture.branchId, `CS-${suffix()}`, fixture.userId],
  );
  return id;
}

async function insertFinancialAccount(
  client: PoolClient,
  fixture: BaseFixture,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO financial_accounts
       (id, organization_id, branch_id, code, name, account_type,
        account_subtype, normal_balance, updated_at)
     VALUES ($1, $2, $3, $4, 'Counter cash', 'asset', 'physical_cash',
             'debit', now())`,
    [id, fixture.organizationId, fixture.branchId, `CASH-${suffix()}`],
  );
  return id;
}

beforeAll(async () => {
  await ensureMigrationApplied();
});

afterAll(async () => {
  await Promise.all([runtimePool.end(), migratorPool.end()]);
});

describe("0011 sales foundation", () => {
  it("records the migration, exact enums, alignment columns, and scoped indexes", async () => {
    const ledger = await migratorPool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count FROM _prisma_migrations
        WHERE migration_name = $1 AND finished_at IS NOT NULL`,
      [MIGRATION_NAME],
    );
    expect(ledger.rows[0]?.count).toBe("1");

    const enumRows = await migratorPool.query<{
      readonly typname: string;
      readonly labels: string[];
    }>(
      `SELECT t.typname,
              array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('SaleStatus', 'PaymentMethod',
                            'CashSessionStatus', 'LedgerDirection',
                            'CustomerMarketingConsentStatus')
        GROUP BY t.typname`,
    );
    const enums = Object.fromEntries(
      enumRows.rows.map((row) => [row.typname, row.labels]),
    );
    expect(enums).toMatchObject({
      SaleStatus: ["draft", "posted", "cancelled", "partially_returned", "returned"],
      PaymentMethod: ["cash", "bank_transfer", "card", "digital_wallet", "credit"],
      CashSessionStatus: ["open", "closing_pending", "closed", "reviewed", "reopened_with_authorization"],
      LedgerDirection: ["debit", "credit"],
      CustomerMarketingConsentStatus: ["pending", "granted", "declined", "withdrawn"],
    });

    const columns = await migratorPool.query<{
      readonly table_name: string;
      readonly column_name: string;
    }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND (
          (table_name = 'customers' AND column_name IN ('marketing_consent', 'address_line')) OR
          (table_name = 'price_entries' AND column_name = 'branch_id') OR
          (table_name = 'sales' AND column_name IN ('note', 'held_at', 'held_by_user_id', 'cancelled_at', 'cancelled_by_user_id', 'cancellation_reason')) OR
          (table_name = 'sale_lines' AND column_name IN ('stock_location_id', 'price_version_snapshot', 'discount_reason'))
        )`,
    );
    expect(columns.rowCount).toBe(12);

    const indexes = await migratorPool.query<{ readonly indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN ($1, $2, $3)`,
      [
        CONSTRAINTS.PRICE_SCOPE_KEY,
        CONSTRAINTS.CUSTOMER_PHONE,
        CONSTRAINTS.ACTIVE_UNIT,
      ],
    );
    expect(indexes.rows.map((row) => row.indexdef).join("\n")).toContain(
      "NULLS NOT DISTINCT",
    );
    expect(indexes.rows.map((row) => row.indexdef).join("\n")).toContain(
      "unit_sale_active",
    );

    const immutableTriggers = await migratorPool.query<{
      readonly tgname: string;
      readonly definition: string;
    }>(
      `SELECT tgname, pg_get_triggerdef(oid) AS definition
         FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname IN ('price_entries_immutable', 'payments_immutable',
                         'payment_allocations_immutable',
                         'financial_entries_immutable')`,
    );
    expect(immutableTriggers.rowCount).toBe(4);
    for (const trigger of immutableTriggers.rows) {
      expect(trigger.definition).toContain("UPDATE");
      expect(trigger.definition).toContain("DELETE");
      expect(trigger.definition).toContain("TRUNCATE");
    }
  });

  it("persists customer consent/address and resolves branch price overrides over an org default", async () => {
    await transaction(migratorPool, async (client) => {
      const fixture = await createBaseFixture(client, "price-customer");
      const customerId = await insertCustomer(
        client,
        fixture.organizationId,
        "+923001112233",
      );
      const customer = await client.query<{
        readonly marketing_consent: string;
        readonly address_line: string;
      }>(
        `SELECT marketing_consent, address_line FROM customers WHERE id = $1`,
        [customerId],
      );
      expect(customer.rows[0]).toEqual({
        marketing_consent: "granted",
        address_line: "Hall Road, Lahore",
      });
      await expectPgError(
        client,
        () => insertCustomer(client, fixture.organizationId, "+923001112233"),
        "23505",
        CONSTRAINTS.CUSTOMER_PHONE,
      );

      const priceListId = randomUUID();
      await client.query(
        `INSERT INTO price_lists
           (id, organization_id, code, name, updated_at)
         VALUES ($1, $2, $3, 'Retail', now())`,
        [priceListId, fixture.organizationId, `RTL-${suffix()}`],
      );
      const effectiveFrom = "2026-07-17T00:00:00.000Z";
      await client.query(
        `INSERT INTO price_entries
           (id, organization_id, branch_id, price_list_id,
            product_variant_id, price_minor, min_price_minor, effective_from)
         VALUES ($1, $2, NULL, $3, $4, 500, 450, $5)`,
        [
          randomUUID(),
          fixture.organizationId,
          priceListId,
          fixture.quantityVariantId,
          effectiveFrom,
        ],
      );
      await client.query(
        `INSERT INTO price_entries
           (id, organization_id, branch_id, price_list_id,
            product_variant_id, price_minor, min_price_minor, effective_from)
         VALUES ($1, $2, $3, $4, $5, 475, 450, $6)`,
        [
          randomUUID(),
          fixture.organizationId,
          fixture.branchId,
          priceListId,
          fixture.quantityVariantId,
          effectiveFrom,
        ],
      );
      const resolved = await client.query<{ readonly price_minor: string }>(
        `SELECT price_minor::text
           FROM price_entries
          WHERE organization_id = $1 AND product_variant_id = $2
            AND (branch_id = $3 OR branch_id IS NULL)
          ORDER BY (branch_id = $3) DESC NULLS LAST, effective_from DESC
          LIMIT 1`,
        [fixture.organizationId, fixture.quantityVariantId, fixture.branchId],
      );
      expect(resolved.rows[0]?.price_minor).toBe("475");
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO price_entries
               (id, organization_id, branch_id, price_list_id,
                product_variant_id, price_minor, effective_from)
             VALUES ($1, $2, NULL, $3, $4, 501, $5)`,
            [
              randomUUID(),
              fixture.organizationId,
              priceListId,
              fixture.quantityVariantId,
              effectiveFrom,
            ],
          ),
        "23505",
        CONSTRAINTS.PRICE_SCOPE_KEY,
      );
    });
  });

  it("supports walk-in/held drafts, per-line locations, and rejects incoherent draft truth", async () => {
    await transaction(migratorPool, async (client) => {
      const fixture = await createBaseFixture(client, "draft");
      const draft = await insertDraftQuantitySale(
        client,
        fixture,
        null,
        "held walk-in",
        true,
      );
      await forceDeferredChecks(client);
      const persisted = await client.query<{
        readonly customer_id: string | null;
        readonly customer_name_snapshot: string;
        readonly held_by_user_id: string;
        readonly stock_location_id: string;
      }>(
        `SELECT s.customer_id, s.customer_name_snapshot, s.held_by_user_id,
                l.stock_location_id
           FROM sales s JOIN sale_lines l ON l.sale_id = s.id
          WHERE s.id = $1`,
        [draft.saleId],
      );
      expect(persisted.rows[0]).toMatchObject({
        customer_id: null,
        customer_name_snapshot: "Walk-in Customer",
        held_by_user_id: fixture.userId,
        stock_location_id: fixture.stockLocationId,
      });

      await client.query(
        `UPDATE sales
            SET subtotal_minor = 1001, total_minor = 951,
                gross_profit_minor = 351, updated_at = now()
          WHERE id = $1`,
        [draft.saleId],
      );
      await expectPgError(
        client,
        () => client.query("SET CONSTRAINTS ALL IMMEDIATE"),
        "23514",
        CONSTRAINTS.SALE_TOTALS,
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `UPDATE sales SET status = 'cancelled', updated_at = now()
              WHERE id = $1`,
            [draft.saleId],
          ),
        "23514",
        CONSTRAINTS.SALE_CANCELLED,
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO sale_lines
               (id, organization_id, branch_id, sale_id, stock_location_id,
                line_number, product_variant_id, tracking_type_snapshot,
                product_name_snapshot, sku_snapshot, quantity,
                unit_price_minor, price_version_snapshot, discount_minor,
                tax_minor, line_total_minor, unit_cogs_minor, cogs_minor,
                gross_profit_minor, warranty_type_snapshot, updated_at)
             VALUES ($1, $2, $3, $4, $5, 2, $6, 'serialized',
                     'Bad serialized snapshot', 'SKU-BAD', 2, 10, 1, 0, 0,
                     20, 5, 10, 10, 'none', now())`,
            [
              randomUUID(),
              fixture.organizationId,
              fixture.branchId,
              draft.saleId,
              fixture.stockLocationId,
              fixture.serializedVariantId,
            ],
          ),
        "23514",
        CONSTRAINTS.LINE_TRACKING,
      );
    });
  });

  it("posts exact immutable snapshots and scopes invoice/request/unit uniqueness", async () => {
    await transaction(migratorPool, async (client) => {
      const sale = await createPostedSerializedSale(client, "posted");
      const snapshot = await client.query<{
        readonly status: string;
        readonly post_request_hash: string;
        readonly unit_sale_active: boolean;
        readonly stock_location_id: string;
        readonly imei_snapshot: string;
      }>(
        `SELECT s.status, s.post_request_hash, l.unit_sale_active,
                l.stock_location_id, l.imei_snapshot
           FROM sales s JOIN sale_lines l ON l.sale_id = s.id
          WHERE s.id = $1`,
        [sale.saleId],
      );
      expect(snapshot.rows[0]).toMatchObject({
        status: "posted",
        post_request_hash: "a".repeat(64),
        unit_sale_active: true,
        stock_location_id: sale.stockLocationId,
        imei_snapshot: "356789012345678",
      });
      await expectPgError(
        client,
        () =>
          client.query(
            `UPDATE sales SET customer_name_snapshot = 'Rewritten' WHERE id = $1`,
            [sale.saleId],
          ),
        "55000",
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `UPDATE sale_lines SET unit_price_minor = 1 WHERE id = $1`,
            [sale.lineId],
          ),
        "55000",
      );

      const second = await insertDraftQuantitySale(
        client,
        sale,
        sale.customerId,
        "duplicate invoice",
      );
      const first = await client.query<{
        readonly invoice_number: string;
        readonly post_request_id: string;
      }>(
        `SELECT invoice_number, post_request_id FROM sales WHERE id = $1`,
        [sale.saleId],
      );
      await expectPgError(
        client,
        () =>
          postSale(
            client,
            second.saleId,
            first.rows[0]?.invoice_number ?? "missing",
          ),
        "23505",
      );
      await expectPgError(
        client,
        () =>
          postSale(
            client,
            second.saleId,
            `INV-${suffix()}`,
            first.rows[0]?.post_request_id ?? randomUUID(),
          ),
        "23505",
      );

      const thirdSaleId = randomUUID();
      await client.query(
        `INSERT INTO sales
           (id, organization_id, branch_id, customer_name_snapshot,
            salesperson_user_id, cashier_user_id, status, subtotal_minor,
            total_minor, cogs_minor, gross_profit_minor, updated_at)
         VALUES ($1, $2, $3, 'Walk-in Customer', $4, $4, 'draft',
                 1000, 1000, 700, 300, now())`,
        [thirdSaleId, sale.organizationId, sale.branchId, sale.userId],
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO sale_lines
               (id, organization_id, branch_id, sale_id, stock_location_id,
                line_number, product_variant_id, serialized_unit_id,
                tracking_type_snapshot, product_name_snapshot, sku_snapshot,
                imei_snapshot, quantity, unit_price_minor,
                price_version_snapshot, discount_minor, tax_minor,
                line_total_minor, unit_cogs_minor, cogs_minor,
                gross_profit_minor, warranty_type_snapshot, unit_sale_active,
                updated_at)
             VALUES ($1, $2, $3, $4, $5, 1, $6, $7, 'serialized',
                     'Duplicate unit', 'SKU-DUP', '356789012345678', 1,
                     1000, 1, 0, 0, 1000, 700, 700, 300, 'none', true, now())`,
            [
              randomUUID(),
              sale.organizationId,
              sale.branchId,
              thirdSaleId,
              sale.stockLocationId,
              sale.serializedVariantId,
              sale.serializedUnitId,
            ],
          ),
        "23505",
        CONSTRAINTS.ACTIVE_UNIT,
      );
    });
  });

  it("enforces allocation XOR/exact totals and append-only payment/ledger evidence", async () => {
    await transaction(migratorPool, async (client) => {
      const sale = await createPostedQuantitySale(client, "payment-valid");
      const accountId = await insertFinancialAccount(client, sale);
      const cashSessionId = await insertCashSession(client, sale);
      const paymentId = randomUUID();
      await client.query(
        `INSERT INTO payments
           (id, organization_id, branch_id, payment_number, customer_id,
            payment_method, amount_minor, financial_account_id,
            business_date, cash_session_id, received_by_user_id,
            idempotency_key)
         VALUES ($1, $2, $3, $4, $5, 'cash', 950, $6,
                 DATE '2026-07-17', $7, $8, $9)`,
        [
          paymentId,
          sale.organizationId,
          sale.branchId,
          `PAY-${suffix()}`,
          sale.customerId,
          accountId,
          cashSessionId,
          sale.userId,
          randomUUID(),
        ],
      );
      const allocationId = randomUUID();
      await client.query(
        `INSERT INTO payment_allocations
           (id, organization_id, branch_id, payment_id, sale_id, amount_minor)
         VALUES ($1, $2, $3, $4, $5, 950)`,
        [
          allocationId,
          sale.organizationId,
          sale.branchId,
          paymentId,
          sale.saleId,
        ],
      );
      await forceDeferredChecks(client);

      await expectPgError(
        client,
        () => client.query(`UPDATE payments SET amount_minor = 1 WHERE id = $1`, [paymentId]),
        "55000",
      );
      await expectPgError(
        client,
        () => client.query(`DELETE FROM payment_allocations WHERE id = $1`, [allocationId]),
        "55000",
      );
      await expectPgError(
        client,
        () => client.query(`TRUNCATE payment_allocations`),
        "55000",
      );

      const entryId = randomUUID();
      await client.query(
        `INSERT INTO financial_entries
           (id, organization_id, branch_id, entry_group_id, source_type,
            source_id, source_key, financial_account_id, direction,
            amount_minor, description, business_date, actor_user_id)
         VALUES ($1, $2, $3, $4, 'payment', $5, $6, $7, 'debit', 950,
                 'Cash received', DATE '2026-07-17', $8)`,
        [
          entryId,
          sale.organizationId,
          sale.branchId,
          randomUUID(),
          paymentId,
          `payment:${paymentId}:cash`,
          accountId,
          sale.userId,
        ],
      );
      await expectPgError(
        client,
        () => client.query(`UPDATE financial_entries SET amount_minor = 1 WHERE id = $1`, [entryId]),
        "55000",
      );
      await expectPgError(
        client,
        () => client.query(`TRUNCATE financial_entries`),
        "55000",
      );
    });

    await transaction(migratorPool, async (client) => {
      const sale = await createPostedQuantitySale(client, "payment-invalid");
      const accountId = await insertFinancialAccount(client, sale);
      const cashSessionId = await insertCashSession(client, sale);
      const paymentId = randomUUID();
      await client.query(
        `INSERT INTO payments
           (id, organization_id, branch_id, payment_number, payment_method,
            amount_minor, financial_account_id, business_date,
            cash_session_id, received_by_user_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'cash', 950, $5, DATE '2026-07-17',
                 $6, $7, $8)`,
        [
          paymentId,
          sale.organizationId,
          sale.branchId,
          `PAY-${suffix()}`,
          accountId,
          cashSessionId,
          sale.userId,
          randomUUID(),
        ],
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO payment_allocations
               (id, organization_id, branch_id, payment_id, amount_minor)
             VALUES ($1, $2, $3, $4, 950)`,
            [randomUUID(), sale.organizationId, sale.branchId, paymentId],
          ),
        "23514",
        CONSTRAINTS.ALLOCATION_TARGET,
      );
      await client.query(
        `INSERT INTO payment_allocations
           (id, organization_id, branch_id, payment_id, sale_id, amount_minor)
         VALUES ($1, $2, $3, $4, $5, 949)`,
        [
          randomUUID(),
          sale.organizationId,
          sale.branchId,
          paymentId,
          sale.saleId,
        ],
      );
      await expectPgError(
        client,
        () => client.query("SET CONSTRAINTS ALL IMMEDIATE"),
        "23514",
        CONSTRAINTS.ALLOCATION_TOTAL,
      );
    });
  });

  it("keeps one scoped receivable per customer sale and protects its source identity", async () => {
    await transaction(migratorPool, async (client) => {
      const sale = await createPostedQuantitySale(client, "receivable");
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO receivables
               (id, organization_id, branch_id, customer_id, sale_id,
                amount_minor, paid_minor, balance_minor, due_on, status,
                approved_by_user_id, updated_at)
             VALUES ($1, $2, $3, $4, $5, 950, 100, 900,
                     DATE '2026-08-17', 'partially_paid', $6, now())`,
            [
              randomUUID(),
              sale.organizationId,
              sale.branchId,
              sale.customerId,
              sale.saleId,
              sale.userId,
            ],
          ),
        "23514",
        CONSTRAINTS.RECEIVABLE_BALANCE,
      );

      const receivableId = randomUUID();
      await client.query(
        `INSERT INTO receivables
           (id, organization_id, branch_id, customer_id, sale_id,
            amount_minor, paid_minor, balance_minor, due_on, status,
            approved_by_user_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, 950, 0, 950,
                 DATE '2026-08-17', 'open', $6, now())`,
        [
          receivableId,
          sale.organizationId,
          sale.branchId,
          sale.customerId,
          sale.saleId,
          sale.userId,
        ],
      );
      await client.query(
        `UPDATE receivables
            SET paid_minor = 100, balance_minor = 850,
                status = 'partially_paid', version = version + 1,
                updated_at = now()
          WHERE id = $1`,
        [receivableId],
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `UPDATE receivables SET amount_minor = 951 WHERE id = $1`,
            [receivableId],
          ),
        "55000",
      );
      await expectPgError(
        client,
        () => client.query(`DELETE FROM receivables WHERE id = $1`, [receivableId]),
        "55000",
      );
    });
  });

  it("grants runtime only the DML each lifecycle permits", async () => {
    const privileges = await migratorPool.query<{
      readonly sales_select: boolean;
      readonly sales_update: boolean;
      readonly sales_delete: boolean;
      readonly lines_delete: boolean;
      readonly payment_insert: boolean;
      readonly payment_update: boolean;
      readonly allocation_delete: boolean;
      readonly entry_truncate: boolean;
      readonly enum_usage: boolean;
    }>(
      `SELECT
         has_table_privilege('mobileshop_app', 'sales', 'SELECT') AS sales_select,
         has_table_privilege('mobileshop_app', 'sales', 'UPDATE') AS sales_update,
         has_table_privilege('mobileshop_app', 'sales', 'DELETE') AS sales_delete,
         has_table_privilege('mobileshop_app', 'sale_lines', 'DELETE') AS lines_delete,
         has_table_privilege('mobileshop_app', 'payments', 'INSERT') AS payment_insert,
         has_table_privilege('mobileshop_app', 'payments', 'UPDATE') AS payment_update,
         has_table_privilege('mobileshop_app', 'payment_allocations', 'DELETE') AS allocation_delete,
         has_table_privilege('mobileshop_app', 'financial_entries', 'TRUNCATE') AS entry_truncate,
         has_type_privilege('mobileshop_app', '"SaleStatus"', 'USAGE') AS enum_usage`,
    );
    expect(privileges.rows[0]).toEqual({
      sales_select: true,
      sales_update: true,
      sales_delete: false,
      lines_delete: true,
      payment_insert: true,
      payment_update: false,
      allocation_delete: false,
      entry_truncate: false,
      enum_usage: true,
    });

    const runtimeIdentity = await runtimePool.query<{
      readonly current_user: string;
      readonly database_name: string;
    }>(`SELECT current_user, current_database() AS database_name`);
    expect(runtimeIdentity.rows[0]).toEqual({
      current_user: "mobileshop_app",
      database_name: "mobileshop_test",
    });
  });
});
