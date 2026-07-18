import { PERMISSIONS } from "@mobileshop/shared";
import { describe, expect, it } from "vitest";
import {
  REPAIR_STAGES,
  normalizeRepairSearch,
  repairBookingImpact,
  repairCapabilities,
  repairRouteQuery,
  repairStageFrom,
  repairTimelineDescription,
  repairViewFrom,
  validateRepairDraft,
  type RepairDraft,
} from "./repair-state";

const COMPLETE_DRAFT: RepairDraft = {
  device: "Galaxy A16 128GB",
  imei: "356938035643809",
  issue: "Charging port",
  technicianId: "11111111-1111-4111-8111-111111111111",
  promisedDate: "2026-07-20",
  estimatedCharge: "5000.00",
};

describe("repairs workspace state", () => {
  it("does not invent repair permissions while preserving related navigation grants", () => {
    expect(
      repairCapabilities([
        PERMISSIONS.RETURNS_VIEW,
        PERMISSIONS.REPORTS_VIEW_FINANCIAL,
        PERMISSIONS.CATALOG_VIEW,
      ]),
    ).toEqual({
      hasPermissionContract: false,
      canPersist: false,
      canViewReturns: true,
      canViewFinance: true,
      canViewCatalog: true,
      canViewCustomers: false,
    });
  });

  it("defines the exact five-stage linear prototype board", () => {
    expect(REPAIR_STAGES.map((stage) => stage.label)).toEqual([
      "Received",
      "Awaiting parts",
      "In repair",
      "Ready",
      "Delivered",
    ]);
  });

  it("makes board/list and focused stage state linkable", () => {
    const query = repairRouteQuery(new URLSearchParams("source=dashboard"), {
      view: "all",
      stage: "ready",
    });
    const parsed = new URLSearchParams(query);
    expect(repairViewFrom(parsed)).toBe("all");
    expect(repairStageFrom(parsed)).toBe("ready");
    expect(parsed.get("source")).toBe("dashboard");

    const defaults = new URLSearchParams(
      repairRouteQuery(parsed, { view: "board", stage: null }),
    );
    expect(defaults.has("view")).toBe(false);
    expect(defaults.has("stage")).toBe(false);
  });

  it("normalizes all-jobs search without fabricating results", () => {
    expect(normalizeRepairSearch("  REP-018   Galaxy  ")).toBe(
      "REP-018 Galaxy",
    );
    expect(normalizeRepairSearch("x".repeat(130))).toHaveLength(120);
  });

  it("validates every required booking field and a real IMEI checksum", () => {
    expect(validateRepairDraft(COMPLETE_DRAFT)).toEqual({});
    expect(
      validateRepairDraft({
        device: "",
        imei: "123",
        issue: "",
        technicianId: "",
        promisedDate: "2026-02-30",
        estimatedCharge: "-1",
      }),
    ).toEqual({
      device: "Enter the device being booked in.",
      imei: "IMEI must be 15 digits, received 3",
      issue: "Select the reported issue.",
      technicianId:
        "A verified technician is required; the staff directory is unavailable.",
      promisedDate: "Select a valid promised date.",
      estimatedCharge:
        "Enter a non-negative estimate with at most two decimal places.",
    });
  });

  it("previews impact without generating a job id, revenue or success", () => {
    const impact = repairBookingImpact(COMPLETE_DRAFT).join(" ");
    expect(impact).toContain("server issues a collision-safe job number");
    expect(impact).toContain("untrusted draft estimate");
    expect(impact).not.toMatch(/REP-\d/u);
    expect(impact).not.toContain("booked successfully");
  });

  it("documents each stage using evidence-backed future behaviour", () => {
    expect(repairTimelineDescription("received")).toContain("persisted");
    expect(repairTimelineDescription("ready")).toContain("QC");
    expect(repairTimelineDescription("delivered")).toContain("Finance");
  });
});
