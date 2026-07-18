import {
  PERMISSIONS,
  type CreateReturnDraftInput,
  type ReturnDraftLineInput,
  type ReturnEligibility,
  type ReturnEligibilityLine,
  type ReturnItemCondition,
  type ReturnOutcome,
  type ReturnStatus,
  type SaleLine,
  type SaleSummary,
} from "@mobileshop/shared";

export const RETURN_TABS = [
  { id: "returns", label: "Returns" },
  { id: "warranty", label: "Warranty claims" },
] as const;

export type ReturnTab = (typeof RETURN_TABS)[number]["id"];

export const RETURN_REASONS = [
  "Not charging (DOA)",
  "Defective / not powering on",
  "Battery draining fast",
  "Screen / display fault",
  "Customer changed mind",
  "Wrong item delivered",
  "Software / setup issue",
  "Other",
] as const;

/** UI condition choices mapped to the contract's RETURN_ITEM_CONDITIONS. */
export const RETURN_CONDITION_OPTIONS = [
  { value: "like_new", label: "Like new" },
  { value: "new", label: "New" },
  { value: "used", label: "Used" },
  { value: "faulty", label: "Faulty" },
  { value: "damaged", label: "Damaged" },
] as const satisfies readonly {
  readonly value: ReturnItemCondition;
  readonly label: string;
}[];

/**
 * Physical outcomes a returned unit can take (01_PRD §5.8). `repair` is included
 * so every server-decided ReturnLine.outcome renders, not just the four the
 * prototype once listed.
 */
export const RETURN_OUTCOME_OPTIONS = [
  { id: "restock", label: "Restock after inspection", tone: "accent" },
  { id: "quarantine", label: "Quarantine", tone: "warning" },
  { id: "repair", label: "Repair", tone: "warning" },
  { id: "supplier_warranty", label: "Supplier warranty", tone: "accent" },
  { id: "write_off", label: "Write-off", tone: "negative" },
] as const satisfies readonly {
  readonly id: ReturnOutcome;
  readonly label: string;
  readonly tone: "accent" | "warning" | "negative";
}[];

export type ReturnReason = (typeof RETURN_REASONS)[number];

export interface ReturnCapabilities {
  readonly canView: boolean;
  readonly canCreate: boolean;
  readonly canApprove: boolean;
  readonly canViewSales: boolean;
  readonly canViewReports: boolean;
}

/** Per-line intake state, keyed by the original sale line the unit came from. */
export interface ReturnIntakeLineSelection {
  readonly condition: ReturnItemCondition;
  readonly quantity: number;
}

export interface ReturnIntakeDraft {
  readonly reason: ReturnReason;
  readonly evidenceNote: string;
  readonly selections: Readonly<Record<string, ReturnIntakeLineSelection>>;
}

export const EMPTY_RETURN_INTAKE: ReturnIntakeDraft = {
  reason: RETURN_REASONS[0],
  evidenceNote: "",
  selections: {},
};

export type ReturnIntakeErrors = Readonly<{
  form?: string;
  lines?: string;
  evidenceNote?: string;
}>;

export interface ReturnBackendGap {
  readonly id: string;
  readonly surface: string;
  readonly endpoint: string;
  readonly status: "not_implemented" | "deferred";
  readonly consequence: string;
}

/**
 * The dependencies that are still not transactional. Queue, eligibility, intake
 * and posting are now wired to real endpoints, so only exchange settlement,
 * the deferred Warranty module and the returns report remain listed.
 */
export const RETURN_BACKEND_GAPS: readonly ReturnBackendGap[] = [
  {
    id: "exchange",
    surface: "Refund & exchange",
    endpoint: "POST /returns/:id/exchange",
    status: "deferred",
    consequence:
      "Atomic exchange posting is unavailable, so the exchange action stays disabled; a plain refund or credit is settled at posting instead.",
  },
  {
    id: "warranty",
    surface: "Warranty claims",
    endpoint: "Warranty / claims contract",
    status: "deferred",
    consequence:
      "Manufacturer and shop-warranty cases cannot be listed, submitted or settled yet.",
  },
  {
    id: "report",
    surface: "Returns report",
    endpoint: "GET /reports/returns",
    status: "not_implemented",
    consequence:
      "The Reports workspace can be opened, but this module does not claim a verified return-rate report.",
  },
] as const;

