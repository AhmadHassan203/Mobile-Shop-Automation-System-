import { expect, test, type Page } from "@playwright/test";
import {
  frontendBaseUrl,
  ownerCredentials,
  ownerCredentialsConfigured,
} from "./support/environment.js";

const frontendUrl = frontendBaseUrl();
const credentialsConfigured = ownerCredentialsConfigured();

// Backend base URL (browser hits it directly via NEXT_PUBLIC_API_BASE_URL).
const apiBase = process.env.E2E_API_BASE_URL ?? "http://localhost:4000/api/v1";

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

/** Navigate to a page, assert its module GET returns 200 and the page renders. */
async function smokePage(
  page: Page,
  route: string,
  endpointMatch: (pathname: string) => boolean,
): Promise<void> {
  const waiter = page.waitForResponse(
    (r) => r.request().method() === "GET" && endpointMatch(new URL(r.url()).pathname),
    { timeout: 60000 },
  );
  await page.goto(`${frontendUrl}${route}`, { timeout: 60000 });
  const response = await waiter;
  expect(response.status(), `${route} module GET must be 200`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("digital + reports read-models (runtime)", () => {
  test.skip(
    !credentialsConfigured,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run the read-model runtime flow.",
  );

  test("each read-model page loads real authenticated data", async ({ page }) => {
    test.setTimeout(240000); // next dev compiles routes on demand on first hit
    await signIn(page);
    await smokePage(page, "/digital/history", (p) => p.endsWith("/external"));
    await smokePage(page, "/digital/balances", (p) => p.endsWith("/external/balances"));
    await smokePage(page, "/digital/commission", (p) => p.endsWith("/external/commission"));
    await smokePage(page, "/reports", (p) => /\/reports\/dashboard\//u.test(p));
    await smokePage(page, "/intelligence", (p) =>
      p.endsWith("/reports/dashboard/reorder-suggestions"),
    );
    await signOut(page);
  });

  test("live API: routes resolve, shapes hold, money totals cross-check against raw rows", async ({
    page,
  }) => {
    await signIn(page);
    // page.request shares the browser's authenticated session cookie.
    const api = page.request;

    // --- balances: 200 + shape + net = received - sent ---
    const balancesRes = await api.get(`${apiBase}/external/balances`);
    expect(balancesRes.status(), "GET /external/balances").toBe(200);
    const balances = await balancesRes.json();
    expect(typeof balances.businessDate).toBe("string");
    expect(Array.isArray(balances.providers)).toBe(true);
    for (const row of balances.providers) {
      expect(
        row.netMovementMinor,
        `balances net = received - sent for ${row.provider}`,
      ).toBe(row.amountReceivedTodayMinor - row.amountSentTodayMinor);
      expect(Number.isInteger(row.amountSentTodayMinor)).toBe(true);
      expect(Number.isInteger(row.amountReceivedTodayMinor)).toBe(true);
    }

    // --- commission: 200 + shape + net = gross - cost + independent reduce of list ---
    const commRes = await api.get(`${apiBase}/external/commission?period=month`);
    expect(commRes.status(), "GET /external/commission").toBe(200);
    const commission = await commRes.json();
    for (const bucket of [commission.totals, ...commission.byProvider, ...commission.byType]) {
      expect(bucket.netCommissionMinor, "net = gross - cost").toBe(
        bucket.grossFeeMinor - bucket.providerCostMinor,
      );
    }

    // Independent cross-check: reduce raw list rows in the commission window and
    // compare to the SQL aggregate (raw per-row values vs groupBy totals).
    const from = commission.from as string;
    const to = commission.to as string;
    const listRes = await api.get(
      `${apiBase}/external?page=1&pageSize=100&from=${from}&to=${to}`,
    );
    expect(listRes.status(), "GET /external list").toBe(200);
    const list = await listRes.json();
    const rows: Array<{ feeChargedMinor: number; providerChargeMinor: number }> =
      list.items ?? list.data ?? list.rows ?? [];
    const gross = rows.reduce((s, r) => s + r.feeChargedMinor, 0);
    const cost = rows.reduce((s, r) => s + r.providerChargeMinor, 0);
    expect(commission.totals.grossFeeMinor, "gross fee == Σ feeChargedMinor (raw)").toBe(gross);
    expect(commission.totals.providerCostMinor, "provider cost == Σ providerChargeMinor (raw)").toBe(
      cost,
    );
    expect(commission.totals.transactionCount, "count == raw row count").toBe(rows.length);

    // --- reports endpoints: 200 + shape ---
    const trendRes = await api.get(`${apiBase}/reports/dashboard/sales-trend?days=7`);
    expect(trendRes.status(), "GET /reports/dashboard/sales-trend").toBe(200);
    const trend = await trendRes.json();
    expect(trend.points.length, "sales-trend fills all requested days").toBe(trend.days);
    const topRes = await api.get(`${apiBase}/reports/dashboard/top-products?period=month`);
    expect(topRes.status(), "GET /reports/dashboard/top-products").toBe(200);
    const reorderRes = await api.get(
      `${apiBase}/reports/dashboard/reorder-suggestions?windowDays=30`,
    );
    expect(reorderRes.status(), "GET /reports/dashboard/reorder-suggestions").toBe(200);

    // --- route resolution: static routes not shadowed; :id resolves ---
    // A well-formed but non-existent UUID must 404 (proves :id handler ran, not balances/commission).
    const ghost = "00000000-0000-4000-8000-000000000000";
    const ghostRes = await api.get(`${apiBase}/external/${ghost}`);
    expect(ghostRes.status(), "GET /external/<nonexistent-uuid> must be 404").toBe(404);
    // A real id (if any transactions exist) must 200.
    if (rows.length > 0 && (list.items?.[0]?.id ?? list.data?.[0]?.id)) {
      const realId = (list.items ?? list.data)[0].id as string;
      const realRes = await api.get(`${apiBase}/external/${realId}`);
      expect(realRes.status(), "GET /external/<real-id> must be 200").toBe(200);
    }

    await signOut(page);
  });
});
