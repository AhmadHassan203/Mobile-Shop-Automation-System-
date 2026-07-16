import { describe, expect, it } from "vitest";
import {
  CloseCashSessionInputSchema,
  OpenCashSessionInputSchema,
} from "./cash";

describe("OpenCashSessionInputSchema", () => {
  it("accepts a non-negative opening float", () => {
    const parsed = OpenCashSessionInputSchema.parse({ openingCashMinor: 0 });
    expect(parsed.openingCashMinor).toBe(0);
  });

  it("rejects a negative or non-integer opening float and unknown keys", () => {
    expect(
      OpenCashSessionInputSchema.safeParse({ openingCashMinor: -1 }).success,
    ).toBe(false);
    expect(
      OpenCashSessionInputSchema.safeParse({ openingCashMinor: 10.5 }).success,
    ).toBe(false);
    expect(
      OpenCashSessionInputSchema.safeParse({
        openingCashMinor: 0,
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe("CloseCashSessionInputSchema", () => {
  it("accepts a counted amount with the acted-on version and defaults the note", () => {
    const parsed = CloseCashSessionInputSchema.parse({
      version: 1,
      countedCashMinor: 250_000,
    });
    expect(parsed.countedCashMinor).toBe(250_000);
    expect(parsed.note).toBeNull();
  });

  it("requires a positive integer version", () => {
    expect(
      CloseCashSessionInputSchema.safeParse({
        version: 0,
        countedCashMinor: 250_000,
      }).success,
    ).toBe(false);
  });

  it("normalises a provided note", () => {
    const parsed = CloseCashSessionInputSchema.parse({
      version: 3,
      countedCashMinor: 250_000,
      note: "  short   by   fifty ",
    });
    expect(parsed.note).toBe("short by fifty");
  });
});
