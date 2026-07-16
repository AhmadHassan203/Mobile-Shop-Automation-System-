import { expect, test } from "@playwright/test";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();

test.use({ trace: "off" });
test.setTimeout(60_000);

test.describe("Used intake workspace", () => {
  test.skip(
    !ownerCredentialsConfigured(),
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the authenticated Used Intake check.",
  );

  test("shows the complete quarantine workflow without fake verification", async ({
    page,
  }) => {
    const credentials = ownerCredentials();
    await page.goto(`${frontendUrl}/login`);
    await page.getByLabel("Email address").fill(credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials.password);
    const loginResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/auth/login"),
    );
    await page.getByRole("button", { name: "Sign in securely" }).click();
    expect((await loginResponse).status()).toBe(200);

    await page.goto(`${frontendUrl}/used-intake`);
    await expect(
      page.getByRole("heading", { name: "Used Device Intake & Trade-in" }),
    ).toBeVisible();
    await expect(page.getByText("A used device cannot be marked saleable")).toBeVisible();
    await expect(page.getByText("Backend gap registry")).toBeVisible();
    await expect(page.getByText("Quarantine to saleable")).toBeVisible();

    await page
      .getByRole("button", { name: "New intake", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "New used-device intake" }),
    ).toBeVisible();
    await expect(page.getByText("Five-gate review")).toBeVisible();
    await expect(page.getByText("Saleable: NO")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save → send to Quarantine" }),
    ).toBeDisabled();
    await expect(page.getByText("PTA Approved", { exact: false })).toHaveCount(0);

    const horizontalOverflow = await page.evaluate(
      "document.documentElement.scrollWidth > document.documentElement.clientWidth",
    );
    expect(horizontalOverflow).toBe(false);
  });
});
