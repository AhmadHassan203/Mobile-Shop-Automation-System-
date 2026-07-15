import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 no longer accepts `url` inside the datasource block; migration and
 * introspection read the connection string from here, while the runtime client
 * is constructed with a driver adapter (see src/client.ts).
 *
 * DATABASE_URL is read from the repository-root .env, which is git-ignored.
 * No credential is ever committed (13_ §23.23).
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx seeds/index.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
