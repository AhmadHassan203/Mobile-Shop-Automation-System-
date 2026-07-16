"use client";

import {
  FINANCIAL_SUMMARY_PERIODS,
  formatMoney,
  PERMISSIONS,
  toMinor,
  type DashboardAttention,
  type DashboardAttentionItem,
  type DashboardCountValue,
  type DashboardDemandAndBuying,
  type DashboardDigitalServices,
  type DashboardMoneyValue,
  type DashboardRecentSales,
  type DashboardSnapshot,
  type DashboardTodaysTasks,
  type FinancialSummaryPeriod,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type JSX, type ReactNode } from "react";
import {
  CatalogErrorState,
  CatalogForbiddenState,
} from "@/components/catalog/catalog-states";
import {
  ActivityIcon,
  AlertTriangleIcon,
  LockIcon,
  PlusIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { ApiError, toApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { dailyFinancialSummaryQueryOptions } from "@/lib/query/dashboard-summary-query";
import { dashboardQueryOptions } from "@/lib/query/dashboard-query";

const DIGITAL_METRICS = [
  { key: "sentToday", label: "Sent today", tone: "neutral" },
  { key: "receivedToday", label: "Received today", tone: "neutral" },
  {
    key: "customerFeesToday",
    label: "Customer fees today",
    tone: "earnings",
  },
  {
    key: "providerNetCommission",
    label: "Provider net commission",
    tone: "earnings",
  },
  {
    key: "netEarnings",
    label: "Net digital-service earnings",
    tone: "earnings",
  },
] as const;

type SectionUnavailable = {
  readonly availability: "unavailable" | "redacted";
  readonly message: string;
};

function hourInTimezone(date: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isInteger(hour) ? hour : null;
  } catch {
    return null;
  }
}

export function dashboardGreeting(date: Date, timezone: string): string {
  const hour = hourInTimezone(date, timezone);
  if (hour === null) return "Good day";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function dashboardDateLabel(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-PK", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return "Current business day";
  }
}

export function dashboardTimeLabel(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-PK", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Time unavailable";
  }
}

export function dashboardMoney(valueMinor: number, currency: string): string {
  return formatMoney(toMinor(valueMinor, "dashboard value"), currency);
}

export function dashboardErrorMessage(error: unknown): string {
  const apiError = toApiError(error);
  if (apiError.status === 403 || apiError.code === "FORBIDDEN_PERMISSION") {
    return "Your current permissions do not allow dashboard reporting.";
  }
  if (
    apiError.code === "NETWORK_ERROR" ||
    apiError.code === "REQUEST_TIMEOUT"
  ) {
    return "The reporting API could not be reached. No dashboard figures have been inferred.";
  }
  if (apiError.code === "INVALID_RESPONSE") {
    return "The reporting API returned an unexpected response. No unvalidated figures are shown.";
  }
  return "The dashboard snapshot could not be loaded. No fallback figures are shown.";
}

function trendLabel(basisPoints: number): string {
  const percentage = Math.abs(basisPoints) / 100;
  return new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 2,
  }).format(percentage);
}

