import { Module } from "@nestjs/common";
import {
  GoodsReceiptsController,
  PurchaseOrdersController,
  SuppliersController,
} from "./purchasing.controller";
import { PurchasingService } from "./purchasing.service";

@Module({
  controllers: [
    SuppliersController,
    PurchaseOrdersController,
    GoodsReceiptsController,
  ],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
