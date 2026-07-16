"use client";

import {
  formatMoney,
  toMinor,
  type CustomerDetail,
  type CustomerMarketingConsentStatus,
  type CustomerSummary,
} from "@mobileshop/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
} from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  LockIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import {
  createCustomer,
  setCustomerActive,
  type CustomerListParameters,
} from "@/lib/api/customers";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  customerQueryOptions,
  customersQueryOptions,
} from "@/lib/query/customers-query";
import { queryKeys } from "@/lib/query/keys";
import {
  CUSTOMER_FILTERS,
  customerApiSearch,
  customerCapabilities,
  customerFilterFrom,
  customerInitials,
  customerKpis,
  customerListQuery,
  customerLocallyFilteredPage,
  customerPageFrom,
  customerSearchFrom,
  validateCustomerDraft,
  type CustomerDraft,
  type CustomerFilter,
  type CustomerVisiblePage,
} from "./customer-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-not-allowed disabled:opacity-60";
const PAGE_SIZE = 25;
const AGGREGATE_PAGE_SIZE = 100;

const EMPTY_DRAFT: CustomerDraft = {
  name: "",
  phone: "",
  email: "",
  consent: "granted",
  addressLine: "",
  notes: "",
};

const POPULATION_PARAMETERS: CustomerListParameters = {
  page: 1,
  pageSize: AGGREGATE_PAGE_SIZE,
  active: true,
  sort: "name",
  direction: "asc",
};

const CREDIT_POPULATION_PARAMETERS: CustomerListParameters = {
  ...POPULATION_PARAMETERS,
  hasReceivable: true,
};

function CustomersIcon({ className = "size-5" }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a4 4 0 0 1 3.5 4v1" />
    </svg>
  );
}

