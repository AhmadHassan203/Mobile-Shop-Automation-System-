import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthService, type HealthReport, type LivenessReport } from './health.service';

/**
 * Health and readiness endpoints (13_ §4, §20).
 *
 * Deliberately unauthenticated: a load balancer and an uptime monitor must be
 * able to call these. They therefore expose no configuration, no credentials and
 * no internal detail beyond up/down and dependency status.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness: is the process running?
   * Never checks dependencies — a failing database must not cause an orchestrator
   * to kill an otherwise healthy process that would recover on its own.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe — is the process up?' })
  @ApiOkResponse({ description: 'The process is alive.' })
  live(): LivenessReport {
    return this.health.liveness();
  }

  /**
   * Readiness: can this instance serve traffic?
   * Checks dependencies, so it returns 503 when the database is unreachable.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — can this instance serve traffic?' })
  @ApiOkResponse({ description: 'All dependencies are reachable.' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is unavailable.' })
  async ready(): Promise<HealthReport> {
    return this.health.readiness();
  }
}
