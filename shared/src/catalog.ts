import { z } from "zod";
import { LIMITS, PAGINATION } from "./constants";
import {
  PRODUCT_CONDITIONS,
  PTA_STATUSES,
  TRACKING_TYPES,
  WARRANTY_TYPES,
} from "./enums";

/**
 * Public catalog contracts shared by the browser and API.
 *
 * Tenant scope is always taken from the authenticated server context. These
 * strict schemas intentionally have no organization, price, cost, stock or
 * device-identifier fields, so those values cannot be smuggled through a
 * catalog request or leaked through a catalog response.
 */

export const CATALOG_CONTRACT_LIMITS = Object.freeze({
  NAME_LENGTH: 200,
  SLUG_LENGTH: 220,
  SKU_LENGTH: 100,
  ATTRIBUTE_LENGTH: 100,
  ALIAS_LENGTH: 200,
  BARCODE_LENGTH: 128,
  MAX_ALIASES_PER_PRODUCT: 50,
  MAX_BARCODES_PER_PRODUCT: 20,
  MAX_WARRANTY_MONTHS: 120,
});

function truncateUnicode(value: string, maximumCodePoints: number): string {
  return Array.from(value).slice(0, maximumCodePoints).join("");
}

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

/** Unicode-preserving, separator-stable slug suitable for local catalog names. */
export function normalizeCatalogSlug(value: string): string {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  // Unicode case folding can expand one display character into multiple code
  // points (for example, capital dotted I). Bound the persisted derivative,
  // not the user-facing name, so every schema-valid input fits PostgreSQL.
  return truncateUnicode(slug, CATALOG_CONTRACT_LIMITS.SLUG_LENGTH).replace(
    /-+$/g,
    "",
  );
}

/** Canonical comparison form; the display alias itself remains unchanged. */
export function canonicalizeCatalogAlias(value: string): string {
  return truncateUnicode(
    normalizeDisplayText(value).toLocaleLowerCase("en-US"),
    CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH,
  );
}

/** The database requires upper-case SKUs; whitespace is represented by `-`. */
export function normalizeCatalogSku(value: string): string {
  return normalizeDisplayText(value).replace(/\s+/g, "-").toUpperCase();
}

