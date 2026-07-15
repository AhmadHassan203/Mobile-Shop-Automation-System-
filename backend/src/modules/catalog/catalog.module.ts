import { Module } from "@nestjs/common";
import {
  BrandsController,
  CategoriesController,
  ProductModelsController,
} from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { ProductsController } from "./products.controller";

@Module({
  controllers: [
    CategoriesController,
    BrandsController,
    ProductModelsController,
    ProductsController,
  ],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
