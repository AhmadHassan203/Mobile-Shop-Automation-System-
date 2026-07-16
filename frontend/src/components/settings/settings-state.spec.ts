import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@mobileshop/shared";
import {
  permissionsForGroup,
  roleIsAssigned,
  settingsCapabilities,
  settingsTabFrom,
} from "./settings-state";

describe("settings state", () => {
  it("gates each settings surface with its real permission", () => {
    expect(settingsCapabilities([])).toEqual({
      canView: false,
      canManage: false,
      canViewUsers: false,
      canManageUsers: false,
      canViewRoles: false,
      canManageRoles: false,
      canViewAudit: false,
      canExport: false,
    });
    expect(
      settingsCapabilities([
        PERMISSIONS.SETTINGS_VIEW,
        PERMISSIONS.USERS_VIEW,
        PERMISSIONS.ROLES_MANAGE,
        PERMISSIONS.AUDIT_VIEW,
      ]),
    ).toMatchObject({
      canView: true,
      canManage: false,
      canViewUsers: true,
      canManageRoles: true,
      canViewAudit: true,
    });
  });

  it("normalizes invalid tab identifiers", () => {
    expect(settingsTabFrom("reorder")).toBe("reorder");
    expect(settingsTabFrom("unknown")).toBe("profile");
    expect(settingsTabFrom(null)).toBe("profile");
  });

  it("groups only effective server permissions", () => {
    const permissions = [
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.SUPPLIERS_MANAGE,
      PERMISSIONS.SALES_CREATE,
    ];
    expect(permissionsForGroup(4, permissions)).toEqual([
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.SUPPLIERS_MANAGE,
    ]);
    expect(permissionsForGroup(99, permissions)).toEqual([]);
  });

  it("matches assigned roles without inventing definitions", () => {
    expect(roleIsAssigned("owner", ["owner", "manager"])).toBe(true);
    expect(roleIsAssigned("cashier", ["owner", "manager"])).toBe(false);
  });
});