function CustomersLoading(): JSX.Element {
  return (
    <div aria-label="Loading customers workspace" className="space-y-4" role="status">
      <span className="sr-only">Loading customers workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-28 animate-pulse rounded-card bg-line-subtle" key={index} />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

export function formatCustomerMoney(valueMinor: number, currency: string): string {
  return formatMoney(toMinor(valueMinor, "customer value"), currency);
}

export function customerPhoneLabel(phone: string): string {
  return phone.startsWith("+92") ? `0${phone.slice(3)}` : phone;
}

export function customerDateLabel(
  value: string | null,
  timezone: string,
): string {
  if (value === null) return "No posted visit";
  try {
    return new Intl.DateTimeFormat("en-PK", {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return "Date unavailable";
  }
}

function consentLabel(status: CustomerMarketingConsentStatus): string {
  switch (status) {
    case "granted":
      return "Yes";
    case "pending":
      return "Pending";
    case "declined":
      return "Declined";
    case "withdrawn":
      return "Withdrawn";
  }
}

function ConsentBadge({ status }: { readonly status: CustomerMarketingConsentStatus }) {
  const granted = status === "granted";
  const pending = status === "pending";
  const classes = granted
    ? "bg-positive-soft text-positive"
    : pending
      ? "bg-warning-soft text-warning"
      : "bg-surface-subtle text-ink-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${classes}`}>
      {granted ? "✓ " : ""}{consentLabel(status)}
    </span>
  );
}

function KpiCard({
  accent = false,
  label,
  meta,
  value,
}: {
  readonly accent?: boolean;
  readonly label: string;
  readonly meta: string;
  readonly value: string;
}): JSX.Element {
  return (
    <article
      className={`rounded-card border bg-surface p-4 shadow-card ${accent ? "border-accent/30" : "border-line"}`}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent ? "text-accent" : "text-ink"}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{meta}</p>
    </article>
  );
}

function CustomerError({
  error,
  retry,
  title,
}: {
  readonly error: ApiError;
  readonly retry: () => void;
  readonly title: string;
}): JSX.Element {
  const description =
    error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT"
      ? "The customer API could not be reached. No records or totals were inferred."
      : error.code === "INVALID_RESPONSE"
        ? "The response failed the customer contract and was not displayed."
        : error.status === 403
          ? "Your current permissions do not allow this customer request."
          : error.message;
  return (
    <div className="rounded-control border border-negative/25 bg-negative-soft p-4 text-sm text-negative" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-xs leading-5">{description}</p>
          {error.requestId === undefined ? null : (
            <p className="mt-1 font-mono text-[0.6875rem]">Ref: {error.requestId}</p>
          )}
          <button
            className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-control border border-negative/30 bg-surface px-3 text-xs font-bold"
            onClick={retry}
            type="button"
          >
            <RefreshIcon className="size-3.5" /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  children,
  error,
  label,
}: {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly label: string;
}): JSX.Element {
  return (
    <label className="block text-xs font-semibold text-ink-subtle">
      {label}
      {children}
      {error === undefined ? null : (
        <span className="mt-1 block text-xs font-medium text-negative">{error}</span>
      )}
    </label>
  );
}

function AddCustomerDrawer({
  onClose,
  onSaved,
}: {
  readonly onClose: () => void;
  readonly onSaved: (customer: CustomerDetail) => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const errors = validateCustomerDraft(draft);
  const mutation = useMutation({
    mutationFn: () =>
      createCustomer({
        name: draft.name,
        phone: draft.phone,
        email: draft.email.trim().length === 0 ? null : draft.email,
        marketingConsent: draft.consent,
        addressLine:
          draft.addressLine.trim().length === 0 ? null : draft.addressLine,
        notes: draft.notes.trim().length === 0 ? null : draft.notes,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.customer(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersRoot });
      onSaved(saved);
    },
  });
  const update = <Key extends keyof CustomerDraft>(
    key: Key,
    value: CustomerDraft[Key],
  ): void => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length === 0) mutation.mutate();
  };
  const mutationError = mutation.isError ? toApiError(mutation.error) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close add customer drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <form
        aria-labelledby="add-customer-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        onSubmit={submit}
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <CustomersIcon />
          </span>
          <div>
            <h2 className="font-bold text-ink" id="add-customer-title">Add customer</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Create the relationship profile and record contact consent.</p>
          </div>
          <button
            aria-label="Close drawer"
            className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {mutationError === null ? null : (
            <div className="rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative" role="alert">
              <p className="font-bold">Customer could not be saved</p>
              <p>{mutationError.message}</p>
              {mutationError.requestId === undefined ? null : <p className="font-mono">Ref: {mutationError.requestId}</p>}
            </div>
          )}
          <Field error={submitted ? errors.name : undefined} label="Full name">
            <input
              autoComplete="name"
              className={controlClass}
              disabled={mutation.isPending}
              onChange={(event) => update("name", event.target.value)}
              placeholder="e.g. Ali Hamza"
              value={draft.name}
            />
          </Field>
          <Field error={submitted ? errors.phone : undefined} label="Phone number">
            <input
              autoComplete="tel"
              className={controlClass}
              disabled={mutation.isPending}
              inputMode="tel"
              onChange={(event) => update("phone", event.target.value)}
              placeholder="03xx-xxxxxxx"
              value={draft.phone}
            />
            <span className="mt-1 block font-normal text-ink-muted">Used to link demand requests and restock alerts.</span>
          </Field>
          <Field error={submitted ? errors.email : undefined} label="Email (optional)">
            <input
              autoComplete="email"
              className={controlClass}
              disabled={mutation.isPending}
              onChange={(event) => update("email", event.target.value)}
              placeholder="customer@example.com"
              type="email"
              value={draft.email}
            />
          </Field>
          <fieldset disabled={mutation.isPending}>
            <legend className="text-xs font-semibold text-ink-subtle">Marketing consent</legend>
            <div className="mt-1.5 inline-flex rounded-control border border-line bg-surface-subtle p-1">
              {(["granted", "pending"] as const).map((value) => (
                <button
                  aria-pressed={draft.consent === value}
                  className={`min-h-8 rounded-[0.4rem] px-4 text-xs font-semibold ${draft.consent === value ? "bg-surface text-accent shadow-sm" : "text-ink-muted"}`}
                  key={value}
                  onClick={() => update("consent", value)}
                  type="button"
                >
                  {value === "granted" ? "Yes" : "Pending"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-muted">Consent controls promotional and restock contact eligibility.</p>
          </fieldset>
          <Field error={submitted ? errors.addressLine : undefined} label="Address (optional)">
            <textarea
              className={`${controlClass} min-h-20 resize-y`}
              disabled={mutation.isPending}
              onChange={(event) => update("addressLine", event.target.value)}
              placeholder="Delivery or account address"
              value={draft.addressLine}
            />
          </Field>
          <Field error={submitted ? errors.notes : undefined} label="Relationship note (optional)">
            <textarea
              className={`${controlClass} min-h-24 resize-y`}
              disabled={mutation.isPending}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Preferences, contact timing or service context…"
              value={draft.notes}
            />
          </Field>
          <div className="flex items-start gap-2.5 rounded-control border border-info/20 bg-info-soft p-3 text-xs leading-5 text-info">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            Recording a customer links verified purchases, receivables, consent and future demand records under one profile.
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" disabled={mutation.isPending} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-55"
            disabled={mutation.isPending}
            type="submit"
          >
            <PlusIcon className="size-4" /> {mutation.isPending ? "Saving…" : "Save customer"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function UnavailableHistory({
  description,
  label,
}: {
  readonly description: string;
  readonly label: string;
}): JSX.Element {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{label}</h3>
        <span className="rounded-full bg-surface-subtle px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Endpoint unavailable</span>
      </div>
      <div className="mt-2 rounded-control border border-dashed border-line bg-surface-subtle p-4 text-center text-xs leading-5 text-ink-muted">
        {description}
      </div>
    </section>
  );
}

function CustomerProfileBody({
  canManage,
  currency,
  customer,
  timezone,
}: {
  readonly canManage: boolean;
  readonly currency: string;
  readonly customer: CustomerDetail;
  readonly timezone: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const transition = useMutation({
    mutationFn: () =>
      setCustomerActive(customer.id, customer.version, !customer.isActive),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.customer(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersRoot });
    },
  });
  const transitionError = transition.isError ? toApiError(transition.error) : null;
  const rows: readonly [string, ReactNode][] = [
    ["Phone", <span className="font-mono" key="phone">{customerPhoneLabel(customer.phone)}</span>],
    ["Consent", <ConsentBadge key="consent" status={customer.marketingConsent} />],
    ["Purchases", `${customer.purchaseCount} ${customer.purchaseCount === 1 ? "order" : "orders"}`],
    ["Lifetime spend", formatCustomerMoney(customer.lifetimeSpendMinor, currency)],
    ["Last visit", customerDateLabel(customer.lastVisitAt, timezone)],
    ["Receivable", customer.receivableBalanceMinor > 0 ? formatCustomerMoney(customer.receivableBalanceMinor, currency) : "No dues"],
  ];

  return (
    <>
      {transitionError === null ? null : (
        <div className="rounded-control border border-negative/25 bg-negative-soft p-3 text-xs text-negative" role="alert">
          <p className="font-bold">Status could not be changed</p>
          <p className="mt-1">{transitionError.message}</p>
        </div>
      )}
      {!customer.isActive ? (
        <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
          This customer is inactive. Existing history remains visible, but the profile is excluded from the active relationship list.
        </div>
      ) : null}
      <section className="overflow-hidden rounded-card border border-line">
        {rows.map(([label, value]) => (
          <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 text-sm last:border-b-0" key={label}>
            <span className="text-ink-muted">{label}</span>
            <span className={`text-right font-semibold ${label === "Receivable" && customer.receivableBalanceMinor > 0 ? "text-negative" : "text-ink-subtle"}`}>{value}</span>
          </div>
        ))}
      </section>

      {customer.receivableBalanceMinor > 0 ? (
        <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Customer credit of <strong>{formatCustomerMoney(customer.receivableBalanceMinor, currency)}</strong> is a <strong>receivable</strong> — money the shop is owed. It stays in Finance under receivables until settled.
          </p>
        </div>
      ) : null}

      <section className="rounded-card border border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink">Contact & profile</h3>
          <span className={`rounded-full px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide ${customer.isActive ? "bg-positive-soft text-positive" : "bg-warning-soft text-warning"}`}>
            {customer.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div><dt className="text-ink-muted">Email</dt><dd className="mt-1 break-words font-semibold text-ink-subtle">{customer.email ?? "Not recorded"}</dd></div>
          <div><dt className="text-ink-muted">Address</dt><dd className="mt-1 font-semibold text-ink-subtle">{customer.addressLine ?? "Not recorded"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-ink-muted">Relationship note</dt><dd className="mt-1 whitespace-pre-wrap font-semibold text-ink-subtle">{customer.notes ?? "No note recorded"}</dd></div>
        </dl>
        {customer.sensitive.availability === "available" ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink"><LockIcon className="size-3.5" /> Restricted references</p>
            <dl className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
              <div><dt className="text-ink-muted">Identity reference</dt><dd className="mt-1 font-mono font-semibold text-ink-subtle">{customer.sensitive.nationalIdentityReference ?? "Not recorded"}</dd></div>
              <div><dt className="text-ink-muted">External reference</dt><dd className="mt-1 font-mono font-semibold text-ink-subtle">{customer.sensitive.externalReference ?? "Not recorded"}</dd></div>
            </dl>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-muted"><LockIcon className="size-3.5" /> Sensitive references are restricted by permission.</p>
        )}
        {canManage ? (
          <button
            className="mt-4 min-h-9 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:opacity-55"
            disabled={transition.isPending}
            onClick={() => transition.mutate()}
            type="button"
          >
            {transition.isPending ? "Updating…" : customer.isActive ? "Deactivate customer" : "Reactivate customer"}
          </button>
        ) : null}
      </section>

      <UnavailableHistory
        description={customer.purchaseCount > 0
          ? `${customer.purchaseCount} posted purchase${customer.purchaseCount === 1 ? " is" : "s are"} included in the verified aggregate above. Line-by-line history needs the customer sales-history endpoint.`
          : "No posted purchases are included in this customer's verified aggregate. Line-by-line history needs the customer sales-history endpoint."}
        label="Purchase history"
      />
      <UnavailableHistory
        description="Demand records cannot be safely joined by phone or name. The customer demand-history endpoint has not been implemented yet."
        label="Demand history"
      />
      <section className="rounded-card border border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink">Follow-up</h3>
          <span className="rounded-full bg-surface-subtle px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Workflow unavailable</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          {customer.marketingConsent === "granted"
            ? "Marketing consent is granted, so this customer is eligible for a staff-created restock or promotional follow-up."
            : `Marketing consent is ${consentLabel(customer.marketingConsent).toLowerCase()}; promotional contact must not be assumed.`}
        </p>
        <p className="mt-2 text-xs leading-5 text-ink-muted">No follow-up task or reminder is shown because the customer task-history endpoint is not available.</p>
      </section>
    </>
  );
}

function CustomerProfileDrawer({
  canCreateDemand,
  canCreateSales,
  canManage,
  currency,
  customerId,
  onClose,
  timezone,
}: {
  readonly canCreateDemand: boolean;
  readonly canCreateSales: boolean;
  readonly canManage: boolean;
  readonly currency: string;
  readonly customerId: string;
  readonly onClose: () => void;
  readonly timezone: string;
}): JSX.Element {
  const detail = useQuery(customerQueryOptions(customerId));
  const customer = detail.data;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close customer profile drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-labelledby="customer-profile-title" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay" role="dialog">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">
            {customer === undefined ? "…" : customerInitials(customer.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-bold text-ink" id="customer-profile-title">{customer?.name ?? "Customer profile"}</h2>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">
              {customer === undefined ? "Loading verified profile…" : `${customerPhoneLabel(customer.phone)} · ${customer.id}`}
            </p>
            {customer === undefined ? null : customer.receivableBalanceMinor > 0 ? (
              <span className="mt-2 inline-flex rounded-full bg-negative-soft px-2 py-1 text-[0.6875rem] font-bold text-negative">{formatCustomerMoney(customer.receivableBalanceMinor, currency)} owed</span>
            ) : (
              <span className="mt-2 inline-flex rounded-full bg-positive-soft px-2 py-1 text-[0.6875rem] font-bold text-positive">✓ No dues</span>
            )}
          </div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button">
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {detail.isPending ? (
            <div aria-label="Loading customer profile" className="space-y-3" role="status">
              <div className="h-56 animate-pulse rounded-card bg-line-subtle" />
              <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
            </div>
          ) : detail.isError || customer === undefined ? (
            <CustomerError error={toApiError(detail.error)} retry={() => void detail.refetch()} title="Customer profile could not be loaded" />
          ) : (
            <CustomerProfileBody canManage={canManage} currency={currency} customer={customer} timezone={timezone} />
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          {canCreateDemand ? (
            <Link className="min-h-10 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" href={`/demand?customerId=${encodeURIComponent(customerId)}`}>Record demand</Link>
          ) : (
            <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle opacity-55" disabled title="demand.create permission required" type="button">Record demand</button>
          )}
          {canCreateSales ? (
            <Link className="min-h-10 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong" href={`/sell?customerId=${encodeURIComponent(customerId)}`}>New sale</Link>
          ) : (
            <button className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled title="sales.create permission required" type="button">New sale</button>
          )}
        </footer>
      </section>
    </div>
  );
}

function CustomerTableSkeleton(): JSX.Element {
  return (
    <tbody aria-label="Loading customer records">
      {Array.from({ length: 5 }, (_, index) => (
        <tr className="border-b border-line last:border-b-0" key={index}>
          {Array.from({ length: 7 }, (_, cell) => (
            <td className="px-4 py-4" key={cell}><div className="h-4 animate-pulse rounded bg-line-subtle" /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function CustomerRows({
  currency,
  items,
  onSelect,
  timezone,
}: {
  readonly currency: string;
  readonly items: readonly CustomerSummary[];
  readonly onSelect: (customerId: string) => void;
  readonly timezone: string;
}): JSX.Element {
  return (
    <tbody className="divide-y divide-line">
      {items.map((customer) => (
        <tr className="transition-colors hover:bg-surface-subtle" key={customer.id}>
          <td className="px-4 py-3.5">
            <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => onSelect(customer.id)} type="button">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{customerInitials(customer.name)}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-ink">{customer.name}</span>
                <span className="block truncate font-mono text-[0.625rem] text-ink-muted">{customer.id}</span>
              </span>
            </button>
          </td>
          <td className="px-4 py-3.5 font-mono text-xs text-ink-subtle">{customerPhoneLabel(customer.phone)}</td>
          <td className="px-4 py-3.5 text-right text-sm text-ink-subtle">{customer.purchaseCount}</td>
          <td className="px-4 py-3.5 text-right text-sm font-bold text-ink">{formatCustomerMoney(customer.lifetimeSpendMinor, currency)}</td>
          <td className="px-4 py-3.5 text-xs text-ink-muted">{customerDateLabel(customer.lastVisitAt, timezone)}</td>
          <td className={`px-4 py-3.5 text-right text-sm font-bold ${customer.receivableBalanceMinor > 0 ? "text-negative" : "text-ink-muted"}`}>
            {customer.receivableBalanceMinor > 0 ? formatCustomerMoney(customer.receivableBalanceMinor, currency) : "—"}
          </td>
          <td className="px-4 py-3.5"><ConsentBadge status={customer.marketingConsent} /></td>
        </tr>
      ))}
    </tbody>
  );
}

export function CustomersWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  const capabilities = customerCapabilities(auth.data?.permissions);
  const urlParameters = new URLSearchParams(searchParams.toString());
  const filter = customerFilterFrom(urlParameters);
  const search = customerSearchFrom(urlParameters);
  const page = customerPageFrom(urlParameters);
  const selectedCustomerId = urlParameters.get("customerId");
  const isLocalFilter = filter === "repeat" || filter === "consent";
  const apiSearch = customerApiSearch(search);
  const listParameters: CustomerListParameters = {
    page,
    pageSize: PAGE_SIZE,
    active: true,
    sort: "name",
    direction: "asc",
    ...(filter === "credit" ? { hasReceivable: true } : {}),
    ...(apiSearch === undefined ? {} : { q: apiSearch }),
  };
  const population = useQuery(
    customersQueryOptions(POPULATION_PARAMETERS, capabilities.canView),
  );
  const creditPopulation = useQuery(
    customersQueryOptions(CREDIT_POPULATION_PARAMETERS, capabilities.canView),
  );
  const serverList = useQuery(
    customersQueryOptions(
      listParameters,
      capabilities.canView && !isLocalFilter,
    ),
  );

  const localPage = useMemo(
    () =>
      population.data === undefined || !isLocalFilter
        ? null
        : customerLocallyFilteredPage(
            population.data,
            filter,
            search,
            page,
            PAGE_SIZE,
          ),
    [filter, isLocalFilter, page, population.data, search],
  );
  const visiblePage: CustomerVisiblePage | undefined = isLocalFilter
    ? localPage ?? undefined
    : serverList.data;
  const listPending = isLocalFilter ? population.isPending : serverList.isPending;
  const listError = isLocalFilter ? population.error : serverList.error;
  const unsupportedLocalFilter =
    isLocalFilter && population.data !== undefined && localPage === null;

  const kpis =
    population.data === undefined || creditPopulation.data === undefined
      ? null
      : customerKpis(population.data, creditPopulation.data);
  const consentPending =
    population.data !== undefined && kpis?.populationComplete === true
      ? population.data.items.filter(
          (customer) => customer.marketingConsent === "pending",
        ).length
      : null;
  const currency = auth.data?.organization.currency ?? "PKR";
  const timezone = auth.data?.organization.timezone ?? "Asia/Karachi";

  const replace = useCallback(
    (updates: Parameters<typeof customerListQuery>[1]): void => {
      const query = customerListQuery(
        new URLSearchParams(searchParams.toString()),
        updates,
      );
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
    },
    [pathname, router, searchParams],
  );
  const navigateFilter = (nextFilter: CustomerFilter, q = search): void => {
    replace({ filter: nextFilter, q });
  };
  const selectCustomer = (customerId: string): void => {
    replace({ customerId });
  };

  if (auth.data === undefined && auth.isPending) return <CustomersLoading />;
  if (auth.isError || auth.data === undefined) {
    return (
      <CatalogForbiddenState
        description="The current session could not be checked, so no customer data or sensitive fields were requested. Restore the API connection and retry."
        title="Customer access could not be verified"
      />
    );
  }
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing customer relationships requires customers.view. No customer request was sent."
        title="Customer access required"
      />
    );
  }

  const filterCounts: Readonly<Record<CustomerFilter, number | null>> = {
    all: population.data?.total ?? null,
    credit: creditPopulation.data?.total ?? null,
    repeat: kpis?.repeatBuyers ?? null,
    consent: consentPending,
  };
  const subtitle =
    kpis === null
      ? "Customer relationships — purchases, receivables, demand and consent."
      : `${kpis.totalCustomers} active customers · ${kpis.repeatBuyers ?? "—"} repeat buyers · ${kpis.creditCustomers} with outstanding credit`;

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
              <CustomersIcon />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">Customers · Relationships</p>
              <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">Customers</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1.5 text-xs font-bold text-positive">
              <ShieldCheckIcon className="size-4" /> Live customer records
            </span>
            {capabilities.canManage ? (
              <button className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong" onClick={() => setAddOpen(true)} type="button">
                <PlusIcon className="size-4" /> Add customer
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total customers" meta={kpis === null ? "Loading active relationships…" : `${kpis.totalCustomers} active relationships`} value={kpis === null ? "—" : String(kpis.totalCustomers)} />
        <KpiCard
          accent
          label="With outstanding credit"
          meta={kpis === null
            ? "Loading Finance receivables…"
            : kpis.receivableBalanceMinor === null
              ? "Count is exact · full balance aggregate unavailable"
              : `${formatCustomerMoney(kpis.receivableBalanceMinor, currency)} total receivable`}
          value={kpis === null ? "—" : String(kpis.creditCustomers)}
        />
        <KpiCard label="Repeat buyers" meta={kpis?.repeatBuyers === null || kpis === null ? "Full-population aggregate unavailable" : "Bought more than once"} value={kpis?.repeatBuyers === null || kpis === null ? "—" : String(kpis.repeatBuyers)} />
        <KpiCard
          label="Lifetime spend"
          meta={kpis?.lifetimeSpendMinor === null || kpis === null ? "Full-population aggregate unavailable" : `Across ${kpis.totalCustomers} active customers`}
          value={kpis?.lifetimeSpendMinor === null || kpis === null ? "—" : formatCustomerMoney(kpis.lifetimeSpendMinor, currency)}
        />
      </div>

      {population.isError || creditPopulation.isError ? (
        <CustomerError
          error={toApiError(population.error ?? creditPopulation.error)}
          retry={() => void Promise.all([population.refetch(), creditPopulation.refetch()])}
          title="Customer totals could not be loaded"
        />
      ) : kpis !== null && (!kpis.populationComplete || !kpis.creditPopulationComplete) ? (
        <div className="flex items-start gap-3 rounded-card border border-info/25 bg-info-soft px-4 py-3.5 text-sm text-info">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
          <p className="leading-5">Counts come from the server and remain exact. Spend, repeat-buyer and receivable sums are deliberately withheld when the full active population exceeds the current aggregate window.</p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-bold text-ink">All customers</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Select a customer to open the full relationship profile.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              aria-label="Search customers"
              className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
              onChange={(event) => navigateFilter(filter, event.target.value)}
              placeholder="Search name or phone…"
              value={search}
            />
          </div>
        </div>

        <div className="overflow-x-auto border-b border-line bg-surface-subtle px-3 py-2.5">
          <div className="flex min-w-max gap-1" role="group" aria-label="Customer filters">
            {CUSTOMER_FILTERS.map((item) => (
              <button
                aria-pressed={filter === item.id}
                className={`min-h-8 rounded-control px-3 text-xs font-semibold ${filter === item.id ? "bg-accent text-white" : "text-ink-muted hover:bg-surface hover:text-ink"}`}
                key={item.id}
                onClick={() => navigateFilter(item.id)}
                type="button"
              >
                {item.label} <span className="opacity-70">{filterCounts[item.id] ?? "—"}</span>
              </button>
            ))}
          </div>
        </div>

        {unsupportedLocalFilter ? (
          <div className="border-b border-warning/25 bg-warning-soft px-4 py-3 text-xs leading-5 text-warning" role="status">
            This filter needs a server-side aggregate once there are more than {AGGREGATE_PAGE_SIZE} active customers. No partial result is being presented as complete.
          </div>
        ) : null}
        {listError === null ? null : (
          <div className="p-4">
            <CustomerError error={toApiError(listError)} retry={() => void (isLocalFilter ? population.refetch() : serverList.refetch())} title="Customer list could not be loaded" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Purchases</th>
                <th className="px-4 py-3 text-right">Lifetime spend</th>
                <th className="px-4 py-3">Last visit</th>
                <th className="px-4 py-3 text-right">Receivable</th>
                <th className="px-4 py-3">Consent</th>
              </tr>
            </thead>
            {listPending ? (
              <CustomerTableSkeleton />
            ) : visiblePage !== undefined && visiblePage.items.length > 0 ? (
              <CustomerRows currency={currency} items={visiblePage.items} onSelect={selectCustomer} timezone={timezone} />
            ) : (
              <tbody>
                <tr>
                  <td className="px-5 py-12 text-center" colSpan={7}>
                    <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><CustomersIcon className="size-6" /></span>
                    <h3 className="mt-3 font-bold text-ink">{search.length > 0 || filter !== "all" ? "No matching customers" : "No active customers yet"}</h3>
                    <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-ink-muted">
                      {unsupportedLocalFilter
                        ? "This result is unavailable until the filter is supported by the server."
                        : search.length > 0 || filter !== "all"
                          ? "Try a different name, phone number or relationship filter."
                          : "Add the first customer to begin linking purchases, receivables and demand."}
                    </p>
                    {search.length > 0 || filter !== "all" ? (
                      <button className="mt-4 min-h-9 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => replace({ filter: "all", q: "" })} type="button">Clear filters</button>
                    ) : capabilities.canManage ? (
                      <button className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setAddOpen(true)} type="button"><PlusIcon className="size-4" /> Add customer</button>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>

        {visiblePage === undefined ? null : (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-4 py-3 text-xs text-ink-muted sm:px-5">
            <span>{visiblePage.total} {visiblePage.total === 1 ? "customer" : "customers"} · Page {visiblePage.totalPages === 0 ? 1 : visiblePage.page} of {Math.max(visiblePage.totalPages, 1)}</span>
            <div className="flex gap-2">
              <button className="min-h-8 rounded-control border border-line bg-surface px-3 font-semibold text-ink-subtle disabled:opacity-45" disabled={visiblePage.page <= 1} onClick={() => replace({ page: visiblePage.page - 1 })} type="button">Previous</button>
              <button className="min-h-8 rounded-control border border-line bg-surface px-3 font-semibold text-ink-subtle disabled:opacity-45" disabled={visiblePage.totalPages === 0 || visiblePage.page >= visiblePage.totalPages} onClick={() => replace({ page: visiblePage.page + 1 })} type="button">Next</button>
            </div>
          </footer>
        )}
      </section>

      {addOpen ? (
        <AddCustomerDrawer
          onClose={() => setAddOpen(false)}
          onSaved={(saved) => {
            setAddOpen(false);
            selectCustomer(saved.id);
          }}
        />
      ) : null}
      {selectedCustomerId === null ? null : (
        <CustomerProfileDrawer
          canCreateDemand={capabilities.canCreateDemand}
          canCreateSales={capabilities.canCreateSales}
          canManage={capabilities.canManage}
          currency={currency}
          customerId={selectedCustomerId}
          onClose={() => replace({ customerId: null })}
          timezone={timezone}
        />
      )}
    </div>
  );
}
