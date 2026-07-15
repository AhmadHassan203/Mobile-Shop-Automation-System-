import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@mobileshop/database";
import { AppConfig } from "../config/app-config.module";
import { withDatabaseTimeout } from "./database-timeout";

/**
 * Owns the process-wide Prisma client and its Nest lifecycle.
 *
 * Connection is deliberately lazy: the process can expose liveness while the
 * mandatory readiness query reports a database outage. Shutdown always closes
 * the pool. Readiness queries are single-flight so repeated probes cannot pile
 * up unbounded connection attempts behind a network outage.
 */
@Injectable()
export class PrismaService implements OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);
  private readonly timeoutMs: number;
  private pingInFlight: Promise<void> | undefined;

  readonly client: PrismaClient;

  constructor(config: AppConfig) {
    this.timeoutMs = config.get("DATABASE_HEALTH_TIMEOUT_MS");
    this.client = createPrismaClient({
      connectionString: config.get("DATABASE_URL"),
      logQueries: false,
    });
  }

  /** Execute the minimal real query used by readiness, within the configured budget. */
  async ping(timeoutMs = this.timeoutMs): Promise<void> {
    const operation = this.pingInFlight ?? this.startPing();
    await withDatabaseTimeout(operation, timeoutMs);
  }

  private startPing(): Promise<void> {
    const operation = this.client.$queryRaw<
      readonly { ready: number }[]
    >`SELECT 1 AS ready`.then(() => undefined);
    this.pingInFlight = operation;

    const clear = (): void => {
      if (this.pingInFlight === operation) this.pingInFlight = undefined;
    };
    void operation.then(clear, clear);

    return operation;
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await withDatabaseTimeout(this.client.$disconnect(), this.timeoutMs);
    } catch {
      this.logger.warn(
        { timeoutMs: this.timeoutMs },
        "Database client did not disconnect within the shutdown budget",
      );
    }
  }
}
