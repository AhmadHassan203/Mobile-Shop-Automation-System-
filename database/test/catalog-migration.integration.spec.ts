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

async function insertCategory(
  client: PoolClient,
  organizationId: string,
  label: string,
  parentCategoryId: string | null = null,
): Promise<string> {
  const id = randomUUID();
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;
  await client.query(
    `INSERT INTO categories
       (id, organization_id, parent_category_id, name, slug, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [
      id,
      organizationId,
      parentCategoryId,
      `Category ${suffix}`,
      `category-${suffix}`,
    ],
  );
  return id;
}

async function insertAlias(
  client: PoolClient,
  fixture: CatalogFixture,
  normalizedAlias: string,
  isActive = true,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO product_aliases
       (id, organization_id, product_variant_id, alias, normalized_alias, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      fixture.organizationId,
      fixture.productVariantId,
      normalizedAlias,
      normalizedAlias,
      isActive,
    ],
  );
  return id;
}

async function insertBarcode(
  client: PoolClient,
  fixture: CatalogFixture,
  barcode: string,
  options: { isPrimary?: boolean; isActive?: boolean; variantId?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO product_barcodes
       (id, organization_id, product_variant_id, barcode, is_primary, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      fixture.organizationId,
      options.variantId ?? fixture.productVariantId,
      barcode,
      options.isPrimary ?? false,
      options.isActive ?? true,
    ],
  );
  return id;
}

afterAll(async () => {
  await Promise.all([runtimePool.end(), migratorPool.end()]);
});

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

describe("0006 catalog management migration invariants", () => {
  beforeAll(async () => {
    const result = await migratorPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM _prisma_migrations
       WHERE migration_name = '20260716120000_0006_catalog_management'
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL`,
    );
    expect(Number(result.rows[0]?.count ?? 0)).toBe(1);
  });

  it("gives every reference table a NOT NULL version defaulting to 1", async () => {
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
          AND table_name IN ('categories', 'brands', 'product_models')
        ORDER BY table_name`,
    );

    expect(columns.rows).toEqual([
      {
        tableName: "brands",
        isNullable: "NO",
        columnDefault: "1",
        dataType: "integer",
      },
      {
        tableName: "categories",
        isNullable: "NO",
        columnDefault: "1",
        dataType: "integer",
      },
      {
        tableName: "product_models",
        isNullable: "NO",
        columnDefault: "1",
        dataType: "integer",
      },
    ]);

    await transaction(runtimePool, async (client) => {
      const fixture = await createCatalogFixture(client, "version-default");

      const seeded = await client.query<{ readonly version: number }>(
        `SELECT c.version FROM categories c WHERE c.id = $1
         UNION ALL
         SELECT b.version FROM brands b WHERE b.id = $2
         UNION ALL
         SELECT m.version FROM product_models m WHERE m.id = $3`,
        [fixture.categoryId, fixture.brandId, fixture.productModelId],
      );
      expect(seeded.rows.map((row) => row.version)).toEqual([1, 1, 1]);
    });
  });

  it("rejects a zero or negative version on every reference table", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createCatalogFixture(client, "version-check");

      const targets = [
        ["categories", fixture.categoryId],
        ["brands", fixture.brandId],
        ["product_models", fixture.productModelId],
        ["product_variants", fixture.productVariantId],
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
      }
    });
  });

  it("rejects a category that is its own parent", async () => {
    await transaction(runtimePool, async (client) => {
      const organizationId = await createOrganization(client, "self-parent");
      const categoryId = await insertCategory(client, organizationId, "solo");

      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE categories SET parent_category_id = id WHERE id = $1",
            [categoryId],
          ),
        "23514",
      );

      const selfId = randomUUID();
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO categories
               (id, organization_id, parent_category_id, name, slug, updated_at)
             VALUES ($1, $2, $1, 'Self parent', $3, now())`,
            [selfId, organizationId, `self-parent-${randomUUID()}`],
          ),
        "23514",
      );
    });
  });

  it("declares the parent_not_self check constraint on categories", async () => {
    const constraint = await runtimePool.query<{ readonly definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conname = 'categories_parent_not_self'
          AND conrelid = 'categories'::regclass`,
    );
    expect(constraint.rows).toHaveLength(1);
    expect(constraint.rows[0]?.definition).toContain("IS DISTINCT FROM");
  });

  it("rejects a two-level category cycle", async () => {
    await transaction(runtimePool, async (client) => {
      const organizationId = await createOrganization(client, "cycle-2");
      const a = await insertCategory(client, organizationId, "a");
      const b = await insertCategory(client, organizationId, "b", a);

      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE categories SET parent_category_id = $1 WHERE id = $2",
            [b, a],
          ),
        "23514",
      );
    });
  });

  it("rejects a three-level category cycle", async () => {
    await transaction(runtimePool, async (client) => {
      const organizationId = await createOrganization(client, "cycle-3");
      const a = await insertCategory(client, organizationId, "a");
      const b = await insertCategory(client, organizationId, "b", a);
      const c = await insertCategory(client, organizationId, "c", b);

      // Making C an ancestor of A closes the A -> B -> C chain into a loop.
      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE categories SET parent_category_id = $1 WHERE id = $2",
            [c, a],
          ),
        "23514",
      );

      // The mid-chain edge is just as illegal as the end-to-end one.
      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE categories SET parent_category_id = $1 WHERE id = $2",
            [c, b],
          ),
        "23514",
      );
    });
  });

  it("accepts a legitimate deep category chain without false positives", async () => {
    await transaction(runtimePool, async (client) => {
      const organizationId = await createOrganization(client, "deep-chain");
      const a = await insertCategory(client, organizationId, "a");
      const b = await insertCategory(client, organizationId, "b", a);
      const c = await insertCategory(client, organizationId, "c", b);
      const d = await insertCategory(client, organizationId, "d", c);

      const ancestry = await client.query<{ readonly depth: number }>(
        `WITH RECURSIVE chain AS (
           SELECT id, parent_category_id, 0 AS depth
             FROM categories WHERE id = $1
           UNION ALL
           SELECT c.id, c.parent_category_id, chain.depth + 1
             FROM categories c
             JOIN chain ON chain.parent_category_id = c.id
         )
         SELECT max(depth)::int AS depth FROM chain`,
        [d],
      );
      expect(ancestry.rows[0]?.depth).toBe(3);

      // Re-parenting deeper within the same legal tree stays accepted.
      const e = await insertCategory(client, organizationId, "e");
      await client.query(
        "UPDATE categories SET parent_category_id = $1 WHERE id = $2",
        [d, e],
      );

      const reparented = await client.query<{
        readonly parentCategoryId: string;
      }>(
        `SELECT parent_category_id AS "parentCategoryId"
           FROM categories WHERE id = $1`,
        [e],
      );
      expect(reparented.rows[0]?.parentCategoryId).toBe(d);
    });
  });

  it("lets the cycle trigger pass valid parents and NULL parents on insert", async () => {
    await transaction(runtimePool, async (client) => {
      const organizationId = await createOrganization(client, "trigger-pass");

      // NULL parent: the trigger's WHEN clause must skip the row entirely.
      const root = await insertCategory(client, organizationId, "root", null);
      // Valid parent on INSERT: the trigger fires and must accept.
      const child = await insertCategory(client, organizationId, "child", root);

      const rows = await client.query<{
        readonly id: string;
        readonly parentCategoryId: string | null;
      }>(
        `SELECT id, parent_category_id AS "parentCategoryId"
           FROM categories WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[root, child].sort()],
      );
      expect(rows.rows).toHaveLength(2);
      expect(
        rows.rows.find((row) => row.id === root)?.parentCategoryId,
      ).toBeNull();
      expect(rows.rows.find((row) => row.id === child)?.parentCategoryId).toBe(
        root,
      );

      // Clearing a parent back to NULL must also stay accepted.
      await client.query(
        "UPDATE categories SET parent_category_id = NULL WHERE id = $1",
        [child],
      );
      const cleared = await client.query<{
        readonly parentCategoryId: string | null;
      }>(
        `SELECT parent_category_id AS "parentCategoryId"
           FROM categories WHERE id = $1`,
        [child],
      );
      expect(cleared.rows[0]?.parentCategoryId).toBeNull();
    });
  });

  it("adds is_active defaulting to true and makes alias and barcode uniqueness partial", async () => {
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
          AND column_name = 'is_active'
          AND table_name IN ('product_aliases', 'product_barcodes')
        ORDER BY table_name`,
    );
    expect(columns.rows).toEqual([
      {
        tableName: "product_aliases",
        isNullable: "NO",
        columnDefault: "true",
        dataType: "boolean",
      },
      {
        tableName: "product_barcodes",
        isNullable: "NO",
        columnDefault: "true",
        dataType: "boolean",
      },
    ]);

    const indexes = await runtimePool.query<{
      readonly indexName: string;
      readonly indexDefinition: string;
    }>(
      `SELECT indexname AS "indexName", indexdef AS "indexDefinition"
         FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN (
            'product_aliases_organization_id_normalized_alias_key',
            'product_barcodes_organization_id_barcode_key'
          )
        ORDER BY indexname`,
    );
    expect(indexes.rows).toHaveLength(2);
    for (const row of indexes.rows) {
      expect(row.indexDefinition).toContain("UNIQUE");
      expect(row.indexDefinition).toContain("WHERE is_active");
    }

    await transaction(runtimePool, async (client) => {
      const fixture = await createCatalogFixture(client, "is-active-default");
      const aliasId = randomUUID();
      const barcodeId = randomUUID();
      await client.query(
        `INSERT INTO product_aliases
           (id, organization_id, product_variant_id, alias, normalized_alias)
         VALUES ($1, $2, $3, 'Default Active', $4)`,
        [
          aliasId,
          fixture.organizationId,
          fixture.productVariantId,
          `default active ${randomUUID()}`,
        ],
      );
      await client.query(
        `INSERT INTO product_barcodes
           (id, organization_id, product_variant_id, barcode)
         VALUES ($1, $2, $3, $4)`,
        [
          barcodeId,
          fixture.organizationId,
          fixture.productVariantId,
          `BC-${randomUUID()}`,
        ],
      );

      const defaults = await client.query<{ readonly isActive: boolean }>(
        `SELECT is_active AS "isActive" FROM product_aliases WHERE id = $1
         UNION ALL
         SELECT is_active AS "isActive" FROM product_barcodes WHERE id = $2`,
        [aliasId, barcodeId],
      );
      expect(defaults.rows.map((row) => row.isActive)).toEqual([true, true]);
    });
  });

  it("frees a retired alias value for reuse and keeps alias uniqueness organization-scoped", async () => {
    await transaction(runtimePool, async (client) => {
      const first = await createCatalogFixture(client, "alias-a");
      const second = await createCatalogFixture(client, "alias-b");
      const alias = `iphone fifteen pro ${randomUUID()}`;

      const originalAliasId = await insertAlias(client, first, alias);

      // Two ACTIVE rows with the same normalized alias remain impossible.
      await expectPgError(
        client,
        () => insertAlias(client, first, alias),
        "23505",
      );

      // The same value in a DIFFERENT organization is always allowed.
      await insertAlias(client, second, alias);

      // Retiring the original frees the value for reuse inside the org.
      await client.query(
        "UPDATE product_aliases SET is_active = false WHERE id = $1",
        [originalAliasId],
      );
      const reusedAliasId = await insertAlias(client, first, alias);

      const rows = await client.query<{
        readonly id: string;
        readonly isActive: boolean;
      }>(
        `SELECT id, is_active AS "isActive"
           FROM product_aliases
          WHERE organization_id = $1 AND normalized_alias = $2
          ORDER BY is_active`,
        [first.organizationId, alias],
      );
      expect(rows.rows).toEqual([
        { id: originalAliasId, isActive: false },
        { id: reusedAliasId, isActive: true },
      ]);

      // Reactivating the retired row would create a second active duplicate.
      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE product_aliases SET is_active = true WHERE id = $1",
            [originalAliasId],
          ),
        "23505",
      );
    });
  });

  it("frees a retired barcode value for reuse and keeps barcode uniqueness organization-scoped", async () => {
    await transaction(runtimePool, async (client) => {
      const first = await createCatalogFixture(client, "barcode-a");
      const second = await createCatalogFixture(client, "barcode-b");
      const barcode = "8806095467999";

      const originalBarcodeId = await insertBarcode(client, first, barcode);

      await expectPgError(
        client,
        () => insertBarcode(client, first, barcode),
        "23505",
      );

      await insertBarcode(client, second, barcode);

      await client.query(
        "UPDATE product_barcodes SET is_active = false WHERE id = $1",
        [originalBarcodeId],
      );
      const reusedBarcodeId = await insertBarcode(client, first, barcode);

      const rows = await client.query<{
        readonly id: string;
        readonly isActive: boolean;
      }>(
        `SELECT id, is_active AS "isActive"
           FROM product_barcodes
          WHERE organization_id = $1 AND barcode = $2
          ORDER BY is_active`,
        [first.organizationId, barcode],
      );
      expect(rows.rows).toEqual([
        { id: originalBarcodeId, isActive: false },
        { id: reusedBarcodeId, isActive: true },
      ]);

      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE product_barcodes SET is_active = true WHERE id = $1",
            [originalBarcodeId],
          ),
        "23505",
      );
    });
  });

  it("refuses to let a barcode stay primary once it is retired", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createCatalogFixture(client, "primary-active");

      // A retired row can never be born primary.
      await expectPgError(
        client,
        () =>
          insertBarcode(client, fixture, `BC-${randomUUID()}`, {
            isPrimary: true,
            isActive: false,
          }),
        "23514",
      );

      const primaryId = await insertBarcode(client, fixture, "8806095468001", {
        isPrimary: true,
      });

      // Retiring a primary barcode without clearing the flag is rejected.
      await expectPgError(
        client,
        () =>
          client.query(
            "UPDATE product_barcodes SET is_active = false WHERE id = $1",
            [primaryId],
          ),
        "23514",
      );

      // Clearing the flag in the same statement is the supported retirement.
      await client.query(
        `UPDATE product_barcodes
            SET is_active = false, is_primary = false
          WHERE id = $1`,
        [primaryId],
      );
      const retired = await client.query<{
        readonly isActive: boolean;
        readonly isPrimary: boolean;
      }>(
        `SELECT is_active AS "isActive", is_primary AS "isPrimary"
           FROM product_barcodes WHERE id = $1`,
        [primaryId],
      );
      expect(retired.rows[0]).toEqual({ isActive: false, isPrimary: false });
    });
  });

  it("still allows only one primary barcode per variant after 0006", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createCatalogFixture(client, "one-primary");

      await insertBarcode(client, fixture, "8806095468101", {
        isPrimary: true,
      });
      await expectPgError(
        client,
        () =>
          insertBarcode(client, fixture, "8806095468102", { isPrimary: true }),
        "23505",
      );

      // Retiring the incumbent releases the primary slot for its replacement.
      await client.query(
        `UPDATE product_barcodes
            SET is_active = false, is_primary = false
          WHERE organization_id = $1 AND product_variant_id = $2`,
        [fixture.organizationId, fixture.productVariantId],
      );
      await insertBarcode(client, fixture, "8806095468103", {
        isPrimary: true,
      });

      const primaries = await client.query<{ readonly count: string }>(
        `SELECT count(*)::text AS count
           FROM product_barcodes
          WHERE product_variant_id = $1 AND is_primary`,
        [fixture.productVariantId],
      );
      expect(primaries.rows[0]?.count).toBe("1");
    });
  });

  it("still denies runtime hard deletes on aliases and barcodes after 0006", async () => {
    await transaction(runtimePool, async (client) => {
      const fixture = await createCatalogFixture(client, "no-delete");
      await insertAlias(client, fixture, `retire me ${randomUUID()}`);
      await insertBarcode(client, fixture, `BC-${randomUUID()}`);

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
          () =>
            client.query(`DELETE FROM ${table} WHERE organization_id = $1`, [
              fixture.organizationId,
            ]),
          "42501",
        );
      }
    });
  });

  it("keeps the no-hard-delete triggers firing for a privileged role after 0006", async () => {
    // The runtime REVOKE hides the trigger behind a privilege error, so the
    // trigger itself is only observable through a role that holds DELETE.
    await transaction(migratorPool, async (client) => {
      const fixture = await createCatalogFixture(client, "trigger-delete");
      await insertAlias(client, fixture, `trigger alias ${randomUUID()}`);
      await insertBarcode(client, fixture, `BC-${randomUUID()}`);

      for (const table of [
        "product_aliases",
        "product_barcodes",
        "product_variants",
        "product_models",
        "brands",
        "categories",
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

  it("still rejects cross-tenant alias and barcode rows after 0006", async () => {
    await transaction(runtimePool, async (client) => {
      const first = await createCatalogFixture(client, "iso-a");
      const second = await createCatalogFixture(client, "iso-b");

      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO product_aliases
               (id, organization_id, product_variant_id, alias, normalized_alias, is_active)
             VALUES ($1, $2, $3, 'Cross alias', $4, true)`,
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
               (id, organization_id, product_variant_id, barcode, is_active)
             VALUES ($1, $2, $3, $4, true)`,
            [
              randomUUID(),
              first.organizationId,
              second.productVariantId,
              `BC-${randomUUID()}`,
            ],
          ),
        "23503",
      );

      // A cross-tenant category parent is still blocked by the composite FK,
      // not by the new cycle trigger.
      await expectPgError(
        client,
        () =>
          client.query(
            `INSERT INTO categories
               (id, organization_id, parent_category_id, name, slug, updated_at)
             VALUES ($1, $2, $3, 'Cross parent', $4, now())`,
            [
              randomUUID(),
              first.organizationId,
              second.categoryId,
              `cross-parent-${randomUUID()}`,
            ],
          ),
        "23503",
      );
    });
  });
});
