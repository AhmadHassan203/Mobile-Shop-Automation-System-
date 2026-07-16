"use client";

import {
  DEMAND_CHANNELS,
  DEMAND_FOLLOW_UP_RESULTS,
  DEMAND_MANUAL_STATUS_TARGETS,
  DEMAND_OUTCOMES,
  formatMoney,
  toMinor,
  type CreateDemandRequestData,
  type CurrentAuth,
  type DemandChannel,
  type DemandFollowUpResult,
  type DemandManualStatusTarget,
  type DemandOutcome,
  type DemandRequestDetail,
  type DemandRequestSummary,
  type DemandStatus,
  type DemandUrgency,
  type ProductSummary,
} from "@mobileshop/shared";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useMemo,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
} from "react";
import { z } from "zod";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CloseIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import {
  appendDemandFollowUp,
  createDemandRequest,
  convertDemandRequest,
  transitionDemandRequestStatus,
  adaptDemandCaptureProduct,
  type DemandCaptureProduct,
  type DemandList,
} from "@/lib/api/demand";
import { toApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  demandCaptureAvailabilityQueryOptions,
  demandCaptureCatalogQueryOptions,
  demandCaptureProductQueryOptions,
  demandConversionCapabilitiesQueryOptions,
  demandRequestQueryOptions,
  demandRequestsQueryOptions,
} from "@/lib/query/demand-query";
import { queryKeys } from "@/lib/query/keys";
import { DemandAvailabilityPanel, DemandIcon } from "./demand-components";
import {
  DEMAND_FILTERS,
  demandCapabilities,
  demandDraftToCreateInput,
  demandFilterFrom,
  demandListQuery,
  demandViewForFilter,
  hasDemandDraftErrors,
  validateDemandDraft,
  type DemandDraft,
  type DemandFilter,
  type DemandPtaPreference,
} from "./demand-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted";

