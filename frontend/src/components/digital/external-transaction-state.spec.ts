import {
  CreateExternalTransactionInputSchema,
  PERMISSIONS,
  type CreateExternalTransactionInput,
  type ExternalTransaction,
} from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildExternalInput,
  externalCapabilities,
  externalPreview,
  minorFromMajor,
  newIdempotencyKey,
  recordExternalTransaction,
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

const SAVED_TXN: ExternalTransaction = {
  id: "11111111-1111-4111-8111-111111111111",
  txnNumber: "EXT-000001",
  provider: "jazzcash",
  transactionType: "money_send",
  direction: "cash_in",
  principalMinor: 100_000,
  feeChargedMinor: 1_000,
  providerChargeMinor: 0,
  serviceProfitMinor: 1_000,
  cashImpactMinor: 101_000,
  feeOverridden: false,
  paymentMethod: "cash",
  providerReference: null,
  accountReference: null,
  customerId: null,
  customerName: null,
  customerPhone: null,
  note: null,
  businessDate: "2026-07-16",
  createdAt: "2026-07-16T10:00:00.000Z",
};

function validInput(): CreateExternalTransactionInput {
  const built = buildExternalInput(BASE);
  if (!built.ok) throw new Error("BASE must build a valid input");
  return built.input;
}

/** A component-like holder mirroring the page's `useState` idempotency key. */
function keyHolder(): {
  readonly get: () => string | null;
  readonly set: (key: string | null) => void;
} {
  let held: string | null = null;
  return {
    get: () => held,
    set: (key: string | null) => {
      held = key;
    },
  };
}

/** Deterministic keys ("key-1", "key-2", …) so reuse-vs-mint is observable. */
function sequentialKeys(): () => string {
  let issued = 0;
  return () => `key-${(issued += 1)}`;
}

describe("recordExternalTransaction idempotency lifecycle", () => {
  it("reuses one key across retries without a success, then mints a fresh one after a success", async () => {
    const holder = keyHolder();
    const generateKey = sequentialKeys();
    const capturedKeys: string[] = [];
    let shouldFail = true;
    const create = vi.fn(
      async (
        _input: CreateExternalTransactionInput,
        key: string,
      ): Promise<ExternalTransaction> => {
        capturedKeys.push(key);
        if (shouldFail) throw new Error("The external API could not be reached.");
        return SAVED_TXN;
      },
    );
    const attempt = (): Promise<ExternalTransaction> =>
      recordExternalTransaction(validInput(), {
        heldKey: holder.get(),
        setHeldKey: holder.set,
        create,
        generateKey,
      });

    // Attempt 1 — uncertain (thrown) response. A key is minted and, crucially,
    // held even though the call threw.
    await expect(attempt()).rejects.toThrow();
    expect(holder.get()).toBe("key-1");

    // Attempt 2 — a retry with no intervening success MUST reuse the same key.
    await expect(attempt()).rejects.toThrow();

    // Attempt 3 — the retry finally succeeds under that same key; then the key
    // is retired.
    shouldFail = false;
    await expect(attempt()).resolves.toBe(SAVED_TXN);
    expect(holder.get()).toBeNull();

    // Attempt 4 — a brand-new logical transaction mints a different key.
    await expect(attempt()).resolves.toBe(SAVED_TXN);

    expect(capturedKeys).toEqual(["key-1", "key-1", "key-1", "key-2"]);
    // Two consecutive submits without a success carried an identical key...
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
    // ...and the transaction after the success carried a different one.
    expect(capturedKeys[3]).not.toBe(capturedKeys[0]);
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("never regenerates the key while retries keep failing", async () => {
    const holder = keyHolder();
    const generateKey = vi.fn(sequentialKeys());
    const capturedKeys: string[] = [];
    const create = vi.fn(
      async (
        _input: CreateExternalTransactionInput,
        key: string,
      ): Promise<ExternalTransaction> => {
        capturedKeys.push(key);
        throw new Error("timeout");
      },
    );

    for (let retry = 0; retry < 3; retry += 1) {
      await expect(
        recordExternalTransaction(validInput(), {
          heldKey: holder.get(),
          setHeldKey: holder.set,
          create,
          generateKey,
        }),
      ).rejects.toThrow();
    }

    expect(new Set(capturedKeys).size).toBe(1);
    expect(generateKey).toHaveBeenCalledTimes(1);
    expect(holder.get()).toBe(capturedKeys[0]);
  });

  it("mints a distinct, well-formed UUID per logical transaction", () => {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();

    expect(first).toMatch(uuid);
    expect(second).toMatch(uuid);
    expect(first).not.toBe(second);
  });
});
