import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  BrandListQuerySchema,
  CategoryListQuerySchema,
  CreateBrandInputSchema,
  CreateCategoryInputSchema,
  CreateProductModelInputSchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  ProductModelListQuerySchema,
  type BrandListQuery,
  type BrandPage,
  type BrandReference,
  type CategoryListQuery,
  type CategoryPage,
  type CategoryReference,
  type CreateBrandData,
  type CreateCategoryData,
  type CreateProductModelData,
  type ProductModelListQuery,
  type ProductModelPage,
  type ProductModelReference,
} from "@mobileshop/shared";
import type { Request } from "express";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { CatalogService, type CatalogActorContext } from "./catalog.service";

function actorContext(request: Request): CatalogActorContext {
  const current = request.auth?.current;
  if (current === undefined) {
    throw new DomainError(
      ERROR_CODES.AUTH_REQUIRED,
      "Authentication is required",
    );
  }
  return {
    organizationId: current.organization.id,
    branchId: current.branch.id,
    actorUserId: current.user.id,
    metadata: authRequestMetadata(request),
  };
}

@ApiTags("Catalog")
@Controller("catalog/categories")
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOperation({ summary: "List tenant-scoped catalog categories" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(CategoryListQuerySchema))
    query: CategoryListQuery,
  ): Promise<CategoryPage> {
    return this.catalog.listCategories(
      actorContext(request).organizationId,
      query,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_CREATE)
  @ApiOperation({ summary: "Create a tenant-scoped catalog category" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateCategoryInputSchema)) input: CreateCategoryData,
  ): Promise<CategoryReference> {
    return this.catalog.createCategory(actorContext(request), input);
  }
}

@ApiTags("Catalog")
@Controller("catalog/brands")
export class BrandsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOperation({ summary: "List tenant-scoped catalog brands" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(BrandListQuerySchema)) query: BrandListQuery,
  ): Promise<BrandPage> {
    return this.catalog.listBrands(actorContext(request).organizationId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_CREATE)
  @ApiOperation({ summary: "Create a tenant-scoped catalog brand" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateBrandInputSchema)) input: CreateBrandData,
  ): Promise<BrandReference> {
    return this.catalog.createBrand(actorContext(request), input);
  }
}

@ApiTags("Catalog")
@Controller("catalog/product-models")
export class ProductModelsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOperation({ summary: "List tenant-scoped catalog product models" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ProductModelListQuerySchema))
    query: ProductModelListQuery,
  ): Promise<ProductModelPage> {
    return this.catalog.listProductModels(
      actorContext(request).organizationId,
      query,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_CREATE)
  @ApiOperation({ summary: "Create a tenant-scoped catalog product model" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateProductModelInputSchema)) input: CreateProductModelData,
  ): Promise<ProductModelReference> {
    return this.catalog.createProductModel(actorContext(request), input);
  }
}
