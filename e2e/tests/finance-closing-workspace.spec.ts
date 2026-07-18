import { expect, test, type Page } from "@playwright/test";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();
const credentialsConfigured = ownerCredentialsConfigured();

test.use({ trace: "off" });

async function signIn(page: Page): Promise<void> {
  const credentials = ownerCredentials();
  await page.goto(`${frontendUrl}/login`);
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL((url) => {
    const expected = new URL(frontendUrl);
    return url.origin === expected.origin && url.pathname === "/login";
  });
}

test.describe("finance + daily closing workspaces", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real finance/closing flow.",
  );

  test("finance loads real expenses and offers the record action", async ({
    page,
  }) => {
    await signIn(page);
    const expensesResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.endsWith("/expenses"),
    );
    await page.goto(`${frontendUrl}/finance`);
    const response = await expensesResponse;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /record expense/iu }).first(),
    ).toBeVisible();
    await signOut(page);
  });

  test("daily closing loads the real cash session state", async ({ page }) => {
    await signIn(page);
    const sessionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        /\/cash-sessions(\/current)?$/u.test(new URL(response.url()).pathname),
    );
    await page.goto(`${frontendUrl}/closing`);
    const response = await sessionResponse;
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Either an open-session control or the close control is present (real state).
    await expect(
      page.getByRole("button", { name: /open cash|close/iu }).first(),
    ).toBeVisible();
    await signOut(page);
  });
});
