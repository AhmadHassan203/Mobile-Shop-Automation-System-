import {
  CreateExternalTransactionInputSchema,
  PERMISSIONS,
} from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  buildExternalInput,
  externalCapabilities,
  externalPreview,
  minorFromMajor,
  type ExternalFormValues,
} from "./external-transaction-state";

const BASE: ExternalFormValues = {
  provider: "jazzcash",
  transactionType: "money_send",
  principalMajor: "1000",
  providerChargeMajor: "",
  paymentMethod: "cash",
  providerReference: "",
  accountReference: "",
  customerName: "",
  customerPhone: "",
  note: "",
};

describe("externalCapabilities", () => {
  it("maps the external.view and external.create permissions", () => {
    expect(externalCapabilities([])).toEqual({
      canView: false,
      canCreate: false,
    });
    expect(
      externalCapabilities([
        PERMISSIONS.EXTERNAL_VIEW,
        PERMISSIONS.EXTERNAL_CREATE,
      ]),
    ).toEqual({ canView: true, canCreate: true });
    expect(
      externalCapabilities([PERMISSIONS.EXTERNAL_VIEW]).canCreate,
    ).toBe(false);
  });
});

describe("minorFromMajor", () => {
  it("parses valid PKR amounts and rejects blank or negative input", () => {
    expect(minorFromMajor("1000")).toBe(100_000);
    expect(minorFromMajor("10.50")).toBe(1_050);
    expect(minorFromMajor("")).toBeNull();
    expect(minorFromMajor("abc")).toBeNull();
    expect(minorFromMajor("-5")).toBeNull();
  });
});

describe("externalPreview", () => {
  it("computes the per-block fee, cash-in direction and service profit for money send", () => {
    const preview = externalPreview(BASE);
    expect(preview.principalMinor).toBe(100_000);
    expect(preview.principalValid).toBe(true);
    expect(preview.feeMinor).toBe(1_000);
    expect(preview.direction).toBe("cash_in");
    expect(preview.serviceProfitMinor).toBe(1_000);
  });

  it("charges a full block for a partial block (per started PKR 1,000)", () => {
    expect(externalPreview({ ...BASE, principalMajor: "1500" }).feeMinor).toBe(
      2_000,
    );
  });

  it("subtracts a provider charge from the service profit", () => {
    const preview = externalPreview({ ...BASE, providerChargeMajor: "3" });
    expect(preview.providerChargeMinor).toBe(300);
    expect(preview.serviceProfitMinor).toBe(700);
  });

  it("treats a withdrawal as cash-out with the withdrawal fee", () => {
    const preview = externalPreview({
      ...BASE,
      transactionType: "money_withdrawal",
    });
    expect(preview.direction).toBe("cash_out");
    expect(preview.feeMinor).toBe(2_000);
  });

  it("reports no fee for a blank or zero principal", () => {
    expect(externalPreview({ ...BASE, principalMajor: "" }).principalValid).toBe(
      false,
    );
    expect(externalPreview({ ...BASE, principalMajor: "" }).feeMinor).toBeNull();
  });
});

describe("buildExternalInput", () => {
  it("builds a contract-valid input and omits blank optional fields", () => {
    const result = buildExternalInput({
      ...BASE,
      providerReference: "  TXN-99  ",
      note: "  Load for regular customer  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a valid input");
    expect(result.input.principalMinor).toBe(100_000);
    expect(result.input.providerReference).toBe("TXN-99");
    expect(result.input.note).toBe("Load for regular customer");
    expect("accountReference" in result.input).toBe(false);
    expect(CreateExternalTransactionInputSchema.safeParse(result.input).success).toBe(
      true,
    );
  });

  it("blocks a non-positive principal with a message", () => {
    expect(buildExternalInput({ ...BASE, principalMajor: "" })).toEqual({
      ok: false,
      error: "Enter a principal amount greater than zero.",
    });
  });

  it("rejects an invalid provider charge", () => {
    const result = buildExternalInput({
      ...BASE,
      providerChargeMajor: "abc",
    });
    expect(result.ok).toBe(false);
  });
});