function StatusPill({
  status,
}: {
  readonly status: "partial" | "unavailable" | "redacted";
}): JSX.Element {
  const styles =
    status === "partial"
      ? "border-warning/25 bg-warning-soft text-warning"
      : status === "redacted"
        ? "border-info/25 bg-info-soft text-info"
        : "border-line bg-surface-subtle text-ink-muted";
  const label =
    status === "partial"
      ? "Partial"
      : status === "redacted"
        ? "Restricted"
        : "Unavailable";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${styles}`}
    >
      {status === "redacted" ? <LockIcon className="mr-1 size-3" /> : null}
      {label}
    </span>
  );
}

function SectionNotice({ state }: { readonly state: SectionUnavailable }) {
  const redacted = state.availability === "redacted";
  return (
    <div
      className={`rounded-control border px-4 py-5 text-center ${
        redacted
          ? "border-info/25 bg-info-soft"
          : "border-dashed border-line bg-surface-subtle"
      }`}
      role="status"
    >
      <span
        className={`mx-auto grid size-9 place-items-center rounded-full ${
          redacted
            ? "bg-surface text-info"
            : "bg-surface text-ink-muted"
        }`}
      >
        {redacted ? (
          <LockIcon className="size-4" />
        ) : (
          <AlertTriangleIcon className="size-4" />
        )}
      </span>
      <p className="mt-2 text-sm font-bold text-ink">
        {redacted ? "Restricted" : "Unavailable"}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-ink-muted">
        {state.message}
      </p>
    </div>
  );
}

function PartialNotice({ children }: { readonly children: string }) {
  return (
    <div
      className="rounded-control border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning"
      role="status"
    >
      <strong>Partial data:</strong> {children}
    </div>
  );
}

function UnavailableInline({ state }: { readonly state: SectionUnavailable }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={state.message}>
      {state.availability === "redacted" ? (
        <LockIcon className="size-3 text-info" />
      ) : null}
      <span
        className={`text-xs font-semibold ${
          state.availability === "redacted"
            ? "text-info"
            : "text-ink-muted"
        }`}
      >
        {state.availability === "redacted" ? "Restricted" : "Unavailable"}
      </span>
    </span>
  );
}

function EmptyState({
  children,
  confirmed = false,
}: {
  readonly children: string;
  readonly confirmed?: boolean;
}) {
  return (
    <div className="rounded-control border border-dashed border-line bg-surface-subtle px-4 py-5 text-center">
      {confirmed ? (
        <ShieldCheckIcon className="mx-auto mb-2 size-5 text-positive" />
      ) : null}
      <p className="text-xs leading-5 text-ink-muted">{children}</p>
    </div>
  );
}

function MoneyInline({
  value,
  currency,
  tone = "neutral",
}: {
  readonly value: DashboardMoneyValue;
  readonly currency: string;
  readonly tone?: "neutral" | "earnings";
}) {
  if (value.availability === "unavailable") {
    return (
      <span className="inline-flex items-center gap-1.5" title={value.message}>
        <span className="font-sans text-xs font-semibold text-ink-muted">
          Unavailable
        </span>
      </span>
    );
  }
  if (value.availability === "redacted") {
    return (
      <span className="inline-flex items-center gap-1.5" title={value.message}>
        <LockIcon className="size-3 text-info" />
        <span className="font-sans text-xs font-semibold text-info">
          Restricted
        </span>
      </span>
    );
  }

  const valueTone =
    tone === "earnings" && value.valueMinor > 0
      ? "text-positive"
      : tone === "earnings" && value.valueMinor < 0
        ? "text-negative"
        : "text-ink";
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <span className={`font-mono font-bold ${valueTone}`}>
        {dashboardMoney(value.valueMinor, currency)}
      </span>
      {value.availability === "partial" ? (
        <span title={value.message}>
          <StatusPill status="partial" />
        </span>
      ) : null}
    </span>
  );
}

function CountInline({ value }: { readonly value: DashboardCountValue }) {
  if (value.availability === "unavailable") {
    return (
      <span className="text-xs font-semibold text-ink-muted" title={value.message}>
        Unavailable
      </span>
    );
  }
  if (value.availability === "redacted") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold text-info"
        title={value.message}
      >
        <LockIcon className="size-3" /> Restricted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono font-bold text-ink">
        {value.value.toLocaleString("en-PK")}
      </span>
      {value.availability === "partial" ? (
        <span title={value.message}>
          <StatusPill status="partial" />
        </span>
      ) : null}
    </span>
  );
}

function KpiTile({
  item,
  currency,
}: {
  readonly item: DashboardSnapshot["moneyKpis"][number];
  readonly currency: string;
}) {
  const value = item.value;
  const valueLabel =
    value.availability === "redacted"
      ? "Restricted"
      : value.availability === "unavailable"
        ? "Unavailable"
        : dashboardMoney(value.valueMinor, currency);
  const valueClass =
    value.availability === "redacted"
      ? "text-info"
      : value.availability === "unavailable"
        ? "text-ink-muted"
        : "text-accent";

  return (
    <Link
      className={`min-h-32 rounded-card border border-line bg-surface p-4 no-underline shadow-card transition hover:-translate-y-0.5 hover:border-accent hover:shadow-overlay ${
        item.key === "sales_today" ? "border-t-[3px] border-t-accent pt-[0.875rem]" : ""
      }`}
      href={item.href}
      title={item.definition}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-ink-muted">{item.label}</p>
        {value.availability === "partial" ? (
          <StatusPill status="partial" />
        ) : value.availability === "redacted" ? (
          <StatusPill status="redacted" />
        ) : value.availability === "unavailable" ? (
          <StatusPill status="unavailable" />
        ) : null}
      </div>
      <p className={`mt-2 text-xl font-bold ${valueClass}`}>{valueLabel}</p>
      <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-4 text-ink-muted">
        {value.availability === "available" ? (
          <>
            {value.trendBasisPoints === undefined ||
            value.trendBasisPoints === null ? null : (
              <span
                className={
                  value.trendBasisPoints >= 0
                    ? "font-bold text-positive"
                    : "font-bold text-negative"
                }
              >
                {value.trendBasisPoints >= 0 ? "\u2191" : "\u2193"}{" "}
                {trendLabel(value.trendBasisPoints)}%{" "}
              </span>
            )}
            {value.meta}
          </>
        ) : value.availability === "partial" ? (
          value.message
        ) : (
          value.message
        )}
      </p>
    </Link>
  );
}

function severityClasses(severity: DashboardAttentionItem["severity"]): {
  readonly card: string;
  readonly dot: string;
  readonly chevron: string;
} {
  switch (severity) {
    case "negative":
      return {
        card: "border-line bg-surface",
        dot: "bg-negative-soft text-negative",
        chevron: "text-ink-muted",
      };
    case "warning":
      return {
        card: "border-line bg-surface",
        dot: "bg-warning-soft text-warning",
        chevron: "text-ink-muted",
      };
    case "positive":
      return {
        card: "border-line bg-surface",
        dot: "bg-positive-soft text-positive",
        chevron: "text-ink-muted",
      };
    case "info":
    default:
      return {
        card: "border-line bg-surface",
        dot: "bg-accent-soft text-accent-ink",
        chevron: "text-ink-muted",
      };
  }
}

function AttentionSection({ section }: { readonly section: DashboardAttention }) {
  if (
    section.availability === "unavailable" ||
    section.availability === "redacted"
  ) {
    return <SectionNotice state={section} />;
  }
  const items = [...section.items].sort(
    (left, right) => left.rank - right.rank,
  );
  return (
    <div className="space-y-2.5">
      {section.availability === "partial" ? (
        <PartialNotice>{section.message}</PartialNotice>
      ) : null}
      {items.length === 0 ? (
        <EmptyState confirmed={section.availability === "available"}>
          {section.availability === "available"
            ? "Nothing needs your attention in this snapshot."
            : "No exceptions from the live sources included in this partial snapshot."}
        </EmptyState>
      ) : (
        items.map((item) => {
          const styles = severityClasses(item.severity);
          return (
            <Link
                className={`flex items-start gap-3 rounded-control border px-[0.9375rem] py-[0.8125rem] no-underline transition hover:border-accent hover:shadow-card ${styles.card}`}
              href={item.href}
              key={item.id}
            >
              <span
                className={`grid size-[1.625rem] shrink-0 place-items-center rounded-control text-xs font-bold ${styles.dot}`}
              >
                {item.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-accent">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                  {item.detail}
                </span>
              </span>
              <span aria-hidden="true" className={`text-lg ${styles.chevron}`}>
                &rarr;
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}

function ProfitCell({
  value,
  currency,
}: {
  readonly value: DashboardMoneyValue;
  readonly currency: string;
}) {
  if (
    value.availability === "unavailable" ||
    value.availability === "redacted"
  ) {
    return <MoneyInline currency={currency} tone="earnings" value={value} />;
  }
  return <MoneyInline currency={currency} tone="earnings" value={value} />;
}

function RecentSalesSection({
  section,
  currency,
  timezone,
}: {
  readonly section: DashboardRecentSales;
  readonly currency: string;
  readonly timezone: string;
}) {
  const unavailable =
    section.availability === "unavailable" ||
    section.availability === "redacted";
  const items = unavailable ? [] : section.items.slice(0, 6);
  return (
    <>
      {section.availability === "partial" ? (
        <div className="border-b border-line p-3">
          <PartialNotice>{section.message}</PartialNotice>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[43rem] border-collapse text-left text-sm">
          <thead className="bg-surface-subtle text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Invoice</th>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 text-right font-semibold">Total</th>
              <th className="px-4 py-3 text-right font-semibold">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {unavailable ? (
              <tr>
                <td className="p-4" colSpan={6}>
                  <SectionNotice state={section} />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-center text-xs text-ink-muted" colSpan={6}>
                  No sales have been posted in this dashboard period.
                </td>
              </tr>
            ) : (
              items.map((sale) => (
                <tr className="transition hover:bg-surface-subtle" key={sale.id}>
                  <td className="px-4 py-3 font-mono font-bold">
                    <Link
                      aria-label={`Open sale ${sale.invoiceNumber}`}
                      className="text-accent no-underline hover:underline"
                      href={sale.href}
                    >
                      {sale.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {dashboardTimeLabel(sale.postedAt, timezone)}
                  </td>
                  <td className="px-4 py-3 text-ink">{sale.customerName}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-line bg-surface-subtle px-2 py-1 text-xs text-ink-muted">
                      {sale.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                    {dashboardMoney(sale.totalMinor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ProfitCell currency={currency} value={sale.profit} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MoneySummaryRow({
  label,
  value,
  currency,
  tone,
}: {
  readonly label: string;
  readonly value: DashboardMoneyValue;
  readonly currency: string;
  readonly tone?: "neutral" | "earnings";
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-xs leading-5 text-ink-muted">{label}</dt>
      <dd className="max-w-[60%] text-right">
        <MoneyInline
          currency={currency}
          value={value}
          {...(tone === undefined ? {} : { tone })}
        />
      </dd>
    </div>
  );
}

function DemandAndBuyingSection({
  section,
  currency,
  canReview,
}: {
  readonly section: DashboardDemandAndBuying;
  readonly currency: string;
  readonly canReview: boolean;
}) {
  if (
    section.availability === "unavailable" ||
    section.availability === "redacted"
  ) {
    return (
      <div className="space-y-4">
        <SectionNotice state={section} />
        <div>
          <p className="mb-2 text-xs text-ink-muted">
            Top requested items you couldn&apos;t sell
          </p>
          <EmptyState>Demand ranking is unavailable.</EmptyState>
        </div>
        <dl className="divide-y divide-line-subtle border-y border-line-subtle">
          {[
            "Recommended budget",
            "Selected investment",
            "Expected gross profit",
          ].map((label) => (
            <div
              className="flex items-center justify-between gap-3 py-2.5"
              key={label}
            >
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd>
                <UnavailableInline state={section} />
              </dd>
            </div>
          ))}
        </dl>
        {canReview ? (
          <Link
            className="block w-full rounded-control bg-accent px-4 py-2.5 text-center text-sm font-bold text-white no-underline hover:bg-accent-strong"
            href="/intelligence"
          >
            Review buying plan &rarr;
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {section.availability === "partial" ? (
        <PartialNotice>{section.message}</PartialNotice>
      ) : null}
      <div>
        <p className="mb-2 text-xs text-ink-muted">
          Top requested items you couldn&apos;t sell
        </p>
        <div className="space-y-1.5">
          {section.data.topUnmet.length === 0 ? (
            <EmptyState>
              No unmet customer requests are in this snapshot.
            </EmptyState>
          ) : (
            section.data.topUnmet.map((item) => (
              <Link
                className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 text-inherit no-underline hover:bg-surface-subtle"
                href={item.href}
                key={item.key}
              >
                <span className="min-w-0 truncate text-xs">{item.name}</span>
                <span className="shrink-0 rounded-full bg-negative-soft px-2 py-1 text-[0.6875rem] font-bold text-negative">
                  {item.waitingQuantity.toLocaleString("en-PK")} waiting
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
      <dl className="divide-y divide-line-subtle border-y border-line-subtle">
        <MoneySummaryRow
          currency={currency}
          label="Recommended budget"
          value={section.data.recommendedBudget}
        />
        <MoneySummaryRow
          currency={currency}
          label="Selected investment"
          value={section.data.selectedInvestment}
        />
        <MoneySummaryRow
          currency={currency}
          label="Expected gross profit"
          tone="earnings"
          value={section.data.expectedGrossProfit}
        />
      </dl>
      {canReview ? (
        <Link
          className="block w-full rounded-control bg-accent px-4 py-2.5 text-center text-sm font-bold text-white no-underline hover:bg-accent-strong"
          href="/intelligence"
        >
          Review buying plan &rarr;
        </Link>
      ) : null}
    </div>
  );
}

function DigitalServicesSection({
  section,
  currency,
  canRecord,
}: {
  readonly section: DashboardDigitalServices;
  readonly currency: string;
  readonly canRecord: boolean;
}) {
  if (
    section.availability === "unavailable" ||
    section.availability === "redacted"
  ) {
    return (
      <div>
        <SectionNotice state={section} />
        <dl className="mt-3 divide-y divide-line-subtle">
          {[
            "Sent today",
            "Received today",
            "Customer fees today",
            "Provider net commission",
            "Net digital-service earnings",
            "Pending transactions",
          ].map((label) => (
            <div
              className="flex items-center justify-between gap-3 py-2.5"
              key={label}
            >
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd>
                <UnavailableInline state={section} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="my-3 border-t border-line-subtle" />
        <p className="text-xs text-ink-muted">
          Digital-service action queue unavailable.
        </p>
        {canRecord ? (
          <Link
            className="mt-4 block w-full rounded-control bg-accent px-4 py-2.5 text-center text-sm font-bold text-white no-underline hover:bg-accent-strong"
            href="/digital/new"
          >
            Record digital service &rarr;
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <div>
      {section.availability === "partial" ? (
        <div className="mb-3">
          <PartialNotice>{section.message}</PartialNotice>
        </div>
      ) : null}
      <dl className="divide-y divide-line-subtle">
        {DIGITAL_METRICS.map((metric) => (
          <MoneySummaryRow
            currency={currency}
            key={metric.key}
            label={metric.label}
            tone={metric.tone}
            value={section.data[metric.key]}
          />
        ))}
        <div className="flex items-start justify-between gap-3 py-2.5">
          <dt className="text-xs leading-5 text-ink-muted">
            Pending transactions
          </dt>
          <dd>
            <CountInline value={section.data.pendingTransactions} />
          </dd>
        </div>
      </dl>
      <div className="my-3 border-t border-line-subtle" />
      <div aria-label="Digital service action queue" className="space-y-1.5">
        {section.data.actionQueue.length === 0 ? (
          <p className="py-1 text-xs text-ink-muted">
            No digital-service action items.
          </p>
        ) : (
          section.data.actionQueue.map((item) => {
            const styles = severityClasses(item.severity);
            return (
              <Link
                className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 text-inherit no-underline hover:bg-surface-subtle"
                href={item.href}
                key={item.id}
                title={item.detail}
              >
                <span className="min-w-0 text-xs leading-5">{item.title}</span>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold ${styles.dot}`}
                >
                  {item.rank}
                </span>
              </Link>
            );
          })
        )}
      </div>
      {canRecord ? (
        <Link
          className="mt-4 block w-full rounded-control bg-accent px-4 py-2.5 text-center text-sm font-bold text-white no-underline hover:bg-accent-strong"
          href="/digital/new"
        >
          Record digital service &rarr;
        </Link>
      ) : null}
    </div>
  );
}