/** Scanner whitespace is not part of a barcode's identity. */
export function normalizeCatalogBarcode(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

const requiredNameInputSchema = z
  .string()
  .transform(normalizeDisplayText)
  .pipe(
    z
      .string()
      .min(1, "Enter a name.")
      .max(
        CATALOG_CONTRACT_LIMITS.NAME_LENGTH,
        `Name must be ${CATALOG_CONTRACT_LIMITS.NAME_LENGTH} characters or fewer.`,
      ),
  );

const optionalAttributeInputSchema = z
  .string()
  .transform(normalizeDisplayText)
  .pipe(
    z
      .string()
      .min(1, "Attribute cannot be blank.")
      .max(
        CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH,
        `Attribute must be ${CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH} characters or fewer.`,
      ),
  )
  .nullable()
  .optional();

const skuInputSchema = z
  .string()
  .transform(normalizeCatalogSku)
  .pipe(
    z
      .string()
      .min(1, "Enter an SKU.")
      .max(
        CATALOG_CONTRACT_LIMITS.SKU_LENGTH,
        `SKU must be ${CATALOG_CONTRACT_LIMITS.SKU_LENGTH} characters or fewer.`,
      )
      .regex(
        /^[A-Z0-9][A-Z0-9._/-]*$/,
        "SKU may contain only letters, numbers, dots, underscores, slashes and hyphens.",
      ),
  );

const aliasInputSchema = z
  .string()
  .transform(normalizeDisplayText)
  .pipe(
    z
      .string()
      .min(1, "Alias cannot be blank.")
      .max(
        CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH,
        `Alias must be ${CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH} characters or fewer.`,
      ),
  );

const barcodeInputSchema = z
  .string()
  .transform(normalizeCatalogBarcode)
  .pipe(
    z
      .string()
      .min(1, "Barcode cannot be blank.")
      .max(
        CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH,
        `Barcode must be ${CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH} characters or fewer.`,
      )
      .regex(/^[\x21-\x7E]+$/, "Barcode contains unsupported characters."),
  );

/**
 * Optimistic concurrency token. Every catalog mutation that changes an existing
 * row carries the version the editor actually saw, so a concurrent edit fails
 * loudly with OPTIMISTIC_LOCK_FAILED instead of silently overwriting.
 */
const versionInputSchema = z
  .number()
  .int()
  .positive("Provide the record version you are editing.");

/** Body of the deactivate/reactivate transitions; identity comes from the path. */
export const CatalogVersionInputSchema = z
  .object({ version: versionInputSchema })
  .strict();
export type CatalogVersionInput = z.input<typeof CatalogVersionInputSchema>;
export type CatalogVersionData = z.output<typeof CatalogVersionInputSchema>;

export const CreateCategoryInputSchema = z
  .object({
    name: requiredNameInputSchema,
    parentCategoryId: z.uuid().nullable().optional(),
  })
  .strict();

export type CreateCategoryInput = z.input<typeof CreateCategoryInputSchema>;
export type CreateCategoryData = z.output<typeof CreateCategoryInputSchema>;

/**
 * Updates replace the whole editable identity rather than patching single
 * fields, so an omitted key can never be read as "leave unchanged" by one side
 * and "clear it" by the other. `parentCategoryId` is required-but-nullable for
 * exactly that reason: moving a subcategory to the root must be deliberate.
 */
export const UpdateCategoryInputSchema = z
  .object({
    name: requiredNameInputSchema,
    parentCategoryId: z.uuid().nullable(),
    version: versionInputSchema,
  })
  .strict();

export type UpdateCategoryInput = z.input<typeof UpdateCategoryInputSchema>;
export type UpdateCategoryData = z.output<typeof UpdateCategoryInputSchema>;

export const CreateBrandInputSchema = z
  .object({
    name: requiredNameInputSchema,
  })
  .strict();

export type CreateBrandInput = z.input<typeof CreateBrandInputSchema>;
export type CreateBrandData = z.output<typeof CreateBrandInputSchema>;

export const UpdateBrandInputSchema = z
  .object({
    name: requiredNameInputSchema,
    version: versionInputSchema,
  })
  .strict();

export type UpdateBrandInput = z.input<typeof UpdateBrandInputSchema>;
export type UpdateBrandData = z.output<typeof UpdateBrandInputSchema>;

export const CreateProductModelInputSchema = z
  .object({
    name: requiredNameInputSchema,
    brandId: z.uuid(),
    categoryId: z.uuid(),
  })
  .strict();

export type CreateProductModelInput = z.input<
  typeof CreateProductModelInputSchema
>;
export type CreateProductModelData = z.output<
  typeof CreateProductModelInputSchema
>;

export const UpdateProductModelInputSchema = z
  .object({
    name: requiredNameInputSchema,
    brandId: z.uuid(),
    categoryId: z.uuid(),
    version: versionInputSchema,
  })
  .strict();

export type UpdateProductModelInput = z.input<
  typeof UpdateProductModelInputSchema
>;
export type UpdateProductModelData = z.output<
  typeof UpdateProductModelInputSchema
>;

const productInputShape = {
  productModelId: z.uuid(),
  sku: skuInputSchema,
  name: requiredNameInputSchema,
  trackingType: z.enum(TRACKING_TYPES),
  condition: z.enum(PRODUCT_CONDITIONS),
  ptaStatus: z.enum(PTA_STATUSES),
  ram: optionalAttributeInputSchema,
  storage: optionalAttributeInputSchema,
  color: optionalAttributeInputSchema,
  region: optionalAttributeInputSchema,
  warrantyType: z.enum(WARRANTY_TYPES).default("none"),
  warrantyMonths: z
    .number()
    .int()
    .positive()
    .max(CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS)
    .nullable()
    .optional(),
  aliases: z
    .array(aliasInputSchema)
    .max(CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT)
    .default([]),
  barcodes: z
    .array(barcodeInputSchema)
    .max(CATALOG_CONTRACT_LIMITS.MAX_BARCODES_PER_PRODUCT)
    .default([]),
};

interface ProductInputInvariants {
  readonly warrantyType: (typeof WARRANTY_TYPES)[number];
  readonly warrantyMonths?: number | null | undefined;
  readonly aliases: readonly string[];
  readonly barcodes: readonly string[];
}

/** Create and update accept the same identity, so they share one refinement. */
function refineProductInput(
  product: ProductInputInvariants,
  context: z.RefinementCtx,
): void {
  if (
    product.warrantyType === "none" &&
    product.warrantyMonths !== undefined &&
    product.warrantyMonths !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "A product without warranty cannot have warranty months.",
      path: ["warrantyMonths"],
    });
  }
  if (
    product.warrantyType !== "none" &&
    (product.warrantyMonths === undefined || product.warrantyMonths === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "Enter warranty months for this warranty type.",
      path: ["warrantyMonths"],
    });
  }

  const aliases = new Map<string, number>();
  product.aliases.forEach((alias, index) => {
    const canonical = canonicalizeCatalogAlias(alias);
    const firstIndex = aliases.get(canonical);
    if (firstIndex !== undefined) {
      context.addIssue({
        code: "custom",
        message: `Alias duplicates item ${firstIndex + 1}.`,
        path: ["aliases", index],
      });
    } else {
      aliases.set(canonical, index);
    }
  });

  const barcodes = new Map<string, number>();
  product.barcodes.forEach((barcode, index) => {
    const firstIndex = barcodes.get(barcode);
    if (firstIndex !== undefined) {
      context.addIssue({
        code: "custom",
        message: `Barcode duplicates item ${firstIndex + 1}.`,
        path: ["barcodes", index],
      });
    } else {
      barcodes.set(barcode, index);
    }
  });
}

