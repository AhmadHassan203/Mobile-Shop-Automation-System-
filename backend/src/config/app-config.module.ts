import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { type Env, validateEnv } from "./env.schema";
import { loadBackendRuntimeEnvironment } from "./runtime-env.loader";

/**
 * Typed access to validated configuration.
 *
 * Inject this instead of reading `process.env` anywhere in the application:
 * every value is validated once at boot and typed thereafter.
 */
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get("NODE_ENV") === "production";
  }

  get isDevelopment(): boolean {
    return this.get("NODE_ENV") === "development";
  }

  get isTest(): boolean {
    return this.get("NODE_ENV") === "test";
  }

  /** CORS origins, comma-separated in the environment. */
  get corsOrigins(): string[] {
    return this.get("CORS_ORIGIN")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  get sessionTtlMs(): number {
    return this.get("SESSION_TTL_HOURS") * 60 * 60 * 1000;
  }
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Parse the local root file without loading its migration/seed/admin keys
      // into the API process. Real deployments inject only runtime keys.
      ignoreEnvFile: true,
      validate: (environment) =>
        validateEnv({
          ...loadBackendRuntimeEnvironment(),
          ...environment,
        }),
      cache: true,
    }),
  ],
  providers: [
    {
      provide: AppConfig,
      useFactory: (config: ConfigService<Env, true>): AppConfig =>
        new AppConfig(config),
      inject: [ConfigService],
    },
  ],
  exports: [AppConfig],
})
export class AppConfigModule {}
