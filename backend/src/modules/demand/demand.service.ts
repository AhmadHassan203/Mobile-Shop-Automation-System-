import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  AppendDemandFollowUpResultSchema,
  businessDayEndUtc,
  businessDayStartUtc,
  DemandConversionResultSchema,
  DemandListResultSchema,
  DemandRequestDetailSchema,
  DemandStatusTransitionResultSchema,
  DomainError,
  ERROR_CODES,
  parseBusinessDate,
  PERMISSIONS,
  toBusinessDate,
  type AppendDemandFollowUpData,
  type AppendDemandFollowUpResult,
  type ConvertDemandRequestData,
  type CreateDemandRequestData,
  type DemandAvailabilitySnapshot,
  type DemandConversionResult,
  type DemandListQuery,
  type DemandListResult,
  type DemandManualStatusTarget,
  type DemandOutcome,
  type DemandRequestDetail,
  type DemandRequestItem,
  type DemandRequestItemSummary,
  type DemandRequestSummary,
  type DemandStatus,
  type DemandStatusTransitionResult,
  type TransitionDemandStatusData,
  type UpdateDemandRequestData,
  type UpdateDemandRequestItemData,
} from "@mobileshop/shared";
import { allocateDocumentNumber } from "../../common/numbers/number-sequence";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface DemandActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly actorFullName: string;
  /** Null means the actor has branch-wide location access. */
  readonly allowedLocationIds: readonly string[] | null;
  readonly permissions: readonly string[];
  readonly metadata: AuthRequestMetadata;
}

const demandInclude = {
  customer: { select: { id: true, fullName: true, isActive: true } },
  salesperson: { select: { id: true, fullName: true } },
  items: {
    orderBy: [{ lineNumber: "asc" as const }, { id: "asc" as const }],
    include: {
      matchedProductVariant: {
        select: {
          id: true,
          sku: true,
          name: true,
          productModelId: true,
          isActive: true,
        },
      },
    },
  },
  followUps: {
    orderBy: [{ occurredAt: "asc" as const }, { id: "asc" as const }],
    include: { actor: { select: { id: true, fullName: true } } },
  },
} satisfies Prisma.DemandRequestInclude;

type DemandRecord = Prisma.DemandRequestGetPayload<{
  include: typeof demandInclude;
}>;
type DemandItemRecord = DemandRecord["items"][number];
type DemandFollowUpRecord = DemandRecord["followUps"][number];

const productMatchSelect = {
  id: true,
  sku: true,
  name: true,
  trackingType: true,
  productModelId: true,
  isActive: true,
  defaultPriceMinor: true,
  productModel: {
    select: {
      isActive: true,
      brand: { select: { isActive: true } },
      category: { select: { isActive: true } },
    },
  },
} satisfies Prisma.ProductVariantSelect;

type ProductMatchRecord = Prisma.ProductVariantGetPayload<{
  select: typeof productMatchSelect;
}>;

const TERMINAL_DEMAND_STATUSES = [
  "converted_to_sale",
  "not_interested",
  "closed",
] as const;

const LOST_OUTCOMES = [
  "unavailable",
  "price_too_high",
  "customer_postponed",
  "bought_elsewhere",
  "incompatible_requirement",
  "invalid_or_fraudulent",
] as const;

const MANUAL_TRANSITIONS: Readonly<
  Record<DemandStatus, readonly DemandManualStatusTarget[]>
> = Object.freeze({
  new: ["contacted", "sourcing", "available", "not_interested", "closed"],
  contacted: [
    "sourcing",
    "available",
    "customer_notified",
    "not_interested",
    "closed",
  ],
  sourcing: [
    "contacted",
    "available",
    "customer_notified",
    "not_interested",
    "closed",
  ],
  available: [
    "contacted",
    "sourcing",
    "customer_notified",
    "not_interested",
    "closed",
  ],
  customer_notified: [
    "contacted",
    "sourcing",
    "available",
    "not_interested",
    "closed",
  ],
  converted_to_sale: [],
  not_interested: ["closed"],
  closed: [],
});

const DEFAULT_DEDUPE_WINDOW_DAYS = 30;
const DEDUPE_WINDOW_SETTING_KEY = "demand.dedupe_window_days";

const STATUS_OUTCOME_CONFLICTS: Readonly<
  Partial<Record<DemandManualStatusTarget, readonly DemandOutcome[]>>
> = Object.freeze({
  available: ["unavailable"],
  customer_notified: ["unavailable"],
  not_interested: ["reserved", "quotation_sent"],
});

function notFound(label = "demand request"): DomainError {
  return new DomainError(
    ERROR_CODES.NOT_FOUND,
    `This ${label} no longer exists.`,
  );
}

function optimistic(): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    "This demand request changed. Reload it before continuing.",
  );
}

function validation(field: string, message: string): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
  });
}

function assertStatusOutcome(
  status: DemandManualStatusTarget,
  outcome: DemandOutcome,
): void {
  if (STATUS_OUTCOME_CONFLICTS[status]?.includes(outcome) === true) {
    throw validation(
      "outcome",
      `${outcome} is inconsistent with demand status ${status}.`,
    );
  }
}

