import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PURCHASING_CONTRACT_LIMITS } from "@mobileshop/shared";
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

const MIGRATION_NAME = "20260717120000_0008_purchasing_foundation";
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

const CONSTRAINTS = Object.freeze({
  SUPPLIER_CODE_UNIQUE: "suppliers_organization_id_code_key",
  SUPPLIER_VERSION: "suppliers_version_positive",
  CONTACT_CHANNEL: "supplier_contacts_channel_required",
  CONTACT_PRIMARY: "supplier_contacts_one_active_primary_uq",
  CONTACT_SUPPLIER_FK: "supplier_contacts_supplier_id_organization_id_fkey",
  PO_NUMBER: "purchase_orders_normalized_number_uq",
  PO_EXPECTED_DATE: "purchase_orders_expected_on_valid",
  PO_VERSION: "purchase_orders_version_positive",
  PO_ACTOR_STATUS: "purchase_orders_approval_timestamp_valid",
  PO_ACTOR_PAIR: "purchase_orders_actor_timestamp_pairs",
  PO_CREATOR_FK: "purchase_orders_created_by_user_id_organization_id_fkey",
  PO_SUPPLIER_FK: "purchase_orders_supplier_id_organization_id_fkey",
  PO_LINE_RECEIVED: "purchase_order_lines_quantity_received_valid",
  PO_LINE_COST: "purchase_order_lines_unit_cost_nonnegative",
  RECEIPT_PO_FK:
    "goods_receipts_purchase_order_id_organization_id_branch_id_fkey",
  RECEIPT_RECEIVER_FK:
    "goods_receipts_received_by_user_id_organization_id_fkey",
  RECEIPT_NUMBER: "goods_receipts_normalized_number_uq",
  RECEIPT_DUE_DATE: "goods_receipts_invoice_due_on_valid",
  RECEIPT_MONEY: "goods_receipts_money_nonnegative",
  RECEIPT_TOTALS: "goods_receipts_totals_ordered",
  RECEIPT_RECONCILE: "goods_receipts_totals_reconcile",
  RECEIPT_LINE_PO_SOURCE:
    "goods_receipt_lines_purchase_order_line_id_organization_id_fkey",
  RECEIPT_LINE_VARIANT:
    "goods_receipt_lines_product_variant_id_organization_id_tra_fkey",
  RECEIPT_LINE_BATCH:
    "goods_receipt_lines_stock_batch_id_organization_id_branch__fkey",
  RECEIPT_LINE_ACTUAL: "goods_receipt_lines_actual_total_reconciles",
  RECEIPT_LINE_LANDED: "goods_receipt_lines_landed_total_reconciles",
  RECEIPT_LINE_TARGET: "goods_receipt_lines_tracking_target_valid",
  LANDED_COST_AMOUNT: "goods_receipt_landed_costs_amount_positive",
  PAYABLE_MONEY: "payables_money_nonnegative",
  PAYABLE_BALANCE: "payables_balance_reconciles",
  PAYABLE_STATUS: "payables_status_reconciles",
  PAYABLE_RECEIPT_FK:
    "payables_goods_receipt_id_organization_id_branch_id_suppli_fkey",
  UNIT_PROVENANCE_PAIR: "serialized_units_receipt_provenance_pair",
  UNIT_COSTS: "serialized_units_costs_coherent",
  UNIT_ACTUAL_SAFE_INTEGER: "serialized_units_actual_cost_safe_integer",
  UNIT_LANDED_SAFE_INTEGER: "serialized_units_landed_cost_safe_integer",
  UNIT_RECEIPT_COSTS: "serialized_units_receipt_costs_complete",
  UNIT_RECEIPT_LINE_FK:
    "serialized_units_goods_receipt_line_id_organization_id_pro_fkey",
  BATCH_ACTUAL_COST: "stock_batches_actual_cost_nonnegative",
  BATCH_LANDED_COST: "stock_batches_landed_cost_nonnegative",
  BATCH_COSTS: "stock_batches_costs_coherent",
  SEQUENCE_SCOPE: "number_sequences_scope_key_uq",
  SEQUENCE_NEXT: "number_sequences_next_value_check",
});

/**
 * Applies 0008 only to the disposable test database and only when absent.
 * There is deliberately no reset, truncate or development-database fallback.
 */
async function ensurePurchasingMigrationApplied(): Promise<void> {
  const applied = await migratorPool.query<{ readonly exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'goods_receipts'
     ) AS exists`,
  );
  if (applied.rows[0]?.exists === true) return;

  const prerequisites = await migratorPool.query<{ readonly exists: boolean }>(
    `SELECT to_regclass('serialized_units') IS NOT NULL AS exists`,
  );
  if (prerequisites.rows[0]?.exists !== true) {
    throw new Error("0007 inventory foundation must be applied before 0008");
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
  expectedCode: string,
  expectedConstraint?: string,
): Promise<void> {
  savepointSequence += 1;
  const savepoint = `expected_purchasing_error_${savepointSequence}`;
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

interface BaseFixture {
  readonly organizationId: string;
  readonly branchId: string;
  readonly stockLocationId: string;
  readonly quantityVariantId: string;
  readonly serializedVariantId: string;
  readonly userId: string;
}

interface PurchasingFixture extends BaseFixture {
  readonly supplierId: string;
  readonly purchaseOrderId: string;
  readonly purchaseOrderLineId: string;
  readonly stockBatchId: string;
}

interface PostedReceiptFixture extends PurchasingFixture {
  readonly goodsReceiptId: string;
  readonly goodsReceiptLineId: string;
  readonly payableId: string;
}

async function createOrganization(
  client: PoolClient,
  label: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, updated_at)
     VALUES ($1, $2, now())`,
    [id, `Purchasing Test ${label}-${shortId()}`],
  );
  return id;
}

