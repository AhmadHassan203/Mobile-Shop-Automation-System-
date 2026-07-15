import { Module } from "@nestjs/common";
import {
  InventoryController,
  LocationsController,
} from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { SerializedUnitsController } from "./serialized-units.controller";

@Module({
  controllers: [
    LocationsController,
    InventoryController,
    SerializedUnitsController,
  ],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
