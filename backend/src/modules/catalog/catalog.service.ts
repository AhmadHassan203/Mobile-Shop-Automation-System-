import { Injectable } from "@nestjs/common";
import { Prisma, type Brand, type Category } from "@mobileshop/database";
import {
  BrandPageSchema,
  BrandReferenceSchema,
  canonicalizeCatalogAlias,
  CategoryPageSchema,
  CategoryReferenceSchema,
  DomainError,
  ERROR_CODES,
  normalizeCatalogSlug,
  ProductDetailSchema,
  ProductModelPageSchema,
  ProductModelReferenceSchema,
  ProductSummaryPageSchema,
  ProductSummarySchema,
  type BrandListQuery,
  type BrandPage,
  type BrandReference,
  type CatalogVersionData,
  type CategoryListQuery,
  type CategoryPage,
  type CategoryReference,
  type CreateBrandData,
  type CreateCategoryData,
  type CreateProductData,
  type CreateProductModelData,
  type ProductDetail,
  type ProductListQuery,
  type ProductModelListQuery,
  type ProductModelPage,
  type ProductModelReference,
  type ProductSummary,
  type ProductSummaryPage,
  type UpdateBrandData,
  type UpdateCategoryData,
  type UpdateProductData,
  type UpdateProductModelData,
} from "@mobileshop/shared";
import type { ZodType } from "zod";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface CatalogActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly metadata: AuthRequestMetadata;
}

/**
 * Upper bound on the ancestor walk that rejects category cycles. A tree this
 * deep is not reachable through the API, so the bound only ever stops a walk
 * over data that is already corrupt — it must never hang the request. The
 * `categories_no_cycle` trigger (0006) remains the authority either way.
 */
const MAX_CATEGORY_ANCESTRY_HOPS = 64;

