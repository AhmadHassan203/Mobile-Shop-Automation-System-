import { expect, test, type Page } from "@playwright/test";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();
const credentialsConfigured = ownerCredentialsConfigured();

async function signIn(page: Page): Promise<void> {
  const credentials = ownerCredentials();
  await page.goto(`${frontendUrl}/login`);
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(`${frontendUrl}/`);
}

test.describe("finance & cash command centre (runtime)", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the finance runtime flow.",
  );

  test("renders every card live with no obsolete pending copy", async ({
    page,
  }) => {
    test.setTimeout(240000);
    await signIn(page);

    const summary = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        new URL(r.url()).pathname.endsWith("/reports/dashboard/summary"),
      { timeout: 120000 },
    );
    await page.goto(`${frontendUrl}/finance`, { timeout: 120000 });
    expect((await summary).status(), "finance summary GET is 200").toBe(200);

    await expect(
      page.getByRole("heading", { level: 1, name: "Finance & Cash" }),
    ).toBeVisible();

    // Financial KPIs + P&L are live money, not the old "—" placeholder.
    for (const label of [
      "Sales revenue",
      "Gross profit",
      "Operating expenses",
      "Estimated net operating",
    ]) {
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(page.getByText("Profit & loss—today")).toBeVisible();

    // Contra-revenue memo — discounts / returns / net sales are populated.
    await expect(page.getByText("Discounts given today")).toBeVisible();
    await expect(page.getByText("Net sales after returns")).toBeVisible();

    // Digital + cash from the shared dashboard read model.
    await expect(
      page.getByText("Digital sent", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Net digital earnings", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Provider charges", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Cash position", { exact: true }).first(),
    ).toBeVisible();

    // Every KPI card shows real currency, never the "—" placeholder.
    const kpiSection = page.locator(
      'section[aria-label="Finance key performance indicators"]',
    );
    await expect(kpiSection.getByText("—")).toHaveCount(0);
    await expect(kpiSection.getByText(/PKR/).first()).toBeVisible();

    // The obsolete "pending" copy must be gone entirely.
    const body = await page.locator("body").innerText();
    for (const stale of [
      "Sales ledger pending",
      "Margin analytics pending",
      "Expense ledger pending",
      "Finance read model pending",
      "Settlement API pending",
      "stay blank until",
    ]) {
      expect(body, `stale copy must be gone: ${stale}`).not.toContain(stale);
    }
  });
});
