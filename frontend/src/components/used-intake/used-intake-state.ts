import { validateImei } from "@mobileshop/shared";

export const USED_INTAKE_BATTERY_THRESHOLD = 90;

export const USED_INTAKE_INSPECTION_ITEMS = [
  "Display — no dead pixels or burn-in",
  "Touch — full digitiser response",
  "Cameras — front and rear",
  "Battery and charging — holds charge",
] as const;

export const USED_INTAKE_GATES = [
  "Seller identity and consent",
  "IMEI / PTA verification",
  "Police e-Gadget verification",
  "Physical inspection checklist",
  `Battery health at least ${USED_INTAKE_BATTERY_THRESHOLD}%`,
] as const;

export const USED_INTAKE_BACKEND_GAPS = [
  {
    capability: "Intake records and KPIs",
    requirement: "UsedIntake persistence, scoped list/detail APIs and numbering",
  },
  {
    capability: "Restricted seller identity",
    requirement: "Dedicated permission, encryption, retention and redacted audit",
  },
  {
    capability: "IMEI / PTA result",
    requirement: "Evidence-backed DIRBS adapter; a local format check is insufficient",
  },
  {
    capability: "Police e-Gadget result",
    requirement: "Verified provider response and trace reference, not typed prose",
  },
  {
    capability: "Inspection evidence",
    requirement: "Append-only gate decisions, technician attribution and documents",
  },
  {
    capability: "Valuation approval",
    requirement: "Quote, approver separation, payment and immutable price evidence",
  },
  {
    capability: "Quarantine to saleable",
    requirement: "Atomic Inventory movement after every mandatory gate passes",
  },
] as const;

export interface UsedIntakeDraft {
  readonly sellerName: string;
  readonly cnic: string;
  readonly consent: boolean;
  readonly productVariantId: string;
  readonly otherDevice: string;
  readonly variant: string;
  readonly imei: string;
  readonly egadgetReference: string;
  readonly inspection: readonly boolean[];
  readonly batteryHealth: string;
  readonly grade: "grade_a" | "grade_b" | "grade_c";
  readonly quotedBuyPrice: string;
}

export const EMPTY_USED_INTAKE_DRAFT: UsedIntakeDraft = {
  sellerName: "",
  cnic: "",
  consent: false,
  productVariantId: "",
  otherDevice: "",
  variant: "",
  imei: "",
  egadgetReference: "",
  inspection: USED_INTAKE_INSPECTION_ITEMS.map(() => false),
  batteryHealth: String(USED_INTAKE_BATTERY_THRESHOLD),
  grade: "grade_a",
  quotedBuyPrice: "",
};

export interface UsedIntakeDraftErrors {
  readonly sellerName?: string;
  readonly cnic?: string;
  readonly consent?: string;
  readonly device?: string;
  readonly imei?: string;
  readonly egadgetReference?: string;
  readonly batteryHealth?: string;
  readonly quotedBuyPrice?: string;
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeUsedIntakeSearch(value: string): string {
  return normalizedText(value).slice(0, 120);
}

export function cnicLastFour(value: string): string | null {
  const digits = value.replace(/\D/gu, "");
  return digits.length === 13 ? digits.slice(-4) : null;
}

export function validateUsedIntakeDraft(
  draft: UsedIntakeDraft,
): UsedIntakeDraftErrors {
  const errors: Record<string, string> = {};
  if (normalizedText(draft.sellerName).length === 0) {
    errors.sellerName = "Enter the seller name shown on the identity document.";
  }
  if (cnicLastFour(draft.cnic) === null) {
    errors.cnic = "Enter a 13-digit CNIC; only a protected token and last four may be retained.";
  }
  if (!draft.consent) {
    errors.consent = "Seller consent and lawful-ownership declaration are required.";
  }
  if (
    draft.productVariantId.length === 0 ||
    (draft.productVariantId === "__other" &&
      normalizedText(draft.otherDevice).length === 0)
  ) {
    errors.device = "Select a serialized catalog item or describe the device.";
  }
  const imei = validateImei(draft.imei);
  if (!imei.valid) {
    errors.imei = imei.message ?? "Enter a valid 15-digit IMEI.";
  }
  if (normalizedText(draft.egadgetReference).length === 0) {
    errors.egadgetReference = "Capture the Police e-Gadget reference for later verification.";
  }
  const battery = Number(draft.batteryHealth);
  if (!Number.isInteger(battery) || battery < 0 || battery > 100) {
    errors.batteryHealth = "Battery health must be a whole percentage from 0 to 100.";
  }
  if (draft.quotedBuyPrice.length > 0) {
    const price = Number(draft.quotedBuyPrice);
    if (!Number.isSafeInteger(price) || price < 0) {
      errors.quotedBuyPrice = "Quoted buy price must be a non-negative whole rupee amount.";
    }
  }
  return errors;
}

export interface UsedIntakeGatePreview {
  readonly name: (typeof USED_INTAKE_GATES)[number];
  readonly state: "locally_ready" | "pending_external" | "pending_input";
  readonly explanation: string;
}

export function usedIntakeGatePreview(
  draft: UsedIntakeDraft,
): readonly UsedIntakeGatePreview[] {
  const validImei = validateImei(draft.imei).valid;
  const battery = Number(draft.batteryHealth);
  const inspectionReady = draft.inspection.every(Boolean);
  return [
    {
      name: USED_INTAKE_GATES[0],
      state:
        normalizedText(draft.sellerName).length > 0 &&
        cnicLastFour(draft.cnic) !== null &&
        draft.consent
          ? "locally_ready"
          : "pending_input",
      explanation: "Input is locally complete; secure identity persistence is still unavailable.",
    },
    {
      name: USED_INTAKE_GATES[1],
      state: validImei ? "pending_external" : "pending_input",
      explanation: validImei
        ? "IMEI format and checksum pass locally; PTA/DIRBS has not been queried."
        : "A valid IMEI is required before an external verification attempt.",
    },
    {
      name: USED_INTAKE_GATES[2],
      state:
        normalizedText(draft.egadgetReference).length > 0
          ? "pending_external"
          : "pending_input",
      explanation: "Entering a reference never proves that the Police e-Gadget check passed.",
    },
    {
      name: USED_INTAKE_GATES[3],
      state: inspectionReady ? "pending_external" : "pending_input",
      explanation: inspectionReady
        ? "Checklist is complete locally; technician evidence and attribution are not persisted."
        : "Every physical inspection item must be checked.",
    },
    {
      name: USED_INTAKE_GATES[4],
      state:
        Number.isInteger(battery) && battery >= USED_INTAKE_BATTERY_THRESHOLD
          ? "pending_external"
          : "pending_input",
      explanation:
        Number.isInteger(battery) && battery >= USED_INTAKE_BATTERY_THRESHOLD
          ? "Threshold is met locally; measured evidence still needs persistence."
          : `Battery health below ${USED_INTAKE_BATTERY_THRESHOLD}% blocks clearance.`,
    },
  ];
}
