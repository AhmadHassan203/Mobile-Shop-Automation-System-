import {
  CUSTOMER_CONTRACT_LIMITS,
  PERMISSIONS,
  normalizePakistanPhone,
  type CustomerMarketingConsentStatus,
  type CustomerPage,
  type CustomerSummary,
} from "@mobileshop/shared";

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
  readonly email: string;
  readonly consent: CustomerMarketingConsentStatus;
  readonly addressLine: string;
  readonly notes: string;
}

export type CustomerDraftErrors = Readonly<
  Partial<Record<keyof CustomerDraft, string>>
>;

export interface CustomerKpis {
  readonly totalCustomers: number;
  readonly repeatBuyers: number | null;
  readonly lifetimeSpendMinor: number | null;
  readonly creditCustomers: number;
  readonly receivableBalanceMinor: number | null;
  readonly populationComplete: boolean;
  readonly creditPopulationComplete: boolean;
}

export interface CustomerVisiblePage {
  readonly items: readonly CustomerSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

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

export function customerPageFrom(searchParams: URLSearchParams): number {
  const page = Number(searchParams.get("page") ?? "1");
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function customerListQuery(
  searchParams: URLSearchParams,
  update: {
    readonly filter?: CustomerFilter;
    readonly q?: string;
    readonly page?: number;
    readonly customerId?: string | null;
  },
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
  if (
    (update.filter !== undefined || update.q !== undefined) &&
    update.page === undefined
  ) {
    next.delete("page");
  }
  if (update.page !== undefined) {
    if (update.page <= 1) next.delete("page");
    else next.set("page", String(update.page));
  }
  if (update.customerId !== undefined) {
    if (update.customerId === null) next.delete("customerId");
    else next.set("customerId", update.customerId);
  }
  return next.toString();
}

export function customerSearchFrom(searchParams: URLSearchParams): string {
  return searchParams.get("q")?.trim().slice(0, 120) ?? "";
}

/** Convert a counter-style local phone search to the stored E.164 prefix. */
export function customerApiSearch(value: string): string | undefined {
  const normalized = value.trim().replace(/[\s()-]/gu, "");
  if (normalized.length === 0) return undefined;
  if (/^03\d*$/u.test(normalized)) return `+92${normalized.slice(1)}`;
  if (/^923\d*$/u.test(normalized)) return `+${normalized}`;
  return value.trim();
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
  const email = draft.email.trim();
  if (name.length < 2) errors.name = "Enter the customer's full name.";
  if (name.length > CUSTOMER_CONTRACT_LIMITS.NAME_LENGTH) {
    errors.name = `Name must be ${CUSTOMER_CONTRACT_LIMITS.NAME_LENGTH} characters or less.`;
  }
  if (!normalizePakistanPhone(draft.phone).valid) {
    errors.phone = "Enter a valid Pakistani mobile number.";
  }
  if (
    email.length > 0 &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
      email.length > CUSTOMER_CONTRACT_LIMITS.EMAIL_LENGTH)
  ) {
    errors.email = "Enter a valid email address.";
  }
  if (
    draft.addressLine.trim().length > CUSTOMER_CONTRACT_LIMITS.ADDRESS_LENGTH
  ) {
    errors.addressLine = `Address must be ${CUSTOMER_CONTRACT_LIMITS.ADDRESS_LENGTH} characters or less.`;
  }
  if (draft.notes.trim().length > CUSTOMER_CONTRACT_LIMITS.NOTE_LENGTH) {
    errors.notes = `Notes must be ${CUSTOMER_CONTRACT_LIMITS.NOTE_LENGTH} characters or less.`;
  }
  return errors;
}

function safeMoneySum(values: readonly number[]): number | null {
  const sum = values.reduce((total, value) => total + value, 0);
  return Number.isSafeInteger(sum) ? sum : null;
}

export function customerKpis(
  population: CustomerPage,
  creditPopulation: CustomerPage,
): CustomerKpis {
  const populationComplete =
    population.page === 1 && population.items.length === population.total;
  const creditPopulationComplete =
    creditPopulation.page === 1 &&
    creditPopulation.items.length === creditPopulation.total;
  return {
    totalCustomers: population.total,
    repeatBuyers: populationComplete
      ? population.items.filter((customer) => customer.purchaseCount > 1).length
      : null,
    lifetimeSpendMinor: populationComplete
      ? safeMoneySum(
          population.items.map((customer) => customer.lifetimeSpendMinor),
        )
      : null,
    creditCustomers: creditPopulation.total,
    receivableBalanceMinor: creditPopulationComplete
      ? safeMoneySum(
          creditPopulation.items.map(
            (customer) => customer.receivableBalanceMinor,
          ),
        )
      : null,
    populationComplete,
    creditPopulationComplete,
  };
}

export function customerLocallyFilteredPage(
  population: CustomerPage,
  filter: "repeat" | "consent",
  search: string,
  page: number,
  pageSize: number,
): CustomerVisiblePage | null {
  if (population.page !== 1 || population.items.length !== population.total) {
    return null;
  }
  const needle = search.trim().toLocaleLowerCase("en-PK");
  const matched = population.items.filter((customer) => {
    const matchesFilter =
      filter === "repeat"
        ? customer.purchaseCount > 1
        : customer.marketingConsent === "pending";
    if (!matchesFilter) return false;
    if (needle.length === 0) return true;
    const phone = customer.phone.toLocaleLowerCase("en-PK");
    const localPhone = phone.startsWith("+92") ? `0${phone.slice(3)}` : phone;
    return (
      `${customer.name} ${phone} ${localPhone}`
        .toLocaleLowerCase("en-PK")
        .includes(needle.replace(/[\s()-]/gu, "")) ||
      customer.name.toLocaleLowerCase("en-PK").includes(needle)
    );
  });
  const total = matched.length;
  const totalPages = Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: matched.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}
