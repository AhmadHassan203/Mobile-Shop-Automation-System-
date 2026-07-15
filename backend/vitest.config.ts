import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { resolve } from 'node:path';

/**
 * Environment for tests.
 *
 * Must be set here rather than in a `beforeAll`: `ConfigModule.forRoot` validates
 * the environment when the `@Module` decorator is evaluated, which happens at
 * import time — before any hook runs. These are non-secret test placeholders.
 *
 * TEST_DATABASE_URL points at a database that integration tests may drop and
 * recreate; it must never reference development or production data.
 */
const TEST_ENV = {
  TZ: 'UTC',
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgresql://mobileshop_app:test@localhost:5432/mobileshop_test',
  SESSION_SECRET: 'test-session-secret-not-used-outside-tests-0123456789',
  LOG_LEVEL: 'silent',
  LOG_PRETTY: 'false',
};

/**
 * NestJS relies on `emitDecoratorMetadata`, which esbuild (vitest's default
 * transformer) does not emit. SWC does, so dependency injection resolves in tests
 * exactly as it does at runtime.
 */
export default defineConfig({
  // Vite 8 transforms with Oxc by default, which does not emit decorator metadata.
  // Disable it explicitly so SWC below owns the transform and NestJS DI resolves.
  oxc: false,
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
    }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          env: TEST_ENV,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.e2e-spec.ts'],
          env: TEST_ENV,
          // Integration tests share a database; running them in one process
          // avoids cross-file interference on the same tables.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
