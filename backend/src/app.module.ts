import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { REQUEST_ID_HEADER } from '@mobileshop/shared';
import { AppConfig, AppConfigModule } from './config/app-config.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { HealthModule } from './modules/health/health.module';

/**
 * Application root.
 *
 * Modular monolith (03_ARCHITECTURE.md §1, 13_ §4): one deployable application
 * with hard module boundaries. Domain modules are added slice by slice; a module
 * must never bypass another module's domain service to mutate its tables
 * (13_ §7).
 */
@Module({
  imports: [
    AppConfigModule,

    // Structured JSON logging with the request ID on every line (13_ §4).
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          // Pretty output is a developer convenience only; production emits JSON.
          // Spread rather than assign undefined: exactOptionalPropertyTypes
          // distinguishes "absent" from "present and undefined".
          ...(config.get('LOG_PRETTY')
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:standard' },
                },
              }
            : {}),
          genReqId: (req) => (req as { requestId?: string }).requestId ?? '',
          customProps: (req) => ({ requestId: (req as { requestId?: string }).requestId }),
          autoLogging: {
            // Probes would otherwise dominate the log at one line per second.
            ignore: (req) => req.url === '/api/v1/health' || req.url === '/api/v1/health/ready',
          },
          // 05_RULES.md §9: never log passwords, tokens, CNIC images or full
          // payment data. Redaction is defence in depth — the goal is that these
          // never reach a log call in the first place.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.passwordConfirmation',
              'req.body.sessionSecret',
              'req.body.cnic',
              'req.body.cnicNumber',
              '*.password',
              '*.passwordHash',
              '*.sessionToken',
              '*.cnic',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),

    // Global rate limiting. Auth endpoints tighten this further (13_ §8).
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfig],
      useFactory: (config: AppConfig) => [
        {
          name: 'default',
          ttl: config.get('AUTH_RATE_LIMIT_TTL_SECONDS') * 1000,
          limit: 300,
        },
      ],
    }),

    HealthModule,
  ],
  providers: [
    // Registered globally so no thrown error can escape to the client unshaped.
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Must run before the logger so that every line carries the correlation ID.
    consumer.apply(RequestIdMiddleware).forRoutes('*splat');
  }
}

export { REQUEST_ID_HEADER };
