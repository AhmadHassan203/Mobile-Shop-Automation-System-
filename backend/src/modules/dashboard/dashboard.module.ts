import { Module } from "@nestjs/common";
import { CashModule } from "../cash/cash.module";
import { DemandModule } from "../demand/demand.module";
import { ExternalModule } from "../external/external.module";
import { SalesModule } from "../sales/sales.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  // The dashboard is a read-model orchestrator: it reuses each domain's own
  // service (finance summary lives on DashboardService itself) so it can never
  // duplicate or drift from the figures those modules publish.
  imports: [SalesModule, ExternalModule, CashModule, DemandModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
