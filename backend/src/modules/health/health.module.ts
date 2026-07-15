import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { DatabaseHealthIndicator } from "./database-health.indicator";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { MANDATORY_DATABASE_HEALTH_INDICATOR } from "./health.tokens";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    {
      provide: MANDATORY_DATABASE_HEALTH_INDICATOR,
      useExisting: DatabaseHealthIndicator,
    },
    HealthService,
  ],
  exports: [HealthService],
})
export class HealthModule {}
