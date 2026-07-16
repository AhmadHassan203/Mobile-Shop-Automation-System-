import { ERROR_CODES } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { ExpensesService, type ExpensesActorContext } from "./expenses.service";
import type { CreateExpenseData } from "@mobileshop/shared";

const CONTEXT: ExpensesActorContext = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  branchId: "10000000-0000-4000-8000-000000000002",
  actorUserId: "20000000-0000-4000-8000-000000000001",
  metadata: {
    requestId: "request-expenses-service-test",
    ipAddress: "127.0.0.1",
    userAgent: "expenses-service-test",
  },
};

const IDS = Object.freeze({
  expense: "40000000-0000-4000-8000-000000000001",
  sequence: "40000000-0000-4000-8000-000000000002",
  cashSession: "40000000-0000-4000-8000-000000000003",
});

const NOW = new Date("2026-07-17T09:00:00.000Z");

const ACCOUNTS = [
  { id: "acc-cash", code: "CASH", accountSubtype: "physical_cash" },
  { id: "acc-bank", code: "BANK", accountSubtype: "bank" },
  { id: "acc-digital", code: "DIGITAL", accountSubtype: "provider_float" },
  { id: "acc-expense", code: "EXPENSE", accountSubtype: "expense" },
];

function expenseInput(overrides: Partial<CreateExpenseData> = {}): CreateExpenseData {
  return {
    category: "utilities",
    amountMinor: 5_000,
    paymentMethod: "cash",
    note: "Electricity bill",
    ...overrides,
  };
}

function baseTransaction() {
  return {
    expense: {
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: IDS.expense, createdAt: NOW, ...args.data }),
      ),
      // Present as spies so a passing test proves the service never mutates.
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    financialAccount: { findMany: vi.fn().mockResolvedValue(ACCOUNTS) },
    financialEntry: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    numberSequence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("number_sequences")) {
        return Promise.resolve([
          { id: IDS.sequence, prefix: "EXP-", nextValue: 1, padding: 6, periodKey: "2026" },
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
  return new ExpensesService({ client } as unknown as PrismaService);
}

function ledgerData(tx: ReturnType<typeof baseTransaction>) {
  return tx.financialEntry.createMany.mock.calls[0]?.[0]?.data as {
    financialAccountId: string;
    direction: "debit" | "credit";
    amountMinor: bigint;
  }[];
}

describe("ExpensesService", () => {
  it("records a cash expense as an append-only insert with a balanced ledger", async () => {
    const tx = baseTransaction();
    const service = serviceFor(tx);

    const response = await service.record(CONTEXT, expenseInput());

    // Append-only: exactly one INSERT and never an update or delete.
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    expect(tx.expense.update).not.toHaveBeenCalled();
    expect(tx.expense.updateMany).not.toHaveBeenCalled();
    expect(tx.expense.delete).not.toHaveBeenCalled();
    expect(tx.expense.deleteMany).not.toHaveBeenCalled();

    // Cash expense links the open drawer session.
    const created = tx.expense.create.mock.calls[0]?.[0]?.data as {
      cashSessionId: string | null;
      financialAccountId: string;
    };
    expect(created.cashSessionId).toBe(IDS.cashSession);
    expect(created.financialAccountId).toBe("acc-cash");

    // Ledger: DR expense account, CR the cash the money left from.
    const legs = ledgerData(tx);
    expect(legs.find((leg) => leg.financialAccountId === "acc-expense")).toMatchObject({
      direction: "debit",
      amountMinor: 5_000n,
    });
    expect(legs.find((leg) => leg.financialAccountId === "acc-cash")).toMatchObject({
      direction: "credit",
      amountMinor: 5_000n,
    });
    const debit = legs
      .filter((leg) => leg.direction === "debit")
      .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
    const credit = legs
      .filter((leg) => leg.direction === "credit")
      .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
    expect(debit).toBe(credit);
    expect(response.amountMinor).toBe(5_000);
  });

  it("requires an open cash session for a cash expense", async () => {
    const tx = baseTransaction();
    tx.$queryRaw = vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("number_sequences")) {
        return Promise.resolve([
          { id: IDS.sequence, prefix: "EXP-", nextValue: 1, padding: 6, periodKey: "2026" },
        ]);
      }
      return Promise.resolve([]); // no open session
    });
    const service = serviceFor(tx);

    await expect(
      service.record(CONTEXT, expenseInput({ paymentMethod: "cash" })),
    ).rejects.toMatchObject({ code: ERROR_CODES.SALE_CASH_SESSION_REQUIRED });
    expect(tx.expense.create).not.toHaveBeenCalled();
  });

  it("records a bank expense without touching a cash session", async () => {
    const tx = baseTransaction();
    const service = serviceFor(tx);

    await service.record(CONTEXT, expenseInput({ paymentMethod: "bank_transfer" }));

    const created = tx.expense.create.mock.calls[0]?.[0]?.data as {
      cashSessionId: string | null;
      financialAccountId: string;
    };
    expect(created.cashSessionId).toBeNull();
    expect(created.financialAccountId).toBe("acc-bank");
    expect(ledgerData(tx).find((leg) => leg.financialAccountId === "acc-bank")).toMatchObject({
      direction: "credit",
      amountMinor: 5_000n,
    });
  });

  it("rejects an expense settled on customer credit", async () => {
    const tx = baseTransaction();
    const service = serviceFor(tx);

    await expect(
      service.record(CONTEXT, expenseInput({ paymentMethod: "credit" })),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
    expect(tx.expense.create).not.toHaveBeenCalled();
  });
});
