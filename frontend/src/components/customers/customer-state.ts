import { PERMISSIONS } from "@mobileshop/shared";

export const CUSTOMER_FILTERS = [
  { id: "all", label: "All customers" },
  { id: "credit", label: "Outstanding credit" },
  { id: "repeat", label: "Repeat buyers" },
  { id: "consent", label: "Consent pending" },
] as const;

export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number]["id"];

export interface CustomerCapabilities {
  readonly canView: boolean;
  readonly canManage: boolean;
  readonly canViewSensitive: boolean;
  readonly canCreateDemand: boolean;
  readonly canCreateSales: boolean;
}

export interface CustomerDraft {
  readonly name: string;
  readonly phone: string;
  readonly consent: "yes" | "pending";
  readonly notes: string;
}

export type CustomerDraftErrors = Readonly<
  Partial<Record<keyof CustomerDraft, string>>
>;

export function customerCapabilities(
  permissions: readonly string[] | undefined,
): CustomerCapabilities {
  const granted = permissions ?? [];
  return {
    canView: granted.includes(PERMISSIONS.CUSTOMERS_VIEW),
    canManage: granted.includes(PERMISSIONS.CUSTOMERS_MANAGE),
    canViewSensitive: granted.includes(PERMISSIONS.CUSTOMERS_VIEW_SENSITIVE),
    canCreateDemand: granted.includes(PERMISSIONS.DEMAND_CREATE),
    canCreateSales: granted.includes(PERMISSIONS.SALES_CREATE),
  };
}

export function customerFilterFrom(
  searchParams: URLSearchParams,
): CustomerFilter {
  const value = searchParams.get("filter");
  return CUSTOMER_FILTERS.some((filter) => filter.id === value)
    ? (value as CustomerFilter)
    : "all";
}

export function customerListQuery(
  searchParams: URLSearchParams,
  update: { readonly filter?: CustomerFilter; readonly q?: string },
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (update.filter !== undefined) {
    if (update.filter === "all") next.delete("filter");
    else next.set("filter", update.filter);
  }
  if (update.q !== undefined) {
    const q = update.q.trim().slice(0, 120);
    if (q.length === 0) next.delete("q");
    else next.set("q", q);
  }
  return next.toString();
}

export function customerSearchFrom(searchParams: URLSearchParams): string {
  return searchParams.get("q")?.trim().slice(0, 120) ?? "";
}

export function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function validateCustomerDraft(
  draft: CustomerDraft,
): CustomerDraftErrors {
  const errors: Partial<Record<keyof CustomerDraft, string>> = {};
  const name = draft.name.trim();
  const normalizedPhone = draft.phone.replace(/[\s()-]/gu, "");
  if (name.length < 2) errors.name = "Enter the customer's full name.";
  if (name.length > 120) errors.name = "Name must be 120 characters or less.";
  if (!/^(?:\+92|0)3\d{9}$/u.test(normalizedPhone)) {
    errors.phone = "Enter a valid Pakistani mobile number.";
  }
  if (draft.notes.trim().length > 500) {
    errors.notes = "Notes must be 500 characters or less.";
  }
  return errors;
}
