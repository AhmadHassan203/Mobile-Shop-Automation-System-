import { Module } from "@nestjs/common";
import { DemandController } from "./demand.controller";
import { DemandService } from "./demand.service";

@Module({
  controllers: [DemandController],
  providers: [DemandService],
  exports: [DemandService],
})
export class DemandModule {}
