import { describe, expect, it } from "vitest";
import {
  BUSINESS_TIMEZONE,
  DateTimeError,
  addBusinessDays,
  ageInDays,
  businessDayEndUtc,
  businessDayRangeUtc,
  businessDayStartUtc,
  businessDaysBetween,
  businessOffsetMinutes,
  isBusinessDate,
  parseBusinessDate,
  rollingWindow,
  toBusinessDate,
} from "./datetime";

describe("business timezone", () => {
  it("is Asia/Karachi", () => {
    expect(BUSINESS_TIMEZONE).toBe("Asia/Karachi");
  });

  it("resolves to UTC+05:00 from the IANA database", () => {
    expect(businessOffsetMinutes(new Date("2026-01-15T00:00:00Z"))).toBe(300);
    // Pakistan does not observe DST, so mid-year matches mid-winter.
    expect(businessOffsetMinutes(new Date("2026-07-15T00:00:00Z"))).toBe(300);
  });
});

describe("business date resolution", () => {
  it("uses the local calendar date, not the UTC one", () => {
    // 20:00 UTC on 14 July is already 01:00 on 15 July in Karachi. A sale at that
    // instant belongs on the 15th's report — using the UTC date would misfile it.
    expect(toBusinessDate(new Date("2026-07-14T20:00:00Z"))).toBe("2026-07-15");
    expect(toBusinessDate(new Date("2026-07-14T18:59:00Z"))).toBe("2026-07-14");
  });

  it("handles the exact local midnight boundary", () => {
    // 19:00 UTC == 00:00 next day in Karachi.
    expect(toBusinessDate(new Date("2026-07-14T19:00:00Z"))).toBe("2026-07-15");
    expect(toBusinessDate(new Date("2026-07-14T18:59:59Z"))).toBe("2026-07-14");
  });

  it("rejects an invalid date", () => {
    expect(() => toBusinessDate(new Date("nonsense"))).toThrow(DateTimeError);
  });
});

describe("business date parsing", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(isBusinessDate("2026-07-15")).toBe(true);
    expect(parseBusinessDate("2026-07-15")).toBe("2026-07-15");
  });

  it("rejects other shapes", () => {
    expect(isBusinessDate("15-07-2026")).toBe(false);
    expect(isBusinessDate("2026-7-5")).toBe(false);
    expect(() => parseBusinessDate("July 15 2026")).toThrow(DateTimeError);
  });
});

describe("business day UTC boundaries", () => {
  it("starts a business day at 19:00 UTC the previous day", () => {
    expect(
      businessDayStartUtc(parseBusinessDate("2026-07-15")).toISOString(),
    ).toBe("2026-07-14T19:00:00.000Z");
  });

  it("ends a business day at the next day start (exclusive)", () => {
    expect(
      businessDayEndUtc(parseBusinessDate("2026-07-15")).toISOString(),
    ).toBe("2026-07-15T19:00:00.000Z");
  });

  it("produces a half-open range covering exactly 24 hours", () => {
    const { start, end } = businessDayRangeUtc(parseBusinessDate("2026-07-15"));
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it("round-trips: every instant in the range maps back to the same business date", () => {
    const date = parseBusinessDate("2026-07-15");
    const { start, end } = businessDayRangeUtc(date);
    expect(toBusinessDate(start)).toBe(date);
    expect(toBusinessDate(new Date(end.getTime() - 1))).toBe(date);
    // The end bound is exclusive: it already belongs to the next day.
    expect(toBusinessDate(end)).toBe("2026-07-16");
  });
});

describe("business date arithmetic", () => {
  it("adds and subtracts days", () => {
    expect(addBusinessDays(parseBusinessDate("2026-07-15"), 1)).toBe(
      "2026-07-16",
    );
    expect(addBusinessDays(parseBusinessDate("2026-07-15"), -1)).toBe(
      "2026-07-14",
    );
    expect(addBusinessDays(parseBusinessDate("2026-07-15"), 0)).toBe(
      "2026-07-15",
    );
  });

  it("crosses month and year boundaries", () => {
    expect(addBusinessDays(parseBusinessDate("2026-07-31"), 1)).toBe(
      "2026-08-01",
    );
    expect(addBusinessDays(parseBusinessDate("2026-12-31"), 1)).toBe(
      "2027-01-01",
    );
    expect(addBusinessDays(parseBusinessDate("2028-02-28"), 1)).toBe(
      "2028-02-29",
    ); // leap year
  });

  it("rejects fractional day counts", () => {
    expect(() => addBusinessDays(parseBusinessDate("2026-07-15"), 1.5)).toThrow(
      DateTimeError,
    );
  });

  it("counts days between dates, signed", () => {
    expect(
      businessDaysBetween(
        parseBusinessDate("2026-07-01"),
        parseBusinessDate("2026-07-31"),
      ),
    ).toBe(30);
    expect(
      businessDaysBetween(
        parseBusinessDate("2026-07-31"),
        parseBusinessDate("2026-07-01"),
      ),
    ).toBe(-30);
    expect(
      businessDaysBetween(
        parseBusinessDate("2026-07-15"),
        parseBusinessDate("2026-07-15"),
      ),
    ).toBe(0);
  });
});

describe("rolling windows", () => {
  it("includes the end date itself", () => {
    // "Last 30 days" ending 30 July spans 1..30 July inclusive — 30 days, not 31.
    const window = rollingWindow(parseBusinessDate("2026-07-30"), 30);
    expect(window).toEqual({ from: "2026-07-01", to: "2026-07-30" });
    expect(businessDaysBetween(window.from, window.to)).toBe(29);
  });

  it("supports the 7/30/90-day metric windows required by 01_PRD §5.10", () => {
    const end = parseBusinessDate("2026-07-15");
    expect(rollingWindow(end, 7).from).toBe("2026-07-09");
    expect(rollingWindow(end, 30).from).toBe("2026-06-16");
    expect(rollingWindow(end, 90).from).toBe("2026-04-17");
  });

  it("rejects a non-positive window", () => {
    expect(() => rollingWindow(parseBusinessDate("2026-07-15"), 0)).toThrow(
      DateTimeError,
    );
    expect(() => rollingWindow(parseBusinessDate("2026-07-15"), -5)).toThrow(
      DateTimeError,
    );
  });
});

describe("stock aging", () => {
  it("measures age in business days", () => {
    const acquired = new Date("2026-06-15T10:00:00Z");
    const now = new Date("2026-07-15T10:00:00Z");
    expect(ageInDays(acquired, now)).toBe(30);
  });

  it("is zero on the same business day", () => {
    expect(
      ageInDays(
        new Date("2026-07-15T05:00:00Z"),
        new Date("2026-07-15T14:00:00Z"),
      ),
    ).toBe(0);
  });
});
