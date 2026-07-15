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
  CatalogVersionInputSchema,
  CreateProductInputSchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  ProductListQuerySchema,
  UpdateProductInputSchema,
  type CatalogVersionData,
  type CreateProductData,
  type ProductDetail,
  type ProductListQuery,
  type ProductSummary,
  type ProductSummaryPage,
  type UpdateProductData,
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

@ApiTags("Products")
@Controller("products")
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOperation({ summary: "List tenant-scoped catalog products" })
  list(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ProductListQuerySchema))
    query: ProductListQuery,
  ): Promise<ProductSummaryPage> {
    return this.catalog.listProducts(
      actorContext(request).organizationId,
      query,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_CREATE)
  @ApiOperation({ summary: "Create a catalog product atomically" })
  create(
    @Req() request: Request,
    @Body(zodBody(CreateProductInputSchema)) input: CreateProductData,
  ): Promise<ProductSummary> {
    return this.catalog.createProduct(actorContext(request), input);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOperation({ summary: "Read one catalog product with its edit identity" })
  detail(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
  ): Promise<ProductDetail> {
    return this.catalog.getProduct(actorContext(request).organizationId, id);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Update a catalog product atomically" })
  update(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(UpdateProductInputSchema)) input: UpdateProductData,
  ): Promise<ProductDetail> {
    return this.catalog.updateProduct(actorContext(request), id, input);
  }

  @Post(":id/deactivate")
  @RequirePermissions(PERMISSIONS.CATALOG_DEACTIVATE)
  @ApiOperation({ summary: "Deactivate a catalog product" })
  deactivate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<ProductDetail> {
    return this.catalog.deactivateProduct(actorContext(request), id, input);
  }

  @Post(":id/activate")
  @RequirePermissions(PERMISSIONS.CATALOG_UPDATE)
  @ApiOperation({ summary: "Reactivate a catalog product" })
  activate(
    @Req() request: Request,
    @Param("id", uuidParam) id: string,
    @Body(zodBody(CatalogVersionInputSchema)) input: CatalogVersionData,
  ): Promise<ProductDetail> {
    return this.catalog.activateProduct(actorContext(request), id, input);
  }
}
