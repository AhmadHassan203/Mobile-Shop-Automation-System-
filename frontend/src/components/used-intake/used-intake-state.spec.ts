import { describe, expect, it } from "vitest";
import {
  EMPTY_USED_INTAKE_DRAFT,
  USED_INTAKE_BACKEND_GAPS,
  USED_INTAKE_GATES,
  cnicLastFour,
  normalizeUsedIntakeSearch,
  usedIntakeGatePreview,
  validateUsedIntakeDraft,
} from "./used-intake-state";

const validDraft = {
  ...EMPTY_USED_INTAKE_DRAFT,
  sellerName: "Waleed Ahmed",
  cnic: "35202-1234567-1",
  consent: true,
  productVariantId: "__other",
  otherDevice: "Galaxy A16 128 GB Black",
  imei: "490154203237518",
  egadgetReference: "EG-LHR-2026-00123",
  inspection: [true, true, true, true],
  batteryHealth: "91",
  quotedBuyPrice: "195000",
} as const;

describe("used intake state", () => {
  it("normalizes search without accepting unbounded input", () => {
    expect(normalizeUsedIntakeSearch("  UDI-312   Galaxy  ")).toBe(
      "UDI-312 Galaxy",
    );
    expect(normalizeUsedIntakeSearch("x".repeat(200))).toHaveLength(120);
  });

  it("retains only the CNIC last-four display fragment", () => {
    expect(cnicLastFour("35202-1234567-1")).toBe("5671");
    expect(cnicLastFour("35202-12345")).toBeNull();
  });

  it("requires consent, identity, device, valid IMEI and evidence references", () => {
    expect(validateUsedIntakeDraft(EMPTY_USED_INTAKE_DRAFT)).toMatchObject({
      sellerName: expect.any(String),
      cnic: expect.any(String),
      consent: expect.any(String),
      device: expect.any(String),
      imei: expect.any(String),
      egadgetReference: expect.any(String),
    });
    expect(validateUsedIntakeDraft(validDraft)).toEqual({});
  });

  it("never converts local completeness into external verification", () => {
    const preview = usedIntakeGatePreview(validDraft);
    expect(preview).toHaveLength(USED_INTAKE_GATES.length);
    expect(preview[0]?.state).toBe("locally_ready");
    expect(
      preview.slice(1).every((gate) => gate.state === "pending_external"),
    ).toBe(true);
  });

  it("keeps every unsafe backend boundary visible", () => {
    expect(USED_INTAKE_BACKEND_GAPS).toHaveLength(7);
    expect(USED_INTAKE_BACKEND_GAPS.map((gap) => gap.capability)).toContain(
      "Quarantine to saleable",
    );
  });
});
