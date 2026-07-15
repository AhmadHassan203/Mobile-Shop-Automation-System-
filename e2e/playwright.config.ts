import { defineConfig } from "@playwright/test";

const apiBaseURL = `${(process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "")}/`;
const configuredBrowserChannel = process.env.E2E_BROWSER_CHANNEL?.trim();
const browserChannel =
  configuredBrowserChannel === undefined ||
  configuredBrowserChannel.length === 0
    ? undefined
    : configuredBrowserChannel;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  timeout: 15_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: apiBaseURL,
    ...(browserChannel === undefined ? {} : { channel: browserChannel }),
    extraHTTPHeaders: {
      Accept: "application/json",
    },
    trace: "retain-on-failure",
  },
});
