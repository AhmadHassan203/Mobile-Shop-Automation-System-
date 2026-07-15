import { expect, test, type Page } from "@playwright/test";
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

/**
 * The management flow below WRITES catalog rows. It is opt-in so that running
 * the suite against the development stack can never pollute owner data: only a
 * runner that has pointed the API at the disposable test database sets this.
 */
const mutationsAllowed = process.env.E2E_ALLOW_MUTATIONS === "1";

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

test.describe("product catalog workspace", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real catalog flow.",
  );

  test("loads the real catalog and its seeded product-model reference", async ({
    page,
  }) => {
    await signIn(page);

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
    await signOut(page);
  });

  test("never renders inventory or pricing values it cannot prove", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${frontendUrl}/inventory`);
    await expect(
      page.getByRole("heading", { name: "Product catalog" }),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ total$/u)).toBeVisible();

    // A catalog surface must never imply stock, money, or device identity.
    const table = page.getByRole("table").first();
    await expect(table).toBeVisible();
    const headers = (await table.locator("thead th").allInnerTexts())
      .join(" | ")
      .toLowerCase();
    for (const forbidden of [
      "stock",
      "imei",
      "cost",
      "price",
      "margin",
      "sold",
      "demand",
      "value",
    ]) {
      expect(headers).not.toContain(forbidden);
    }

    await signOut(page);
  });
});

test.describe("product catalog management", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real catalog flow.",
  );
  test.skip(
    !mutationsAllowed,
    "Set E2E_ALLOW_MUTATIONS=1 only when the API points at the disposable test database.",
  );

  test.setTimeout(120_000);

  test("creates, edits, searches, deactivates and reactivates real catalog records", async ({
    page,
  }) => {
    // Unique per run: these rows are permanent (catalog data is never
    // hard-deleted), so they must never collide with a previous run.
    const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
      .toString(36)
      .padStart(3, "0")}`.toUpperCase();
    const brandName = `E2E Brand ${runId}`;
    const categoryName = `E2E Category ${runId}`;
    const modelName = `E2E Model ${runId}`;
    const sku = `E2E-${runId}`;
    const variantName = `E2E Variant ${runId}`;
    const editedVariantName = `E2E Variant ${runId} Edited`;

    await signIn(page);
    await page.goto(`${frontendUrl}/inventory`);
    await expect(
      page.getByRole("heading", { name: "Product catalog" }),
    ).toBeVisible();

    // ---- Brand ----------------------------------------------------------
    await page.getByRole("tab", { name: "Brands" }).click();
    await expect(page).toHaveURL(/tab=brands/u);
    await page.getByRole("button", { name: /add brand|new brand/iu }).click();
    await page.getByLabel(/^name$/iu).fill(brandName);
    await page.getByRole("button", { name: /^(save|create)/iu }).click();
    await expect(page.getByText(brandName)).toBeVisible();

    // ---- Category -------------------------------------------------------
    await page.getByRole("tab", { name: "Categories" }).click();
    await expect(page).toHaveURL(/tab=categories/u);
    await page
      .getByRole("button", { name: /add category|new category/iu })
      .click();
    await page.getByLabel(/^name$/iu).fill(categoryName);
    await page.getByRole("button", { name: /^(save|create)/iu }).click();
    await expect(page.getByText(categoryName)).toBeVisible();

    // ---- Model ----------------------------------------------------------
    await page.getByRole("tab", { name: "Models" }).click();
    await expect(page).toHaveURL(/tab=models/u);
    await page.getByRole("button", { name: /add model|new model/iu }).click();
    await page.getByLabel(/^name$/iu).fill(modelName);
    await page.getByLabel(/brand/iu).selectOption({ label: brandName });
    await page.getByLabel(/category/iu).selectOption({ label: categoryName });
    await page.getByRole("button", { name: /^(save|create)/iu }).click();
    await expect(page.getByText(modelName)).toBeVisible();

    // ---- Product --------------------------------------------------------
    await page.getByRole("tab", { name: "Products" }).click();
    await page.getByRole("button", { name: "Add product" }).click();
    await page.getByLabel(/product model/iu).selectOption({ label: modelName });
    await page.getByLabel(/^sku$/iu).fill(sku);
    await page
      .getByLabel(/variant name|display name|^name$/iu)
      .first()
      .fill(variantName);
    await page
      .getByRole("button", { name: /^(save|create|add product)$/iu })
      .last()
      .click();
    await expect(page.getByText(sku)).toBeVisible();

    // ---- Search ---------------------------------------------------------
    await page.getByRole("searchbox").fill(sku);
    await page.getByRole("button", { name: /^search$/iu }).click();
    await expect(page.getByText(sku)).toBeVisible();
    await expect(page.getByText(/^1 total$/u)).toBeVisible();

    // ---- Edit -----------------------------------------------------------
    await page.getByRole("button", { name: /^edit/iu }).first().click();
    await page
      .getByLabel(/variant name|display name|^name$/iu)
      .first()
      .fill(editedVariantName);
    await page
      .getByRole("button", { name: /^(save|update)/iu })
      .last()
      .click();
    await expect(page.getByText(editedVariantName)).toBeVisible();

    // ---- Deactivate / reactivate ----------------------------------------
    await page
      .getByRole("button", { name: /^deactivate/iu })
      .first()
      .click();
    await expect(page.getByText("Inactive").first()).toBeVisible();
    await page
      .getByRole("button", { name: /^(reactivate|activate)/iu })
      .first()
      .click();
    await expect(page.getByText("Active").first()).toBeVisible();

    await signOut(page);
  });
});