export const CreateProductInputSchema = z
  .object(productInputShape)
  .strict()
  .superRefine(refineProductInput);

export type CreateProductInput = z.input<typeof CreateProductInputSchema>;
export type CreateProductData = z.output<typeof CreateProductInputSchema>;

/**
 * `trackingType` is accepted so the caller round-trips the value it saw, but the
 * server rejects any actual change with CATALOG_TRACKING_TYPE_LOCKED: switching
 * a variant between serialized and quantity tracking is a migration, not an
 * edit (05_RULES §2). Aliases and barcodes are the desired end state — the
 * server diffs them against the stored rows.
 */
export const UpdateProductInputSchema = z
  .object({ ...productInputShape, version: versionInputSchema })
  .strict()
  .superRefine(refineProductInput);

export type UpdateProductInput = z.input<typeof UpdateProductInputSchema>;
export type UpdateProductData = z.output<typeof UpdateProductInputSchema>;

const pageInputSchema = z.coerce
  .number()
  .int()
  .positive()
  .default(PAGINATION.DEFAULT_PAGE);

const pageSizeInputSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(PAGINATION.MAX_PAGE_SIZE)
  .default(PAGINATION.DEFAULT_PAGE_SIZE);

const optionalSearchInputSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = normalizeDisplayText(value);
  return normalized.length === 0 ? undefined : normalized;
}, z.string().max(LIMITS.MAX_SEARCH_TERM_LENGTH).optional());

const optionalQueryBooleanSchema = z.preprocess((value) => {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}, z.boolean().optional());

const baseListQueryFields = {
  page: pageInputSchema,
  pageSize: pageSizeInputSchema,
  q: optionalSearchInputSchema,
  active: optionalQueryBooleanSchema,
};

export const CategoryListQuerySchema = z.object(baseListQueryFields).strict();
export type CategoryListQueryInput = z.input<typeof CategoryListQuerySchema>;
export type CategoryListQuery = z.output<typeof CategoryListQuerySchema>;

export const BrandListQuerySchema = z.object(baseListQueryFields).strict();
export type BrandListQueryInput = z.input<typeof BrandListQuerySchema>;
export type BrandListQuery = z.output<typeof BrandListQuerySchema>;

