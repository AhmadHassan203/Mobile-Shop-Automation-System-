import { describe, expect, it } from "vitest";
import { MODULE_NAVIGATION } from "./app-shell";

function group(label: string) {
  const found = MODULE_NAVIGATION.find((entry) => entry.label === label);
  if (found === undefined) throw new Error(`Missing nav group: ${label}`);
  return found;
}

/** Visible = not hidden for the MVP (permission gating is applied at render). */
function visibleLabels(groupLabel: string): string[] {
  return group(groupLabel)
    .items.filter((item) => item.hidden !== true)
    .map((item) => item.label);
}

function itemByLabel(groupLabel: string, label: string) {
  return group(groupLabel).items.find((item) => item.label === label);
}

describe("sidebar navigation consolidation", () => {
  it("shows exactly Product catalog, Purchasing and Stocks under STOCK", () => {
    expect(visibleLabels("Stock")).toEqual([
      "Product catalog",
      "Purchasing",
      "Stocks",
    ]);
  });

  it("hides the standalone stock-in, supplier and goods-receipt modules", () => {
    for (const label of [
      "Quick Stock In",
      "Bulk Stock In",
      "Barcode Stock In",
      "Suppliers",
      "Goods receipts",
    ]) {
      expect(itemByLabel("Stock", label)?.hidden).toBe(true);
    }
  });

  it("keeps Returns / warranty visible but hides Repairs and Used intake", () => {
    expect(itemByLabel("Service", "Returns / warranty")?.hidden).not.toBe(true);
    expect(itemByLabel("Service", "Repairs")?.hidden).toBe(true);
    expect(itemByLabel("Service", "Used intake")?.hidden).toBe(true);
  });

  it("keeps Customers, Commission report, Reconciliation, Tasks and System status hidden", () => {
    const byLabel = new Map(
      MODULE_NAVIGATION.flatMap((entry) => entry.items).map((item) => [
        item.label,
        item,
      ]),
    );
    for (const label of [
      "Customers",
      "Commission report",
      "Reconciliation",
      "Tasks",
      "Settings",
      "System status",
    ]) {
      expect(byLabel.get(label)?.hidden).toBe(true);
    }
  });
});
