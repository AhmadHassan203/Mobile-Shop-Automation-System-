import { Module } from "@nestjs/common";
import { QuickStockInModule } from "../quick-stock-in/quick-stock-in.module";
import { BulkStockInController } from "./bulk-stock-in.controller";
import { BulkStockInService } from "./bulk-stock-in.service";

/**
 * Bulk Stock In composes Quick Stock In: it imports {@link QuickStockInModule}
 * and reuses its exported `QuickStockInService` to process every row, so no
 * stock rule is duplicated here.
 *
 * NOTE FOR THE LEAD: this requires `QuickStockInModule` to export
 * `QuickStockInService` (`exports: [QuickStockInService]`). It does not export
 * it yet; add that export so DI can resolve the service here.
 */
@Module({
  imports: [QuickStockInModule],
  controllers: [BulkStockInController],
  providers: [BulkStockInService],
})
export class BulkStockInModule {}
