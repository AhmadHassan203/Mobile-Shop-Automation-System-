"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type JSX, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  PlusIcon,
  ReturnIcon,
  SearchIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from "@/components/ui/icons";
import { REPAIR_API_GAPS } from "@/lib/api/repairs";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  REPAIR_ISSUES,
  REPAIR_STAGES,
  normalizeRepairSearch,
  repairBookingImpact,
  repairCapabilities,
  repairRouteQuery,
  repairStageFrom,
  repairTimelineDescription,
  repairViewFrom,
  validateRepairDraft,
  type RepairDraft,
  type RepairIssue,
  type RepairStage,
  type RepairView,
} from "./repair-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-not-allowed disabled:opacity-55";

const EMPTY_DRAFT: RepairDraft = {
  device: "",
  imei: "",
  issue: "",
  technicianId: "",
  promisedDate: "",
  estimatedCharge: "",
};

function RepairsLoading(): JSX.Element {
  return (
    <div aria-label="Loading repairs workspace" className="space-y-4" role="status">
      <span className="sr-only">Loading repairs workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div className="h-24 animate-pulse rounded-card bg-line-subtle" key={index} />)}
      </div>
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

function RepairsAuthUnavailable(): JSX.Element {
  return (
    <section className="rounded-card border border-warning/30 bg-warning-soft p-6 shadow-card">
      <div className="flex items-start gap-3"><ShieldCheckIcon className="mt-0.5 size-6 shrink-0 text-warning" /><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-warning">Access could not be verified</p><h1 className="mt-1 text-xl font-bold text-ink">The current session is unavailable</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-subtle">No future repair data or related customer/device lookup was attempted. Restore the API connection and retry.</p></div></div>
    </section>
  );
}

function StageIcon({ stage, className = "size-4" }: { readonly stage: RepairStage; readonly className?: string }): JSX.Element {
  switch (stage) {
    case "received":
      return <ReturnIcon className={className} />;
    case "awaiting_parts":
      return <ClockIcon className={className} />;
    case "in_repair":
      return <WrenchIcon className={className} />;
    case "ready":
      return <CheckCircleIcon className={className} />;
    case "delivered":
      return <BoxIcon className={className} />;
  }
}

function MetricCard({
  accent = false,
  label,
  meta,
  onClick,
  positive = false,
}: {
  readonly accent?: boolean;
  readonly label: string;
  readonly meta: string;
  readonly onClick?: (() => void) | undefined;
  readonly positive?: boolean;
}): JSX.Element {
  const content = <><p className="text-xs font-semibold text-ink-muted">{label}</p><p className={`mt-2 text-2xl font-bold ${positive ? "text-positive" : accent ? "text-accent" : "text-ink"}`}>—</p><p className="mt-1 text-xs leading-5 text-ink-muted">{meta}</p></>;
  return onClick === undefined ? <article className={`rounded-card border bg-surface p-4 text-left shadow-card ${accent ? "border-accent/30" : "border-line"}`}>{content}</article> : <button className={`rounded-card border bg-surface p-4 text-left shadow-card hover:bg-surface-subtle ${accent ? "border-accent/30" : "border-line"}`} onClick={onClick} type="button">{content}</button>;
}

function Field({ children, error, label }: { readonly children: ReactNode; readonly error?: string | undefined; readonly label: string }): JSX.Element {
  return <label className="block text-xs font-semibold text-ink-subtle">{label}{children}{error === undefined ? null : <span className="mt-1 block text-xs leading-5 text-negative">{error}</span>}</label>;
}

