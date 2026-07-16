"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  ClockIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  normalizeServiceSearch,
  SERVICE_MODULES,
  serviceAccess,
  type ServiceField,
  type ServiceModuleId,
} from "./service-state";

const controlClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70 focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted";

function ModuleSkeleton(): JSX.Element {
  return (
    <div
      aria-label="Loading service workspace"
      className="space-y-4"
      role="status"
    >
      <div className="h-36 animate-pulse rounded-card border border-line bg-surface" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-24 animate-pulse rounded-card border border-line bg-surface"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

function AccessRequired(): JSX.Element {
  return (
    <section className="rounded-card border border-warning/30 bg-warning-soft p-6 shadow-card">
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 size-6 shrink-0 text-warning" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-warning">
            Returns access required
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink">
            This queue is permission protected
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-subtle">
            Your signed-in role does not include returns.view. No returns data
            was requested and no workflow action is available.
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  meta,
}: {
  readonly label: string;
  readonly meta: string;
}): JSX.Element {
  return (
    <article className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink">—</p>
      <p className="mt-1 text-xs text-ink-muted">{meta}</p>
    </article>
  );
}

function FieldPreview({
  field,
}: {
  readonly field: ServiceField;
}): JSX.Element {
  const common = {
    "aria-label": field.label,
    className: controlClass,
    disabled: true,
  } as const;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-subtle">
        {field.label}
      </span>
      {field.kind === "textarea" ? (
        <textarea {...common} placeholder={field.placeholder} rows={3} />
      ) : field.kind === "select" ? (
        <select {...common} defaultValue="">
          <option value="">{field.placeholder}</option>
        </select>
      ) : (
        <input {...common} placeholder={field.placeholder} />
      )}
    </label>
  );
}

function ReturnsDecisionPreview(): JSX.Element {
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        Inspection outcome
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[
          "Restock after inspection",
          "Quarantine",
          "Supplier warranty",
          "Write-off",
        ].map((outcome) => (
          <button
            className="rounded-full border border-line bg-surface-subtle px-3 py-2 text-xs font-semibold text-ink-muted"
            disabled
            key={outcome}
            type="button"
          >
            {outcome}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-control border border-info/25 bg-info-soft p-3 text-sm text-ink-subtle">
        Picked outcomes will explain their stock-ledger and finance impact here.
        Processing stays blocked until inspection evidence and the backend
        contract are available.
      </div>
    </section>
  );
}

function RepairImpactPreview(): JSX.Element {
  return (
    <section className="rounded-control border border-line bg-surface-subtle p-3 text-sm text-ink-subtle">
      <p className="font-semibold text-ink">Booking impact</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
        <li>A verified job will enter the Received column.</li>
        <li>Technician and promised date will be attached to its history.</li>
        <li>
          Repair revenue will post only through a validated Finance contract.
        </li>
      </ul>
    </section>
  );
}

function UsedIntakeControlsPreview(): JSX.Element {
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2 rounded-control border border-line p-3 text-xs leading-5 text-ink-subtle">
        <input className="mt-0.5" disabled type="checkbox" />
        Seller consents to identity capture and Police e-Gadget verification,
        and confirms lawful ownership. Required before intake.
      </label>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
          Physical inspection checklist
        </p>
        <div className="mt-2 grid gap-2">
          {[
            "Display — no dead pixels / burn-in",
            "Touch — full digitiser response",
            "Cameras — front & rear",
            "Battery & charging — holds charge",
          ].map((check) => (
            <label
              className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2.5 text-xs text-ink-subtle"
              key={check}
            >
              {check}
              <input disabled type="checkbox" />
            </label>
          ))}
        </div>
      </div>
      <button
        className="min-h-10 w-full rounded-control border border-line bg-surface-subtle px-4 text-sm font-semibold text-ink-muted"
        disabled
        type="button"
      >
        Verify IMEI / PTA — integration pending
      </button>
    </div>
  );
}

function WorkflowDrawer({
  moduleId,
  onClose,
  previewMode,
}: {
  readonly moduleId: ServiceModuleId;
  readonly onClose: () => void;
  readonly previewMode: "new" | "detail";
}): JSX.Element {
  const config = SERVICE_MODULES[moduleId];
  const detailMode = previewMode === "detail";
  const drawerTitle = detailMode
    ? moduleId === "returns"
      ? "Return processing"
      : "Repair job detail"
    : moduleId === "returns"
      ? "New return"
      : moduleId === "repairs"
        ? "Book a repair"
        : "New used-device intake";
  return (
    <div
      aria-label={`${config.title} workflow preview`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-sidebar/55"
      role="dialog"
    >
      <button
        aria-label="Close workflow preview"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <section className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-overlay">
        <header className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">
              Read-only preview
            </p>
            <h2 className="mt-1 text-xl font-bold text-ink">{drawerTitle}</h2>
          </div>
          <button
            aria-label="Close"
            className="rounded-control border border-line p-2 text-ink-muted hover:bg-surface-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex gap-3 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-ink-subtle">
            <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
            <p>
              The backend contract and persistence for this workflow are
              pending. Fields are visible for review, but saving is deliberately
              disabled.
            </p>
          </div>

          {detailMode ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-bold text-ink-muted">
                  Status unavailable
                </span>
                <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning">
                  No case loaded
                </span>
              </div>
              <div className="rounded-control border border-line bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-muted">
                  {moduleId === "returns"
                    ? "Original sale & device match"
                    : "Device in for repair"}
                </p>
                <p className="mt-2 font-semibold text-ink">—</p>
                <p className="mt-1 font-mono text-xs text-ink-muted">
                  {moduleId === "returns"
                    ? "Sale / IMEI not loaded"
                    : "IMEI not loaded"}
                </p>
              </div>
              <dl className="divide-y divide-line rounded-control border border-line px-3 text-sm">
                {(moduleId === "returns"
                  ? [
                      "Original sale",
                      "Item",
                      "IMEI",
                      "Reason",
                      "Evidence on file",
                    ]
                  : [
                      "Job ID",
                      "Reported issue",
                      "Parts",
                      "Technician",
                      "Booked in",
                      "Promised",
                      "Repair charge (customer)",
                    ]
                ).map((label) => (
                  <div
                    className="flex justify-between gap-4 py-2.5"
                    key={label}
                  >
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="text-ink">—</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
              Workflow
            </p>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
              {config.stages.map((stage, index) => (
                <li
                  className="flex items-center gap-2 rounded-control border border-line bg-surface-subtle px-3 py-2.5 text-sm font-semibold text-ink-subtle"
                  key={stage}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                    {index + 1}
                  </span>
                  {stage}
                </li>
              ))}
            </ol>
          </div>

          {detailMode ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              {config.fields.map((field) => (
                <FieldPreview field={field} key={field.label} />
              ))}
            </div>
          )}

          {moduleId === "returns" && detailMode ? (
            <ReturnsDecisionPreview />
          ) : null}
          {moduleId === "repairs" && !detailMode ? (
            <RepairImpactPreview />
          ) : null}
          {moduleId === "used-intake" && !detailMode ? (
            <UsedIntakeControlsPreview />
          ) : null}

          <div className="rounded-control border border-info/25 bg-info-soft p-3 text-sm text-ink-subtle">
            <p className="font-semibold text-info">Authorization status</p>
            <p className="mt-1">{config.permissionNote}</p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-xs text-ink-muted">No record will be created.</p>
          <div className="flex gap-2">
            <button
              className="min-h-10 rounded-control border border-line px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            {detailMode && moduleId === "repairs" ? (
              <button
                className="min-h-10 rounded-control border border-line bg-surface-subtle px-4 text-sm font-semibold text-ink-muted opacity-55"
                disabled
                type="button"
              >
                Advance stage
              </button>
            ) : null}
            <button
              className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-55"
              disabled
              type="button"
            >
              {detailMode
                ? moduleId === "returns"
                  ? "Process return"
                  : "Notify customer"
                : moduleId === "returns"
                  ? "Save to inspection"
                  : moduleId === "repairs"
                    ? "Book repair"
                    : "Save → send to Quarantine"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ReturnsTablePreview(): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[68rem] border-collapse text-left">
        <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
          <tr>
            {[
              "Return",
              "Original sale",
              "Item",
              "IMEI",
              "Reason",
              "Condition",
              "Outcome",
              "Status",
            ].map((heading) => (
              <th className="px-4 py-3 font-bold" key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
      </table>
    </div>
  );
}

function EmptyStageBoard({
  moduleId,
}: {
  readonly moduleId: ServiceModuleId;
}): JSX.Element | null {
  if (moduleId === "returns") return null;
  const config = SERVICE_MODULES[moduleId];
  return (
    <div className="overflow-x-auto p-4">
      <div
        className={`grid min-w-max gap-3 ${moduleId === "repairs" ? "grid-cols-5" : "grid-cols-4"}`}
      >
        {config.stages.map((stage, index) => (
          <section
            className="w-56 rounded-control border border-line bg-surface-subtle"
            key={stage}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <span className="text-xs font-bold text-ink-subtle">{stage}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] font-bold text-ink-muted">
                0
              </span>
            </header>
            <div className="m-3 flex min-h-24 flex-col items-center justify-center rounded-control border border-dashed border-line p-3 text-center">
              {index === 0 ? (
                <ClockIcon className="size-5 text-ink-muted" />
              ) : (
                <CheckCircleIcon className="size-5 text-ink-muted" />
              )}
              <p className="mt-2 text-xs text-ink-muted">No verified records</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function ServiceWorkspace({
  moduleId,
}: {
  readonly moduleId: ServiceModuleId;
}): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const [drawerMode, setDrawerMode] = useState<"new" | "detail" | null>(null);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const config = SERVICE_MODULES[moduleId];

  if (auth.data === undefined && auth.isPending) return <ModuleSkeleton />;
  const access = serviceAccess(moduleId, auth.data?.permissions);
  if (!access.canView) return <AccessRequired />;

  const metrics =
    moduleId === "returns"
      ? [
          { label: "Open returns", meta: "in the returns queue" },
          { label: "In inspection", meta: "must clear QC before restock" },
          { label: "Warranty claims", meta: "supplier / customer" },
          { label: "Return rate", meta: "30-day rate unavailable" },
        ]
      : moduleId === "repairs"
        ? [
            { label: "Active jobs", meta: "on the workshop board" },
            { label: "Awaiting parts", meta: "supplier follow-up" },
            { label: "Ready for pickup", meta: "awaiting customer" },
            { label: "Repair revenue", meta: "charged across open jobs" },
          ]
        : [
            { label: "In quarantine", meta: "blocked from sale" },
            { label: "Cleared · saleable", meta: "all gates passed" },
            {
              label: "Capital held in quarantine",
              meta: "approved value unavailable",
            },
            { label: "Potential resale margin", meta: "no valuation records" },
          ];

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">
              {config.eyebrow}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
              {config.title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
              {config.subtitle}
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={() => setDrawerMode("new")}
            type="button"
          >
            <PlusIcon className="size-4" />
            {config.actionLabel}
          </button>
          {moduleId === "returns" ? (
            <button
              className="min-h-10 rounded-control border border-line px-4 text-sm font-semibold text-ink-muted opacity-55"
              disabled
              type="button"
            >
              Returns report — API pending
            </button>
          ) : null}
          {moduleId === "repairs" ? (
            <a
              className="inline-flex min-h-10 items-center rounded-control border border-line px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
              href="/returns"
            >
              Returns / warranty →
            </a>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-warning-soft px-3 py-1.5 text-warning">
            Module API pending
          </span>
          <span className="rounded-full bg-surface-subtle px-3 py-1.5 text-ink-subtle">
            No fabricated records
          </span>
          <span className="rounded-full bg-info-soft px-3 py-1.5 text-info">
            {access.hasDedicatedPolicy
              ? access.canPrepare
                ? "Create permission granted"
                : "Read permission only"
              : "Authorization contract pending"}
          </span>
        </div>
      </header>

      <section
        className={`flex gap-3 rounded-card border p-4 text-sm text-ink-subtle ${moduleId === "used-intake" ? "border-negative/25 bg-negative-soft" : "border-info/25 bg-info-soft"}`}
      >
        <ShieldCheckIcon
          className={`mt-0.5 size-5 shrink-0 ${moduleId === "used-intake" ? "text-negative" : "text-info"}`}
        />
        <div>
          <p
            className={`font-semibold ${moduleId === "used-intake" ? "text-negative" : "text-info"}`}
          >
            {moduleId === "used-intake"
              ? "Saleable only after every gate passes"
              : "Operational safety gate"}
          </p>
          <p className="mt-0.5">
            {moduleId === "used-intake"
              ? "Identity, IMEI / PTA, Police e-Gadget, and physical inspection must all be independently verified. A screenshot or seller statement is not sufficient."
              : config.safeguards[0]}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{access.explanation}</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            meta={metric.meta}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <header className="border-b border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink">
                {config.queueTitle}
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                {config.queueDescription}
              </p>
            </div>
            <span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-semibold text-ink-muted">
              0 verified records
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search {config.title}</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-3 size-4 text-ink-muted" />
              <input
                className={`${controlClass} pl-9`}
                onBlur={(event) =>
                  setSearch(normalizeServiceSearch(event.target.value))
                }
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reference, customer, device or IMEI"
                value={search}
              />
            </label>
            <select
              aria-label="Status filter"
              className={`${controlClass} sm:w-52`}
              defaultValue="all"
            >
              <option value="all">All statuses</option>
              {config.stages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div
          className="flex overflow-x-auto border-b border-line"
          role="tablist"
        >
          {config.tabs.map((item, index) => (
            <button
              aria-selected={tab === index}
              className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-semibold ${tab === index ? "border-accent text-accent" : "border-transparent text-ink-muted hover:text-ink"}`}
              key={item}
              onClick={() => setTab(index)}
              role="tab"
              type="button"
            >
              {item}
              <span className="ml-2 rounded-full bg-surface-subtle px-2 py-0.5 text-[0.6875rem]">
                0
              </span>
            </button>
          ))}
        </div>

        {moduleId === "returns" ? <ReturnsTablePreview /> : null}

        <EmptyStageBoard moduleId={moduleId} />

        <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
            <ShieldCheckIcon className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-ink">
            {config.emptyTitle}
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-ink-muted">
            {config.emptyDescription}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
              onClick={() => setDrawerMode("new")}
              type="button"
            >
              Review intake layout
            </button>
            {moduleId === "used-intake" ? null : (
              <button
                className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
                onClick={() => setDrawerMode("detail")}
                type="button"
              >
                {moduleId === "returns"
                  ? "Review processing layout"
                  : "Review job detail layout"}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {config.safeguards.map((item, index) => (
          <article
            className="rounded-card border border-line bg-surface p-4 shadow-card"
            key={item}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-accent">
              Gate {index + 1}
            </p>
            <p className="mt-2 text-sm leading-6 text-ink-subtle">{item}</p>
          </article>
        ))}
      </section>

      {drawerMode !== null ? (
        <WorkflowDrawer
          moduleId={moduleId}
          onClose={() => setDrawerMode(null)}
          previewMode={drawerMode}
        />
      ) : null}
    </div>
  );
}

export function ServiceRouteFallback(): JSX.Element {
  return <ModuleSkeleton />;
}
