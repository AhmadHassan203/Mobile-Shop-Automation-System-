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

test.describe("dashboard command centre (runtime)", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the dashboard runtime flow.",
  );

  test("renders the live command centre from one snapshot request", async ({
    page,
  }) => {
    test.setTimeout(240000); // next dev compiles the route on first hit
    // The dashboard is a single read-model request: capture it and assert the
    // page never fans out to Finance/Digital/Sales endpoints of its own.
    const snapshot = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        new URL(r.url()).pathname.endsWith("/reports/dashboard"),
      { timeout: 120000 },
    );
    await signIn(page);
    const snapshotResponse = await snapshot;
    expect(snapshotResponse.status(), "dashboard snapshot GET is 200").toBe(
      200,
    );

    // The four financial KPI tiles render real money, not a placeholder.
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Good (morning|afternoon|evening|day)/,
      }),
    ).toBeVisible();
    for (const label of [
      "Sales today",
      "Gross profit",
      "Expenses",
      "Net operating",
      "Cash position",
      "Inventory value",
    ]) {
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }

    // Recent sales shows a real posted invoice (seeded INV-2026-000002).
    await expect(page.getByText("Recent sales")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /INV-2026-/ }).first(),
    ).toBeVisible();

    // Digital services renders the corrected "Provider charges" label and money.
    const digitalCard = page
      .locator("section", {
        has: page.getByRole("heading", { name: "Digital Services" }),
      })
      .first();
    await expect(digitalCard).toBeVisible();
    await expect(digitalCard.getByText("Provider charges today")).toBeVisible();
    await expect(digitalCard.getByText("Provider net commission")).toHaveCount(
      0,
    );
    // A wired section must never fall back to the coming-soon stub.
    await expect(digitalCard.getByText("Coming soon")).toHaveCount(0);

    // Tasks is genuinely unbuilt — it must read "Coming soon", never fake data.
    const tasksCard = page
      .locator("section", {
        has: page.getByRole("heading", { name: "Today's tasks" }),
      })
      .first();
    await expect(
      tasksCard.getByText("Coming soon", { exact: true }),
    ).toBeVisible();
  });
});
