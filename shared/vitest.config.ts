import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    // The business timezone helpers must behave identically regardless of the
    // machine's local zone, so pin the runner to UTC.
    env: { TZ: "UTC" },
  },
});
