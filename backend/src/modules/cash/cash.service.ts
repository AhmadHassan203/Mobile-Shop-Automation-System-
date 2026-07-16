import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  CashSessionPageSchema,
  CashSessionSchema,
  DomainError,
  ERROR_CODES,
  SEQUENCE_KEYS,
  toBusinessDate,
  type CashSession,
  type CashSessionListQuery,
  type CashSessionPage,
  type CloseCashSessionData,
  type OpenCashSessionData,
} from "@mobileshop/shared";
import { allocateDocumentNumber } from "../../common/numbers/number-sequence";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface CashActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly metadata: AuthRequestMetadata;
}

/** States that count as an active drawer for one branch. */
const OPEN_STATES = ["open", "reopened_with_authorization"] as const;

const cashSessionInclude = {
  cashier: { select: { id: true, fullName: true } },
} satisfies Prisma.CashSessionInclude;

type CashSessionRecord = Prisma.CashSessionGetPayload<{
  include: typeof cashSessionInclude;
}>;

function safeInteger(value: bigint | number, label: string, minimum?: number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || (minimum !== undefined && result < minimum)) {
    throw new Error(`${label} is outside the safe-integer range.`);
  }
  return result;
}

function iso(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("Invalid database timestamp.");
  return value.toISOString();
}

function notFound(): DomainError {
  return new DomainError(ERROR_CODES.NOT_FOUND, "This cash session no longer exists.");
}

function optimistic(): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    "This cash session changed. Reload it before continuing.",
  );
}