export function returnCapabilities(
  permissions: readonly string[] | undefined,
): ReturnCapabilities {
  const granted = permissions ?? [];
  return {
    canView: granted.includes(PERMISSIONS.RETURNS_VIEW),
    canCreate: granted.includes(PERMISSIONS.RETURNS_CREATE),
    canApprove: granted.includes(PERMISSIONS.RETURNS_APPROVE),
    canViewSales: granted.includes(PERMISSIONS.SALES_VIEW),
    canViewReports: granted.includes(PERMISSIONS.REPORTS_VIEW),
  };
}

export function returnTabFrom(searchParams: URLSearchParams): ReturnTab {
  return searchParams.get("tab") === "warranty" ? "warranty" : "returns";
}

export function returnRouteQuery(
  searchParams: URLSearchParams,
  tab: ReturnTab,
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (tab === "returns") next.delete("tab");
  else next.set("tab", tab);
  return next.toString();
}

export function normalizeReturnInvoice(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toUpperCase()
    .slice(0, 100);
}

export function exactInvoiceSale(
  sales: readonly SaleSummary[],
  invoiceNumber: string,
): SaleSummary | null {
  const normalized = normalizeReturnInvoice(invoiceNumber);
  return (
    sales.find((sale) => sale.invoiceNumber?.toUpperCase() === normalized) ??
    null
  );
}

export function returnLineIdentifier(line: SaleLine): string | null {
  if (line.trackingType !== "serialized") return null;
  const preferred =
    line.serializedUnit.identifiers.find((identifier) =>
      identifier.type.toLowerCase().startsWith("imei"),
    ) ?? line.serializedUnit.identifiers[0];
  return preferred?.value ?? null;
}

export function returnLineLabel(line: SaleLine): string {
  const identifier = returnLineIdentifier(line);
  const quantity =
    line.trackingType === "quantity" ? ` · Qty ${line.quantity}` : "";
  return `${line.product.name} · ${line.product.sku}${quantity}${identifier === null ? "" : ` · IMEI ${identifier}`}`;
}

/** The normalized IMEI/serial the return draft must echo for a serialized line. */
export function eligibilityLineIdentifier(
  line: Extract<ReturnEligibilityLine, { trackingType: "serialized" }>,
): string {
  const identifiers = line.serializedUnit.identifiers;
  const preferred =
    identifiers.find((identifier) =>
      identifier.type.toLowerCase().startsWith("imei"),
    ) ?? identifiers[0];
  return preferred?.value ?? "";
}

export function eligibilityLineLabel(line: ReturnEligibilityLine): string {
  if (line.trackingType === "serialized") {
    return `${line.product.name} · ${line.product.sku} · IMEI ${eligibilityLineIdentifier(line)}`;
  }
  return `${line.product.name} · ${line.product.sku} · Qty ${line.remainingQuantity} of ${line.soldQuantity}`;
}

/** True when a line still has returnable units left on the original sale. */
export function isEligibilityLineReturnable(
  line: ReturnEligibilityLine,
): boolean {
  return line.remainingQuantity > 0;
}

/**
 * Validate the intake against real eligibility. Evidence is never inferred, and
 * a fully-returned or non-returnable sale is blocked with a specific reason.
 */
