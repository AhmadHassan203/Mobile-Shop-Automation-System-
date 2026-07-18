import { describe, expect, it } from "vitest";
import {
  CreateExternalTransactionInputSchema,
  computeCashImpactMinor,
  computeExternalFeeMinor,
  computeServiceProfitMinor,
  defaultDirectionForType,
} from "./external";

const PKR = (rupees: number) => rupees * 100; // minor units (paisa)

describe("computeExternalFeeMinor — per started PKR 1,000 block (ceil)", () => {
  it("charges PKR 10 for a PKR 1,000 send", () => {
    expect(computeExternalFeeMinor("money_send", PKR(1_000))).toBe(PKR(10));
  });
  it("charges PKR 20 for a PKR 1,001 send (partial block billed as a full block)", () => {
    expect(computeExternalFeeMinor("money_send", PKR(1_001))).toBe(PKR(20));
  });
  it("charges PKR 20 for a PKR 1,500 send", () => {
    expect(computeExternalFeeMinor("money_send", PKR(1_500))).toBe(PKR(20));
  });
  it("charges PKR 20 for a PKR 2,000 send", () => {
    expect(computeExternalFeeMinor("money_send", PKR(2_000))).toBe(PKR(20));
  });
  it("charges PKR 20 for a PKR 1,000 withdrawal", () => {
    expect(computeExternalFeeMinor("money_withdrawal", PKR(1_000))).toBe(
      PKR(20),
    );
  });
  it("charges PKR 40 for a PKR 1,001 withdrawal", () => {
    expect(computeExternalFeeMinor("money_withdrawal", PKR(1_001))).toBe(
      PKR(40),
    );
  });
  it("charges zero fee for zero principal", () => {
    expect(computeExternalFeeMinor("money_send", 0)).toBe(0);
    expect(computeExternalFeeMinor("money_withdrawal", 0)).toBe(0);
  });
  it("charges no default fee for types without a configured rate", () => {
    expect(computeExternalFeeMinor("bank_transfer", PKR(5_000))).toBe(0);
    expect(computeExternalFeeMinor("utility_bill", PKR(5_000))).toBe(0);
    expect(computeExternalFeeMinor("mobile_load", PKR(5_000))).toBe(0);
  });
  it("honours a configured per-block override", () => {
    expect(
      computeExternalFeeMinor("bank_transfer", PKR(1_001), {
        feePerBlockMinorByType: { bank_transfer: PKR(5) },
      }),
    ).toBe(PKR(10));
  });
  it("rejects a negative principal", () => {
    expect(() => computeExternalFeeMinor("money_send", -1)).toThrow();
  });
});

describe("service profit and cash impact", () => {
  it("service_profit = fee_charged - provider_charge", () => {
    expect(computeServiceProfitMinor(PKR(20), PKR(5))).toBe(PKR(15));
    expect(computeServiceProfitMinor(PKR(10), PKR(12))).toBe(-PKR(2));
  });
  it("derives cash direction from the transaction type, not the provider", () => {
    expect(defaultDirectionForType("money_send")).toBe("cash_in");
    expect(defaultDirectionForType("money_withdrawal")).toBe("cash_out");
    expect(defaultDirectionForType("bank_transfer")).toBe("cash_in");
    expect(defaultDirectionForType("utility_bill")).toBe("cash_in");
    expect(defaultDirectionForType("mobile_load")).toBe("cash_in");
  });
  it("computes a signed cash impact (in = principal+fee, out = -(principal-fee))", () => {
    expect(computeCashImpactMinor("money_send", PKR(1_000), PKR(10))).toBe(
      PKR(1_010),
    );
    expect(
      computeCashImpactMinor("money_withdrawal", PKR(1_000), PKR(20)),
    ).toBe(-PKR(980));
  });
});

describe("CreateExternalTransactionInputSchema", () => {
  const base = {
    provider: "jazzcash" as const,
    transactionType: "money_send" as const,
    principalMinor: PKR(1_000),
    paymentMethod: "cash" as const,
  };

  it("accepts provider + transactionType as separate concerns", () => {
    const parsed = CreateExternalTransactionInputSchema.parse({
      ...base,
      provider: "easypaisa",
      transactionType: "money_withdrawal",
    });
    expect(parsed.provider).toBe("easypaisa");
    expect(parsed.transactionType).toBe("money_withdrawal");
  });

  it("represents each required example pairing", () => {
    for (const [provider, transactionType] of [
      ["jazzcash", "money_send"],
      ["easypaisa", "money_withdrawal"],
      ["bank", "bank_transfer"],
      ["electricity", "utility_bill"],
      ["jazz", "mobile_load"],
    ] as const) {
      expect(() =>
        CreateExternalTransactionInputSchema.parse({
          ...base,
          provider,
          transactionType,
        }),
      ).not.toThrow();
    }
  });

  it("requires a reason when the fee is manually overridden", () => {
    expect(() =>
      CreateExternalTransactionInputSchema.parse({
        ...base,
        feeChargedMinor: PKR(5),
      }),
    ).toThrow();
    expect(() =>
      CreateExternalTransactionInputSchema.parse({
        ...base,
        feeChargedMinor: PKR(5),
        feeOverrideReason: "Loyal customer discount",
      }),
    ).not.toThrow();
  });

  it("rejects an override reason without an override", () => {
    expect(() =>
      CreateExternalTransactionInputSchema.parse({
        ...base,
        feeOverrideReason: "no override here",
      }),
    ).toThrow();
  });
});
