import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { API_VERSION, APP_NAME } from '@mobileshop/shared';
import { AppConfig } from '@/config/app-config.module';

export type DependencyStatus = 'up' | 'down' | 'not_configured';

export interface LivenessReport {
  readonly status: 'ok';
  readonly name: string;
  readonly apiVersion: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
}

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly timestamp: string;
  readonly dependencies: Readonly<Record<string, DependencyStatus>>;
}

/**
 * A dependency the readiness probe verifies.
 * Modules register their own check (the database registers one in Slice 1),
 * so readiness stays accurate without this module reaching into their internals.
 */
export interface HealthIndicator {
  readonly name: string;
  check(): Promise<DependencyStatus>;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();
  private readonly indicators: HealthIndicator[] = [];

  constructor(private readonly config: AppConfig) {}

  register(indicator: HealthIndicator): void {
    this.indicators.push(indicator);
  }

  liveness(): LivenessReport {
    return {
      status: 'ok',
      name: APP_NAME,
      apiVersion: API_VERSION,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<HealthReport> {
    const results = await Promise.all(
      this.indicators.map(async (indicator) => {
        try {
          return [indicator.name, await indicator.check()] as const;
        } catch {
          // A throwing check is a down dependency, not a crashed probe.
          const down: DependencyStatus = 'down';
          return [indicator.name, down] as const;
        }
      }),
    );

    const dependencies = Object.fromEntries(results);
    const degraded = results.some(([, status]) => status === 'down');

    const report: HealthReport = {
      status: degraded ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      dependencies,
    };

    if (degraded) {
      // 503 so a load balancer removes this instance from rotation.
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }

  /** Exposed for the startup banner; never returned to an unauthenticated caller. */
  get environment(): string {
    return this.config.get('NODE_ENV');
  }
}
