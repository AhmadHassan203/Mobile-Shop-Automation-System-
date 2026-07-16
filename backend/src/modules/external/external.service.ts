import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  computeCashImpactMinor,
  computeExternalFeeMinor,
  computeServiceProfitMinor,
  defaultDirectionForType,
  DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR,
  DomainError,
  ERROR_CODES,
  EXTERNAL_FEE_CONFIG,
  EXTERNAL_FEE_CONFIG_KEYS,
  ExternalTransactionPageSchema,
  ExternalTransactionSchema,
  PERMISSIONS,
  SEQUENCE_KEYS,
  toBusinessDate,
  type CreateExternalTransactionData,
  type ExternalFeeConfig,
  type ExternalTransaction,
  type ExternalTransactionListQuery,
  type ExternalTransactionPage,
} from "@mobileshop/shared";
import { allocateDocumentNumber } from "../../common/numbers/number-sequence";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface ExternalActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly permissions: readonly string[];
  readonly metadata: AuthRequestMetadata;
}

/**
 * Server-authoritative settlement account per payment rail. Credit is never a
 * settlement rail for a pass-through service — the principal is not a receivable.
 */
const SETTLEMENT_ACCOUNT_BY_METHOD = Object.freeze({
  cash: { code: "CASH", subtype: "physical_cash" },
  bank_transfer: { code: "BANK", subtype: "bank" },
  card: { code: "BANK", subtype: "bank" },
  digital_wallet: { code: "DIGITAL", subtype: "provider_float" },
} as const);

type ExternalRow = Prisma.ExternalTransactionGetPayload<Record<string, never>>;

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

function notFound(label = "external transaction"): DomainError {
  return new DomainError(ERROR_CODES.NOT_FOUND, `This ${label} no longer exists.`);
}

function validation(message: string, field = "external"): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
  });
}

/**
 * Public response for one recorded transaction. `feeOverridden` is derived by
 * comparing the recorded fee against the configured per-started-block fee — a
 * charged fee that differs from the standard rate is, by definition, an override.
 */
function externalResponse(row: ExternalRow, config: ExternalFeeConfig): ExternalTransaction {
  const principalMinor = safeInteger(row.principalMinor, "principal", 0);
  const feeChargedMinor = safeInteger(row.feeChargedMinor, "fee charged", 0);
  const standardFeeMinor = computeExternalFeeMinor(
    row.transactionType,
    principalMinor,
    config,
  );
  return ExternalTransactionSchema.parse({
    id: row.id,
    txnNumber: row.txnNumber,
    provider: row.provider,
    transactionType: row.transactionType,
    direction: row.direction,
    principalMinor,
    feeChargedMinor,
    providerChargeMinor: safeInteger(row.providerChargeMinor, "provider charge", 0),
    serviceProfitMinor: safeInteger(row.serviceProfitMinor, "service profit"),
    cashImpactMinor: safeInteger(row.cashImpactMinor, "cash impact"),
    feeOverridden: feeChargedMinor !== standardFeeMinor,
    paymentMethod: row.paymentMethod,
    providerReference: row.providerReference,
    accountReference: row.accountReference,
    customerId: row.customerId,
    customerName: row.customerNameSnapshot,
    customerPhone: row.customerPhoneSnapshot,
    note: row.note,
    businessDate: businessDateText(row.businessDate),
    createdAt: iso(row.createdAt),
  });
}

