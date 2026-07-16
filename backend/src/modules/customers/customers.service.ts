import { Injectable } from "@nestjs/common";
import { Prisma, type Customer, type PrismaClient } from "@mobileshop/database";
import {
  CustomerDetailSchema,
  CustomerPageSchema,
  CustomerSummarySchema,
  DomainError,
  ERROR_CODES,
  toBusinessDate,
  type CreateCustomerData,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerPage,
  type CustomerSummary,
  type CustomerVersionData,
  type UpdateCustomerData,
} from "@mobileshop/shared";
import { allocateDocumentNumber } from "../../common/numbers/number-sequence";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface CustomerActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly canViewSensitive: boolean;
  readonly metadata: AuthRequestMetadata;
}

interface CustomerMetrics {
  readonly purchaseCount: number;
  readonly lifetimeSpendMinor: number;
  readonly receivableBalanceMinor: number;
  readonly lastVisitAt: Date | null;
}

type CustomerMetricClient = Pick<PrismaClient, "sale" | "receivable">;

const emptyMetrics: CustomerMetrics = Object.freeze({
  purchaseCount: 0,
  lifetimeSpendMinor: 0,
  receivableBalanceMinor: 0,
  lastVisitAt: null,
});

function exactMoney(value: bigint | null | undefined, label: string): number {
  const resolved = value ?? 0n;
  if (
    resolved > BigInt(Number.MAX_SAFE_INTEGER) ||
    resolved < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(`${label} exceeds the API safe-integer range`);
  }
  return Number(resolved);
}

function customerNotFound(): DomainError {
  return new DomainError(ERROR_CODES.NOT_FOUND, "Customer not found");
}

