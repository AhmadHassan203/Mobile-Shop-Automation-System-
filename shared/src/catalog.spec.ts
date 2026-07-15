import { describe, expect, it } from "vitest";
import {
  BrandListQuerySchema,
  BrandPageSchema,
  BrandReferenceSchema,
  CATALOG_CONTRACT_LIMITS,
  CatalogVersionInputSchema,
  CategoryListQuerySchema,
  CategoryPageSchema,
  CategoryReferenceSchema,
  CreateBrandInputSchema,
  CreateCategoryInputSchema,
  CreateProductInputSchema,
  CreateProductModelInputSchema,
  ProductAliasSchema,
  ProductBarcodeSchema,
  ProductDetailSchema,
  ProductListQuerySchema,
  ProductModelListQuerySchema,
  ProductModelPageSchema,
  ProductModelReferenceSchema,
  ProductSummaryPageSchema,
  ProductSummarySchema,
  UpdateBrandInputSchema,
  UpdateCategoryInputSchema,
  UpdateProductInputSchema,
  UpdateProductModelInputSchema,
  canonicalizeCatalogAlias,
  normalizeCatalogBarcode,
  normalizeCatalogSku,
  normalizeCatalogSlug,
} from "./catalog";

const IDS = {
  category: "4bc5458f-7a6a-4681-b5b2-948dc25c06a8",
  parentCategory: "baf8bb82-ec2e-4a33-9a52-42166fae197a",
  brand: "ac43d8e5-3553-4917-90a7-11953abf3cc5",
  model: "a6a73cdb-abf8-4540-b50f-e07fea1213c5",
  product: "027e808b-c43f-42ac-8d58-52d3bd5e623a",
} as const;

const categoryFixture = {
  id: IDS.category,
  name: "Smartphones",
  parentCategoryId: IDS.parentCategory,
  isActive: true,
  version: 1,
} as const;

const brandFixture = {
  id: IDS.brand,
  name: "Samsung",
  isActive: true,
  version: 1,
} as const;

const productModelFixture = {
  id: IDS.model,
  name: "Galaxy A55",
  brandId: IDS.brand,
  brandName: "Samsung",
  categoryId: IDS.category,
  categoryName: "Smartphones",
  isActive: true,
  version: 1,
} as const;

const productFixture = {
  id: IDS.product,
  productModel: {
    id: IDS.model,
    name: "Galaxy A55",
    brand: { id: IDS.brand, name: "Samsung" },
    category: { id: IDS.category, name: "Smartphones" },
  },
  sku: "PH-SAMSUNG-A55-256-NVY",
  name: "Samsung Galaxy A55 256 GB Navy",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  ram: "8 GB",
  storage: "256 GB",
  color: "Navy",
  region: "Pakistan",
  warrantyType: "official",
  warrantyMonths: 12,
  isActive: true,
  version: 1,
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
} as const;

const aliasFixture = {
  id: "1b0d6a41-2f0f-4b0a-9a0f-4dd8d0c9d2b1",
  alias: "A55 Navy",
} as const;

const barcodeFixture = {
  id: "6f2c1b53-6a24-4f4b-9a26-1c2f8b6d5e40",
  barcode: "8806095467890",
  isPrimary: true,
} as const;

const secondaryBarcodeFixture = {
  id: "9d1a7c02-0c3e-4a1d-8f65-3b7a4e2c9d18",
  barcode: "8806095467891",
  isPrimary: false,
} as const;

const productDetailFixture = {
  ...productFixture,
  aliases: [aliasFixture],
  barcodes: [barcodeFixture, secondaryBarcodeFixture],
} as const;

/** Update bodies replace the whole editable identity, so every key is present. */
const updateCategoryFixture = {
  name: "Smartphones",
  parentCategoryId: IDS.parentCategory,
  version: 1,
} as const;

const updateBrandFixture = {
  name: "Samsung",
  version: 1,
} as const;

const updateProductModelFixture = {
  name: "Galaxy A55",
  brandId: IDS.brand,
  categoryId: IDS.category,
  version: 1,
} as const;

const updateProductFixture = {
  productModelId: IDS.model,
  sku: "PH-SAMSUNG-A55-256-NVY",
  name: "Samsung Galaxy A55 256 GB Navy",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  warrantyType: "official",
  warrantyMonths: 12,
  aliases: [],
  barcodes: [],
  version: 1,
} as const;

/**
 * Tenant scope and money never cross a catalog boundary: the organization comes
 * from the authenticated context and pricing lives outside this contract. Every
 * strict input schema must reject all of these outright.
 */
const FORBIDDEN_INPUT_FIELDS = [
  "organizationId",
  "organization_id",
  "costMinor",
  "priceMinor",
  "defaultPriceMinor",
  "stock",
  "quantity",
  "imei",
  "reorderPoint",
] as const;

function withExtraField<T extends object>(
  value: T,
  key: string,
  extraValue: unknown,
): T & Record<string, unknown> {
  return { ...value, [key]: extraValue };
}

