import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  DomainError,
  ERROR_CODES,
  ExpensePageSchema,
  ExpenseSchema,
  SEQUENCE_KEYS,
  toBusinessDate,
  type CreateExpenseData,
  type Expense,
  type ExpenseListQuery,
  type ExpensePage,
} from "@mobileshop/shared";
import { allocateDocumentNumber } from "../../common/numbers/number-sequence";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface ExpensesActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly metadata: AuthRequestMetadata;
}

/** Server-authoritative settlement account per payment rail. Credit is not a
 * cash/bank outflow, so an expense cannot settle to it. */
const SETTLEMENT_ACCOUNT_BY_METHOD = Object.freeze({
  cash: { code: "CASH", subtype: "physical_cash" },
  bank_transfer: { code: "BANK", subtype: "bank" },
  card: { code: "BANK", subtype: "bank" },
  digital_wallet: { code: "DIGITAL", subtype: "provider_float" },
} as const);

type ExpenseRow = Prisma.ExpenseGetPayload<Record<string, never>>;

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

function businessDateText(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("Invalid business date.");
  return value.toISOString().slice(0, 10);
}

function validation(message: string, field = "expense"): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
  });
}

function expenseResponse(row: ExpenseRow): Expense {
  return ExpenseSchema.parse({
    id: row.id,
    expenseNumber: row.expenseNumber,
    category: row.category,
    amountMinor: safeInteger(row.amountMinor, "expense amount", 1),
    paymentMethod: row.paymentMethod,
    note: row.note,
    businessDate: businessDateText(row.businessDate),
    spentAt: iso(row.spentAt),
    createdAt: iso(row.createdAt),
  });
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(context: ExpensesActorContext, query: ExpenseListQuery): Promise<ExpensePage> {
    const additionalFilters: Prisma.ExpenseWhereInput[] = [];
    if (query.q !== undefined) {
      additionalFilters.push({
        OR: [
          { expenseNumber: { contains: query.q, mode: "insensitive" } },
          { note: { contains: query.q, mode: "insensitive" } },
        ],
      });
    }
    const where: Prisma.ExpenseWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...(query.category === undefined ? {} : { category: query.category }),
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
      ...(additionalFilters.length === 0 ? {} : { AND: additionalFilters }),
    };
    const [total, rows] = await this.prisma.client.$transaction([
      this.prisma.client.expense.count({ where }),
      this.prisma.client.expense.findMany({
        where,
        orderBy: [{ spentAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return ExpensePageSchema.parse({
      items: rows.map((row) => expenseResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async record(context: ExpensesActorContext, input: CreateExpenseData): Promise<Expense> {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const routing =
        input.paymentMethod === "credit"
          ? undefined
          : SETTLEMENT_ACCOUNT_BY_METHOD[input.paymentMethod];
      if (routing === undefined) {
        throw validation(
          "An expense settles from cash, bank or a digital wallet, never customer credit.",
          "paymentMethod",
        );
      }
      const accounts = await tx.financialAccount.findMany({
        where: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          isActive: true,
          code: { in: ["CASH", "BANK", "DIGITAL", "EXPENSE"] },
        },
        orderBy: [{ code: "asc" }, { id: "asc" }],
      });
      const accountFor = (
        code: string,
        subtype: (typeof accounts)[number]["accountSubtype"],
      ) => {
        const account = accounts.find(
          (candidate) => candidate.code === code && candidate.accountSubtype === subtype,
        );
        if (account === undefined) {
          throw validation(
            `Configure the active ${code} account as ${subtype.replaceAll("_", " ")} before recording expenses.`,
            "paymentMethod",
          );
        }
        return account;
      };
      const settlementAccount = accountFor(routing.code, routing.subtype);
      const expenseAccount = accountFor("EXPENSE", "expense");

      const now = new Date();
      const businessDateValue = toBusinessDate(now);
      const businessDate = new Date(`${businessDateValue}T00:00:00.000Z`);
      const spentAt = input.spentAt === undefined ? now : new Date(input.spentAt);

      let cashSessionId: string | null = null;
      if (input.paymentMethod === "cash") {
        const lockedSessions = await tx.$queryRaw<readonly { readonly id: string }[]>`
          SELECT id
            FROM cash_sessions
           WHERE organization_id = ${context.organizationId}::uuid
             AND branch_id = ${context.branchId}::uuid
             AND status IN ('open', 'reopened_with_authorization')
           ORDER BY opened_at DESC, id DESC
           LIMIT 1
           FOR UPDATE`;
        cashSessionId = lockedSessions[0]?.id ?? null;
        if (cashSessionId === null) {
          throw new DomainError(
            ERROR_CODES.SALE_CASH_SESSION_REQUIRED,
            "Open a cash session before recording a cash expense.",
          );
        }
      }

      const expenseNumber = await allocateDocumentNumber(
        tx,
        { organizationId: context.organizationId, branchId: context.branchId },
        {
          key: SEQUENCE_KEYS.EXPENSE,
          defaultPrefix: "EXP-",
          periodKey: businessDateValue.slice(0, 4),
        },
      );

      const created = await tx.expense.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          expenseNumber,
          category: input.category,
          amountMinor: BigInt(input.amountMinor),
          paymentMethod: input.paymentMethod,
          financialAccountId: settlementAccount.id,
          cashSessionId,
          note: input.note,
          businessDate,
          spentAt,
          recordedByUserId: context.actorUserId,
        },
      });

      // Balanced ledger: the expense account absorbs the cost, the settlement
      // account funds it. Both legs equal the (always positive) expense amount.
      const entryGroupId = created.id;
      const entryBase = {
        organizationId: context.organizationId,
        branchId: context.branchId,
        entryGroupId,
        sourceType: "expense" as const,
        sourceId: created.id,
        occurredAt: now,
        businessDate,
        actorUserId: context.actorUserId,
      };
      await tx.financialEntry.createMany({
        data: [
          {
            ...entryBase,
            sourceKey: `expense:${created.id}:expense`,
            financialAccountId: expenseAccount.id,
            direction: "debit",
            amountMinor: BigInt(input.amountMinor),
            description: `Expense ${expenseNumber} (${input.category})`,
          },
          {
            ...entryBase,
            sourceKey: `expense:${created.id}:settlement`,
            financialAccountId: settlementAccount.id,
            direction: "credit",
            amountMinor: BigInt(input.amountMinor),
            description: `Expense ${expenseNumber} settlement`,
          },
        ],
      });

      await this.audit(tx, context, "expense.recorded", created.id, {
        expenseNumber,
        category: input.category,
        amountMinor: input.amountMinor,
        paymentMethod: input.paymentMethod,
        businessDate: businessDateValue,
      });
      return created;
    });
    return expenseResponse(row);
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: ExpensesActorContext,
    action: string,
    entityId: string,
    afterSnapshot: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action,
        entityType: "expense",
        entityId,
        beforeSnapshot: Prisma.JsonNull,
        afterSnapshot,
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }
}
