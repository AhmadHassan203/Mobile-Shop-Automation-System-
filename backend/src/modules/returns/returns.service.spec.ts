import { createHash } from "node:crypto";
import {
  ERROR_CODES,
  RETURN_EXCHANGE_UNAVAILABLE_REASON,
} from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { ReturnsService, type ReturnsActorContext } from "./returns.service";

const CONTEXT: ReturnsActorContext = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  organizationName: "Test Mobile Shop",
  branchId: "10000000-0000-4000-8000-000000000002",
  branchName: "Main Branch",
  actorUserId: "20000000-0000-4000-8000-000000000001",
  actorFullName: "Returns Manager",
  currency: "PKR",
  allowedLocationIds: null,
  permissions: [],
  canViewProfit: false,
  canViewSensitive: false,
  metadata: {
    requestId: "request-returns-service-test",
    ipAddress: "127.0.0.1",
    userAgent: "returns-service-test",
  },
};

const IDS = Object.freeze({
  return: "40000000-0000-4000-8000-000000000001",
  returnLine: "40000000-0000-4000-8000-000000000002",
  sale: "40000000-0000-4000-8000-000000000003",
  saleLine: "40000000-0000-4000-8000-000000000004",
  variant: "40000000-0000-4000-8000-000000000005",
  location: "40000000-0000-4000-8000-000000000006",
  batch: "40000000-0000-4000-8000-000000000007",
  unit: "40000000-0000-4000-8000-000000000008",
  customer: "40000000-0000-4000-8000-000000000009",
  idempotency: "40000000-0000-4000-8000-00000000000a",
  refund: "40000000-0000-4000-8000-00000000000b",
  sequence: "40000000-0000-4000-8000-00000000000c",
  cashSession: "40000000-0000-4000-8000-00000000000d",
  receivable: "40000000-0000-4000-8000-00000000000e",
  approver: "40000000-0000-4000-8000-00000000000f",
});

const RECENT_POSTED_AT = new Date(Date.now() - 24 * 60 * 60 * 1000);
const EXPIRED_POSTED_AT = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
const NOW = new Date("2026-07-16T09:00:00.000Z");

const ACCOUNTS = [
  { id: "acc-cash", code: "CASH", accountSubtype: "physical_cash" },
  { id: "acc-sales", code: "SALES", accountSubtype: "sales_revenue" },
  { id: "acc-ar", code: "AR", accountSubtype: "receivable" },
  { id: "acc-inventory", code: "INVENTORY", accountSubtype: "inventory_asset" },
  { id: "acc-cogs", code: "COGS", accountSubtype: "cost_of_goods_sold" },
];

function quantityReturnLine(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.returnLine,
    organizationId: CONTEXT.organizationId,
    branchId: CONTEXT.branchId,
    returnId: IDS.return,
    saleId: IDS.sale,
    saleLineId: IDS.saleLine,
    productVariantId: IDS.variant,
    stockLocationId: IDS.location,
    serializedUnitId: null,
    trackingTypeSnapshot: "quantity" as const,
    productNameSnapshot: "USB Cable",
    skuSnapshot: "CAB-001",
    identifierSnapshot: null,
    quantity: 2,
    refundMinor: 0n,
    cogsReversalMinor: 0n,
    condition: "used" as const,
    outcome: null,
    createdAt: NOW,
    updatedAt: NOW,
    stockLocation: { id: IDS.location, code: "SHOP", name: "Shop Floor" },
    serializedUnit: null,
    ...overrides,
  };
}

function returnRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.return,
    organizationId: CONTEXT.organizationId,
    branchId: CONTEXT.branchId,
    saleId: IDS.sale,
    customerId: IDS.customer,
    returnNumber: null,
    status: "draft" as const,
    reason: "Not charging",
    evidenceNote: "Device does not draw current.",
    totalRefundMinor: 0n,
    totalCogsReversalMinor: 0n,
    receivableCreditMinor: 0n,
    refundedMinor: 0n,
    returnWindowDaysSnapshot: 30,
    returnDeadline: new Date(
      RECENT_POSTED_AT.getTime() + 30 * 24 * 60 * 60 * 1000,
    ),
    policyCheckedAt: NOW,
    policyExpired: false,
    policyOverridden: false,
    policyOverrideReason: null,
    policyOverriddenByUserId: null,
    policyOverriddenAt: null,
    approvedByUserId: null,
    createdByUserId: CONTEXT.actorUserId,
    postRequestId: null,
    postRequestHash: null,
    postedAt: null,
    businessDate: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    organization: { currency: "PKR" },
    sale: {
      id: IDS.sale,
      invoiceNumber: "INV-2026-000001",
      status: "posted" as const,
      postedAt: RECENT_POSTED_AT,
      returnWindowDays: 30,
      customerId: IDS.customer,
      customerNameSnapshot: "Bilal Khan",
      customerPhoneSnapshot: "+923001234567",
    },
    approvedBy: null,
    policyOverriddenBy: null,
    refund: null,
    lines: [quantityReturnLine()],
    ...overrides,
  };
}

