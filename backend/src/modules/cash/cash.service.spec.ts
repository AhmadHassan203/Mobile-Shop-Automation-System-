import { ERROR_CODES } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { CashService, type CashActorContext } from "./cash.service";

const CONTEXT: CashActorContext = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  branchId: "10000000-0000-4000-8000-000000000002",
  actorUserId: "20000000-0000-4000-8000-000000000001",
  metadata: {
    requestId: "request-cash-service-test",
    ipAddress: "127.0.0.1",
    userAgent: "cash-service-test",
  },
};

const IDS = Object.freeze({
  session: "40000000-0000-4000-8000-000000000001",
  sequence: "40000000-0000-4000-8000-000000000002",
  cashier: "20000000-0000-4000-8000-000000000001",
});

const NOW = new Date("2026-07-17T09:00:00.000Z");

function openSession(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.session,
    sessionNumber: "CS-2026-000001",
    status: "open" as const,
    openingCashMinor: 5_000n,
    closingCountedMinor: null,
    closingExpectedMinor: null,
    closingVarianceMinor: null,
    closingNote: null,
    openedAt: NOW,
    closedAt: null,
    version: 1,
    cashier: { id: IDS.cashier, fullName: "Cashier One" },
    ...overrides,
  };
}

function aggregate(sum: Record<string, bigint | null>) {
  return { _sum: sum };
}

function baseTransaction() {
  return {
    cashSession: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: IDS.session }),
    },
    payment: {
      aggregate: vi.fn().mockResolvedValue(aggregate({ amountMinor: 0n })),
    },
    externalTransaction: {
      aggregate: vi.fn().mockResolvedValue(aggregate({ cashImpactMinor: 0n })),
    },
    expense: {
      aggregate: vi.fn().mockResolvedValue(aggregate({ amountMinor: 0n })),
    },
    numberSequence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("number_sequences")) {
        return Promise.resolve([
          {
            id: IDS.sequence,
            prefix: "CS-",
            nextValue: 1,
            padding: 6,
            periodKey: "2026",
          },
        ]);
      }
      return Promise.resolve([]);
    }),
  };
}

function serviceFor(tx: ReturnType<typeof baseTransaction>) {
  const client = {
    $transaction: vi.fn(
      async (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
  return new CashService({ client } as unknown as PrismaService);
}

describe("CashService", () => {
  it("refuses to open a second cash session while one is open for the branch", async () => {
    const tx = baseTransaction();
    tx.cashSession.findFirst.mockResolvedValue({ id: IDS.session });
    const service = serviceFor(tx);

    await expect(
      service.open(CONTEXT, { openingCashMinor: 5_000 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CASH_SESSION_ALREADY_OPEN });
    expect(tx.cashSession.create).not.toHaveBeenCalled();
  });

  it("opens a session with the counted opening float when none is open", async () => {
    const tx = baseTransaction();
    tx.cashSession.findFirst
      .mockResolvedValueOnce(null) // no existing open session
      .mockResolvedValueOnce(openSession()); // load after create
    const service = serviceFor(tx);

    const response = await service.open(CONTEXT, { openingCashMinor: 5_000 });

    expect(response.status).toBe("open");
    expect(response.openingCashMinor).toBe(5_000);
    expect(tx.cashSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "open",
          openingCashMinor: 5_000n,
          cashierUserId: CONTEXT.actorUserId,
          openedByUserId: CONTEXT.actorUserId,
        }),
      }),
    );
  });

  it("reconciles counted cash against the server-computed expected balance", async () => {
    const tx = baseTransaction();
    // opening 5,000 + cash sales 10,000 + external impact 2,000 - cash expenses 1,500 = 15,500.
    tx.payment.aggregate.mockResolvedValue(aggregate({ amountMinor: 10_000n }));
    tx.externalTransaction.aggregate.mockResolvedValue(
      aggregate({ cashImpactMinor: 2_000n }),
    );
    tx.expense.aggregate.mockResolvedValue(aggregate({ amountMinor: 1_500n }));
    tx.cashSession.findFirst
      .mockResolvedValueOnce(openSession()) // load under lock
      .mockResolvedValueOnce(
        openSession({
          status: "closed",
          closingExpectedMinor: 15_500n,
          closingCountedMinor: 15_000n,
          closingVarianceMinor: -500n,
          closedAt: NOW,
          version: 2,
        }),
      );
    const service = serviceFor(tx);

    const response = await service.close(CONTEXT, IDS.session, {
      version: 1,
      countedCashMinor: 15_000,
      note: null,
    });

    const closeData = tx.cashSession.updateMany.mock.calls[0]?.[0]?.data as {
      closingExpectedMinor: bigint;
      closingCountedMinor: bigint;
      closingVarianceMinor: bigint;
    };
    expect(closeData.closingExpectedMinor).toBe(15_500n);
    expect(closeData.closingCountedMinor).toBe(15_000n);
    // Variance is counted - expected: a PKR 5 shortfall is negative.
    expect(closeData.closingVarianceMinor).toBe(-500n);
    expect(response.expectedCashMinor).toBe(15_500);
    expect(response.varianceMinor).toBe(-500);
  });

  it("rejects closing a session at a stale optimistic version", async () => {
    const tx = baseTransaction();
    tx.cashSession.findFirst.mockResolvedValueOnce(openSession({ version: 3 }));
    const service = serviceFor(tx);

    await expect(
      service.close(CONTEXT, IDS.session, {
        version: 1,
        countedCashMinor: 15_000,
        note: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED });
    expect(tx.cashSession.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to close a session that is not open", async () => {
    const tx = baseTransaction();
    tx.cashSession.findFirst.mockResolvedValueOnce(
      openSession({ status: "closed" }),
    );
    const service = serviceFor(tx);

    await expect(
      service.close(CONTEXT, IDS.session, {
        version: 1,
        countedCashMinor: 15_000,
        note: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CASH_SESSION_NOT_OPEN });
    expect(tx.cashSession.updateMany).not.toHaveBeenCalled();
  });
});
