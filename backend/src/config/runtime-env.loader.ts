import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import type { Env } from "./env.schema";

/**
 * Keys the API process is allowed to receive from a developer env file.
 * Migration, shadow, test, seed, PostgreSQL-admin and frontend-only values are
 * deliberately absent even though the repository-root template contains them.
 */
export const BACKEND_RUNTIME_ENV_KEYS = [
  "NODE_ENV",
  "DATABASE_URL",
  "DATABASE_HEALTH_TIMEOUT_MS",
  "API_PORT",
  "API_HOST",
  "API_GLOBAL_PREFIX",
  "CORS_ORIGIN",
  "API_RATE_LIMIT_TTL_SECONDS",
  "API_RATE_LIMIT_MAX_REQUESTS",
  "SESSION_SECRET",
  "SESSION_TTL_HOURS",
  "SESSION_COOKIE_NAME",
  "SESSION_COOKIE_SECURE",
  "SESSION_COOKIE_SAMESITE",
  "AUTH_RATE_LIMIT_TTL_SECONDS",
  "AUTH_RATE_LIMIT_MAX_ATTEMPTS",
  "BUSINESS_TIMEZONE",
  "BUSINESS_CURRENCY",
  "LOG_LEVEL",
  "LOG_PRETTY",
  "SENTRY_DSN",
  "STORAGE_DRIVER",
  "STORAGE_LOCAL_PATH",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const satisfies readonly (keyof Env)[];

export function selectBackendRuntimeEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const key of BACKEND_RUNTIME_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) selected[key] = value;
  }
  return selected;
}

function runtimeEnvCandidates(workingDirectory: string): string[] {
  const packageDirectory =
    path.basename(workingDirectory).toLowerCase() === "backend"
      ? workingDirectory
      : path.join(workingDirectory, "backend");
  return [
    path.join(packageDirectory, ".env"),
    path.join(packageDirectory, "..", ".env"),
  ];
}

/** Parse without mutating process.env, then return only the API allow-list. */
export function loadBackendRuntimeEnvironment(
  workingDirectory = process.cwd(),
): Record<string, string> {
  const envPath = runtimeEnvCandidates(workingDirectory).find(existsSync);
  if (envPath === undefined) return {};
  return selectBackendRuntimeEnvironment(parse(readFileSync(envPath)));
}
