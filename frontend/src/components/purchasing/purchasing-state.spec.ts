import { PERMISSIONS } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  PURCHASING_PAGE_SIZE,
  PURCHASING_TABS,
  applyPurchasingUpdates,
  nextPurchasingTabIndex,
  orderParametersFrom,
  parseSerializedRows,
  purchasingCapabilities,
  purchasingTabFrom,
  purchasingTabQuery,
  receiptParametersFrom,
  receivingImpact,
  supplierParametersFrom,
} from "./purchasing-state";

const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";

describe("purchasing URL state", () => {
  it("defaults unknown tabs to add stock and preserves filters while switching", () => {
    expect(purchasingTabFrom(new URLSearchParams(""))).toBe("add-stock");
    expect(purchasingTabFrom(new URLSearchParams("tab=unknown"))).toBe(
      "add-stock",
    );
    expect(purchasingTabFrom(new URLSearchParams("tab=receipts"))).toBe(
      "receipts",
    );

    const query = purchasingTabQuery(
      new URLSearchParams("tab=suppliers&oq=phone&opage=3"),
      "receipts",
    );
    const next = new URLSearchParams(query);
    expect(next.get("tab")).toBe("receipts");
    expect(next.get("oq")).toBe("phone");
    expect(next.get("opage")).toBe("3");
    // Add stock is the default tab, so switching to it drops the query parameter.
    expect(
      new URLSearchParams(purchasingTabQuery(next, "add-stock")).has("tab"),
    ).toBe(false);
  });

  it("lists Add stock first as the default purchasing tab", () => {
    expect(PURCHASING_TABS.map((tab) => tab.id)).toEqual([
      "add-stock",
      "orders",
      "suppliers",
      "receipts",
    ]);
    expect(PURCHASING_TABS[0]).toEqual({ id: "add-stock", label: "Add stock" });
  });

  it("uses the APG wrapping keyboard model", () => {
    expect(nextPurchasingTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextPurchasingTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextPurchasingTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextPurchasingTabIndex(2, "Home", 3)).toBe(0);
    expect(nextPurchasingTabIndex(0, "End", 3)).toBe(2);
    expect(nextPurchasingTabIndex(0, "Enter", 3)).toBeNull();
  });

  it("parses namespaced order, supplier, and receipt filters defensively", () => {
    expect(
      orderParametersFrom(
        new URLSearchParams(
          `oq= PO-1 &ostatus=ordered&osupplier=${SUPPLIER_ID}&ofrom=2026-07-01&oto=2026-07-31&opage=4`,
        ),
      ),
    ).toEqual({
      page: 4,
      pageSize: PURCHASING_PAGE_SIZE,
      q: "PO-1",
      status: "ordered",
      supplierId: SUPPLIER_ID,
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(
      supplierParametersFrom(
        new URLSearchParams("sq=alpha&sactive=false&spage=2"),
      ),
    ).toEqual({
      page: 2,
      pageSize: PURCHASING_PAGE_SIZE,
      q: "alpha",
      active: false,
    });
    expect(
      receiptParametersFrom(
        new URLSearchParams(
          `rq=GR-1&rsupplier=${SUPPLIER_ID}&rfrom=bad&rpage=-3`,
        ),
      ),
    ).toEqual({
      page: 1,
      pageSize: PURCHASING_PAGE_SIZE,
      q: "GR-1",
      supplierId: SUPPLIER_ID,
    });
  });

  it("updates only requested URL keys and resets the relevant page", () => {
    const query = applyPurchasingUpdates(
      new URLSearchParams("tab=receipts&rq=old&rpage=8&oq=kept"),
      { rq: "new", rfrom: "2026-07-01" },
      "rpage",
    );
    const next = new URLSearchParams(query);
    expect(next.get("rq")).toBe("new");
    expect(next.get("rfrom")).toBe("2026-07-01");
    expect(next.has("rpage")).toBe(false);
    expect(next.get("oq")).toBe("kept");
    expect(next.get("tab")).toBe("receipts");
  });
});

describe("purchasing permission projection", () => {
  it("maps raw permissions and reference-dependent draft controls", () => {
    const capabilities = purchasingCapabilities([
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.SUPPLIERS_MANAGE,
      PERMISSIONS.PURCHASES_RECEIVE,
      PERMISSIONS.INVENTORY_VIEW,
    ]);
    expect(capabilities).toEqual({
      canViewPurchases: true,
      canViewSuppliers: false,
      canViewCatalog: false,
      canManageSuppliers: true,
      canCreatePurchases: false,
      canEditPurchaseDrafts: false,
      canApprovePurchases: false,
      canReceivePurchases: true,
      canViewInventory: true,
    });
  });

  it("keeps lifecycle permission while requiring both references for draft forms", () => {
    const lifecycleOnly = purchasingCapabilities([
      PERMISSIONS.PURCHASES_CREATE,
    ]);
    expect(lifecycleOnly.canCreatePurchases).toBe(true);
    expect(lifecycleOnly.canEditPurchaseDrafts).toBe(false);

    expect(
      purchasingCapabilities([
        PERMISSIONS.PURCHASES_CREATE,
        PERMISSIONS.SUPPLIERS_VIEW,
      ]).canEditPurchaseDrafts,
    ).toBe(false);
    expect(
      purchasingCapabilities([
        PERMISSIONS.PURCHASES_CREATE,
        PERMISSIONS.CATALOG_VIEW,
      ]).canEditPurchaseDrafts,
    ).toBe(false);
    expect(
      purchasingCapabilities([
        PERMISSIONS.PURCHASES_CREATE,
        PERMISSIONS.SUPPLIERS_VIEW,
        PERMISSIONS.CATALOG_VIEW,
      ]).canEditPurchaseDrafts,
    ).toBe(true);
  });
});

describe("bulk serialized receiving", () => {
  it("accepts spreadsheet rows, normalizes identifiers, and keeps initial states", () => {
    const parsed = parseSerializedRows(
      [
        "490154203237518, 356938035643809, box-a, available",
        "352099001761481\t\tBox B\tpending_verification",
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rowCount).toBe(2);
    expect(parsed.units).toEqual([
      {
        imei1: "490154203237518",
        imei2: "356938035643809",
        serialNumber: "BOXA",
        initialState: "available",
      },
      {
        imei1: "352099001761481",
        imei2: null,
        serialNumber: "BOXB",
        initialState: "pending_verification",
      },
    ]);
  });

  it("rejects bad checksums, duplicate identifiers, and unsupported states", () => {
    const parsed = parseSerializedRows(
      [
        "490154203237518,,,available",
        "490154203237518,,,available",
        "490154203237519,,,available",
        "352099001761481,,,sold",
      ].join("\n"),
    );

    expect(parsed.units).toHaveLength(1);
    expect(parsed.errors).toHaveLength(3);
    expect(parsed.errors[0]?.message).toContain("duplicates row 1");
    expect(parsed.errors[1]?.message.toLowerCase()).toContain("checksum");
    expect(parsed.errors[2]?.message).toContain("State must be");
  });
});

describe("receiving reconciliation preview", () => {
  it("keeps the supplier payable at actual product cost and capitalizes landed cost", () => {
    const impact = receivingImpact(
      [
        { quantity: 2, unitCostMinor: 10_000 },
        { quantity: 1, unitCostMinor: 5_000 },
      ],
      [3_001],
    );

    expect(impact.actualTotalMinor).toBe(25_000);
    expect(impact.payableMinor).toBe(25_000);
    expect(impact.landedCostExtraMinor).toBe(3_001);
    expect(impact.inventoryValueMinor).toBe(28_001);
    expect(impact.allocations).toEqual([2_401, 600]);
    expect(impact.allocations.reduce((total, value) => total + value, 0)).toBe(
      3_001,
    );
  });

  it("refuses landed-cost allocation when all selected product value is zero", () => {
    expect(() =>
      receivingImpact([{ quantity: 1, unitCostMinor: 0 }], [500]),
    ).toThrow("cannot be allocated");
  });
});
