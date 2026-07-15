import { describe, expect, it } from "vitest";
import {
  computeImeiCheckDigit,
  luhnChecksumValid,
  maskImei,
  normalizeImei,
  normalizeSerial,
  parseBulkImeiInput,
  validateImei,
} from "./imei";

/** Real-format IMEIs with valid Luhn check digits. */
const VALID_IMEI = "356938035643809";
const VALID_IMEI_2 = "490154203237518";

describe("IMEI normalization", () => {
  it("strips separators staff paste from spreadsheets and WhatsApp", () => {
    expect(normalizeImei("356938-035643809")).toBe(VALID_IMEI);
    expect(normalizeImei("356938 035643 809")).toBe(VALID_IMEI);
    expect(normalizeImei(" 356938035643809 ")).toBe(VALID_IMEI);
    expect(normalizeImei("356.938.035.643.809")).toBe(VALID_IMEI);
  });

  it("returns null for empty or digit-free input", () => {
    expect(normalizeImei("")).toBeNull();
    expect(normalizeImei(null)).toBeNull();
    expect(normalizeImei(undefined)).toBeNull();
    expect(normalizeImei("---")).toBeNull();
  });

  it("normalizes differently-typed forms of the same IMEI identically", () => {
    // This is what makes the duplicate-IMEI constraint actually work.
    const forms = [
      "356938035643809",
      "356938-035643809",
      "356 938 035 643 809",
    ];
    const normalized = new Set(forms.map((f) => normalizeImei(f)));
    expect(normalized.size).toBe(1);
  });
});

describe("serial normalization", () => {
  it("uppercases and strips separators but keeps letters", () => {
    expect(normalizeSerial("sn-abc 123")).toBe("SNABC123");
    expect(normalizeSerial("F2LX1234ABCD")).toBe("F2LX1234ABCD");
  });

  it("returns null when nothing usable remains", () => {
    expect(normalizeSerial("  ")).toBeNull();
    expect(normalizeSerial(null)).toBeNull();
  });
});

describe("Luhn checksum", () => {
  it("accepts valid IMEIs", () => {
    expect(luhnChecksumValid(VALID_IMEI)).toBe(true);
    expect(luhnChecksumValid(VALID_IMEI_2)).toBe(true);
  });

  it("rejects a single-digit typo", () => {
    expect(luhnChecksumValid("356938035643808")).toBe(false);
  });

  it("rejects non-digit input", () => {
    expect(luhnChecksumValid("35693803564380X")).toBe(false);
    expect(luhnChecksumValid("")).toBe(false);
  });

  it("computes the check digit consistently with validation", () => {
    const first14 = VALID_IMEI.slice(0, 14);
    expect(computeImeiCheckDigit(first14)).toBe(Number(VALID_IMEI[14]));
  });

  it("rejects wrong-length input to the check digit calculator", () => {
    expect(() => computeImeiCheckDigit("123")).toThrow();
  });
});

describe("IMEI validation", () => {
  it("accepts a valid 15-digit IMEI", () => {
    const result = validateImei(VALID_IMEI);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(VALID_IMEI);
  });

  it("rejects empty input", () => {
    expect(validateImei("").code).toBe("EMPTY");
  });

  it("rejects letters", () => {
    expect(validateImei("35693803564380A").code).toBe("NON_DIGIT");
  });

  it("rejects wrong length", () => {
    expect(validateImei("12345").code).toBe("BAD_LENGTH");
    expect(validateImei("3569380356438091").code).toBe("BAD_LENGTH");
  });

  it("rejects placeholder IMEIs that would otherwise pass Luhn", () => {
    // 000000000000000 sums to 0, which is divisible by 10.
    expect(validateImei("000000000000000").code).toBe("ALL_SAME_DIGIT");
  });

  it("rejects a failed checksum by default", () => {
    expect(validateImei("356938035643808").code).toBe("CHECKSUM_FAILED");
  });

  it("allows relaxing the checksum for legitimate non-Luhn devices", () => {
    const result = validateImei("356938035643808", { requireChecksum: false });
    expect(result.valid).toBe(true);
  });

  it("accepts 16-digit IMEISV only when explicitly allowed", () => {
    expect(validateImei("3569380356438091", { allowImeiSv: true }).valid).toBe(
      true,
    );
    expect(validateImei("3569380356438091").valid).toBe(false);
  });
});

describe("bulk IMEI paste", () => {
  it("parses newline-separated input", () => {
    const result = parseBulkImeiInput(`${VALID_IMEI}\n${VALID_IMEI_2}`);
    expect(result.hasErrors).toBe(false);
    expect(result.validNormalized).toEqual([VALID_IMEI, VALID_IMEI_2]);
  });

  it("parses comma, semicolon and tab separated input", () => {
    const result = parseBulkImeiInput(`${VALID_IMEI},${VALID_IMEI_2}`);
    expect(result.validNormalized).toHaveLength(2);
  });

  it("ignores blank lines", () => {
    const result = parseBulkImeiInput(`${VALID_IMEI}\n\n\n${VALID_IMEI_2}\n`);
    expect(result.validNormalized).toHaveLength(2);
  });

  it("flags duplicates within the batch before saving", () => {
    // The same phone pasted twice must not create two inventory units.
    const result = parseBulkImeiInput(`${VALID_IMEI}\n${VALID_IMEI}`);
    expect(result.hasErrors).toBe(true);
    expect(result.duplicatesInBatch).toEqual([VALID_IMEI]);
    expect(result.rows[1]?.code).toBe("DUPLICATE_IN_BATCH");
    expect(result.rows[1]?.message).toContain("line 1");
  });

  it("detects duplicates across differently-formatted entries", () => {
    const result = parseBulkImeiInput(`${VALID_IMEI}\n356938-035643809`);
    expect(result.duplicatesInBatch).toEqual([VALID_IMEI]);
  });

  it("reports per-row errors with line numbers and keeps valid rows usable", () => {
    const result = parseBulkImeiInput(`${VALID_IMEI}\n12345\n${VALID_IMEI_2}`);
    expect(result.hasErrors).toBe(true);
    expect(result.rows[1]?.line).toBe(2);
    expect(result.rows[1]?.code).toBe("BAD_LENGTH");
    expect(result.validNormalized).toEqual([VALID_IMEI, VALID_IMEI_2]);
  });

  it("returns an empty result for empty input", () => {
    const result = parseBulkImeiInput("   \n  \n");
    expect(result.rows).toHaveLength(0);
    expect(result.hasErrors).toBe(false);
  });
});

describe("IMEI masking", () => {
  it("masks the middle digits", () => {
    expect(maskImei(VALID_IMEI)).toBe("35693******3809");
  });

  it("degrades safely for unusable input", () => {
    expect(maskImei("123")).toBe("***");
  });
});
