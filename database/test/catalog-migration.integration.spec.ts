import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CATALOG_CONTRACT_LIMITS,
  CreateProductInputSchema,
  canonicalizeCatalogAlias,
  normalizeCatalogSlug,
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

interface CatalogFixture {
  readonly organizationId: string;
  readonly categoryId: string;
  readonly brandId: string;
  readonly productModelId: string;
  readonly productVariantId: string;
  readonly sku: string;
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
): Promise<void> {
  savepointSequence += 1;
  const savepoint = `expected_error_${savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);

  try {
    await work();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    expect(error).toMatchObject({ code: expectedCode });
    return;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(
    `Expected PostgreSQL error ${expectedCode}, but the statement succeeded`,
  );
}

async function createOrganization(
  client: PoolClient,
  suffix: string,
): Promise<string> {
  const organizationId = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, updated_at)
     VALUES ($1, $2, now())`,
    [organizationId, `Catalog Test ${suffix}`],
  );
  return organizationId;
}

async function createCatalogFixture(
  client: PoolClient,
  label: string,
): Promise<CatalogFixture> {
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;
  const organizationId = await createOrganization(client, suffix);
  const categoryId = randomUUID();
  const brandId = randomUUID();
  const productModelId = randomUUID();
  const productVariantId = randomUUID();
  const sku = `SKU-${suffix}`.toUpperCase();

  await client.query(
    `INSERT INTO categories
       (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [categoryId, organizationId, `Phones ${suffix}`, `phones-${suffix}`],
  );
  await client.query(
    `INSERT INTO brands (id, organization_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [brandId, organizationId, `Brand ${suffix}`, `brand-${suffix}`],
  );
  await client.query(
    `INSERT INTO product_models
       (id, organization_id, brand_id, category_id, name, canonical_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      productModelId,
      organizationId,
      brandId,
      categoryId,
      `Model ${suffix}`,
      `model ${suffix}`,
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
      sku,
      `Variant ${suffix}`,
    ],
  );

  return {
    organizationId,
    categoryId,
    brandId,
    productModelId,
    productVariantId,
    sku,
  };
}

async function insertVariant(
  client: PoolClient,
  fixture: CatalogFixture,
  sku: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO product_variants
       (id, organization_id, product_model_id, sku, name, tracking_type,
        condition, pta_status, warranty_type, warranty_months, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'serialized', 'new', 'pta_approved',
             'none', NULL, now())`,
    [id, fixture.organizationId, fixture.productModelId, sku, `Variant ${sku}`],
  );
  return id;
}

describe("0005 catalog core migration invariants", () => {
  beforeAll(async () => {
    const result = await migratorPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM _prisma_migrations
       WHERE migration_name = '20260716014200_0005_catalog_core'
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL`,
    );
    expect(Number(result.rows[0]?.count ?? 0)).toBe(1);
  });

  afterAll(async () => {
    await Promise.all([runtimePool.end(), migratorPool.end()]);
  });

  it("rejects every cross-tenant catalog relationship through composite foreign keys", async () => {
    await transaction(runtimePool, async (client) => {
      const first = await createCatalogFixture(client, "tenant-a");
      const second = await createCatalogFixture(client, "tenant-b");

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO categories
               (id, organization_id, parent_category_id, name, slug, updated_at)
             VALUES ($1, $2, $3, 'Cross-tenant child', $4, now())`,
            [
              randomUUID(),
              first.organizationId,
              second.categoryId,
              `cross-category-${randomUUID()}`,
            ],
          ),
        "23503",
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_models
               (id, organization_id, brand_id, category_id, name, canonical_name, updated_at)
             VALUES ($1, $2, $3, $4, 'Cross-brand model', $5, now())`,
            [
              randomUUID(),
              first.organizationId,
              second.brandId,
              first.categoryId,
              `cross brand ${randomUUID()}`,
            ],
          ),
        "23503",
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_models
               (id, organization_id, brand_id, category_id, name, canonical_name, updated_at)
             VALUES ($1, $2, $3, $4, 'Cross-category model', $5, now())`,
            [
              randomUUID(),
              first.organizationId,
              first.brandId,
              second.categoryId,
              `cross category ${randomUUID()}`,
            ],
          ),
        "23503",
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_variants
               (id, organization_id, product_model_id, sku, name, tracking_type,
                condition, pta_status, warranty_type, warranty_months, updated_at)
             VALUES ($1, $2, $3, $4, 'Cross-tenant variant', 'serialized',
                     'new', 'pta_approved', 'none', NULL, now())`,
            [
              randomUUID(),
              first.organizationId,
              second.productModelId,
              `CROSS-${randomUUID()}`.toUpperCase(),
            ],
          ),
        "23503",
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_aliases
               (id, organization_id, product_variant_id, alias, normalized_alias)
             VALUES ($1, $2, $3, 'Cross alias', $4)`,
            [
              randomUUID(),
              first.organizationId,
              second.productVariantId,
              `cross alias ${randomUUID()}`,
            ],
          ),
        "23503",
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_barcodes
               (id, organization_id, product_variant_id, barcode)
             VALUES ($1, $2, $3, $4)`,
            [
              randomUUID(),
              first.organizationId,
              second.productVariantId,
              `BC-${randomUUID()}`,
            ],
          ),
        "23503",
      );
    });
  });

  it("scopes SKU and barcode uniqueness by tenant and allows one primary barcode per variant", async () => {
    await transaction(runtimePool, async (client) => {
      const first = await createCatalogFixture(client, "unique-a");
      const second = await createCatalogFixture(client, "unique-b");

      await expectPgError(
        client,
        () => insertVariant(client, first, first.sku),
        "23505",
      );
      await insertVariant(client, second, first.sku);

      const firstSecondVariantId = await insertVariant(
        client,
        first,
        `SECOND-${randomUUID()}`.toUpperCase(),
      );
      const barcode = "8806095467890";
      await client.query(
        `INSERT INTO product_barcodes
           (id, organization_id, product_variant_id, barcode, is_primary)
         VALUES ($1, $2, $3, $4, true)`,
        [randomUUID(), first.organizationId, first.productVariantId, barcode],
      );

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_barcodes
               (id, organization_id, product_variant_id, barcode)
             VALUES ($1, $2, $3, $4)`,
            [randomUUID(), first.organizationId, firstSecondVariantId, barcode],
          ),
        "23505",
      );

      await client.query(
        `INSERT INTO product_barcodes
           (id, organization_id, product_variant_id, barcode, is_primary)
         VALUES ($1, $2, $3, $4, false)`,
        [
          randomUUID(),
          first.organizationId,
          first.productVariantId,
          "8806095467891",
        ],
      );
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_barcodes
               (id, organization_id, product_variant_id, barcode, is_primary)
             VALUES ($1, $2, $3, $4, true)`,
            [
              randomUUID(),
              first.organizationId,
              first.productVariantId,
              "8806095467892",
            ],
          ),
        "23505",
      );

      await client.query(
        `INSERT INTO product_barcodes
           (id, organization_id, product_variant_id, barcode, is_primary)
         VALUES ($1, $2, $3, $4, true)`,
        [randomUUID(), second.organizationId, second.productVariantId, barcode],
      );
    });
  });

  it("enforces SKU, barcode and warranty checks in PostgreSQL", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createCatalogFixture(client, "checks");

      for (const invalidSku of ["lowercase-sku", "SKU WITH SPACE", "@SKU"]) {
        await expectPgError(
          client,
          () => insertVariant(client, fixture, invalidSku),
          "23514",
        );
      }

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_barcodes
               (id, organization_id, product_variant_id, barcode)
             VALUES ($1, $2, $3, '8806 0954 67890')`,
            [randomUUID(), fixture.organizationId, fixture.productVariantId],
          ),
        "23514",
      );

      for (const [warrantyType, warrantyMonths] of [
        ["none", 1],
        ["official", null],
        ["official", 0],
        ["official", 121],
      ] as const) {
        await expectPgError(
          client,
          () =>
            client.query(
              `INSERT INTO product_variants
                 (id, organization_id, product_model_id, sku, name,
                  tracking_type, condition, pta_status, warranty_type,
                  warranty_months, updated_at)
               VALUES ($1, $2, $3, $4, 'Warranty check', 'serialized',
                       'new', 'pta_approved', $5, $6, now())`,
              [
                randomUUID(),
                fixture.organizationId,
                fixture.productModelId,
                `WARRANTY-${randomUUID()}`.toUpperCase(),
                warrantyType,
                warrantyMonths,
              ],
            ),
          "23514",
        );
      }

      await client.query(
        `INSERT INTO product_variants
           (id, organization_id, product_model_id, sku, name, tracking_type,
            condition, pta_status, warranty_type, warranty_months, updated_at)
         VALUES ($1, $2, $3, $4, 'Valid warranty', 'serialized', 'new',
                 'pta_approved', 'official', 120, now())`,
        [
          randomUUID(),
          fixture.organizationId,
          fixture.productModelId,
          `VALID-WARRANTY-${randomUUID()}`.toUpperCase(),
        ],
      );
    });
  });

  it("accepts every exact shared catalog maximum at the database boundary", async () => {
    await transaction(runtimePool, async (client) => {
      const organizationId = await createOrganization(client, "maxima");
      const categoryId = randomUUID();
      const brandId = randomUUID();
      const productModelId = randomUUID();

      const categoryName = "C".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH);
      const categorySlug = normalizeCatalogSlug(
        "ل".repeat(CATALOG_CONTRACT_LIMITS.SLUG_LENGTH),
      );
      const brandName = "B".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH);
      const brandSlug = "b".repeat(CATALOG_CONTRACT_LIMITS.SLUG_LENGTH);
      const modelName = "M".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH);

      await client.query(
        `INSERT INTO categories
           (id, organization_id, name, slug, updated_at)
         VALUES ($1, $2, $3, $4, now())`,
        [categoryId, organizationId, categoryName, categorySlug],
      );
      await client.query(
        `INSERT INTO brands (id, organization_id, name, slug, updated_at)
         VALUES ($1, $2, $3, $4, now())`,
        [brandId, organizationId, brandName, brandSlug],
      );
      await client.query(
        `INSERT INTO product_models
           (id, organization_id, brand_id, category_id, name,
            canonical_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [
          productModelId,
          organizationId,
          brandId,
          categoryId,
          modelName,
          "m".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH),
        ],
      );

      const product = CreateProductInputSchema.parse({
        productModelId,
        sku: "S".repeat(CATALOG_CONTRACT_LIMITS.SKU_LENGTH),
        name: "N".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH),
        trackingType: "serialized",
        condition: "new",
        ptaStatus: "pta_approved",
        ram: "R".repeat(CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
        storage: "T".repeat(CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
        color: "C".repeat(CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
        region: "G".repeat(CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
        warrantyType: "official",
        warrantyMonths: CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS,
        aliases: ["A".repeat(CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH)],
        barcodes: ["1".repeat(CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH)],
      });
      const productVariantId = randomUUID();

      await client.query(
        `INSERT INTO product_variants
           (id, organization_id, product_model_id, sku, name, tracking_type,
            condition, pta_status, ram, storage, color, region, warranty_type,
            warranty_months, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13, $14, now())`,
        [
          productVariantId,
          organizationId,
          product.productModelId,
          product.sku,
          product.name,
          product.trackingType,
          product.condition,
          product.ptaStatus,
          product.ram,
          product.storage,
          product.color,
          product.region,
          product.warrantyType,
          product.warrantyMonths,
        ],
      );
      await client.query(
        `INSERT INTO product_aliases
           (id, organization_id, product_variant_id, alias, normalized_alias)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          organizationId,
          productVariantId,
          product.aliases[0],
          canonicalizeCatalogAlias(product.aliases[0] ?? ""),
        ],
      );
      await client.query(
        `INSERT INTO product_barcodes
           (id, organization_id, product_variant_id, barcode, is_primary)
         VALUES ($1, $2, $3, $4, true)`,
        [randomUUID(), organizationId, productVariantId, product.barcodes[0]],
      );

      const lengths = await client.query<{
        readonly nameLength: number;
        readonly skuLength: number;
        readonly ramLength: number;
        readonly storageLength: number;
        readonly colorLength: number;
        readonly regionLength: number;
      }>(
        `SELECT char_length(name)::int AS "nameLength",
                char_length(sku)::int AS "skuLength",
                char_length(ram)::int AS "ramLength",
                char_length(storage)::int AS "storageLength",
                char_length(color)::int AS "colorLength",
                char_length(region)::int AS "regionLength"
           FROM product_variants
          WHERE id = $1`,
        [productVariantId],
      );
      expect(lengths.rows[0]).toEqual({
        nameLength: CATALOG_CONTRACT_LIMITS.NAME_LENGTH,
        skuLength: CATALOG_CONTRACT_LIMITS.SKU_LENGTH,
        ramLength: CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
        storageLength: CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
        colorLength: CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
        regionLength: CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
      });

      const childLengths = await client.query<{
        readonly aliasLength: number;
        readonly barcodeLength: number;
      }>(
        `SELECT char_length(a.alias)::int AS "aliasLength",
                char_length(b.barcode)::int AS "barcodeLength"
           FROM product_aliases a
           JOIN product_barcodes b
             ON b.product_variant_id = a.product_variant_id
          WHERE a.product_variant_id = $1`,
        [productVariantId],
      );
      expect(childLengths.rows[0]).toEqual({
        aliasLength: CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH,
        barcodeLength: CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH,
      });

      expect(categorySlug).toHaveLength(CATALOG_CONTRACT_LIMITS.SLUG_LENGTH);
    });
  });

  it("denies runtime catalog DELETE and TRUNCATE privileges", async () => {
    await transaction(runtimePool, async (client) => {
      for (const table of [
        "categories",
        "brands",
        "product_models",
        "product_variants",
        "product_aliases",
        "product_barcodes",
      ] as const) {
        await expectPgError(
          client,
          () => client.query(`DELETE FROM ${table} WHERE false`),
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

  it("keeps runtime audit, login-attempt and user protections revoked", async () => {
    await transaction(runtimePool, async (client) => {
      const organizationId = await createOrganization(client, "legacy");
      const userId = randomUUID();
      const auditId = randomUUID();
      const attemptId = randomUUID();

      await client.query(
        `INSERT INTO users
           (id, organization_id, email, password_hash, full_name, updated_at)
         VALUES ($1, $2, $3, 'test-hash', 'Catalog Test User', now())`,
        [userId, organizationId, `catalog-${randomUUID()}@example.test`],
      );
      await client.query(
        `INSERT INTO audit_events
           (id, organization_id, actor_user_id, action, entity_type)
         VALUES ($1, $2, $3, 'catalog.test', 'product_variant')`,
        [auditId, organizationId, userId],
      );
      await client.query(
        `INSERT INTO login_attempts
           (id, email, succeeded, failure_reason)
         VALUES ($1, $2, false, 'catalog_test')`,
        [attemptId, `attempt-${randomUUID()}@example.test`],
      );

      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE audit_events SET action = 'catalog.changed' WHERE id = $1",
            [auditId],
          ),
        "42501",
      );
      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE login_attempts SET failure_reason = 'changed' WHERE id = $1",
            [attemptId],
          ),
        "42501",
      );
      await expectPgError(
        client,
        () => client.query("DELETE FROM audit_events WHERE id = $1", [auditId]),
        "42501",
      );
      await expectPgError(
        client,
        () =>
          client.query("DELETE FROM login_attempts WHERE id = $1", [attemptId]),
        "42501",
      );
      await expectPgError(
        client,
        () => client.query("DELETE FROM users WHERE id = $1", [userId]),
        "42501",
      );

      for (const table of [
        "audit_events",
        "login_attempts",
        "users",
      ] as const) {
        await expectPgError(
          client,
          () => client.query(`TRUNCATE TABLE ${table}`),
          "42501",
        );
      }
    });
  });
});
