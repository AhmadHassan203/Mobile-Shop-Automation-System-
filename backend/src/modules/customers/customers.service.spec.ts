import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import {
  CustomersService,
  type CustomerActorContext,
} from "./customers.service";

const IDS = {
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  customer: "10000000-0000-4000-8000-000000000004",
} as const;

const context: CustomerActorContext = {
  organizationId: IDS.organization,
  branchId: IDS.branch,
  actorUserId: IDS.user,
  canViewSensitive: false,
  metadata: {
    requestId: "request-id",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  },
};

const customer = {
  id: IDS.customer,
  organizationId: IDS.organization,
  customerNumber: "CUS-2026-000001",
  fullName: "Ayesha Khan",
  phoneE164: "+923001234567",
  phoneRaw: "+923001234567",
  email: "ayesha@example.com",
  marketingConsent: "granted",
  addressLine: "Gulberg, Lahore",
  creditLimitMinor: 0n,
  notes: null,
  isActive: true,
  deletedAt: null,
  version: 2,
  createdAt: new Date("2026-07-10T08:00:00.000Z"),
  updatedAt: new Date("2026-07-16T10:00:00.000Z"),
} as const;

function readClient() {
  return {
    customer: {
      findMany: vi.fn().mockResolvedValue([customer]),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(customer),
    },
    sale: {
      groupBy: vi.fn().mockResolvedValue([
        {
          customerId: IDS.customer,
          _count: { _all: 3 },
          _sum: { totalMinor: 350_000n },
          _max: { postedAt: new Date("2026-07-16T10:00:00.000Z") },
        },
      ]),
    },
    receivable: {
      groupBy: vi
        .fn()
        .mockResolvedValue([
          { customerId: IDS.customer, _sum: { balanceMinor: 45_000n } },
        ]),
    },
  };
}

describe("CustomersService", () => {
  it("returns only strict customer summaries with real sale and receivable metrics", async () => {
    const client = readClient();
    const service = new CustomersService({
      client,
    } as unknown as PrismaService);

    const result = await service.list(context, {
      page: 1,
      pageSize: 25,
      q: "Ayesha",
      hasReceivable: true,
      active: true,
      sort: "name",
      direction: "asc",
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: IDS.customer,
        purchaseCount: 3,
        lifetimeSpendMinor: 350_000,
        receivableBalanceMinor: 45_000,
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty("organizationId");
    expect(client.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: IDS.organization }),
      }),
    );
  });

  it("structurally redacts sensitive fields without permission", async () => {
    const client = readClient();
    const service = new CustomersService({
      client,
    } as unknown as PrismaService);

    await expect(service.detail(context, IDS.customer)).resolves.toMatchObject({
      id: IDS.customer,
      sensitive: { availability: "redacted" },
    });
  });

  it("returns the available sensitive branch only to an authorized actor", async () => {
    const client = readClient();
    const service = new CustomersService({
      client,
    } as unknown as PrismaService);

    await expect(
      service.detail({ ...context, canViewSensitive: true }, IDS.customer),
    ).resolves.toMatchObject({
      sensitive: {
        availability: "available",
        nationalIdentityReference: null,
        externalReference: null,
      },
    });
  });

  it("returns the same not-found error for another tenant's customer", async () => {
    const client = readClient();
    client.customer.findFirst.mockResolvedValue(null);
    const service = new CustomersService({
      client,
    } as unknown as PrismaService);

    await expect(service.detail(context, IDS.customer)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(client.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: IDS.customer,
        organizationId: IDS.organization,
        deletedAt: null,
      },
    });
  });
});
