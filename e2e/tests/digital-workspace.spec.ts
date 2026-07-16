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

test.describe("digital external-transaction workspace", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real digital flow.",
  );

  test("authenticated user loads the real external-transaction workspace", async ({
    page,
  }) => {
    await signIn(page);

    // Loading the digital new-transaction screen issues a real GET /external.
    const externalResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.endsWith("/external"),
    );
    await page.goto(`${frontendUrl}/digital/new`);
    const response = await externalResponse;

    expect(response.status()).toBe(200);
    // The screen rendered from real authenticated state: the recording form and
    // its submit control are present (not a static "unavailable" placeholder).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /record/iu }).first(),
    ).toBeVisible();

    await signOut(page);
  });
});
