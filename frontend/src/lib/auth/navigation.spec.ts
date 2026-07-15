import { describe, expect, it } from "vitest";
import { buildLoginRedirect, safeReturnTarget } from "./navigation";

describe("safeReturnTarget", () => {
  it.each([
    ["/", "/"],
    ["/inventory?page=2", "/inventory?page=2"],
    ["/reports#daily", "/reports#daily"],
  ])("accepts same-origin target %s", (input, expected) => {
    expect(safeReturnTarget(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example",
    "/%5Cevil.example",
    "/login",
    "/login/reset",
    "javascript:alert(1)",
    "/line\nbreak",
  ])("rejects unsafe or recursive target %s", (input) => {
    expect(safeReturnTarget(input)).toBe("/");
  });

  it("falls back for absent values", () => {
    expect(safeReturnTarget(null)).toBe("/");
    expect(safeReturnTarget(undefined)).toBe("/");
  });
});

describe("buildLoginRedirect", () => {
  it("encodes the safe return path and expiry reason", () => {
    expect(buildLoginRedirect("/inventory?page=2", "session-expired")).toBe(
      "/login?returnTo=%2Finventory%3Fpage%3D2&reason=session-expired",
    );
  });

  it("cannot encode an external return target", () => {
    expect(buildLoginRedirect("https://evil.example")).toBe(
      "/login?returnTo=%2F",
    );
  });
});
