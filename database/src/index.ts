/**
 * Database client factory.
 *
 * Prisma 7 constructs the client with a driver adapter rather than reading a URL
 * from the schema. This module is the only place that builds a PrismaClient, so
 * connection policy (pool size, timeouts, logging) is configured once.
 *
 * The backend consumes this through its own PrismaService, which owns lifecycle
 * and transaction helpers. The frontend must NEVER import it (13_ §1.6:
 * "Do not connect the frontend directly to PostgreSQL").
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';

export * from '../generated/client';

export interface DatabaseClientOptions {
  /** PostgreSQL connection string. Required; never defaulted to a live database. */
  readonly connectionString: string;
  /** Maximum pooled connections. Keep well under PostgreSQL's max_connections. */
  readonly maxConnections?: number;
  /** Emit query logs. Development only — queries can contain business data. */
  readonly logQueries?: boolean;
}

export function createPrismaClient(options: DatabaseClientOptions): PrismaClient {
  if (!options.connectionString) {
    throw new Error('createPrismaClient requires a connectionString');
  }

  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });

  return new PrismaClient({
    adapter,
    log: options.logQueries === true ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
