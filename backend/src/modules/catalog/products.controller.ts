import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateProductInputSchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  ProductListQuerySchema,
  type CreateProductData,
  type ProductListQuery,
  type ProductSummary,
  type ProductSummaryPage,
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
}
