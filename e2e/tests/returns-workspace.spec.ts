import { expect, test, type Page } from "@playwright/test";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();
const credentialsConfigured = ownerCredentialsConfigured();

/**
 * The intake flow below issues real `GET /returns/eligibility` reads (no write).
 * The mutation-guarded block is opt-in via E2E_ALLOW_MUTATIONS=1 so the suite can
 * never touch owner data — it only runs when the API points at the disposable
 * test database.
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

test.describe("returns workspace", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the real returns flow.",
  );

  test("authenticated user loads the real returns queue from the API", async ({
    page,
  }) => {
    await signIn(page);

    // Navigating to Returns must issue a real, authenticated GET /returns.
    const returnsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.endsWith("/returns"),
    );
    await page.getByRole("link", { name: /Returns \/ warranty/u }).click();
    const response = await returnsResponse;

    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(`${frontendUrl}/returns`);
    // The workspace rendered from real data (heading + the intake CTA), not a
    // static "unavailable" placeholder.
    await expect(
      page.getByRole("heading", { level: 1, name: /returns/iu }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /new return/iu }).first(),
    ).toBeVisible();

    await signOut(page);
  });

  test("returns queue only renders values it can prove", async ({ page }) => {
    await signIn(page);
    await page.goto(`${frontendUrl}/returns`);
    await expect(
      page.getByRole("heading", { level: 1, name: /returns/iu }),
    ).toBeVisible();

    // A fresh disposable database has no posted returns; the workspace must
    // honestly say so rather than fabricate rows or KPIs.
    const emptyState = page.getByText(/no returns yet/iu);
    const queueTable = page.getByRole("table").first();
    await expect(emptyState.or(queueTable)).toBeVisible();

    await signOut(page);
  });

  test.describe("controlled intake (mutations)", () => {
    test.skip(
      !mutationsAllowed,
      "Set E2E_ALLOW_MUTATIONS=1 only when the API points at the disposable test database.",
    );
    test.setTimeout(60_000);

    test("intake drawer runs a real eligibility lookup", async ({ page }) => {
      await signIn(page);
      await page.goto(`${frontendUrl}/returns`);
      await expect(
        page.getByRole("heading", { level: 1, name: /returns/iu }),
      ).toBeVisible();

      await page.getByRole("button", { name: /new return/iu }).first().click();
      const invoiceField = page.getByLabel(/original invoice number/iu);
      await expect(invoiceField).toBeVisible();

      // An invoice that cannot exist proves the eligibility endpoint is wired and
      // the "not found" path is real, without writing anything.
      const bogusInvoice = `INV-NO-SUCH-${Date.now().toString(36).toUpperCase()}`;
      const eligibilityResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/returns/eligibility"),
      );
      await invoiceField.fill(bogusInvoice);
      await page.getByRole("button", { name: /check eligibility/iu }).click();
      const response = await eligibilityResponse;
      // The API answered (200 not-returnable, or a 4xx not-found); either way the
      // UI drove a real authenticated request, not a mock.
      expect([200, 404, 409, 422]).toContain(response.status());
      await expect(
        page.getByText(/no matching return|not found|could not/iu).first(),
      ).toBeVisible();

      // Close the drawer so the overlay does not intercept the sign-out control.
      await page.getByRole("button", { name: /close drawer/iu }).click();
      await signOut(page);
    });
  });
});
