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
  ProductModelPageSchema,
  ProductModelReferenceSchema,
  ProductSummaryPageSchema,
  ProductSummarySchema,
  type BrandListQuery,
  type BrandPage,
  type BrandReference,
  type CategoryListQuery,
  type CategoryPage,
  type CategoryReference,
  type CreateBrandData,
  type CreateCategoryData,
  type CreateProductData,
  type CreateProductModelData,
  type ProductListQuery,
  type ProductModelListQuery,
  type ProductModelPage,
  type ProductModelReference,
  type ProductSummary,
  type ProductSummaryPage,
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

type ProductSummaryRecord = Prisma.ProductVariantGetPayload<{
  select: typeof productSummarySelect;
}>;

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
        await this.writeCreateAudit(tx, context, {
          action: "catalog.category_created",
          entityType: "category",
          entityId: category.id,
          snapshot: {
            name: category.name,
            parentCategoryId: category.parentCategoryId,
            isActive: category.isActive,
          },
        });
        return this.toCategoryReference(category);
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "category");
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
        select: { id: true, name: true, isActive: true },
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
        await this.writeCreateAudit(tx, context, {
          action: "catalog.brand_created",
          entityType: "brand",
          entityId: brand.id,
          snapshot: { name: brand.name, isActive: brand.isActive },
        });
        return this.toBrandReference(brand);
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "brand");
    }
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
        select: {
          id: true,
          name: true,
          brandId: true,
          categoryId: true,
          isActive: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
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
        const [brand, category] = await Promise.all([
          tx.brand.findFirst({
            where: {
              id: input.brandId,
              organizationId: context.organizationId,
              isActive: true,
            },
            select: { id: true, name: true },
          }),
          tx.category.findFirst({
            where: {
              id: input.categoryId,
              organizationId: context.organizationId,
              isActive: true,
            },
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

        const model = await tx.productModel.create({
          data: {
            organizationId: context.organizationId,
            brandId: brand.id,
            categoryId: category.id,
            name: input.name,
            canonicalName: canonicalizeCatalogAlias(input.name),
          },
        });
        await this.writeCreateAudit(tx, context, {
          action: "catalog.product_model_created",
          entityType: "product_model",
          entityId: model.id,
          snapshot: {
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
        });
      });
    } catch (error) {
      this.rethrowReferenceDuplicate(error, "product model");
    }
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
        const productModel = await tx.productModel.findFirst({
          where: {
            id: input.productModelId,
            organizationId: context.organizationId,
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

        await this.writeCreateAudit(tx, context, {
          action: "catalog.product_created",
          entityType: "product_variant",
          entityId: product.id,
          snapshot: {
            productModelId: input.productModelId,
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
            aliases: input.aliases,
            barcodes: input.barcodes,
            isActive: product.isActive,
          },
        });
        return this.toProductSummary(product);
      });
    } catch (error) {
      this.rethrowProductDuplicate(error);
    }
  }

  private toCategoryReference(category: Category): CategoryReference {
    return catalogResponse(CategoryReferenceSchema, {
      id: category.id,
      name: category.name,
      parentCategoryId: category.parentCategoryId,
      isActive: category.isActive,
    });
  }

  private toBrandReference(brand: Brand): BrandReference {
    return catalogResponse(BrandReferenceSchema, {
      id: brand.id,
      name: brand.name,
      isActive: brand.isActive,
    });
  }

  private toProductSummary(product: ProductSummaryRecord): ProductSummary {
    return catalogResponse(ProductSummarySchema, {
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
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
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

  private async writeCreateAudit(
    tx: Prisma.TransactionClient,
    context: CatalogActorContext,
    event: {
      readonly action: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly snapshot: Prisma.InputJsonObject;
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
        afterSnapshot: event.snapshot,
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
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
