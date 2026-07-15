import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { defineConfig, env } from "prisma/config";

const workingDirectory = process.cwd();
const databaseRoot = existsSync(
  path.join(workingDirectory, "prisma", "schema.prisma"),
)
  ? workingDirectory
  : path.join(workingDirectory, "database");

// Parse the root file without loading runtime/session/seed values into the
// migration process. Explicit process variables still take precedence.
const rootEnvironmentPath = path.join(databaseRoot, "..", ".env");
if (existsSync(rootEnvironmentPath)) {
  const fileEnvironment = parse(readFileSync(rootEnvironmentPath));
  for (const key of [
    "MIGRATION_DATABASE_URL",
    "SHADOW_DATABASE_URL",
  ] as const) {
    const value = fileEnvironment[key];
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 no longer accepts `url` inside the datasource block; migration and
 * introspection read the connection string from here, while the runtime client
 * is constructed with a driver adapter (see src/client.ts).
 *
 * Only migration and shadow URLs are selected from the git-ignored root file;
 * runtime, session, admin and seed credentials stay outside this process.
 * No credential is ever committed (13_ §23.23).
 */
export default defineConfig({
  schema: path.join(databaseRoot, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(databaseRoot, "prisma", "migrations"),
    seed: "tsx seeds/index.ts",
  },
  datasource: {
    // Migrations use a DDL-capable role. Runtime code continues to use the
    // least-privilege DATABASE_URL through createPrismaClient().
    url: env("MIGRATION_DATABASE_URL"),
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
});