export function RepairKanban({
  focusedStage,
  onBook,
}: {
  readonly focusedStage: RepairStage | null;
  readonly onBook: () => void;
}): JSX.Element {
  return (
    <div className="overflow-x-auto p-4 sm:p-5">
      <div className="flex min-w-max gap-3.5 pb-2" id="repair-kanban">
        {REPAIR_STAGES.map((stage) => (
          <section className={`flex w-[262px] shrink-0 flex-col rounded-card border bg-surface-subtle transition-shadow ${focusedStage === stage.id ? "border-accent shadow-[0_0_0_3px_var(--accent-soft)]" : "border-line"}`} data-stage={stage.id} id={`repair-stage-${stage.id}`} key={stage.id}>
            <header className="flex items-center gap-2 border-b border-line px-3.5 py-3"><span className="text-ink-muted"><StageIcon stage={stage.id} /></span><h3 className="text-[0.8125rem] font-bold text-ink-subtle">{stage.label}</h3><span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-bold text-ink-muted">—</span></header>
            <div className="flex min-h-44 flex-1 flex-col p-3">
              <div className="flex flex-1 flex-col items-center justify-center rounded-control border border-dashed border-line bg-surface px-3 py-5 text-center">
                <span className="grid size-9 place-items-center rounded-full bg-surface-subtle text-ink-muted"><StageIcon className="size-5" stage={stage.id} /></span>
                <p className="mt-3 text-xs font-bold text-ink-subtle">{stage.emptyTitle}</p>
                <p className="mt-1 text-[0.6875rem] leading-5 text-ink-muted">{stage.emptyDescription}</p>
                {stage.id === "received" ? <button className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onBook} type="button"><PlusIcon className="size-3.5" /> Book repair</button> : null}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function AllJobsUnavailable(): JSX.Element {
  const [search, setSearch] = useState("");
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-line bg-surface-subtle px-4 py-3 sm:flex-row">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Search repair jobs</span><SearchIcon className="pointer-events-none absolute left-3 top-3 size-4 text-ink-muted" /><input className="min-h-10 w-full rounded-control border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent" onBlur={(event) => setSearch(normalizeRepairSearch(event.target.value))} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, device, IMEI or technician…" value={search} /></label>
        <select aria-label="Repair stage filter" className="min-h-10 rounded-control border border-line bg-surface px-3 text-sm text-ink-muted" defaultValue="all"><option value="all">All stages</option>{REPAIR_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[64rem] border-collapse text-left"><thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted"><tr>{['Job', 'Device', 'IMEI', 'Issue', 'Technician', 'Stage', 'Promised', 'Charge'].map((heading) => <th className="px-4 py-3" key={heading}>{heading}</th>)}</tr></thead><tbody><tr><td className="px-6 py-12 text-center" colSpan={8}><span className="mx-auto grid size-11 place-items-center rounded-full bg-accent-soft text-accent"><WrenchIcon className="size-5" /></span><h3 className="mt-3 font-bold text-ink">All-jobs list unavailable</h3><p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-ink-muted">GET /repairs is deferred. Search and stage controls are ready, but no result or count is fabricated from prototype data.</p></td></tr></tbody></table></div>
    </div>
  );
}

function BookRepairDrawer({ onClose }: { readonly onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState<RepairDraft>(EMPTY_DRAFT);
  const errors = validateRepairDraft(draft);
  const update = <Key extends keyof RepairDraft>(key: Key, value: RepairDraft[Key]): void => setDraft((current) => ({ ...current, [key]: value }));
  const impact = repairBookingImpact(draft);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation"><button aria-label="Close repair booking drawer" className="absolute inset-0" onClick={onClose} type="button" /><section aria-labelledby="book-repair-title" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay" role="dialog">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><WrenchIcon className="size-5" /></span><div><p className="text-xs font-bold uppercase tracking-wide text-accent">Workshop intake</p><h2 className="mt-0.5 font-bold text-ink" id="book-repair-title">Book a repair</h2></div><button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button"><CloseIcon className="size-5" /></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning"><AlertTriangleIcon className="mt-0.5 size-4 shrink-0" /><p>Repairs are deferred and have no authorization or persistence contract. Fields can be reviewed, but nothing is booked, assigned, priced, or added to the board.</p></div>
        <Field error={draft.device.length > 0 ? errors.device : undefined} label="Device"><input className={controlClass} maxLength={200} onChange={(event) => update("device", event.target.value)} placeholder="e.g. Galaxy A16 128GB" value={draft.device} /><span className="mt-1 block font-normal text-ink-muted">Free text preserves the prototype flow and supports devices not sold by this shop; a catalog link requires the future repair contract.</span></Field>
        <Field error={draft.imei.length > 0 ? errors.imei : undefined} label="IMEI"><input className={`${controlClass} font-mono`} inputMode="numeric" maxLength={20} onChange={(event) => update("imei", event.target.value)} placeholder="15-digit IMEI" value={draft.imei} /><span className="mt-1 block font-normal text-ink-muted">Ties the job to a specific handset for warranty and audit.</span></Field>
        <Field label="Reported issue"><select className={controlClass} onChange={(event) => update("issue", event.target.value as RepairIssue | "")} value={draft.issue}><option value="">— Select the fault —</option>{REPAIR_ISSUES.map((issue) => <option key={issue} value={issue}>{issue}</option>)}</select></Field>
        <Field error={errors.technicianId} label="Technician"><select className={controlClass} disabled value=""><option value="">Technician directory unavailable</option></select><span className="mt-1 block font-normal text-ink-muted">The prototype’s hardcoded names are not reused. Assignment needs scoped staff identities and repair permissions.</span></Field>
        <Field error={draft.promisedDate.length > 0 ? errors.promisedDate : undefined} label="Promised date"><input className={controlClass} onChange={(event) => update("promisedDate", event.target.value)} type="date" value={draft.promisedDate} /><span className="mt-1 block font-normal text-ink-muted">No hardcoded “today” is used; overdue calculations belong to the server/business timezone contract.</span></Field>
        <Field error={draft.estimatedCharge.length > 0 ? errors.estimatedCharge : undefined} label="Estimated repair charge"><input className={controlClass} inputMode="decimal" min="0" onChange={(event) => update("estimatedCharge", event.target.value)} placeholder="e.g. 5000" step="0.01" type="number" value={draft.estimatedCharge} /><span className="mt-1 block font-normal text-ink-muted">Customer-facing estimate only. Finance posts an authoritative charge when a verified job completes.</span></Field>
        <section className="rounded-control border border-line bg-surface-subtle p-3"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Booking impact</p><ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-5 text-ink-subtle">{impact.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6"><p className="text-xs text-ink-muted">No record or expected revenue will be created.</p><div className="flex gap-2"><button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onClose} type="button">Cancel</button><button className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled title="POST /repairs and repair permissions are deferred" type="button">Book repair · unavailable</button></div></footer>
    </section></div>
  );
}

function JobDetailPreview({ onClose }: { readonly onClose: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45" role="presentation"><button aria-label="Close repair detail preview" className="absolute inset-0" onClick={onClose} type="button" /><section aria-labelledby="repair-detail-title" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay" role="dialog">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"><WrenchIcon className="size-5" /></span><div><p className="text-xs font-bold uppercase tracking-wide text-accent">Job detail contract preview</p><h2 className="mt-0.5 font-bold text-ink" id="repair-detail-title">Repair · no job loaded</h2></div><button aria-label="Close drawer" className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink" onClick={onClose} type="button"><CloseIcon className="size-5" /></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-bold text-ink-muted">Stage unavailable</span><span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-bold text-ink-muted">Technician unavailable</span></div>
        <section className="rounded-card border border-line p-4"><p className="text-xs text-ink-muted">Device in for repair</p><p className="mt-1 font-bold text-ink">—</p><p className="mt-1 font-mono text-xs text-ink-muted">IMEI unavailable</p></section>
        <div className="flex items-start gap-2.5 rounded-control border border-info/25 bg-info-soft p-3 text-xs leading-5 text-info"><ClockIcon className="mt-0.5 size-4 shrink-0" /><p><strong>Promised vs actual unavailable.</strong> The prototype’s hardcoded date is not reused. A real promised timestamp, business timezone and status history are required.</p></div>
        <dl className="divide-y divide-line overflow-hidden rounded-control border border-line text-sm">{['Job ID', 'Reported issue', 'Parts', 'Technician', 'Booked in', 'Promised', 'Repair charge (customer)'].map((label) => <div className="flex justify-between gap-4 px-3 py-2.5" key={label}><dt className="text-ink-muted">{label}</dt><dd className="font-semibold text-ink-subtle">—</dd></div>)}</dl>
        <section><p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Status history</p><ol className="relative ml-2 border-l border-line pl-5">{REPAIR_STAGES.map((stage) => <li className="relative pb-5 last:pb-0" key={stage.id}><span className="absolute -left-[1.64rem] top-0.5 size-3 rounded-full border-2 border-line bg-surface" /><p className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">Pending</p><p className="mt-0.5 text-sm font-bold text-ink-subtle">{stage.label}</p><p className="mt-0.5 text-xs leading-5 text-ink-muted">{repairTimelineDescription(stage.id)}</p></li>)}</ol></section>
        <section className="rounded-control border border-dashed border-line p-3 text-xs leading-5 text-ink-muted"><p className="font-bold text-ink-subtle">Customer notification</p><p className="mt-1">Pickup reminder and status-update actions remain visible but disabled. No notification adapter, consent context or persisted job exists.</p></section>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6"><p className="text-xs text-ink-muted">Repair permissions and transition endpoint unavailable</p><div className="flex flex-wrap gap-2"><button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-muted opacity-55" disabled type="button">Advance to next stage →</button><button className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55" disabled type="button">Notify customer · unavailable</button><button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={onClose} type="button">Close</button></div></footer>
    </section></div>
  );
}

function RepairGapRegistry(): JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5"><div><h2 className="font-bold text-ink">Repair backend gaps</h2><p className="mt-1 text-xs leading-5 text-ink-muted">Compact registry for the deferred contracts behind this visible workflow.</p></div><span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning">5 tracked gaps</span></header><div className="overflow-x-auto"><table className="w-full min-w-[58rem] border-collapse text-left text-sm"><thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">Surface</th><th className="px-4 py-3">Required contract</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Current safe behaviour</th></tr></thead><tbody className="divide-y divide-line">{REPAIR_API_GAPS.map((gap) => <tr key={gap.surface}><td className="px-4 py-3 font-semibold text-ink-subtle">{gap.label}</td><td className="px-4 py-3 font-mono text-xs text-ink-muted">{gap.requiredContract}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${gap.status === "deferred" ? "bg-warning-soft text-warning" : "bg-surface-subtle text-ink-muted"}`}>{gap.status === "deferred" ? "Deferred" : "Not implemented"}</span></td><td className="max-w-xl px-4 py-3 text-xs leading-5 text-ink-muted">{gap.safeBehaviour}</td></tr>)}</tbody></table></div></section>
  );
}

export function RepairsWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [focusedStage, setFocusedStage] = useState<RepairStage | null>(() => repairStageFrom(new URLSearchParams(searchParams.toString())));
  const capabilities = repairCapabilities(auth.data?.permissions);
  const view = repairViewFrom(new URLSearchParams(searchParams.toString()));
  const navigate = (update: { readonly view?: RepairView; readonly stage?: RepairStage | null }): void => {
    const query = repairRouteQuery(new URLSearchParams(searchParams.toString()), update);
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };
  const focusStage = (stage: RepairStage): void => {
    setFocusedStage(stage);
    navigate({ view: "board", stage });
    globalThis.setTimeout(() => document.getElementById(`repair-stage-${stage}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 0);
    globalThis.setTimeout(() => setFocusedStage(null), 1_600);
  };

  if (auth.isPending && auth.data === undefined) return <RepairsLoading />;
  if (auth.isError || auth.data === undefined) return <RepairsAuthUnavailable />;

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent"><WrenchIcon className="size-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">Workshop · Job control</p><h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">Repairs</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">Repairs are optional at launch — this board shows the flow: intake → parts → bench → pickup.</p></div></div><div className="flex flex-wrap items-center gap-2">{capabilities.canViewReturns ? <Link className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle" href="/returns">Returns / warranty →</Link> : <button className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-muted opacity-55" disabled title="returns.view permission required" type="button">Returns / warranty →</button>}<button className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong" onClick={() => setBookingOpen(true)} type="button"><PlusIcon className="size-4" /> New repair</button></div></div><div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-warning-soft px-3 py-1.5 text-warning">Feature deferred</span><span className="rounded-full bg-surface-subtle px-3 py-1.5 text-ink-subtle">No repair permission contract</span><span className="rounded-full bg-info-soft px-3 py-1.5 text-info">No fabricated jobs, staff, dates, money or success</span></div></header>

      <section className="flex items-start gap-3 rounded-card border border-info/25 bg-info-soft p-4 text-sm leading-6 text-info"><ShieldCheckIcon className="mt-0.5 size-5 shrink-0" /><p>Every job here carries an <strong>IMEI</strong>, a <strong>technician</strong> and a <strong>promised date</strong>. Repair charges post to {capabilities.canViewFinance ? <Link className="font-bold underline underline-offset-2" href="/finance">Finance</Link> : <strong>Finance</strong>}; warranty jobs cross-link to {capabilities.canViewReturns ? <Link className="font-bold underline underline-offset-2" href="/returns">Returns</Link> : <strong>Returns</strong>}.</p></section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard accent label="Active jobs" meta="Workshop count unavailable · API deferred" onClick={() => { navigate({ view: "board", stage: null }); document.getElementById('repair-kanban')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} /><MetricCard label="Awaiting parts" meta="Supplier-wait count unavailable" onClick={() => focusStage("awaiting_parts")} /><MetricCard label="Ready for pickup" meta="Pickup count unavailable · notifications disabled" onClick={() => focusStage("ready")} positive /><MetricCard label="Repair revenue" meta="No verified completed-job charges" /></section>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5"><div><h2 className="font-bold text-ink">Workshop board</h2><p className="mt-1 text-xs text-ink-muted">Five-stage linear workflow · select a verified job for detail when the API exists</p></div><div className="flex flex-wrap gap-2"><button className="min-h-8 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle" onClick={() => setDetailOpen(true)} type="button">Review job detail workflow</button><div className="inline-flex rounded-control border border-line bg-surface-subtle p-0.5"><button aria-pressed={view === "board"} className={`min-h-7 rounded-[0.35rem] px-3 text-xs font-semibold ${view === "board" ? "bg-surface text-accent shadow-sm" : "text-ink-muted"}`} onClick={() => navigate({ view: "board" })} type="button">Board</button><button aria-pressed={view === "all"} className={`min-h-7 rounded-[0.35rem] px-3 text-xs font-semibold ${view === "all" ? "bg-surface text-accent shadow-sm" : "text-ink-muted"}`} onClick={() => navigate({ view: "all" })} type="button">All jobs</button></div></div></header>{view === "board" ? <RepairKanban focusedStage={focusedStage} onBook={() => setBookingOpen(true)} /> : <AllJobsUnavailable />}</section>

      <RepairGapRegistry />

      {bookingOpen ? <BookRepairDrawer onClose={() => setBookingOpen(false)} /> : null}
      {detailOpen ? <JobDetailPreview onClose={() => setDetailOpen(false)} /> : null}
    </div>
  );
}

export function RepairsRouteFallback(): JSX.Element {
  return <RepairsLoading />;
}
