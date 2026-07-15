import { describe, expect, it } from "vitest";
import {
  BrandListQuerySchema,
  BrandPageSchema,
  BrandReferenceSchema,
  CATALOG_CONTRACT_LIMITS,
  CategoryListQuerySchema,
  CategoryPageSchema,
  CategoryReferenceSchema,
  CreateBrandInputSchema,
  CreateCategoryInputSchema,
  CreateProductInputSchema,
  CreateProductModelInputSchema,
  ProductListQuerySchema,
  ProductModelListQuerySchema,
  ProductModelPageSchema,
  ProductModelReferenceSchema,
  ProductSummaryPageSchema,
  ProductSummarySchema,
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
} as const;

const brandFixture = {
  id: IDS.brand,
  name: "Samsung",
  isActive: true,
} as const;

const productModelFixture = {
  id: IDS.model,
  name: "Galaxy A55",
  brandId: IDS.brand,
  brandName: "Samsung",
  categoryId: IDS.category,
  categoryName: "Smartphones",
  isActive: true,
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
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
} as const;

function withExtraField<T extends object>(
  value: T,
  key: string,
  extraValue: unknown,
): T & Record<string, unknown> {
  return { ...value, [key]: extraValue };
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