function withoutField<T extends object>(value: T, key: keyof T & string): T {
  const rest = { ...value } as Record<string, unknown>;
  delete rest[key];
  return rest as T;
}

describe("catalog normalization", () => {
  it("creates deterministic lowercase slugs while preserving Unicode letters", () => {
    expect(normalizeCatalogSlug("  Café / Galaxy A55  ")).toBe(
      "café-galaxy-a55",
    );
    expect(normalizeCatalogSlug("---Apple___Phones---")).toBe("apple-phones");
    expect(normalizeCatalogSlug("  موبائل فون لاہور  ")).toBe(
      "موبائل-فون-لاہور",
    );
    expect(normalizeCatalogSlug("موبائل فون لاہور")).not.toBe("");
  });

  it("canonicalizes aliases without discarding non-Latin text", () => {
    expect(canonicalizeCatalogAlias("  SAMSUNG   A55  ")).toBe("samsung a55");
    expect(canonicalizeCatalogAlias("  سام سنگ A55  ")).toBe("سام سنگ a55");
  });

  it("bounds Unicode-expanding derivatives to their database widths", () => {
    const expandingName = "İ".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH);
    const slug = normalizeCatalogSlug(expandingName);
    const canonicalAlias = canonicalizeCatalogAlias(expandingName);

    expect(Array.from(slug).length).toBeLessThanOrEqual(
      CATALOG_CONTRACT_LIMITS.SLUG_LENGTH,
    );
    expect(slug.endsWith("-")).toBe(false);
    expect(Array.from(canonicalAlias)).toHaveLength(
      CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH,
    );
  });

  it("normalizes SKUs and scanner whitespace in barcodes", () => {
    expect(normalizeCatalogSku(" ph samsung-a55 / navy ")).toBe(
      "PH-SAMSUNG-A55-/-NAVY",
    );
    expect(normalizeCatalogBarcode(" 8806 0954\t67890 ")).toBe("8806095467890");
  });
});

