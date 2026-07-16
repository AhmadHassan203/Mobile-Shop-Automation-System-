"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type JSX } from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CloseIcon,
  LayersIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  REPORT_GROUP_ORDER,
  REPORT_RANGES,
  canPreviewReport,
  reportCapabilities,
  reportRangeFrom,
  reportRangeQuery,
  reportsByGroup,
  type ReportDefinition,
} from "./reports-state";

function ReportsIcon({
  className = "size-5",
}: {
  readonly className?: string;
}): JSX.Element {
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
      <path d="M4 4v16h16" />
      <path d="M8 16V9M12 16V5M16 16v-4" />
    </svg>
  );
}

function ReportsLoading(): JSX.Element {
  return (
    <div
      aria-label="Loading reports workspace"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading reports workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-72 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-card bg-line-subtle" />
        <div className="h-72 animate-pulse rounded-card bg-line-subtle" />
      </div>
    </div>
  );
}

function DigitalKpi({
  label,
  meta,
  accent = false,
}: {
  readonly accent?: boolean;
  readonly label: string;
  readonly meta: string;
}): JSX.Element {
  return (
    <article
      className={`rounded-card border bg-surface p-4 shadow-card ${accent ? "border-accent/35" : "border-line"}`}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${accent ? "text-positive" : "text-ink"}`}
      >
        —
      </p>
      <p className="mt-1 text-xs text-ink-muted">{meta}</p>
    </article>
  );
}

function SalesTrend(): JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <h2 className="font-bold text-ink">Sales — last 6 days</h2>
        <span className="text-xs text-ink-muted">
          Average and total · Sales API pending
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <div
          aria-label="Sales trend unavailable"
          className="flex h-52 items-end gap-2 border-b border-line sm:gap-4"
          role="img"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              key={index}
            >
              <span className="mb-2 text-center text-xs font-bold text-ink-muted">
                —
              </span>
              <span
                className={`mx-auto block h-8 w-full max-w-12 rounded-t-control border border-dashed ${index === 5 ? "border-accent/50 bg-accent-soft" : "border-line bg-surface-subtle"}`}
              />
              <span
                className={`mt-2 pb-2 text-center text-[0.6875rem] ${index === 5 ? "font-semibold text-accent" : "text-ink-muted"}`}
              >
                {index === 5 ? "Today" : `Day ${index + 1}`}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-ink-muted">
            Bars remain empty until immutable posted-sale totals are available
            for each business day.
          </p>
          <Link className="text-xs font-semibold text-accent" href="/finance">
            Open Daily sales &amp; profit →
          </Link>
        </div>
      </div>
    </section>
  );
}

function ReportDrawer({
  canExport,
  onClose,
  rangeLabel,
  report,
}: {
  readonly canExport: boolean;
  readonly onClose: () => void;
  readonly rangeLabel: string;
  readonly report: ReportDefinition;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45"
      role="presentation"
    >
      <button
        aria-label="Close report preview"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="report-preview-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <ReportsIcon />
          </span>
          <div>
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.09em] text-ink-muted">
              {report.group} report · planned
            </p>
            <h2 className="mt-0.5 font-bold text-ink" id="report-preview-title">
              {report.name}
            </h2>
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
          <p className="text-sm leading-6 text-ink-muted">
            {report.description}
          </p>
          <section>
            <h3 className="text-xs font-semibold text-ink-muted">
              Columns in this report
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {report.columns.map((column) => (
                <span
                  className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-ink-subtle"
                  key={column}
                >
                  {column}
                </span>
              ))}
            </div>
          </section>
          <dl className="divide-y divide-line-subtle rounded-card border border-line px-4 py-1 text-sm">
            {[
              ["Report group", report.group],
              ["Coverage", rangeLabel],
              ["Last generated", "Not generated · report API pending"],
              ["Export formats", "CSV · XLSX · PDF"],
            ].map(([label, value]) => (
              <div className="flex justify-between gap-4 py-3" key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-semibold text-ink-subtle">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-start gap-2.5 rounded-control border border-info/20 bg-info-soft p-3 text-xs leading-5 text-info">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
            Dashboard drill-downs will open this report definition with the
            matching verified filters. No cached or sample result rows are
            shown.
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          {(["CSV", "XLSX", "PDF"] as const).map((format) => (
            <button
              className="min-h-9 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink-subtle opacity-50"
              disabled
              key={format}
              title={
                canExport
                  ? "Report export API pending"
                  : "reports.export permission required"
              }
              type="button"
            >
              Export {format}
            </button>
          ))}
          <Link
            className="inline-flex min-h-9 items-center rounded-control bg-accent px-3.5 text-xs font-semibold text-white no-underline"
            href={report.href}
          >
            Open live view →
          </Link>
        </footer>
      </section>
    </div>
  );
}

export function ReportsWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<ReportDefinition | null>(null);

  if (auth.data === undefined && auth.isPending) return <ReportsLoading />;
  if (auth.isError || auth.data === undefined) {
    return (
      <CatalogForbiddenState
        description="The current session could not be checked, so no report definitions or financial analytics were requested."
        title="Report access could not be verified"
      />
    );
  }
  const capabilities = reportCapabilities(auth.data.permissions);
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing the report catalogue requires reports.view. No report request was sent."
        title="Reports access required"
      />
    );
  }
  const range = reportRangeFrom(new URLSearchParams(searchParams.toString()));
  const rangeLabel =
    REPORT_RANGES.find((item) => item.id === range)?.label ?? "This month";
  const grouped = reportsByGroup();
  const changeRange = (nextRange: typeof range): void => {
    const query = reportRangeQuery(
      new URLSearchParams(searchParams.toString()),
      nextRange,
    );
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
              <ReportsIcon />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">
                Reports · Traceable analytics
              </p>
              <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
                Reports
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
                Every number in MobileShop OS must trace back to a report, its
                filters and source records.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="report-range">
              Report date range
            </label>
            <select
              className="min-h-10 rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink-subtle outline-none focus:border-accent"
              id="report-range"
              onChange={(event) =>
                changeRange(event.target.value as typeof range)
              }
              value={range}
            >
              {REPORT_RANGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-50"
              disabled
              title={
                capabilities.canExport
                  ? "Report export API pending"
                  : "reports.export permission required"
              }
              type="button"
            >
              <ReportsIcon className="size-4" /> Export all (CSV)
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-start gap-2.5 rounded-card border border-warning/25 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        The planned catalogue and drill-down structure are ready. Report
        execution and exports remain disabled until the reporting API can return
        permission-scoped source data.
      </div>

      <SalesTrend />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DigitalKpi
          label="Digital principal sent"
          meta="Not sales revenue · API pending"
        />
        <DigitalKpi
          label="Digital principal received"
          meta="Not sales revenue · API pending"
        />
        <DigitalKpi
          accent
          label="Net digital earnings"
          meta="Fees + net commission − charges"
        />
        <DigitalKpi
          label="Pending digital txns"
          meta="Excluded from settled earnings"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-ink-muted">
        <p>
          Planned standard report catalogue across {REPORT_GROUP_ORDER.length}{" "}
          areas · API pending
        </p>
        <p className="flex items-center gap-1.5">
          Formats:{" "}
          {(["CSV", "XLSX", "PDF"] as const).map((format) => (
            <span
              className="rounded-full bg-surface px-2 py-1 font-semibold shadow-card"
              key={format}
            >
              {format}
            </span>
          ))}
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {REPORT_GROUP_ORDER.map((group) => {
          const reports = grouped.get(group) ?? [];
          return (
            <section
              className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
              key={group}
            >
              <div className="flex items-center gap-3 border-b border-line px-4 py-4 sm:px-5">
                <span className="grid size-8 place-items-center rounded-control bg-accent-soft text-xs font-bold text-accent">
                  {group.slice(0, 2).toUpperCase()}
                </span>
                <h2 className="font-bold text-ink">{group}</h2>
                <span className="ml-auto text-xs text-ink-muted">
                  {reports.length} planned report
                  {reports.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="divide-y divide-line-subtle px-4 sm:px-5">
                {reports.map((report) => {
                  const allowed = canPreviewReport(report, capabilities);
                  return (
                    <div
                      className="flex items-center gap-3 py-3"
                      key={report.name}
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        disabled={!allowed}
                        onClick={() => setSelected(report)}
                        type="button"
                      >
                        <span className="block text-sm font-semibold text-ink">
                          {report.name}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                          {allowed
                            ? report.description
                            : "Financial report permission required."}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          className="min-h-8 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle disabled:opacity-45"
                          disabled={!allowed}
                          onClick={() => setSelected(report)}
                          type="button"
                        >
                          {allowed ? "Open" : "Locked"}
                        </button>
                        {(["CSV", "XLSX", "PDF"] as const).map((format) => (
                          <button
                            className="hidden min-h-7 rounded-control border border-line px-2 text-[0.625rem] font-bold text-ink-muted opacity-45 sm:block"
                            disabled
                            key={format}
                            title={
                              capabilities.canExport
                                ? "Report export API pending"
                                : "reports.export permission required"
                            }
                            type="button"
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-sm leading-6 text-info">
        <LayersIcon className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong>Exports and drill-downs.</strong> Each report will export CSV,
          XLSX or PDF from the permission-scoped data model, and dashboard
          metrics will land on the matching definition and filter set here.
        </p>
      </div>

      {selected === null ? null : (
        <ReportDrawer
          canExport={capabilities.canExport}
          onClose={() => setSelected(null)}
          rangeLabel={rangeLabel}
          report={selected}
        />
      )}
    </div>
  );
}
