import { EXTERNAL_FEE_CONFIG_KEYS, ERROR_CODES } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { ExternalService, type ExternalActorContext } from "./external.service";
import type { CreateExternalTransactionData } from "@mobileshop/shared";

const CONTEXT: ExternalActorContext = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  branchId: "10000000-0000-4000-8000-000000000002",
  actorUserId: "20000000-0000-4000-8000-000000000001",
  permissions: [],
  metadata: {
    requestId: "request-external-service-test",
    ipAddress: "127.0.0.1",
    userAgent: "external-service-test",
  },
};

const IDS = Object.freeze({
  txn: "40000000-0000-4000-8000-000000000001",
  sequence: "40000000-0000-4000-8000-000000000002",
  cashSession: "40000000-0000-4000-8000-000000000003",
});

const NOW = new Date("2026-07-17T09:00:00.000Z");

const ACCOUNTS = [
  { id: "acc-cash", code: "CASH", accountSubtype: "physical_cash" },
  { id: "acc-bank", code: "BANK", accountSubtype: "bank" },
  { id: "acc-digital", code: "DIGITAL", accountSubtype: "provider_float" },
  { id: "acc-service-rev", code: "SERVICE-REVENUE", accountSubtype: "service_revenue" },
  { id: "acc-service-float", code: "SERVICE-FLOAT", accountSubtype: "service_float" },
];

function externalInput(
  overrides: Partial<CreateExternalTransactionData> = {},
): CreateExternalTransactionData {
  return {
    provider: "jazzcash",
    transactionType: "money_send",
    principalMinor: 100_000,
    feeOverrideReason: null,
    providerChargeMinor: 0,
    paymentMethod: "cash",
    providerReference: null,
    accountReference: null,
    customerId: null,
    customerName: null,
    customerPhone: null,
    note: null,
    ...overrides,
  };
}

function baseTransaction(settings: readonly unknown[] = []) {
  return {
    externalTransaction: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: IDS.txn, createdAt: NOW, ...args.data }),
      ),
    },
    applicationSetting: { findMany: vi.fn().mockResolvedValue(settings) },
    financialAccount: { findMany: vi.fn().mockResolvedValue(ACCOUNTS) },
    customer: { findFirst: vi.fn().mockResolvedValue(null) },
    financialEntry: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    numberSequence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("number_sequences")) {
        return Promise.resolve([
          { id: IDS.sequence, prefix: "EXT-", nextValue: 1, padding: 6, periodKey: "2026" },
        ]);
      }
      if (sql.includes("cash_sessions")) {
        return Promise.resolve([{ id: IDS.cashSession }]);
      }
      return Promise.resolve([]);
    }),
  };
}

function serviceFor(tx: ReturnType<typeof baseTransaction>) {
  const client = {
    $transaction: vi.fn(
      async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx),
    ),
  };
  return new ExternalService({ client } as unknown as PrismaService);
}

function ledgerData(tx: ReturnType<typeof baseTransaction>) {
  return tx.financialEntry.createMany.mock.calls[0]?.[0]?.data as {
    financialAccountId: string;
    direction: "debit" | "credit";
    amountMinor: bigint;
  }[];
}

