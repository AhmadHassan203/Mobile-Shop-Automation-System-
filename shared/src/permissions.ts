/**
 * Permission keys and default role mappings.
 *
 * Rule 13_ §23.20: authorization is enforced on the BACKEND. These keys are shared
 * only so the frontend can hide actions the user cannot perform — hiding a button
 * is a usability affordance, never a security control.
 *
 * Key format: `<resource>.<action>`.
 */

export const PERMISSIONS = {
  // --- Users, roles, access -------------------------------------------------
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DEACTIVATE: "users.deactivate",
  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",

  // --- Catalog -------------------------------------------------------------
  CATALOG_VIEW: "catalog.view",
  CATALOG_CREATE: "catalog.create",
  CATALOG_UPDATE: "catalog.update",
  CATALOG_DEACTIVATE: "catalog.deactivate",
  CATALOG_VIEW_COST: "catalog.view_cost",

  // --- Pricing -------------------------------------------------------------
  PRICING_VIEW: "pricing.view",
  PRICING_MANAGE: "pricing.manage",
  PRICING_OVERRIDE_MIN_MARGIN: "pricing.override_min_margin",

  // --- Inventory -----------------------------------------------------------
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_VIEW_COST: "inventory.view_cost",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_APPROVE_ADJUSTMENT: "inventory.approve_adjustment",
  INVENTORY_COUNT: "inventory.count",
  INVENTORY_TRANSFER: "inventory.transfer",
  INVENTORY_RESERVE: "inventory.reserve",

  // --- Suppliers and purchasing -------------------------------------------
  SUPPLIERS_VIEW: "suppliers.view",
  SUPPLIERS_MANAGE: "suppliers.manage",
  PURCHASES_VIEW: "purchases.view",
  PURCHASES_CREATE: "purchases.create",
  PURCHASES_APPROVE: "purchases.approve",
  PURCHASES_RECEIVE: "purchases.receive",
  PURCHASES_RETURN: "purchases.return",

  // --- Customers and demand ------------------------------------------------
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",
  CUSTOMERS_VIEW_SENSITIVE: "customers.view_sensitive",
  DEMAND_VIEW: "demand.view",
  DEMAND_CREATE: "demand.create",
  DEMAND_MANAGE: "demand.manage",

  // --- Sales ---------------------------------------------------------------
  SALES_VIEW: "sales.view",
  SALES_CREATE: "sales.create",
  SALES_POST: "sales.post",
  SALES_VIEW_PROFIT: "sales.view_profit",
  SALES_DISCOUNT: "sales.discount",
  SALES_DISCOUNT_OVERRIDE: "sales.discount_override",
  SALES_CREDIT: "sales.credit",
  SALES_MANUAL_LINE: "sales.manual_line",

  // --- Payments, returns ---------------------------------------------------
  PAYMENTS_COLLECT: "payments.collect",
  RETURNS_VIEW: "returns.view",
  RETURNS_CREATE: "returns.create",
  RETURNS_APPROVE: "returns.approve",

  // --- External money services --------------------------------------------
  EXTERNAL_SERVICES_VIEW: "external_services.view",
  EXTERNAL_SERVICES_RECORD: "external_services.record",
  EXTERNAL_SERVICES_REVERSE: "external_services.reverse",
  EXTERNAL_FEE_RULES_VIEW: "external_fee_rules.view",
  EXTERNAL_FEE_RULES_MANAGE: "external_fee_rules.manage",

  // --- Cash sessions -------------------------------------------------------
  CASH_SESSIONS_VIEW: "cash_sessions.view",
  CASH_SESSIONS_OPEN: "cash_sessions.open",
  CASH_SESSIONS_CLOSE: "cash_sessions.close",
  CASH_SESSIONS_REVIEW: "cash_sessions.review",
  CASH_SESSIONS_REOPEN: "cash_sessions.reopen",

  // --- Finance -------------------------------------------------------------
  EXPENSES_VIEW: "expenses.view",
  EXPENSES_CREATE: "expenses.create",
  EXPENSES_APPROVE: "expenses.approve",
  RECEIVABLES_VIEW: "receivables.view",
  RECEIVABLES_MANAGE: "receivables.manage",
  PAYABLES_VIEW: "payables.view",
  PAYABLES_MANAGE: "payables.manage",
  LEDGER_VIEW: "ledger.view",
  OWNER_EQUITY_MANAGE: "owner_equity.manage",

  // --- Reporting and intelligence -----------------------------------------
  REPORTS_VIEW: "reports.view",
  REPORTS_VIEW_FINANCIAL: "reports.view_financial",
  REPORTS_EXPORT: "reports.export",
  RECOMMENDATIONS_VIEW: "recommendations.view",
  RECOMMENDATIONS_DECIDE: "recommendations.decide",

  // --- System --------------------------------------------------------------
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.freeze(
  Object.values(PERMISSIONS),
);

/** System role codes (13_ §8, 01_PRD §4). */
export const ROLES = {
  OWNER: "owner",
  MANAGER: "manager",
  SALESPERSON: "salesperson",
  CASHIER: "cashier",
  PURCHASER: "purchaser",
  ACCOUNTANT: "accountant",
  TECHNICIAN: "technician",
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

const P = PERMISSIONS;

/**
 * Default permission grants per role.
 *
 * Owner receives every permission. Other roles follow 13_ §8 precisely:
 *  - Salesperson has NO cost/profit visibility unless explicitly granted.
 *  - Accountant is read-only finance with NO operational posting.
 *  - Manager has no unrestricted owner/security override.
 * These are seed defaults; roles remain editable at runtime through RolesAndPermissions.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<
  Record<RoleCode, readonly PermissionKey[]>
> = Object.freeze({
  [ROLES.OWNER]: ALL_PERMISSIONS,

  [ROLES.MANAGER]: Object.freeze([
    P.USERS_VIEW,
    P.ROLES_VIEW,
    P.CATALOG_VIEW,
    P.CATALOG_CREATE,
    P.CATALOG_UPDATE,
    P.CATALOG_DEACTIVATE,
    P.CATALOG_VIEW_COST,
    P.PRICING_VIEW,
    P.PRICING_MANAGE,
    P.INVENTORY_VIEW,
    P.INVENTORY_VIEW_COST,
    P.INVENTORY_ADJUST,
    P.INVENTORY_APPROVE_ADJUSTMENT,
    P.INVENTORY_COUNT,
    P.INVENTORY_TRANSFER,
    P.INVENTORY_RESERVE,
    P.SUPPLIERS_VIEW,
    P.SUPPLIERS_MANAGE,
    P.PURCHASES_VIEW,
    P.PURCHASES_CREATE,
    P.PURCHASES_APPROVE,
    P.PURCHASES_RECEIVE,
    P.PURCHASES_RETURN,
    P.CUSTOMERS_VIEW,
    P.CUSTOMERS_MANAGE,
    P.DEMAND_VIEW,
    P.DEMAND_CREATE,
    P.DEMAND_MANAGE,
    P.SALES_VIEW,
    P.SALES_CREATE,
    P.SALES_POST,
    P.SALES_VIEW_PROFIT,
    P.SALES_DISCOUNT,
    P.SALES_DISCOUNT_OVERRIDE,
    P.SALES_CREDIT,
    P.PAYMENTS_COLLECT,
    P.RETURNS_VIEW,
    P.RETURNS_CREATE,
    P.RETURNS_APPROVE,
    P.EXTERNAL_SERVICES_VIEW,
    P.EXTERNAL_SERVICES_RECORD,
    P.EXTERNAL_FEE_RULES_VIEW,
    P.CASH_SESSIONS_VIEW,
    P.CASH_SESSIONS_OPEN,
    P.CASH_SESSIONS_CLOSE,
    P.CASH_SESSIONS_REVIEW,
    P.EXPENSES_VIEW,
    P.EXPENSES_CREATE,
    P.EXPENSES_APPROVE,
    P.RECEIVABLES_VIEW,
    P.RECEIVABLES_MANAGE,
    P.PAYABLES_VIEW,
    P.PAYABLES_MANAGE,
    P.REPORTS_VIEW,
    P.REPORTS_VIEW_FINANCIAL,
    P.REPORTS_EXPORT,
    P.RECOMMENDATIONS_VIEW,
    P.SETTINGS_VIEW,
  ]),

  // No *_VIEW_COST / *_VIEW_PROFIT: salespeople must not see supplier cost or profit.
  [ROLES.SALESPERSON]: Object.freeze([
    P.CATALOG_VIEW,
    P.PRICING_VIEW,
    P.INVENTORY_VIEW,
    P.INVENTORY_RESERVE,
    P.CUSTOMERS_VIEW,
    P.CUSTOMERS_MANAGE,
    P.DEMAND_VIEW,
    P.DEMAND_CREATE,
    P.DEMAND_MANAGE,
    P.SALES_VIEW,
    P.SALES_CREATE,
    P.SALES_POST,
    P.SALES_DISCOUNT,
    P.RETURNS_VIEW,
    P.EXTERNAL_SERVICES_VIEW,
    P.EXTERNAL_SERVICES_RECORD,
  ]),

  [ROLES.CASHIER]: Object.freeze([
    P.CATALOG_VIEW,
    P.PRICING_VIEW,
    P.INVENTORY_VIEW,
    P.CUSTOMERS_VIEW,
    P.CUSTOMERS_MANAGE,
    P.DEMAND_CREATE,
    P.SALES_VIEW,
    P.SALES_CREATE,
    P.SALES_POST,
    P.PAYMENTS_COLLECT,
    P.RETURNS_VIEW,
    P.RETURNS_CREATE,
    P.EXTERNAL_SERVICES_VIEW,
    P.EXTERNAL_SERVICES_RECORD,
    P.CASH_SESSIONS_VIEW,
    P.CASH_SESSIONS_OPEN,
    P.CASH_SESSIONS_CLOSE,
    P.EXPENSES_VIEW,
    P.EXPENSES_CREATE,
  ]),

  [ROLES.PURCHASER]: Object.freeze([
    P.CATALOG_VIEW,
    P.CATALOG_CREATE,
    P.CATALOG_UPDATE,
    P.CATALOG_VIEW_COST,
    P.PRICING_VIEW,
    P.INVENTORY_VIEW,
    P.INVENTORY_VIEW_COST,
    P.INVENTORY_ADJUST,
    P.INVENTORY_COUNT,
    P.INVENTORY_TRANSFER,
    P.SUPPLIERS_VIEW,
    P.SUPPLIERS_MANAGE,
    P.PURCHASES_VIEW,
    P.PURCHASES_CREATE,
    P.PURCHASES_RECEIVE,
    P.PURCHASES_RETURN,
    P.DEMAND_VIEW,
    P.PAYABLES_VIEW,
    P.REPORTS_VIEW,
    P.RECOMMENDATIONS_VIEW,
  ]),

  // Read-only finance: no operational posting (13_ §8).
  [ROLES.ACCOUNTANT]: Object.freeze([
    P.CATALOG_VIEW,
    P.CATALOG_VIEW_COST,
    P.INVENTORY_VIEW,
    P.INVENTORY_VIEW_COST,
    P.SUPPLIERS_VIEW,
    P.PURCHASES_VIEW,
    P.CUSTOMERS_VIEW,
    P.SALES_VIEW,
    P.SALES_VIEW_PROFIT,
    P.RETURNS_VIEW,
    P.EXTERNAL_SERVICES_VIEW,
    P.EXTERNAL_FEE_RULES_VIEW,
    P.CASH_SESSIONS_VIEW,
    P.EXPENSES_VIEW,
    P.EXPENSES_CREATE,
    P.RECEIVABLES_VIEW,
    P.PAYABLES_VIEW,
    P.LEDGER_VIEW,
    P.REPORTS_VIEW,
    P.REPORTS_VIEW_FINANCIAL,
    P.REPORTS_EXPORT,
  ]),

  // Technician sees assigned work only, never unrelated financial data (01_PRD §4).
  [ROLES.TECHNICIAN]: Object.freeze([
    P.CATALOG_VIEW,
    P.INVENTORY_VIEW,
    P.RETURNS_VIEW,
  ]),
});

export function permissionsForRole(role: RoleCode): readonly PermissionKey[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
}

/** Union of grants across roles — mirrors backend resolution, for UI affordances only. */
export function permissionsForRoles(
  roles: readonly RoleCode[],
): PermissionKey[] {
  const granted = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of permissionsForRole(role)) granted.add(permission);
  }
  return [...granted];
}

export function hasPermission(
  granted: readonly PermissionKey[] | ReadonlySet<PermissionKey>,
  required: PermissionKey,
): boolean {
  // `in` narrows the union cleanly; `instanceof Set` widens to the generic global Set.
  return "has" in granted ? granted.has(required) : granted.includes(required);
}
