import { PERMISSIONS, type PermissionKey } from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import {
  DashboardService,
  type DashboardActorContext,
} from "./dashboard.service";

const IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  location: "10000000-0000-4000-8000-000000000003",
  otherLocation: "10000000-0000-4000-8000-000000000004",
});

interface InventoryTestRow {
  readonly onHandUnits: bigint;
  readonly reservedUnits: bigint;
  readonly availableUnits: bigint;
  readonly valuedUnits: bigint;
  readonly uncostedUnits: bigint;
  readonly inventoryValueMinor: bigint;
  readonly outOfStockVariantCount: bigint;
}

const INVENTORY_ROW: InventoryTestRow = Object.freeze({
  onHandUnits: 9n,
  reservedUnits: 2n,
  availableUnits: 7n,
  valuedUnits: 8n,
  uncostedUnits: 1n,
  inventoryValueMinor: 123_450n,
  outOfStockVariantCount: 3n,
});

function context(
  permissions: readonly PermissionKey[],
  allowedLocationIds: readonly string[] | null = [IDS.location],
): DashboardActorContext {
  return {
    organizationId: IDS.organization,
    branchId: IDS.branch,
    currency: "PKR",
    permissions: new Set(permissions),
    allowedLocationIds,
  };
}

function serviceWith(
  inventoryRows: readonly InventoryTestRow[] = [INVENTORY_ROW],
  openPurchaseOrders = 2,
) {
  const queryRaw = vi.fn().mockResolvedValue(inventoryRows);
  const count = vi.fn().mockResolvedValue(openPurchaseOrders);
  const prisma = {
    client: { $queryRaw: queryRaw, purchaseOrder: { count } },
  } as unknown as PrismaService;
  return { service: new DashboardService(prisma), queryRaw, count };
}

describe("DashboardService", () => {
  it("returns scoped real stock, valuation coverage and purchase attention", async () => {
    const { service, queryRaw, count } = serviceWith();
    const snapshot = await service.snapshot(
      context([
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_VIEW_COST,
        PERMISSIONS.REPORTS_VIEW_FINANCIAL,
        PERMISSIONS.PURCHASES_VIEW,
        PERMISSIONS.SALES_VIEW,
        PERMISSIONS.DEMAND_VIEW,
        PERMISSIONS.RECOMMENDATIONS_VIEW,
        PERMISSIONS.EXTERNAL_SERVICES_VIEW,
      ]),
    );

    expect(snapshot.stockSummary).toEqual({
      availability: "available",
      data: {
        onHandUnits: 9,
        reservedUnits: 2,
        availableUnits: 7,
        outOfStockVariantCount: 3,
      },
    });
    expect(snapshot.moneyKpis[5].value).toEqual({
      availability: "partial",
      valueMinor: 123_450,
      meta: "Recorded landed cost only",
      message: "1 on-hand unit has no recorded landed cost and is excluded.",
      coverage: { valuedUnits: 8, uncostedUnits: 1 },
    });
    expect(snapshot.attention.availability).toBe("partial");
    if (snapshot.attention.availability === "partial") {
      expect(snapshot.attention.items).toEqual([
        expect.objectContaining({
          id: "inventory:active-variant-stockouts",
          rank: 1,
          severity: "negative",
        }),
        expect.objectContaining({
          id: "purchasing:open-purchase-orders",
          rank: 2,
          severity: "warning",
        }),
      ]);
    }
    expect(snapshot.recentSales.availability).toBe("unavailable");
    expect(snapshot.demandAndBuying.availability).toBe("unavailable");
    expect(snapshot.digitalServices.availability).toBe("unavailable");
    expect(snapshot.todaysTasks.availability).toBe("unavailable");

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0]?.[0] as { readonly values: unknown[] };
    expect(sql.values).toContain(IDS.organization);
    expect(sql.values).toContain(IDS.branch);
    expect(sql.values).toContain(IDS.location);
    expect(sql.values).not.toContain(IDS.otherLocation);
    expect(count).toHaveBeenCalledWith({
      where: {
        organizationId: IDS.organization,
        branchId: IDS.branch,
        status: { notIn: ["closed", "cancelled"] },
      },
    });
  });

  it("does not query or leak source data when source permissions are absent", async () => {
    const { service, queryRaw, count } = serviceWith();
    const snapshot = await service.snapshot(
      context([PERMISSIONS.REPORTS_VIEW]),
    );

    expect(queryRaw).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
    expect(snapshot.stockSummary.availability).toBe("redacted");
    expect(snapshot.moneyKpis[5].value.availability).toBe("redacted");
    expect(snapshot.attention.availability).toBe("redacted");
    expect(snapshot.recentSales.availability).toBe("redacted");
    expect(snapshot.demandAndBuying.availability).toBe("redacted");
    expect(snapshot.digitalServices.availability).toBe("redacted");
    expect(snapshot.todaysTasks.availability).toBe("unavailable");
  });

  it("keeps valuation redacted unless both cost and financial-report grants exist", async () => {
    const { service, queryRaw } = serviceWith();
    const snapshot = await service.snapshot(
      context([
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_VIEW_COST,
      ]),
    );

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(snapshot.stockSummary.availability).toBe("available");
    expect(snapshot.moneyKpis[5].value.availability).toBe("redacted");
  });

  it("reports a complete zero valuation as real zero rather than unavailable", async () => {
    const { service } = serviceWith([
      {
        ...INVENTORY_ROW,
        onHandUnits: 0n,
        reservedUnits: 0n,
        availableUnits: 0n,
        valuedUnits: 0n,
        uncostedUnits: 0n,
        inventoryValueMinor: 0n,
        outOfStockVariantCount: 0n,
      },
    ]);
    const snapshot = await service.snapshot(
      context([
        PERMISSIONS.INVENTORY_VIEW,
        PERMISSIONS.INVENTORY_VIEW_COST,
        PERMISSIONS.REPORTS_VIEW_FINANCIAL,
      ]),
    );

    expect(snapshot.moneyKpis[5].value).toEqual({
      availability: "available",
      valueMinor: 0,
      meta: "At recorded landed cost",
      coverage: { valuedUnits: 0, uncostedUnits: 0 },
    });
  });

  it("fails closed when database aggregates violate the public invariants", async () => {
    const { service } = serviceWith([
      {
        ...INVENTORY_ROW,
        onHandUnits: 1n,
        reservedUnits: 2n,
        availableUnits: 0n,
      },
    ]);

    await expect(
      service.snapshot(context([PERMISSIONS.INVENTORY_VIEW])),
    ).rejects.toThrow("Dashboard response violated its public contract");
  });
});