describe("catalog create contracts", () => {
  it("normalizes public category, brand and model inputs", () => {
    expect(
      CreateCategoryInputSchema.parse({
        name: "  Mobile   Phones ",
        parentCategoryId: IDS.parentCategory,
      }),
    ).toEqual({
      name: "Mobile Phones",
      parentCategoryId: IDS.parentCategory,
    });

    expect(CreateBrandInputSchema.parse({ name: "  Samsung  " })).toEqual({
      name: "Samsung",
    });

    expect(
      CreateProductModelInputSchema.parse({
        name: " Galaxy   A55 ",
        brandId: IDS.brand,
        categoryId: IDS.category,
      }),
    ).toEqual({
      name: "Galaxy A55",
      brandId: IDS.brand,
      categoryId: IDS.category,
    });
  });

  it("normalizes a public product and keeps barcode-free products valid", () => {
    expect(
      CreateProductInputSchema.parse({
        productModelId: IDS.model,
        sku: " ph-samsung-a55-256-nvy ",
        name: " Samsung   Galaxy A55 256 GB Navy ",
        trackingType: "serialized",
        condition: "new",
        ptaStatus: "pta_approved",
        ram: " 8   GB ",
        storage: " 256 GB ",
        color: " Navy ",
        region: null,
        warrantyType: "official",
        warrantyMonths: 12,
        aliases: [" A55   Navy ", "سام سنگ A55"],
      }),
    ).toEqual({
      productModelId: IDS.model,
      sku: "PH-SAMSUNG-A55-256-NVY",
      name: "Samsung Galaxy A55 256 GB Navy",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      ram: "8 GB",
      storage: "256 GB",
      color: "Navy",
      region: null,
      warrantyType: "official",
      warrantyMonths: 12,
      aliases: ["A55 Navy", "سام سنگ A55"],
      barcodes: [],
    });
  });

  it("defaults to no warranty and keeps the parsed terms consistent", () => {
    const base = {
      productModelId: IDS.model,
      sku: "ACC-CABLE-1M",
      name: "USB-C Cable 1m",
      trackingType: "quantity",
      condition: "new",
      ptaStatus: "not_applicable",
    } as const;

    expect(CreateProductInputSchema.parse(base)).toMatchObject({
      warrantyType: "none",
      aliases: [],
      barcodes: [],
    });
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        warrantyType: "none",
        warrantyMonths: 12,
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        warrantyType: "official",
        warrantyMonths: null,
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        warrantyType: "official",
        warrantyMonths: 0,
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        warrantyType: "official",
        warrantyMonths: 12,
      }).success,
    ).toBe(true);
  });

  it("normalizes inline barcodes and rejects duplicates after normalization", () => {
    const base = {
      productModelId: IDS.model,
      sku: "PH-SAMSUNG-A55-256-NVY",
      name: "Samsung Galaxy A55 256 GB Navy",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      warrantyType: "official",
      warrantyMonths: 12,
      aliases: [],
    } as const;

    expect(
      CreateProductInputSchema.parse({
        ...base,
        barcodes: [" 8806 0954 67890 "],
      }).barcodes,
    ).toEqual(["8806095467890"]);

    const duplicate = CreateProductInputSchema.safeParse({
      ...base,
      barcodes: ["8806095467890", "8806 0954 67890"],
    });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.issues[0]?.path).toEqual(["barcodes", 1]);
    }
  });

  it("rejects duplicate aliases using their canonical comparison form", () => {
    const result = CreateProductInputSchema.safeParse({
      productModelId: IDS.model,
      sku: "PH-SAMSUNG-A55-256-NVY",
      name: "Samsung Galaxy A55 256 GB Navy",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      warrantyType: "official",
      warrantyMonths: 12,
      aliases: ["Samsung A55", "  SAMSUNG   A55 "],
      barcodes: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["aliases", 1]);
    }
  });

  it("rejects invalid controlled values, SKUs and request safety overflows", () => {
    const base = {
      productModelId: IDS.model,
      sku: "PH-A55",
      name: "Galaxy A55",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      warrantyType: "official",
    };

    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        trackingType: "imei",
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({ ...base, sku: "A55 @ NAVY" })
        .success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        aliases: Array.from(
          { length: CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT + 1 },
          (_, index) => `Alias ${index}`,
        ),
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        warrantyMonths: CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS + 1,
      }).success,
    ).toBe(false);
  });

  it("accepts exact field maxima and rejects one character beyond them", () => {
    const base = {
      productModelId: IDS.model,
      sku: "S".repeat(CATALOG_CONTRACT_LIMITS.SKU_LENGTH),
      name: "N".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH),
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      ram: "R".repeat(CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH),
      warrantyType: "official",
      warrantyMonths: 12,
      aliases: ["A".repeat(CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH)],
      barcodes: ["1".repeat(CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH)],
    } as const;

    expect(CreateProductInputSchema.safeParse(base).success).toBe(true);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        name: "N".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        sku: "S".repeat(CATALOG_CONTRACT_LIMITS.SKU_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        ram: "R".repeat(CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        aliases: ["A".repeat(CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH + 1)],
      }).success,
    ).toBe(false);
    expect(
      CreateProductInputSchema.safeParse({
        ...base,
        barcodes: ["1".repeat(CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH + 1)],
      }).success,
    ).toBe(false);
  });

  it.each([
    [CreateCategoryInputSchema, { name: "Phones" }],
    [CreateBrandInputSchema, { name: "Samsung" }],
    [
      CreateProductModelInputSchema,
      { name: "Galaxy A55", brandId: IDS.brand, categoryId: IDS.category },
    ],
    [
      CreateProductInputSchema,
      {
        productModelId: IDS.model,
        sku: "PH-A55",
        name: "Galaxy A55",
        trackingType: "serialized",
        condition: "new",
        ptaStatus: "pta_approved",
        warrantyType: "official",
      },
    ],
  ])("rejects organizationId on every create boundary", (schema, input) => {
    expect(
      schema.safeParse({ ...input, organizationId: IDS.brand }).success,
    ).toBe(false);
  });

  it.each(["priceMinor", "costMinor", "stock", "imei1"])(
    "rejects the forbidden product field %s",
    (field) => {
      const result = CreateProductInputSchema.safeParse({
        productModelId: IDS.model,
        sku: "PH-A55",
        name: "Galaxy A55",
        trackingType: "serialized",
        condition: "new",
        ptaStatus: "pta_approved",
        warrantyType: "official",
        [field]: field === "stock" ? 2 : "must-not-cross-this-boundary",
      });
      expect(result.success).toBe(false);
    },
  );
});

describe("catalog version transition contract", () => {
  it("accepts the version the editor actually saw", () => {
    expect(CatalogVersionInputSchema.parse({ version: 1 })).toEqual({
      version: 1,
    });
    expect(CatalogVersionInputSchema.parse({ version: 42 })).toEqual({
      version: 42,
    });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["string", "1"],
    ["null", null],
  ])("rejects a %s version", (_label, version) => {
    expect(CatalogVersionInputSchema.safeParse({ version }).success).toBe(
      false,
    );
  });

  it("requires version and refuses to carry anything else", () => {
    expect(CatalogVersionInputSchema.safeParse({}).success).toBe(false);
    expect(
      CatalogVersionInputSchema.safeParse({ version: 1, isActive: false })
        .success,
    ).toBe(false);
    expect(
      CatalogVersionInputSchema.safeParse({ version: 1, id: IDS.category })
        .success,
    ).toBe(false);
  });
});

