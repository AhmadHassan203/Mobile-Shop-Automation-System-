"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type JSX, type ReactNode } from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  CUSTOMER_FILTERS,
  customerCapabilities,
  customerFilterFrom,
  customerListQuery,
  customerSearchFrom,
  validateCustomerDraft,
  type CustomerDraft,
  type CustomerFilter,
} from "./customer-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-not-allowed disabled:opacity-60";

const EMPTY_DRAFT: CustomerDraft = {
  name: "",
  phone: "",
  consent: "yes",
  notes: "",
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

function ApiPendingNotice(): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-3.5 text-sm text-warning">
      <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-bold">Customer API is the remaining dependency</p>
        <p className="mt-0.5 leading-5">
          The complete customer workflow is visible for review. No placeholder
          people, totals, spending, credit or consent records are being shown,
          and save stays disabled until the real customer endpoint is available.
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  accent = false,
  label,
  meta,
}: {
  readonly accent?: boolean;
  readonly label: string;
  readonly meta: string;
}): JSX.Element {
  return (
    <article
      className={`rounded-card border bg-surface p-4 shadow-card ${accent ? "border-accent/30" : "border-line"}`}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent ? "text-accent" : "text-ink"}`}>—</p>
      <p className="mt-1 text-xs text-ink-muted">{meta}</p>
    </article>
  );
}

function CustomerProfileBlueprint({
  canCreateDemand,
  canCreateSales,
  canViewSensitive,
}: {
  readonly canCreateDemand: boolean;
  readonly canCreateSales: boolean;
  readonly canViewSensitive: boolean;
}): JSX.Element {
  return (
    <div className="grid gap-3 border-t border-line bg-surface-subtle px-4 py-4 sm:grid-cols-3 sm:px-5">
      <p className="text-xs leading-5 text-ink-muted">
        <strong className="block text-ink">Profile drawer</strong>
        Identity, phone, consent, visits and receivable status.
      </p>
      <p className="text-xs leading-5 text-ink-muted">
        <strong className="block text-ink">Linked history</strong>
        Purchase and demand timelines without fabricated joins.
      </p>
      <p className="text-xs leading-5 text-ink-muted">
        <strong className="block text-ink">Profile actions</strong>
        {canCreateDemand ? "Record demand" : "Demand action permission required"}
        {" · "}
        {canCreateSales ? "New sale" : "Sales action permission required"}
        {canViewSensitive ? " · sensitive fields permitted" : " · sensitive fields masked"}
      </p>
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

function AddCustomerDrawer({ onClose }: { readonly onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);
  const errors = validateCustomerDraft(draft);
  const update = <Key extends keyof CustomerDraft>(
    key: Key,
    value: CustomerDraft[Key],
  ): void => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close add customer drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <section
        aria-labelledby="add-customer-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <CustomersIcon />
          </span>
          <div>
            <h2 className="font-bold text-ink" id="add-customer-title">Add customer</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Prepare the relationship profile and contact consent.</p>
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
          <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            Customer persistence is not connected yet. You can review and fill this form, but no data will leave the browser.
          </div>
          <Field error={draft.name.length > 0 ? errors.name : undefined} label="Full name">
            <input
              autoComplete="name"
              className={controlClass}
              onChange={(event) => update("name", event.target.value)}
              placeholder="e.g. Ali Hamza"
              value={draft.name}
            />
          </Field>
          <Field error={draft.phone.length > 0 ? errors.phone : undefined} label="Phone number">
            <input
              autoComplete="tel"
              className={controlClass}
              inputMode="tel"
              onChange={(event) => update("phone", event.target.value)}
              placeholder="03xx-xxxxxxx"
              value={draft.phone}
            />
            <span className="mt-1 block font-normal text-ink-muted">Used to link demand requests and send restock alerts.</span>
          </Field>
          <fieldset>
            <legend className="text-xs font-semibold text-ink-subtle">Marketing consent</legend>
            <div className="mt-1.5 inline-flex rounded-control border border-line bg-surface-subtle p-1">
              {(["yes", "pending"] as const).map((value) => (
                <button
                  aria-pressed={draft.consent === value}
                  className={`min-h-8 rounded-[0.4rem] px-4 text-xs font-semibold ${draft.consent === value ? "bg-surface text-accent shadow-sm" : "text-ink-muted"}`}
                  key={value}
                  onClick={() => update("consent", value)}
                  type="button"
                >
                  {value === "yes" ? "Yes" : "Pending"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-muted">Consent controls promotional and restock contact eligibility.</p>
          </fieldset>
          <Field error={draft.notes.length > 0 ? errors.notes : undefined} label="Relationship note (optional)">
            <textarea
              className={`${controlClass} min-h-24 resize-y`}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Preferences, contact timing or service context…"
              value={draft.notes}
            />
          </Field>
          <div className="flex items-start gap-2.5 rounded-control border border-info/20 bg-info-soft p-3 text-xs leading-5 text-info">
            <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
            Recording a customer will connect purchases, receivables, consent and unmet demand in one profile when the API is available.
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55"
            disabled
            title="Customer API is not implemented yet"
            type="button"
          >
            <PlusIcon className="size-4" /> Save customer · API pending
          </button>
        </footer>
      </section>
    </div>
  );
}

function CustomerProfileDrawer({
  canCreateDemand,
  canCreateSales,
  canViewSensitive,
  onClose,
}: {
  readonly canCreateDemand: boolean;
  readonly canCreateSales: boolean;
  readonly canViewSensitive: boolean;
  readonly onClose: () => void;
}): JSX.Element {
  const pendingValue = canViewSensitive ? "API pending" : "Restricted";
  const rows = [
    ["Phone", pendingValue],
    ["Consent", pendingValue],
    ["Purchases", "API pending"],
    ["Lifetime spend", "API pending"],
    ["Last visit", "API pending"],
    ["Receivable", pendingValue],
  ] as const;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close customer profile drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-labelledby="customer-profile-title" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay" role="dialog">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">—</span>
          <div>
            <h2 className="font-bold text-ink" id="customer-profile-title">Customer profile</h2>
            <p className="mt-0.5 text-xs text-ink-muted">No verified customer selected · API pending</p>
          </div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button">
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="overflow-hidden rounded-card border border-line">
            {rows.map(([label, value]) => (
              <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 text-sm last:border-b-0" key={label}>
                <span className="text-ink-muted">{label}</span>
                <span className="font-semibold text-ink-subtle">{value}</span>
              </div>
            ))}
          </section>
          <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            Outstanding customer credit will be identified as a Finance receivable. No amount is shown without verified ledger data.
          </div>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-ink">Purchase history</h3>
              <span className="text-xs text-ink-muted">Finance link pending</span>
            </div>
            <div className="mt-2 rounded-control border border-dashed border-line p-4 text-center text-xs leading-5 text-ink-muted">Posted sales linked to this customer will appear here.</div>
          </section>
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-ink">Demand history</h3>
              <span className="text-xs text-ink-muted">Demand API pending</span>
            </div>
            <div className="mt-2 rounded-control border border-dashed border-line p-4 text-center text-xs leading-5 text-ink-muted">Matched, available and unmet requests will appear here without fabricated joins.</div>
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle opacity-55" disabled title={canCreateDemand ? "Select a verified customer first" : "demand.create permission required"} type="button">Record demand</button>
          <button className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled title={canCreateSales ? "Select a verified customer first" : "sales.create permission required"} type="button">New sale</button>
        </footer>
      </section>
    </div>
  );
}

export function CustomersWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (auth.data === undefined && auth.isPending) return <CustomersLoading />;
  if (auth.isError || auth.data === undefined) {
    return (
      <CatalogForbiddenState
        description="The current session could not be checked, so no customer data or sensitive fields were requested. Restore the API connection and retry."
        title="Customer access could not be verified"
      />
    );
  }

  const capabilities = customerCapabilities(auth.data.permissions);
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing customer relationships requires customers.view. No customer request was sent."
        title="Customer access required"
      />
    );
  }

  const filter = customerFilterFrom(new URLSearchParams(searchParams.toString()));
  const search = customerSearchFrom(new URLSearchParams(searchParams.toString()));
  const navigate = (nextFilter: CustomerFilter, q = search): void => {
    const query = customerListQuery(new URLSearchParams(searchParams.toString()), {
      filter: nextFilter,
      q,
    });
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

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
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">Customer relationships — purchases, receivables, demand and consent.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning">
              <ShieldCheckIcon className="size-4" /> UI ready · API pending
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
        <KpiCard label="Total customers" meta="Awaiting customer API" />
        <KpiCard accent label="With outstanding credit" meta="Receivable total will come from Finance" />
        <KpiCard label="Repeat buyers" meta="Purchase-history aggregation pending" />
        <KpiCard label="Lifetime spend" meta="No unverified revenue shown" />
      </div>

      <ApiPendingNotice />

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-bold text-ink">All customers</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Rows will open a full relationship profile.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              aria-label="Search customers"
              className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
              onChange={(event) => navigate(filter, event.target.value)}
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
                onClick={() => navigate(item.id)}
                type="button"
              >
                {item.label} <span className="opacity-70">—</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full border-collapse text-left">
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
            <tbody>
              <tr>
                <td className="px-5 py-12 text-center" colSpan={7}>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><CustomersIcon className="size-6" /></span>
                  <h3 className="mt-3 font-bold text-ink">Customer records are not connected yet</h3>
                  <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-ink-muted">
                    {search.length > 0 || filter !== "all"
                      ? "Search and filter controls are ready, but cannot return records until the customer API is implemented."
                      : "The profile table will show verified customer, purchase, receivable and consent data once its API is implemented."}
                  </p>
                  {capabilities.canManage ? (
                    <button className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setAddOpen(true)} type="button">
                      <PlusIcon className="size-4" /> Review add-customer form
                    </button>
                  ) : null}
                  <button className="ml-2 mt-4 inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setProfileOpen(true)} type="button">
                    Review profile drawer
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CustomerProfileBlueprint
          canCreateDemand={capabilities.canCreateDemand}
          canCreateSales={capabilities.canCreateSales}
          canViewSensitive={capabilities.canViewSensitive}
        />
      </section>

      {addOpen ? <AddCustomerDrawer onClose={() => setAddOpen(false)} /> : null}
      {profileOpen ? (
        <CustomerProfileDrawer
          canCreateDemand={capabilities.canCreateDemand}
          canCreateSales={capabilities.canCreateSales}
          canViewSensitive={capabilities.canViewSensitive}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}
    </div>
  );
}