export const ProductModelListQuerySchema = z
  .object({
    ...baseListQueryFields,
    brandId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
  })
  .strict();
export type ProductModelListQueryInput = z.input<
  typeof ProductModelListQuerySchema
>;
export type ProductModelListQuery = z.output<
  typeof ProductModelListQuerySchema
>;

export const ProductListQuerySchema = z
  .object({
    ...baseListQueryFields,
    brandId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    trackingType: z.enum(TRACKING_TYPES).optional(),
    condition: z.enum(PRODUCT_CONDITIONS).optional(),
    ptaStatus: z.enum(PTA_STATUSES).optional(),
  })
  .strict();
export type ProductListQueryInput = z.input<typeof ProductListQuerySchema>;
export type ProductListQuery = z.output<typeof ProductListQuerySchema>;

const responseNameSchema = z
  .string()
  .min(1)
  .max(CATALOG_CONTRACT_LIMITS.NAME_LENGTH);
const responseAttributeSchema = z
  .string()
  .min(1)
  .max(CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH)
  .nullable();
const responseTimestampSchema = z.iso.datetime();
const responseVersionSchema = z.number().int().positive();

export const CategoryReferenceSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    parentCategoryId: z.uuid().nullable(),
    isActive: z.boolean(),
    version: responseVersionSchema,
  })
  .strict()
  .superRefine((category, context) => {
    if (category.parentCategoryId === category.id) {
      context.addIssue({
        code: "custom",
        message: "A category cannot be its own parent.",
        path: ["parentCategoryId"],
      });
    }
  });
export type CategoryReference = z.infer<typeof CategoryReferenceSchema>;

export const BrandReferenceSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    isActive: z.boolean(),
    version: responseVersionSchema,
  })
  .strict();
export type BrandReference = z.infer<typeof BrandReferenceSchema>;

export const ProductModelReferenceSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    brandId: z.uuid(),
    brandName: responseNameSchema,
    categoryId: z.uuid(),
    categoryName: responseNameSchema,
    isActive: z.boolean(),
    version: responseVersionSchema,
  })
  .strict();
export type ProductModelReference = z.infer<typeof ProductModelReferenceSchema>;

const nestedProductModelSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    brand: z
      .object({
        id: z.uuid(),
        name: responseNameSchema,
      })
      .strict(),
    category: z
      .object({
        id: z.uuid(),
        name: responseNameSchema,
      })
      .strict(),
  })
  .strict();

const productSummaryShape = {
  id: z.uuid(),
  productModel: nestedProductModelSchema,
  sku: z
    .string()
    .min(1)
    .max(CATALOG_CONTRACT_LIMITS.SKU_LENGTH)
    .regex(/^[A-Z0-9][A-Z0-9._/-]*$/),
  name: responseNameSchema,
  trackingType: z.enum(TRACKING_TYPES),
  condition: z.enum(PRODUCT_CONDITIONS),
  ptaStatus: z.enum(PTA_STATUSES),
  ram: responseAttributeSchema,
  storage: responseAttributeSchema,
  color: responseAttributeSchema,
  region: responseAttributeSchema,
  warrantyType: z.enum(WARRANTY_TYPES),
  warrantyMonths: z
    .number()
    .int()
    .positive()
    .max(CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS)
    .nullable(),
  isActive: z.boolean(),
  version: responseVersionSchema,
  createdAt: responseTimestampSchema,
  updatedAt: responseTimestampSchema,
};

interface ProductResponseInvariants {
  readonly warrantyType: (typeof WARRANTY_TYPES)[number];
  readonly warrantyMonths: number | null;
}

function refineProductResponse(
  product: ProductResponseInvariants,
  context: z.RefinementCtx,
): void {
  if (product.warrantyType === "none" && product.warrantyMonths !== null) {
    context.addIssue({
      code: "custom",
      message: "A product without warranty cannot have warranty months.",
      path: ["warrantyMonths"],
    });
  }
  if (product.warrantyType !== "none" && product.warrantyMonths === null) {
    context.addIssue({
      code: "custom",
      message: "Warranty months are required for this warranty type.",
      path: ["warrantyMonths"],
    });
  }
}