function normalizedDedupeLockKey(
  context: DemandActorContext,
  input: CreateDemandRequestData,
): string {
  const customerIdentity =
    input.customerId === null
      ? `phone:${input.customerPhone ?? ""}`
      : `customer:${input.customerId}`;
  const itemIdentity =
    input.item.match === "matched"
      ? `product:${input.item.productVariantId}`
      : `wording:${input.item.rawRequestText
          .normalize("NFKC")
          .trim()
          .replace(/\s+/gu, " ")
          .toLocaleLowerCase("en")}`;
  const digest = createHash("sha256")
    .update(
      [
        context.organizationId,
        context.branchId,
        customerIdentity,
        itemIdentity,
      ].join("\u001f"),
    )
    .digest("hex");
  return `demand-dedupe:${digest}`;
}

function conflict(message: string): DomainError {
  return new DomainError(ERROR_CODES.CONFLICT, message);
}

function safeMoney(value: bigint | null, label: string): number | null {
  if (value === null) return null;
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error(`${label} is outside the public safe-integer range.`);
  }
  return converted;
}

function iso(value: Date, label: string): string {
  if (!Number.isFinite(value.getTime()))
    throw new Error(`${label} is invalid.`);
  return value.toISOString();
}

function businessDate(value: Date | null): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value.getTime()))
    throw new Error("Business date is invalid.");
  return value.toISOString().slice(0, 10);
}

