import { PERMISSIONS } from "@mobileshop/shared";

export const SETTINGS_TABS = [
  { id: "profile", label: "Shop profile" },
  { id: "roles", label: "Roles & permissions" },
  { id: "bands", label: "Price bands" },
  { id: "reorder", label: "Reorder engine" },
  { id: "policies", label: "Policies & backup" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export interface SettingsCapabilities {
  readonly canView: boolean;
  readonly canManage: boolean;
  readonly canViewUsers: boolean;
  readonly canManageUsers: boolean;
  readonly canViewRoles: boolean;
  readonly canManageRoles: boolean;
  readonly canViewAudit: boolean;
  readonly canExport: boolean;
}

export const PROTOTYPE_ROLES = [
  { code: "owner", label: "Owner / Super Admin" },
  { code: "manager", label: "Manager" },
  { code: "salesperson", label: "Salesperson" },
  { code: "purchaser", label: "Purchaser" },
  { code: "cashier", label: "Cashier" },
  { code: "technician", label: "Technician" },
  { code: "accountant", label: "Accountant / Read-only" },
] as const;

export const PRICE_BANDS = [
  {
    label: "Entry",
    purpose: "First smartphone, backup & student phones",
  },
  { label: "Value", purpose: "Mainstream Android — the volume tier" },
  { label: "Mid", purpose: "Upper-Android & last-gen flagships" },
  {
    label: "Upper-mid",
    purpose: "Premium Android & flagship-lite",
  },
  {
    label: "Premium",
    purpose: "iPhone Pro & flagships — high capital, high margin",
  },
] as const;

export const REORDER_WEIGHTS = [
  {
    label: "Ready to buy — we were out of stock",
    meaning: "Counts as a full lost sale",
  },
  {
    label: "Quotation sent, following up",
    meaning: "Strong intent, not yet closed",
  },
  {
    label: "Interested but price too high",
    meaning: "Would need a price move to convert",
  },
  {
    label: "Casual enquiry / browsing",
    meaning: "Weak signal — barely counts",
  },
] as const;

export const WARRANTY_TYPES = [
  { type: "Official", applies: "New PTA-approved phones" },
  { type: "Local", applies: "Grey / non-PTA imports" },
  { type: "Shop", applies: "Used & repaired devices" },
  { type: "None", applies: "As-is / clearance" },
] as const;

export const PERMISSION_GROUPS = [
  { label: "Sell (POS)", prefixes: ["sales."] },
  {
    label: "See cost & margin",
    keys: [PERMISSIONS.CATALOG_VIEW_COST, PERMISSIONS.SALES_VIEW_PROFIT],
  },
  { label: "Give discounts", prefixes: ["sales.discount"] },
  { label: "Refunds & returns", prefixes: ["returns."] },
  {
    label: "Purchasing & suppliers",
    prefixes: ["purchases.", "suppliers."],
  },
  { label: "Inventory adjustments", prefixes: ["inventory."] },
  { label: "Cash session & drawer", prefixes: ["cash_sessions."] },
  {
    label: "Finance & reports",
    prefixes: ["expenses.", "receivables.", "payables.", "ledger.", "reports."],
  },
  {
    label: "Settings & roles",
    prefixes: ["settings.", "roles.", "users."],
  },
  { label: "Audit trail", prefixes: ["audit."] },
] as const;

export function settingsCapabilities(
  permissions: readonly string[] | undefined,
): SettingsCapabilities {
  const granted = new Set(permissions ?? []);
  return {
    canView: granted.has(PERMISSIONS.SETTINGS_VIEW),
    canManage: granted.has(PERMISSIONS.SETTINGS_MANAGE),
    canViewUsers: granted.has(PERMISSIONS.USERS_VIEW),
    canManageUsers:
      granted.has(PERMISSIONS.USERS_CREATE) ||
      granted.has(PERMISSIONS.USERS_UPDATE) ||
      granted.has(PERMISSIONS.USERS_DEACTIVATE),
    canViewRoles: granted.has(PERMISSIONS.ROLES_VIEW),
    canManageRoles: granted.has(PERMISSIONS.ROLES_MANAGE),
    canViewAudit: granted.has(PERMISSIONS.AUDIT_VIEW),
    canExport: granted.has(PERMISSIONS.REPORTS_EXPORT),
  };
}

export function settingsTabFrom(
  value: string | null | undefined,
): SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value)
    ? (value as SettingsTabId)
    : "profile";
}

export function permissionsForGroup(
  groupIndex: number,
  permissions: readonly string[],
): readonly string[] {
  const group = PERMISSION_GROUPS[groupIndex];
  if (group === undefined) return [];
  const prefixes = "prefixes" in group ? group.prefixes : [];
  const keys = "keys" in group ? group.keys : [];
  return permissions.filter(
    (permission) =>
      keys.some((key) => key === permission) ||
      prefixes.some((prefix) => permission.startsWith(prefix)),
  );
}

export function roleIsAssigned(
  roleCode: string,
  assignedRoles: readonly string[],
): boolean {
  return assignedRoles.includes(roleCode);
}
