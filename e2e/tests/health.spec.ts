import { expect, test } from "@playwright/test";

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

test.describe("API health contract", () => {
  test("reports a live API process without exposing internals", async ({
    request,
  }) => {
    const response = await request.get("health", { failOnStatusCode: false });
    const body = await response.text();

    expect(response.status(), `health response body: ${body}`).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["x-request-id"]).toBeTruthy();

    const payload = asRecord(JSON.parse(body) as unknown, "health payload");
    expect(payload.status).toBe("ok");
    expect(typeof payload.name).toBe("string");
    expect(payload.apiVersion).toMatch(/^v\d+$/);
    expect(typeof payload.uptimeSeconds).toBe("number");
    expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(String(payload.timestamp)))).toBe(false);

    expect(body).not.toMatch(/password|secret|database_url|stack/i);
  });

  test("reports PostgreSQL ready before serving workflows", async ({
    request,
  }) => {
    const response = await request.get("health/ready", {
      failOnStatusCode: false,
    });
    const body = await response.text();

    expect(response.status(), `readiness response body: ${body}`).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["x-request-id"]).toBeTruthy();

    const payload = asRecord(JSON.parse(body) as unknown, "readiness payload");
    const dependencies = asRecord(
      payload.dependencies,
      "readiness dependencies",
    );
    expect(payload.status).toBe("ok");
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(String(payload.timestamp)))).toBe(false);
    expect(dependencies.database).toBe("up");

    expect(body).not.toMatch(/password|secret|database_url|stack/i);
  });
});
