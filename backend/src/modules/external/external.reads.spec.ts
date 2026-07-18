import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { ExternalService, type ExternalActorContext } from "./external.service";

// ---------------------------------------------------------------------------
// In-memory Prisma fake that HONORS the where clause (organizationId, branchId,
// businessDate). Because it actually filters, a service that forgot to scope by
// tenant or branch would pull the other tenant's rows and fail the assertions.
// ---------------------------------------------------------------------------

interface FixtureRow {
  readonly organizationId: string;
  readonly branchId: string;
  readonly provider: string;
  readonly transactionType: string;
  readonly direction: "cash_in" | "cash_out";
  readonly principalMinor: bigint;
  readonly feeChargedMinor: bigint;
  readonly providerChargeMinor: bigint;
  readonly createdAt: Date;
  readonly businessDate: Date;
}

interface WhereArg {
  readonly organizationId?: string;
  readonly branchId?: string;
  readonly businessDate?: Date | { gte?: Date; lte?: Date };
}
interface GroupByArg {
  readonly by: readonly string[];
  readonly where: WhereArg;
  readonly _sum?: Record<string, true>;
  readonly _count?: unknown;
  readonly _max?: Record<string, true>;
}
interface AggregateArg {
  readonly where: WhereArg;
  readonly _sum?: Record<string, true>;
  readonly _count?: unknown;
}

const field = (row: FixtureRow, name: string): bigint | string | Date =>
  (row as unknown as Record<string, bigint | string | Date>)[name] as
    bigint | string | Date;

function matchesWhere(row: FixtureRow, where: WhereArg): boolean {
  if (
    where.organizationId !== undefined &&
    row.organizationId !== where.organizationId
  ) {
    return false;
  }
  if (where.branchId !== undefined && row.branchId !== where.branchId) {
    return false;
  }
  const bd = where.businessDate;
  if (bd instanceof Date) {
    return row.businessDate.getTime() === bd.getTime();
  }
  if (bd !== undefined) {
    if (bd.gte !== undefined && row.businessDate.getTime() < bd.gte.getTime())
      return false;
    if (bd.lte !== undefined && row.businessDate.getTime() > bd.lte.getTime())
      return false;
  }
  return true;
}

function fakePrisma(rows: readonly FixtureRow[]) {
  const groupBy = vi.fn((arg: GroupByArg) => {
    const filtered = rows.filter((row) => matchesWhere(row, arg.where));
    const groups = new Map<string, FixtureRow[]>();
    for (const row of filtered) {
      const key = arg.by.map((name) => String(field(row, name))).join("|");
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return Promise.resolve(
      [...groups.values()].map((list) => {
        const first = list[0] as FixtureRow;
        const entry: Record<string, unknown> = {};
        for (const name of arg.by) entry[name] = field(first, name);
        if (arg._sum) {
          entry._sum = Object.fromEntries(
            Object.keys(arg._sum).map((name) => [
              name,
              list.reduce((sum, row) => sum + (field(row, name) as bigint), 0n),
            ]),
          );
        }
        if (arg._count) entry._count = { _all: list.length };
        if (arg._max) {
          entry._max = Object.fromEntries(
            Object.keys(arg._max).map((name) => [
              name,
              list.reduce<Date | null>((max, row) => {
                const value = field(row, name) as Date;
                return max === null || value.getTime() > max.getTime()
                  ? value
                  : max;
              }, null),
            ]),
          );
        }
        return entry;
      }),
    );
  });

  const aggregate = vi.fn((arg: AggregateArg) => {
    const filtered = rows.filter((row) => matchesWhere(row, arg.where));
    const sum = arg._sum
      ? Object.fromEntries(
          Object.keys(arg._sum).map((name) => [
            name,
            filtered.length === 0
              ? null
              : filtered.reduce(
                  (total, row) => total + (field(row, name) as bigint),
                  0n,
                ),
          ]),
        )
      : {};
    return Promise.resolve({ _sum: sum, _count: filtered.length });
  });

  const client = { externalTransaction: { groupBy, aggregate } };
  return new ExternalService({ client } as unknown as PrismaService);
}

/**
 * Business-date correctness for the derived read models.
 *
 * Every bucket is the Asia/Karachi (UTC+5) business date via the shared
 * `toBusinessDate` helper and is filtered on the STORED `businessDate` column,
 * never on `createdAt` with a UTC conversion. The system clock is pinned to
 * 20:30Z instants that fall on the NEXT Karachi day so a naive UTC bucket would
 * land a full day/week/month too early — these tests fail if that regresses.
 */

const CONTEXT: ExternalActorContext = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  branchId: "10000000-0000-4000-8000-000000000002",
  actorUserId: "20000000-0000-4000-8000-000000000003",
  permissions: [],
  metadata: {
    requestId: "external-reads-test",
    ipAddress: "127.0.0.1",
    userAgent: "external-reads-test",
  },
};

