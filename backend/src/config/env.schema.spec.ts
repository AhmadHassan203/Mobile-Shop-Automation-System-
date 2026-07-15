import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.schema";

/** Minimum viable environment; individual tests override single keys. */
const BASE = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/mobileshop_dev",
  SESSION_SECRET: "a".repeat(64),
};

describe("environment validation", () => {
  it("accepts a minimal valid environment and applies defaults", () => {
    const env = validateEnv({ ...BASE });
    expect(env.NODE_ENV).toBe("development");
    expect(env.API_PORT).toBe(4000);
    expect(env.BUSINESS_TIMEZONE).toBe("Asia/Karachi");
    expect(env.BUSINESS_CURRENCY).toBe("PKR");
    expect(env.SESSION_TTL_HOURS).toBe(12);
    expect(env.DATABASE_HEALTH_TIMEOUT_MS).toBe(2_000);
    expect(env.API_RATE_LIMIT_TTL_SECONDS).toBe(60);
    expect(env.API_RATE_LIMIT_MAX_REQUESTS).toBe(300);
  });

  it("coerces numeric strings, since process.env values are always strings", () => {
    const env = validateEnv({
      ...BASE,
      API_PORT: "5000",
      SESSION_TTL_HOURS: "8",
    });
    expect(env.API_PORT).toBe(5000);
    expect(env.SESSION_TTL_HOURS).toBe(8);
  });

  it("coerces boolean-ish strings", () => {
    expect(validateEnv({ ...BASE, LOG_PRETTY: "true" }).LOG_PRETTY).toBe(true);
    expect(validateEnv({ ...BASE, LOG_PRETTY: "1" }).LOG_PRETTY).toBe(true);
    expect(validateEnv({ ...BASE, LOG_PRETTY: "false" }).LOG_PRETTY).toBe(
      false,
    );
    expect(validateEnv({ ...BASE, LOG_PRETTY: "0" }).LOG_PRETTY).toBe(false);
  });

  it("rejects a missing database URL", () => {
    expect(() => validateEnv({ SESSION_SECRET: "a".repeat(64) })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      validateEnv({ ...BASE, DATABASE_URL: "mysql://localhost/db" }),
    ).toThrow(/must be a PostgreSQL connection string/);
  });

  it("rejects a short session secret", () => {
    expect(() => validateEnv({ ...BASE, SESSION_SECRET: "too-short" })).toThrow(
      /at least 32/,
    );
  });

  it("rejects an out-of-range port", () => {
    expect(() => validateEnv({ ...BASE, API_PORT: "70000" })).toThrow();
    expect(() => validateEnv({ ...BASE, API_PORT: "0" })).toThrow();
  });

  it("rejects an unsafe database health timeout", () => {
    expect(() =>
      validateEnv({ ...BASE, DATABASE_HEALTH_TIMEOUT_MS: "99" }),
    ).toThrow(/DATABASE_HEALTH_TIMEOUT_MS/);
  });

  it("reports every problem at once rather than one per restart", () => {
    let message = "";
    try {
      validateEnv({
        DATABASE_URL: "nope",
        SESSION_SECRET: "short",
        API_PORT: "99999",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("SESSION_SECRET");
    expect(message).toContain("API_PORT");
  });
});

describe("production guardrails", () => {
  const PROD = {
    ...BASE,
    NODE_ENV: "production",
    SESSION_COOKIE_SECURE: "true",
  };

  it("accepts a correctly configured production environment", () => {
    const env = validateEnv({ ...PROD });
    expect(env.NODE_ENV).toBe("production");
    expect(env.SESSION_COOKIE_SECURE).toBe(true);
  });

  it("refuses to boot production with an insecure session cookie", () => {
    // Without Secure, the session cookie would travel in cleartext.
    expect(() =>
      validateEnv({ ...PROD, SESSION_COOKIE_SECURE: "false" }),
    ).toThrow(/SESSION_COOKIE_SECURE must be true in production/);
  });

  it("refuses to boot production with the placeholder session secret", () => {
    expect(() =>
      validateEnv({
        ...PROD,
        SESSION_SECRET: "CHANGE_ME_32_BYTE_HEX_SECRET_PLACEHOLDER",
      }),
    ).toThrow(/placeholder/);
  });

  it("refuses to boot production with the placeholder database URL", () => {
    expect(() =>
      validateEnv({
        ...PROD,
        DATABASE_URL: "postgresql://app:CHANGE_ME@localhost:5432/db",
      }),
    ).toThrow(/placeholder/);
  });

  it("refuses to boot production with pretty (unstructured) logs", () => {
    expect(() => validateEnv({ ...PROD, LOG_PRETTY: "true" })).toThrow(
      /structured JSON logs/,
    );
  });

  it("refuses S3 storage without complete credentials", () => {
    expect(() => validateEnv({ ...PROD, STORAGE_DRIVER: "s3" })).toThrow(
      /S3_BUCKET/,
    );
    expect(() =>
      validateEnv({
        ...PROD,
        STORAGE_DRIVER: "s3",
        S3_BUCKET: "b",
        S3_ACCESS_KEY_ID: "k",
        S3_SECRET_ACCESS_KEY: "s",
      }),
    ).not.toThrow();
  });

  it("allows the same relaxed settings outside production", () => {
    // Development must stay ergonomic; only production is locked down.
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: "development", LOG_PRETTY: "true" }),
    ).not.toThrow();
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: "development",
        SESSION_COOKIE_SECURE: "false",
      }),
    ).not.toThrow();
  });
});