const productSummarySelect = {
  id: true,
  sku: true,
  name: true,
  trackingType: true,
  condition: true,
  ptaStatus: true,
  ram: true,
  storage: true,
  color: true,
  region: true,
  warrantyType: true,
  warrantyMonths: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  productModel: {
    select: {
      id: true,
      name: true,
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ProductVariantSelect;

/**
 * Detail additionally carries the child rows a variant is edited through. Only
 * ACTIVE aliases/barcodes are identity; retired ones are history and stay out of
 * the response. Ordering is deterministic so repeated reads are byte-stable.
 */
const productDetailSelect = {
  ...productSummarySelect,
  aliases: {
    where: { isActive: true },
    select: { id: true, alias: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  barcodes: {
    where: { isActive: true },
    select: { id: true, barcode: true, isPrimary: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ProductVariantSelect;

const productModelReferenceSelect = {
  id: true,
  name: true,
  brandId: true,
  categoryId: true,
  isActive: true,
  version: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.ProductModelSelect;

type ProductSummaryRecord = Prisma.ProductVariantGetPayload<{
  select: typeof productSummarySelect;
}>;

type ProductDetailRecord = Prisma.ProductVariantGetPayload<{
  select: typeof productDetailSelect;
}>;

type ProductModelReferenceRecord = Prisma.ProductModelGetPayload<{
  select: typeof productModelReferenceSelect;
}>;

/** The minimum a resolved brand/category needs to be named in a response. */
interface CatalogReferenceRow {
  readonly id: string;
  readonly name: string;
}

function pageEnvelope<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
  total: number,
) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

function validationError(
  field: string,
  message: string,
  cause?: unknown,
): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
    ...(cause === undefined ? {} : { cause }),
  });
}

/**
 * A row that is absent, or that belongs to another organization, is reported
 * identically: confirming that an id exists elsewhere would leak the tenant
 * boundary this whole module is built to hold.
 */
function notFoundError(label: string): DomainError {
  return new DomainError(
    ERROR_CODES.NOT_FOUND,
    `This ${label} no longer exists.`,
  );
}

function optimisticLockError(label: string): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    `This ${label} was changed by someone else. Reload it and reapply your edit.`,
  );
}

function categorySnapshot(category: Category): Prisma.InputJsonObject {
  return {
    name: category.name,
    parentCategoryId: category.parentCategoryId,
    isActive: category.isActive,
  };
}

function brandSnapshot(brand: Brand): Prisma.InputJsonObject {
  return { name: brand.name, isActive: brand.isActive };
}

function productModelSnapshot(
  model: ProductModelReferenceRecord,
): Prisma.InputJsonObject {
  return {
    name: model.name,
    brandId: model.brandId,
    categoryId: model.categoryId,
    isActive: model.isActive,
  };
}

/**
 * The audit snapshot of a variant. It mirrors the public contract exactly: no
 * cost, price, stock, device identifier or organization id ever reaches it.
 */
function productSnapshot(
  product: ProductSummaryRecord,
  aliases: readonly string[],
  barcodes: readonly string[],
): Prisma.InputJsonObject {
  return {
    productModelId: product.productModel.id,
    sku: product.sku,
    name: product.name,
    trackingType: product.trackingType,
    condition: product.condition,
    ptaStatus: product.ptaStatus,
    ram: product.ram,
    storage: product.storage,
    color: product.color,
    region: product.region,
    warrantyType: product.warrantyType,
    warrantyMonths: product.warrantyMonths,
    aliases: [...aliases],
    barcodes: [...barcodes],
    isActive: product.isActive,
  };
}

function catalogResponse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  // Request validation is completed in the controller pipes. A failure here
  // means persisted/server data violated our public response contract and must
  // be treated as an internal fault, never blamed on the caller as a 422.
  throw new Error("Catalog response validation failed", {
    cause: result.error,
  });
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(
    organizationId: string,
    query: CategoryListQuery,
  ): Promise<CategoryPage> {
    const where: Prisma.CategoryWhereInput = {
      organizationId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.q === undefined
        ? {}
        : { name: { contains: query.q, mode: "insensitive" } }),
    };
    const [total, records] = await this.prisma.client.$transaction([
      this.prisma.client.category.count({ where }),
      this.prisma.client.category.findMany({
        where,
        select: {
          id: true,
          name: true,
          parentCategoryId: true,
          isActive: true,
          version: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return catalogResponse(
      CategoryPageSchema,
      pageEnvelope(records, query.page, query.pageSize, total),
    );
  }

  async createCategory(
    context: CatalogActorContext,
    input: CreateCategoryData,
  ): Promise<CategoryReference> {
    const slug = this.slugFor(input.name);
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        if (
          input.parentCategoryId !== undefined &&
          input.parentCategoryId !== null
        ) {
          const parent = await tx.category.findFirst({
            where: {
              id: input.parentCategoryId,
              organizationId: context.organizationId,
              isActive: true,
            },
            select: { id: true },
          });
          if (parent === null) {
            throw validationError(
              "parentCategoryId",
              "Select an active category from this organization.",
            );
          }
        }

        const category = await tx.category.create({
          data: {
            organizationId: context.organizationId,
            name: input.name,
            slug,
            parentCategoryId: input.parentCategoryId ?? null,
          },
        });
        await this.writeAudit(tx, context, {
          action: "catalog.category_created",
          entityType: "category",
          entityId: category.id,
          after: categorySnapshot(category),
        });
        return this.toCategoryReference(category);
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "category");
    }
  }

  async updateCategory(
    context: CatalogActorContext,
    id: string,
    input: UpdateCategoryData,
  ): Promise<CategoryReference> {
    const slug = this.slugFor(input.name);
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.loadCategory(tx, context.organizationId, id);
        await this.assertCategoryParent(
          tx,
          context.organizationId,
          id,
          input.parentCategoryId,
        );

        this.assertVersionMatched(
          await tx.category.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              version: input.version,
            },
            data: {
              name: input.name,
              slug,
              parentCategoryId: input.parentCategoryId,
              version: { increment: 1 },
            },
          }),
          "category",
        );

        const category = await this.loadCategory(
          tx,
          context.organizationId,
          id,
        );
        await this.writeAudit(tx, context, {
          action: "catalog.category_updated",
          entityType: "category",
          entityId: id,
          before: categorySnapshot(current),
          after: categorySnapshot(category),
        });
        return this.toCategoryReference(category);
      });
    } catch (error) {
      this.rethrowCategoryCycle(error);
      this.rethrowReferenceDuplicate(error, "category");
    }
  }

  async deactivateCategory(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<CategoryReference> {
    return this.setCategoryActive(context, id, input, false);
  }

  async activateCategory(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<CategoryReference> {
    return this.setCategoryActive(context, id, input, true);
  }

  private async setCategoryActive(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
    isActive: boolean,
  ): Promise<CategoryReference> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.loadCategory(tx, context.organizationId, id);

      // Reactivation may not resurrect a category under a retired parent; this
      // mirrors the create-time parent check rather than adding a new rule.
      // Deactivation deliberately does not cascade to children.
      if (isActive && current.parentCategoryId !== null) {
        const parent = await tx.category.findFirst({
          where: {
            id: current.parentCategoryId,
            organizationId: context.organizationId,
            isActive: true,
          },
          select: { id: true },
        });
        if (parent === null) {
          throw validationError(
            "parentCategoryId",
            "Reactivate the parent category first.",
          );
        }
      }

      this.assertVersionMatched(
        await tx.category.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { isActive, version: { increment: 1 } },
        }),
        "category",
      );

      const category = await this.loadCategory(tx, context.organizationId, id);
      await this.writeAudit(tx, context, {
        action: isActive
          ? "catalog.category_reactivated"
          : "catalog.category_deactivated",
        entityType: "category",
        entityId: id,
        before: categorySnapshot(current),
        after: categorySnapshot(category),
      });
      return this.toCategoryReference(category);
    });
  }

  private async loadCategory(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<Category> {
    const category = await tx.category.findFirst({
      where: { id, organizationId },
    });
    if (category === null) throw notFoundError("category");
    return category;
  }

  /**
   * Enforces the tree invariants the API owns: an active in-tenant parent, no
   * self-parent, and no cycle. The `categories_no_cycle` trigger is the final
   * authority — but it raises a raw 23514 that would surface as a 500, so the
   * walk below is what turns a bad move into an actionable 422.
   */
  private async assertCategoryParent(
    tx: Prisma.TransactionClient,
    organizationId: string,
    categoryId: string,
    parentCategoryId: string | null,
  ): Promise<void> {
    if (parentCategoryId === null) return;
    if (parentCategoryId === categoryId) {
      throw validationError(
        "parentCategoryId",
        "A category cannot be its own parent.",
      );
    }

    const parent = await tx.category.findFirst({
      where: { id: parentCategoryId, organizationId, isActive: true },
      select: { parentCategoryId: true },
    });
    if (parent === null) {
      throw validationError(
        "parentCategoryId",
        "Select an active category from this organization.",
      );
    }

    let ancestorId = parent.parentCategoryId;
    for (let hop = 0; ancestorId !== null; hop += 1) {
      if (ancestorId === categoryId) {
        throw validationError(
          "parentCategoryId",
          "A category cannot be moved beneath one of its own subcategories.",
        );
      }
      // Already-corrupt ancestry cannot be walked to an end. Stop and let the
      // trigger reject the write rather than looping forever.
      if (hop >= MAX_CATEGORY_ANCESTRY_HOPS) return;

      const ancestor: { readonly parentCategoryId: string | null } | null =
        await tx.category.findFirst({
          where: { id: ancestorId, organizationId },
          select: { parentCategoryId: true },
        });
      if (ancestor === null) return;
      ancestorId = ancestor.parentCategoryId;
    }
  }

  async listBrands(
    organizationId: string,
    query: BrandListQuery,
  ): Promise<BrandPage> {
    const where: Prisma.BrandWhereInput = {
      organizationId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.q === undefined
        ? {}
        : { name: { contains: query.q, mode: "insensitive" } }),
    };
    const [total, records] = await this.prisma.client.$transaction([
      this.prisma.client.brand.count({ where }),
      this.prisma.client.brand.findMany({
        where,
        select: { id: true, name: true, isActive: true, version: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return catalogResponse(
      BrandPageSchema,
      pageEnvelope(records, query.page, query.pageSize, total),
    );
  }

  async createBrand(
    context: CatalogActorContext,
    input: CreateBrandData,
  ): Promise<BrandReference> {
    const slug = this.slugFor(input.name);
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const brand = await tx.brand.create({
          data: {
            organizationId: context.organizationId,
            name: input.name,
            slug,
          },
        });
        await this.writeAudit(tx, context, {
          action: "catalog.brand_created",
          entityType: "brand",
          entityId: brand.id,
          after: brandSnapshot(brand),
        });
        return this.toBrandReference(brand);
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "brand");
    }
  }

  async updateBrand(
    context: CatalogActorContext,
    id: string,
    input: UpdateBrandData,
  ): Promise<BrandReference> {
    const slug = this.slugFor(input.name);
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.loadBrand(tx, context.organizationId, id);

        this.assertVersionMatched(
          await tx.brand.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              version: input.version,
            },
            data: { name: input.name, slug, version: { increment: 1 } },
          }),
          "brand",
        );

        const brand = await this.loadBrand(tx, context.organizationId, id);
        await this.writeAudit(tx, context, {
          action: "catalog.brand_updated",
          entityType: "brand",
          entityId: id,
          before: brandSnapshot(current),
          after: brandSnapshot(brand),
        });
        return this.toBrandReference(brand);
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "brand");
    }
  }

  async deactivateBrand(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<BrandReference> {
    return this.setBrandActive(context, id, input, false);
  }

  async activateBrand(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<BrandReference> {
    return this.setBrandActive(context, id, input, true);
  }

  // A brand has no parent, so reactivation carries no integrity precondition.
  private async setBrandActive(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
    isActive: boolean,
  ): Promise<BrandReference> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.loadBrand(tx, context.organizationId, id);

      this.assertVersionMatched(
        await tx.brand.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { isActive, version: { increment: 1 } },
        }),
        "brand",
      );

      const brand = await this.loadBrand(tx, context.organizationId, id);
      await this.writeAudit(tx, context, {
        action: isActive
          ? "catalog.brand_reactivated"
          : "catalog.brand_deactivated",
        entityType: "brand",
        entityId: id,
        before: brandSnapshot(current),
        after: brandSnapshot(brand),
      });
      return this.toBrandReference(brand);
    });
  }

  private async loadBrand(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<Brand> {
    const brand = await tx.brand.findFirst({ where: { id, organizationId } });
    if (brand === null) throw notFoundError("brand");
    return brand;
  }

  async listProductModels(
    organizationId: string,
    query: ProductModelListQuery,
  ): Promise<ProductModelPage> {
    const where: Prisma.ProductModelWhereInput = {
      organizationId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.brandId === undefined ? {} : { brandId: query.brandId }),
      ...(query.categoryId === undefined
        ? {}
        : { categoryId: query.categoryId }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              {
                brand: {
                  is: { name: { contains: query.q, mode: "insensitive" } },
                },
              },
              {
                category: {
                  is: { name: { contains: query.q, mode: "insensitive" } },
                },
              },
            ],
          }),
    };
    const [total, records] = await this.prisma.client.$transaction([
      this.prisma.client.productModel.count({ where }),
      this.prisma.client.productModel.findMany({
        where,
        select: productModelReferenceSelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items = records.map((record) => ({
      id: record.id,
      name: record.name,
      brandId: record.brandId,
      brandName: record.brand.name,
      categoryId: record.categoryId,
      categoryName: record.category.name,
      isActive: record.isActive,
      version: record.version,
    }));

    return catalogResponse(
      ProductModelPageSchema,
      pageEnvelope(items, query.page, query.pageSize, total),
    );
  }

  async createProductModel(
    context: CatalogActorContext,
    input: CreateProductModelData,
  ): Promise<ProductModelReference> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const [brand, category] = await this.resolveModelParents(
          tx,
          context.organizationId,
          input.brandId,
          input.categoryId,
        );

        const model = await tx.productModel.create({
          data: {
            organizationId: context.organizationId,
            brandId: brand.id,
            categoryId: category.id,
            name: input.name,
            canonicalName: canonicalizeCatalogAlias(input.name),
          },
        });
        await this.writeAudit(tx, context, {
          action: "catalog.product_model_created",
          entityType: "product_model",
          entityId: model.id,
          after: {
            name: model.name,
            brandId: model.brandId,
            categoryId: model.categoryId,
            isActive: model.isActive,
          },
        });
        return catalogResponse(ProductModelReferenceSchema, {
          id: model.id,
          name: model.name,
          brandId: model.brandId,
          brandName: brand.name,
          categoryId: model.categoryId,
          categoryName: category.name,
          isActive: model.isActive,
          version: model.version,
        });
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "product model");
    }
  }

  async updateProductModel(
    context: CatalogActorContext,
    id: string,
    input: UpdateProductModelData,
  ): Promise<ProductModelReference> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.loadProductModel(
          tx,
          context.organizationId,
          id,
        );
        const [brand, category] = await this.resolveModelParents(
          tx,
          context.organizationId,
          input.brandId,
          input.categoryId,
        );

        this.assertVersionMatched(
          await tx.productModel.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              version: input.version,
            },
            data: {
              name: input.name,
              canonicalName: canonicalizeCatalogAlias(input.name),
              brandId: brand.id,
              categoryId: category.id,
              version: { increment: 1 },
            },
          }),
          "product model",
        );

        const model = await this.loadProductModel(
          tx,
          context.organizationId,
          id,
        );
        await this.writeAudit(tx, context, {
          action: "catalog.product_model_updated",
          entityType: "product_model",
          entityId: id,
          before: productModelSnapshot(current),
          after: productModelSnapshot(model),
        });
        return this.toProductModelReference(model);
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "product model");
    }
  }

  async deactivateProductModel(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<ProductModelReference> {
    return this.setProductModelActive(context, id, input, false);
  }

  async activateProductModel(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<ProductModelReference> {
    return this.setProductModelActive(context, id, input, true);
  }

  private async setProductModelActive(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
    isActive: boolean,
  ): Promise<ProductModelReference> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.loadProductModel(
        tx,
        context.organizationId,
        id,
      );

      // Reactivating must not reintroduce a model that hangs off a retired
      // brand or category — the same precondition create already enforces.
      if (isActive) {
        await this.resolveModelParents(
          tx,
          context.organizationId,
          current.brandId,
          current.categoryId,
        );
      }

      this.assertVersionMatched(
        await tx.productModel.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { isActive, version: { increment: 1 } },
        }),
        "product model",
      );

      const model = await this.loadProductModel(tx, context.organizationId, id);
      await this.writeAudit(tx, context, {
        action: isActive
          ? "catalog.product_model_reactivated"
          : "catalog.product_model_deactivated",
        entityType: "product_model",
        entityId: id,
        before: productModelSnapshot(current),
        after: productModelSnapshot(model),
      });
      return this.toProductModelReference(model);
    });
  }

  private async resolveModelParents(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
    categoryId: string,
  ): Promise<readonly [CatalogReferenceRow, CatalogReferenceRow]> {
    const [brand, category] = await Promise.all([
      tx.brand.findFirst({
        where: { id: brandId, organizationId, isActive: true },
        select: { id: true, name: true },
      }),
      tx.category.findFirst({
        where: { id: categoryId, organizationId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);
    if (brand === null) {
      throw validationError(
        "brandId",
        "Select an active brand from this organization.",
      );
    }
    if (category === null) {
      throw validationError(
        "categoryId",
        "Select an active category from this organization.",
      );
    }
    return [brand, category];
  }

  private async loadProductModel(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<ProductModelReferenceRecord> {
    const model = await tx.productModel.findFirst({
      where: { id, organizationId },
      select: productModelReferenceSelect,
    });
    if (model === null) throw notFoundError("product model");
    return model;
  }

  async listProducts(
    organizationId: string,
    query: ProductListQuery,
  ): Promise<ProductSummaryPage> {
    const where: Prisma.ProductVariantWhereInput = {
      organizationId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.brandId === undefined && query.categoryId === undefined
        ? {}
        : {
            productModel: {
              is: {
                ...(query.brandId === undefined
                  ? {}
                  : { brandId: query.brandId }),
                ...(query.categoryId === undefined
                  ? {}
                  : { categoryId: query.categoryId }),
              },
            },
          }),
      ...(query.trackingType === undefined
        ? {}
        : { trackingType: query.trackingType }),
      ...(query.condition === undefined ? {} : { condition: query.condition }),
      ...(query.ptaStatus === undefined ? {} : { ptaStatus: query.ptaStatus }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { sku: { contains: query.q, mode: "insensitive" } },
              { name: { contains: query.q, mode: "insensitive" } },
              {
                productModel: {
                  is: { name: { contains: query.q, mode: "insensitive" } },
                },
              },
              {
                productModel: {
                  is: {
                    brand: {
                      is: {
                        name: { contains: query.q, mode: "insensitive" },
                      },
                    },
                  },
                },
              },
              {
                productModel: {
                  is: {
                    category: {
                      is: {
                        name: { contains: query.q, mode: "insensitive" },
                      },
                    },
                  },
                },
              },
              {
                aliases: {
                  some: {
                    normalizedAlias: {
                      contains: canonicalizeCatalogAlias(query.q),
                    },
                  },
                },
              },
              { barcodes: { some: { barcode: { contains: query.q } } } },
            ],
          }),
    };
    const [total, records] = await this.prisma.client.$transaction([
      this.prisma.client.productVariant.count({ where }),
      this.prisma.client.productVariant.findMany({
        where,
        select: productSummarySelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items = records.map((record) => this.toProductSummary(record));

    return catalogResponse(
      ProductSummaryPageSchema,
      pageEnvelope(items, query.page, query.pageSize, total),
    );
  }

  async createProduct(
    context: CatalogActorContext,
    input: CreateProductData,
  ): Promise<ProductSummary> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const productModel = await this.resolveProductModel(
          tx,
          context.organizationId,
          input.productModelId,
        );

        const product = await tx.productVariant.create({
          data: {
            organizationId: context.organizationId,
            productModelId: productModel.id,
            sku: input.sku,
            name: input.name,
            trackingType: input.trackingType,
            condition: input.condition,
            ptaStatus: input.ptaStatus,
            ram: input.ram ?? null,
            storage: input.storage ?? null,
            color: input.color ?? null,
            region: input.region ?? null,
            warrantyType: input.warrantyType,
            warrantyMonths: input.warrantyMonths ?? null,
          },
          select: productSummarySelect,
        });

        if (input.aliases.length > 0) {
          await tx.productAlias.createMany({
            data: input.aliases.map((alias) => ({
              organizationId: context.organizationId,
              productVariantId: product.id,
              alias,
              normalizedAlias: canonicalizeCatalogAlias(alias),
            })),
          });
        }
        if (input.barcodes.length > 0) {
          await tx.productBarcode.createMany({
            data: input.barcodes.map((barcode, index) => ({
              organizationId: context.organizationId,
              productVariantId: product.id,
              barcode,
              isPrimary: index === 0,
            })),
          });
        }

        await this.writeAudit(tx, context, {
          action: "catalog.product_created",
          entityType: "product_variant",
          entityId: product.id,
          after: productSnapshot(product, input.aliases, input.barcodes),
        });
        return this.toProductSummary(product);
      });
    } catch (error) {
      this.rethrowProductDuplicate(error);
    }
  }

  async getProduct(organizationId: string, id: string): Promise<ProductDetail> {
    const product = await this.prisma.client.productVariant.findFirst({
      where: { id, organizationId },
      select: productDetailSelect,
    });
    if (product === null) throw notFoundError("product");
    return this.toProductDetail(product);
  }

  async updateProduct(
    context: CatalogActorContext,
    id: string,
    input: UpdateProductData,
  ): Promise<ProductDetail> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.loadProduct(tx, context.organizationId, id);

        // Serialized and quantity tracking have different inventory shapes, so
        // switching one for the other is a migration rather than an edit
        // (05_RULES §2). Round-tripping the same value stays a no-op.
        if (current.trackingType !== input.trackingType) {
          throw new DomainError(
            ERROR_CODES.CATALOG_TRACKING_TYPE_LOCKED,
            "A product's tracking type cannot be changed after it is created.",
            {
              details: {
                trackingType: [
                  "Tracking type cannot be changed after the product is created.",
                ],
              },
            },
          );
        }

        const productModel = await this.resolveProductModel(
          tx,
          context.organizationId,
          input.productModelId,
        );

        // `trackingType` is deliberately absent from this write: it is verified
        // to be unchanged above and must remain unwritable here.
        this.assertVersionMatched(
          await tx.productVariant.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              version: input.version,
            },
            data: {
              productModelId: productModel.id,
              sku: input.sku,
              name: input.name,
              condition: input.condition,
              ptaStatus: input.ptaStatus,
              ram: input.ram ?? null,
              storage: input.storage ?? null,
              color: input.color ?? null,
              region: input.region ?? null,
              warrantyType: input.warrantyType,
              warrantyMonths: input.warrantyMonths ?? null,
              version: { increment: 1 },
            },
          }),
          "product",
        );

        await this.syncProductAliases(
          tx,
          context,
          id,
          current.aliases,
          input.aliases,
        );
        await this.syncProductBarcodes(
          tx,
          context,
          id,
          current.barcodes,
          input.barcodes,
        );

        const product = await this.loadProduct(tx, context.organizationId, id);
        await this.writeAudit(tx, context, {
          action: "catalog.product_updated",
          entityType: "product_variant",
          entityId: id,
          before: this.productDetailSnapshot(current),
          after: this.productDetailSnapshot(product),
        });
        return this.toProductDetail(product);
      });
    } catch (error) {
      this.rethrowProductDuplicate(error);
    }
  }

  async deactivateProduct(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<ProductDetail> {
    return this.setProductActive(context, id, input, false);
  }

  async activateProduct(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
  ): Promise<ProductDetail> {
    return this.setProductActive(context, id, input, true);
  }

  private async setProductActive(
    context: CatalogActorContext,
    id: string,
    input: CatalogVersionData,
    isActive: boolean,
  ): Promise<ProductDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.loadProduct(tx, context.organizationId, id);

      // Mirrors the create-time check: a product may not become sellable again
      // beneath a model, brand or category that has been retired.
      if (isActive) {
        await this.resolveProductModel(
          tx,
          context.organizationId,
          current.productModel.id,
        );
      }

      this.assertVersionMatched(
        await tx.productVariant.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { isActive, version: { increment: 1 } },
        }),
        "product",
      );

      const product = await this.loadProduct(tx, context.organizationId, id);
      await this.writeAudit(tx, context, {
        action: isActive
          ? "catalog.product_reactivated"
          : "catalog.product_deactivated",
        entityType: "product_variant",
        entityId: id,
        before: this.productDetailSnapshot(current),
        after: this.productDetailSnapshot(product),
      });
      return this.toProductDetail(product);
    });
  }

  /**
   * Brings the ACTIVE aliases to the requested end state. Aliases are compared
   * by canonical form because that — not the display casing — is what the
   * partial unique index treats as the alias's identity.
   */
  private async syncProductAliases(
    tx: Prisma.TransactionClient,
    context: CatalogActorContext,
    productVariantId: string,
    current: ProductDetailRecord["aliases"],
    desired: readonly string[],
  ): Promise<void> {
    const desiredByCanonical = new Map(
      desired.map((alias) => [canonicalizeCatalogAlias(alias), alias]),
    );
    const retiredIds: string[] = [];
    const keptCanonical = new Set<string>();
    for (const row of current) {
      const canonical = canonicalizeCatalogAlias(row.alias);
      if (desiredByCanonical.has(canonical)) keptCanonical.add(canonical);
      else retiredIds.push(row.id);
    }

    // Retire before inserting: the unique index counts active rows only, so a
    // value has to leave the index before that value can be added back.
    if (retiredIds.length > 0) {
      await tx.productAlias.updateMany({
        where: {
          id: { in: retiredIds },
          organizationId: context.organizationId,
        },
        data: { isActive: false },
      });
    }

    const added = [...desiredByCanonical].filter(
      ([canonical]) => !keptCanonical.has(canonical),
    );
    if (added.length > 0) {
      await tx.productAlias.createMany({
        data: added.map(([canonical, alias]) => ({
          organizationId: context.organizationId,
          productVariantId,
          alias,
          normalizedAlias: canonical,
        })),
      });
    }
  }

  /** As for aliases, plus: the first requested barcode is the primary one. */
  private async syncProductBarcodes(
    tx: Prisma.TransactionClient,
    context: CatalogActorContext,
    productVariantId: string,
    current: ProductDetailRecord["barcodes"],
    desired: readonly string[],
  ): Promise<void> {
    const desiredValues = new Set(desired);
    const retiredIds = current
      .filter((row) => !desiredValues.has(row.barcode))
      .map((row) => row.id);
    const keptValues = new Set(
      current
        .filter((row) => desiredValues.has(row.barcode))
        .map((row) => row.barcode),
    );

    // A retired barcode may never stay flagged primary — SQL rejects that row.
    if (retiredIds.length > 0) {
      await tx.productBarcode.updateMany({
        where: {
          id: { in: retiredIds },
          organizationId: context.organizationId,
        },
        data: { isActive: false, isPrimary: false },
      });
    }

    // Only one active barcode per variant may be primary, and that is a unique
    // index: every existing flag must be cleared before the new one is set.
    await tx.productBarcode.updateMany({
      where: {
        productVariantId,
        organizationId: context.organizationId,
        isActive: true,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });

    const added = desired.filter((barcode) => !keptValues.has(barcode));
    if (added.length > 0) {
      await tx.productBarcode.createMany({
        data: added.map((barcode) => ({
          organizationId: context.organizationId,
          productVariantId,
          barcode,
          isPrimary: false,
        })),
      });
    }

    // Elect the primary by value, so one branch covers both a barcode that was
    // kept and one that has just been inserted.
    const primary = desired[0];
    if (primary !== undefined) {
      await tx.productBarcode.updateMany({
        where: {
          productVariantId,
          organizationId: context.organizationId,
          barcode: primary,
          isActive: true,
        },
        data: { isPrimary: true },
      });
    }
  }

  private async resolveProductModel(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productModelId: string,
  ): Promise<{ readonly id: string }> {
    const productModel = await tx.productModel.findFirst({
      where: {
        id: productModelId,
        organizationId,
        isActive: true,
        brand: { is: { isActive: true } },
        category: { is: { isActive: true } },
      },
      select: { id: true },
    });
    if (productModel === null) {
      throw validationError(
        "productModelId",
        "Select an active product model from this organization.",
      );
    }
    return productModel;
  }

  private async loadProduct(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<ProductDetailRecord> {
    const product = await tx.productVariant.findFirst({
      where: { id, organizationId },
      select: productDetailSelect,
    });
    if (product === null) throw notFoundError("product");
    return product;
  }

  private productDetailSnapshot(
    product: ProductDetailRecord,
  ): Prisma.InputJsonObject {
    return productSnapshot(
      product,
      product.aliases.map((alias) => alias.alias),
      product.barcodes.map((barcode) => barcode.barcode),
    );
  }

  private toCategoryReference(category: Category): CategoryReference {
    return catalogResponse(CategoryReferenceSchema, {
      id: category.id,
      name: category.name,
      parentCategoryId: category.parentCategoryId,
      isActive: category.isActive,
      version: category.version,
    });
  }

  private toBrandReference(brand: Brand): BrandReference {
    return catalogResponse(BrandReferenceSchema, {
      id: brand.id,
      name: brand.name,
      isActive: brand.isActive,
      version: brand.version,
    });
  }

  private toProductModelReference(
    model: ProductModelReferenceRecord,
  ): ProductModelReference {
    return catalogResponse(ProductModelReferenceSchema, {
      id: model.id,
      name: model.name,
      brandId: model.brandId,
      brandName: model.brand.name,
      categoryId: model.categoryId,
      categoryName: model.category.name,
      isActive: model.isActive,
      version: model.version,
    });
  }

  private productSummaryValue(product: ProductSummaryRecord) {
    return {
      id: product.id,
      productModel: product.productModel,
      sku: product.sku,
      name: product.name,
      trackingType: product.trackingType,
      condition: product.condition,
      ptaStatus: product.ptaStatus,
      ram: product.ram,
      storage: product.storage,
      color: product.color,
      region: product.region,
      warrantyType: product.warrantyType,
      warrantyMonths: product.warrantyMonths,
      isActive: product.isActive,
      version: product.version,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private toProductSummary(product: ProductSummaryRecord): ProductSummary {
    return catalogResponse(
      ProductSummarySchema,
      this.productSummaryValue(product),
    );
  }

  private toProductDetail(product: ProductDetailRecord): ProductDetail {
    return catalogResponse(ProductDetailSchema, {
      ...this.productSummaryValue(product),
      aliases: product.aliases.map((alias) => ({
        id: alias.id,
        alias: alias.alias,
      })),
      barcodes: product.barcodes.map((barcode) => ({
        id: barcode.id,
        barcode: barcode.barcode,
        isPrimary: barcode.isPrimary,
      })),
    });
  }

  private slugFor(name: string): string {
    const slug = normalizeCatalogSlug(name);
    if (slug.length === 0) {
      throw validationError(
        "name",
        "Name must include at least one letter or number.",
      );
    }
    return slug;
  }

  /**
   * The optimistic lock. The guard belongs in the WHERE clause of the write
   * itself: a read-then-write comparison would leave a window in which another
   * transaction commits between the two statements and is silently overwritten.
   */
  private assertVersionMatched(
    result: { readonly count: number },
    label: string,
  ): void {
    if (result.count === 0) throw optimisticLockError(label);
  }

  /** A create simply has no before-state; every other mutation carries one. */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    context: CatalogActorContext,
    event: {
      readonly action: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly before?: Prisma.InputJsonObject;
      readonly after: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        ...(event.before === undefined ? {} : { beforeSnapshot: event.before }),
        afterSnapshot: event.after,
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }

  /**
   * SQL is the backstop for the ancestor walk, not a duplicate of it: two
   * concurrent moves can each look acyclic and still commit a cycle between
   * them, and only the trigger's advisory lock sees that. Report the race as
   * the same clean 422 the walk produces instead of letting a raw 23514 out as
   * a 500. Matched on the exact phrases 0006 raises — a broad match on the
   * SQLSTATE would misreport unrelated CHECK failures as a parent problem.
   */
  private rethrowCategoryCycle(error: unknown): void {
    const parentFaults = [
      "cannot be its own ancestor",
      "ancestry exceeds the supported depth",
      "categories_parent_not_self",
    ];
    const failure = error as {
      readonly message?: unknown;
      readonly meta?: unknown;
    };
    const message = typeof failure?.message === "string" ? failure.message : "";
    const text = `${message} ${JSON.stringify(failure?.meta ?? {})}`;
    if (parentFaults.some((fault) => text.includes(fault))) {
      throw validationError(
        "parentCategoryId",
        "A category cannot be moved beneath one of its own subcategories.",
        error,
      );
    }
  }

  private rethrowReferenceDuplicate(error: unknown, label: string): never {
    if (this.isPrismaError(error, "P2002")) {
      const message = `A ${label} with this name already exists.`;
      throw new DomainError(ERROR_CODES.CONFLICT, message, {
        details: { name: [message] },
        cause: error,
      });
    }
    this.rethrowUnexpected(error);
  }

  private rethrowProductDuplicate(error: unknown): never {
    if (!this.isPrismaError(error, "P2002")) {
      this.rethrowUnexpected(error);
    }

    const target = JSON.stringify(error.meta ?? {}).toLowerCase();
    if (target.includes("barcode")) {
      throw new DomainError(
        ERROR_CODES.CATALOG_BARCODE_DUPLICATE,
        "A product with this barcode already exists.",
        { details: { barcodes: ["Barcode is already in use."] }, cause: error },
      );
    }
    if (target.includes("sku")) {
      throw new DomainError(
        ERROR_CODES.CATALOG_SKU_DUPLICATE,
        "A product with this SKU already exists.",
        { details: { sku: ["SKU is already in use."] }, cause: error },
      );
    }
    if (target.includes("alias")) {
      throw validationError(
        "aliases",
        "One or more aliases are already in use.",
        error,
      );
    }
    this.rethrowUnexpected(error);
  }

  private rethrowUnexpected(error: unknown): never {
    if (error instanceof Error) throw error;
    throw new Error("Catalog database operation failed", { cause: error });
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is { readonly code: string; readonly meta?: unknown } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    );
  }
}
