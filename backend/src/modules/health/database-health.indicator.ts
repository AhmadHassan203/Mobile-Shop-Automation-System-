import { Injectable } from "@nestjs/common";
import { AppConfig } from "../../config/app-config.module";
import { PrismaService } from "../../database/prisma.service";
import type { DependencyStatus, HealthIndicator } from "./health.service";

/** Mandatory PostgreSQL readiness check. */
@Injectable()
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly name = "database";

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async check(): Promise<DependencyStatus> {
    try {
      await this.prisma.ping(this.config.get("DATABASE_HEALTH_TIMEOUT_MS"));
      return "up";
    } catch {
      // Probe responses and logs must not expose driver/connection details.
      return "down";
    }
  }
}