async function insertBranch(
  client: PoolClient,
  organizationId: string,
): Promise<string> {
  const id = randomUUID();
  const code = `BR-${shortId()}`;
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
  const code = `LOC-${shortId()}`;
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
     VALUES ($1, $2, $3, 'test-hash', 'Purchasing Test User', now())`,
    [id, organizationId, `purchase-${randomUUID()}@example.test`],
  );
  return id;
}

async function insertVariant(
  client: PoolClient,
  organizationId: string,
  trackingType: "quantity" | "serialized",
): Promise<string> {
  const suffix = shortId();
  const slug = suffix.toLowerCase();
  const categoryId = randomUUID();
  const brandId = randomUUID();
  const modelId = randomUUID();
  const variantId = randomUUID();
  await client.query(
    `INSERT INTO categories (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [categoryId, organizationId, `Category ${suffix}`, `category-${slug}`],
  );
  await client.query(
    `INSERT INTO brands (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [brandId, organizationId, `Brand ${suffix}`, `brand-${slug}`],
  );
  await client.query(
    `INSERT INTO product_models
       (id, organization_id, brand_id, category_id, name, canonical_name,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      modelId,
      organizationId,
      brandId,
      categoryId,
      `Model ${suffix}`,
      `model ${slug}`,
    ],
  );
  await client.query(
    `INSERT INTO product_variants
       (id, organization_id, product_model_id, sku, name, tracking_type,
        condition, pta_status, warranty_type, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, 'none', now())`,
    [
      variantId,
      organizationId,
      modelId,
      `SKU-${suffix}`,
      `Variant ${suffix}`,
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
  const organizationId = await createOrganization(client, label);
  const branchId = await insertBranch(client, organizationId);
  const stockLocationId = await insertLocation(
    client,
    organizationId,
    branchId,
  );
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
  const userId = await insertUser(client, organizationId);
  return {
    organizationId,
    branchId,
    stockLocationId,
    quantityVariantId,
    serializedVariantId,
    userId,
  };
}

async function insertSupplier(
  client: PoolClient,
  organizationId: string,
  code = `SUP-${shortId()}`,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO suppliers
       (id, organization_id, code, name, payment_terms_days, lead_time_days,
        updated_at)
     VALUES ($1, $2, $3, $4, 30, 7, now())`,
    [id, organizationId, code, `Supplier ${code}`],
  );
  return id;
}

async function insertPurchaseOrder(
  client: PoolClient,
  fixture: BaseFixture,
  supplierId: string,
  overrides: {
    readonly organizationId?: string;
    readonly branchId?: string;
    readonly supplierId?: string;
    readonly createdByUserId?: string;
    readonly number?: string;
    readonly orderDate?: string;
    readonly expectedOn?: string | null;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO purchase_orders
       (id, organization_id, branch_id, supplier_id, created_by_user_id,
        number, order_date, expected_on, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      overrides.branchId ?? fixture.branchId,
      overrides.supplierId ?? supplierId,
      overrides.createdByUserId ?? fixture.userId,
      overrides.number ?? `PO-${shortId()}`,
      overrides.orderDate ?? "2026-07-16",
      overrides.expectedOn === undefined ? "2026-07-20" : overrides.expectedOn,
    ],
  );
  return id;
}

async function insertPurchaseOrderLine(
  client: PoolClient,
  fixture: BaseFixture,
  purchaseOrderId: string,
  overrides: {
    readonly organizationId?: string;
    readonly productVariantId?: string;
    readonly lineNumber?: number;
    readonly quantityOrdered?: number;
    readonly quantityReceived?: number;
    readonly unitCostMinor?: number;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO purchase_order_lines
       (id, organization_id, purchase_order_id, product_variant_id,
        line_number, quantity_ordered, quantity_received, unit_cost_minor,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      purchaseOrderId,
      overrides.productVariantId ?? fixture.quantityVariantId,
      overrides.lineNumber ?? 1,
      overrides.quantityOrdered ?? 5,
      overrides.quantityReceived ?? 0,
      overrides.unitCostMinor ?? 1_000,
    ],
  );
  return id;
}

async function approvePurchaseOrder(
  client: PoolClient,
  purchaseOrderId: string,
  userId: string,
): Promise<void> {
  await client.query(
    `UPDATE purchase_orders
        SET status = 'approved', approved_by_user_id = $2,
            approved_at = now(), version = version + 1, updated_at = now()
      WHERE id = $1`,
    [purchaseOrderId, userId],
  );
}

async function insertStockBatch(
  client: PoolClient,
  fixture: BaseFixture,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO stock_batches
       (id, organization_id, branch_id, product_variant_id, stock_location_id,
        quantity_on_hand, quantity_reserved, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, 0, now())`,
    [
      id,
      fixture.organizationId,
      fixture.branchId,
      fixture.quantityVariantId,
      fixture.stockLocationId,
    ],
  );
  return id;
}

async function insertSerializedUnit(
  client: PoolClient,
  fixture: BaseFixture,
  overrides: {
    readonly productVariantId?: string;
    readonly stockLocationId?: string;
    readonly purchaseOrderLineId?: string | null;
    readonly goodsReceiptLineId?: string | null;
    readonly receivedAt?: string | null;
    readonly actualCostMinor?: number | string | null;
    readonly landedCostMinor?: number | string | null;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO serialized_units
       (id, organization_id, branch_id, product_variant_id,
        stock_location_id, purchase_order_line_id, goods_receipt_line_id,
        state, condition, pta_status, received_at, actual_cost_minor,
        landed_cost_minor, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', 'new',
             'pta_approved', $8, $9, $10, now())`,
    [
      id,
      fixture.organizationId,
      fixture.branchId,
      overrides.productVariantId ?? fixture.serializedVariantId,
      overrides.stockLocationId ?? fixture.stockLocationId,
      overrides.purchaseOrderLineId ?? null,
      overrides.goodsReceiptLineId ?? null,
      overrides.receivedAt ?? null,
      overrides.actualCostMinor ?? null,
      overrides.landedCostMinor ?? null,
    ],
  );
  return id;
}

async function createPurchasingFixture(
  client: PoolClient,
  label: string,
): Promise<PurchasingFixture> {
  const base = await createBaseFixture(client, label);
  const supplierId = await insertSupplier(client, base.organizationId);
  const purchaseOrderId = await insertPurchaseOrder(client, base, supplierId);
  const purchaseOrderLineId = await insertPurchaseOrderLine(
    client,
    base,
    purchaseOrderId,
  );
  await approvePurchaseOrder(client, purchaseOrderId, base.userId);
  const stockBatchId = await insertStockBatch(client, base);
  return {
    ...base,
    supplierId,
    purchaseOrderId,
    purchaseOrderLineId,
    stockBatchId,
  };
}

async function insertReceiptHeader(
  client: PoolClient,
  fixture: PurchasingFixture,
  overrides: {
    readonly organizationId?: string;
    readonly branchId?: string;
    readonly purchaseOrderId?: string;
    readonly supplierId?: string;
    readonly receivedByUserId?: string;
    readonly number?: string;
    readonly supplierInvoiceReference?: string | null;
    readonly receivedAt?: string;
    readonly invoiceDueOn?: string;
    readonly actualCostTotalMinor?: number;
    readonly landedCostTotalMinor?: number;
    readonly payableTotalMinor?: number;
    readonly postingTxid?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO goods_receipts
       (id, organization_id, branch_id, purchase_order_id, supplier_id,
        received_by_user_id, number, supplier_invoice_reference, received_at,
        invoice_due_on, actual_cost_total_minor, landed_cost_total_minor,
        payable_total_minor${overrides.postingTxid === undefined ? "" : ", posting_txid"})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13${
       overrides.postingTxid === undefined ? "" : ", $14"
     })`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      overrides.branchId ?? fixture.branchId,
      overrides.purchaseOrderId ?? fixture.purchaseOrderId,
      overrides.supplierId ?? fixture.supplierId,
      overrides.receivedByUserId ?? fixture.userId,
      overrides.number ?? `GR-${shortId()}`,
      overrides.supplierInvoiceReference === undefined
        ? `INV-${shortId()}`
        : overrides.supplierInvoiceReference,
      overrides.receivedAt ?? "2026-07-16T09:00:00.000Z",
      overrides.invoiceDueOn ?? "2026-08-15",
      overrides.actualCostTotalMinor ?? 2_000,
      overrides.landedCostTotalMinor ?? 2_100,
      overrides.payableTotalMinor ?? 2_000,
      ...(overrides.postingTxid === undefined ? [] : [overrides.postingTxid]),
    ],
  );
  return id;
}