function saleForPost(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.sale,
    status: "posted" as const,
    postedAt: RECENT_POSTED_AT,
    returnWindowDays: 30,
    customerId: IDS.customer,
    version: 5,
    lines: [
      {
        id: IDS.saleLine,
        lineNumber: 1,
        quantity: 2,
        unitCogsMinor: 300n,
        lineTotalMinor: 1_000n,
        trackingTypeSnapshot: "quantity" as const,
        serializedUnitId: null,
        imeiSnapshot: null,
        stockLocationId: IDS.location,
        productVariantId: IDS.variant,
        skuSnapshot: "CAB-001",
        productNameSnapshot: "USB Cable",
      },
    ],
    ...overrides,
  };
}

function baseTransaction() {
  return {
    saleReturn: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
    sale: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    returnLine: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    receivable: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    serializedUnit: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    stockBatch: {
      findFirst: vi.fn().mockResolvedValue({ id: IDS.batch, version: 3 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryMovement: { create: vi.fn().mockResolvedValue({}) },
    financialAccount: { findMany: vi.fn().mockResolvedValue(ACCOUNTS) },
    refund: { create: vi.fn().mockResolvedValue({ id: IDS.refund }) },
    financialEntry: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    numberSequence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("number_sequences")) {
        return Promise.resolve([
          {
            id: IDS.sequence,
            prefix: "RTN-",
            nextValue: 1,
            padding: 6,
            periodKey: "2026",
          },
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
      async (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
  return new ReturnsService({ client } as unknown as PrismaService);
}

describe("ReturnsService", () => {
  it("treats a cross-tenant return as not found", async () => {
    const client = {
      saleReturn: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new ReturnsService({ client } as unknown as PrismaService);

    await expect(service.detail(CONTEXT, IDS.return)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it("refuses a cross-tenant original sale when drafting a return", async () => {
    const tx = baseTransaction();
    tx.sale.findFirst.mockResolvedValue(null);
    const service = serviceFor(tx);

    await expect(
      service.createDraft(CONTEXT, {
        saleId: IDS.sale,
        reason: "Faulty",
        evidenceNote: "Observed at counter",
        lines: [
          {
            trackingType: "quantity",
            saleLineId: IDS.saleLine,
            quantity: 1,
            condition: "used",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
    expect(tx.saleReturn.create).not.toHaveBeenCalled();
    expect(tx.returnLine.createMany).not.toHaveBeenCalled();
  });

  it("keeps the exchange endpoint stable but refuses to partially post", async () => {
    const client = {
      saleReturn: { findFirst: vi.fn().mockResolvedValue(returnRecord()) },
    };
    const service = new ReturnsService({ client } as unknown as PrismaService);

    await expect(
      service.exchange(CONTEXT, IDS.return, { version: 1 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
      message: RETURN_EXCHANGE_UNAVAILABLE_REASON,
    });
  });

  it("rejects an exchange whose optimistic version is stale", async () => {
    const client = {
      saleReturn: {
        findFirst: vi.fn().mockResolvedValue(returnRecord({ version: 4 })),
      },
    };
    const service = new ReturnsService({ client } as unknown as PrismaService);

    await expect(
      service.exchange(CONTEXT, IDS.return, { version: 1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED });
  });

  it("rejects a stale optimistic version before mutating anything", async () => {
    const tx = baseTransaction();
    tx.saleReturn.findFirst
      .mockResolvedValueOnce({ id: IDS.return, postRequestHash: null })
      .mockResolvedValueOnce(returnRecord({ version: 1 }));
    const service = serviceFor(tx);

    await expect(
      service.post(CONTEXT, IDS.return, IDS.idempotency, {
        version: 2,
        refund: null,
        policyOverrideReason: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED });
    expect(tx.financialEntry.createMany).not.toHaveBeenCalled();
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("replays a matching idempotent post without re-settling", async () => {
    const input = {
      version: 1,
      refund: { method: "cash" as const, reference: null },
      policyOverrideReason: null,
    };
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          returnId: IDS.return,
          version: input.version,
          refund: input.refund,
          policyOverrideReason: input.policyOverrideReason,
        }),
      )
      .digest("hex");
    const posted = returnRecord({
      status: "posted",
      returnNumber: "RTN-2026-000001",
      totalRefundMinor: 1_000n,
      totalCogsReversalMinor: 600n,
      receivableCreditMinor: 0n,
      refundedMinor: 1_000n,
      postRequestId: IDS.idempotency,
      postRequestHash: requestHash,
      postedAt: RECENT_POSTED_AT,
      businessDate: NOW,
      approvedByUserId: IDS.approver,
      approvedBy: { id: IDS.approver, fullName: "Returns Manager" },
      version: 2,
      refund: {
        id: IDS.refund,
        refundNumber: "REF-2026-000001",
        paymentMethod: "cash",
        amountMinor: 1_000n,
        reference: null,
        refundedAt: RECENT_POSTED_AT,
      },
      lines: [
        quantityReturnLine({ refundMinor: 1_000n, cogsReversalMinor: 600n }),
      ],
    });
    const tx = baseTransaction();
    tx.saleReturn.findFirst
      .mockResolvedValueOnce({ id: IDS.return, postRequestHash: requestHash })
      .mockResolvedValueOnce(posted);
    const service = serviceFor(tx);

    const response = await service.post(
      CONTEXT,
      IDS.return,
      IDS.idempotency,
      input,
    );

    expect(response.idempotencyReplay).toBe(true);
    expect(response.return.status).toBe("posted");
    expect(tx.saleReturn.updateMany).not.toHaveBeenCalled();
    expect(tx.financialEntry.createMany).not.toHaveBeenCalled();
  });

  it("requires an authorized override reason once the return window has closed", async () => {
    const tx = baseTransaction();
    tx.saleReturn.findFirst
      .mockResolvedValueOnce({ id: IDS.return, postRequestHash: null })
      .mockResolvedValueOnce(returnRecord());
    tx.sale.findFirst.mockResolvedValue(
      saleForPost({ postedAt: EXPIRED_POSTED_AT, returnWindowDays: 7 }),
    );
    const service = serviceFor(tx);

    await expect(
      service.post(CONTEXT, IDS.return, IDS.idempotency, {
        version: 1,
        refund: { method: "cash", reference: null },
        policyOverrideReason: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.RETURN_WINDOW_EXPIRED });
    expect(tx.financialEntry.createMany).not.toHaveBeenCalled();
  });

  it("rejects a quantity that exceeds what remains returnable", async () => {
    const tx = baseTransaction();
    tx.saleReturn.findFirst
      .mockResolvedValueOnce({ id: IDS.return, postRequestHash: null })
      .mockResolvedValueOnce(
        returnRecord({ lines: [quantityReturnLine({ quantity: 2 })] }),
      );
    tx.sale.findFirst.mockResolvedValue(
      saleForPost({ lines: [{ ...saleForPost().lines[0], quantity: 1 }] }),
    );
    const service = serviceFor(tx);

    await expect(
      service.post(CONTEXT, IDS.return, IDS.idempotency, {
        version: 1,
        refund: { method: "cash", reference: null },
        policyOverrideReason: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.RETURN_QUANTITY_EXCEEDS_SOLD });
    expect(tx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a serialized unit that is no longer in the sold state", async () => {
    const serializedLine = quantityReturnLine({
      trackingTypeSnapshot: "serialized",
      serializedUnitId: IDS.unit,
      identifierSnapshot: "356938035643809",
      quantity: 1,
      serializedUnit: {
        id: IDS.unit,
        identifiers: [
          { identifierType: "imei", normalizedValue: "356938035643809" },
        ],
      },
    });
    const tx = baseTransaction();
    tx.saleReturn.findFirst
      .mockResolvedValueOnce({ id: IDS.return, postRequestHash: null })
      .mockResolvedValueOnce(returnRecord({ lines: [serializedLine] }));
    tx.sale.findFirst.mockResolvedValue(
      saleForPost({
        lines: [
          {
            ...saleForPost().lines[0],
            quantity: 1,
            trackingTypeSnapshot: "serialized",
            serializedUnitId: IDS.unit,
            imeiSnapshot: "356938035643809",
          },
        ],
      }),
    );
    tx.serializedUnit.findFirst.mockResolvedValue({
      id: IDS.unit,
      state: "available",
      version: 1,
    });
    const service = serviceFor(tx);

    await expect(
      service.post(CONTEXT, IDS.return, IDS.idempotency, {
        version: 1,
        refund: { method: "cash", reference: null },
        policyOverrideReason: null,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.RETURN_UNIT_MISMATCH });
    expect(tx.serializedUnit.updateMany).not.toHaveBeenCalled();
  });

  it("posts atomically: restock, split settlement, and a balanced ledger reversal", async () => {
    const input = {
      version: 1,
      refund: { method: "cash" as const, reference: null },
      policyOverrideReason: null,
    };
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          returnId: IDS.return,
          version: input.version,
          refund: input.refund,
          policyOverrideReason: input.policyOverrideReason,
        }),
      )
      .digest("hex");
    const posted = returnRecord({
      status: "posted",
      returnNumber: "RTN-2026-000001",
      totalRefundMinor: 1_000n,
      totalCogsReversalMinor: 600n,
      receivableCreditMinor: 400n,
      refundedMinor: 600n,
      postRequestId: IDS.idempotency,
      postRequestHash: requestHash,
      postedAt: RECENT_POSTED_AT,
      businessDate: NOW,
      approvedByUserId: IDS.approver,
      approvedBy: { id: IDS.approver, fullName: "Returns Manager" },
      version: 2,
      refund: {
        id: IDS.refund,
        refundNumber: "REF-2026-000001",
        paymentMethod: "cash",
        amountMinor: 600n,
        reference: null,
        refundedAt: RECENT_POSTED_AT,
      },
      lines: [
        quantityReturnLine({ refundMinor: 1_000n, cogsReversalMinor: 600n }),
      ],
    });
    const tx = baseTransaction();
    tx.saleReturn.findFirst
      .mockResolvedValueOnce({ id: IDS.return, postRequestHash: null })
      .mockResolvedValueOnce(returnRecord())
      .mockResolvedValueOnce(posted);
    tx.sale.findFirst.mockResolvedValue(saleForPost());
    // A partially-paid receivable covers PKR 4.00 of the PKR 10.00 refund.
    tx.receivable.findFirst
      .mockResolvedValueOnce({ id: IDS.receivable })
      .mockResolvedValueOnce({
        id: IDS.receivable,
        balanceMinor: 400n,
        status: "partially_paid",
        version: 2,
      });
    const service = serviceFor(tx);

    const response = await service.post(
      CONTEXT,
      IDS.return,
      IDS.idempotency,
      input,
    );

    // Settlement reconciles: refund = receivable credit + external refund.
    const freeze = tx.saleReturn.updateMany.mock.calls[0]?.[0]?.data as {
      totalRefundMinor: bigint;
      receivableCreditMinor: bigint;
      refundedMinor: bigint;
    };
    expect(freeze.totalRefundMinor).toBe(1_000n);
    expect(freeze.receivableCreditMinor + freeze.refundedMinor).toBe(
      freeze.totalRefundMinor,
    );

    // The ledger reversal is balanced.
    const entries = tx.financialEntry.createMany.mock.calls[0]?.[0]?.data as {
      direction: "debit" | "credit";
      amountMinor: bigint;
    }[];
    const debit = entries
      .filter((entry) => entry.direction === "debit")
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
    const credit = entries
      .filter((entry) => entry.direction === "credit")
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
    expect(debit).toBe(credit);
    expect(debit).toBe(1_600n);

    // Only the external remainder becomes a refund; the credit reduces the debt.
    expect(tx.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: "cash",
          amountMinor: 600n,
        }),
      }),
    );
    expect(tx.receivable.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
    // Restock is append-only and the fully returned sale advances to "returned".
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: "sale_return",
          quantity: 2,
        }),
      }),
    );
    expect(tx.sale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "returned", version: { increment: 1 } },
      }),
    );

    expect(response.idempotencyReplay).toBe(false);
    expect(response.return.totals).toEqual({
      refundMinor: 1_000,
      receivableCreditMinor: 400,
      refundedMinor: 600,
      profit: { availability: "redacted" },
    });
  });
});
