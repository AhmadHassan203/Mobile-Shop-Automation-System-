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

test.describe("demand workspace", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real demand flow.",
  );

  test("authenticated user loads the real demand list from the API", async ({
    page,
  }) => {
    await signIn(page);

    const demandResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.endsWith("/demand"),
    );
    await page
      .getByRole("link", { name: /Demand/u })
      .first()
      .click();
    const response = await demandResponse;

    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(`${frontendUrl}/demand`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await signOut(page);
  });
});
