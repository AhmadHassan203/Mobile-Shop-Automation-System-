import {
  PERMISSIONS,
  type ReturnOutcome,
  type SaleDetail,
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

export const RETURN_CONDITIONS = [
  "Like new",
  "New",
  "Used",
  "Faulty",
  "Damaged",
] as const;

export const RETURN_OUTCOME_OPTIONS = [
  { id: "restock", label: "Restock after inspection", tone: "accent" },
  { id: "quarantine", label: "Quarantine", tone: "warning" },
  { id: "supplier_warranty", label: "Supplier warranty", tone: "accent" },
  { id: "write_off", label: "Write-off", tone: "negative" },
] as const satisfies readonly {
  readonly id: ReturnOutcome;
  readonly label: string;
  readonly tone: "accent" | "warning" | "negative";
}[];

export type PrototypeReturnOutcome =
  (typeof RETURN_OUTCOME_OPTIONS)[number]["id"];
export type ReturnReason = (typeof RETURN_REASONS)[number];
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export interface ReturnCapabilities {
  readonly canView: boolean;
  readonly canCreate: boolean;
  readonly canApprove: boolean;
  readonly canViewSales: boolean;
  readonly canViewReports: boolean;
}

export interface ReturnDraft {
  readonly invoiceNumber: string;
  readonly saleLineId: string;
  readonly reason: ReturnReason;
  readonly condition: ReturnCondition;
  readonly evidence: string;
}

export type ReturnDraftErrors = Readonly<
  Partial<Record<keyof ReturnDraft, string>>
>;

export interface ReturnBackendGap {
  readonly id: string;
  readonly surface: string;
  readonly endpoint: string;
  readonly status: "not_implemented" | "deferred";
  readonly consequence: string;
}

/**
 * User-visible registry of the exact server dependencies blocking this module.
 * It prevents a polished empty screen from being mistaken for a live queue.
 */
export const RETURN_BACKEND_GAPS: readonly ReturnBackendGap[] = [
  {
    id: "queue",
    surface: "Queue, detail & KPIs",
    endpoint: "GET /returns · GET /returns/:id",
    status: "not_implemented",
    consequence:
      "No cases, queue counts, inspection counts, IMEIs or return-rate values can be loaded.",
  },
  {
    id: "eligibility",
    surface: "Eligibility & intake",
    endpoint: "GET /returns/eligibility · POST /returns",
    status: "not_implemented",
    consequence:
      "A real posted sale can be found, but policy, prior-return quantity and inspection intake cannot be confirmed or saved.",
  },
  {
    id: "outcome",
    surface: "Inspection outcome",
    endpoint: "POST /returns/:id/post",
    status: "not_implemented",
    consequence:
      "Restock, quarantine, supplier-warranty and write-off actions remain disabled; inventory and ledger state is untouched.",
  },
  {
    id: "exchange",
    surface: "Refund & exchange",
    endpoint: "POST /returns/:id/exchange",
    status: "not_implemented",
    consequence:
      "No refund, receivable reversal, replacement sale or customer credit is calculated in the browser.",
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
    sales.find(
      (sale) => sale.invoiceNumber?.toUpperCase() === normalized,
    ) ?? null
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
  const quantity = line.trackingType === "quantity" ? ` · Qty ${line.quantity}` : "";
  return `${line.product.name} · ${line.product.sku}${quantity}${identifier === null ? "" : ` · IMEI ${identifier}`}`;
}

export function validateReturnDraft(
  draft: ReturnDraft,
  verifiedSale: SaleDetail | null,
): ReturnDraftErrors {
  const errors: Partial<Record<keyof ReturnDraft, string>> = {};
  const invoice = normalizeReturnInvoice(draft.invoiceNumber);
  if (invoice.length === 0) {
    errors.invoiceNumber = "Look up the original sale first.";
  } else if (
    verifiedSale === null ||
    verifiedSale.invoiceNumber?.toUpperCase() !== invoice
  ) {
    errors.invoiceNumber = "The entered invoice has not been verified.";
  }
  if (
    verifiedSale === null ||
    !verifiedSale.lines.some((line) => line.id === draft.saleLineId)
  ) {
    errors.saleLineId = "Select a line from the verified original sale.";
  }
  if (draft.evidence.trim().length < 5) {
    errors.evidence = "Record the observed evidence; it is never generated automatically.";
  } else if (draft.evidence.trim().length > 1_000) {
    errors.evidence = "Evidence must be 1,000 characters or less.";
  }
  return errors;
}

export function returnOutcomeImpact(
  outcome: PrototypeReturnOutcome,
): readonly string[] {
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
