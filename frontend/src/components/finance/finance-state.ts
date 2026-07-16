import { PERMISSIONS } from "@mobileshop/shared";

export interface FinanceCapabilities {
  readonly canViewFinance: boolean;
  readonly canCreateExpense: boolean;
  readonly canExportFinance: boolean;
  readonly canViewClosing: boolean;
  readonly canCloseSession: boolean;
}

export function financeCapabilities(
  permissions: readonly string[] | undefined,
): FinanceCapabilities {
  const granted = permissions ?? [];
  return {
    canViewFinance: [
      PERMISSIONS.LEDGER_VIEW,
      PERMISSIONS.EXPENSES_VIEW,
      PERMISSIONS.RECEIVABLES_VIEW,
      PERMISSIONS.PAYABLES_VIEW,
      PERMISSIONS.REPORTS_VIEW_FINANCIAL,
    ].some((permission) => granted.includes(permission)),
    canCreateExpense: granted.includes(PERMISSIONS.EXPENSES_CREATE),
    canExportFinance: granted.includes(PERMISSIONS.REPORTS_EXPORT),
    canViewClosing: granted.includes(PERMISSIONS.CASH_SESSIONS_VIEW),
    canCloseSession: granted.includes(PERMISSIONS.CASH_SESSIONS_CLOSE),
  };
}
