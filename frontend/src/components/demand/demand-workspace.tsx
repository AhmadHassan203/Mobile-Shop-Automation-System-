"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type JSX, type ReactNode } from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CloseIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  DEMAND_FILTERS,
  demandCapabilities,
  demandFilterFrom,
  demandListQuery,
  validateDemandDraft,
  type DemandDraft,
} from "./demand-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-not-allowed disabled:opacity-60";

const EMPTY_DRAFT: DemandDraft = {
  request: "",
  variant: "",
  quantity: "1",
  budget: "",
  phone: "",
  followUp: "",
  note: "",
};

function DemandIcon({ className = "size-5" }: { readonly className?: string }): JSX.Element {
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
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4.2A2.5 2.5 0 0 1 4 13.5v-8Z" />
      <path d="M8 8h8M8 11.5h5" />
    </svg>
  );
}

function DemandLoading(): JSX.Element {
  return (
    <div aria-label="Loading customer demand workspace" className="space-y-4" role="status">
      <span className="sr-only">Loading customer demand workspace</span>
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

function KpiCard({
  emphasis,
  label,
  meta,
}: {
  readonly emphasis?: "accent" | "negative" | "positive";
  readonly label: string;
  readonly meta: string;
}): JSX.Element {
  const valueColor =
    emphasis === "negative"
      ? "text-negative"
      : emphasis === "positive"
        ? "text-positive"
        : emphasis === "accent"
          ? "text-accent"
          : "text-ink";
  return (
    <article className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueColor}`}>—</p>
      <p className="mt-1 text-xs text-ink-muted">{meta}</p>
    </article>
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

function SegmentedControl<Value extends string>({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: Value) => void;
  readonly options: readonly { readonly label: string; readonly value: Value }[];
  readonly value: Value;
}): JSX.Element {
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-ink-subtle">{label}</legend>
      <div className="mt-1.5 flex w-full flex-wrap rounded-control border border-line bg-surface-subtle p-1">
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={`min-h-8 flex-1 rounded-[0.4rem] px-3 text-xs font-semibold ${value === option.value ? "bg-surface text-accent shadow-sm" : "text-ink-muted hover:text-ink"}`}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CaptureDemandDrawer({
  canViewCatalog,
  canViewCustomers,
  canViewInventory,
  onClose,
}: {
  readonly canViewCatalog: boolean;
  readonly canViewCustomers: boolean;
  readonly canViewInventory: boolean;
  readonly onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<DemandDraft>(EMPTY_DRAFT);
  const [pta, setPta] = useState<"pta" | "non-pta" | "either">("pta");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [channel, setChannel] = useState<"walk-in" | "phone" | "whatsapp" | "referral">("walk-in");
  const [consent, setConsent] = useState(true);
  const errors = validateDemandDraft(draft);
  const update = <Key extends keyof DemandDraft>(
    key: Key,
    value: DemandDraft[Key],
  ): void => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close record demand drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <section
        aria-labelledby="capture-demand-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-2xl flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><DemandIcon /></span>
          <div>
            <h2 className="font-bold text-ink" id="capture-demand-title">Record customer demand</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Capture exactly what could not be fulfilled today.</p>
          </div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button">
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            Demand persistence is not connected yet. This draft remains local and cannot affect the buying plan.
          </div>

          <Field label="Product — match from catalog">
            <select className={controlClass} disabled value="pending">
              <option value="pending">
                {canViewCatalog ? "Catalog matching · API integration pending" : "Catalog access required for matching"}
              </option>
            </select>
            <span className="mt-1 block font-normal text-ink-muted">Matching a real catalog variant is what will make demand useful to the reorder engine.</span>
          </Field>

          <Field error={draft.request.length > 0 ? errors.request : undefined} label="…or type what the customer asked for">
            <input className={controlClass} onChange={(event) => update("request", event.target.value)} placeholder="e.g. iPhone 16 Pro 256 (any colour)" value={draft.request} />
          </Field>

          <div>
            <p className="text-xs font-semibold text-ink-subtle">Availability right now</p>
            <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${canViewInventory ? "bg-info-soft text-info" : "bg-warning-soft text-warning"}`}>
              {canViewInventory ? "Pick a verified catalog item to check stock · integration pending" : "Inventory access required for stock check"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Variant / condition">
              <input className={controlClass} onChange={(event) => update("variant", event.target.value)} placeholder="256 GB · Green · New" value={draft.variant} />
            </Field>
            <Field error={errors.quantity} label="Quantity">
              <input className={controlClass} inputMode="numeric" min={1} onChange={(event) => update("quantity", event.target.value)} type="number" value={draft.quantity} />
            </Field>
          </div>

          <Field label="Customer budget">
            <input className={controlClass} onChange={(event) => update("budget", event.target.value)} placeholder="e.g. 40k–46k" value={draft.budget} />
          </Field>

          <SegmentedControl
            label="PTA preference"
            onChange={setPta}
            options={[
              { label: "PTA only", value: "pta" },
              { label: "Non-PTA okay", value: "non-pta" },
              { label: "No preference", value: "either" },
            ]}
            value={pta}
          />
          <SegmentedControl
            label="Urgency"
            onChange={setUrgency}
            options={[
              { label: "Low", value: "low" },
              { label: "Medium", value: "medium" },
              { label: "High", value: "high" },
            ]}
            value={urgency}
          />
          <SegmentedControl
            label="Request channel"
            onChange={setChannel}
            options={[
              { label: "Walk-in", value: "walk-in" },
              { label: "Phone", value: "phone" },
              { label: "WhatsApp", value: "whatsapp" },
              { label: "Referral", value: "referral" },
            ]}
            value={channel}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={draft.phone.length > 0 ? errors.phone : undefined} label="Customer phone (optional)">
              <input className={controlClass} disabled={!canViewCustomers} inputMode="tel" onChange={(event) => update("phone", event.target.value)} placeholder={canViewCustomers ? "03xx-xxxxxxx" : "Customer access required"} value={draft.phone} />
            </Field>
            <Field error={draft.followUp.length > 0 ? errors.followUp : undefined} label="Follow-up date">
              <input className={controlClass} onChange={(event) => update("followUp", event.target.value)} type="date" value={draft.followUp} />
            </Field>
          </div>

          <Field error={draft.note.length > 0 ? errors.note : undefined} label="Note">
            <textarea className={`${controlClass} min-h-24 resize-y`} onChange={(event) => update("note", event.target.value)} placeholder="Colour preference, timing, price objection…" value={draft.note} />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-subtle">
            <input checked={consent} className="mt-0.5 size-4 accent-[var(--accent)]" onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
            Customer consents to be contacted when stock arrives
          </label>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onClose} type="button">Cancel</button>
          <button className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled title="Demand API is not implemented yet" type="button">
            <PlusIcon className="size-4" /> Record demand · API pending
          </button>
        </footer>
      </section>
    </div>
  );
}

