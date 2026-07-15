import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
} from "./auth-crypto";

describe("opaque session credentials", () => {
  it("generates independent 256-bit base64url tokens", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).toHaveLength(43);
    expect(isSessionToken(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("stores deterministic SHA-256 digests instead of raw tokens", () => {
    const token = generateSessionToken();
    const digest = hashSessionToken(token);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
    expect(hashSessionToken(token)).toBe(digest);
  });

  it("rejects malformed cookie values before a database lookup", () => {
    expect(isSessionToken("short")).toBe(false);
    expect(isSessionToken("a".repeat(42) + "=")).toBe(false);
    expect(isSessionToken("a".repeat(43))).toBe(true);
  });
});