async function insertReceiptLine(
  client: PoolClient,
  fixture: PurchasingFixture,
  goodsReceiptId: string,
  overrides: {
    readonly organizationId?: string;
    readonly branchId?: string;
    readonly purchaseOrderId?: string;
    readonly purchaseOrderLineId?: string;
    readonly productVariantId?: string;
    readonly stockLocationId?: string;
    readonly trackingType?: "quantity" | "serialized";
    readonly quantityReceived?: number;
    readonly unitCostMinor?: number;
    readonly actualCostTotalMinor?: number;
    readonly landedCostAllocatedMinor?: number;
    readonly landedCostTotalMinor?: number;
    readonly stockBatchId?: string | null;
  } = {},
): Promise<string> {
  const trackingType = overrides.trackingType ?? "quantity";
  const id = randomUUID();
  await client.query(
    `INSERT INTO goods_receipt_lines
       (id, organization_id, branch_id, goods_receipt_id, purchase_order_id,
        purchase_order_line_id, product_variant_id, stock_location_id,
        tracking_type, quantity_received, unit_cost_minor,
        actual_cost_total_minor, landed_cost_allocated_minor,
        landed_cost_total_minor, stock_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15)`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      overrides.branchId ?? fixture.branchId,
      goodsReceiptId,
      overrides.purchaseOrderId ?? fixture.purchaseOrderId,
      overrides.purchaseOrderLineId ?? fixture.purchaseOrderLineId,
      overrides.productVariantId ?? fixture.quantityVariantId,
      overrides.stockLocationId ?? fixture.stockLocationId,
      trackingType,
      overrides.quantityReceived ?? 2,
      overrides.unitCostMinor ?? 1_000,
      overrides.actualCostTotalMinor ?? 2_000,
      overrides.landedCostAllocatedMinor ?? 100,
      overrides.landedCostTotalMinor ?? 2_100,
      overrides.stockBatchId === undefined
        ? trackingType === "quantity"
          ? fixture.stockBatchId
          : null
        : overrides.stockBatchId,
    ],
  );
  return id;
}