function TasksSection({ section }: { readonly section: DashboardTodaysTasks }) {
  if (
    section.availability === "unavailable" ||
    section.availability === "redacted"
  ) {
    return <SectionNotice state={section} />;
  }
  return (
    <div className="space-y-2">
      {section.availability === "partial" ? (
        <PartialNotice>{section.message}</PartialNotice>
      ) : null}
      {section.items.length === 0 ? (
        <EmptyState>No tasks are due in this dashboard period.</EmptyState>
      ) : (
        section.items.slice(0, 4).map((task) => {
          const badge =
            task.priority === "high"
              ? "bg-negative-soft text-negative"
              : task.priority === "medium"
                ? "bg-warning-soft text-warning"
                : "border border-line bg-surface-subtle text-ink-muted";
          return (
            <Link
              className="flex items-center justify-between gap-3 rounded-control px-2 py-2 text-inherit no-underline hover:bg-surface-subtle"
              href={task.href}
              key={task.id}
            >
              <span className="max-w-[76%] text-xs leading-5">{task.title}</span>
              <span className={`rounded-full px-2 py-1 text-[0.6875rem] font-bold ${badge}`}>
                {task.dueLabel}
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-label="Loading dashboard analytics" className="space-y-5" role="status">
      <span className="sr-only">Loading dashboard analytics</span>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-32 animate-pulse rounded-card border border-line bg-line-subtle/65"
            key={index}
          />
        ))}
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="h-72 animate-pulse rounded-card border border-line bg-line-subtle/65" />
          <div className="h-80 animate-pulse rounded-card border border-line bg-line-subtle/65" />
        </div>
        <div className="space-y-4">
          <div className="h-72 animate-pulse rounded-card border border-line bg-line-subtle/65" />
          <div className="h-80 animate-pulse rounded-card border border-line bg-line-subtle/65" />
          <div className="h-52 animate-pulse rounded-card border border-line bg-line-subtle/65" />
        </div>
      </div>
    </div>
  );
}

function DashboardError({
  error,
  retrying,
  onRetry,
}: {
  readonly error: unknown;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}) {
  const apiError = error instanceof ApiError ? error : toApiError(error);
  return (
    <section
      className="rounded-card border border-negative/25 bg-surface p-6 shadow-card"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
          <AlertTriangleIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-bold text-ink">Dashboard analytics unavailable</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            {dashboardErrorMessage(apiError)}
          </p>
          {apiError.requestId === undefined ? null : (
            <p className="mt-2 font-mono text-xs text-ink-muted">
              Ref: {apiError.requestId}
            </p>
          )}
          <button
            className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-xs font-bold text-white hover:bg-accent-strong disabled:opacity-60"
            disabled={retrying}
            onClick={onRetry}
            type="button"
          >
            <RefreshIcon className={`size-4 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying..." : "Retry dashboard"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Card({
  title,
  hint,
  action,
  children,
  id,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly id?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <h2 className="font-bold text-ink" id={id}>
          {title}
        </h2>
        {hint === undefined ? null : (
          <span className="ml-auto text-xs text-ink-muted">{hint}</span>
        )}
        {action === undefined ? null : <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const SUMMARY_PERIOD_LABELS: Readonly<Record<FinancialSummaryPeriod, string>> =
  Object.freeze({ day: "Day", week: "Week", month: "Month" });

/**
 * The reconciled financial roll-up with a day/week/month toggle. Every figure is
 * the server's, from GET /dashboard/summary; a zero note is shown when the period
 * has no posted activity so an empty period never reads as a broken one.
 */
function FinancialSummarySection({
  currency,
}: {
  readonly currency: string;
}): JSX.Element {
  const [period, setPeriod] = useState<FinancialSummaryPeriod>("day");
  const summary = useQuery(dailyFinancialSummaryQueryOptions({ period }, true));

  let body: JSX.Element;
  if (summary.isPending) {
    body = (
      <div
        aria-label="Loading financial summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        role="status"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-24 animate-pulse rounded-card border border-line bg-line-subtle/65"
            key={index}
          />
        ))}
      </div>
    );
  } else if (summary.data === undefined) {
    const error = toApiError(summary.error);
    body =
      error.status === 403 || error.code === "FORBIDDEN_PERMISSION" ? (
        <CatalogForbiddenState
          description="Your current permissions do not allow the financial summary. No figures are shown."
          title="Financial summary not permitted"
        />
      ) : (
        <CatalogErrorState
          description="The financial summary API could not be reached. No fallback figures are shown."
          onRetry={() => {
            void summary.refetch();
          }}
          title="Financial summary unavailable"
          {...(error.requestId === undefined
            ? {}
            : { requestId: error.requestId })}
        />
      );
  } else {
    const data = summary.data;
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                  {dashboardMoney(tile.minor, currency)}
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
    <section
      aria-labelledby="financial-summary-heading"
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <h2 className="font-bold text-ink" id="financial-summary-heading">
          Financial summary
        </h2>
        <div className="ml-auto flex rounded-control border border-line p-0.5">
          {FINANCIAL_SUMMARY_PERIODS.map((value) => (
            <button
              aria-pressed={period === value}
              className={`rounded-control px-3 py-1 text-xs font-bold ${
                period === value
                  ? "bg-accent text-white"
                  : "text-ink-muted hover:bg-surface-subtle"
              }`}
              key={value}
              onClick={() => setPeriod(value)}
              type="button"
            >
              {SUMMARY_PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">{body}</div>
    </section>
  );
}

export function WorkspaceDashboard() {
  const auth = useQuery(currentAuthQueryOptions);
  const dashboard = useQuery({
    ...dashboardQueryOptions,
    enabled: auth.data !== undefined,
  });
  const permissions = auth.data?.permissions ?? [];
  const canRecordDemand = permissions.includes(PERMISSIONS.DEMAND_CREATE);
  const canCreateSale = permissions.includes(PERMISSIONS.SALES_CREATE);
  const canViewSales = permissions.includes(PERMISSIONS.SALES_VIEW);
  const canReviewBuying = permissions.includes(
    PERMISSIONS.RECOMMENDATIONS_VIEW,
  );
  const canRecordDigital = permissions.includes(
    PERMISSIONS.EXTERNAL_SERVICES_RECORD,
  );
  const timezone = auth.data?.organization.timezone ?? "Asia/Karachi";
  const instant = dashboard.data?.asOf
    ? new Date(dashboard.data.asOf)
    : new Date();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            {dashboardGreeting(instant, timezone)}
            {auth.data?.user.fullName ? `, ${auth.data.user.fullName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Here&apos;s what happened at{" "}
            {auth.data?.organization.name ?? "your shop"} today
            {auth.data === undefined ? null : (
              <> &mdash; {dashboardDateLabel(instant, timezone)}</>
            )}
          </p>
        </div>
        {canRecordDemand || canCreateSale ? (
          <div className="flex flex-wrap gap-2">
            {canRecordDemand ? (
              <Link
                className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-3.5 py-2 text-sm font-bold text-ink no-underline shadow-card hover:bg-surface-subtle"
                href="/demand"
              >
                <ActivityIcon className="size-4" /> Record demand
              </Link>
            ) : null}
            {canCreateSale ? (
              <Link
                className="inline-flex items-center gap-2 rounded-control bg-accent px-3.5 py-2 text-sm font-bold text-white no-underline shadow-card hover:bg-accent-strong"
                href="/sell"
              >
                <PlusIcon className="size-4" /> New sale
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      {auth.data === undefined ? null : (
        <FinancialSummarySection currency={auth.data.organization.currency} />
      )}

      {auth.isPending || (dashboard.isPending && dashboard.data === undefined) ? (
        <DashboardSkeleton />
      ) : auth.isError ? (
        <DashboardError
          error={auth.error}
          onRetry={() => void auth.refetch()}
          retrying={auth.isFetching}
        />
      ) : dashboard.isError || dashboard.data === undefined ? (
        <DashboardError
          error={dashboard.error}
          onRetry={() => void dashboard.refetch()}
          retrying={dashboard.isFetching}
        />
      ) : (
        <>
          <section
            aria-label="Today's business analytics"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          >
            {dashboard.data.moneyKpis.map((item) => (
              <KpiTile
                currency={auth.data.organization.currency}
                item={item}
                key={item.key}
              />
            ))}
          </section>

          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-4 xl:col-span-2">
              <Card
                hint="Ranked by impact · click to open"
                id="attention-heading"
                title="Needs your attention"
              >
                <AttentionSection section={dashboard.data.attention} />
              </Card>

              <section
                aria-labelledby="recent-sales-heading"
                className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card"
              >
                <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                  <h2 className="font-bold text-ink" id="recent-sales-heading">
                    Recent sales
                  </h2>
                  {canViewSales ? (
                    <Link
                      className="ml-auto text-xs font-bold text-accent"
                      href="/finance"
                    >
                      View all &rarr;
                    </Link>
                  ) : null}
                </div>
                <RecentSalesSection
                  currency={auth.data.organization.currency}
                  section={dashboard.data.recentSales}
                  timezone={timezone}
                />
              </section>
            </div>

            <aside className="min-w-0 space-y-4">
              <Card title="Demand & buying">
                <DemandAndBuyingSection
                  canReview={canReviewBuying}
                  currency={auth.data.organization.currency}
                  section={dashboard.data.demandAndBuying}
                />
              </Card>

              <Card
                action={
                  canRecordDigital ? (
                    <Link
                      className="text-xs font-semibold text-accent"
                      href="/digital/new"
                    >
                      New transaction
                    </Link>
                  ) : undefined
                }
                title="Digital Services"
              >
                <DigitalServicesSection
                  canRecord={canRecordDigital}
                  currency={auth.data.organization.currency}
                  section={dashboard.data.digitalServices}
                />
              </Card>

              <Card
                action={
                  <Link
                    className="text-xs font-semibold text-accent"
                    href="/tasks"
                  >
                    All tasks
                  </Link>
                }
                title="Today's tasks"
              >
                <TasksSection section={dashboard.data.todaysTasks} />
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
