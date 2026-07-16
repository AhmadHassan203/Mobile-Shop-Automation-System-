import { expect, test, type Page } from "@playwright/test";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();

function apiPath(responseUrl: string, suffix: string): boolean {
  const pathname = new URL(responseUrl).pathname.replace(/\/$/u, "");
  return pathname.endsWith(suffix);
}

async function signIn(page: Page): Promise<void> {
  const credentials = ownerCredentials();
  await page.goto(`${frontendUrl}/login`);
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);

  const login = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      apiPath(response.url(), "/auth/login"),
  );
  await page.getByRole("button", { name: "Sign in securely" }).click();
  expect((await login).status()).toBe(200);
  await expect(page).toHaveURL(`${frontendUrl}/`);
}

test.use({ trace: "off" });

test.describe("live stock workspace", () => {
  test.setTimeout(30_000);

  test.skip(
    !ownerCredentialsConfigured(),
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real stock flow.",
  );

  test("loads every stock tab from the real authenticated API", async ({
    page,
  }) => {
    await signIn(page);

    const balances = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        apiPath(response.url(), "/inventory") &&
        new URL(response.url()).search.length > 0,
    );
    const locations = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        apiPath(response.url(), "/locations"),
    );
    await page.getByRole("link", { name: "Stock inventory" }).click();
    await expect(page).toHaveURL(`${frontendUrl}/stock`);
    await expect(
      page.getByRole("heading", { name: "Stock inventory" }),
    ).toBeVisible();
    expect((await balances).status()).toBe(200);
    expect((await locations).status()).toBe(200);

    const units = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        apiPath(response.url(), "/serialized-units"),
    );
    await page.getByRole("tab", { name: "Serialized units" }).click();
    expect((await units).status()).toBe(200);
    await expect(page).toHaveURL(/\/stock\?tab=units/u);

    const movements = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        apiPath(response.url(), "/inventory/movements"),
    );
    await page.getByRole("tab", { name: "Movements" }).click();
    expect((await movements).status()).toBe(200);
    await expect(page).toHaveURL(/\/stock\?tab=movements/u);

    await page.getByRole("tab", { name: "Locations" }).click();
    await expect(page).toHaveURL(/\/stock\?tab=locations/u);
    await expect(page.getByRole("table")).toBeVisible();

    const logout = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        apiPath(response.url(), "/auth/logout"),
    );
    await page.getByRole("button", { name: "Sign out" }).click();
    expect((await logout).status()).toBe(204);
    await expect(page).toHaveURL(/\/login\?reason=signed-out$/u);
  });
});
