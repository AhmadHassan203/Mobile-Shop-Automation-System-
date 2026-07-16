import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@mobileshop/database";
import { allocateDocumentNumber } from "./number-sequence";

function transaction(updateCount = 1) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const queryRaw = vi.fn().mockResolvedValue([
    {
      id: "10000000-0000-4000-8000-000000000001",
      prefix: "INV-",
      nextValue: 42,
      padding: 6,
      periodKey: "2026",
    },
  ]);
  const updateMany = vi.fn().mockResolvedValue({ count: updateCount });
  return {
    tx: {
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
      numberSequence: { updateMany },
    } as unknown as Prisma.TransactionClient,
    executeRaw,
    queryRaw,
    updateMany,
  };
}

describe("allocateDocumentNumber", () => {
  it("locks, increments and formats one number inside the caller transaction", async () => {
    const { tx, executeRaw, queryRaw, updateMany } = transaction();

    await expect(
      allocateDocumentNumber(
        tx,
        {
          organizationId: "10000000-0000-4000-8000-000000000002",
          branchId: "10000000-0000-4000-8000-000000000003",
        },
        { key: "sale_invoice", defaultPrefix: "INV-", periodKey: "2026" },
      ),
    ).resolves.toBe("INV-2026-000042");

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nextValue: 42 }),
        data: { nextValue: { increment: 1 } },
      }),
    );
  });

  it("fails closed if the locked row changes unexpectedly", async () => {
    const { tx } = transaction(0);

    await expect(
      allocateDocumentNumber(
        tx,
        {
          organizationId: "10000000-0000-4000-8000-000000000002",
          branchId: "10000000-0000-4000-8000-000000000003",
        },
        { key: "sale_invoice", defaultPrefix: "INV-" },
      ),
    ).rejects.toThrow("changed concurrently");
  });
});
