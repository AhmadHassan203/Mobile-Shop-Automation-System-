import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { PricingModule } from "../pricing/pricing.module";
import { PurchasingModule } from "../purchasing/purchasing.module";
import { QuickStockInController } from "./quick-stock-in.controller";
import { QuickStockInService } from "./quick-stock-in.service";

/**
 * Quick Stock In composes the Catalog, Purchasing and Pricing domain services
 * (each exports its service) so a single orchestration transaction can reuse
 * their transaction-aware methods without duplicating any business rule.
 */
@Module({
  imports: [CatalogModule, PurchasingModule, PricingModule],
  controllers: [QuickStockInController],
  providers: [QuickStockInService],
  // Exported so Bulk Stock In can compose this service and replay each row
  // through the same atomic stock-in chain without duplicating any rule.
  exports: [QuickStockInService],
})
export class QuickStockInModule {}
