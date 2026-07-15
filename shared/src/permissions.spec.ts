import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  hasPermission,
  permissionsForRole,
  permissionsForRoles,
} from './permissions';

describe('permission catalogue', () => {
  it('exposes every permission exactly once', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('uses the resource.action key format', () => {
    for (const key of ALL_PERMISSIONS) {
      expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('grants every role only known permissions', () => {
    for (const [role, granted] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permission of granted) {
        expect(ALL_PERMISSIONS, `${role} grants unknown permission ${permission}`).toContain(permission);
      }
    }
  });
});

describe('role decisions — owner', () => {
  it('has full access', () => {
    expect(permissionsForRole(ROLES.OWNER)).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('is the only role that can manage roles or reopen a reviewed cash session', () => {
    for (const role of Object.values(ROLES)) {
      if (role === ROLES.OWNER) continue;
      expect(hasPermission(permissionsForRole(role), PERMISSIONS.ROLES_MANAGE)).toBe(false);
      expect(hasPermission(permissionsForRole(role), PERMISSIONS.CASH_SESSIONS_REOPEN)).toBe(false);
    }
  });

  it('is the only role that can decide on recommendations (13_ §18: no auto-approval)', () => {
    for (const role of Object.values(ROLES)) {
      if (role === ROLES.OWNER) continue;
      expect(hasPermission(permissionsForRole(role), PERMISSIONS.RECOMMENDATIONS_DECIDE)).toBe(false);
    }
  });
});

describe('role decisions — salesperson', () => {
  const salesperson = permissionsForRole(ROLES.SALESPERSON);

  it('can sell and capture demand', () => {
    expect(hasPermission(salesperson, PERMISSIONS.SALES_CREATE)).toBe(true);
    expect(hasPermission(salesperson, PERMISSIONS.SALES_POST)).toBe(true);
    expect(hasPermission(salesperson, PERMISSIONS.DEMAND_CREATE)).toBe(true);
    expect(hasPermission(salesperson, PERMISSIONS.INVENTORY_RESERVE)).toBe(true);
  });

  it('cannot see supplier cost or profit (13_ §8)', () => {
    expect(hasPermission(salesperson, PERMISSIONS.CATALOG_VIEW_COST)).toBe(false);
    expect(hasPermission(salesperson, PERMISSIONS.INVENTORY_VIEW_COST)).toBe(false);
    expect(hasPermission(salesperson, PERMISSIONS.SALES_VIEW_PROFIT)).toBe(false);
    expect(hasPermission(salesperson, PERMISSIONS.REPORTS_VIEW_FINANCIAL)).toBe(false);
  });

  it('cannot override discounts or grant credit without authorization', () => {
    expect(hasPermission(salesperson, PERMISSIONS.SALES_DISCOUNT_OVERRIDE)).toBe(false);
    expect(hasPermission(salesperson, PERMISSIONS.SALES_CREDIT)).toBe(false);
  });

  it('cannot adjust stock', () => {
    expect(hasPermission(salesperson, PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
  });
});

describe('role decisions — cashier', () => {
  const cashier = permissionsForRole(ROLES.CASHIER);

  it('can collect payments, run a drawer and record external services', () => {
    expect(hasPermission(cashier, PERMISSIONS.PAYMENTS_COLLECT)).toBe(true);
    expect(hasPermission(cashier, PERMISSIONS.CASH_SESSIONS_OPEN)).toBe(true);
    expect(hasPermission(cashier, PERMISSIONS.CASH_SESSIONS_CLOSE)).toBe(true);
    expect(hasPermission(cashier, PERMISSIONS.EXTERNAL_SERVICES_RECORD)).toBe(true);
    expect(hasPermission(cashier, PERMISSIONS.RETURNS_CREATE)).toBe(true);
  });

  it('cannot review its own cash session (segregation of duties, 13_ §14)', () => {
    expect(hasPermission(cashier, PERMISSIONS.CASH_SESSIONS_REVIEW)).toBe(false);
  });

  it('cannot change fee rules it operates under', () => {
    expect(hasPermission(cashier, PERMISSIONS.EXTERNAL_FEE_RULES_MANAGE)).toBe(false);
  });
});

describe('role decisions — accountant', () => {
  const accountant = permissionsForRole(ROLES.ACCOUNTANT);

  it('can read financial reports and the ledger', () => {
    expect(hasPermission(accountant, PERMISSIONS.REPORTS_VIEW_FINANCIAL)).toBe(true);
    expect(hasPermission(accountant, PERMISSIONS.LEDGER_VIEW)).toBe(true);
    expect(hasPermission(accountant, PERMISSIONS.REPORTS_EXPORT)).toBe(true);
  });

  it('has no operational posting rights (13_ §8)', () => {
    expect(hasPermission(accountant, PERMISSIONS.SALES_POST)).toBe(false);
    expect(hasPermission(accountant, PERMISSIONS.SALES_CREATE)).toBe(false);
    expect(hasPermission(accountant, PERMISSIONS.PURCHASES_RECEIVE)).toBe(false);
    expect(hasPermission(accountant, PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
    expect(hasPermission(accountant, PERMISSIONS.PAYMENTS_COLLECT)).toBe(false);
  });
});

describe('role decisions — manager', () => {
  const manager = permissionsForRole(ROLES.MANAGER);

  it('can run operations and review cash sessions', () => {
    expect(hasPermission(manager, PERMISSIONS.PURCHASES_APPROVE)).toBe(true);
    expect(hasPermission(manager, PERMISSIONS.CASH_SESSIONS_REVIEW)).toBe(true);
    expect(hasPermission(manager, PERMISSIONS.RETURNS_APPROVE)).toBe(true);
  });

  it('has no unrestricted owner/security override (13_ §8)', () => {
    expect(hasPermission(manager, PERMISSIONS.ROLES_MANAGE)).toBe(false);
    expect(hasPermission(manager, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(manager, PERMISSIONS.AUDIT_VIEW)).toBe(false);
    expect(hasPermission(manager, PERMISSIONS.OWNER_EQUITY_MANAGE)).toBe(false);
  });
});

describe('role decisions — technician', () => {
  it('cannot view unrelated financial data (01_PRD §4)', () => {
    const technician = permissionsForRole(ROLES.TECHNICIAN);
    expect(hasPermission(technician, PERMISSIONS.REPORTS_VIEW_FINANCIAL)).toBe(false);
    expect(hasPermission(technician, PERMISSIONS.SALES_VIEW_PROFIT)).toBe(false);
    expect(hasPermission(technician, PERMISSIONS.INVENTORY_VIEW_COST)).toBe(false);
  });
});

describe('multi-role resolution', () => {
  it('unions grants without duplicates', () => {
    const combined = permissionsForRoles([ROLES.CASHIER, ROLES.SALESPERSON]);
    expect(new Set(combined).size).toBe(combined.length);
    expect(combined).toContain(PERMISSIONS.PAYMENTS_COLLECT); // from cashier
    expect(combined).toContain(PERMISSIONS.INVENTORY_RESERVE); // from salesperson
  });

  it('does not invent permissions neither role holds', () => {
    const combined = permissionsForRoles([ROLES.CASHIER, ROLES.SALESPERSON]);
    expect(combined).not.toContain(PERMISSIONS.ROLES_MANAGE);
    expect(combined).not.toContain(PERMISSIONS.SALES_VIEW_PROFIT);
  });

  it('returns nothing for no roles', () => {
    expect(permissionsForRoles([])).toEqual([]);
  });
});

describe('hasPermission', () => {
  it('accepts arrays and sets', () => {
    expect(hasPermission([PERMISSIONS.SALES_POST], PERMISSIONS.SALES_POST)).toBe(true);
    expect(hasPermission(new Set([PERMISSIONS.SALES_POST]), PERMISSIONS.SALES_POST)).toBe(true);
    expect(hasPermission(new Set([PERMISSIONS.SALES_POST]), PERMISSIONS.ROLES_MANAGE)).toBe(false);
  });
});