function DemandDetailBlueprint({ canManage }: { readonly canManage: boolean }): JSX.Element {
  return (
    <div className="grid gap-3 border-t border-line bg-surface-subtle px-4 py-4 sm:grid-cols-3 sm:px-5">
      <p className="text-xs leading-5 text-ink-muted">
        <strong className="block text-ink">Request detail drawer</strong>
        Product match, budget, PTA, quantity, customer, consent and note.
      </p>
      <p className="text-xs leading-5 text-ink-muted">
        <strong className="block text-ink">Stockout intelligence</strong>
        Similar requests and verified in-stock alternatives will be derived from APIs.
      </p>
      <p className="text-xs leading-5 text-ink-muted">
        <strong className="block text-ink">Follow-through</strong>
        {canManage ? "Reservation, quotation and follow-up actions permitted." : "demand.manage required for lifecycle actions."}
      </p>
    </div>
  );
}

function DemandDetailDrawer({
  canManage,
  onClose,
}: {
  readonly canManage: boolean;
  readonly onClose: () => void;
}): JSX.Element {
  const rows = [
    ["Customer", "API pending"],
    ["Quantity", "API pending"],
    ["Budget", "API pending"],
    ["PTA preference", "API pending"],
    ["Follow-up", "API pending"],
    ["Contact consent", "API pending"],
  ] as const;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close demand detail drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-labelledby="demand-detail-title" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay" role="dialog">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><DemandIcon /></span>
          <div>
            <h2 className="font-bold text-ink" id="demand-detail-title">Demand request · API pending</h2>
            <p className="mt-0.5 text-xs text-ink-muted">No verified request selected</p>
          </div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button"><CloseIcon className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-ink-muted">Urgency pending</span>
            <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">Outcome pending</span>
            <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-semibold text-info">Channel pending</span>
          </div>
          <section className="rounded-card border border-line p-4">
            <p className="text-xs text-ink-muted">Requested product</p>
            <p className="mt-1 font-bold text-ink">Catalog or free-text match pending</p>
            <p className="mt-1 font-mono text-xs text-ink-muted">Stock availability will be verified from Inventory</p>
          </section>
          <section className="overflow-hidden rounded-card border border-line">
            {rows.map(([label, value]) => (
              <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 text-sm last:border-b-0" key={label}>
                <span className="text-ink-muted">{label}</span>
                <span className="font-semibold text-ink-subtle">{value}</span>
              </div>
            ))}
          </section>
          <section>
            <h3 className="text-sm font-bold text-ink">Note</h3>
            <div className="mt-2 rounded-control border border-dashed border-line p-4 text-xs text-ink-muted">Customer preferences and objections will appear here.</div>
          </section>
          <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            Unavailable matched requests will be counted as qualified demand. Similar-request counts and reorder impact will never be estimated in the browser.
          </div>
          <section>
            <h3 className="text-sm font-bold text-ink">In-stock alternatives</h3>
            <div className="mt-2 rounded-control border border-dashed border-line p-4 text-center text-xs leading-5 text-ink-muted">Verified alternatives, SKU, price and available quantity will load from Catalog, Pricing and Inventory.</div>
          </section>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled title={canManage ? "Select a verified request first" : "demand.manage permission required"} type="button">Create reservation</button>
            <button className="min-h-10 rounded-control border border-line px-4 text-sm font-semibold text-ink-subtle opacity-55" disabled title={canManage ? "Select a verified request first" : "demand.manage permission required"} type="button">Send quotation</button>
            <button className="min-h-10 rounded-control border border-line px-4 text-sm font-semibold text-ink-subtle opacity-55" disabled title={canManage ? "Select a verified request first" : "demand.manage permission required"} type="button">Set follow-up</button>
            <button className="min-h-10 rounded-control border border-line px-4 text-sm font-semibold text-ink-subtle opacity-55" disabled title="A verified available request is required" type="button">Sell now</button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function DemandWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  if (auth.data === undefined && auth.isPending) return <DemandLoading />;
  if (auth.isError || auth.data === undefined) {
    return (
      <CatalogForbiddenState
        description="The current session could not be checked, so no demand or customer contact data was requested. Restore the API connection and retry."
        title="Demand access could not be verified"
      />
    );
  }

  const capabilities = demandCapabilities(auth.data.permissions);
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing customer demand requires demand.view. No demand request was sent."
        title="Demand access required"
      />
    );
  }

  const filter = demandFilterFrom(new URLSearchParams(searchParams.toString()));
  const setFilter = (nextFilter: (typeof DEMAND_FILTERS)[number]["id"]): void => {
    const query = demandListQuery(new URLSearchParams(searchParams.toString()), nextFilter);
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent"><DemandIcon /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">Customers · Demand intelligence</p>
              <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">Customer Demand &amp; Missed Sales</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">Every request you could not fill today — captured so it drives what you buy next.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink-subtle no-underline hover:bg-surface-subtle" href="/intelligence">
              View buying plan →
            </Link>
            {capabilities.canCreate ? (
              <button className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong" onClick={() => setCaptureOpen(true)} type="button">
                <PlusIcon className="size-4" /> Record demand
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard emphasis="accent" label="Total requests" meta="Awaiting demand API" />
        <KpiCard emphasis="negative" label="Unavailable · missed" meta="Qualified demand pending" />
        <KpiCard emphasis="positive" label="Reserved / quotation" meta="Conversion pipeline pending" />
        <KpiCard label="Follow-ups due" meta="Task integration pending" />
      </div>

      <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-3.5 text-sm text-warning">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">Qualified demand will feed the reorder engine</p>
          <p className="mt-0.5 leading-5">Unavailable requests must be persisted and matched to real catalog and stock records before they can influence buying recommendations. No placeholder counts are being sent to Intelligence.</p>
        </div>
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-warning sm:inline-flex">
          <ShieldCheckIcon className="size-4" /> UI ready · API pending
        </span>
      </div>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-bold text-ink">Requests</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Verified request count will appear here.</p>
          </div>
          <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-ink-muted">— of — requests</span>
        </div>
        <div className="overflow-x-auto border-b border-line bg-surface-subtle px-3 py-2.5">
          <div className="flex min-w-max gap-1" role="group" aria-label="Demand outcome filters">
            {DEMAND_FILTERS.map((item) => (
              <button
                aria-pressed={filter === item.id}
                className={`min-h-8 rounded-control px-3 text-xs font-semibold ${filter === item.id ? "bg-accent text-white" : "text-ink-muted hover:bg-surface hover:text-ink"}`}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label} <span className="opacity-70">—</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full border-collapse text-left">
            <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Logged</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3">Urgency</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-5 py-12 text-center" colSpan={8}>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><DemandIcon className="size-6" /></span>
                  <h3 className="mt-3 font-bold text-ink">No verified requests available</h3>
                  <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-ink-muted">
                    {filter === "all"
                      ? "The request ledger, outcomes and follow-ups will load from the demand API when that module is implemented."
                      : `The ${DEMAND_FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} filter is ready, but verified records require the demand API.`}
                  </p>
                  {capabilities.canCreate ? (
                    <button className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setCaptureOpen(true)} type="button">
                      <PlusIcon className="size-4" /> Review demand capture
                    </button>
                  ) : null}
                  <button className="ml-2 mt-4 inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setDetailOpen(true)} type="button">
                    Review detail drawer
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <DemandDetailBlueprint canManage={capabilities.canManage} />
      </section>

      {captureOpen ? (
        <CaptureDemandDrawer
          canViewCatalog={capabilities.canViewCatalog}
          canViewCustomers={capabilities.canViewCustomers}
          canViewInventory={capabilities.canViewInventory}
          onClose={() => setCaptureOpen(false)}
        />
      ) : null}
      {detailOpen ? (
        <DemandDetailDrawer
          canManage={capabilities.canManage}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
