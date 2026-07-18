import { PERMISSIONS, validateImei } from "@mobileshop/shared";

export const REPAIR_STAGES = [
  {
    id: "received",
    label: "Received",
    currentLabel: "Just booked in",
    emptyTitle: "New intake list unavailable",
    emptyDescription:
      "GET /repairs is deferred; the screen cannot claim there are no new intakes.",
  },
  {
    id: "awaiting_parts",
    label: "Awaiting parts",
    currentLabel: "Waiting on parts",
    emptyTitle: "Parts queue unavailable",
    emptyDescription: "No repair-parts or supplier-link contract exists yet.",
  },
  {
    id: "in_repair",
    label: "In repair",
    currentLabel: "On the bench now",
    emptyTitle: "Bench queue unavailable",
    emptyDescription:
      "Assigned technician work cannot be loaded without scoped repair detail.",
  },
  {
    id: "ready",
    label: "Ready",
    currentLabel: "Ready — awaiting pickup",
    emptyTitle: "Pickup queue unavailable",
    emptyDescription:
      "No job is presented as QC-passed or ready without server evidence.",
  },
  {
    id: "delivered",
    label: "Delivered",
    currentLabel: "Delivered",
    emptyTitle: "Delivery history unavailable",
    emptyDescription:
      "Completed jobs require server history, collected-charge and handover evidence.",
  },
] as const;

export type RepairStage = (typeof REPAIR_STAGES)[number]["id"];
export type RepairView = "board" | "all";

export const REPAIR_ISSUES = [
  "Cracked screen",
  "Battery replacement",
  "Charging port",
  "Water damage",
  "Speaker / microphone",
  "Camera fault",
  "Software / setup",
  "Other",
] as const;

export type RepairIssue = (typeof REPAIR_ISSUES)[number];

export interface RepairCapabilities {
  readonly hasPermissionContract: false;
  readonly canPersist: false;
  readonly canViewReturns: boolean;
  readonly canViewFinance: boolean;
  readonly canViewCatalog: boolean;
  readonly canViewCustomers: boolean;
}

export interface RepairDraft {
  readonly device: string;
  readonly imei: string;
  readonly issue: RepairIssue | "";
  readonly technicianId: string;
  readonly promisedDate: string;
  readonly estimatedCharge: string;
}

export type RepairDraftErrors = Readonly<
  Partial<Record<keyof RepairDraft, string>>
>;

export function repairCapabilities(
  permissions: readonly string[] | undefined,
): RepairCapabilities {
  const granted = permissions ?? [];
  return {
    hasPermissionContract: false,
    canPersist: false,
    canViewReturns: granted.includes(PERMISSIONS.RETURNS_VIEW),
    canViewFinance:
      granted.includes(PERMISSIONS.REPORTS_VIEW_FINANCIAL) ||
      granted.includes(PERMISSIONS.RECEIVABLES_VIEW),
    canViewCatalog: granted.includes(PERMISSIONS.CATALOG_VIEW),
    canViewCustomers: granted.includes(PERMISSIONS.CUSTOMERS_VIEW),
  };
}

export function repairViewFrom(searchParams: URLSearchParams): RepairView {
  return searchParams.get("view") === "all" ? "all" : "board";
}

export function repairRouteQuery(
  searchParams: URLSearchParams,
  update: { readonly view?: RepairView; readonly stage?: RepairStage | null },
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (update.view !== undefined) {
    if (update.view === "board") next.delete("view");
    else next.set("view", update.view);
  }
  if (update.stage !== undefined) {
    if (update.stage === null) next.delete("stage");
    else next.set("stage", update.stage);
  }
  return next.toString();
}

export function repairStageFrom(
  searchParams: URLSearchParams,
): RepairStage | null {
  const value = searchParams.get("stage");
  return REPAIR_STAGES.some((stage) => stage.id === value)
    ? (value as RepairStage)
    : null;
}

export function normalizeRepairSearch(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, 120);
}

function validDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validCharge(value: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100_000_000;
}

export function validateRepairDraft(draft: RepairDraft): RepairDraftErrors {
  const errors: Partial<Record<keyof RepairDraft, string>> = {};
  const device = draft.device.trim();
  if (device.length < 2) errors.device = "Enter the device being booked in.";
  if (device.length > 200)
    errors.device = "Device must be 200 characters or less.";
  const imei = validateImei(draft.imei);
  if (!imei.valid) errors.imei = imei.message ?? "Enter a valid 15-digit IMEI.";
  if (draft.issue === "") errors.issue = "Select the reported issue.";
  if (draft.technicianId.length === 0) {
    errors.technicianId =
      "A verified technician is required; the staff directory is unavailable.";
  }
  if (!validDateInput(draft.promisedDate)) {
    errors.promisedDate = "Select a valid promised date.";
  }
  if (!validCharge(draft.estimatedCharge)) {
    errors.estimatedCharge =
      "Enter a non-negative estimate with at most two decimal places.";
  }
  return errors;
}

export function repairBookingImpact(draft: RepairDraft): readonly string[] {
  const device = draft.device.trim();
  return [
    device.length === 0
      ? "A verified device is required before booking."
      : `${device} would be booked only after the server issues a collision-safe job number.`,
    "The card would enter Received only after a scoped technician and promised date are validated.",
    draft.estimatedCharge.trim().length === 0
      ? "A customer-facing estimate is still required; Finance posts only on verified completion."
      : "The entered charge remains an untrusted draft estimate; Finance posts an authoritative amount only on verified completion.",
  ];
}

export function repairTimelineDescription(stage: RepairStage): string {
  switch (stage) {
    case "received":
      return "Booking time, customer/device link and reported fault come from persisted intake evidence.";
    case "awaiting_parts":
      return "Required parts and supplier order evidence are recorded before this stage is shown complete.";
    case "in_repair":
      return "Only the assigned technician can record bench work under the future authorization contract.";
    case "ready":
      return "Repair completion and QC must pass before a customer pickup notification is allowed.";
    case "delivered":
      return "Customer handover and collected charge close the job and post to Finance atomically.";
  }
}
