import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();
const credentialsConfigured = ownerCredentialsConfigured();
const catalogScreenshotPath = path.resolve(
  import.meta.dirname,
  "../test-results/product-catalog.png",
);

test.use({ trace: "off" });

test.describe("product catalog workspace", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real catalog flow.",
  );

  test("loads the real catalog and its seeded product-model reference", async ({
    page,
  }) => {
    const credentials = ownerCredentials();

    await page.goto(`${frontendUrl}/login`);
    await page.getByLabel("Email address").fill(credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(credentials.password);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page).toHaveURL(`${frontendUrl}/`);

    const productsResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname.endsWith("/products")
      );
    });
    await page.getByRole("link", { name: "Product catalog" }).click();
    const productsResponse = await productsResponsePromise;

    expect(productsResponse.status()).toBe(200);
    await expect(page).toHaveURL(`${frontendUrl}/inventory`);
    await expect(
      page.getByRole("heading", { name: "Product catalog" }),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ total$/u)).toBeVisible();

    await page.getByRole("button", { name: "Add product" }).click();
    await expect(
      page.getByRole("heading", { name: "Add product" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", {
        name: /Unbranded.*Generic smartphone.*Smartphones/u,
      }),
    ).toBeAttached();
    await expect(
      page.getByText(
        /does not add physical stock, IMEIs, cost, or a selling price/u,
      ),
    ).toBeVisible();

    if (process.env.E2E_CAPTURE_CATALOG_SCREENSHOT === "1") {
      await page.screenshot({
        fullPage: true,
        path: catalogScreenshotPath,
      });
    }

    await page.getByRole("button", { name: "Close add product" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL((url) => {
      const expected = new URL(frontendUrl);
      return url.origin === expected.origin && url.pathname === "/login";
    });
  });
});
