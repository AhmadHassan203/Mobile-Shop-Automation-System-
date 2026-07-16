import { PERMISSIONS } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import { financeCapabilities } from "./finance-state";

describe("financeCapabilities", () => {
  it("returns no access when the session has no finance permissions", () => {
    expect(financeCapabilities([])).toEqual({
      canViewFinance: false,
      canCreateExpense: false,
      canExportFinance: false,
      canViewClosing: false,
      canCloseSession: false,
    });
  });

  it("treats each finance read permission as finance workspace access", () => {
    expect(
      financeCapabilities([PERMISSIONS.PAYABLES_VIEW]).canViewFinance,
    ).toBe(true);
    expect(
      financeCapabilities([PERMISSIONS.EXPENSES_VIEW]).canViewFinance,
    ).toBe(true);
  });

  it("keeps expense and closing actions independently permissioned", () => {
    expect(
      financeCapabilities([
        PERMISSIONS.EXPENSES_CREATE,
        PERMISSIONS.REPORTS_EXPORT,
        PERMISSIONS.CASH_SESSIONS_VIEW,
      ]),
    ).toMatchObject({
      canCreateExpense: true,
      canExportFinance: true,
      canViewClosing: true,
      canCloseSession: false,
    });
  });
});