async function insertLandedCost(
  client: PoolClient,
  fixture: PurchasingFixture,
  goodsReceiptId: string,
  amountMinor = 100,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO goods_receipt_landed_costs
       (id, organization_id, branch_id, goods_receipt_id, kind, amount_minor)
     VALUES ($1, $2, $3, $4, 'freight', $5)`,
    [id, fixture.organizationId, fixture.branchId, goodsReceiptId, amountMinor],
  );
  return id;
}

async function insertPayable(
  client: PoolClient,
  fixture: PurchasingFixture,
  goodsReceiptId: string,
  overrides: {
    readonly organizationId?: string;
    readonly branchId?: string;
    readonly supplierId?: string;
    readonly dueOn?: string;
    readonly amountMinor?: number;
    readonly paidMinor?: number;
    readonly outstandingMinor?: number;
    readonly status?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO payables
       (id, organization_id, branch_id, supplier_id, goods_receipt_id,
        due_on, amount_minor, paid_minor, outstanding_minor, status,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
    [
      id,
      overrides.organizationId ?? fixture.organizationId,
      overrides.branchId ?? fixture.branchId,
      overrides.supplierId ?? fixture.supplierId,
      goodsReceiptId,
      overrides.dueOn ?? "2026-08-15",
      overrides.amountMinor ?? 2_000,
      overrides.paidMinor ?? 0,
      overrides.outstandingMinor ?? 2_000,
      overrides.status ?? "open",
    ],
  );
  return id;
}

async function forceDeferredChecks(client: PoolClient): Promise<void> {
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
}

async function createPostedQuantityReceipt(
  client: PoolClient,
  label: string,
): Promise<PostedReceiptFixture> {
  const fixture = await createPurchasingFixture(client, label);
  const goodsReceiptId = await insertReceiptHeader(client, fixture);
  const goodsReceiptLineId = await insertReceiptLine(
    client,
    fixture,
    goodsReceiptId,
  );
  await insertLandedCost(client, fixture, goodsReceiptId);
  const payableId = await insertPayable(client, fixture, goodsReceiptId);
  await client.query(
    `UPDATE purchase_order_lines
        SET quantity_received = 2, updated_at = now()
      WHERE id = $1`,
    [fixture.purchaseOrderLineId],
  );
  await client.query(
    `UPDATE purchase_orders
        SET status = 'partially_received', version = version + 1,
            updated_at = now()
      WHERE id = $1`,
    [fixture.purchaseOrderId],
  );
  await forceDeferredChecks(client);
  return { ...fixture, goodsReceiptId, goodsReceiptLineId, payableId };
}

afterAll(async () => {
  await Promise.all([runtimePool.end(), migratorPool.end()]);
});

describe("0008 purchasing foundation migration invariants", () => {
  beforeAll(async () => {
    await ensurePurchasingMigrationApplied();
  });

  it("records 0008 exactly once and creates the complete first vertical", async () => {
    const ledger = await migratorPool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
         FROM _prisma_migrations
        WHERE migration_name = $1
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL`,
      [MIGRATION_NAME],
    );
    expect(ledger.rows[0]?.count).toBe("1");

    const tables = await runtimePool.query<{ readonly tableName: string }>(
      `SELECT table_name AS "tableName"
         FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [
        [
          "suppliers",
          "supplier_contacts",
          "purchase_orders",
          "purchase_order_lines",
          "goods_receipts",
          "goods_receipt_lines",
          "goods_receipt_landed_costs",
          "payables",
        ],
      ],
    );
    expect(tables.rows.map((row) => row.tableName)).toEqual([
      "goods_receipt_landed_costs",
      "goods_receipt_lines",
      "goods_receipts",
      "payables",
      "purchase_order_lines",
      "purchase_orders",
      "supplier_contacts",
      "suppliers",
    ]);
  });

  it("pins database widths to the public purchasing contract", async () => {
    const columns = await runtimePool.query<{
      readonly tableName: string;
      readonly columnName: string;
      readonly maximumLength: number;
    }>(
      `SELECT table_name AS "tableName", column_name AS "columnName",
              character_maximum_length::int AS "maximumLength"
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (table_name, column_name) IN (
            ('suppliers', 'code'),
            ('suppliers', 'name'),
            ('supplier_contacts', 'email'),
            ('purchase_orders', 'number'),
            ('goods_receipts', 'supplier_invoice_reference'),
            ('goods_receipt_landed_costs', 'notes')
          )
        ORDER BY table_name, column_name`,
    );
    expect(columns.rows).toEqual([
      {
        tableName: "goods_receipt_landed_costs",
        columnName: "notes",
        maximumLength: PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH,
      },
      {
        tableName: "goods_receipts",
        columnName: "supplier_invoice_reference",
        maximumLength: PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH,
      },
      {
        tableName: "purchase_orders",
        columnName: "number",
        maximumLength: PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH,
      },
      {
        tableName: "supplier_contacts",
        columnName: "email",
        maximumLength: PURCHASING_CONTRACT_LIMITS.EMAIL_LENGTH,
      },
      {
        tableName: "suppliers",
        columnName: "code",
        maximumLength: PURCHASING_CONTRACT_LIMITS.SUPPLIER_CODE_LENGTH,
      },
      {
        tableName: "suppliers",
        columnName: "name",
        maximumLength: PURCHASING_CONTRACT_LIMITS.NAME_LENGTH,
      },
    ]);
  });

  describe("supplier masters", () => {
    it("rejects a duplicate normalized code per tenant and allows it elsewhere", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createBaseFixture(client, "supplier-code-a");
        const second = await createBaseFixture(client, "supplier-code-b");
        await insertSupplier(client, first.organizationId, "ACME-DIST");

        await expectPgError(
          client,
          () => insertSupplier(client, first.organizationId, "ACME-DIST"),
          "23505",
          CONSTRAINTS.SUPPLIER_CODE_UNIQUE,
        );
        await insertSupplier(client, second.organizationId, "ACME-DIST");
      });
    });

    it("requires a contact channel and permits only one active primary", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createBaseFixture(client, "contacts");
        const supplierId = await insertSupplier(client, fixture.organizationId);

        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO supplier_contacts
                 (id, organization_id, supplier_id, name, updated_at)
               VALUES ($1, $2, $3, 'No channel', now())`,
              [randomUUID(), fixture.organizationId, supplierId],
            ),
          "23514",
          CONSTRAINTS.CONTACT_CHANNEL,
        );

        await client.query(
          `INSERT INTO supplier_contacts
             (id, organization_id, supplier_id, name, phone, is_primary,
              updated_at)
           VALUES ($1, $2, $3, 'Primary One', '+923001234567', true, now())`,
          [randomUUID(), fixture.organizationId, supplierId],
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO supplier_contacts
                 (id, organization_id, supplier_id, name, email, is_primary,
                  updated_at)
               VALUES ($1, $2, $3, 'Primary Two', 'two@example.test', true,
                       now())`,
              [randomUUID(), fixture.organizationId, supplierId],
            ),
          "23505",
          CONSTRAINTS.CONTACT_PRIMARY,
        );
      });
    });

    it("enforces tenant-consistent contacts and positive optimistic versions", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createBaseFixture(client, "supplier-tenant-a");
        const second = await createBaseFixture(client, "supplier-tenant-b");
        const foreignSupplierId = await insertSupplier(
          client,
          second.organizationId,
        );

        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO supplier_contacts
                 (id, organization_id, supplier_id, name, phone, updated_at)
               VALUES ($1, $2, $3, 'Cross tenant', '+923001234567', now())`,
              [randomUUID(), first.organizationId, foreignSupplierId],
            ),
          "23503",
          CONSTRAINTS.CONTACT_SUPPLIER_FK,
        );

        const supplierId = await insertSupplier(client, first.organizationId);
        await expectPgError(
          client,
          () =>
            client.query("UPDATE suppliers SET version = 0 WHERE id = $1", [
              supplierId,
            ]),
          "23514",
          CONSTRAINTS.SUPPLIER_VERSION,
        );
      });
    });
  });

  describe("purchase orders", () => {
    it("does not create stock and rejects duplicate normalized PO numbers", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createBaseFixture(client, "po-number");
        const supplierId = await insertSupplier(client, fixture.organizationId);
        const before = await client.query<{ readonly count: string }>(
          "SELECT count(*)::text AS count FROM stock_batches WHERE organization_id = $1",
          [fixture.organizationId],
        );
        await insertPurchaseOrder(client, fixture, supplierId, {
          number: "PO-Mixed-001",
        });
        await expectPgError(
          client,
          () =>
            insertPurchaseOrder(client, fixture, supplierId, {
              number: "po-mixed-001",
            }),
          "23505",
          CONSTRAINTS.PO_NUMBER,
        );
        const after = await client.query<{ readonly count: string }>(
          "SELECT count(*)::text AS count FROM stock_batches WHERE organization_id = $1",
          [fixture.organizationId],
        );
        expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
      });
    });

    it("blocks received above ordered and invalid money/date/version values", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createBaseFixture(client, "po-checks");
        const supplierId = await insertSupplier(client, fixture.organizationId);

        await expectPgError(
          client,
          () =>
            insertPurchaseOrder(client, fixture, supplierId, {
              orderDate: "2026-07-20",
              expectedOn: "2026-07-19",
            }),
          "23514",
          CONSTRAINTS.PO_EXPECTED_DATE,
        );

        const poId = await insertPurchaseOrder(client, fixture, supplierId);
        const lineId = await insertPurchaseOrderLine(client, fixture, poId);
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE purchase_order_lines SET quantity_received = 6 WHERE id = $1",
              [lineId],
            ),
          "23514",
          CONSTRAINTS.PO_LINE_RECEIVED,
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE purchase_order_lines SET unit_cost_minor = -1 WHERE id = $1",
              [lineId],
            ),
          "23514",
          CONSTRAINTS.PO_LINE_COST,
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE purchase_orders SET version = 0 WHERE id = $1",
              [poId],
            ),
          "23514",
          CONSTRAINTS.PO_VERSION,
        );
      });
    });

    it("allows replace-style draft line deletes but retains lines after approval", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createBaseFixture(client, "po-line-delete");
        const supplierId = await insertSupplier(client, fixture.organizationId);
        const poId = await insertPurchaseOrder(client, fixture, supplierId);
        const draftLineId = await insertPurchaseOrderLine(
          client,
          fixture,
          poId,
        );

        const deleted = await client.query(
          "DELETE FROM purchase_order_lines WHERE id = $1",
          [draftLineId],
        );
        expect(deleted.rowCount).toBe(1);

        const retainedLineId = await insertPurchaseOrderLine(
          client,
          fixture,
          poId,
        );
        await approvePurchaseOrder(client, poId, fixture.userId);
        await expectPgError(
          client,
          () =>
            client.query("DELETE FROM purchase_order_lines WHERE id = $1", [
              retainedLineId,
            ]),
          "55000",
        );
      });
    });

    it("cancels an ordered PO without erasing approval or ordering history", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createBaseFixture(client, "po-cancel-history");
        const supplierId = await insertSupplier(client, fixture.organizationId);
        const poId = await insertPurchaseOrder(client, fixture, supplierId);
        await insertPurchaseOrderLine(client, fixture, poId);
        await approvePurchaseOrder(client, poId, fixture.userId);
        await client.query(
          `UPDATE purchase_orders
              SET status = 'ordered', ordered_by_user_id = $2,
                  ordered_at = now(), version = version + 1,
                  updated_at = now()
            WHERE id = $1`,
          [poId, fixture.userId],
        );
        const before = await client.query<{
          readonly approvedAt: string;
          readonly approvedBy: string;
          readonly orderedAt: string;
          readonly orderedBy: string;
        }>(
          `SELECT approved_at::text AS "approvedAt",
                  approved_by_user_id::text AS "approvedBy",
                  ordered_at::text AS "orderedAt",
                  ordered_by_user_id::text AS "orderedBy"
             FROM purchase_orders WHERE id = $1`,
          [poId],
        );
        const priorHistory = before.rows[0];
        if (priorHistory === undefined) {
          throw new Error("Ordered purchase order was not persisted");
        }

        await client.query(
          `UPDATE purchase_orders
              SET status = 'cancelled', cancelled_by_user_id = $2,
                  cancelled_at = now(), cancellation_reason = 'Supplier delay',
                  version = version + 1, updated_at = now()
            WHERE id = $1`,
          [poId, fixture.userId],
        );
        const after = await client.query<{
          readonly status: string;
          readonly approvedAt: string;
          readonly approvedBy: string;
          readonly orderedAt: string;
          readonly orderedBy: string;
        }>(
          `SELECT status::text AS status,
                  approved_at::text AS "approvedAt",
                  approved_by_user_id::text AS "approvedBy",
                  ordered_at::text AS "orderedAt",
                  ordered_by_user_id::text AS "orderedBy"
             FROM purchase_orders WHERE id = $1`,
          [poId],
        );
        expect(after.rows[0]).toEqual({
          status: "cancelled",
          ...priorHistory,
        });
        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET ordered_at = NULL, ordered_by_user_id = NULL,
                      version = version + 1, updated_at = now()
                WHERE id = $1`,
              [poId],
            ),
          "55000",
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET cancellation_reason = 'Rewritten reason',
                      version = version + 1, updated_at = now()
                WHERE id = $1`,
              [poId],
            ),
          "55000",
        );

        const closedPoId = await insertPurchaseOrder(
          client,
          fixture,
          supplierId,
        );
        await insertPurchaseOrderLine(client, fixture, closedPoId);
        await approvePurchaseOrder(client, closedPoId, fixture.userId);
        await client.query(
          `UPDATE purchase_order_lines
              SET quantity_received = quantity_ordered, updated_at = now()
            WHERE purchase_order_id = $1`,
          [closedPoId],
        );
        await client.query(
          `UPDATE purchase_orders
              SET status = 'received', version = version + 1,
                  updated_at = now()
            WHERE id = $1`,
          [closedPoId],
        );
        await client.query(
          `UPDATE purchase_orders
              SET status = 'closed', closed_by_user_id = $2,
                  closed_at = now(), version = version + 1,
                  updated_at = now()
            WHERE id = $1`,
          [closedPoId, fixture.userId],
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET closed_at = closed_at + interval '1 minute',
                      version = version + 1, updated_at = now()
                WHERE id = $1`,
              [closedPoId],
            ),
          "55000",
        );
      });
    });

    it("enforces the purchase-order lifecycle and keeps terminal states terminal", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createBaseFixture(client, "po-status-transition");
        const supplierId = await insertSupplier(client, fixture.organizationId);
        const poId = await insertPurchaseOrder(client, fixture, supplierId);
        await insertPurchaseOrderLine(client, fixture, poId);

        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET status = 'closed', closed_by_user_id = $2,
                      closed_at = now(), version = version + 1,
                      updated_at = now()
                WHERE id = $1`,
              [poId, fixture.userId],
            ),
          "23514",
          "purchase_orders_status_transition",
        );

        await approvePurchaseOrder(client, poId, fixture.userId);
        await client.query(
          `UPDATE purchase_order_lines
              SET quantity_received = 1, updated_at = now()
            WHERE purchase_order_id = $1`,
          [poId],
        );
        await client.query(
          `UPDATE purchase_orders
              SET status = 'partially_received', version = version + 1,
                  updated_at = now()
            WHERE id = $1`,
          [poId],
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET status = 'cancelled', cancelled_by_user_id = $2,
                      cancelled_at = now(), cancellation_reason = 'Too late',
                      version = version + 1, updated_at = now()
                WHERE id = $1`,
              [poId, fixture.userId],
            ),
          "23514",
          "purchase_orders_status_transition",
        );

        await client.query(
          `UPDATE purchase_orders
              SET status = 'closed', closed_by_user_id = $2,
                  closed_at = now(), version = version + 1,
                  updated_at = now()
            WHERE id = $1`,
          [poId, fixture.userId],
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET status = 'received', version = version + 1,
                      updated_at = now()
                WHERE id = $1`,
              [poId],
            ),
          "23514",
          "purchase_orders_status_transition",
        );
      });
    });

    it("requires tenant-scoped document actors and coherent approval metadata", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createBaseFixture(client, "po-actor-a");
        const second = await createBaseFixture(client, "po-actor-b");
        const supplierId = await insertSupplier(client, first.organizationId);

        await expectPgError(
          client,
          () =>
            insertPurchaseOrder(client, first, supplierId, {
              createdByUserId: second.userId,
            }),
          "23503",
          CONSTRAINTS.PO_CREATOR_FK,
        );

        const poId = await insertPurchaseOrder(client, first, supplierId);
        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET status = 'approved', approved_at = now(),
                      approved_by_user_id = NULL, updated_at = now()
                WHERE id = $1`,
              [poId],
            ),
          "23514",
          CONSTRAINTS.PO_ACTOR_PAIR,
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `UPDATE purchase_orders
                  SET status = 'approved', approved_at = NULL,
                      approved_by_user_id = NULL, updated_at = now()
                WHERE id = $1`,
              [poId],
            ),
          "23514",
          CONSTRAINTS.PO_ACTOR_STATUS,
        );
      });
    });

    it("blocks cross-tenant supplier references", async () => {
      await transaction(runtimePool, async (client) => {
        const first = await createBaseFixture(client, "po-supplier-a");
        const second = await createBaseFixture(client, "po-supplier-b");
        const foreignSupplier = await insertSupplier(
          client,
          second.organizationId,
        );

        await expectPgError(
          client,
          () => insertPurchaseOrder(client, first, foreignSupplier),
          "23503",
          CONSTRAINTS.PO_SUPPLIER_FK,
        );
      });
    });

    it("freezes approved commercial terms while allowing received progress", async () => {
      await transaction(migratorPool, async (client) => {
        const fixture = await createPurchasingFixture(client, "po-frozen");

        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE purchase_orders SET notes = 'rewritten', updated_at = now() WHERE id = $1",
              [fixture.purchaseOrderId],
            ),
          "55000",
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE purchase_order_lines SET unit_cost_minor = 5, updated_at = now() WHERE id = $1",
              [fixture.purchaseOrderLineId],
            ),
          "55000",
        );

        await client.query(
          `UPDATE purchase_order_lines
              SET quantity_received = 1, updated_at = now()
            WHERE id = $1`,
          [fixture.purchaseOrderLineId],
        );
      });
    });
  });

  describe("goods receiving and payables", () => {
    it("accepts one fully reconciled receipt and preserves exact evidence", async () => {
      await transaction(runtimePool, async (client) => {
        const receipt = await createPostedQuantityReceipt(client, "receipt-ok");
        const result = await client.query<{
          readonly actual: string;
          readonly landed: string;
          readonly payable: string;
          readonly method: string;
          readonly receivedBy: string;
          readonly lineActual: string;
          readonly lineAllocated: string;
        }>(
          `SELECT r.actual_cost_total_minor::text AS actual,
                  r.landed_cost_total_minor::text AS landed,
                  r.payable_total_minor::text AS payable,
                  r.landed_cost_allocation_method::text AS method,
                  r.received_by_user_id::text AS "receivedBy",
                  l.actual_cost_total_minor::text AS "lineActual",
                  l.landed_cost_allocated_minor::text AS "lineAllocated"
             FROM goods_receipts r
             JOIN goods_receipt_lines l ON l.goods_receipt_id = r.id
            WHERE r.id = $1`,
          [receipt.goodsReceiptId],
        );
        expect(result.rows[0]).toEqual({
          actual: "2000",
          landed: "2100",
          payable: "2000",
          method: "by_value",
          receivedBy: receipt.userId,
          lineActual: "2000",
          lineAllocated: "100",
        });
      });
    });

    it("rejects duplicate normalized goods-receipt numbers", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "receipt-number");
        await insertReceiptHeader(client, fixture, {
          number: "GR-Mixed-001",
        });
        await expectPgError(
          client,
          () =>
            insertReceiptHeader(client, fixture, {
              number: "gr-mixed-001",
            }),
          "23505",
          CONSTRAINTS.RECEIPT_NUMBER,
        );
      });
    });

    it("rejects a receipt whose PO and supplier source disagree", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "receipt-source");
        const otherSupplierId = await insertSupplier(
          client,
          fixture.organizationId,
        );

        await expectPgError(
          client,
          () =>
            insertReceiptHeader(client, fixture, {
              supplierId: otherSupplierId,
            }),
          "23503",
          CONSTRAINTS.RECEIPT_PO_FK,
        );
      });
    });

    it("rejects a receiver from another tenant", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "receiver-a");
        const foreign = await createBaseFixture(client, "receiver-b");
        await expectPgError(
          client,
          () =>
            insertReceiptHeader(client, fixture, {
              receivedByUserId: foreign.userId,
            }),
          "23503",
          CONSTRAINTS.RECEIPT_RECEIVER_FK,
        );
      });
    });

    it("pins a receipt line to its PO line, tracking type and stock bucket", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "line-source");
        const receiptId = await insertReceiptHeader(client, fixture);
        const otherPoId = await insertPurchaseOrder(
          client,
          fixture,
          fixture.supplierId,
        );
        const otherLineId = await insertPurchaseOrderLine(
          client,
          fixture,
          otherPoId,
          { lineNumber: 2 },
        );

        await expectPgError(
          client,
          () =>
            insertReceiptLine(client, fixture, receiptId, {
              purchaseOrderLineId: otherLineId,
            }),
          "23503",
          CONSTRAINTS.RECEIPT_LINE_PO_SOURCE,
        );
        await expectPgError(
          client,
          () =>
            insertReceiptLine(client, fixture, receiptId, {
              trackingType: "serialized",
              productVariantId: fixture.quantityVariantId,
              stockBatchId: null,
            }),
          "23503",
          CONSTRAINTS.RECEIPT_LINE_VARIANT,
        );

        const otherLocation = await insertLocation(
          client,
          fixture.organizationId,
          fixture.branchId,
        );
        await expectPgError(
          client,
          () =>
            insertReceiptLine(client, fixture, receiptId, {
              stockLocationId: otherLocation,
              stockBatchId: fixture.stockBatchId,
            }),
          "23503",
          CONSTRAINTS.RECEIPT_LINE_BATCH,
        );
      });
    });

    it("rejects inconsistent receipt money, dates and line arithmetic", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "receipt-money");

        await expectPgError(
          client,
          () =>
            insertReceiptHeader(client, fixture, {
              invoiceDueOn: "2026-07-15",
            }),
          "23514",
          CONSTRAINTS.RECEIPT_DUE_DATE,
        );
        await expectPgError(
          client,
          () =>
            insertReceiptHeader(client, fixture, {
              actualCostTotalMinor: -1,
              landedCostTotalMinor: 0,
              payableTotalMinor: 0,
            }),
          "23514",
          CONSTRAINTS.RECEIPT_MONEY,
        );
        await expectPgError(
          client,
          () =>
            insertReceiptHeader(client, fixture, {
              actualCostTotalMinor: 2_000,
              landedCostTotalMinor: 1_999,
              payableTotalMinor: 2_000,
            }),
          "23514",
          CONSTRAINTS.RECEIPT_TOTALS,
        );

        const receiptId = await insertReceiptHeader(client, fixture);
        await expectPgError(
          client,
          () =>
            insertReceiptLine(client, fixture, receiptId, {
              actualCostTotalMinor: 1_999,
            }),
          "23514",
          CONSTRAINTS.RECEIPT_LINE_ACTUAL,
        );
        await expectPgError(
          client,
          () =>
            insertReceiptLine(client, fixture, receiptId, {
              landedCostTotalMinor: 2_099,
            }),
          "23514",
          CONSTRAINTS.RECEIPT_LINE_LANDED,
        );
        await expectPgError(
          client,
          () =>
            insertReceiptLine(client, fixture, receiptId, {
              trackingType: "quantity",
              stockBatchId: null,
            }),
          "23514",
          CONSTRAINTS.RECEIPT_LINE_TARGET,
        );
        await expectPgError(
          client,
          () => insertLandedCost(client, fixture, receiptId, 0),
          "23514",
          CONSTRAINTS.LANDED_COST_AMOUNT,
        );
      });
    });

    it("checks whole-receipt totals at the deferred transaction boundary", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "reconcile");
        const receiptId = await insertReceiptHeader(client, fixture, {
          actualCostTotalMinor: 2_001,
          landedCostTotalMinor: 2_101,
          payableTotalMinor: 2_001,
        });
        await insertReceiptLine(client, fixture, receiptId);
        await insertLandedCost(client, fixture, receiptId);
        await insertPayable(client, fixture, receiptId, {
          amountMinor: 2_001,
          outstandingMinor: 2_001,
        });

        await expectPgError(
          client,
          () => client.query("SET CONSTRAINTS ALL IMMEDIATE"),
          "23514",
          CONSTRAINTS.RECEIPT_RECONCILE,
        );
      });
    });

    it("enforces payable source, balance and status invariants", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "payable");
        const receiptId = await insertReceiptHeader(client, fixture);

        await expectPgError(
          client,
          () =>
            insertPayable(client, fixture, receiptId, {
              paidMinor: 2_001,
              outstandingMinor: -1,
            }),
          "23514",
          CONSTRAINTS.PAYABLE_MONEY,
        );
        await expectPgError(
          client,
          () =>
            insertPayable(client, fixture, receiptId, {
              paidMinor: 100,
              outstandingMinor: 2_000,
              status: "partially_paid",
            }),
          "23514",
          CONSTRAINTS.PAYABLE_BALANCE,
        );
        await expectPgError(
          client,
          () =>
            insertPayable(client, fixture, receiptId, {
              paidMinor: 100,
              outstandingMinor: 1_900,
              status: "open",
            }),
          "23514",
          CONSTRAINTS.PAYABLE_STATUS,
        );

        const otherSupplier = await insertSupplier(
          client,
          fixture.organizationId,
        );
        await expectPgError(
          client,
          () =>
            insertPayable(client, fixture, receiptId, {
              supplierId: otherSupplier,
            }),
          "23503",
          CONSTRAINTS.PAYABLE_RECEIPT_FK,
        );
      });
    });

    it("makes posted receipt tables immutable for runtime and privileged roles", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPostedQuantityReceipt(
          client,
          "runtime-immutable",
        );
        for (const [table, id] of [
          ["goods_receipts", fixture.goodsReceiptId],
          ["goods_receipt_lines", fixture.goodsReceiptLineId],
        ] as const) {
          await expectPgError(
            client,
            () =>
              client.query(
                `UPDATE ${table} SET created_at = now() WHERE id = $1`,
                [id],
              ),
            "42501",
          );
          await expectPgError(
            client,
            () => client.query(`DELETE FROM ${table} WHERE id = $1`, [id]),
            "42501",
          );
        }
      });

      await transaction(migratorPool, async (client) => {
        const fixture = await createPostedQuantityReceipt(
          client,
          "trigger-immutable",
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE goods_receipts SET created_at = now() WHERE id = $1",
              [fixture.goodsReceiptId],
            ),
          "55000",
        );
      });
    });

    it("rejects receipt children added outside the posting transaction", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "late-child");
        const oldTxid = await client.query<{ readonly value: string }>(
          "SELECT (txid_current() - 1)::text AS value",
        );
        const oldPostingTxid = oldTxid.rows[0]?.value;
        if (oldPostingTxid === undefined) {
          throw new Error(
            "PostgreSQL did not return the current transaction ID",
          );
        }
        const receiptId = await insertReceiptHeader(client, fixture, {
          postingTxid: oldPostingTxid,
        });
        await expectPgError(
          client,
          () => insertReceiptLine(client, fixture, receiptId),
          "55000",
        );
      });
    });
  });

  describe("Inventory costing and provenance", () => {
    it("adds nullable nonnegative weighted-average unit costs to stock batches", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "batch-cost");
        const uncosted = await client.query<{
          readonly actual: string | null;
          readonly landed: string | null;
        }>(
          `SELECT actual_cost_minor::text AS actual,
                  landed_cost_minor::text AS landed
             FROM stock_batches WHERE id = $1`,
          [fixture.stockBatchId],
        );
        expect(uncosted.rows[0]).toEqual({ actual: null, landed: null });
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET actual_cost_minor = 1000 WHERE id = $1",
              [fixture.stockBatchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_COSTS,
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET landed_cost_minor = 1050 WHERE id = $1",
              [fixture.stockBatchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_COSTS,
        );
        await client.query(
          `UPDATE stock_batches
              SET actual_cost_minor = 1000, landed_cost_minor = 1050,
                  updated_at = now()
            WHERE id = $1`,
          [fixture.stockBatchId],
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET actual_cost_minor = -1 WHERE id = $1",
              [fixture.stockBatchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_ACTUAL_COST,
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET landed_cost_minor = -1 WHERE id = $1",
              [fixture.stockBatchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_COSTS,
        );
        await expectPgError(
          client,
          () =>
            client.query(
              "UPDATE stock_batches SET landed_cost_minor = actual_cost_minor - 1 WHERE id = $1",
              [fixture.stockBatchId],
            ),
          "23514",
          CONSTRAINTS.BATCH_COSTS,
        );
      });
    });

    it("stores serialized PO/receipt provenance and exact per-unit costs", async () => {
      await transaction(runtimePool, async (client) => {
        const base = await createBaseFixture(client, "serialized-source");
        const openingUnitId = await insertSerializedUnit(client, base);
        const openingCosts = await client.query<{
          readonly actual: string | null;
          readonly landed: string | null;
        }>(
          `SELECT actual_cost_minor::text AS actual,
                  landed_cost_minor::text AS landed
             FROM serialized_units WHERE id = $1`,
          [openingUnitId],
        );
        expect(openingCosts.rows[0]).toEqual({ actual: null, landed: null });
        await insertSerializedUnit(client, base, {
          actualCostMinor: "9007199254740991",
          landedCostMinor: "9007199254740991",
        });
        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, base, {
              actualCostMinor: "9007199254740992",
            }),
          "23514",
          CONSTRAINTS.UNIT_ACTUAL_SAFE_INTEGER,
        );
        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, base, {
              actualCostMinor: "9007199254740991",
              landedCostMinor: "9007199254740992",
            }),
          "23514",
          CONSTRAINTS.UNIT_LANDED_SAFE_INTEGER,
        );
        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, base, {
              actualCostMinor: 50_000,
              landedCostMinor: 49_999,
            }),
          "23514",
          CONSTRAINTS.UNIT_COSTS,
        );
        const supplierId = await insertSupplier(client, base.organizationId);
        const purchaseOrderId = await insertPurchaseOrder(
          client,
          base,
          supplierId,
        );
        const lineId = await insertPurchaseOrderLine(
          client,
          base,
          purchaseOrderId,
          {
            productVariantId: base.serializedVariantId,
            quantityOrdered: 1,
          },
        );
        await approvePurchaseOrder(client, purchaseOrderId, base.userId);
        const quantityBatch = await insertStockBatch(client, base);
        const fixture: PurchasingFixture = {
          ...base,
          supplierId,
          purchaseOrderId,
          purchaseOrderLineId: lineId,
          stockBatchId: quantityBatch,
        };
        const receiptId = await insertReceiptHeader(client, fixture, {
          actualCostTotalMinor: 50_000,
          landedCostTotalMinor: 51_000,
          payableTotalMinor: 50_000,
        });
        const receiptLineId = await insertReceiptLine(
          client,
          fixture,
          receiptId,
          {
            productVariantId: base.serializedVariantId,
            trackingType: "serialized",
            quantityReceived: 1,
            unitCostMinor: 50_000,
            actualCostTotalMinor: 50_000,
            landedCostAllocatedMinor: 1_000,
            landedCostTotalMinor: 51_000,
            stockBatchId: null,
          },
        );
        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, base, {
              purchaseOrderLineId: lineId,
              goodsReceiptLineId: receiptLineId,
              actualCostMinor: 50_000,
              landedCostMinor: 51_000,
            }),
          "23514",
          CONSTRAINTS.UNIT_RECEIPT_COSTS,
        );
        await expectPgError(
          client,
          () =>
            insertSerializedUnit(client, base, {
              purchaseOrderLineId: lineId,
              goodsReceiptLineId: receiptLineId,
              receivedAt: "2026-07-16T09:00:00.000Z",
            }),
          "23514",
          CONSTRAINTS.UNIT_RECEIPT_COSTS,
        );
        await insertLandedCost(client, fixture, receiptId, 1_000);
        await insertPayable(client, fixture, receiptId, {
          amountMinor: 50_000,
          outstandingMinor: 50_000,
        });
        const unitId = await insertSerializedUnit(client, base, {
          purchaseOrderLineId: lineId,
          goodsReceiptLineId: receiptLineId,
          receivedAt: "2026-07-16T09:00:00.000Z",
          actualCostMinor: 50_000,
          landedCostMinor: 51_000,
        });
        await forceDeferredChecks(client);

        const stored = await client.query<{
          readonly poLine: string;
          readonly receiptLine: string;
          readonly actual: string;
          readonly landed: string;
        }>(
          `SELECT purchase_order_line_id::text AS "poLine",
                  goods_receipt_line_id::text AS "receiptLine",
                  actual_cost_minor::text AS actual,
                  landed_cost_minor::text AS landed
             FROM serialized_units WHERE id = $1`,
          [unitId],
        );
        expect(stored.rows[0]).toEqual({
          poLine: lineId,
          receiptLine: receiptLineId,
          actual: "50000",
          landed: "51000",
        });

        const destinationLocationId = await insertLocation(
          client,
          base.organizationId,
          base.branchId,
        );
        await client.query(
          `UPDATE serialized_units
              SET stock_location_id = $2, state = 'pending_verification',
                  version = version + 1, updated_at = now()
            WHERE id = $1`,
          [unitId, destinationLocationId],
        );
        const moved = await client.query<{
          readonly locationId: string;
          readonly poLine: string;
          readonly receiptLine: string;
          readonly version: number;
        }>(
          `SELECT stock_location_id::text AS "locationId",
                  purchase_order_line_id::text AS "poLine",
                  goods_receipt_line_id::text AS "receiptLine", version
             FROM serialized_units WHERE id = $1`,
          [unitId],
        );
        expect(moved.rows[0]).toEqual({
          locationId: destinationLocationId,
          poLine: lineId,
          receiptLine: receiptLineId,
          version: 2,
        });

        for (const statement of [
          "UPDATE serialized_units SET actual_cost_minor = actual_cost_minor + 1 WHERE id = $1",
          "UPDATE serialized_units SET landed_cost_minor = landed_cost_minor + 1 WHERE id = $1",
          "UPDATE serialized_units SET received_at = received_at + interval '1 minute' WHERE id = $1",
          "UPDATE serialized_units SET purchase_order_line_id = NULL, goods_receipt_line_id = NULL WHERE id = $1",
        ]) {
          await expectPgError(
            client,
            () => client.query(statement, [unitId]),
            "55000",
          );
        }
      });
    });

    it("requires both provenance columns and rejects a mismatched receipt line", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPostedQuantityReceipt(client, "unit-pair");
        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO serialized_units
                 (id, organization_id, branch_id, product_variant_id,
                  stock_location_id, purchase_order_line_id, state, condition,
                  pta_status, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, 'available', 'new',
                       'pta_approved', now())`,
              [
                randomUUID(),
                fixture.organizationId,
                fixture.branchId,
                fixture.serializedVariantId,
                fixture.stockLocationId,
                fixture.purchaseOrderLineId,
              ],
            ),
          "23514",
          CONSTRAINTS.UNIT_PROVENANCE_PAIR,
        );

        const serializedPoId = await insertPurchaseOrder(
          client,
          fixture,
          fixture.supplierId,
        );
        const serializedLineId = await insertPurchaseOrderLine(
          client,
          fixture,
          serializedPoId,
          { productVariantId: fixture.serializedVariantId },
        );

        // The direct PO-line source is valid for this serialized variant, but
        // the claimed receipt line belongs to a different PO line/variant.
        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO serialized_units
                 (id, organization_id, branch_id, product_variant_id,
                  stock_location_id, purchase_order_line_id,
                  goods_receipt_line_id, state, condition, pta_status,
                  received_at, actual_cost_minor, landed_cost_minor, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', 'new',
                       'pta_approved', now(), 1000, 1000, now())`,
              [
                randomUUID(),
                fixture.organizationId,
                fixture.branchId,
                fixture.serializedVariantId,
                fixture.stockLocationId,
                serializedLineId,
                fixture.goodsReceiptLineId,
              ],
            ),
          "23503",
          CONSTRAINTS.UNIT_RECEIPT_LINE_FK,
        );
      });
    });
  });

  describe("runtime privilege and sequence safety", () => {
    it("denies master/document deletes and guards approved PO lines", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createPurchasingFixture(client, "no-delete");
        for (const [table, id] of [
          ["suppliers", fixture.supplierId],
          ["purchase_orders", fixture.purchaseOrderId],
          ["stock_batches", fixture.stockBatchId],
        ] as const) {
          await expectPgError(
            client,
            () => client.query(`DELETE FROM ${table} WHERE id = $1`, [id]),
            "42501",
          );
        }
        await expectPgError(
          client,
          () =>
            client.query("DELETE FROM purchase_order_lines WHERE id = $1", [
              fixture.purchaseOrderLineId,
            ]),
          "55000",
        );
      });
    });

    it("keeps receipt tables INSERT-only for the runtime role", async () => {
      const grants = await runtimePool.query<{
        readonly tableName: string;
        readonly privilege: string;
      }>(
        `SELECT table_name AS "tableName", privilege_type AS privilege
           FROM information_schema.role_table_grants
          WHERE grantee = 'mobileshop_app'
            AND table_name IN (
              'goods_receipts', 'goods_receipt_lines',
              'goods_receipt_landed_costs'
            )
          ORDER BY table_name, privilege_type`,
      );
      for (const table of [
        "goods_receipts",
        "goods_receipt_lines",
        "goods_receipt_landed_costs",
      ]) {
        const privileges = grants.rows
          .filter((row) => row.tableName === table)
          .map((row) => row.privilege);
        expect(privileges).toContain("SELECT");
        expect(privileges).toContain("INSERT");
        expect(privileges).not.toContain("UPDATE");
        expect(privileges).not.toContain("DELETE");
        expect(privileges).not.toContain("TRUNCATE");
      }
    });

    it("uses the existing locked number-sequence row without nullable-scope duplicates", async () => {
      await transaction(runtimePool, async (client) => {
        const fixture = await createBaseFixture(client, "sequence");
        await client.query(
          `INSERT INTO number_sequences
             (id, organization_id, branch_id, key, prefix, next_value,
              padding, period_key, updated_at)
           VALUES ($1, $2, $3, 'purchase_order', 'PO-', 1, 6, NULL, now())`,
          [randomUUID(), fixture.organizationId, fixture.branchId],
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO number_sequences
                 (id, organization_id, branch_id, key, prefix, next_value,
                  padding, period_key, updated_at)
               VALUES ($1, $2, $3, 'purchase_order', 'PO-', 1, 6, NULL,
                       now())`,
              [randomUUID(), fixture.organizationId, fixture.branchId],
            ),
          "23505",
          CONSTRAINTS.SEQUENCE_SCOPE,
        );
        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO number_sequences
                 (id, organization_id, branch_id, key, next_value, updated_at)
               VALUES ($1, $2, $3, 'goods_receipt', 0, now())`,
              [randomUUID(), fixture.organizationId, fixture.branchId],
            ),
          "23514",
          CONSTRAINTS.SEQUENCE_NEXT,
        );
      });
    });
  });
});