describe("catalog update contracts", () => {
  it("normalizes update names exactly like their create counterparts", () => {
    expect(
      UpdateCategoryInputSchema.parse({
        ...updateCategoryFixture,
        name: "  Mobile   Phones ",
      }),
    ).toEqual({
      name: "Mobile Phones",
      parentCategoryId: IDS.parentCategory,
      version: 1,
    });

    expect(
      UpdateBrandInputSchema.parse({
        ...updateBrandFixture,
        name: "  Samsung  ",
      }),
    ).toEqual({ name: "Samsung", version: 1 });

    expect(
      UpdateProductModelInputSchema.parse({
        ...updateProductModelFixture,
        name: " Galaxy   A55 ",
      }),
    ).toEqual({
      name: "Galaxy A55",
      brandId: IDS.brand,
      categoryId: IDS.category,
      version: 1,
    });
  });

  it("applies NFKC folding to update names", () => {
    expect(
      UpdateCategoryInputSchema.parse({
        ...updateCategoryFixture,
        name: "Ｍｏｂｉｌｅ　Ｐｈｏｎｅｓ",
      }).name,
    ).toBe("Mobile Phones");
    expect(
      UpdateBrandInputSchema.parse({
        ...updateBrandFixture,
        name: "  سام   سنگ  ",
      }).name,
    ).toBe("سام سنگ");
  });

  it("treats parentCategoryId as required-but-nullable so a move to root is deliberate", () => {
    expect(
      UpdateCategoryInputSchema.parse({
        ...updateCategoryFixture,
        parentCategoryId: null,
      }),
    ).toEqual({ name: "Smartphones", parentCategoryId: null, version: 1 });

    // Replace semantics: an omitted parent must never be read as "unchanged".
    expect(
      UpdateCategoryInputSchema.safeParse(
        withoutField(updateCategoryFixture, "parentCategoryId"),
      ).success,
    ).toBe(false);
    expect(
      UpdateCategoryInputSchema.safeParse({
        ...updateCategoryFixture,
        parentCategoryId: undefined,
      }).success,
    ).toBe(false);
    expect(
      UpdateCategoryInputSchema.safeParse({
        ...updateCategoryFixture,
        parentCategoryId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      "UpdateCategoryInputSchema",
      UpdateCategoryInputSchema,
      updateCategoryFixture,
    ],
    ["UpdateBrandInputSchema", UpdateBrandInputSchema, updateBrandFixture],
    [
      "UpdateProductModelInputSchema",
      UpdateProductModelInputSchema,
      updateProductModelFixture,
    ],
    [
      "UpdateProductInputSchema",
      UpdateProductInputSchema,
      updateProductFixture,
    ],
  ])("%s requires a positive integer version", (_label, schema, fixture) => {
    expect(schema.safeParse(fixture).success).toBe(true);
    expect(schema.safeParse(withoutField(fixture, "version")).success).toBe(
      false,
    );
    for (const version of [0, -1, 1.5, "1", null]) {
      expect(schema.safeParse({ ...fixture, version }).success).toBe(false);
    }
  });

  it.each([
    [
      "UpdateCategoryInputSchema",
      UpdateCategoryInputSchema,
      updateCategoryFixture,
    ],
    ["UpdateBrandInputSchema", UpdateBrandInputSchema, updateBrandFixture],
    [
      "UpdateProductModelInputSchema",
      UpdateProductModelInputSchema,
      updateProductModelFixture,
    ],
    [
      "UpdateProductInputSchema",
      UpdateProductInputSchema,
      updateProductFixture,
    ],
  ])("%s rejects unknown keys", (_label, schema, fixture) => {
    expect(
      schema.safeParse(withExtraField(fixture, "isActive", false)).success,
    ).toBe(false);
    expect(
      schema.safeParse(withExtraField(fixture, "id", IDS.brand)).success,
    ).toBe(false);
    expect(
      schema.safeParse(withExtraField(fixture, "slug", "smartphones")).success,
    ).toBe(false);
  });

  it("requires the identity fields the update replaces", () => {
    expect(
      UpdateBrandInputSchema.safeParse(withoutField(updateBrandFixture, "name"))
        .success,
    ).toBe(false);
    expect(
      UpdateProductModelInputSchema.safeParse(
        withoutField(updateProductModelFixture, "brandId"),
      ).success,
    ).toBe(false);
    expect(
      UpdateProductModelInputSchema.safeParse(
        withoutField(updateProductModelFixture, "categoryId"),
      ).success,
    ).toBe(false);
    expect(
      UpdateProductModelInputSchema.safeParse({
        ...updateProductModelFixture,
        brandId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse(
        withoutField(updateProductFixture, "productModelId"),
      ).success,
    ).toBe(false);
    expect(
      UpdateBrandInputSchema.safeParse({ ...updateBrandFixture, name: "   " })
        .success,
    ).toBe(false);
    expect(
      UpdateBrandInputSchema.safeParse({
        ...updateBrandFixture,
        name: "N".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe("product update contract mirrors create", () => {
  it("normalizes the same product identity as create and keeps version", () => {
    expect(
      UpdateProductInputSchema.parse({
        productModelId: IDS.model,
        sku: " ph samsung-a55 256 nvy ",
        name: " Samsung   Galaxy A55 256 GB Navy ",
        trackingType: "serialized",
        condition: "new",
        ptaStatus: "pta_approved",
        ram: " 8   GB ",
        storage: " 256 GB ",
        color: " Navy ",
        region: null,
        warrantyType: "official",
        warrantyMonths: 12,
        aliases: [" A55   Navy ", "سام سنگ A55"],
        barcodes: [" 8806 0954 67890 "],
        version: 3,
      }),
    ).toEqual({
      productModelId: IDS.model,
      sku: "PH-SAMSUNG-A55-256-NVY",
      name: "Samsung Galaxy A55 256 GB Navy",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      ram: "8 GB",
      storage: "256 GB",
      color: "Navy",
      region: null,
      warrantyType: "official",
      warrantyMonths: 12,
      aliases: ["A55 Navy", "سام سنگ A55"],
      barcodes: ["8806095467890"],
      version: 3,
    });
  });

  it("defaults warranty, aliases and barcodes exactly like create", () => {
    expect(
      UpdateProductInputSchema.parse({
        productModelId: IDS.model,
        sku: "ACC-CABLE-1M",
        name: "USB-C Cable 1m",
        trackingType: "quantity",
        condition: "new",
        ptaStatus: "not_applicable",
        version: 2,
      }),
    ).toMatchObject({
      warrantyType: "none",
      aliases: [],
      barcodes: [],
      version: 2,
    });
  });

  it("enforces the warranty cross-field rule in both directions", () => {
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        warrantyType: "none",
        warrantyMonths: 12,
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        warrantyType: "official",
        warrantyMonths: null,
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse(
        withoutField(
          { ...updateProductFixture, warrantyType: "official" },
          "warrantyMonths",
        ),
      ).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        warrantyType: "none",
        warrantyMonths: null,
      }).success,
    ).toBe(true);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        warrantyMonths: CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS,
      }).success,
    ).toBe(true);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        warrantyMonths: CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS + 1,
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        warrantyMonths: 0,
      }).success,
    ).toBe(false);
  });

  it("detects duplicate aliases and barcodes in the desired end state", () => {
    const duplicateAliases = UpdateProductInputSchema.safeParse({
      ...updateProductFixture,
      aliases: ["Samsung A55", "  SAMSUNG   A55 "],
    });
    expect(duplicateAliases.success).toBe(false);
    if (!duplicateAliases.success) {
      expect(duplicateAliases.error.issues[0]?.path).toEqual(["aliases", 1]);
    }

    const duplicateBarcodes = UpdateProductInputSchema.safeParse({
      ...updateProductFixture,
      barcodes: ["8806095467890", "8806 0954 67890"],
    });
    expect(duplicateBarcodes.success).toBe(false);
    if (!duplicateBarcodes.success) {
      expect(duplicateBarcodes.error.issues[0]?.path).toEqual(["barcodes", 1]);
    }
  });

  it("normalizes SKUs to upper case with hyphenated whitespace", () => {
    expect(
      UpdateProductInputSchema.parse({
        ...updateProductFixture,
        sku: "  ph samsung a55  ",
      }).sku,
    ).toBe("PH-SAMSUNG-A55");
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        sku: "A55 @ NAVY",
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        sku: "   ",
      }).success,
    ).toBe(false);
  });

  it("bounds alias and barcode counts and lengths like create", () => {
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        aliases: Array.from(
          { length: CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT },
          (_, index) => `Alias ${index}`,
        ),
      }).success,
    ).toBe(true);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        aliases: Array.from(
          { length: CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT + 1 },
          (_, index) => `Alias ${index}`,
        ),
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        barcodes: Array.from(
          { length: CATALOG_CONTRACT_LIMITS.MAX_BARCODES_PER_PRODUCT },
          (_, index) => `88060954678${String(index).padStart(2, "0")}`,
        ),
      }).success,
    ).toBe(true);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        barcodes: Array.from(
          { length: CATALOG_CONTRACT_LIMITS.MAX_BARCODES_PER_PRODUCT + 1 },
          (_, index) => `88060954678${String(index).padStart(2, "0")}`,
        ),
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        aliases: ["A".repeat(CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH + 1)],
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        barcodes: ["1".repeat(CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH + 1)],
      }).success,
    ).toBe(false);
  });

  it("rejects controlled values outside the confirmed enums", () => {
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        trackingType: "imei",
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        condition: "refurbished_grade_z",
      }).success,
    ).toBe(false);
    expect(
      UpdateProductInputSchema.safeParse({
        ...updateProductFixture,
        ptaStatus: "maybe",
      }).success,
    ).toBe(false);
  });
});