function optimisticCustomerConflict(): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    "The customer changed while you were editing it. Reload and try again.",
  );
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    context: CustomerActorContext,
    query: CustomerListQuery,
  ): Promise<CustomerPage> {
    const where: Prisma.CustomerWhereInput = {
      organizationId: context.organizationId,
      deletedAt: null,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.hasReceivable === undefined
        ? {}
        : query.hasReceivable
          ? { receivables: { some: { balanceMinor: { gt: 0n } } } }
          : { receivables: { none: { balanceMinor: { gt: 0n } } } }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { fullName: { contains: query.q, mode: "insensitive" } },
              { phoneE164: { contains: query.q } },
              { customerNumber: { contains: query.q, mode: "insensitive" } },
            ],
          }),
    };
    const skip = (query.page - 1) * query.pageSize;
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      query.sort === "created_at"
        ? [{ createdAt: query.direction }, { id: "asc" }]
        : [{ fullName: query.direction }, { id: "asc" }];

    const [customers, total] = await Promise.all([
      this.prisma.client.customer.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
      }),
      this.prisma.client.customer.count({ where }),
    ]);
    const metrics = await this.loadMetrics(
      this.prisma.client,
      context.organizationId,
      customers.map((customer) => customer.id),
    );
    const page = {
      items: customers.map((customer) =>
        this.toSummary(customer, metrics.get(customer.id) ?? emptyMetrics),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
    return CustomerPageSchema.parse(page);
  }

  async detail(
    context: CustomerActorContext,
    id: string,
  ): Promise<CustomerDetail> {
    const customer = await this.loadCustomer(
      this.prisma.client,
      context.organizationId,
      id,
    );
    const metrics = await this.loadMetrics(
      this.prisma.client,
      context.organizationId,
      [id],
    );
    return this.toDetail(
      customer,
      metrics.get(id) ?? emptyMetrics,
      context.canViewSensitive,
    );
  }

  async create(
    context: CustomerActorContext,
    input: CreateCustomerData,
  ): Promise<CustomerDetail> {
    try {
      const customer = await this.prisma.client.$transaction(async (tx) => {
        const periodKey = toBusinessDate(new Date()).slice(0, 4);
        const customerNumber = await allocateDocumentNumber(
          tx,
          { organizationId: context.organizationId, branchId: null },
          {
            key: "customer",
            defaultPrefix: "CUS-",
            periodKey,
            padding: 6,
          },
        );
        const created = await tx.customer.create({
          data: {
            organizationId: context.organizationId,
            customerNumber,
            fullName: input.name,
            phoneE164: input.phone,
            phoneRaw: input.phone,
            email: input.email,
            marketingConsent: input.marketingConsent,
            addressLine: input.addressLine,
            notes: input.notes,
          },
        });
        await this.writeAudit(tx, context, {
          action: "customer.created",
          customer: created,
        });
        return created;
      });
      return this.toDetail(customer, emptyMetrics, context.canViewSensitive);
    } catch (error) {
      this.rethrowCustomerWrite(error);
    }
  }

  async update(
    context: CustomerActorContext,
    id: string,
    input: UpdateCustomerData,
  ): Promise<CustomerDetail> {
    try {
      const customer = await this.prisma.client.$transaction(async (tx) => {
        const before = await this.loadCustomer(tx, context.organizationId, id);
        const result = await tx.customer.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            deletedAt: null,
            version: input.version,
          },
          data: {
            fullName: input.name,
            phoneE164: input.phone,
            phoneRaw: input.phone,
            email: input.email,
            marketingConsent: input.marketingConsent,
            addressLine: input.addressLine,
            notes: input.notes,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw optimisticCustomerConflict();
        const updated = await this.loadCustomer(tx, context.organizationId, id);
        await this.writeAudit(tx, context, {
          action: "customer.updated",
          customer: updated,
          before,
        });
        return updated;
      });
      const metrics = await this.loadMetrics(
        this.prisma.client,
        context.organizationId,
        [id],
      );
      return this.toDetail(
        customer,
        metrics.get(id) ?? emptyMetrics,
        context.canViewSensitive,
      );
    } catch (error) {
      this.rethrowCustomerWrite(error);
    }
  }

  async setActive(
    context: CustomerActorContext,
    id: string,
    input: CustomerVersionData,
    isActive: boolean,
  ): Promise<CustomerDetail> {
    try {
      const customer = await this.prisma.client.$transaction(async (tx) => {
        const before = await this.loadCustomer(tx, context.organizationId, id);
        const result = await tx.customer.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            deletedAt: null,
            version: input.version,
          },
          data: { isActive, version: { increment: 1 } },
        });
        if (result.count !== 1) throw optimisticCustomerConflict();
        const updated = await this.loadCustomer(tx, context.organizationId, id);
        await this.writeAudit(tx, context, {
          action: isActive ? "customer.activated" : "customer.deactivated",
          customer: updated,
          before,
        });
        return updated;
      });
      const metrics = await this.loadMetrics(
        this.prisma.client,
        context.organizationId,
        [id],
      );
      return this.toDetail(
        customer,
        metrics.get(id) ?? emptyMetrics,
        context.canViewSensitive,
      );
    } catch (error) {
      this.rethrowCustomerWrite(error);
    }
  }

  private async loadCustomer(
    client: Pick<PrismaClient, "customer">,
    organizationId: string,
    id: string,
  ): Promise<Customer> {
    const customer = await client.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (customer === null) throw customerNotFound();
    return customer;
  }

  private async loadMetrics(
    client: CustomerMetricClient,
    organizationId: string,
    customerIds: readonly string[],
  ): Promise<ReadonlyMap<string, CustomerMetrics>> {
    if (customerIds.length === 0) return new Map();
    const [sales, receivables] = await Promise.all([
      client.sale.groupBy({
        by: ["customerId"],
        where: {
          organizationId,
          customerId: { in: [...customerIds] },
          status: { in: ["posted", "partially_returned", "returned"] },
        },
        _count: { _all: true },
        _sum: { totalMinor: true },
        _max: { postedAt: true },
      }),
      client.receivable.groupBy({
        by: ["customerId"],
        where: { organizationId, customerId: { in: [...customerIds] } },
        _sum: { balanceMinor: true },
      }),
    ]);
    const result = new Map<string, CustomerMetrics>();
    for (const sale of sales) {
      if (sale.customerId === null) continue;
      result.set(sale.customerId, {
        purchaseCount: sale._count._all,
        lifetimeSpendMinor: exactMoney(
          sale._sum.totalMinor,
          "Customer lifetime spend",
        ),
        receivableBalanceMinor: 0,
        lastVisitAt: sale._max.postedAt,
      });
    }
    for (const receivable of receivables) {
      const current = result.get(receivable.customerId) ?? emptyMetrics;
      result.set(receivable.customerId, {
        ...current,
        receivableBalanceMinor: exactMoney(
          receivable._sum.balanceMinor,
          "Customer receivable balance",
        ),
      });
    }
    return result;
  }

  private toSummary(
    customer: Customer,
    metrics: CustomerMetrics,
  ): CustomerSummary {
    if (customer.phoneE164 === null) {
      throw new Error(`Customer ${customer.id} has no normalized phone`);
    }
    return CustomerSummarySchema.parse({
      id: customer.id,
      name: customer.fullName,
      phone: customer.phoneE164,
      marketingConsent: customer.marketingConsent,
      purchaseCount: metrics.purchaseCount,
      lifetimeSpendMinor: metrics.lifetimeSpendMinor,
      receivableBalanceMinor: metrics.receivableBalanceMinor,
      lastVisitAt: metrics.lastVisitAt?.toISOString() ?? null,
      isActive: customer.isActive,
      version: customer.version,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    });
  }

  private toDetail(
    customer: Customer,
    metrics: CustomerMetrics,
    canViewSensitive: boolean,
  ): CustomerDetail {
    return CustomerDetailSchema.parse({
      ...this.toSummary(customer, metrics),
      email: customer.email,
      addressLine: customer.addressLine,
      notes: customer.notes,
      sensitive: canViewSensitive
        ? {
            availability: "available",
            nationalIdentityReference: null,
            externalReference: null,
          }
        : { availability: "redacted" },
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    context: CustomerActorContext,
    event: {
      readonly action: string;
      readonly customer: Customer;
      readonly before?: Customer;
    },
  ): Promise<void> {
    const snapshot = (customer: Customer): Prisma.InputJsonObject => ({
      id: customer.id,
      customerNumber: customer.customerNumber,
      name: customer.fullName,
      isActive: customer.isActive,
      version: customer.version,
    });
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action: event.action,
        entityType: "customer",
        entityId: event.customer.id,
        ...(event.before === undefined
          ? {}
          : { beforeSnapshot: snapshot(event.before) }),
        afterSnapshot: snapshot(event.customer),
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }

  private rethrowCustomerWrite(error: unknown): never {
    if (error instanceof DomainError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new DomainError(
        ERROR_CODES.CONFLICT,
        "A customer with this phone number already exists.",
        {
          details: { phone: ["Phone number is already registered."] },
          cause: error,
        },
      );
    }
    if (error instanceof Error) throw error;
    throw new Error("Customer database operation failed", { cause: error });
  }
}
