import { PERMISSIONS } from "@mobileshop/shared";

export const REPORT_RANGES = [
  { id: "month", label: "This month" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
] as const;

export type ReportRange = (typeof REPORT_RANGES)[number]["id"];
export type ReportGroup =
  | "Sales"
  | "Inventory"
  | "Demand"
  | "Intelligence"
  | "Finance"
  | "Digital Services"
  | "Service"
  | "System";

export interface ReportDefinition {
  readonly name: string;
  readonly group: ReportGroup;
  readonly description: string;
  readonly columns: readonly string[];
  readonly href: string;
  readonly financial: boolean;
}

export interface ReportCapabilities {
  readonly canView: boolean;
  readonly canViewFinancial: boolean;
  readonly canExport: boolean;
}

export const REPORT_GROUP_ORDER: readonly ReportGroup[] = [
  "Sales",
  "Inventory",
  "Demand",
  "Intelligence",
  "Finance",
  "Digital Services",
  "Service",
  "System",
];

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    name: "Daily sales & profit",
    group: "Sales",
    description: "Revenue, discounts, COGS and gross profit for the day.",
    columns: [
      "Date",
      "Revenue",
      "Discounts",
      "COGS",
      "Gross profit",
      "Margin %",
    ],
    href: "/finance",
    financial: true,
  },
  {
    name: "Sales by product / brand",
    group: "Sales",
    description: "Ranked by units and profit across category and price band.",
    columns: ["Product", "Brand", "Band", "Units", "Revenue", "Profit"],
    href: "/stock",
    financial: true,
  },
  {
    name: "Gross margin by product",
    group: "Sales",
    description: "Where the profit actually comes from.",
    columns: ["Product", "Avg cost", "Avg price", "Margin %", "30-day profit"],
    href: "/stock",
    financial: true,
  },
  {
    name: "Inventory valuation",
    group: "Inventory",
    description: "Current stock value at recorded cost.",
    columns: ["Product", "On hand", "Unit cost", "Stock value"],
    href: "/stock",
    financial: true,
  },
  {
    name: "Inventory aging",
    group: "Inventory",
    description: "Capital tied up by days-in-stock buckets.",
    columns: ["Product", "Age bucket", "Units", "Capital tied"],
    href: "/stock",
    financial: true,
  },
  {
    name: "Stock movement ledger",
    group: "Inventory",
    description: "Every quantity change with reason and audit link.",
    columns: ["Time", "Item", "Change", "Reason", "Actor"],
    href: "/stock?tab=movements",
    financial: false,
  },
  {
    name: "Stockout & lost sales",
    group: "Demand",
    description: "Where demand was missed and why.",
    columns: ["Product", "Requests", "Est. lost sales", "Days out of stock"],
    href: "/demand",
    financial: true,
  },
  {
    name: "Customer demand report",
    group: "Demand",
    description: "Requested variants, budgets and conversion.",
    columns: ["Date", "Customer", "Requested", "Budget", "Outcome"],
    href: "/demand",
    financial: false,
  },
  {
    name: "Reorder recommendations",
    group: "Intelligence",
    description: "What to buy next, quantity, cost and reasons.",
    columns: ["Product", "Qty", "Cost", "Exp. profit", "Score"],
    href: "/intelligence",
    financial: true,
  },
  {
    name: "Cash flow",
    group: "Finance",
    description: "Cash in and out, separated from profit.",
    columns: ["Opening", "Cash in", "Cash out", "Deposits", "Closing"],
    href: "/finance",
    financial: true,
  },
  {
    name: "Receivables / payables",
    group: "Finance",
    description: "Who owes the shop and who the shop owes.",
    columns: ["Party", "Type", "Amount", "Due", "Status"],
    href: "/finance",
    financial: true,
  },
  {
    name: "Digital services summary",
    group: "Digital Services",
    description:
      "Sent, received, fees, commission, charges and net service earnings.",
    columns: [
      "Sent principal",
      "Received principal",
      "Customer fees",
      "Net commission",
      "Net earnings",
    ],
    href: "/digital-services",
    financial: true,
  },
  {
    name: "Digital transaction history",
    group: "Digital Services",
    description:
      "Manual provider transaction log with status, reference and reversal trail.",
    columns: [
      "Transaction ID",
      "Service",
      "Direction",
      "Principal",
      "Fee",
      "Status",
      "Reference",
    ],
    href: "/digital-services",
    financial: true,
  },
  {
    name: "Digital service balances",
    group: "Digital Services",
    description: "Physical cash impact and provider float balances by service.",
    columns: ["Service", "Opening", "Sent", "Received", "Current", "Pending"],
    href: "/digital-services",
    financial: true,
  },
  {
    name: "Digital commission report",
    group: "Digital Services",
    description:
      "Customer fees, provider commission, tax, direct charges and net earnings.",
    columns: [
      "Service",
      "Direction",
      "Fees",
      "Gross commission",
      "Tax",
      "Net earnings",
    ],
    href: "/digital-services",
    financial: true,
  },
  {
    name: "Digital reconciliation",
    group: "Digital Services",
    description:
      "Counted cash/float variance against expected digital-service balances.",
    columns: ["Balance", "Expected", "Counted", "Variance", "Reason"],
    href: "/digital-services",
    financial: true,
  },
  {
    name: "Returns & warranty",
    group: "Service",
    description: "Return reasons, outcomes and defect rate.",
    columns: ["Ref", "Item", "Reason", "Outcome", "Status"],
    href: "/returns",
    financial: false,
  },
  {
    name: "Audit report",
    group: "System",
    description: "Immutable trail of every critical action.",
    columns: ["Time", "Actor", "Action", "Entity", "Detail"],
    href: "/settings",
    financial: false,
  },
];

export function reportCapabilities(
  permissions: readonly string[] | undefined,
): ReportCapabilities {
  const granted = permissions ?? [];
  return {
    canView: granted.includes(PERMISSIONS.REPORTS_VIEW),
    canViewFinancial: granted.includes(PERMISSIONS.REPORTS_VIEW_FINANCIAL),
    canExport: granted.includes(PERMISSIONS.REPORTS_EXPORT),
  };
}

export function reportRangeFrom(searchParams: URLSearchParams): ReportRange {
  const value = searchParams.get("range");
  return REPORT_RANGES.some((range) => range.id === value)
    ? (value as ReportRange)
    : "month";
}

export function reportRangeQuery(
  searchParams: URLSearchParams,
  range: ReportRange,
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (range === "month") next.delete("range");
  else next.set("range", range);
  return next.toString();
}

export function reportsByGroup(
  definitions: readonly ReportDefinition[] = REPORT_DEFINITIONS,
): ReadonlyMap<ReportGroup, readonly ReportDefinition[]> {
  return new Map(
    REPORT_GROUP_ORDER.map((group) => [
      group,
      definitions.filter((report) => report.group === group),
    ]),
  );
}

export function canPreviewReport(
  report: ReportDefinition,
  capabilities: ReportCapabilities,
): boolean {
  return (
    capabilities.canView && (!report.financial || capabilities.canViewFinancial)
  );
}