export function validateReturnIntake(
  eligibility: ReturnEligibility | null,
  draft: ReturnIntakeDraft,
): ReturnIntakeErrors {
  const errors: {
    form?: string;
    lines?: string;
    evidenceNote?: string;
  } = {};

  if (eligibility === null) {
    errors.form = "Check eligibility for a posted invoice first.";
    return errors;
  }
  if (eligibility.state === "fully_returned") {
    errors.form = "Every eligible line on this sale has already been returned.";
  } else if (eligibility.state === "sale_not_returnable") {
    errors.form = "This sale is not returnable.";
  }

  const selectedIds = Object.keys(draft.selections);
  if (selectedIds.length === 0) {
    errors.lines = "Select at least one returnable line.";
  } else {
    for (const line of eligibility.lines) {
      const selection = draft.selections[line.saleLineId];
      if (selection === undefined) continue;
      if (!isEligibilityLineReturnable(line)) {
        errors.lines = "One selected line has nothing left to return.";
        break;
      }
      if (line.trackingType === "quantity") {
        const quantity = selection.quantity;
        if (
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > line.remainingQuantity
        ) {
          errors.lines = "Enter a return quantity within what remains.";
          break;
        }
      }
    }
  }

  const evidence = draft.evidenceNote.trim();
  if (evidence.length < 5) {
    errors.evidenceNote =
      "Record the observed evidence; it is never generated automatically.";
  } else if (evidence.length > 1_000) {
    errors.evidenceNote = "Evidence must be 1,000 characters or less.";
  }

  return errors;
}

/** A draft can be saved only when eligibility permits it and nothing is invalid. */
export function canSubmitReturnIntake(
  eligibility: ReturnEligibility | null,
  draft: ReturnIntakeDraft,
): boolean {
  if (eligibility === null) return false;
  if (
    eligibility.state === "fully_returned" ||
    eligibility.state === "sale_not_returnable"
  ) {
    return false;
  }
  return Object.keys(validateReturnIntake(eligibility, draft)).length === 0;
}

/** Translate the selected eligibility lines into the multi-line create input. */
export function buildCreateReturnInput(
  eligibility: ReturnEligibility,
  draft: ReturnIntakeDraft,
): CreateReturnDraftInput {
  const lines: ReturnDraftLineInput[] = [];
  for (const line of eligibility.lines) {
    const selection = draft.selections[line.saleLineId];
    if (selection === undefined) continue;
    if (line.trackingType === "serialized") {
      lines.push({
        trackingType: "serialized",
        saleLineId: line.saleLineId,
        serializedUnitId: line.serializedUnit.id,
        identifier: eligibilityLineIdentifier(line),
        quantity: 1,
        condition: selection.condition,
      });
    } else {
      lines.push({
        trackingType: "quantity",
        saleLineId: line.saleLineId,
        quantity: selection.quantity,
        condition: selection.condition,
      });
    }
  }
  return {
    saleId: eligibility.sale.id,
    reason: draft.reason,
    evidenceNote: draft.evidenceNote,
    lines,
  };
}

export function returnOutcomeImpact(outcome: ReturnOutcome): readonly string[] {
  switch (outcome) {
    case "restock":
      return [
        "The verified line may become saleable only after inspection passes.",
        "The server must restore the exact IMEI or batch quantity from the original sale.",
        "Inventory movement and audit evidence must be committed atomically.",
      ];
    case "quarantine":
      return [
        "The returned line remains outside saleable stock in Quarantine.",
        "It is not counted as Available and needs a later evidence-backed decision.",
        "The server must record inventory movement and audit evidence atomically.",
      ];
    case "repair":
      return [
        "The unit is routed to repair and stays out of saleable stock.",
        "It can only re-enter Available through a later inspected transition.",
        "Any parts or labour cost is recorded by the repair workflow, not inferred here.",
      ];
    case "supplier_warranty":
      return [
        "A supplier claim must reference the verified product and purchasing history.",
        "The unit remains outside saleable stock while replacement or credit is pending.",
        "Any payable or receivable adjustment is recorded only when the claim settles.",
      ];
    case "write_off":
      return [
        "The returned line would be removed permanently through an inventory write-off.",
        "The loss amount is unavailable until the server reads the recorded cost; no browser estimate is used.",
        "Inventory value, financial loss and audit evidence must post atomically.",
      ];
  }
}

/** Display label for any server-decided return line outcome. */
export function returnOutcomeLabel(outcome: ReturnOutcome): string {
  return (
    RETURN_OUTCOME_OPTIONS.find((option) => option.id === outcome)?.label ??
    outcome
  );
}

export function returnConditionLabel(condition: ReturnItemCondition): string {
  return (
    RETURN_CONDITION_OPTIONS.find((option) => option.value === condition)
      ?.label ?? condition
  );
}

export function returnStatusLabel(status: ReturnStatus): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
