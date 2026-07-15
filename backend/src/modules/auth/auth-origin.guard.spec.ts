import type { ExecutionContext } from "@nestjs/common";
import { ERROR_CODES, type DomainError } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../config/app-config.module";
import { AuthOriginGuard } from "./auth-origin.guard";

function guard(): AuthOriginGuard {
  return new AuthOriginGuard({
    corsOrigins: ["http://localhost:3000"],
  } as AppConfig);
}

function context(method: string, origin?: string): ExecutionContext {
  const request = {
    method,
    get: vi.fn((header: string) =>
      header.toLowerCase() === "origin" ? origin : undefined,
    ),
  };
  const response = { setHeader: vi.fn() };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe("AuthOriginGuard", () => {
  it("allows safe methods regardless of Origin", () => {
    expect(guard().canActivate(context("GET", "https://evil.example"))).toBe(
      true,
    );
  });

  it("allows native and CLI unsafe requests without an Origin header", () => {
    expect(guard().canActivate(context("POST"))).toBe(true);
  });

  it("allows configured browser origins on unsafe methods", () => {
    expect(
      guard().canActivate(context("PATCH", "http://localhost:3000/path")),
    ).toBe(true);
  });

  it("rejects an untrusted browser origin on unsafe methods", () => {
    expect(() =>
      guard().canActivate(context("POST", "https://evil.example")),
    ).toThrowError(
      expect.objectContaining<Partial<DomainError>>({
        code: ERROR_CODES.FORBIDDEN_PERMISSION,
        status: 403,
      }),
    );
  });
});