const URGENCY_OPTIONS = [
  { label: "Immediate", value: "immediate" },
  { label: "Within a week", value: "within_week" },
  { label: "Within a month", value: "within_month" },
  { label: "Flexible", value: "flexible" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: DemandUrgency;
}[];

const CHANNEL_OPTIONS = [
  { label: "Walk-in", value: "walk_in" },
  { label: "Phone", value: "phone" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Referral", value: "referral" },
  { label: "Other", value: "other" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: DemandChannel;
}[];

const PTA_OPTIONS = [
  { label: "PTA only", value: "pta_only" },
  { label: "Non-PTA okay", value: "non_pta_ok" },
  { label: "No preference", value: "no_preference" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: DemandPtaPreference;
}[];

const LOST_OUTCOMES: ReadonlySet<DemandOutcome> = new Set([
  "unavailable",
  "price_too_high",
  "customer_postponed",
  "bought_elsewhere",
  "incompatible_requirement",
  "invalid_or_fraudulent",
]);

const STATUS_TRANSITIONS: Readonly<
  Record<DemandStatus, readonly DemandManualStatusTarget[]>
> = Object.freeze({
  new: ["contacted", "sourcing", "available", "not_interested", "closed"],
  contacted: [
    "sourcing",
    "available",
    "customer_notified",
    "not_interested",
    "closed",
  ],
  sourcing: [
    "contacted",
    "available",
    "customer_notified",
    "not_interested",
    "closed",
  ],
  available: [
    "contacted",
    "sourcing",
    "customer_notified",
    "not_interested",
    "closed",
  ],
  customer_notified: [
    "contacted",
    "sourcing",
    "available",
    "not_interested",
    "closed",
  ],
  converted_to_sale: [],
  not_interested: ["closed"],
  closed: [],
});

const CONVERSION_REASON_LABELS = Object.freeze({
  catalog_workflow_required: "Use the catalog workflow",
  quotation_module_unavailable: "Quotation workflow is not available yet",
  persisted_reservation_unavailable: "Persisted reservations are not available yet",
  supplier_inquiry_module_unavailable: "Supplier inquiries are not available yet",
  recommendation_module_unavailable: "Purchase recommendations are not available yet",
});

function emptyDraft(productVariantId: string): DemandDraft {
  return {
    productVariantId,
    customerName: "",
    requestText: "",
    variantDetails: "",
    quantity: "1",
    budget: "",
    ptaPreference: "pta_only",
    urgency: "within_week",
    channel: "walk_in",
    phone: "",
    followUp: "",
    note: "",
    consentToContact: false,
    tradeInInterest: false,
  };
}

function title(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function dateTimeLabel(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function dateLabel(value: string | null, timezone: string): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function money(valueMinor: number, currency: string): string {
  return formatMoney(toMinor(valueMinor, "demand amount"), currency);
}

function budgetLabel(
  budget: DemandRequestSummary["budget"],
  currency: string,
): string {
  if (budget.minimumMinor === null && budget.maximumMinor === null) {
    return "Not stated";
  }
  if (budget.minimumMinor === budget.maximumMinor) {
    return money(budget.minimumMinor ?? 0, currency);
  }
  const minimum =
    budget.minimumMinor === null ? "No minimum" : money(budget.minimumMinor, currency);
  const maximum =
    budget.maximumMinor === null ? "No maximum" : money(budget.maximumMinor, currency);
  return `${minimum} – ${maximum}`;
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
  onClick,
  href,
  value,
}: {
  readonly emphasis?: "accent" | "negative" | "positive";
  readonly label: string;
  readonly meta: string;
  readonly onClick?: (() => void) | undefined;
  readonly href?: string | undefined;
  readonly value: ReactNode;
}): JSX.Element {
  const valueColor =
    emphasis === "negative"
      ? "text-negative"
      : emphasis === "positive"
        ? "text-positive"
        : emphasis === "accent"
          ? "text-accent"
          : "text-ink";
  const body = (
    <>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{meta}</p>
    </>
  );
  const className =
    "block w-full rounded-card border border-line bg-surface p-4 text-left shadow-card no-underline transition hover:border-accent/40";
  if (href !== undefined) {
    return <Link className={className} href={href}>{body}</Link>;
  }
  if (onClick !== undefined) {
    return <button className={className} onClick={onClick} type="button">{body}</button>;
  }
  return <article className={className}>{body}</article>;
}

function Field({
  children,
  error,
  help,
  label,
}: {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly help?: string | undefined;
  readonly label: string;
}): JSX.Element {
  return (
    <label className="block text-xs font-semibold text-ink-subtle">
      {label}
      {children}
      {help === undefined ? null : (
        <span className="mt-1 block font-normal leading-5 text-ink-muted">{help}</span>
      )}
      {error === undefined ? null : (
        <span className="mt-1 block font-medium text-negative">{error}</span>
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
            className={`min-h-8 min-w-24 flex-1 rounded-[0.4rem] px-2 text-xs font-semibold ${
              value === option.value
                ? "bg-surface text-accent shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
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

function CaptureQueryError({
  label,
  retry,
}: {
  readonly label: string;
  readonly retry: () => void;
}): JSX.Element {
  return (
    <div className="rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative" role="alert">
      <strong>{label} could not be loaded.</strong> Free-text demand remains available,
      but no catalog or availability value is inferred.
      <button className="ml-2 font-bold underline" onClick={retry} type="button">Retry</button>
    </div>
  );
}

function CaptureDemandDrawer({
  canViewCatalog,
  canViewInventory,
  canViewPricing,
  initialProductVariantId,
  onClose,
  onSaved,
}: {
  readonly canViewCatalog: boolean;
  readonly canViewInventory: boolean;
  readonly canViewPricing: boolean;
  readonly initialProductVariantId: string;
  readonly onClose: () => void;
  readonly onSaved: (record: DemandRequestDetail) => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DemandDraft>(() => emptyDraft(initialProductVariantId));
  const [catalogSelection, setCatalogSelection] = useState(initialProductVariantId);
  const [checked, setChecked] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const catalog = useQuery(demandCaptureCatalogQueryOptions(canViewCatalog));
  const initialInPage = catalog.data?.items.some((item) => item.id === initialProductVariantId);
  const initialProduct = useQuery(
    demandCaptureProductQueryOptions(
      initialProductVariantId,
      canViewCatalog && initialProductVariantId.length > 0 && initialInPage !== true,
    ),
  );
  const products = useMemo<readonly ProductSummary[]>(() => {
    const items = [...(catalog.data?.items ?? [])];
    if (
      initialProduct.data?.isActive === true &&
      !items.some((item) => item.id === initialProduct.data?.id)
    ) {
      items.push(initialProduct.data);
    }
    return items;
  }, [catalog.data?.items, initialProduct.data]);
  const selectedProduct = products.find((product) => product.id === draft.productVariantId);
  const canCheckAvailability = canViewPricing && canViewInventory;
  const availability = useQuery(
    demandCaptureAvailabilityQueryOptions(
      selectedProduct?.sku ?? "",
      canCheckAvailability && selectedProduct !== undefined,
    ),
  );
  const adaptedProduct = useMemo<DemandCaptureProduct | null>(() => {
    if (selectedProduct === undefined) return null;
    const state = !canCheckAvailability
      ? "permission_denied"
      : availability.error !== null
        ? "request_failed"
        : availability.data === undefined
          ? "checking"
          : "ready";
    return adaptDemandCaptureProduct(selectedProduct, availability.data, state);
  }, [availability.data, availability.error, canCheckAvailability, selectedProduct]);

  const errors = validateDemandDraft(draft);
  const mutation = useMutation({
    mutationFn: (input: CreateDemandRequestData) => createDemandRequest(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.demandRequest(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.demandRoot });
      onSaved(saved);
    },
  });
  const mutationError = mutation.isError ? toApiError(mutation.error) : null;
  const update = <Key extends keyof DemandDraft>(key: Key, value: DemandDraft[Key]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setChecked(false);
    setClientError(null);
  };
  const selectCatalog = (value: string): void => {
    setCatalogSelection(value);
    update("productVariantId", value === "__other" ? "" : value);
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setChecked(true);
    setClientError(null);
    if (hasDemandDraftErrors(errors)) return;
    try {
      mutation.mutate(demandDraftToCreateInput(draft, selectedProduct, adaptedProduct));
    } catch (error) {
      setClientError(
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Review the demand details.")
          : "Review the demand details before saving.",
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close record demand drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <form
        aria-labelledby="capture-demand-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-2xl flex-col bg-surface shadow-overlay"
        onSubmit={submit}
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><DemandIcon /></span>
          <div>
            <h2 className="font-bold text-ink" id="capture-demand-title">Record customer demand</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Capture the customer’s exact wording; the server rechecks scoped stock and price.</p>
          </div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button">
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {mutationError === null && clientError === null ? null : (
            <div className="rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative" role="alert">
              <p className="font-bold">Demand could not be saved</p>
              <p>{clientError ?? mutationError?.message}</p>
              {mutationError?.requestId === undefined ? null : <p className="font-mono">Ref: {mutationError.requestId}</p>}
            </div>
          )}
          {catalog.error === null ? null : <CaptureQueryError label="Catalog" retry={() => void catalog.refetch()} />}
          {initialProduct.error === null ? null : <CaptureQueryError label="Selected catalog product" retry={() => void initialProduct.refetch()} />}

          <Field error={checked ? errors.customerName : undefined} label="Customer name (optional)">
            <input className={controlClass} disabled={mutation.isPending} maxLength={200} onChange={(event) => update("customerName", event.target.value)} placeholder="Walk-in customer or name" value={draft.customerName} />
          </Field>

          <Field help="Match a real catalog variant so qualified demand can feed the buying plan." label="Product — match from catalog">
            <select className={controlClass} disabled={!canViewCatalog || catalog.isPending || mutation.isPending} onChange={(event) => selectCatalog(event.target.value)} value={catalogSelection}>
              <option value="">{canViewCatalog ? (catalog.isPending ? "Loading active catalog…" : "— Select a catalog item —") : "Catalog access not granted"}</option>
              {catalogSelection.length > 0 && catalogSelection !== "__other" && selectedProduct === undefined ? <option value={catalogSelection}>Loading selected product…</option> : null}
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.productModel.brand.name} {product.productModel.name} · {product.name} · {product.sku}</option>
              ))}
              <option value="__other">Other / not in catalog</option>
            </select>
          </Field>

          <Field error={checked ? errors.requestText : undefined} help="This original wording is immutable after capture." label="…or type what the customer asked for">
            <input className={controlClass} disabled={mutation.isPending} maxLength={500} onChange={(event) => update("requestText", event.target.value)} placeholder="e.g. iPhone 16 Pro 256 (any colour)" value={draft.requestText} />
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-subtle">Availability right now</p>
            <DemandAvailabilityPanel product={adaptedProduct} requestText={draft.requestText} />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field error={checked ? errors.variantDetails : undefined} label="Variant / condition">
              <input className={controlClass} disabled={mutation.isPending} maxLength={120} onChange={(event) => update("variantDetails", event.target.value)} placeholder="256 GB · Green · New" value={draft.variantDetails} />
            </Field>
            <Field error={checked ? errors.quantity : undefined} label="Quantity">
              <input className={controlClass} disabled={mutation.isPending} inputMode="numeric" min={1} max={100000} onChange={(event) => update("quantity", event.target.value)} type="number" value={draft.quantity} />
            </Field>
          </div>

          <Field error={checked ? errors.budget : undefined} help="Exact rupees or a range; 40k–46k is accepted." label="Customer budget">
            <input className={controlClass} disabled={mutation.isPending} maxLength={120} onChange={(event) => update("budget", event.target.value)} placeholder="e.g. 40000–46000" value={draft.budget} />
          </Field>

          <SegmentedControl label="PTA preference" onChange={(value) => update("ptaPreference", value)} options={PTA_OPTIONS} value={draft.ptaPreference} />
          <SegmentedControl label="Urgency" onChange={(value) => update("urgency", value)} options={URGENCY_OPTIONS} value={draft.urgency} />
          <SegmentedControl label="Request channel" onChange={(value) => update("channel", value)} options={CHANNEL_OPTIONS} value={draft.channel} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={checked ? errors.phone : undefined} help="Required only when consent or a follow-up is recorded." label="Customer phone (optional)">
              <input className={controlClass} disabled={mutation.isPending} inputMode="tel" onChange={(event) => update("phone", event.target.value)} placeholder="03xx-xxxxxxx" value={draft.phone} />
            </Field>
            <Field error={checked ? errors.followUp : undefined} label="Follow-up date">
              <input className={controlClass} disabled={mutation.isPending} onChange={(event) => update("followUp", event.target.value)} type="date" value={draft.followUp} />
            </Field>
          </div>

          <Field error={checked ? errors.note : undefined} label="Note">
            <textarea className={`${controlClass} min-h-24 resize-y`} disabled={mutation.isPending} maxLength={2000} onChange={(event) => update("note", event.target.value)} placeholder="Colour preference, timing, price objection…" value={draft.note} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-subtle">
              <input checked={draft.consentToContact} className="mt-0.5 size-4 accent-[var(--accent)]" disabled={mutation.isPending} onChange={(event) => update("consentToContact", event.target.checked)} type="checkbox" />
              Customer consents to be contacted when stock arrives
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-subtle">
              <input checked={draft.tradeInInterest} className="mt-0.5 size-4 accent-[var(--accent)]" disabled={mutation.isPending} onChange={(event) => update("tradeInInterest", event.target.checked)} type="checkbox" />
              Customer is interested in a trade-in
            </label>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" disabled={mutation.isPending} onClick={onClose} type="button">Cancel</button>
          <button className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60" disabled={mutation.isPending} type="submit">
            <PlusIcon className="size-4" /> {mutation.isPending ? "Recording…" : "Record demand"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function OutcomeBadge({ outcome }: { readonly outcome: DemandOutcome }): JSX.Element {
  const tone =
    outcome === "unavailable" || outcome === "price_too_high" || outcome === "bought_elsewhere"
      ? "bg-negative-soft text-negative"
      : outcome === "reserved" || outcome === "quotation_sent" || outcome === "sold_immediately"
        ? "bg-positive-soft text-positive"
        : "bg-surface-subtle text-ink-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${tone}`}>{title(outcome)}</span>;
}

function RequestsLedger({
  canCreate,
  filter,
  filterCount,
  list,
  onCapture,
  onFilter,
  onOpen,
  onPage,
  onRetry,
  onSearch,
  page,
  q,
  timezone,
}: {
  readonly canCreate: boolean;
  readonly filter: DemandFilter;
  readonly filterCount: (filter: DemandFilter) => number | undefined;
  readonly list: {
    readonly data: DemandList | undefined;
    readonly error: unknown;
    readonly isError: boolean;
    readonly isPending: boolean;
  };
  readonly onCapture: () => void;
  readonly onFilter: (filter: DemandFilter) => void;
  readonly onOpen: (id: string) => void;
  readonly onPage: (page: number) => void;
  readonly onRetry: () => void;
  readonly onSearch: (value: string) => void;
  readonly page: number;
  readonly q: string;
  readonly timezone: string;
}): JSX.Element {
  const pageData = list.data?.page;
  const submitSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    onSearch(typeof value === "string" ? value : "");
  };
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div>
          <h2 className="font-bold text-ink">Requests</h2>
          <p className="mt-0.5 text-xs text-ink-muted">Scoped to the current branch and authorized stock locations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="relative" key={q} onSubmit={submitSearch}>
            <SearchIcon className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-muted" />
            <input aria-label="Search demand requests" className="min-h-9 w-52 rounded-control border border-line bg-surface pl-9 pr-3 text-xs outline-none focus:border-accent" defaultValue={q} name="q" placeholder="Search request or customer" />
          </form>
          <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-ink-muted">{pageData === undefined ? "—" : `${pageData.items.length} of ${pageData.total}`} requests</span>
        </div>
      </div>
      <div className="overflow-x-auto border-b border-line bg-surface-subtle px-3 py-2.5">
        <div aria-label="Demand outcome filters" className="flex min-w-max gap-1" role="group">
          {DEMAND_FILTERS.map((item) => (
            <button aria-pressed={filter === item.id} className={`min-h-8 rounded-control px-3 text-xs font-semibold ${filter === item.id ? "bg-accent text-white" : "text-ink-muted hover:bg-surface hover:text-ink"}`} key={item.id} onClick={() => onFilter(item.id)} type="button">
              {item.label} <span className="opacity-70">{filterCount(item.id) ?? "—"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Logged</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Request</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">Urgency</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Follow-up</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.isPending ? (
              <tr><td className="px-5 py-12 text-center text-sm text-ink-muted" colSpan={8}>Loading the demand ledger…</td></tr>
            ) : list.isError ? (
              <tr><td className="px-5 py-12 text-center" colSpan={8}>
                <AlertTriangleIcon className="mx-auto size-7 text-negative" />
                <h3 className="mt-2 font-bold text-ink">Demand requests could not be loaded</h3>
                <p className="mt-1 text-sm text-ink-muted">{toApiError(list.error).message}</p>
                <button className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3 text-xs font-semibold" onClick={onRetry} type="button"><RefreshIcon className="size-4" /> Retry</button>
              </td></tr>
            ) : pageData?.items.length === 0 ? (
              <tr><td className="px-5 py-12 text-center" colSpan={8}>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><DemandIcon className="size-6" /></span>
                <h3 className="mt-3 font-bold text-ink">No requests match this view</h3>
                <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-ink-muted">Capture the exact request when a customer cannot buy the right product today.</p>
                {canCreate ? <button className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onCapture} type="button"><PlusIcon className="size-4" /> Record demand</button> : null}
              </td></tr>
            ) : pageData?.items.map((request) => (
              <tr className="hover:bg-surface-subtle/70" key={request.id}>
                <td className="px-4 py-3"><button className="font-mono text-xs font-bold text-accent hover:underline" onClick={() => onOpen(request.id)} type="button">{request.requestNumber}</button></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-muted">{dateTimeLabel(request.requestedAt, timezone)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-ink-subtle">{request.contact.customerName ?? request.contact.customerPhone ?? "Walk-in / private"}</td>
                <td className="max-w-sm px-4 py-3"><button className="text-left" onClick={() => onOpen(request.id)} type="button"><span className="block text-sm font-semibold text-ink">{request.item.match === "matched" ? request.item.productVariant.displayName : request.item.rawRequestText}</span>{request.item.match === "matched" ? <span className="mt-0.5 block max-w-sm truncate text-xs text-ink-muted">“{request.item.rawRequestText}”</span> : null}</button></td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{request.quantity}</td>
                <td className="px-4 py-3 text-xs text-ink-subtle">{title(request.urgency)}</td>
                <td className="px-4 py-3"><OutcomeBadge outcome={request.outcome} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-muted">{dateLabel(request.followUpOn, timezone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageData !== undefined && pageData.totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-muted">
          <span>Page {pageData.page} of {pageData.totalPages}</span>
          <div className="flex gap-2"><button className="min-h-8 rounded-control border border-line px-3 font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">Previous</button><button className="min-h-8 rounded-control border border-line px-3 font-semibold disabled:opacity-40" disabled={page >= pageData.totalPages} onClick={() => onPage(page + 1)} type="button">Next</button></div>
        </div>
      ) : null}
    </section>
  );
}

function RequestsRestricted({ canCreate, onCapture }: { readonly canCreate: boolean; readonly onCapture: () => void }): JSX.Element {
  return (
    <section className="rounded-card border border-line bg-surface px-5 py-12 text-center shadow-card">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><DemandIcon className="size-6" /></span>
      <h2 className="mt-3 font-bold text-ink">Demand request history is restricted</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-ink-muted">This role can capture a customer request but cannot read the existing branch ledger.</p>
      {canCreate ? <button className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-xs font-semibold text-white" onClick={onCapture} type="button"><PlusIcon className="size-4" /> Record demand</button> : null}
    </section>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: ReactNode }): JSX.Element {
  return <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 text-sm last:border-b-0"><span className="text-ink-muted">{label}</span><span className="max-w-[65%] text-right font-semibold text-ink-subtle">{value}</span></div>;
}

function DemandDetailDrawer({
  canManage,
  canViewCustomers,
  currency,
  id,
  onClose,
  timezone,
}: {
  readonly canManage: boolean;
  readonly canViewCustomers: boolean;
  readonly currency: string;
  readonly id: string;
  readonly onClose: () => void;
  readonly timezone: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const detail = useQuery(demandRequestQueryOptions(id));
  const capabilities = useQuery(demandConversionCapabilitiesQueryOptions(true));
  const [targetStatus, setTargetStatus] = useState<DemandManualStatusTarget | "">("");
  const [outcome, setOutcome] = useState<DemandOutcome>("unknown");
  const [lostReason, setLostReason] = useState("");
  const [followUpChannel, setFollowUpChannel] = useState<DemandChannel>("phone");
  const [followUpResult, setFollowUpResult] = useState<DemandFollowUpResult>("reached");
  const [followUpNote, setFollowUpNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [saleId, setSaleId] = useState("");

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.demandRequest(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.demandRoot });
  };
  const transition = useMutation({
    mutationFn: (request: DemandRequestDetail) => transitionDemandRequestStatus(id, {
      status: z.enum(DEMAND_MANUAL_STATUS_TARGETS).parse(targetStatus),
      outcome,
      lostSaleReason: LOST_OUTCOMES.has(outcome) ? lostReason.trim() || null : null,
      version: request.version,
    }),
    onSuccess: refresh,
  });
  const followUp = useMutation({
    mutationFn: () => appendDemandFollowUp(id, {
      occurredAt: new Date().toISOString(),
      channel: followUpChannel,
      result: followUpResult,
      note: followUpNote,
      nextFollowUpOn: nextFollowUp || null,
    }),
    onSuccess: () => {
      setFollowUpNote("");
      setNextFollowUp("");
      refresh();
    },
  });
  const conversion = useMutation({
    mutationFn: (request: DemandRequestDetail) => convertDemandRequest(id, { target: "sale", saleId, version: request.version }),
    onSuccess: refresh,
  });
  const actionError = transition.error ?? followUp.error ?? conversion.error;
  const request = detail.data;
  const actionPending = transition.isPending || followUp.isPending || conversion.isPending;
  const saleIdValid = z.uuid().safeParse(saleId).success;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close demand detail drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-labelledby="demand-detail-title" aria-modal="true" className="relative flex h-full w-full max-w-2xl flex-col bg-surface shadow-overlay" role="dialog">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><DemandIcon /></span>
          <div><h2 className="font-bold text-ink" id="demand-detail-title">{request?.requestNumber ?? "Demand request"}</h2><p className="mt-0.5 text-xs text-ink-muted">Original request, capture evidence, follow-ups and conversion</p></div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle" onClick={onClose} type="button"><CloseIcon className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {detail.isPending ? <div className="py-16 text-center text-sm text-ink-muted">Loading demand request…</div> : null}
          {detail.isError ? <div className="rounded-control border border-negative/25 bg-negative-soft p-4 text-sm text-negative" role="alert"><p className="font-bold">Demand request could not be loaded</p><p className="mt-1">{toApiError(detail.error).message}</p><button className="mt-3 inline-flex items-center gap-2 font-bold underline" onClick={() => void detail.refetch()} type="button"><RefreshIcon className="size-4" /> Retry</button></div> : null}
          {actionError === null ? null : <div className="rounded-control border border-negative/25 bg-negative-soft p-3 text-xs text-negative" role="alert"><p className="font-bold">Demand action could not be completed</p><p className="mt-1">{toApiError(actionError).message}</p></div>}
          {request === undefined ? null : (
            <>
              <section className="overflow-hidden rounded-card border border-line">
                <DetailRow label="Requested" value={dateTimeLabel(request.requestedAt, timezone)} />
                <DetailRow label="Customer" value={request.contact.customerName ?? request.contact.customerPhone ?? "Walk-in / private"} />
                <DetailRow label="Original wording" value={`“${request.item.rawRequestText}”`} />
                <DetailRow label="Catalog match" value={request.item.match === "matched" ? `${request.item.productVariant.displayName} · ${request.item.productVariant.sku}` : "Not in catalog"} />
                <DetailRow label="Quantity / budget" value={`${request.quantity} · ${budgetLabel(request.budget, currency)}`} />
                <DetailRow label="Urgency / channel" value={`${title(request.urgency)} · ${title(request.channel)}`} />
                <DetailRow label="Status" value={title(request.status)} />
                <DetailRow label="Outcome" value={<OutcomeBadge outcome={request.outcome} />} />
                <DetailRow label="Capture availability" value={title(request.availabilitySnapshot.state)} />
                <DetailRow label="Buying plan" value={request.qualifiedForBuyingPlan ? (request.countsTowardForecast ? "Qualified · counted" : "Qualified · deduplicated") : "Not qualified"} />
                <DetailRow label="PTA preference" value={title(request.ptaPreference)} />
                <DetailRow label="Trade-in interest" value={request.tradeInInterest ? "Yes" : "No"} />
                <DetailRow label="Follow-up due" value={dateLabel(request.followUpOn, timezone)} />
                <DetailRow label="Note" value={request.note ?? "—"} />
              </section>

              {request.conversion === null ? null : <div className="rounded-control border border-positive/25 bg-positive-soft p-3 text-sm text-positive"><strong>Converted to sale.</strong> Linked sale: <span className="font-mono">{request.conversion.targetId}</span></div>}

              <section>
                <h3 className="text-sm font-bold text-ink">Follow-up history</h3>
                {request.followUps.length === 0 ? <p className="mt-2 rounded-control border border-dashed border-line p-4 text-center text-xs text-ink-muted">{canViewCustomers ? "No follow-ups recorded yet." : "Customer contact history is private for this role."}</p> : <div className="mt-2 space-y-2">{request.followUps.map((item) => <article className="rounded-control border border-line p-3 text-xs" key={item.id}><div className="flex items-center justify-between gap-3"><strong className="text-ink">{title(item.result)} · {title(item.channel)}</strong><span className="text-ink-muted">{dateTimeLabel(item.occurredAt, timezone)}</span></div><p className="mt-1 leading-5 text-ink-subtle">{item.note}</p><p className="mt-1 text-ink-muted">By {item.createdBy.displayName}{item.nextFollowUpOn === null ? "" : ` · Next ${dateLabel(item.nextFollowUpOn, timezone)}`}</p></article>)}</div>}
              </section>

              {!canManage ? null : (
                <section className="space-y-3 rounded-card border border-line p-4">
                  <div><h3 className="text-sm font-bold text-ink">Update outcome</h3><p className="mt-0.5 text-xs text-ink-muted">Every status change is version-checked and audited.</p></div>
                  {STATUS_TRANSITIONS[request.status].length === 0 ? <p className="rounded-control bg-surface-subtle p-3 text-xs text-ink-muted">This request is in a terminal status.</p> : <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="New status"><select className={controlClass} disabled={actionPending} onChange={(event) => setTargetStatus(event.target.value as DemandManualStatusTarget | "")} value={targetStatus}><option value="">Choose status…</option>{STATUS_TRANSITIONS[request.status].map((status) => <option key={status} value={status}>{title(status)}</option>)}</select></Field>
                      <Field label="Outcome"><select className={controlClass} disabled={actionPending} onChange={(event) => setOutcome(event.target.value as DemandOutcome)} value={outcome}>{DEMAND_OUTCOMES.filter((value) => value !== "sold_immediately").map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></Field>
                    </div>
                    {LOST_OUTCOMES.has(outcome) ? <Field label="Why the sale was lost"><textarea className={`${controlClass} min-h-20`} maxLength={500} onChange={(event) => setLostReason(event.target.value)} value={lostReason} /></Field> : null}
                    <button className="min-h-9 rounded-control bg-accent px-3.5 text-xs font-semibold text-white disabled:opacity-40" disabled={actionPending || targetStatus === "" || (LOST_OUTCOMES.has(outcome) && lostReason.trim().length === 0)} onClick={() => transition.mutate(request)} type="button">{transition.isPending ? "Saving…" : "Save status"}</button>
                  </>}
                </section>
              )}

              {!canManage || !canViewCustomers ? null : (
                <section className="space-y-3 rounded-card border border-line p-4">
                  <div><h3 className="text-sm font-bold text-ink">Record follow-up</h3><p className="mt-0.5 text-xs text-ink-muted">Adds a new history entry; earlier contact evidence is never overwritten.</p></div>
                  <div className="grid gap-3 sm:grid-cols-2"><Field label="Channel"><select className={controlClass} onChange={(event) => setFollowUpChannel(event.target.value as DemandChannel)} value={followUpChannel}>{DEMAND_CHANNELS.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></Field><Field label="Result"><select className={controlClass} onChange={(event) => setFollowUpResult(event.target.value as DemandFollowUpResult)} value={followUpResult}>{DEMAND_FOLLOW_UP_RESULTS.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></Field></div>
                  <Field label="Follow-up note"><textarea className={`${controlClass} min-h-20`} maxLength={1000} onChange={(event) => setFollowUpNote(event.target.value)} value={followUpNote} /></Field>
                  <Field label="Next follow-up (optional)"><input className={controlClass} onChange={(event) => setNextFollowUp(event.target.value)} type="date" value={nextFollowUp} /></Field>
                  <button className="min-h-9 rounded-control bg-accent px-3.5 text-xs font-semibold text-white disabled:opacity-40" disabled={actionPending || followUpNote.trim().length === 0} onClick={() => followUp.mutate()} type="button">{followUp.isPending ? "Recording…" : "Add follow-up"}</button>
                </section>
              )}

              {!canManage || request.status === "converted_to_sale" ? null : (
                <section className="space-y-3 rounded-card border border-line p-4">
                  <div><h3 className="text-sm font-bold text-ink">Convert request</h3><p className="mt-0.5 text-xs text-ink-muted">Only an already-posted sale can be linked atomically today.</p></div>
                  <div className="flex flex-wrap gap-2">
                    {capabilities.data?.filter((capability) => !capability.available).map((capability) => <button className="rounded-control border border-line bg-surface-subtle px-2.5 py-1.5 text-[0.6875rem] font-semibold text-ink-muted" disabled key={capability.target} title={CONVERSION_REASON_LABELS[capability.reason]} type="button">{title(capability.target)} · unavailable</button>)}
                  </div>
                  {capabilities.isError ? <p className="text-xs text-warning">Conversion capabilities could not be verified; no unsupported action is enabled.</p> : null}
                  <div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-9 items-center rounded-control border border-line px-3 text-xs font-semibold text-accent no-underline" href={request.item.match === "matched" ? `/sell?productVariantId=${encodeURIComponent(request.item.productVariant.id)}` : "/sell"}>Open Sell →</Link><input aria-label="Posted sale ID" className="min-h-9 min-w-60 flex-1 rounded-control border border-line px-3 font-mono text-xs outline-none focus:border-accent" onChange={(event) => setSaleId(event.target.value.trim())} placeholder="Paste posted sale UUID" value={saleId} /><button className="min-h-9 rounded-control bg-accent px-3.5 text-xs font-semibold text-white disabled:opacity-40" disabled={actionPending || !saleIdValid} onClick={() => conversion.mutate(request)} type="button">{conversion.isPending ? "Linking…" : "Link sale"}</button></div>
                  {saleId.length > 0 && !saleIdValid ? <p className="text-xs text-negative">Enter a valid posted sale UUID.</p> : null}
                </section>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function DemandAuthenticatedWorkspace({ auth }: { readonly auth: CurrentAuth }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const capabilities = demandCapabilities(auth.permissions);
  const productParameter = searchParams.get("productVariantId") ?? "";
  const initialProductVariantId = z.uuid().safeParse(productParameter).success ? productParameter : "";
  const [captureOpen, setCaptureOpen] = useState(initialProductVariantId.length > 0);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const filter = demandFilterFrom(new URLSearchParams(searchParams.toString()));
  const pageValue = Number(searchParams.get("page") ?? "1");
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const q = searchParams.get("q")?.normalize("NFKC").trim() ?? "";
  const baseParameters = { page, pageSize: 25, view: demandViewForFilter(filter), sort: "requested_at" as const, direction: "desc" as const, ...(q.length === 0 ? {} : { q }) };
  const ledger = useQuery(demandRequestsQueryOptions(baseParameters, capabilities.canView));
  const countQueries = useQueries({ queries: DEMAND_FILTERS.map((item) => demandRequestsQueryOptions({ ...baseParameters, page: 1, pageSize: 1, view: demandViewForFilter(item.id) }, capabilities.canView)) });
  const kpis = ledger.data?.kpis ?? countQueries.find((query) => query.data !== undefined)?.data?.kpis;

  if (!capabilities.canView && !capabilities.canCreate) {
    return <CatalogForbiddenState description="This workspace requires demand.view or demand.create. No demand or capture-dependency request was sent." title="Demand access required" />;
  }

  const replaceParameters = (changes: Readonly<Record<string, string | null>>): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value.length === 0) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };
  const setFilter = (nextFilter: DemandFilter): void => {
    const query = demandListQuery(new URLSearchParams(searchParams.toString()), nextFilter);
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };
  const filterCount = (target: DemandFilter): number | undefined => {
    const index = DEMAND_FILTERS.findIndex((candidate) => candidate.id === target);
    return countQueries[index]?.data?.page.total;
  };
  const saved = (record: DemandRequestDetail): void => {
    setCaptureOpen(false);
    setSavedNotice(`${record.requestNumber} was recorded and included in live Demand analytics.`);
    if (capabilities.canView) setSelectedRequestId(record.id);
  };

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent"><DemandIcon /></span><div><p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">Customers · Demand intelligence</p><h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">Customer Demand &amp; Missed Sales</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">Every request you could not fill today — captured so it drives what you buy next.</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><Link className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink-subtle no-underline hover:bg-surface-subtle" href="/intelligence">View buying plan →</Link>{capabilities.canCreate ? <button className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong" onClick={() => { setSavedNotice(null); setCaptureOpen(true); }} type="button"><PlusIcon className="size-4" /> Record demand</button> : null}</div>
        </div>
      </header>

      {savedNotice === null ? null : <div className="flex items-center gap-2 rounded-control border border-positive/25 bg-positive-soft px-4 py-3 text-sm text-positive" role="status"><ShieldCheckIcon className="size-5" /><span className="font-semibold">{savedNotice}</span><button aria-label="Dismiss saved message" className="ml-auto" onClick={() => setSavedNotice(null)} type="button"><CloseIcon className="size-4" /></button></div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard emphasis="accent" label="Total requests" meta={capabilities.canView ? `As of ${kpis?.businessDate ?? "today"}` : "Restricted"} onClick={capabilities.canView ? () => setFilter("all") : undefined} value={capabilities.canView ? (kpis?.totalRequests ?? "—") : "—"} />
        <KpiCard emphasis="negative" label="Unavailable · missed" meta={capabilities.canView ? "Qualified missed demand" : "Restricted"} onClick={capabilities.canView ? () => setFilter("unavailable") : undefined} value={capabilities.canView ? (kpis?.unavailableMissed ?? "—") : "—"} />
        <KpiCard emphasis="positive" label="Reserved / quotation" meta={capabilities.canView ? "Conversion signals" : "Restricted"} onClick={capabilities.canView ? () => setFilter("reserved") : undefined} value={capabilities.canView ? (kpis?.reservedOrQuoted ?? "—") : "—"} />
        <KpiCard href="/tasks" label="Follow-ups due" meta="Open Tasks →" value={capabilities.canView ? (kpis?.followUpsDue ?? "—") : "—"} />
      </div>

      <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-3.5 text-sm text-warning"><AlertTriangleIcon className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">Unavailable requests feed the reorder engine</p><p className="mt-0.5 leading-5">The server qualifies and deduplicates captured misses before they count toward the buying plan. <Link className="font-bold" href="/intelligence">Open the buying plan →</Link></p></div><span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-warning sm:inline-flex"><ShieldCheckIcon className="size-4" /> Live · scoped · audited</span></div>

      {capabilities.canView ? <RequestsLedger canCreate={capabilities.canCreate} filter={filter} filterCount={filterCount} list={ledger} onCapture={() => setCaptureOpen(true)} onFilter={setFilter} onOpen={setSelectedRequestId} onPage={(nextPage) => replaceParameters({ page: String(nextPage) })} onRetry={() => void ledger.refetch()} onSearch={(value) => replaceParameters({ q: value.trim() || null, page: null })} page={page} q={q} timezone={auth.organization.timezone} /> : <RequestsRestricted canCreate={capabilities.canCreate} onCapture={() => setCaptureOpen(true)} />}

      {captureOpen && capabilities.canCreate ? <CaptureDemandDrawer canViewCatalog={capabilities.canViewCatalog} canViewInventory={capabilities.canViewInventory} canViewPricing={capabilities.canViewPricing} initialProductVariantId={initialProductVariantId} onClose={() => setCaptureOpen(false)} onSaved={saved} /> : null}
      {selectedRequestId.length > 0 && capabilities.canView ? <DemandDetailDrawer canManage={capabilities.canManage} canViewCustomers={capabilities.canViewCustomers} currency={auth.organization.currency} id={selectedRequestId} onClose={() => setSelectedRequestId("")} timezone={auth.organization.timezone} /> : null}
    </div>
  );
}

export function DemandWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  if (auth.data === undefined && auth.isPending) return <DemandLoading />;
  if (auth.isError || auth.data === undefined) {
    return <CatalogForbiddenState description="The current session could not be checked, so no demand, catalog, pricing, or customer data was requested. Restore the API connection and retry." title="Demand access could not be verified" />;
  }
  return <DemandAuthenticatedWorkspace auth={auth.data} />;
}