function readService() {
  const groupBy = vi.fn().mockResolvedValue([]);
  const aggregate = vi.fn().mockResolvedValue({
    _sum: { feeChargedMinor: null, providerChargeMinor: null },
    _count: 0,
  });
  const client = { externalTransaction: { groupBy, aggregate } };
  const service = new ExternalService({ client } as unknown as PrismaService);
  return { service, groupBy, aggregate };
}

function whereOf(fn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return (fn.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
}

describe("External read models — Karachi business-date correctness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets balances on the Karachi business date, tenant+branch scoped", async () => {
    // 2026-07-16T20:30Z is 2026-07-17 01:30 in Asia/Karachi — the record's stored
    // business_date is 2026-07-17, so today's balances MUST include it.
    vi.setSystemTime(new Date("2026-07-16T20:30:00.000Z"));
    const { service, groupBy } = readService();

    const result = await service.balances(CONTEXT);

    expect(result.businessDate).toBe("2026-07-17");
    const where = whereOf(groupBy);
    expect(where.organizationId).toBe(CONTEXT.organizationId);
    expect(where.branchId).toBe(CONTEXT.branchId);
    expect(where.businessDate).toEqual(new Date("2026-07-17T00:00:00.000Z"));
  });

  it("computes the commission 'day' range on the Karachi date, not the UTC date", async () => {
    vi.setSystemTime(new Date("2026-07-16T20:30:00.000Z"));
    const { service, aggregate } = readService();

    const result = await service.commission(CONTEXT, "day");

    expect(result.from).toBe("2026-07-17");
    expect(result.to).toBe("2026-07-17");
    const where = whereOf(aggregate);
    expect(where.organizationId).toBe(CONTEXT.organizationId);
    expect(where.branchId).toBe(CONTEXT.branchId);
    expect(where.businessDate).toEqual({
      gte: new Date("2026-07-17T00:00:00.000Z"),
      lte: new Date("2026-07-17T00:00:00.000Z"),
    });
  });

  it("keeps the commission 'week' range on the Karachi week (no backward UTC shift)", async () => {
    // 2026-07-19T20:30Z is Karachi Monday 2026-07-20. A UTC bucket would sit on
    // Sunday 2026-07-19 and select the PREVIOUS ISO week (13..19).
    vi.setSystemTime(new Date("2026-07-19T20:30:00.000Z"));
    const { service, aggregate } = readService();

    const result = await service.commission(CONTEXT, "week");

    expect(result.from).toBe("2026-07-20");
    expect(result.to).toBe("2026-07-26");
    expect(whereOf(aggregate).businessDate).toEqual({
      gte: new Date("2026-07-20T00:00:00.000Z"),
      lte: new Date("2026-07-26T00:00:00.000Z"),
    });
  });

  it("keeps the commission 'month' range on the Karachi month (no backward UTC shift)", async () => {
    // 2026-07-31T20:30Z is Karachi 2026-08-01. A UTC bucket would sit on
    // 2026-07-31 and select all of JULY instead of AUGUST.
    vi.setSystemTime(new Date("2026-07-31T20:30:00.000Z"));
    const { service, aggregate } = readService();

    const result = await service.commission(CONTEXT, "month");

    expect(result.from).toBe("2026-08-01");
    expect(result.to).toBe("2026-08-31");
    expect(whereOf(aggregate).businessDate).toEqual({
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lte: new Date("2026-08-31T00:00:00.000Z"),
    });
  });
});