function sessionResponse(record: CashSessionRecord): CashSession {
  return CashSessionSchema.parse({
    id: record.id,
    sessionNumber: record.sessionNumber,
    status: record.status,
    openingCashMinor: safeInteger(record.openingCashMinor, "opening cash", 0),
    expectedCashMinor:
      record.closingExpectedMinor === null
        ? null
        : safeInteger(record.closingExpectedMinor, "expected cash", 0),
    countedCashMinor:
      record.closingCountedMinor === null
        ? null
        : safeInteger(record.closingCountedMinor, "counted cash", 0),
    varianceMinor:
      record.closingVarianceMinor === null
        ? null
        : safeInteger(record.closingVarianceMinor, "cash variance"),
    openedAt: iso(record.openedAt),
    closedAt: record.closedAt === null ? null : iso(record.closedAt),
    cashier: { id: record.cashier.id, fullName: record.cashier.fullName },
    version: record.version,
  });
}

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  async open(
    context: CashActorContext,
    input: OpenCashSessionData,
  ): Promise<CashSession> {
    const record = await this.prisma.client.$transaction(
      async (tx) => {
        const existing = await tx.cashSession.findFirst({
          where: {
            organizationId: context.organizationId,
            branchId: context.branchId,
            status: { in: [...OPEN_STATES] },
          },
          select: { id: true },
        });
        if (existing !== null) {
          throw new DomainError(
            ERROR_CODES.CASH_SESSION_ALREADY_OPEN,
            "A cash session is already open for this branch. Close it before opening another.",
          );
        }
        const now = new Date();
        const businessDateText = toBusinessDate(now);
        const businessDate = new Date(`${businessDateText}T00:00:00.000Z`);
        const sessionNumber = await allocateDocumentNumber(
          tx,
          { organizationId: context.organizationId, branchId: context.branchId },
          {
            key: SEQUENCE_KEYS.CASH_SESSION,
            defaultPrefix: "CS-",
            periodKey: businessDateText.slice(0, 4),
          },
        );
        const created = await tx.cashSession.create({
          data: {
            organizationId: context.organizationId,
            branchId: context.branchId,
            sessionNumber,
            cashierUserId: context.actorUserId,
            openedByUserId: context.actorUserId,
            status: "open",
            openingCashMinor: BigInt(input.openingCashMinor),
            openedAt: now,
            businessDate,
          },
          select: { id: true },
        });
        await this.audit(tx, context, "cash_session.opened", created.id, {
          sessionNumber,
          openingCashMinor: input.openingCashMinor,
          businessDate: businessDateText,
        });
        return this.load(tx, context, created.id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return sessionResponse(record);
  }

  async current(context: CashActorContext): Promise<CashSession | null> {
    const record = await this.prisma.client.cashSession.findFirst({
      where: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        status: { in: [...OPEN_STATES] },
      },
      include: cashSessionInclude,
      orderBy: [{ openedAt: "desc" }, { id: "asc" }],
    });
    return record === null ? null : sessionResponse(record);
  }

  async list(
    context: CashActorContext,
    query: CashSessionListQuery,
  ): Promise<CashSessionPage> {
    const where: Prisma.CashSessionWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            businessDate: {
              ...(query.from === undefined
                ? {}
                : { gte: new Date(`${query.from}T00:00:00.000Z`) }),
              ...(query.to === undefined
                ? {}
                : { lte: new Date(`${query.to}T00:00:00.000Z`) }),
            },
          }),
    };
    const [total, rows] = await this.prisma.client.$transaction([
      this.prisma.client.cashSession.count({ where }),
      this.prisma.client.cashSession.findMany({
        where,
        include: cashSessionInclude,
        orderBy: [{ openedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return CashSessionPageSchema.parse({
      items: rows.map((record) => ({
        id: record.id,
        sessionNumber: record.sessionNumber,
        status: record.status,
        openingCashMinor: safeInteger(record.openingCashMinor, "opening cash", 0),
        varianceMinor:
          record.closingVarianceMinor === null
            ? null
            : safeInteger(record.closingVarianceMinor, "cash variance"),
        openedAt: iso(record.openedAt),
        closedAt: record.closedAt === null ? null : iso(record.closedAt),
        cashier: { id: record.cashier.id, fullName: record.cashier.fullName },
        version: record.version,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async close(
    context: CashActorContext,
    id: string,
    input: CloseCashSessionData,
  ): Promise<CashSession> {
    const record = await this.prisma.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${id}::uuid AND organization_id = ${context.organizationId}::uuid AND branch_id = ${context.branchId}::uuid FOR UPDATE`;
        const current = await this.load(tx, context, id);
        if (current.status !== "open") {
          throw new DomainError(
            ERROR_CODES.CASH_SESSION_NOT_OPEN,
            "Only an open cash session can be closed.",
          );
        }
        if (current.version !== input.version) throw optimistic();

        // Server-authoritative expected drawer balance: opening float plus every
        // cash-affecting movement tied to this session. External impact is signed.
        const [cashPayments, externals, cashExpenses] = await Promise.all([
          tx.payment.aggregate({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              cashSessionId: id,
              paymentMethod: "cash",
            },
            _sum: { amountMinor: true },
          }),
          tx.externalTransaction.aggregate({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              cashSessionId: id,
            },
            _sum: { cashImpactMinor: true },
          }),
          tx.expense.aggregate({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              cashSessionId: id,
              paymentMethod: "cash",
            },
            _sum: { amountMinor: true },
          }),
        ]);
        const expectedCashMinor = safeInteger(
          BigInt(current.openingCashMinor) +
            (cashPayments._sum.amountMinor ?? 0n) +
            (externals._sum.cashImpactMinor ?? 0n) -
            (cashExpenses._sum.amountMinor ?? 0n),
          "expected cash",
          0,
        );
        const varianceMinor = input.countedCashMinor - expectedCashMinor;

        const now = new Date();
        const closed = await tx.cashSession.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            branchId: context.branchId,
            status: "open",
            version: input.version,
          },
          data: {
            status: "closed",
            closingCountedMinor: BigInt(input.countedCashMinor),
            closingExpectedMinor: BigInt(expectedCashMinor),
            closingVarianceMinor: BigInt(varianceMinor),
            closingNote: input.note,
            closedByUserId: context.actorUserId,
            closedAt: now,
            version: { increment: 1 },
          },
        });
        if (closed.count !== 1) throw optimistic();
        await this.audit(
          tx,
          context,
          "cash_session.closed",
          id,
          {
            expectedCashMinor,
            countedCashMinor: input.countedCashMinor,
            varianceMinor,
            version: input.version + 1,
          },
          input.note ?? undefined,
        );
        return this.load(tx, context, id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return sessionResponse(record);
  }

  private async load(
    client: Prisma.TransactionClient | PrismaService["client"],
    context: CashActorContext,
    id: string,
  ): Promise<CashSessionRecord> {
    const record = await client.cashSession.findFirst({
      where: { id, organizationId: context.organizationId, branchId: context.branchId },
      include: cashSessionInclude,
    });
    if (record === null) throw notFound();
    return record;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: CashActorContext,
    action: string,
    entityId: string,
    afterSnapshot: Prisma.InputJsonObject,
    reason?: string,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action,
        entityType: "cash_session",
        entityId,
        beforeSnapshot: Prisma.JsonNull,
        afterSnapshot,
        ...(reason === undefined ? {} : { reason }),
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }
}
