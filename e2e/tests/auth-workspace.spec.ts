import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();
const credentialsConfigured = ownerCredentialsConfigured();
const workspaceScreenshotPath = path.resolve(
  import.meta.dirname,
  "../test-results/authenticated-workspace.png",
);

function isApiResponse(responseUrl: string, route: string): boolean {
  const pathname = new URL(responseUrl).pathname.replace(/\/$/u, "");
  return pathname.endsWith(`/auth/${route}`);
}

function authMeUrl(loginResponseUrl: string): string {
  const url = new URL(loginResponseUrl);
  const loginSuffix = "/auth/login";
  const pathname = url.pathname.replace(/\/$/u, "");

  if (!pathname.endsWith(loginSuffix)) {
    throw new Error("The login response did not come from the auth API.");
  }

  url.pathname = `${pathname.slice(0, -loginSuffix.length)}/auth/me`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isFrontendPath(actualUrl: URL, expectedPath: string): boolean {
  const expectedOrigin = new URL(frontendUrl).origin;
  return (
    actualUrl.origin === expectedOrigin && actualUrl.pathname === expectedPath
  );
}

// A failed login trace can retain form actions. Keep this credential-bearing
// file trace-free; health tests retain their usual diagnostic traces.
test.use({ trace: "off" });

test.describe("authenticated workspace", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real auth flow.",
  );

  test("signs in, reaches the protected workspace, and revokes access on logout", async ({
    page,
  }) => {
    const credentials = ownerCredentials();

    await page.goto(`${frontendUrl}/login`);
    await expect(
      page.getByRole("heading", { name: "Sign in to MobileShop OS" }),
    ).toBeVisible();

    await page.getByLabel("Email address").fill(credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials.password);

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        isApiResponse(response.url(), "login"),
    );
    await page.getByRole("button", { name: "Sign in securely" }).click();
    const loginResponse = await loginResponsePromise;

    expect(loginResponse.status()).toBe(200);
    await expect(page).toHaveURL((url) => isFrontendPath(url, "/"));
    await expect(page.locator('[aria-label^="Signed in as "]')).toBeVisible();

    const meUrl = authMeUrl(loginResponse.url());
    const authenticatedResponse = await page.context().request.get(meUrl, {
      failOnStatusCode: false,
      headers: { Accept: "application/json" },
    });
    expect(authenticatedResponse.status()).toBe(200);

    if (
      !process.env.CI &&
      process.env.E2E_CAPTURE_WORKSPACE_SCREENSHOT === "1"
    ) {
      await page.screenshot({
        fullPage: true,
        path: workspaceScreenshotPath,
      });
    }

    const logoutResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        isApiResponse(response.url(), "logout"),
    );
    await page.getByRole("button", { name: "Sign out" }).click();
    const logoutResponse = await logoutResponsePromise;

    expect(logoutResponse.status()).toBe(204);
    await expect(page).toHaveURL((url) => isFrontendPath(url, "/login"));

    const endedSessionResponse = await page.context().request.get(meUrl, {
      failOnStatusCode: false,
      headers: { Accept: "application/json" },
    });
    expect(endedSessionResponse.status()).toBe(401);

    await page.goto(frontendUrl);
    await expect(page).toHaveURL((url) => isFrontendPath(url, "/login"));
    await expect(
      page.getByRole("heading", { name: "Sign in to MobileShop OS" }),
    ).toBeVisible();
  });
});
