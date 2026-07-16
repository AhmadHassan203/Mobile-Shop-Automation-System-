import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();

test.use({ trace: "off" });

test.describe("Sell workspace", () => {
  test.skip(
    !ownerCredentialsConfigured(),
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the authenticated Sell check.",
  );

  test("opens the complete prototype-aligned POS shell with live data boundaries", async ({
    page,
  }) => {
    const credentials = ownerCredentials();

    await page.goto(`${frontendUrl}/login`);
    await page.getByLabel("Email address").fill(credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials.password);

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/auth/login"),
    );
    await page.getByRole("button", { name: "Sign in securely" }).click();
    expect((await loginResponsePromise).status()).toBe(200);

    await page.goto(`${frontendUrl}/sell`);
    await expect(
      page.getByRole("heading", { name: "Sell — Point of Sale" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Products", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cart", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Customer", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Payment", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Search product, brand, SKU or IMEI"),
    ).toBeVisible();
    await expect(page.getByText("Live pricing", { exact: true })).toBeVisible();

    const horizontalOverflow = await page.evaluate(
      "document.documentElement.scrollWidth > document.documentElement.clientWidth",
    );
    expect(horizontalOverflow).toBe(false);

    if (!process.env.CI && process.env.E2E_CAPTURE_SELL_SCREENSHOT === "1") {
      await page.screenshot({
        fullPage: true,
        path: path.resolve(
          import.meta.dirname,
          "../test-results/sell-workspace.png",
        ),
      });
    }
  });
});
