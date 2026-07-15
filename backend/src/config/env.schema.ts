import { z } from 'zod';

/**
 * Environment schema.
 *
 * The application refuses to boot on invalid configuration rather than failing
 * later in a request. A typo in SESSION_TTL_HOURS should stop the process at
 * startup, not silently expire every cashier's session mid-shift.
 */

const booleanFromString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const portNumber = z.coerce.number().int().min(1).max(65_535);

export const envSchema = z
  .object({
    // --- Runtime -------------------------------------------------------------
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // --- Database ------------------------------------------------------------
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
        message: 'DATABASE_URL must be a PostgreSQL connection string',
      }),
    TEST_DATABASE_URL: z.string().optional(),

    // --- API -----------------------------------------------------------------
    API_PORT: portNumber.default(4000),
    API_HOST: z.string().default('0.0.0.0'),
    API_GLOBAL_PREFIX: z.string().default('api'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    // --- Sessions ------------------------------------------------------------
    // 32 bytes hex = 64 chars. Enforced so a weak secret cannot reach production.
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),
    SESSION_COOKIE_NAME: z.string().default('mshop_session'),
    SESSION_COOKIE_SECURE: booleanFromString.default(false),
    SESSION_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    AUTH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),

    // --- Business ------------------------------------------------------------
    BUSINESS_TIMEZONE: z.string().default('Asia/Karachi'),
    BUSINESS_CURRENCY: z.string().length(3).default('PKR'),

    // --- Observability -------------------------------------------------------
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: booleanFromString.default(false),
    SENTRY_DSN: z.string().optional(),

    // --- Storage -------------------------------------------------------------
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: z.string().default('./.storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    // Production guardrails. These are cheap to check and expensive to get wrong.
    if (!env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'SESSION_COOKIE_SECURE must be true in production (session cookie would travel in cleartext)',
      });
    }
    if (env.SESSION_SECRET.includes('CHANGE_ME')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET still holds the .env.example placeholder',
      });
    }
    if (env.DATABASE_URL.includes('CHANGE_ME')) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL still holds the .env.example placeholder',
      });
    }
    if (env.LOG_PRETTY) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_PRETTY'],
        message: 'LOG_PRETTY must be false in production (structured JSON logs are required)',
      });
    }
    if (env.STORAGE_DRIVER === 's3' && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validate process environment at boot.
 * Throws with every problem listed at once, so a misconfigured deploy is fixed
 * in one pass instead of one variable per restart.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