describe("External read models — tenant/branch isolation and money", () => {
  const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
  const BRANCH_A = "aaaaaaaa-0000-4000-8000-0000000000a1";
  const BRANCH_A2 = "aaaaaaaa-0000-4000-8000-0000000000a2";
  const ORG_B = "bbbbbbbb-0000-4000-8000-000000000001";
  const BRANCH_B = "bbbbbbbb-0000-4000-8000-0000000000b1";
  const TODAY = new Date("2026-07-17T00:00:00.000Z");

  const CONTEXT_A: ExternalActorContext = {
    organizationId: ORG_A,
    branchId: BRANCH_A,
    actorUserId: "aaaaaaaa-0000-4000-8000-0000000000ff",
    permissions: [],
    metadata: {
      requestId: "isolation-test",
      ipAddress: "127.0.0.1",
      userAgent: "isolation-test",
    },
  };

  const row = (over: Partial<FixtureRow>): FixtureRow => ({
    organizationId: ORG_A,
    branchId: BRANCH_A,
    provider: "jazzcash",
    transactionType: "money_send",
    direction: "cash_in",
    principalMinor: 0n,
    feeChargedMinor: 0n,
    providerChargeMinor: 0n,
    createdAt: TODAY,
    businessDate: TODAY,
    ...over,
  });

  // Tenant A rows in the scoped branch — the ONLY rows the endpoint may reflect.
  const aRows: readonly FixtureRow[] = [
    row({
      provider: "jazzcash",
      transactionType: "money_send",
      direction: "cash_in",
      principalMinor: 100_000n,
      feeChargedMinor: 1_000n,
      providerChargeMinor: 300n,
      createdAt: new Date("2026-07-17T07:00:00.000Z"),
    }),
    row({
      provider: "jazzcash",
      transactionType: "money_send",
      direction: "cash_in",
      principalMinor: 200_000n,
      feeChargedMinor: 2_000n,
      providerChargeMinor: 0n,
      createdAt: new Date("2026-07-17T09:00:00.000Z"),
    }),
    row({
      provider: "easypaisa",
      transactionType: "money_withdrawal",
      direction: "cash_out",
      principalMinor: 50_000n,
      feeChargedMinor: 1_000n,
      providerChargeMinor: 200n,
      createdAt: new Date("2026-07-17T08:00:00.000Z"),
    }),
  ];

  // Noise that MUST be excluded: same org other branch, and a whole other tenant
  // (including a colliding jazzcash provider) — all on the same business date.
  const noiseRows: readonly FixtureRow[] = [
    row({
      branchId: BRANCH_A2,
      provider: "jazzcash",
      principalMinor: 777_777n,
      feeChargedMinor: 7_777n,
      providerChargeMinor: 700n,
    }),
    row({
      organizationId: ORG_B,
      branchId: BRANCH_B,
      provider: "jazzcash",
      principalMinor: 999_999n,
      feeChargedMinor: 9_999n,
      providerChargeMinor: 555n,
    }),
    row({
      organizationId: ORG_B,
      branchId: BRANCH_B,
      provider: "zong",
      transactionType: "mobile_load",
      principalMinor: 123_456n,
      feeChargedMinor: 789n,
      providerChargeMinor: 12n,
    }),
  ];

  const allRows = [...aRows, ...noiseRows];

  // Independent expectations: plain JS reduce over ONLY the scoped tenant/branch
  // fixtures — never the service's own aggregation path.
  const expGrossFee = Number(aRows.reduce((s, r) => s + r.feeChargedMinor, 0n));
  const expProviderCost = Number(
    aRows.reduce((s, r) => s + r.providerChargeMinor, 0n),
  );
  const expSentJazz = 300_000; // both jazzcash rows are cash_in
  const expReceivedEasypaisa = 50_000; // the easypaisa row is cash_out

  beforeEach(() => {
    vi.useFakeTimers();
    // 11:00 Karachi on 2026-07-17, so "today" == the fixtures' business date.
    vi.setSystemTime(new Date("2026-07-17T06:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("commission totals reflect ONLY the scoped tenant+branch, matching an independent reduce", async () => {
    const service = fakePrisma(allRows);

    const result = await service.commission(CONTEXT_A, "day");

    expect(result.totals.grossFeeMinor).toBe(expGrossFee); // 4000, excludes B's 9999+789 and branch A2's 7777
    expect(result.totals.providerCostMinor).toBe(expProviderCost); // 500
    expect(result.totals.netCommissionMinor).toBe(
      expGrossFee - expProviderCost,
    ); // 3500
    expect(result.totals.transactionCount).toBe(aRows.length); // 3

    // Grouped rows never surface the other tenant's provider.
    expect(result.byProvider.map((p) => p.provider)).toEqual([
      "easypaisa",
      "jazzcash",
    ]);
    const jazz = result.byProvider.find((p) => p.provider === "jazzcash");
    expect(jazz).toMatchObject({
      grossFeeMinor: 3_000,
      providerCostMinor: 300,
      netCommissionMinor: 2_700,
      transactionCount: 2,
    });
    expect(result.byType.map((t) => t.transactionType)).toEqual([
      "money_send",
      "money_withdrawal",
    ]);
  });

  it("balances reflect ONLY the scoped tenant+branch, with net movement = received − sent", async () => {
    const service = fakePrisma(allRows);

    const result = await service.balances(CONTEXT_A);

    expect(result.businessDate).toBe("2026-07-17");
    expect(result.providers.map((p) => p.provider)).toEqual([
      "easypaisa",
      "jazzcash",
    ]);

    const jazz = result.providers.find((p) => p.provider === "jazzcash");
    // 777_777 (branch A2) and 999_999 (tenant B) never leak into A's jazzcash.
    expect(jazz?.amountSentTodayMinor).toBe(expSentJazz); // 300_000
    expect(jazz?.amountReceivedTodayMinor).toBe(0);
    expect(jazz?.netMovementMinor).toBe(0 - expSentJazz); // received − sent = -300_000
    expect(jazz?.transactionCount).toBe(2);
    expect(jazz?.lastTransactionAt).toBe("2026-07-17T09:00:00.000Z");
    // Derived-only: no configured source, so always null (never invented).
    expect(jazz?.openingBalanceMinor).toBeNull();
    expect(jazz?.currentBalanceMinor).toBeNull();
    expect(jazz?.lowBalanceThresholdMinor).toBeNull();

    const easypaisa = result.providers.find((p) => p.provider === "easypaisa");
    expect(easypaisa?.amountReceivedTodayMinor).toBe(expReceivedEasypaisa); // 50_000
    expect(easypaisa?.amountSentTodayMinor).toBe(0);
    expect(easypaisa?.netMovementMinor).toBe(expReceivedEasypaisa - 0); // 50_000
  });

  it("returns no providers when the scoped tenant has no activity today", async () => {
    // Only the other tenant has rows — tenant A must see an empty, honest result.
    const service = fakePrisma(
      noiseRows.filter((r) => r.organizationId === ORG_B),
    );

    const result = await service.balances(CONTEXT_A);

    expect(result.providers).toEqual([]);
  });
});
