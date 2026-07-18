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

test.describe("customers workspace", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real customers flow.",
  );

  test("authenticated user loads the real customers list from the API", async ({
    page,
  }) => {
    await signIn(page);

    const customersResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.endsWith("/customers"),
    );
    await page
      .getByRole("link", { name: /Customers/u })
      .first()
      .click();
    const response = await customersResponse;

    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(`${frontendUrl}/customers`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // A permission-gated primary action proves the workspace rendered from real
    // authenticated state, not a static placeholder.
    await expect(
      page.getByRole("button", { name: /add customer/iu }).first(),
    ).toBeVisible();

    await signOut(page);
  });
});
