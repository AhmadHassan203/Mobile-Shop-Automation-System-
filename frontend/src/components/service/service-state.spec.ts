import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@mobileshop/shared";
import {
  normalizeServiceSearch,
  SERVICE_MODULES,
  serviceAccess,
} from "./service-state";

describe("service module state", () => {
  it("uses real return permission keys", () => {
    expect(serviceAccess("returns", [])).toMatchObject({
      canView: false,
      canPrepare: false,
      hasDedicatedPolicy: true,
    });
    expect(
      serviceAccess("returns", [
        PERMISSIONS.RETURNS_VIEW,
        PERMISSIONS.RETURNS_CREATE,
      ]),
    ).toMatchObject({ canView: true, canPrepare: true });
  });

  it("keeps modules without permission contracts read-only", () => {
    expect(
      serviceAccess("repairs", [PERMISSIONS.SETTINGS_MANAGE]),
    ).toMatchObject({
      canView: true,
      canPrepare: false,
      hasDedicatedPolicy: false,
    });
    expect(serviceAccess("used-intake", [])).toMatchObject({
      canView: true,
      canPrepare: false,
      hasDedicatedPolicy: false,
    });
  });

  it("defines every prototype workflow without seeded records", () => {
    expect(Object.keys(SERVICE_MODULES)).toEqual([
      "returns",
      "repairs",
      "used-intake",
    ]);
    expect(SERVICE_MODULES.returns.stages).toContain("Inspection");
    expect(SERVICE_MODULES.repairs.stages).toContain("In repair");
    expect(SERVICE_MODULES["used-intake"].stages).toContain("IMEI / PTA");
  });

  it("normalizes filter text and caps pathological input", () => {
    expect(normalizeServiceSearch("  REP-018    Galaxy  ")).toBe(
      "REP-018 Galaxy",
    );
    expect(normalizeServiceSearch("x".repeat(140))).toHaveLength(120);
  });
});
