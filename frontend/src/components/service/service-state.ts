import { PERMISSIONS } from "@mobileshop/shared";

export type ServiceModuleId = "returns" | "repairs" | "used-intake";

export interface ServiceModuleConfig {
  readonly id: ServiceModuleId;
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly actionLabel: string;
  readonly queueTitle: string;
  readonly queueDescription: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly tabs: readonly string[];
  readonly stages: readonly string[];
  readonly safeguards: readonly string[];
  readonly fields: readonly ServiceField[];
  readonly permissionNote: string;
}

export interface ServiceField {
  readonly label: string;
  readonly placeholder: string;
  readonly kind?: "input" | "select" | "textarea";
}

export interface ServiceAccess {
  readonly canView: boolean;
  readonly canPrepare: boolean;
  readonly hasDedicatedPolicy: boolean;
  readonly explanation: string;
}

export const SERVICE_MODULES: Readonly<
  Record<ServiceModuleId, ServiceModuleConfig>
> = {
  returns: {
    id: "returns",
    eyebrow: "Customer care · Controlled intake",
    title: "Returns & Warranty",
    subtitle:
      "Verify the original sale, inspect the unit, and record a defensible stock outcome before anything becomes saleable again.",
    actionLabel: "Preview new return",
    queueTitle: "Returns queue",
    queueDescription:
      "Change-of-mind, faulty units, and warranty cases awaiting a controlled decision.",
    emptyTitle: "No return records are available",
    emptyDescription:
      "The returns API is not implemented yet. This queue will stay empty rather than showing prototype or invented cases.",
    tabs: ["Returns", "Warranty claims"],
    stages: ["Sale verified", "Inspection", "Outcome decided", "Case closed"],
    safeguards: [
      "Original invoice and serialized unit must match.",
      "Returned stock enters inspection, never Available directly.",
      "Restock, quarantine, supplier warranty, and write-off remain audited outcomes.",
    ],
    fields: [
      { label: "Original invoice", placeholder: "Invoice number" },
      {
        label: "Item being returned",
        placeholder: "Matched from the original sale",
        kind: "select",
      },
      {
        label: "Return reason",
        placeholder: "Select after sale verification",
        kind: "select",
      },
      {
        label: "Condition on return",
        placeholder: "Select observed condition",
        kind: "select",
      },
      {
        label: "Evidence note",
        placeholder: "Bench result, seal state, battery health…",
        kind: "textarea",
      },
    ],
    permissionNote:
      "Viewing and preparing returns follow returns.view and returns.create. Server enforcement is still required when the API arrives.",
  },
  repairs: {
    id: "repairs",
    eyebrow: "Workshop · Job control",
    title: "Repairs",
    subtitle:
      "A workshop board for device intake, parts waits, bench work, quality control, and customer pickup.",
    actionLabel: "Preview repair booking",
    queueTitle: "Workshop board",
    queueDescription:
      "Jobs will move through the board only after repair APIs and authorization rules are implemented.",
    emptyTitle: "No repair jobs are available",
    emptyDescription:
      "The repair API is not implemented. The empty stage columns below show the intended workflow without fabricating customer jobs.",
    tabs: ["Board", "All jobs"],
    stages: ["Received", "Awaiting parts", "In repair", "Ready", "Delivered"],
    safeguards: [
      "Every handset job needs an IMEI and reported fault.",
      "Technician assignment and promised date stay visible through the workflow.",
      "Completion requires repair QC before pickup and financial posting.",
    ],
    fields: [
      { label: "Device", placeholder: "Model and variant" },
      { label: "IMEI", placeholder: "15-digit IMEI" },
      { label: "Reported issue", placeholder: "Select fault", kind: "select" },
      { label: "Technician", placeholder: "Assign technician", kind: "select" },
      { label: "Promised date", placeholder: "Select date" },
      {
        label: "Estimated repair charge",
        placeholder: "Requires finance contract",
      },
    ],
    permissionNote:
      "No dedicated repair permission keys exist in the shared authorization contract yet, so every repair write remains disabled.",
  },
  "used-intake": {
    id: "used-intake",
    eyebrow: "Second-hand stock · Quarantine first",
    title: "Used Device Intake & Trade-in",
    subtitle:
      "Protect the shop by holding every second-hand handset until identity, device, legal, and physical checks all pass.",
    actionLabel: "Preview used intake",
    queueTitle: "Intake quarantine",
    queueDescription:
      "Every device remains blocked from sale until all evidence-backed verification gates pass.",
    emptyTitle: "No used-device intakes are available",
    emptyDescription:
      "The used-intake API is not implemented. No fake devices, buy prices, or resale margins are shown.",
    tabs: ["In quarantine", "Cleared"],
    stages: [
      "Seller identity",
      "IMEI / PTA",
      "Police e-Gadget",
      "Physical inspection",
    ],
    safeguards: [
      "Seller consent and masked identity evidence are required.",
      "IMEI / PTA and Police e-Gadget references need independent verification.",
      "The unit stays quarantined until every gate passes.",
    ],
    fields: [
      { label: "Seller name", placeholder: "As shown on CNIC" },
      { label: "CNIC", placeholder: "Masked after verification" },
      {
        label: "Model",
        placeholder: "Select serialized catalog item",
        kind: "select",
      },
      { label: "Variant (storage · colour)", placeholder: "128 GB · Black" },
      { label: "IMEI", placeholder: "15-digit IMEI" },
      {
        label: "Police e-Gadget reference",
        placeholder: "Verification reference",
      },
      {
        label: "Physical inspection",
        placeholder: "Display, touch, cameras, battery and charging",
        kind: "textarea",
      },
      { label: "Battery health (%)", placeholder: "90" },
      { label: "Grade", placeholder: "Grade A", kind: "select" },
      {
        label: "Quoted buy price (Rs)",
        placeholder: "No value without backend",
      },
    ],
    permissionNote:
      "No dedicated used-intake permission keys exist in the shared authorization contract yet, so intake writes remain disabled.",
  },
};

export function serviceAccess(
  moduleId: ServiceModuleId,
  permissions: readonly string[] | undefined,
): ServiceAccess {
  const granted = permissions ?? [];
  if (moduleId === "returns") {
    const canView = granted.includes(PERMISSIONS.RETURNS_VIEW);
    const canPrepare = granted.includes(PERMISSIONS.RETURNS_CREATE);
    return {
      canView,
      canPrepare,
      hasDedicatedPolicy: true,
      explanation: canView
        ? canPrepare
          ? "Return viewing and intake preparation are granted. Saving remains unavailable until the backend workflow exists."
          : "Return viewing is granted, but returns.create is required to prepare an intake."
        : "returns.view is required to open the returns workspace.",
    };
  }

  return {
    canView: true,
    canPrepare: false,
    hasDedicatedPolicy: false,
    explanation:
      moduleId === "repairs"
        ? "The authorization contract has no repair-specific permission key yet. This route is a read-only workflow preview."
        : "The authorization contract has no used-intake permission key yet. This route is a read-only workflow preview.",
  };
}

export function normalizeServiceSearch(value: string): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, 120);
}
