"use client";

import {
  FINANCIAL_SUMMARY_PERIODS,
  formatMoney,
  toMinor,
  type FinancialSummaryPeriod,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type JSX } from "react";
import {
  CatalogErrorState,
  CatalogForbiddenState,
} from "@/components/catalog/catalog-states";
import {
  BoxIcon,
  CloseIcon,
  LayersIcon,
  LockIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { toApiError } from "@/lib/api/client";
import type { SalesTrendPoint } from "@/lib/api/reports";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { dailyFinancialSummaryQueryOptions } from "@/lib/query/dashboard-summary-query";
import {
  salesTrendQueryOptions,
  topProductsQueryOptions,
} from "@/lib/query/reports-query";
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

const SUMMARY_PERIOD_LABELS: Readonly<Record<FinancialSummaryPeriod, string>> =
  Object.freeze({ day: "Day", week: "Week", month: "Month" });

function money(valueMinor: number, currency: string): string {
  return formatMoney(toMinor(valueMinor, "reports value"), currency);
}

/** Whole-unit amount without the currency symbol, for tight chart labels. */
function compactAmount(valueMinor: number, currency: string): string {
  const [whole] = formatMoney(toMinor(valueMinor, "reports value"), currency, {
    withSymbol: false,
  }).split(".");
  return whole ?? "0";
}

function shortBusinessDay(businessDate: string): string {
  const day = businessDate.slice(8, 10);
  return day.startsWith("0") ? day.slice(1) : day;
}

function SummaryPeriodToggle({
  period,
  onChange,
}: {
  readonly period: FinancialSummaryPeriod;
  readonly onChange: (next: FinancialSummaryPeriod) => void;
}): JSX.Element {
  return (
    <div className="flex rounded-control border border-line p-0.5">
      {FINANCIAL_SUMMARY_PERIODS.map((value) => (
        <button
          aria-pressed={period === value}
          className={`rounded-control px-3 py-1 text-xs font-bold ${
            period === value
              ? "bg-accent text-white"
              : "text-ink-muted hover:bg-surface-subtle"
          }`}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          {SUMMARY_PERIOD_LABELS[value]}
        </button>
      ))}
    </div>
  );
}

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

function PanelError({
  error,
  onRetry,
  title,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly title: string;
}): JSX.Element {
  const apiError = toApiError(error);
  if (apiError.status === 403 || apiError.code === "FORBIDDEN_PERMISSION") {
    return (
      <CatalogForbiddenState
        description="Your current permissions do not allow this financial report. No figures are shown."
        title="Financial report not permitted"
      />
    );
  }
  return (
    <CatalogErrorState
      description="The reporting API could not be reached. No fallback or sample figures are shown."
      onRetry={onRetry}
      title={title}
      {...(apiError.requestId === undefined
        ? {}
        : { requestId: apiError.requestId })}
    />
  );
}

function FinancialAnalyticsRestricted(): JSX.Element {
  return (
    <section className="rounded-card border border-info/20 bg-info-soft p-5 text-info">
      <div className="flex items-start gap-3">
        <LockIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="text-base font-semibold">
            Financial analytics restricted
          </h2>
          <p className="mt-1 text-sm leading-6">
            Live profit, sales-trend and top-product analytics require
            reports.view_financial. The report catalogue below is still
            available; no financial figures were requested.
          </p>
        </div>
      </div>
    </section>
  );
}

function ProfitSummaryPanel({
  currency,
}: {
  readonly currency: string;
}): JSX.Element {
  const [period, setPeriod] = useState<FinancialSummaryPeriod>("day");
  const summary = useQuery(dailyFinancialSummaryQueryOptions({ period }, true));
  const data = summary.data;

  let body: JSX.Element;
  if (summary.isPending) {
    body = (
      <div
        aria-label="Loading profit summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        role="status"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-24 animate-pulse rounded-card bg-line-subtle"
            key={index}
          />
        ))}
      </div>
    );
  } else if (data === undefined) {
    body = (
      <PanelError
        error={summary.error}
        onRetry={() => {
          void summary.refetch();
        }}
        title="Profit summary unavailable"
      />
    );
  } else {
    const tiles = [
      { label: "Sales revenue", minor: data.salesRevenueMinor, earnings: false },
      { label: "COGS", minor: data.cogsMinor, earnings: false },
      { label: "Gross profit", minor: data.grossProfitMinor, earnings: true },
      {
        label: "Service profit",
        minor: data.serviceProfitMinor,
        earnings: true,
      },
      { label: "Expenses", minor: data.expensesMinor, earnings: false },
      {
        label: "Estimated net profit",
        minor: data.estimatedNetProfitMinor,
        earnings: true,
      },
    ] as const;
    const empty = data.salesCount === 0 && data.externalTxnCount === 0;
    body = (
      <div className="space-y-3">
        {empty ? (
          <p className="rounded-control border border-dashed border-line bg-surface-subtle px-4 py-3 text-center text-xs text-ink-muted">
            No posted sales or external transactions in this period yet. Figures
            update as activity is recorded.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => {
            const toneClass =
              tile.earnings && tile.minor > 0
                ? "text-positive"
                : tile.earnings && tile.minor < 0
                  ? "text-negative"
                  : "text-ink";
            return (
              <div
                className="min-h-24 rounded-card border border-line bg-surface p-4 shadow-card"
                key={tile.label}
              >
                <p className="text-xs font-semibold text-ink-muted">
                  {tile.label}
                </p>
                <p className={`mt-2 font-mono text-lg font-bold ${toneClass}`}>
                  {money(tile.minor, currency)}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[0.6875rem] leading-5 text-ink-muted">
          {data.from === data.to
            ? `Business date ${data.from}`
            : `${data.from} — ${data.to}`}{" "}
          · {data.salesCount.toLocaleString("en-PK")} sales ·{" "}
          {data.externalTxnCount.toLocaleString("en-PK")} external transactions.
          Estimated net profit = gross profit + service profit − expenses.
        </p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div>
          <h2 className="font-bold text-ink">Profit &amp; loss</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Reconciled from posted sales, service profit and expenses
          </p>
        </div>
        <SummaryPeriodToggle onChange={setPeriod} period={period} />
      </div>
      <div className="p-4 sm:p-5">{body}</div>
    </section>
  );
}

function SalesTrendBars({
  currency,
  points,
}: {
  readonly currency: string;
  readonly points: readonly SalesTrendPoint[];
}): JSX.Element {
  const maxRevenue = Math.max(...points.map((point) => point.salesRevenueMinor));
  const lastIndex = points.length - 1;
  return (
    <div className="flex h-52 items-end gap-2 border-b border-line sm:gap-4">
      {points.map((point, index) => {
        const isToday = index === lastIndex;
        const heightPercent =
          maxRevenue > 0
            ? Math.max(4, Math.round((point.salesRevenueMinor / maxRevenue) * 100))
            : 2;
        return (
          <div
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            key={point.businessDate}
            title={`${point.businessDate}: ${money(point.salesRevenueMinor, currency)} · ${point.salesCount.toLocaleString("en-PK")} sales`}
          >
            <span className="mb-2 text-center text-[0.6875rem] font-bold text-ink-muted">
              {point.salesRevenueMinor > 0
                ? compactAmount(point.salesRevenueMinor, currency)
                : "—"}
            </span>
            <span
              className={`mx-auto block w-full max-w-12 rounded-t-control ${isToday ? "bg-accent" : "bg-accent-soft"}`}
              style={{ height: `${heightPercent}%` }}
            />
            <span
              className={`mt-2 pb-2 text-center text-[0.6875rem] ${isToday ? "font-semibold text-accent" : "text-ink-muted"}`}
            >
              {isToday ? "Today" : shortBusinessDay(point.businessDate)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SalesTrendPanel({
  currency,
}: {
  readonly currency: string;
}): JSX.Element {
  const trend = useQuery(salesTrendQueryOptions({ days: 7 }, true));
  const data = trend.data;

  let body: JSX.Element;
  let hint = "Posted sales by business day";
  if (trend.isPending) {
    body = (
      <div
        aria-label="Loading sales trend"
        className="h-52 animate-pulse rounded-card bg-line-subtle"
        role="status"
      />
    );
  } else if (data === undefined) {
    body = (
      <PanelError
        error={trend.error}
        onRetry={() => {
          void trend.refetch();
        }}
        title="Sales trend unavailable"
      />
    );
  } else {
    const total = data.points.reduce(
      (sum, point) => sum + point.salesRevenueMinor,
      0,
    );
    const average = data.points.length === 0 ? 0 : Math.round(total / data.points.length);
    hint = `Total ${money(total, currency)} · avg ${money(average, currency)}/day`;
    body =
      total === 0 ? (
        <div>
          <SalesTrendBars currency={currency} points={data.points} />
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            No posted sales in the last {data.days} business days. Bars fill from
            immutable posted-sale totals as sales are recorded.
          </p>
        </div>
      ) : (
        <div>
          <SalesTrendBars currency={currency} points={data.points} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-ink-muted">
              {data.from} — {data.to} · revenue per business day at posted totals.
            </p>
            <Link className="text-xs font-semibold text-accent" href="/finance">
              Open Daily sales &amp; profit →
            </Link>
          </div>
        </div>
      );
  }

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <h2 className="font-bold text-ink">Sales — last 7 days</h2>
        <span className="text-xs text-ink-muted">{hint}</span>
      </div>
      <div className="p-4 sm:p-5">{body}</div>
    </section>
  );
}

function TopProductsPanel({
  currency,
}: {
  readonly currency: string;
}): JSX.Element {
  const [period, setPeriod] = useState<FinancialSummaryPeriod>("month");
  const products = useQuery(topProductsQueryOptions({ period, limit: 5 }, true));
  const data = products.data;

  let body: JSX.Element;
  if (products.isPending) {
    body = (
      <div
        aria-label="Loading top products"
        className="space-y-2"
        role="status"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="h-11 animate-pulse rounded-control bg-line-subtle"
            key={index}
          />
        ))}
      </div>
    );
  } else if (data === undefined) {
    body = (
      <PanelError
        error={products.error}
        onRetry={() => {
          void products.refetch();
        }}
        title="Top products unavailable"
      />
    );
  } else if (data.items.length === 0) {
    body = (
      <p className="rounded-control border border-dashed border-line bg-surface-subtle px-4 py-8 text-center text-xs text-ink-muted">
        No posted sale lines in {data.from} — {data.to}. Rankings appear as sales
        post.
      </p>
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead className="border-b border-line text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-2 pr-3">Product</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="py-2 pl-3 text-right">Gross profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {data.items.map((item) => (
              <tr key={item.productVariantId}>
                <td className="py-2.5 pr-3">
                  <span className="block font-semibold text-ink">
                    {item.name}
                  </span>
                  <span className="block font-mono text-[0.6875rem] text-ink-muted">
                    {item.sku}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-ink">
                  {item.unitsSold.toLocaleString("en-PK")}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink">
                  {money(item.revenueMinor, currency)}
                </td>
                <td
                  className={`py-2.5 pl-3 text-right font-mono font-semibold ${item.grossProfitMinor >= 0 ? "text-positive" : "text-negative"}`}
                >
                  {money(item.grossProfitMinor, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-control bg-accent-soft text-accent">
            <BoxIcon className="size-4" />
          </span>
          <h2 className="font-bold text-ink">Top products by revenue</h2>
        </div>
        <SummaryPeriodToggle onChange={setPeriod} period={period} />
      </div>
      <div className="p-4 sm:p-5">{body}</div>
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
  const currency = auth.data.organization.currency;
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

      {capabilities.canViewFinancial ? (
        <div className="space-y-4">
          <ProfitSummaryPanel currency={currency} />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <SalesTrendPanel currency={currency} />
            <TopProductsPanel currency={currency} />
          </div>
        </div>
      ) : (
        <FinancialAnalyticsRestricted />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-ink-muted">
        <p>
          Standard report catalogue across {REPORT_GROUP_ORDER.length} areas ·
          execution &amp; export API pending
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
