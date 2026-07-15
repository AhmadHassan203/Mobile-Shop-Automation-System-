import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  BrandListQuerySchema,
  CatalogVersionInputSchema,
  CategoryListQuerySchema,
  CreateBrandInputSchema,
  CreateCategoryInputSchema,
  CreateProductModelInputSchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  ProductModelListQuerySchema,
  UpdateBrandInputSchema,
  UpdateCategoryInputSchema,
  UpdateProductModelInputSchema,
  type BrandListQuery,
  type BrandPage,
  type BrandReference,
  type CatalogVersionData,
  type CategoryListQuery,
  type CategoryPage,
  type CategoryReference,
  type CreateBrandData,
  type CreateCategoryData,
  type CreateProductModelData,
  type ProductModelListQuery,
  type ProductModelPage,
  type ProductModelReference,
  type UpdateBrandData,
  type UpdateCategoryData,
  type UpdateProductModelData,
} from "@mobileshop/shared";
import type { Request } from "express";
import { z } from "zod";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator";
import {
  ZodValidationPipe,
  zodBody,
} from "../../common/pipes/zod-validation.pipe";
import { authRequestMetadata } from "../auth/request-metadata";
import { CatalogService, type CatalogActorContext } from "./catalog.service";

/** A malformed id is a bad request, so it fails here and never reaches Prisma. */
const uuidParam = new ZodValidationPipe(z.uuid());

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

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Update a tenant-scoped catalog category" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateCategoryInputSchema)) input: UpdateCategoryData,
  ): Promise<CategoryReference> {
    return this.catalog.updateCategory(actorContext(request), id, input);
  }

  @Post(":id/deactivate")
  @RequirePermissions(PERMISSIONS.CATALOG_DEACTIVATE)
  @ApiOperation({ summary: "Deactivate a tenant-scoped catalog category" })
  deactivate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<CategoryReference> {
    return this.catalog.deactivateCategory(actorContext(request), id, input);
  }

  // Reactivating is an edit of an existing record, not a new grant of authority:
  // it needs catalog.update, the same permission that renamed it.
  @Post(":id/activate")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Reactivate a tenant-scoped catalog category" })
  activate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<CategoryReference> {
    return this.catalog.activateCategory(actorContext(request), id, input);
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

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Update a tenant-scoped catalog brand" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateBrandInputSchema)) input: UpdateBrandData,
  ): Promise<BrandReference> {
    return this.catalog.updateBrand(actorContext(request), id, input);
  }

  @Post(":id/deactivate")
  @RequirePermissions(PERMISSIONS.CATALOG_DEACTIVATE)
  @ApiOperation({ summary: "Deactivate a tenant-scoped catalog brand" })
  deactivate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<BrandReference> {
    return this.catalog.deactivateBrand(actorContext(request), id, input);
  }

  @Post(":id/activate")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Reactivate a tenant-scoped catalog brand" })
  activate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<BrandReference> {
    return this.catalog.activateBrand(actorContext(request), id, input);
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

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Update a tenant-scoped catalog product model" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateProductModelInputSchema))
    input: UpdateProductModelData,
  ): Promise<ProductModelReference> {
    return this.catalog.updateProductModel(actorContext(request), id, input);
  }

  @Post(":id/deactivate")
  @RequirePermissions(PERMISSIONS.CATALOG_DEACTIVATE)
  @ApiOperation({ summary: "Deactivate a tenant-scoped catalog product model" })
  deactivate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<ProductModelReference> {
    return this.catalog.deactivateProductModel(
      actorContext(request),
      id,
      input,
    );
  }

  @Post(":id/activate")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Reactivate a tenant-scoped catalog product model" })
  activate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<ProductModelReference> {
    return this.catalog.activateProductModel(actorContext(request), id, input);
  }
}