describe("ExternalService", () => {
  it("rejects a manual fee override when the actor lacks external.override_fee", async () => {
    const tx = baseTransaction();
    const service = serviceFor(tx);

    await expect(
      service.record(
        CONTEXT,
        null,
        externalInput({ feeChargedMinor: 5_000, feeOverrideReason: "Loyal customer" }),
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN_PERMISSION });
    expect(tx.externalTransaction.create).not.toHaveBeenCalled();
  });

  it("records an authorized override with the manual fee and marks it overridden", async () => {
    const tx = baseTransaction();
    const service = serviceFor(tx);
    const context = { ...CONTEXT, permissions: ["external.override_fee"] };

    const response = await service.record(
      context,
      null,
      externalInput({ feeChargedMinor: 5_000, feeOverrideReason: "Loyal customer" }),
    );

    const created = tx.externalTransaction.create.mock.calls[0]?.[0]?.data as {
      feeChargedMinor: bigint;
    };
    expect(created.feeChargedMinor).toBe(5_000n);
    expect(response.feeOverridden).toBe(true);
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "Loyal customer" }),
      }),
    );
  });

  it("applies the per-started-block fee from application settings, ceiling each partial block", async () => {
    // Owner-edited rate: PKR 5 per started PKR 1,000 block.
    const tx = baseTransaction([
      { branchId: null, key: EXTERNAL_FEE_CONFIG_KEYS.amountBlockMinor, value: 100_000 },
      { branchId: null, key: EXTERNAL_FEE_CONFIG_KEYS.money_send, value: 500 },
    ]);
    const service = serviceFor(tx);

    // PKR 2,500 principal -> ceil(2500/1000) = 3 started blocks -> 3 * 500 = 1,500.
    const response = await service.record(
      CONTEXT,
      null,
      externalInput({ principalMinor: 250_000, paymentMethod: "bank_transfer" }),
    );

    const created = tx.externalTransaction.create.mock.calls[0]?.[0]?.data as {
      feeChargedMinor: bigint;
    };
    expect(created.feeChargedMinor).toBe(1_500n);
    expect(response.feeChargedMinor).toBe(1_500);
    expect(response.feeOverridden).toBe(false);
  });

  it("posts only service profit to service revenue and keeps the ledger balanced", async () => {
    const tx = baseTransaction();
    const service = serviceFor(tx);

    // money_send, PKR 1,000 principal -> 1 block * default 1,000 fee. Provider
    // charge 300 -> service profit 700. cash_in impact = principal + fee.
    const response = await service.record(
      CONTEXT,
      null,
      externalInput({ principalMinor: 100_000, providerChargeMinor: 300 }),
    );

    expect(response.serviceProfitMinor).toBe(700);
    expect(response.cashImpactMinor).toBe(101_000);

    const legs = ledgerData(tx);
    const revenueLeg = legs.find((leg) => leg.financialAccountId === "acc-service-rev");
    expect(revenueLeg).toMatchObject({ direction: "credit", amountMinor: 700n });
    // The principal is never revenue: no revenue leg carries the principal.
    expect(
      legs.some(
        (leg) => leg.financialAccountId === "acc-service-rev" && leg.amountMinor === 100_000n,
      ),
    ).toBe(false);

    const debit = legs
      .filter((leg) => leg.direction === "debit")
      .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
    const credit = legs
      .filter((leg) => leg.direction === "credit")
      .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
    expect(debit).toBe(credit);
    expect(debit).toBe(101_000n);
  });

  it("flips the service-revenue leg to a debit when the service runs at a loss", async () => {
    const tx = baseTransaction();
    const service = serviceFor(tx);

    // Provider charge 1,500 exceeds the 1,000 fee -> service profit -500, which
    // must post as a positive debit (the ledger check forbids <= 0 amounts).
    const response = await service.record(
      CONTEXT,
      null,
      externalInput({ principalMinor: 100_000, providerChargeMinor: 1_500 }),
    );

    expect(response.serviceProfitMinor).toBe(-500);
    const legs = ledgerData(tx);
    const revenueLeg = legs.find((leg) => leg.financialAccountId === "acc-service-rev");
    expect(revenueLeg).toMatchObject({ direction: "debit", amountMinor: 500n });
    expect(legs.every((leg) => BigInt(leg.amountMinor) >= 1n)).toBe(true);

    const debit = legs
      .filter((leg) => leg.direction === "debit")
      .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
    const credit = legs
      .filter((leg) => leg.direction === "credit")
      .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
    expect(debit).toBe(credit);
  });

  it("requires an open cash session for a cash transaction", async () => {
    const tx = baseTransaction();
    tx.$queryRaw = vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("number_sequences")) {
        return Promise.resolve([
          { id: IDS.sequence, prefix: "EXT-", nextValue: 1, padding: 6, periodKey: "2026" },
        ]);
      }
      return Promise.resolve([]); // no open cash session
    });
    const service = serviceFor(tx);

    await expect(
      service.record(CONTEXT, null, externalInput({ paymentMethod: "cash" })),
    ).rejects.toMatchObject({ code: ERROR_CODES.SALE_CASH_SESSION_REQUIRED });
    expect(tx.externalTransaction.create).not.toHaveBeenCalled();
  });
});
