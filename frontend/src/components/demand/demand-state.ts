import { PERMISSIONS } from "@mobileshop/shared";

export const DEMAND_FILTERS = [
  { id: "all", label: "All requests" },
  { id: "unavailable", label: "Unavailable" },
  { id: "reserved", label: "Reserved" },
  { id: "quotation", label: "Quotation sent" },
  { id: "price", label: "Price too high" },
] as const;

export type DemandFilter = (typeof DEMAND_FILTERS)[number]["id"];

export interface DemandCapabilities {
  readonly canView: boolean;
  readonly canCreate: boolean;
  readonly canManage: boolean;
  readonly canViewCustomers: boolean;
  readonly canViewCatalog: boolean;
  readonly canViewInventory: boolean;
}

export interface DemandDraft {
  readonly request: string;
  readonly variant: string;
  readonly quantity: string;
  readonly budget: string;
  readonly phone: string;
  readonly followUp: string;
  readonly note: string;
}

export type DemandDraftErrors = Readonly<
  Partial<Record<keyof DemandDraft, string>>
>;

export function demandCapabilities(
  permissions: readonly string[] | undefined,
): DemandCapabilities {
  const granted = permissions ?? [];
  return {
    canView: granted.includes(PERMISSIONS.DEMAND_VIEW),
    canCreate: granted.includes(PERMISSIONS.DEMAND_CREATE),
    canManage: granted.includes(PERMISSIONS.DEMAND_MANAGE),
    canViewCustomers: granted.includes(PERMISSIONS.CUSTOMERS_VIEW),
    canViewCatalog: granted.includes(PERMISSIONS.CATALOG_VIEW),
    canViewInventory: granted.includes(PERMISSIONS.INVENTORY_VIEW),
  };
}

export function demandFilterFrom(searchParams: URLSearchParams): DemandFilter {
  const value = searchParams.get("filter");
  return DEMAND_FILTERS.some((filter) => filter.id === value)
    ? (value as DemandFilter)
    : "all";
}

export function demandListQuery(
  searchParams: URLSearchParams,
  filter: DemandFilter,
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (filter === "all") next.delete("filter");
  else next.set("filter", filter);
  return next.toString();
}

export function demandOutcomeCategory(outcome: string): DemandFilter | "other" {
  const normalized = outcome.trim().toLowerCase();
  if (normalized.startsWith("unavailable")) return "unavailable";
  if (
    normalized.startsWith("reserved") ||
    normalized.startsWith("sold")
  ) {
    return "reserved";
  }
  if (normalized.startsWith("quotation")) return "quotation";
  if (normalized.startsWith("price")) return "price";
  return "other";
}

export function validateDemandDraft(draft: DemandDraft): DemandDraftErrors {
  const errors: Partial<Record<keyof DemandDraft, string>> = {};
  if (draft.request.trim().length < 3) {
    errors.request = "Describe what the customer requested.";
  }
  if (draft.request.trim().length > 200) {
    errors.request = "Request must be 200 characters or less.";
  }
  const quantity = Number(draft.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
    errors.quantity = "Quantity must be a whole number from 1 to 999.";
  }
  const normalizedPhone = draft.phone.replace(/[\s()-]/gu, "");
  if (
    normalizedPhone.length > 0 &&
    !/^(?:\+92|0)3\d{9}$/u.test(normalizedPhone)
  ) {
    errors.phone = "Enter a valid Pakistani mobile number or leave it blank.";
  }
  if (draft.followUp.length > 0 && !/^\d{4}-\d{2}-\d{2}$/u.test(draft.followUp)) {
    errors.followUp = "Choose a valid follow-up date.";
  }
  if (draft.note.trim().length > 500) {
    errors.note = "Note must be 500 characters or less.";
  }
  return errors;
}