function databaseDate(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function qualified(
  record: Pick<DemandRecord, "availabilityState" | "outcome">,
): boolean {
  return (
    (record.availabilityState === "unavailable" ||
      record.availabilityState === "not_in_catalog") &&
    record.outcome !== "invalid_or_fraudulent"
  );
}

function initialOutcome(snapshot: DemandAvailabilitySnapshot): {
  readonly outcome: "unavailable" | "unknown";
  readonly lostSaleReason: string | null;
} {
  if (snapshot.state === "unavailable" || snapshot.state === "not_in_catalog") {
    return {
      outcome: "unavailable",
      lostSaleReason: "The requested item was unavailable at capture.",
    };
  }
  return { outcome: "unknown", lostSaleReason: null };
}

function snapshotData(snapshot: DemandAvailabilitySnapshot) {
  return {
    availabilityState: snapshot.state,
    availabilityUnknownReason:
      snapshot.state === "unknown" ? snapshot.reason : null,
    availableQuantitySnapshot:
      snapshot.state === "available" || snapshot.state === "unavailable"
        ? snapshot.availableQuantity
        : null,
    availabilityCheckedAt:
      snapshot.state === "unknown"
        ? snapshot.checkedAt === null
          ? null
          : new Date(snapshot.checkedAt)
        : new Date(snapshot.checkedAt),
    unitPriceMinorSnapshot:
      snapshot.state === "available" || snapshot.state === "unavailable"
        ? snapshot.unitPriceMinor === null
          ? null
          : BigInt(snapshot.unitPriceMinor)
        : null,
  };
}

function auditSnapshot(record: DemandRecord): Prisma.InputJsonObject {
  const item = record.items[0];
  return {
    id: record.id,
    requestNumber: record.requestNumber,
    status: record.status,
    outcome: record.outcome,
    availabilityState: record.availabilityState,
    matchedProductVariantId: item?.matchedProductVariantId ?? null,
    quantity: record.quantity,
    hasFollowUp: record.followUpOn !== null,
    convertedTargetType: record.convertedTargetType,
    convertedTargetId: record.convertedTargetId,
    version: record.version,
  };
}

@Injectable()
export class DemandService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    context: DemandActorContext,
    query: DemandListQuery,
  ): Promise<DemandListResult> {
    const where = this.listWhere(context, query);
    const orderBy = this.listOrder(query);
    const today = toBusinessDate(new Date());
    const kpiScope: Prisma.DemandRequestWhereInput = {
      organizationId: context.organizationId,
      branchId: context.branchId,
    };
    const [
      total,
      rows,
      totalRequests,
      unavailableMissed,
      reservedOrQuoted,
      followUpsDue,
    ] = await this.prisma.client.$transaction([
      this.prisma.client.demandRequest.count({ where }),
      this.prisma.client.demandRequest.findMany({
        where,
        include: demandInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.demandRequest.count({ where: kpiScope }),
      this.prisma.client.demandRequest.count({
        where: {
          ...kpiScope,
          availabilityState: { in: ["unavailable", "not_in_catalog"] },
        },
      }),
      this.prisma.client.demandRequest.count({
        where: {
          ...kpiScope,
          outcome: { in: ["reserved", "quotation_sent"] },
        },
      }),
      this.prisma.client.demandRequest.count({
        where: {
          ...kpiScope,
          followUpOn: { lte: new Date(`${today}T00:00:00.000Z`) },
          status: { notIn: [...TERMINAL_DEMAND_STATUSES] },
        },
      }),
    ]);

    return DemandListResultSchema.parse({
      page: {
        items: rows.map((record) => this.toSummary(record, context)),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
      kpis: {
        asOf: new Date().toISOString(),
        businessDate: today,
        totalRequests,
        unavailableMissed,
        reservedOrQuoted,
        followUpsDue,
      },
    });
  }

  async detail(
    context: DemandActorContext,
    id: string,
  ): Promise<DemandRequestDetail> {
    return this.toDetail(
      await this.load(this.prisma.client, context, id),
      context,
    );
  }

  async create(
    context: DemandActorContext,
    input: CreateDemandRequestData,
  ): Promise<DemandRequestDetail> {
    const record = await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const customerName = await this.resolveCustomerName(
        tx,
        context.organizationId,
        input.customerId,
        input.customerName,
      );
      const product = await this.resolveProduct(
        tx,
        context.organizationId,
        input.item.match === "matched" ? input.item.productVariantId : null,
      );
      const availability = await this.resolveAvailability(
        tx,
        context,
        product,
        now,
      );
      const outcome = initialOutcome(availability);
      const dedupeGroupId = await this.findDedupeGroup(
        tx,
        context,
        input,
        availability,
        now,
      );
      const requestNumber = await allocateDocumentNumber(
        tx,
        { organizationId: context.organizationId, branchId: context.branchId },
        { key: "demand_request", defaultPrefix: "DM-", padding: 6 },
      );
      const createdBase = await tx.demandRequest.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          requestNumber,
          customerId: input.customerId,
          customerName,
          contactPhoneE164: input.customerPhone,
          quantity: input.quantity,
          budgetMinMinor:
            input.budget.minimumMinor === null
              ? null
              : BigInt(input.budget.minimumMinor),
          budgetMaxMinor:
            input.budget.maximumMinor === null
              ? null
              : BigInt(input.budget.maximumMinor),
          ptaPreference: input.ptaPreference,
          urgency: input.urgency,
          channel: input.channel,
          outcome: outcome.outcome,
          lostSaleReason: outcome.lostSaleReason,
          ...snapshotData(availability),
          followUpOn: databaseDate(input.followUpOn),
          consentToContact: input.consentToContact,
          tradeInInterest: input.tradeInInterest,
          note: input.note,
          dedupeGroupId,
          salespersonUserId: context.actorUserId,
        },
      });
      await tx.demandRequestItem.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          demandRequestId: createdBase.id,
          lineNumber: 1,
          rawRequestText: input.item.rawRequestText,
          matchedProductVariantId: product?.id ?? null,
          matchedProductModelId: product?.productModelId ?? null,
          desiredBrand: input.item.desiredBrand,
          desiredModel: input.item.desiredModel,
          desiredVariant: input.item.desiredVariant,
          desiredRam: input.item.desiredRam,
          desiredStorage: input.item.desiredStorage,
          desiredColor: input.item.desiredColor,
          conditionPreference: input.item.conditionPreference,
        },
      });
      const created = await this.load(tx, context, createdBase.id);
      await this.audit(tx, context, "demand.created", created, null);
      return created;
    });
    return this.toDetail(record, context);
  }

  async update(
    context: DemandActorContext,
    id: string,
    input: UpdateDemandRequestData,
  ): Promise<DemandRequestDetail> {
    const record = await this.prisma.client.$transaction(async (tx) => {
      const before = await this.load(tx, context, id);
      if (before.version !== input.version) throw optimistic();
      if (before.status === "converted_to_sale" || before.status === "closed") {
        throw conflict(
          "A converted or closed demand request cannot be edited.",
        );
      }
      const currentItem = before.items[0];
      if (currentItem === undefined) {
        throw new Error("Demand request has no item row.");
      }
      const requestedProductVariantId =
        input.item.match === "matched" ? input.item.productVariantId : null;
      if (
        requestedProductVariantId !== currentItem.matchedProductVariantId
      ) {
        throw conflict(
          "The catalog match captured for a demand request cannot be changed. Update only its preference details.",
        );
      }
      const customerName = await this.resolveCustomerName(
        tx,
        context.organizationId,
        input.customerId,
        input.customerName,
      );
      const product = await this.resolveProduct(
        tx,
        context.organizationId,
        input.item.match === "matched" ? input.item.productVariantId : null,
      );
      const updated = await tx.demandRequest.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          version: input.version,
        },
        data: {
          customerId: input.customerId,
          customerName,
          contactPhoneE164: input.customerPhone,
          quantity: input.quantity,
          budgetMinMinor:
            input.budget.minimumMinor === null
              ? null
              : BigInt(input.budget.minimumMinor),
          budgetMaxMinor:
            input.budget.maximumMinor === null
              ? null
              : BigInt(input.budget.maximumMinor),
          ptaPreference: input.ptaPreference,
          urgency: input.urgency,
          channel: input.channel,
          followUpOn: databaseDate(input.followUpOn),
          consentToContact: input.consentToContact,
          tradeInInterest: input.tradeInInterest,
          note: input.note,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw optimistic();
      const itemUpdated = await tx.demandRequestItem.updateMany({
        where: {
          id: currentItem.id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          demandRequestId: id,
        },
        data: this.mutableItemData(input.item, product),
      });
      if (itemUpdated.count !== 1) throw optimistic();
      const after = await this.load(tx, context, id);
      await this.audit(tx, context, "demand.updated", after, before);
      return after;
    });
    return this.toDetail(record, context);
  }

  async transition(
    context: DemandActorContext,
    id: string,
    input: TransitionDemandStatusData,
  ): Promise<DemandStatusTransitionResult> {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.load(tx, context, id);
      if (before.version !== input.version) throw optimistic();
      if (!MANUAL_TRANSITIONS[before.status].includes(input.status)) {
        throw validation(
          "status",
          `Demand cannot move from ${before.status} to ${input.status}.`,
        );
      }
      if (input.outcome === "sold_immediately") {
        throw validation(
          "outcome",
          "Link the posted sale through the conversion action instead.",
        );
      }
      assertStatusOutcome(input.status, input.outcome);
      const isLost = LOST_OUTCOMES.includes(
        input.outcome as (typeof LOST_OUTCOMES)[number],
      );
      if (isLost && input.lostSaleReason === null) {
        throw validation(
          "lostSaleReason",
          "Record why this request did not become a sale.",
        );
      }
      if (!isLost && input.lostSaleReason !== null) {
        throw validation(
          "lostSaleReason",
          "A lost-sale reason is only valid for a missed-sale outcome.",
        );
      }
      if (
        input.status === "customer_notified" &&
        (!before.consentToContact || before.contactPhoneE164 === null)
      ) {
        throw validation(
          "status",
          "Customer notification requires a phone number and contact consent.",
        );
      }
      const update = await tx.demandRequest.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          version: input.version,
        },
        data: {
          status: input.status,
          outcome: input.outcome,
          lostSaleReason: input.lostSaleReason,
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw optimistic();
      const after = await this.load(tx, context, id);
      await this.audit(
        tx,
        context,
        "demand.status_changed",
        after,
        before,
        input.lostSaleReason ?? undefined,
      );
      return DemandStatusTransitionResultSchema.parse({
        demandRequestId: after.id,
        status: after.status,
        outcome: after.outcome,
        lostSaleReason: after.lostSaleReason,
        version: after.version,
        updatedAt: iso(after.updatedAt, "Demand update time"),
      });
    });
  }

  async appendFollowUp(
    context: DemandActorContext,
    id: string,
    input: AppendDemandFollowUpData,
  ): Promise<AppendDemandFollowUpResult> {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.load(tx, context, id);
      if (before.status === "closed" || before.status === "converted_to_sale") {
        throw conflict(
          "A closed or converted request cannot receive a follow-up.",
        );
      }
      if (
        (input.channel === "phone" || input.channel === "whatsapp") &&
        (!before.consentToContact || before.contactPhoneE164 === null)
      ) {
        throw validation(
          "channel",
          "Phone and WhatsApp follow-up require contact consent.",
        );
      }
      if (
        input.nextFollowUpOn !== null &&
        (!before.consentToContact || before.contactPhoneE164 === null)
      ) {
        throw validation(
          "nextFollowUpOn",
          "A future follow-up requires a phone number and contact consent.",
        );
      }
      const occurredAt = new Date(input.occurredAt);
      if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
        throw validation(
          "occurredAt",
          "A follow-up cannot occur in the future.",
        );
      }
      const followUp = await tx.demandFollowUp.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          demandRequestId: id,
          occurredAt,
          channel: input.channel,
          result: input.result,
          note: input.note,
          nextFollowUpOn: databaseDate(input.nextFollowUpOn),
          actorUserId: context.actorUserId,
        },
        include: { actor: { select: { id: true, fullName: true } } },
      });
      const update = await tx.demandRequest.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          version: before.version,
        },
        data: {
          followUpOn: databaseDate(input.nextFollowUpOn),
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw optimistic();
      const after = await this.load(tx, context, id);
      await this.audit(tx, context, "demand.follow_up_appended", after, before);
      return AppendDemandFollowUpResultSchema.parse({
        followUp: this.toFollowUp(followUp),
        requestVersion: after.version,
        nextFollowUpOn: businessDate(after.followUpOn),
      });
    });
  }

  async convert(
    context: DemandActorContext,
    id: string,
    input: ConvertDemandRequestData,
  ): Promise<DemandConversionResult> {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.load(tx, context, id);
      if (before.version !== input.version) throw optimistic();
      if (before.status === "converted_to_sale") {
        throw conflict("This demand request is already linked to a sale.");
      }
      const sale = await tx.sale.findFirst({
        where: {
          id: input.saleId,
          organizationId: context.organizationId,
          branchId: context.branchId,
          status: "posted",
        },
        select: {
          id: true,
          customerId: true,
          postedAt: true,
          lines: {
            select: { stockLocationId: true, productVariantId: true },
          },
        },
      });
      if (sale === null) throw notFound("posted sale");
      if (
        context.allowedLocationIds !== null &&
        sale.lines.some(
          (line) => !context.allowedLocationIds?.includes(line.stockLocationId),
        )
      ) {
        throw new DomainError(
          ERROR_CODES.FORBIDDEN_SCOPE,
          "This sale contains stock outside your assigned location scope.",
        );
      }
      if (
        before.customerId !== null &&
        before.customerId !== sale.customerId
      ) {
        throw validation(
          "saleId",
          "The sale belongs to a different registered customer.",
        );
      }
      const demandItem = before.items[0];
      if (demandItem === undefined) {
        throw new Error("Demand request has no item row.");
      }
      if (
        demandItem.matchedProductVariantId !== null &&
        !sale.lines.some(
          (line) =>
            line.productVariantId === demandItem.matchedProductVariantId,
        )
      ) {
        throw validation(
          "saleId",
          "The posted sale does not contain the catalog item requested.",
        );
      }
      if (sale.postedAt === null || sale.postedAt < before.createdAt) {
        throw validation(
          "saleId",
          "The linked sale must be posted after this demand was captured.",
        );
      }
      const alreadyLinked = await tx.demandRequest.findFirst({
        where: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          convertedTargetType: "sale",
          convertedTargetId: sale.id,
          id: { not: id },
        },
        select: { id: true },
      });
      if (alreadyLinked !== null) {
        throw conflict(
          "This sale is already linked to another demand request.",
        );
      }
      const convertedAt = new Date();
      const update = await tx.demandRequest.updateMany({
        where: {
          id,
          organizationId: context.organizationId,
          branchId: context.branchId,
          version: input.version,
        },
        data: {
          status: "converted_to_sale",
          outcome: "sold_immediately",
          lostSaleReason: null,
          convertedTargetType: "sale",
          convertedTargetId: sale.id,
          convertedAt,
          followUpOn: null,
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw optimistic();
      const after = await this.load(tx, context, id);
      await this.audit(tx, context, "demand.converted_to_sale", after, before);
      return DemandConversionResultSchema.parse({
        demandRequestId: after.id,
        target: "sale",
        targetId: sale.id,
        status: "converted_to_sale",
        outcome: "sold_immediately",
        convertedAt: iso(convertedAt, "Demand conversion time"),
        version: after.version,
      });
    });
  }

  private listWhere(
    context: DemandActorContext,
    query: DemandListQuery,
  ): Prisma.DemandRequestWhereInput {
    const filters: Prisma.DemandRequestWhereInput[] = [];
    if (query.q !== undefined) {
      const maySearchCustomers = context.permissions.includes(
        PERMISSIONS.CUSTOMERS_VIEW,
      );
      filters.push({
        OR: [
          { requestNumber: { contains: query.q, mode: "insensitive" } },
          ...(maySearchCustomers
            ? [
                {
                  customerName: {
                    contains: query.q,
                    mode: "insensitive" as const,
                  },
                },
                { contactPhoneE164: { contains: query.q } },
              ]
            : []),
          {
            items: {
              some: {
                rawRequestText: { contains: query.q, mode: "insensitive" },
              },
            },
          },
          {
            items: {
              some: {
                matchedProductVariant: {
                  is: {
                    OR: [
                      { sku: { contains: query.q, mode: "insensitive" } },
                      { name: { contains: query.q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            },
          },
        ],
      });
    }
    if (query.view === "unavailable") {
      filters.push({
        availabilityState: { in: ["unavailable", "not_in_catalog"] },
      });
    } else if (query.view === "reserved") {
      filters.push({ outcome: "reserved" });
    } else if (query.view === "quotation_sent") {
      filters.push({ outcome: "quotation_sent" });
    } else if (query.view === "price_too_high") {
      filters.push({ outcome: "price_too_high" });
    }
    if (query.match !== undefined) {
      filters.push({
        items: {
          some: {
            matchedProductVariantId:
              query.match === "matched" ? { not: null } : null,
          },
        },
      });
    }
    if (query.followUp === "due") {
      filters.push({
        followUpOn: {
          lte: new Date(`${toBusinessDate(new Date())}T00:00:00.000Z`),
        },
        status: { notIn: [...TERMINAL_DEMAND_STATUSES] },
      });
    } else if (query.followUp === "scheduled") {
      filters.push({ followUpOn: { not: null } });
    } else if (query.followUp === "none") {
      filters.push({ followUpOn: null });
    }
    return {
      organizationId: context.organizationId,
      branchId: context.branchId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
      ...(query.urgency === undefined ? {} : { urgency: query.urgency }),
      ...(query.channel === undefined ? {} : { channel: query.channel }),
      ...(query.availability === undefined
        ? {}
        : { availabilityState: query.availability }),
      ...(query.fromDate === undefined && query.toDate === undefined
        ? {}
        : {
            createdAt: {
              ...(query.fromDate === undefined
                ? {}
                : {
                    gte: businessDayStartUtc(parseBusinessDate(query.fromDate)),
                  }),
              ...(query.toDate === undefined
                ? {}
                : { lt: businessDayEndUtc(parseBusinessDate(query.toDate)) }),
            },
          }),
      ...(filters.length === 0 ? {} : { AND: filters }),
    };
  }

  private listOrder(
    query: DemandListQuery,
  ): Prisma.DemandRequestOrderByWithRelationInput[] {
    const primary: Prisma.DemandRequestOrderByWithRelationInput =
      query.sort === "follow_up_on"
        ? { followUpOn: { sort: query.direction, nulls: "last" } }
        : query.sort === "urgency"
          ? { urgency: query.direction }
          : query.sort === "updated_at"
            ? { updatedAt: query.direction }
            : { createdAt: query.direction };
    return [primary, { createdAt: "desc" }, { id: "asc" }];
  }

  private async load(
    client: Prisma.TransactionClient | PrismaService["client"],
    context: DemandActorContext,
    id: string,
  ): Promise<DemandRecord> {
    const record = await client.demandRequest.findFirst({
      where: {
        id,
        organizationId: context.organizationId,
        branchId: context.branchId,
      },
      include: demandInclude,
    });
    if (record === null) throw notFound();
    if (record.items.length !== 1) {
      throw new Error(
        `Demand request ${record.id} does not have exactly one item.`,
      );
    }
    return record;
  }

  private async resolveCustomerName(
    tx: Prisma.TransactionClient,
    organizationId: string,
    customerId: string | null,
    suppliedName: string | null,
  ): Promise<string | null> {
    if (customerId === null) return suppliedName;
    const customer = await tx.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
        deletedAt: null,
        isActive: true,
      },
      select: { fullName: true },
    });
    if (customer === null) throw notFound("customer");
    return customer.fullName;
  }

  private async resolveProduct(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productVariantId: string | null,
  ): Promise<ProductMatchRecord | null> {
    if (productVariantId === null) return null;
    const product = await tx.productVariant.findFirst({
      where: { id: productVariantId, organizationId },
      select: productMatchSelect,
    });
    if (
      product === null ||
      !product.isActive ||
      !product.productModel.isActive ||
      !product.productModel.brand.isActive ||
      !product.productModel.category.isActive
    ) {
      throw notFound("active catalog item");
    }
    return product;
  }

  private async resolveAvailability(
    tx: Prisma.TransactionClient,
    context: DemandActorContext,
    product: ProductMatchRecord | null,
    now: Date,
  ): Promise<DemandAvailabilitySnapshot> {
    if (product === null) {
      return {
        state: "not_in_catalog",
        checkedAt: now.toISOString(),
        availableQuantity: null,
        unitPriceMinor: null,
      };
    }
    const mayReadStock = context.permissions.includes(
      PERMISSIONS.INVENTORY_VIEW,
    );
    if (!mayReadStock) {
      return {
        state: "unknown",
        reason: "permission_denied",
        checkedAt: now.toISOString(),
        availableQuantity: null,
        unitPriceMinor: null,
      };
    }
    const locationWhere =
      context.allowedLocationIds === null
        ? {}
        : { stockLocationId: { in: [...context.allowedLocationIds] } };
    let availableQuantity: number;
    if (product.trackingType === "quantity") {
      const batches = await tx.stockBatch.findMany({
        where: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          productVariantId: product.id,
          stockLocation: { is: { isActive: true } },
          ...locationWhere,
        },
        select: { quantityOnHand: true, quantityReserved: true },
      });
      availableQuantity = batches.reduce(
        (sum, batch) =>
          sum + Math.max(0, batch.quantityOnHand - batch.quantityReserved),
        0,
      );
    } else {
      availableQuantity = await tx.serializedUnit.count({
        where: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          productVariantId: product.id,
          state: "available",
          stockLocation: { is: { isActive: true } },
          ...locationWhere,
        },
      });
    }
    const unitPriceMinor = context.permissions.includes(
      PERMISSIONS.PRICING_VIEW,
    )
      ? await this.effectiveUnitPrice(tx, context, product, now)
      : null;
    return availableQuantity > 0
      ? {
          state: "available",
          checkedAt: now.toISOString(),
          availableQuantity,
          unitPriceMinor,
        }
      : {
          state: "unavailable",
          checkedAt: now.toISOString(),
          availableQuantity: 0,
          unitPriceMinor,
        };
  }

  private async effectiveUnitPrice(
    tx: Prisma.TransactionClient,
    context: DemandActorContext,
    product: ProductMatchRecord,
    now: Date,
  ): Promise<number | null> {
    const commonWhere = {
      organizationId: context.organizationId,
      productVariantId: product.id,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      priceList: {
        is: {
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
      },
    } satisfies Prisma.PriceEntryWhereInput;
    const branchRule = await tx.priceEntry.findFirst({
      where: { ...commonWhere, branchId: context.branchId },
      orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
      select: { priceMinor: true },
    });
    const organizationRule =
      branchRule === null
        ? await tx.priceEntry.findFirst({
            where: { ...commonWhere, branchId: null },
            orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
            select: { priceMinor: true },
          })
        : null;
    return safeMoney(
      branchRule?.priceMinor ??
        organizationRule?.priceMinor ??
        product.defaultPriceMinor,
      "Effective Demand price",
    );
  }

  private mutableItemData(
    item: UpdateDemandRequestItemData,
    product: ProductMatchRecord | null,
  ): Prisma.DemandRequestItemUncheckedUpdateManyInput {
    return {
      matchedProductVariantId: product?.id ?? null,
      matchedProductModelId: product?.productModelId ?? null,
      desiredBrand: item.desiredBrand,
      desiredModel: item.desiredModel,
      desiredVariant: item.desiredVariant,
      desiredRam: item.desiredRam,
      desiredStorage: item.desiredStorage,
      desiredColor: item.desiredColor,
      conditionPreference: item.conditionPreference,
    };
  }

  private async findDedupeGroup(
    tx: Prisma.TransactionClient,
    context: DemandActorContext,
    input: CreateDemandRequestData,
    availability: DemandAvailabilitySnapshot,
    now: Date,
  ): Promise<string | null> {
    if (
      (availability.state !== "unavailable" &&
        availability.state !== "not_in_catalog") ||
      (input.customerId === null && input.customerPhone === null)
    ) {
      return null;
    }
    const lockKey = normalizedDedupeLockKey(context, input);
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const windowDays = await this.dedupeWindowDays(tx, context);
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const identity: Prisma.DemandRequestWhereInput =
      input.customerId !== null
        ? { customerId: input.customerId }
        : { customerId: null, contactPhoneE164: input.customerPhone };
    const itemIdentity: Prisma.DemandRequestItemWhereInput =
      input.item.match === "matched"
        ? { matchedProductVariantId: input.item.productVariantId }
        : {
            matchedProductVariantId: null,
            rawRequestText: {
              equals: input.item.rawRequestText,
              mode: "insensitive",
            },
          };
    const prior = await tx.demandRequest.findFirst({
      where: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        createdAt: { gte: since },
        availabilityState: { in: ["unavailable", "not_in_catalog"] },
        outcome: { not: "invalid_or_fraudulent" },
        ...identity,
        items: { some: itemIdentity },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true, dedupeGroupId: true },
    });
    return prior === null ? null : (prior.dedupeGroupId ?? prior.id);
  }

  private async dedupeWindowDays(
    tx: Prisma.TransactionClient,
    context: DemandActorContext,
  ): Promise<number> {
    const branch = await tx.applicationSetting.findFirst({
      where: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        key: DEDUPE_WINDOW_SETTING_KEY,
      },
      select: { value: true },
    });
    const organization =
      branch === null
        ? await tx.applicationSetting.findFirst({
            where: {
              organizationId: context.organizationId,
              branchId: null,
              key: DEDUPE_WINDOW_SETTING_KEY,
            },
            select: { value: true },
          })
        : null;
    const configured = branch?.value ?? organization?.value;
    return typeof configured === "number" &&
      Number.isInteger(configured) &&
      configured > 0 &&
      configured <= 365
      ? configured
      : DEFAULT_DEDUPE_WINDOW_DAYS;
  }

  private toSummary(
    record: DemandRecord,
    context: DemandActorContext,
  ): DemandRequestSummary {
    const item = record.items[0];
    if (item === undefined) throw new Error("Demand response has no item.");
    const mayViewCustomer = context.permissions.includes(
      PERMISSIONS.CUSTOMERS_VIEW,
    );
    return {
      id: record.id,
      requestNumber: record.requestNumber,
      requestedAt: iso(record.createdAt, "Demand request time"),
      item: this.toItemSummary(item),
      contact: mayViewCustomer
        ? {
            customerId: record.customerId,
            customerName: record.customerName,
            customerPhone: record.contactPhoneE164,
            consentToContact: record.consentToContact,
          }
        : {
            customerId: null,
            customerName: null,
            customerPhone: null,
            consentToContact: false,
          },
      quantity: record.quantity,
      budget: {
        minimumMinor: safeMoney(record.budgetMinMinor, "Minimum budget"),
        maximumMinor: safeMoney(record.budgetMaxMinor, "Maximum budget"),
      },
      ptaPreference: record.ptaPreference,
      urgency: record.urgency,
      channel: record.channel,
      status: record.status,
      outcome: record.outcome,
      availabilityState: record.availabilityState,
      followUpOn: mayViewCustomer ? businessDate(record.followUpOn) : null,
      qualifiedForBuyingPlan: qualified(record),
      countsTowardForecast: qualified(record) && record.dedupeGroupId === null,
      version: record.version,
      createdAt: iso(record.createdAt, "Demand creation time"),
      updatedAt: iso(record.updatedAt, "Demand update time"),
    };
  }

  private toDetail(
    record: DemandRecord,
    context: DemandActorContext,
  ): DemandRequestDetail {
    const item = record.items[0];
    if (item === undefined) throw new Error("Demand response has no item.");
    const mayViewCustomer = context.permissions.includes(
      PERMISSIONS.CUSTOMERS_VIEW,
    );
    return DemandRequestDetailSchema.parse({
      ...this.toSummary(record, context),
      item: this.toItem(item),
      availabilitySnapshot: this.toAvailability(record),
      tradeInInterest: record.tradeInInterest,
      note: mayViewCustomer ? record.note : null,
      lostSaleReason: record.lostSaleReason,
      dedupeGroupId: record.dedupeGroupId,
      followUps: mayViewCustomer
        ? record.followUps.map((followUp) => this.toFollowUp(followUp))
        : [],
      conversion:
        record.convertedTargetType === "sale" &&
        record.convertedTargetId !== null &&
        record.convertedAt !== null
          ? {
              target: "sale",
              targetId: record.convertedTargetId,
              convertedAt: iso(record.convertedAt, "Demand conversion time"),
            }
          : null,
    });
  }

  private toItemSummary(item: DemandItemRecord): DemandRequestItemSummary {
    if (item.matchedProductVariantId === null) {
      return { match: "unmatched", rawRequestText: item.rawRequestText };
    }
    const product = item.matchedProductVariant;
    if (product === null)
      throw new Error("Matched Demand item has no product.");
    return {
      match: "matched",
      rawRequestText: item.rawRequestText,
      productVariant: {
        id: product.id,
        sku: product.sku,
        displayName: product.name,
      },
    };
  }

  private toItem(item: DemandItemRecord): DemandRequestItem {
    return {
      ...this.toItemSummary(item),
      desiredBrand: item.desiredBrand,
      desiredModel: item.desiredModel,
      desiredVariant: item.desiredVariant,
      desiredRam: item.desiredRam,
      desiredStorage: item.desiredStorage,
      desiredColor: item.desiredColor,
      conditionPreference: item.conditionPreference,
    };
  }

  private toAvailability(record: DemandRecord): DemandAvailabilitySnapshot {
    if (record.availabilityState === "available") {
      if (
        record.availableQuantitySnapshot === null ||
        record.availabilityCheckedAt === null
      ) {
        throw new Error("Demand availability snapshot is incomplete.");
      }
      return {
        state: "available",
        checkedAt: iso(record.availabilityCheckedAt, "Availability check time"),
        availableQuantity: record.availableQuantitySnapshot,
        unitPriceMinor: safeMoney(
          record.unitPriceMinorSnapshot,
          "Captured unit price",
        ),
      };
    }
    if (record.availabilityState === "unavailable") {
      if (
        record.availableQuantitySnapshot === null ||
        record.availabilityCheckedAt === null
      ) {
        throw new Error("Demand availability snapshot is incomplete.");
      }
      return {
        state: "unavailable",
        checkedAt: iso(record.availabilityCheckedAt, "Availability check time"),
        availableQuantity: 0,
        unitPriceMinor: safeMoney(
          record.unitPriceMinorSnapshot,
          "Captured unit price",
        ),
      };
    }
    if (record.availabilityState === "not_in_catalog") {
      if (record.availabilityCheckedAt === null) {
        throw new Error("Not-in-catalog snapshot has no check time.");
      }
      return {
        state: "not_in_catalog",
        checkedAt: iso(record.availabilityCheckedAt, "Catalog check time"),
        availableQuantity: null,
        unitPriceMinor: null,
      };
    }
    if (record.availabilityUnknownReason === null) {
      throw new Error("Unknown availability has no reason.");
    }
    return {
      state: "unknown",
      reason: record.availabilityUnknownReason,
      checkedAt:
        record.availabilityCheckedAt === null
          ? null
          : iso(record.availabilityCheckedAt, "Availability attempt time"),
      availableQuantity: null,
      unitPriceMinor: null,
    };
  }

  private toFollowUp(
    followUp:
      | DemandFollowUpRecord
      | Prisma.DemandFollowUpGetPayload<{
          include: { actor: { select: { id: true; fullName: true } } };
        }>,
  ): AppendDemandFollowUpResult["followUp"] {
    return {
      id: followUp.id,
      demandRequestId: followUp.demandRequestId,
      occurredAt: iso(followUp.occurredAt, "Follow-up time"),
      channel: followUp.channel,
      result: followUp.result,
      note: followUp.note,
      nextFollowUpOn: businessDate(followUp.nextFollowUpOn),
      createdBy: {
        id: followUp.actor.id,
        displayName: followUp.actor.fullName,
      },
      createdAt: iso(followUp.createdAt, "Follow-up creation time"),
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: DemandActorContext,
    action: string,
    after: DemandRecord,
    before: DemandRecord | null,
    reason?: string,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action,
        entityType: "demand_request",
        entityId: after.id,
        beforeSnapshot:
          before === null ? Prisma.JsonNull : auditSnapshot(before),
        afterSnapshot: auditSnapshot(after),
        ...(reason === undefined ? {} : { reason }),
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }
}
