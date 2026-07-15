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

export const CreateCategoryInputSchema = z
  .object({
    name: requiredNameInputSchema,
    parentCategoryId: z.uuid().nullable().optional(),
  })
  .strict();

export type CreateCategoryInput = z.input<typeof CreateCategoryInputSchema>;
export type CreateCategoryData = z.output<typeof CreateCategoryInputSchema>;

export const CreateBrandInputSchema = z
  .object({
    name: requiredNameInputSchema,
  })
  .strict();

export type CreateBrandInput = z.input<typeof CreateBrandInputSchema>;
export type CreateBrandData = z.output<typeof CreateBrandInputSchema>;

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

export const CreateProductInputSchema = z
  .object({
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
  })
  .strict()
  .superRefine((product, context) => {
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
  });

export type CreateProductInput = z.input<typeof CreateProductInputSchema>;
export type CreateProductData = z.output<typeof CreateProductInputSchema>;

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

export const CategoryReferenceSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    parentCategoryId: z.uuid().nullable(),
    isActive: z.boolean(),
  })
  .strict();
export type CategoryReference = z.infer<typeof CategoryReferenceSchema>;

export const BrandReferenceSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    isActive: z.boolean(),
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

export const ProductSummarySchema = z
  .object({
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
    createdAt: responseTimestampSchema,
    updatedAt: responseTimestampSchema,
  })
  .strict()
  .superRefine((product, context) => {
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
  });
export type ProductSummary = z.infer<typeof ProductSummarySchema>;

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