@Injectable()
export class ExternalService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    context: ExternalActorContext,
    query: ExternalTransactionListQuery,
  ): Promise<ExternalTransactionPage> {
    const additionalFilters: Prisma.ExternalTransactionWhereInput[] = [];
    if (query.q !== undefined) {
      additionalFilters.push({
        OR: [
          { txnNumber: { contains: query.q, mode: "insensitive" } },
          { providerReference: { contains: query.q, mode: "insensitive" } },
          { accountReference: { contains: query.q, mode: "insensitive" } },
          { customerNameSnapshot: { contains: query.q, mode: "insensitive" } },
        ],
      });
    }
    const where: Prisma.ExternalTransactionWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...(query.provider === undefined ? {} : { provider: query.provider }),
      ...(query.transactionType === undefined
        ? {}
        : { transactionType: query.transactionType }),
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
    const [config, [total, rows]] = await Promise.all([
      this.feeConfig(this.prisma.client, context),
      this.prisma.client.$transaction([
        this.prisma.client.externalTransaction.count({ where }),
        this.prisma.client.externalTransaction.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]),
    ]);
    return ExternalTransactionPageSchema.parse({
      items: rows.map((row) => externalResponse(row, config)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    });
  }

  async detail(context: ExternalActorContext, id: string): Promise<ExternalTransaction> {
    const [config, row] = await Promise.all([
      this.feeConfig(this.prisma.client, context),
      this.prisma.client.externalTransaction.findFirst({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
        },
      }),
    ]);
    if (row === null) throw notFound();
    return externalResponse(row, config);
  }

  async record(
    context: ExternalActorContext,
    idempotencyKey: string | null,
    input: CreateExternalTransactionData,
    retryCount = 0,
  ): Promise<ExternalTransaction> {
    const overridden = input.feeChargedMinor !== undefined;
    if (overridden && !context.permissions.includes(PERMISSIONS.EXTERNAL_OVERRIDE_FEE)) {
      throw new DomainError(
        ERROR_CODES.FORBIDDEN_PERMISSION,
        "Overriding the computed fee requires external.override_fee permission.",
      );
    }
    if (overridden && input.feeOverrideReason === null) {
      throw validation("A manual fee override requires a reason.", "feeOverrideReason");
    }
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          provider: input.provider,
          transactionType: input.transactionType,
          principalMinor: input.principalMinor,
          feeChargedMinor: input.feeChargedMinor ?? null,
          feeOverrideReason: input.feeOverrideReason,
          providerChargeMinor: input.providerChargeMinor,
          paymentMethod: input.paymentMethod,
          providerReference: input.providerReference,
          accountReference: input.accountReference,
          customerId: input.customerId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          note: input.note,
        }),
      )
      .digest("hex");

    try {
      const result = await this.prisma.client.$transaction(
        async (tx) => {
          if (idempotencyKey !== null) {
            const used = await tx.externalTransaction.findFirst({
              where: {
                organizationId: context.organizationId,
                branchId: context.branchId,
                requestId: idempotencyKey,
              },
            });
            if (used !== null) {
              if (used.requestHash !== requestHash) {
                throw new DomainError(
                  ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
                  "This idempotency key was already used for a different external transaction.",
                );
              }
              const config = await this.feeConfig(tx, context);
              return { row: used, config };
            }
          }

          const config = await this.feeConfig(tx, context);
          const principalMinor = input.principalMinor;
          const providerChargeMinor = input.providerChargeMinor;
          const feeChargedMinor = overridden
            ? (input.feeChargedMinor as number)
            : computeExternalFeeMinor(input.transactionType, principalMinor, config);
          safeInteger(feeChargedMinor, "fee charged", 0);
          const serviceProfitMinor = computeServiceProfitMinor(
            feeChargedMinor,
            providerChargeMinor,
          );
          const direction = defaultDirectionForType(input.transactionType);
          const cashImpactMinor = computeCashImpactMinor(
            input.transactionType,
            principalMinor,
            feeChargedMinor,
          );

          const routing =
            input.paymentMethod === "credit"
              ? undefined
              : SETTLEMENT_ACCOUNT_BY_METHOD[input.paymentMethod];
          if (routing === undefined) {
            throw validation(
              "External transactions settle to cash, bank or a digital wallet, never customer credit.",
              "paymentMethod",
            );
          }
          const accounts = await tx.financialAccount.findMany({
            where: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              isActive: true,
              code: { in: ["CASH", "BANK", "DIGITAL", "SERVICE-REVENUE", "SERVICE-FLOAT"] },
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
                `Configure the active ${code} account as ${subtype.replaceAll("_", " ")} before recording external transactions.`,
                "paymentMethod",
              );
            }
            return account;
          };
          const settlementAccount = accountFor(routing.code, routing.subtype);
          const serviceRevenue = accountFor("SERVICE-REVENUE", "service_revenue");
          const serviceFloat = accountFor("SERVICE-FLOAT", "service_float");

          const now = new Date();
          const businessDateValue = toBusinessDate(now);
          const businessDate = new Date(`${businessDateValue}T00:00:00.000Z`);
          const periodKey = businessDateValue.slice(0, 4);

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
                "Open a cash session before recording a cash external transaction.",
              );
            }
          }

          const customer = await this.customerSnapshot(tx, context, input);
          const txnNumber = await allocateDocumentNumber(
            tx,
            { organizationId: context.organizationId, branchId: context.branchId },
            { key: SEQUENCE_KEYS.EXTERNAL, defaultPrefix: "EXT-", periodKey },
          );

          const row = await tx.externalTransaction.create({
            data: {
              organizationId: context.organizationId,
              branchId: context.branchId,
              txnNumber,
              provider: input.provider,
              transactionType: input.transactionType,
              direction,
              principalMinor: BigInt(principalMinor),
              feeChargedMinor: BigInt(feeChargedMinor),
              providerChargeMinor: BigInt(providerChargeMinor),
              serviceProfitMinor: BigInt(serviceProfitMinor),
              cashImpactMinor: BigInt(cashImpactMinor),
              paymentMethod: input.paymentMethod,
              financialAccountId: settlementAccount.id,
              cashSessionId,
              customerId: customer.id,
              customerNameSnapshot: customer.name,
              customerPhoneSnapshot: customer.phone,
              providerReference: input.providerReference,
              accountReference: input.accountReference,
              note: input.note,
              businessDate,
              requestId: idempotencyKey,
              requestHash: idempotencyKey === null ? null : requestHash,
              createdByUserId: context.actorUserId,
            },
          });

          // Balanced ledger group. The principal is never revenue; only the
          // service profit posts to service revenue. Every leg is >= 1 minor
          // unit and a negative natural amount flips direction rather than
          // violating the amount_minor >= 1 ledger check.
          const entryGroupId = row.id;
          const legs: Prisma.FinancialEntryCreateManyInput[] = [];
          const pushLeg = (
            financialAccountId: string,
            preferred: "debit" | "credit",
            signedAmount: number,
            key: string,
            description: string,
          ): void => {
            if (signedAmount === 0) return;
            const positive = signedAmount > 0;
            legs.push({
              organizationId: context.organizationId,
              branchId: context.branchId,
              entryGroupId,
              sourceType: "external_transaction",
              sourceId: row.id,
              sourceKey: `external:${row.id}:${key}`,
              financialAccountId,
              direction: positive
                ? preferred
                : preferred === "debit"
                  ? "credit"
                  : "debit",
              amountMinor: BigInt(Math.abs(signedAmount)),
              description,
              occurredAt: now,
              businessDate,
              actorUserId: context.actorUserId,
            });
          };
          // The cash/settlement leg follows the signed drawer impact directly.
          pushLeg(
            settlementAccount.id,
            "debit",
            cashImpactMinor,
            "cash",
            `External ${txnNumber} settlement`,
          );
          if (direction === "cash_in") {
            pushLeg(
              serviceFloat.id,
              "credit",
              principalMinor + providerChargeMinor,
              "float",
              `External ${txnNumber} provider float`,
            );
          } else {
            pushLeg(
              serviceFloat.id,
              "debit",
              principalMinor - providerChargeMinor,
              "float",
              `External ${txnNumber} provider float`,
            );
          }
          pushLeg(
            serviceRevenue.id,
            "credit",
            serviceProfitMinor,
            "revenue",
            `External ${txnNumber} service profit`,
          );
          const debit = legs
            .filter((leg) => leg.direction === "debit")
            .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
          const credit = legs
            .filter((leg) => leg.direction === "credit")
            .reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
          if (debit !== credit) {
            throw new DomainError(
              ERROR_CODES.LEDGER_UNBALANCED,
              "The external transaction ledger did not balance.",
            );
          }
          if (legs.length > 0) await tx.financialEntry.createMany({ data: legs });

          await this.audit(
            tx,
            context,
            "external.recorded",
            row.id,
            {
              txnNumber,
              transactionType: input.transactionType,
              provider: input.provider,
              principalMinor,
              feeChargedMinor,
              providerChargeMinor,
              serviceProfitMinor,
              cashImpactMinor,
              feeOverridden: overridden,
              paymentMethod: input.paymentMethod,
            },
            overridden ? input.feeOverrideReason ?? undefined : undefined,
          );
          return { row, config };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return externalResponse(result.row, result.config);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : null;
      if (code !== "P2002" && code !== "P2034") throw error;
      if (idempotencyKey !== null) {
        const used = await this.prisma.client.externalTransaction.findFirst({
          where: {
            organizationId: context.organizationId,
            branchId: context.branchId,
            requestId: idempotencyKey,
          },
        });
        if (used !== null) {
          if (used.requestHash !== requestHash) {
            throw new DomainError(
              ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
              "The idempotency key was already committed for a different external transaction.",
              { cause: error },
            );
          }
          const config = await this.feeConfig(this.prisma.client, context);
          return externalResponse(used, config);
        }
      }
      if (code === "P2034" && retryCount < 2) {
        return this.record(context, idempotencyKey, input, retryCount + 1);
      }
      throw new DomainError(
        ERROR_CODES.CONFLICT,
        "The external transaction was recorded concurrently. Retry with the same idempotency key.",
        { cause: error },
      );
    }
  }

  private async customerSnapshot(
    tx: Prisma.TransactionClient,
    context: ExternalActorContext,
    input: CreateExternalTransactionData,
  ): Promise<{ id: string | null; name: string | null; phone: string | null }> {
    if (input.customerId === null) {
      return { id: null, name: input.customerName, phone: input.customerPhone };
    }
    const customer = await tx.customer.findFirst({
      where: {
        id: input.customerId,
        organizationId: context.organizationId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, fullName: true, phoneE164: true },
    });
    if (customer === null) throw notFound("customer");
    return {
      id: customer.id,
      name: customer.fullName,
      phone: customer.phoneE164 ?? input.customerPhone,
    };
  }

  private async feeConfig(
    client: Prisma.TransactionClient | PrismaService["client"],
    context: ExternalActorContext,
  ): Promise<ExternalFeeConfig> {
    const keys = [
      EXTERNAL_FEE_CONFIG_KEYS.amountBlockMinor,
      EXTERNAL_FEE_CONFIG_KEYS.money_send,
      EXTERNAL_FEE_CONFIG_KEYS.money_withdrawal,
    ];
    const rows = await client.applicationSetting.findMany({
      where: {
        organizationId: context.organizationId,
        key: { in: keys },
        OR: [{ branchId: context.branchId }, { branchId: null }],
      },
      select: { branchId: true, key: true, value: true },
    });
    const value = (key: string, fallback: number): number => {
      const row =
        rows.find((candidate) => candidate.key === key && candidate.branchId === context.branchId) ??
        rows.find((candidate) => candidate.key === key && candidate.branchId === null);
      if (row === undefined) return fallback;
      if (
        typeof row.value !== "number" ||
        !Number.isSafeInteger(row.value) ||
        row.value < 0
      ) {
        throw new Error(`Application setting ${key} must be a non-negative integer.`);
      }
      return row.value;
    };
    return {
      amountBlockMinor: value(
        EXTERNAL_FEE_CONFIG_KEYS.amountBlockMinor,
        EXTERNAL_FEE_CONFIG.amountBlockMinor,
      ),
      feePerBlockMinorByType: {
        money_send: value(
          EXTERNAL_FEE_CONFIG_KEYS.money_send,
          DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR.money_send,
        ),
        money_withdrawal: value(
          EXTERNAL_FEE_CONFIG_KEYS.money_withdrawal,
          DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR.money_withdrawal,
        ),
      },
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: ExternalActorContext,
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
        entityType: "external_transaction",
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
