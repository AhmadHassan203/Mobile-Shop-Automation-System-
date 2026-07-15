import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClient, ApiError } from "./client";
import { healthResponseSchema } from "./health";

const okSchema = z.object({ ok: z.literal(true) });

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

describe("ApiClient", () => {
  it("calls the configured API with credentials and validates the response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient("http://localhost:4000/api/v1/", { fetcher });

    await expect(
      client.request("/health", { schema: okSchema }),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/health",
    );

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
  });

  it("preserves the backend error code and correlation ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          code: "NOT_FOUND",
          message: "Record not found",
          requestId: "trace-123",
        },
        { status: 404 },
      ),
    );
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    const request = client.request("/missing", { schema: okSchema });
    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "NOT_FOUND",
      requestId: "trace-123",
    });
  });

  it("rejects a successful but malformed response instead of trusting it", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: false }));
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(
      client.request("/health", { schema: okSchema }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("turns connection failures into a stable transport error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed"));
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(
      client.request("/health", { schema: okSchema }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("never exposes non-JSON response bodies as trusted API errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<h1>Proxy failure</h1>", { status: 502 }),
      );
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    try {
      await client.request("/health", { schema: okSchema });
      throw new Error("Expected the request to reject.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
});

describe("health response contract", () => {
  it("accepts the real backend liveness shape", () => {
    expect(
      healthResponseSchema.parse({
        status: "ok",
        name: "MobileShop OS",
        apiVersion: "v1",
        uptimeSeconds: 12,
        timestamp: "2026-07-15T12:00:00.000Z",
      }),
    ).toMatchObject({ status: "ok", apiVersion: "v1" });
  });

  it("rejects placeholder or incomplete health data", () => {
    expect(() => healthResponseSchema.parse({ status: "ok" })).toThrow();
  });
});