export const ProductSummarySchema = z
  .object(productSummaryShape)
  .strict()
  .superRefine(refineProductResponse);
export type ProductSummary = z.infer<typeof ProductSummarySchema>;

export const ProductAliasSchema = z
  .object({
    id: z.uuid(),
    alias: z.string().min(1).max(CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH),
  })
  .strict();
export type ProductAliasEntry = z.infer<typeof ProductAliasSchema>;

export const ProductBarcodeSchema = z
  .object({
    id: z.uuid(),
    barcode: z
      .string()
      .min(1)
      .max(CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH)
      .regex(/^[\x21-\x7E]+$/),
    isPrimary: z.boolean(),
  })
  .strict();
export type ProductBarcodeEntry = z.infer<typeof ProductBarcodeSchema>;

/**
 * Detail additionally carries the identity needed to edit a variant: its active
 * aliases and barcodes. These are catalog identity, not inventory or financial
 * data, so they are safe to expose to any `catalog.view` caller.
 */
export const ProductDetailSchema = z
  .object({
    ...productSummaryShape,
    aliases: z
      .array(ProductAliasSchema)
      .max(CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT),
    barcodes: z
      .array(ProductBarcodeSchema)
      .max(CATALOG_CONTRACT_LIMITS.MAX_BARCODES_PER_PRODUCT),
  })
  .strict()
  .superRefine((product, context) => {
    refineProductResponse(product, context);

    const primaryCount = product.barcodes.filter(
      (barcode) => barcode.isPrimary,
    ).length;
    // Mirrors the partial unique index that allows at most one primary barcode
    // per variant, so a corrupted row cannot be served as a valid response.
    if (primaryCount > 1) {
      context.addIssue({
        code: "custom",
        message: "A product cannot have more than one primary barcode.",
        path: ["barcodes"],
      });
    }
    if (product.barcodes.length > 0 && primaryCount === 0) {
      context.addIssue({
        code: "custom",
        message: "A product with barcodes must have one primary barcode.",
        path: ["barcodes"],
      });
    }
  });
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

export const PageMetadataSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(PAGINATION.MAX_PAGE_SIZE),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((metadata, context) => {
    const expectedTotalPages = Math.ceil(metadata.total / metadata.pageSize);
    if (metadata.totalPages !== expectedTotalPages) {
      context.addIssue({
        code: "custom",
        message: "totalPages does not match total and pageSize.",
        path: ["totalPages"],
      });
    }
  });
export type PageMetadata = z.infer<typeof PageMetadataSchema>;

export function createPageEnvelopeSchema<TItemSchema extends z.ZodType>(
  itemSchema: TItemSchema,
) {
  return z
    .object({
      items: z.array(itemSchema),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive().max(PAGINATION.MAX_PAGE_SIZE),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    })
    .strict()
    .superRefine((envelope, context) => {
      const expectedTotalPages = Math.ceil(envelope.total / envelope.pageSize);
      if (envelope.totalPages !== expectedTotalPages) {
        context.addIssue({
          code: "custom",
          message: "totalPages does not match total and pageSize.",
          path: ["totalPages"],
        });
      }
    });
}

export const CategoryPageSchema = createPageEnvelopeSchema(
  CategoryReferenceSchema,
);
export type CategoryPage = z.infer<typeof CategoryPageSchema>;

export const BrandPageSchema = createPageEnvelopeSchema(BrandReferenceSchema);
export type BrandPage = z.infer<typeof BrandPageSchema>;

export const ProductModelPageSchema = createPageEnvelopeSchema(
  ProductModelReferenceSchema,
);
export type ProductModelPage = z.infer<typeof ProductModelPageSchema>;

export const ProductSummaryPageSchema =
  createPageEnvelopeSchema(ProductSummarySchema);
export type ProductSummaryPage = z.infer<typeof ProductSummaryPageSchema>;