describe("catalog update boundaries reject tenant and financial smuggling", () => {
  const boundaries = [
    ["CatalogVersionInputSchema", CatalogVersionInputSchema, { version: 1 }],
    [
      "UpdateCategoryInputSchema",
      UpdateCategoryInputSchema,
      updateCategoryFixture,
    ],
    ["UpdateBrandInputSchema", UpdateBrandInputSchema, updateBrandFixture],
    [
      "UpdateProductModelInputSchema",
      UpdateProductModelInputSchema,
      updateProductModelFixture,
    ],
    [
      "UpdateProductInputSchema",
      UpdateProductInputSchema,
      updateProductFixture,
    ],
  ] as const;

  const cases = boundaries.flatMap(([label, schema, fixture]) =>
    FORBIDDEN_INPUT_FIELDS.map(
      (field) => [label, field, schema, fixture] as const,
    ),
  );

  it.each(cases)("%s rejects %s", (_label, field, schema, fixture) => {
    expect(
      schema.safeParse(
        withExtraField(fixture, field, "must-not-cross-this-boundary"),
      ).success,
    ).toBe(false);
    expect(schema.safeParse(withExtraField(fixture, field, 1)).success).toBe(
      false,
    );
  });
});

describe("catalog list queries", () => {
  it("applies bounded pagination defaults", () => {
    expect(ProductListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
    });
    expect(
      ProductListQuerySchema.parse({ page: "2", pageSize: "100" }),
    ).toEqual({ page: 2, pageSize: 100 });
    expect(ProductListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(
      false,
    );
    expect(ProductListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("normalizes search and safely parses boolean query values", () => {
    expect(
      ProductListQuerySchema.parse({ q: "  galaxy   a55 ", active: "false" }),
    ).toEqual({ page: 1, pageSize: 25, q: "galaxy a55", active: false });
    expect(ProductListQuerySchema.parse({ q: "   ", active: "1" })).toEqual({
      page: 1,
      pageSize: 25,
      active: true,
    });
    expect(ProductListQuerySchema.safeParse({ active: "yes" }).success).toBe(
      false,
    );
    expect(
      ProductListQuerySchema.safeParse({
        q: "x".repeat(CATALOG_CONTRACT_LIMITS.NAME_LENGTH),
      }).success,
    ).toBe(false);
  });

  it("accepts only the confirmed product filters", () => {
    expect(
      ProductListQuerySchema.parse({
        brandId: IDS.brand,
        categoryId: IDS.category,
        trackingType: "serialized",
        condition: "open_box",
        ptaStatus: "non_pta",
      }),
    ).toEqual({
      page: 1,
      pageSize: 25,
      brandId: IDS.brand,
      categoryId: IDS.category,
      trackingType: "serialized",
      condition: "open_box",
      ptaStatus: "non_pta",
    });

    expect(
      ProductListQuerySchema.safeParse({ organizationId: IDS.brand }).success,
    ).toBe(false);
    expect(
      ProductListQuerySchema.safeParse({ trackingType: "imei" }).success,
    ).toBe(false);
  });

  it("keeps category, brand and model query surfaces narrow", () => {
    expect(CategoryListQuerySchema.parse({ q: "phones" })).toEqual({
      page: 1,
      pageSize: 25,
      q: "phones",
    });
    expect(BrandListQuerySchema.parse({ active: "0" }).active).toBe(false);
    expect(
      ProductModelListQuerySchema.parse({
        brandId: IDS.brand,
        categoryId: IDS.category,
      }),
    ).toMatchObject({ brandId: IDS.brand, categoryId: IDS.category });
    expect(
      CategoryListQuerySchema.safeParse({ brandId: IDS.brand }).success,
    ).toBe(false);
    expect(
      BrandListQuerySchema.safeParse({ trackingType: "serialized" }).success,
    ).toBe(false);
  });
});

describe("public catalog responses", () => {
  it("accepts the exact category, brand, model and product shapes", () => {
    expect(CategoryReferenceSchema.parse(categoryFixture)).toEqual(
      categoryFixture,
    );
    expect(BrandReferenceSchema.parse(brandFixture)).toEqual(brandFixture);
    expect(ProductModelReferenceSchema.parse(productModelFixture)).toEqual(
      productModelFixture,
    );
    expect(ProductSummarySchema.parse(productFixture)).toEqual(productFixture);
  });

  it("supports nullable public product attributes", () => {
    const accessory = {
      ...productFixture,
      trackingType: "quantity",
      ptaStatus: "not_applicable",
      ram: null,
      storage: null,
      color: null,
      region: null,
      warrantyType: "none",
      warrantyMonths: null,
    };
    expect(ProductSummarySchema.parse(accessory)).toEqual(accessory);
  });

  it.each([
    ["organizationId", IDS.brand],
    ["priceMinor", 12_000_000],
    ["costMinor", 10_000_000],
    ["stock", { available: 2 }],
    ["imei1", "356938035643809"],
  ])("rejects leaked product response field %s", (field, value) => {
    expect(
      ProductSummarySchema.safeParse(
        withExtraField(productFixture, field, value),
      ).success,
    ).toBe(false);
  });

  it("rejects leaked fields at nested and reference response boundaries", () => {
    expect(
      CategoryReferenceSchema.safeParse({
        ...categoryFixture,
        organizationId: IDS.brand,
      }).success,
    ).toBe(false);
    expect(
      BrandReferenceSchema.safeParse({ ...brandFixture, costMinor: 1 }).success,
    ).toBe(false);
    expect(
      ProductModelReferenceSchema.safeParse({
        ...productModelFixture,
        sku: "NOT-A-MODEL-FIELD",
      }).success,
    ).toBe(false);
    expect(
      ProductSummarySchema.safeParse({
        ...productFixture,
        productModel: {
          ...productFixture.productModel,
          brand: {
            ...productFixture.productModel.brand,
            organizationId: IDS.brand,
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects malformed public values", () => {
    expect(
      ProductSummarySchema.safeParse({
        ...productFixture,
        sku: "lowercase-sku",
      }).success,
    ).toBe(false);
    expect(
      ProductSummarySchema.safeParse({
        ...productFixture,
        createdAt: "16 July 2026",
      }).success,
    ).toBe(false);
    expect(
      ProductSummarySchema.safeParse({
        ...productFixture,
        warrantyType: "none",
        warrantyMonths: 12,
      }).success,
    ).toBe(false);
    expect(
      ProductSummarySchema.safeParse({
        ...productFixture,
        warrantyType: "official",
        warrantyMonths: null,
      }).success,
    ).toBe(false);
  });
});

describe("catalog response optimistic-locking token", () => {
  it.each([
    ["CategoryReferenceSchema", CategoryReferenceSchema, categoryFixture],
    ["BrandReferenceSchema", BrandReferenceSchema, brandFixture],
    [
      "ProductModelReferenceSchema",
      ProductModelReferenceSchema,
      productModelFixture,
    ],
    ["ProductSummarySchema", ProductSummarySchema, productFixture],
    ["ProductDetailSchema", ProductDetailSchema, productDetailFixture],
  ])("%s requires a positive integer version", (_label, schema, fixture) => {
    expect(schema.safeParse(fixture).success).toBe(true);
    expect(schema.safeParse(withoutField(fixture, "version")).success).toBe(
      false,
    );
    for (const version of [0, -1, 1.5, "1", null]) {
      expect(schema.safeParse({ ...fixture, version }).success).toBe(false);
    }
    expect(schema.safeParse({ ...fixture, version: 7 }).success).toBe(true);
  });
});

describe("category reference ancestry", () => {
  it("rejects a category that claims to be its own parent", () => {
    const result = CategoryReferenceSchema.safeParse({
      ...categoryFixture,
      parentCategoryId: categoryFixture.id,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["parentCategoryId"]);
    }
  });

  it("still accepts a root category and a distinct parent", () => {
    expect(
      CategoryReferenceSchema.parse({
        ...categoryFixture,
        parentCategoryId: null,
      }).parentCategoryId,
    ).toBeNull();
    expect(
      CategoryReferenceSchema.parse(categoryFixture).parentCategoryId,
    ).toBe(IDS.parentCategory);
  });
});

describe("product alias and barcode response entries", () => {
  it("accepts the exact alias and barcode shapes", () => {
    expect(ProductAliasSchema.parse(aliasFixture)).toEqual(aliasFixture);
    expect(ProductBarcodeSchema.parse(barcodeFixture)).toEqual(barcodeFixture);
  });

  it("bounds alias length and requires a real identifier", () => {
    expect(
      ProductAliasSchema.safeParse({
        ...aliasFixture,
        alias: "A".repeat(CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      ProductAliasSchema.safeParse({
        ...aliasFixture,
        alias: "A".repeat(CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      ProductAliasSchema.safeParse({ ...aliasFixture, alias: "" }).success,
    ).toBe(false);
    expect(
      ProductAliasSchema.safeParse({ ...aliasFixture, id: "not-a-uuid" })
        .success,
    ).toBe(false);
    expect(
      ProductAliasSchema.safeParse(withoutField(aliasFixture, "id")).success,
    ).toBe(false);
  });

  it("bounds barcode length and enforces the printable-ASCII form", () => {
    expect(
      ProductBarcodeSchema.safeParse({
        ...barcodeFixture,
        barcode: "1".repeat(CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      ProductBarcodeSchema.safeParse({
        ...barcodeFixture,
        barcode: "1".repeat(CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      ProductBarcodeSchema.safeParse({ ...barcodeFixture, barcode: "" })
        .success,
    ).toBe(false);
    expect(
      ProductBarcodeSchema.safeParse({
        ...barcodeFixture,
        barcode: "8806 0954 67890",
      }).success,
    ).toBe(false);
    expect(
      ProductBarcodeSchema.safeParse({
        ...barcodeFixture,
        barcode: "سام سنگ",
      }).success,
    ).toBe(false);
    expect(
      ProductBarcodeSchema.safeParse(withoutField(barcodeFixture, "isPrimary"))
        .success,
    ).toBe(false);
  });

  it("keeps the alias and barcode surfaces strict", () => {
    expect(
      ProductAliasSchema.safeParse(
        withExtraField(aliasFixture, "isActive", true),
      ).success,
    ).toBe(false);
    expect(
      ProductAliasSchema.safeParse(
        withExtraField(aliasFixture, "normalizedAlias", "a55 navy"),
      ).success,
    ).toBe(false);
    expect(
      ProductBarcodeSchema.safeParse(
        withExtraField(barcodeFixture, "isActive", true),
      ).success,
    ).toBe(false);
    expect(
      ProductBarcodeSchema.safeParse(
        withExtraField(barcodeFixture, "organizationId", IDS.brand),
      ).success,
    ).toBe(false);
  });
});

describe("product detail response", () => {
  it("accepts a full detail with its active aliases and barcodes", () => {
    expect(ProductDetailSchema.parse(productDetailFixture)).toEqual(
      productDetailFixture,
    );
  });

  it("accepts a detail with no aliases and no barcodes", () => {
    const bare = { ...productDetailFixture, aliases: [], barcodes: [] };
    expect(ProductDetailSchema.parse(bare)).toEqual(bare);
  });

  it("accepts aliases without barcodes and barcodes without aliases", () => {
    expect(
      ProductDetailSchema.safeParse({ ...productDetailFixture, barcodes: [] })
        .success,
    ).toBe(true);
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        aliases: [],
        barcodes: [barcodeFixture],
      }).success,
    ).toBe(true);
  });

  it("rejects more than one primary barcode", () => {
    const result = ProductDetailSchema.safeParse({
      ...productDetailFixture,
      barcodes: [
        barcodeFixture,
        { ...secondaryBarcodeFixture, isPrimary: true },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["barcodes"]);
    }
  });

  it("rejects barcodes with no primary among them", () => {
    const result = ProductDetailSchema.safeParse({
      ...productDetailFixture,
      barcodes: [
        { ...barcodeFixture, isPrimary: false },
        secondaryBarcodeFixture,
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["barcodes"]);
    }
  });

  it("enforces the warranty cross-field rule on detail responses", () => {
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        warrantyType: "none",
        warrantyMonths: 12,
      }).success,
    ).toBe(false);
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        warrantyType: "official",
        warrantyMonths: null,
      }).success,
    ).toBe(false);
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        warrantyType: "none",
        warrantyMonths: null,
      }).success,
    ).toBe(true);
  });

  it("bounds the alias and barcode collections it will serve", () => {
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        aliases: Array.from(
          { length: CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT + 1 },
          (_, index) => ({ ...aliasFixture, alias: `Alias ${index}` }),
        ),
      }).success,
    ).toBe(false);
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        barcodes: Array.from(
          { length: CATALOG_CONTRACT_LIMITS.MAX_BARCODES_PER_PRODUCT + 1 },
          (_, index) => ({
            ...secondaryBarcodeFixture,
            barcode: `88060954678${String(index).padStart(2, "0")}`,
            isPrimary: index === 0,
          }),
        ),
      }).success,
    ).toBe(false);
  });

  it("requires the alias and barcode collections to be present", () => {
    expect(
      ProductDetailSchema.safeParse(
        withoutField(productDetailFixture, "aliases"),
      ).success,
    ).toBe(false);
    expect(
      ProductDetailSchema.safeParse(
        withoutField(productDetailFixture, "barcodes"),
      ).success,
    ).toBe(false);
  });

  it.each(FORBIDDEN_INPUT_FIELDS)(
    "rejects the leaked detail field %s",
    (field) => {
      expect(
        ProductDetailSchema.safeParse(
          withExtraField(productDetailFixture, field, 1),
        ).success,
      ).toBe(false);
    },
  );

  it("rejects leaked device identifiers and nested extras on detail", () => {
    expect(
      ProductDetailSchema.safeParse(
        withExtraField(productDetailFixture, "imei1", "356938035643809"),
      ).success,
    ).toBe(false);
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        barcodes: [withExtraField(barcodeFixture, "costMinor", 10_000_000)],
      }).success,
    ).toBe(false);
    expect(
      ProductDetailSchema.safeParse({
        ...productDetailFixture,
        aliases: [withExtraField(aliasFixture, "organizationId", IDS.brand)],
      }).success,
    ).toBe(false);
  });
});

describe("catalog page envelopes", () => {
  it("accepts the confirmed flat envelope for every response family", () => {
    expect(
      CategoryPageSchema.parse({
        items: [categoryFixture],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      }).items,
    ).toEqual([categoryFixture]);
    expect(
      BrandPageSchema.parse({
        items: [brandFixture],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      }).items,
    ).toEqual([brandFixture]);
    expect(
      ProductModelPageSchema.parse({
        items: [productModelFixture],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      }).items,
    ).toEqual([productModelFixture]);
    expect(
      ProductSummaryPageSchema.parse({
        items: [productFixture],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      }).items,
    ).toEqual([productFixture]);
  });

  it("accepts an empty page with zero total pages", () => {
    expect(
      ProductSummaryPageSchema.parse({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      }),
    ).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  });

  it("rejects inconsistent totals, oversized pages and envelope extras", () => {
    expect(
      ProductSummaryPageSchema.safeParse({
        items: [],
        page: 1,
        pageSize: 25,
        total: 26,
        totalPages: 1,
      }).success,
    ).toBe(false);
    expect(
      ProductSummaryPageSchema.safeParse({
        items: [],
        page: 1,
        pageSize: 101,
        total: 0,
        totalPages: 0,
      }).success,
    ).toBe(false);
    expect(
      ProductSummaryPageSchema.safeParse({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
        costTotalMinor: 0,
      }).success,
    ).toBe(false);
  });
});
