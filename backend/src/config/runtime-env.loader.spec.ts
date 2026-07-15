import { describe, expect, it } from "vitest";
import { selectBackendRuntimeEnvironment } from "./runtime-env.loader";

describe("backend runtime environment boundary", () => {
  it("keeps CLI, seed, admin and frontend-only values out of the API config", () => {
    const selected = selectBackendRuntimeEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://runtime-only",
      SESSION_SECRET: "runtime-session-secret",
      MIGRATION_DATABASE_URL: "postgresql://ddl-must-not-enter-api",
      SHADOW_DATABASE_URL: "postgresql://shadow-must-not-enter-api",
      TEST_MIGRATION_DATABASE_URL: "postgresql://test-ddl-must-not-enter-api",
      POSTGRES_SUPERUSER_PASSWORD: "admin-must-not-enter-api",
      SEED_OWNER_PASSWORD: "seed-must-not-enter-api",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/api/v1",
    });

    expect(selected).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://runtime-only",
      SESSION_SECRET: "runtime-session-secret",
    });
    expect(Object.keys(selected)).not.toContain("MIGRATION_DATABASE_URL");
    expect(Object.keys(selected)).not.toContain("SEED_OWNER_PASSWORD");
  });
});
