"use client";

import type { SaleLine } from "@mobileshop/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type JSX, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  CloseIcon,
  PlusIcon,
  RefreshIcon,
  ReturnIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { toApiError } from "@/lib/api/client";
import { lookupOriginalSaleForReturn } from "@/lib/api/returns";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  RETURN_BACKEND_GAPS,
  RETURN_CONDITIONS,
  RETURN_OUTCOME_OPTIONS,
  RETURN_REASONS,
  RETURN_TABS,
  normalizeReturnInvoice,
  returnCapabilities,
  returnLineIdentifier,
  returnLineLabel,
  returnOutcomeImpact,
  returnRouteQuery,
  returnTabFrom,
  validateReturnDraft,
  type PrototypeReturnOutcome,
  type ReturnCondition,
  type ReturnDraft,
  type ReturnReason,
  type ReturnTab,
} from "./return-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-not-allowed disabled:opacity-55";

const EMPTY_DRAFT: ReturnDraft = {
  invoiceNumber: "",
  saleLineId: "",
  reason: RETURN_REASONS[0],
  condition: RETURN_CONDITIONS[0],
  evidence: "",
};

function ReturnsLoading(): JSX.Element {
  return (
    <div aria-label="Loading returns workspace" className="space-y-4" role="status">
      <span className="sr-only">Loading returns workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-24 animate-pulse rounded-card bg-line-subtle" key={index} />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

function ReturnsAccessRequired({ authFailed = false }: { readonly authFailed?: boolean }): JSX.Element {
  return (
    <section className="rounded-card border border-warning/30 bg-warning-soft p-6 shadow-card">
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 size-6 shrink-0 text-warning" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-warning">
            {authFailed ? "Access could not be verified" : "Returns access required"}
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink">
            {authFailed ? "The current session is unavailable" : "This queue is permission protected"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-subtle">
            {authFailed
              ? "The session check failed, so no Sales lookup or Returns workflow was opened. Restore the API connection and retry."
              : "Viewing returns and warranty work requires returns.view. No Returns data or linked Sales evidence was requested."}
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  accent = false,
  label,
  meta,
  onClick,
}: {
  readonly accent?: boolean;
  readonly label: string;
  readonly meta: string;
  readonly onClick?: (() => void) | undefined;
}): JSX.Element {
  const content = (
    <>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${accent ? "text-accent" : "text-ink"}`}>—</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{meta}</p>
    </>
  );
  return onClick === undefined ? (
    <article className={`rounded-card border bg-surface p-4 text-left shadow-card ${accent ? "border-accent/30" : "border-line"}`}>{content}</article>
  ) : (
    <button className={`rounded-card border bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-subtle ${accent ? "border-accent/30" : "border-line"}`} onClick={onClick} type="button">{content}</button>
  );
}

function UnavailableBadge({ deferred = false }: { readonly deferred?: boolean }): JSX.Element {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${deferred ? "bg-warning-soft text-warning" : "bg-surface-subtle text-ink-muted"}`}>
      {deferred ? "Deferred" : "Not implemented"}
    </span>
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
      {error === undefined ? null : <span className="mt-1 block text-xs text-negative">{error}</span>}
    </label>
  );
}

function SelectedLineEvidence({ line }: { readonly line: SaleLine }): JSX.Element {
  const identifier = returnLineIdentifier(line);
  return (
    <dl className="mt-3 overflow-hidden rounded-control border border-line text-xs">
      <div className="flex justify-between gap-4 border-b border-line px-3 py-2.5">
        <dt className="text-ink-muted">Catalog line</dt>
        <dd className="text-right font-semibold text-ink-subtle">{line.product.name} · <span className="font-mono">{line.product.sku}</span></dd>
      </div>
      <div className="flex justify-between gap-4 border-b border-line px-3 py-2.5">
        <dt className="text-ink-muted">Tracking</dt>
        <dd className="font-semibold capitalize text-ink-subtle">{line.trackingType}</dd>
      </div>
      <div className="flex justify-between gap-4 px-3 py-2.5">
        <dt className="text-ink-muted">IMEI / quantity</dt>
        <dd className="font-mono font-semibold text-ink-subtle">{identifier ?? (line.trackingType === "quantity" ? `Qty ${line.quantity}` : "Identifier unavailable")}</dd>
      </div>
    </dl>
  );
}

function NewReturnDrawer({
  canViewSales,
  onClose,
}: {
  readonly canViewSales: boolean;
  readonly onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<ReturnDraft>(EMPTY_DRAFT);
  const lookup = useMutation({
    mutationFn: (invoiceNumber: string) =>
      lookupOriginalSaleForReturn(invoiceNumber),
    onSuccess: (result) => {
      setDraft((current) => ({
        ...current,
        invoiceNumber: result.invoiceNumber,
        saleLineId:
          result.availability === "found" ? (result.sale.lines[0]?.id ?? "") : "",
      }));
    },
  });
  const verifiedSale =
    lookup.data?.availability === "found" ? lookup.data.sale : null;
  const selectedLine =
    verifiedSale?.lines.find((line) => line.id === draft.saleLineId) ?? null;
  const errors = validateReturnDraft(draft, verifiedSale);
  const update = <Key extends keyof ReturnDraft>(
    key: Key,
    value: ReturnDraft[Key],
  ): void => setDraft((current) => ({ ...current, [key]: value }));
  const changeInvoice = (value: string): void => {
    lookup.reset();
    setDraft((current) => ({
      ...current,
      invoiceNumber: value,
      saleLineId: "",
    }));
  };
  const runLookup = (): void => {
    const normalized = normalizeReturnInvoice(draft.invoiceNumber);
    setDraft((current) => ({ ...current, invoiceNumber: normalized }));
    lookup.mutate(normalized);
  };
  const apiError = lookup.isError ? toApiError(lookup.error) : null;
  const formPrepared = Object.keys(errors).length === 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close new return drawer" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-labelledby="new-return-title" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay" role="dialog">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><ReturnIcon className="size-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Controlled intake</p>
            <h2 className="mt-0.5 font-bold text-ink" id="new-return-title">New return</h2>
          </div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button"><CloseIcon className="size-5" /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <p>The layout is complete, but the Returns intake and eligibility endpoints do not exist. Nothing entered here can be saved or move inventory.</p>
          </div>

          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">1 · Verify proof of purchase</p>
            <Field error={draft.invoiceNumber.length > 0 && lookup.data?.availability === "not_found" ? errors.invoiceNumber : undefined} label="Look up the original sale">
              <div className="mt-1.5 flex gap-2">
                <input
                  className="min-h-10 min-w-0 flex-1 rounded-control border border-line bg-surface-subtle px-3 py-2 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:opacity-55"
                  disabled={!canViewSales || lookup.isPending}
                  onChange={(event) => changeInvoice(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && draft.invoiceNumber.trim().length > 0) runLookup();
                  }}
                  placeholder="Invoice no. — e.g. INV-2026-0711"
                  value={draft.invoiceNumber}
                />
                <button className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-xs font-bold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50" disabled={!canViewSales || lookup.isPending || draft.invoiceNumber.trim().length === 0} onClick={runLookup} type="button">
                  {lookup.isPending ? <RefreshIcon className="size-3.5 animate-spin" /> : null}{lookup.isPending ? "Looking up…" : "Look up"}
                </button>
              </div>
              <span className="mt-1 block font-normal leading-5 text-ink-muted">A return cannot proceed without a real original sale. This lookup reads the implemented Sales API only.</span>
            </Field>

            {!canViewSales ? (
              <div className="mt-3 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">sales.view is required to verify an invoice. The Returns form cannot bypass proof of purchase.</div>
            ) : apiError !== null ? (
              <div className="mt-3 rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative" role="alert">
                <p className="font-bold">Sales lookup failed</p><p>{apiError.message}</p>{apiError.requestId === undefined ? null : <p className="font-mono">Ref: {apiError.requestId}</p>}
              </div>
            ) : lookup.data?.availability === "not_found" ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative" role="status">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" /><p><strong>Blocked — no matching posted sale.</strong> Check the invoice number or find the customer’s sale first. No return record was created.</p>
              </div>
            ) : verifiedSale !== null ? (
              <div className="mt-3 rounded-control border border-positive/25 bg-positive-soft p-3 text-xs leading-5 text-positive" role="status">
                <p className="font-bold">Original sale found — {verifiedSale.invoiceNumber}</p>
                <p>A strict posted-sale record matched. This verifies the source sale only; return-window, prior-quantity and policy eligibility are still unavailable.</p>
                <Link className="mt-2 inline-flex font-bold underline underline-offset-2" href={`/sales/${verifiedSale.id}`}>Open original sale →</Link>
              </div>
            ) : null}
          </section>

          <div className="border-t border-line" />

          <section className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">2 · Record observed intake</p>
            <Field error={verifiedSale !== null && selectedLine === null ? errors.saleLineId : undefined} label="Item being returned">
              <select className={controlClass} disabled={verifiedSale === null} onChange={(event) => update("saleLineId", event.target.value)} value={draft.saleLineId}>
                {verifiedSale === null ? <option value="">Verify an original sale first</option> : verifiedSale.lines.map((line) => <option key={line.id} value={line.id}>{returnLineLabel(line)}</option>)}
              </select>
            </Field>
            {selectedLine === null ? null : <SelectedLineEvidence line={selectedLine} />}
            <Field label="Reason for return">
              <select className={controlClass} disabled={verifiedSale === null} onChange={(event) => update("reason", event.target.value as ReturnReason)} value={draft.reason}>
                {RETURN_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </Field>
            <Field label="Condition on return">
              <select className={controlClass} disabled={verifiedSale === null} onChange={(event) => update("condition", event.target.value as ReturnCondition)} value={draft.condition}>
                {RETURN_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
              </select>
            </Field>
            <Field error={draft.evidence.length > 0 ? errors.evidence : undefined} label="Evidence note">
              <textarea className={`${controlClass} min-h-24 resize-y`} disabled={verifiedSale === null} onChange={(event) => update("evidence", event.target.value)} placeholder="What you observed — bench result, box/seal state, battery health…" value={draft.evidence} />
              <span className="mt-1 flex justify-between gap-3 font-normal text-ink-muted"><span>Captured evidence is never generated from the selected reason.</span><span>{draft.evidence.length}/1000</span></span>
            </Field>
          </section>

          <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
            <p>When the server workflow exists, saving must place the exact returned line into <strong>Inspection</strong> and hold it out of saleable stock until QC clears it.</p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <p className="text-xs text-ink-muted">{formPrepared ? "Form is locally complete · persistence unavailable" : "No return will be created"}</p>
          <div className="flex gap-2">
            <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onClose} type="button">Cancel</button>
            <button className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled title="POST /returns is not implemented" type="button">Save to inspection · unavailable</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function TimelinePreview(): JSX.Element {
  const steps = [
    ["Received at counter", "No persisted return case loaded"],
    ["Original sale verified", "Requires a saved return linked to Sales"],
    ["Inspection (QC gate)", "Inspection evidence endpoint unavailable"],
    ["Outcome decided", "Choose a preview below; it will not be saved"],
    ["Closed", "Posting / refund endpoint unavailable"],
  ] as const;
  return (
    <ol className="relative ml-2 border-l border-line pl-5">
      {steps.map(([title, description]) => (
        <li className="relative pb-5 last:pb-0" key={title}>
          <span className="absolute -left-[1.64rem] top-0.5 size-3 rounded-full border-2 border-line bg-surface" />
          <p className="text-sm font-bold text-ink-subtle">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-ink-muted">{description}</p>
        </li>
      ))}
    </ol>
  );
}

function ProcessingPreviewDrawer({
  canApprove,
  onClose,
}: {
  readonly canApprove: boolean;
  readonly onClose: () => void;
}): JSX.Element {
  const [outcome, setOutcome] = useState<PrototypeReturnOutcome | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation">
      <button aria-label="Close return processing preview" className="absolute inset-0" onClick={onClose} type="button" />
      <section aria-labelledby="return-preview-title" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay" role="dialog">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><ShieldCheckIcon className="size-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Processing contract preview</p>
            <h2 className="mt-0.5 font-bold text-ink" id="return-preview-title">Return · no case loaded</h2>
          </div>
          <button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button"><CloseIcon className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {['Status unavailable', 'Outcome unavailable', 'Condition unavailable'].map((label) => <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-bold text-ink-muted" key={label}>{label}</span>)}
          </div>

          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Original sale & device match</p>
            <div className="mt-2 flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" /><p><strong>Purchase not loaded.</strong> A detail drawer can verify an invoice and exact IMEI only after GET /returns/:id exists.</p>
            </div>
            <dl className="mt-2 divide-y divide-line overflow-hidden rounded-control border border-line text-sm">
              {['Original sale', 'Item', 'IMEI / quantity', 'Catalog match'].map((label) => <div className="flex justify-between gap-4 px-3 py-2.5" key={label}><dt className="text-ink-muted">{label}</dt><dd className="font-semibold text-ink-subtle">—</dd></div>)}
            </dl>
          </section>

          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Reason & evidence</p>
            <dl className="mt-2 divide-y divide-line overflow-hidden rounded-control border border-line text-sm">
              <div className="flex justify-between gap-4 px-3 py-2.5"><dt className="text-ink-muted">Reason</dt><dd className="font-semibold text-ink-subtle">—</dd></div>
              <div className="px-3 py-3"><dt className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Evidence on file</dt><dd className="mt-1 text-xs leading-5 text-ink-muted">Unavailable. The browser will not generate inspection evidence from a reason.</dd></div>
            </dl>
          </section>

          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Workflow timeline</p>
            <TimelinePreview />
          </section>

          <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" /><p>A returned unit <strong>cannot go straight to Available</strong>. The server must verify the original sale, lock the unit, record inspection, and atomically apply the selected outcome.</p>
          </div>

          <section>
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Inspection outcome</p><span className="text-xs text-ink-muted">Preview only</span></div>
            <div className="mt-2 flex flex-wrap gap-2">
              {RETURN_OUTCOME_OPTIONS.map((option) => {
                const active = outcome === option.id;
                const activeTone = option.tone === "negative" ? "border-negative bg-negative-soft text-negative" : option.tone === "warning" ? "border-warning bg-warning-soft text-warning" : "border-accent bg-accent-soft text-accent";
                return <button aria-pressed={active} className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${active ? activeTone : "border-line bg-surface text-ink-subtle hover:border-accent"}`} key={option.id} onClick={() => setOutcome(option.id)} type="button">{option.label}</button>;
              })}
            </div>
            {outcome === null ? (
              <div className="mt-3 rounded-control border border-info/25 bg-info-soft p-3 text-xs leading-5 text-info">Pick an outcome to review its required stock, finance and audit effects. Nothing will be processed.</div>
            ) : (
              <div className="mt-3 rounded-control border border-line bg-surface-subtle p-3">
                <p className="text-xs font-bold text-ink">Required impact</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-5 text-ink-muted">{returnOutcomeImpact(outcome).map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
          </section>

          <section className="rounded-control border border-dashed border-line p-3 text-xs leading-5 text-ink-muted">
            <p className="font-bold text-ink-subtle">Refund / exchange settlement</p>
            <p className="mt-1">Payment reversal, receivable correction, replacement sale and customer-credit options require the missing posting/exchange endpoints. No amount is calculated here.</p>
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <p className="text-xs text-ink-muted">{canApprove ? "returns.approve granted · endpoint missing" : "returns.approve required"}</p>
          <div className="flex gap-2"><button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onClose} type="button">Cancel</button><button className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled title="POST /returns/:id/post is not implemented" type="button">Process return · unavailable</button></div>
        </footer>
      </section>
    </div>
  );
}

function QueueTable({ tab }: { readonly tab: ReturnTab }): JSX.Element {
  const firstHeading = tab === "returns" ? "Return" : "Claim";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[68rem] border-collapse text-left">
        <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
          <tr>{[firstHeading, "Original sale", "Item", "IMEI", "Reason", "Condition", "Outcome", "Status"].map((heading) => <th className="px-4 py-3" key={heading} scope="col">{heading}</th>)}</tr>
        </thead>
        <tbody>
          <tr><td className="px-6 py-12 text-center" colSpan={8}><span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">{tab === "returns" ? <ReturnIcon className="size-6" /> : <ShieldCheckIcon className="size-6" />}</span><h3 className="mt-3 font-bold text-ink">{tab === "returns" ? "Returns queue unavailable" : "Warranty claims unavailable"}</h3><p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-ink-muted">{tab === "returns" ? "GET /returns is not implemented, so the screen cannot distinguish an empty queue from an unavailable queue and does not show fake cases." : "The Warranty module and claims contract are deferred. No open-claim count or case row is inferred."}</p></td></tr>
        </tbody>
      </table>
    </div>
  );
}

function BackendGapRegistry(): JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="border-b border-line px-4 py-4 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-ink">Backend gap registry</h2><p className="mt-1 text-xs leading-5 text-ink-muted">These are the exact dependencies still preventing Returns & Warranty from becoming transactional.</p></div><span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning">6 tracked gaps</span></div></header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
          <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">Surface</th><th className="px-4 py-3">Required contract</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Current safe behaviour</th></tr></thead>
          <tbody className="divide-y divide-line">{RETURN_BACKEND_GAPS.map((gap) => <tr key={gap.id}><td className="px-4 py-3 font-semibold text-ink-subtle">{gap.surface}</td><td className="px-4 py-3 font-mono text-xs text-ink-muted">{gap.endpoint}</td><td className="px-4 py-3"><UnavailableBadge deferred={gap.status === "deferred"} /></td><td className="max-w-xl px-4 py-3 text-xs leading-5 text-ink-muted">{gap.consequence}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function ReturnsWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const capabilities = returnCapabilities(auth.data?.permissions);
  const tab = returnTabFrom(new URLSearchParams(searchParams.toString()));
  const switchTab = (nextTab: ReturnTab): void => {
    const query = returnRouteQuery(new URLSearchParams(searchParams.toString()), nextTab);
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  if (auth.isPending && auth.data === undefined) return <ReturnsLoading />;
  if (auth.isError || auth.data === undefined) return <ReturnsAccessRequired authFailed />;
  if (!capabilities.canView) return <ReturnsAccessRequired />;

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent"><ReturnIcon className="size-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">Customer care · Controlled intake</p><h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">Returns & Warranty</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">Take back faulty or unwanted devices safely — every unit passes inspection before it can be sold again.</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            {capabilities.canViewReports ? <Link className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" href="/reports?report=returns">Returns report →</Link> : <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-muted opacity-55" disabled title="reports.view permission required" type="button">Returns report →</button>}
            <button className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-55" disabled={!capabilities.canCreate} onClick={() => setNewOpen(true)} title={capabilities.canCreate ? "Open controlled return intake" : "returns.create permission required"} type="button"><PlusIcon className="size-4" /> New return</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-warning-soft px-3 py-1.5 text-warning">Returns API not implemented</span><span className="rounded-full bg-surface-subtle px-3 py-1.5 text-ink-subtle">No fabricated cases or KPIs</span><span className="rounded-full bg-info-soft px-3 py-1.5 text-info">{capabilities.canCreate ? "Intake permission granted" : "Read permission only"} · {capabilities.canApprove ? "Approval granted" : "Approval restricted"}</span></div>
      </header>

      <section className="flex items-start gap-3 rounded-card border border-info/25 bg-info-soft p-4 text-sm leading-6 text-info"><ShieldCheckIcon className="mt-0.5 size-5 shrink-0" /><p>A returned unit never goes <strong>straight back to Available</strong>. It is verified against the original sale, inspected, then either restocked, quarantined, claimed on warranty, or written off — with a full audit trail.</p></section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard accent label="Open returns" meta="Queue count unavailable · GET /returns missing" onClick={() => switchTab("returns")} />
        <MetricCard label="In inspection" meta="QC count unavailable · no Returns API" onClick={() => switchTab("returns")} />
        <MetricCard label="Warranty claims" meta="Supplier / customer claims contract deferred" onClick={() => switchTab("warranty")} />
        <MetricCard label="Return rate" meta="30-day returned / sold aggregate unavailable" />
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex overflow-x-auto border-b border-line bg-surface" role="tablist" aria-label="Returns and warranty queues">
          {RETURN_TABS.map((item) => <button aria-selected={tab === item.id} className={`min-h-12 whitespace-nowrap border-b-2 px-5 text-sm font-semibold ${tab === item.id ? "border-accent text-accent" : "border-transparent text-ink-muted hover:text-ink"}`} key={item.id} onClick={() => switchTab(item.id)} role="tab" type="button">{item.label}<span className="ml-2 rounded-full bg-surface-subtle px-2 py-0.5 text-[0.6875rem]">—</span></button>)}
        </div>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5"><div><h2 className="font-bold text-ink">{tab === "returns" ? "Returns queue" : "Warranty claims"}</h2><p className="mt-1 text-xs text-ink-muted">{tab === "returns" ? "Change-of-mind & faulty units · select a verified row to process" : "Faults under manufacturer or shop warranty · select a verified claim"}</p></div><UnavailableBadge deferred={tab === "warranty"} /></header>
        <QueueTable tab={tab} />
        <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-line bg-surface-subtle px-4 py-3">
          {tab === "returns" && capabilities.canCreate ? <button className="inline-flex min-h-9 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setNewOpen(true)} type="button"><PlusIcon className="size-3.5" /> New return</button> : null}
          <button className="min-h-9 rounded-control border border-line bg-surface px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setPreviewOpen(true)} type="button">Review processing workflow</button>
        </footer>
      </section>

      <BackendGapRegistry />

      <section className="grid gap-3 lg:grid-cols-3">
        {[['Gate 1', 'Original invoice and serialized unit must match a real posted sale.'], ['Gate 2', 'Returned stock enters Inspection, never Available directly.'], ['Gate 3', 'Restock, quarantine, supplier warranty and write-off require atomic inventory, finance and audit evidence.']].map(([label, description]) => <article className="rounded-card border border-line bg-surface p-4 shadow-card" key={label}><p className="text-xs font-bold uppercase tracking-wide text-accent">{label}</p><p className="mt-2 text-sm leading-6 text-ink-subtle">{description}</p></article>)}
      </section>

      {newOpen ? <NewReturnDrawer canViewSales={capabilities.canViewSales} onClose={() => setNewOpen(false)} /> : null}
      {previewOpen ? <ProcessingPreviewDrawer canApprove={capabilities.canApprove} onClose={() => setPreviewOpen(false)} /> : null}
    </div>
  );
}

export function ReturnsRouteFallback(): JSX.Element {
  return <ReturnsLoading />;
}
