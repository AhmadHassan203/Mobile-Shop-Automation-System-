"use client";

import { formatMoney, toMinor } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import {
  CatalogErrorState,
  CatalogForbiddenState,
} from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  LayersIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { toApiError } from "@/lib/api/client";
import type { ReorderReport, ReorderSuggestion } from "@/lib/api/reports";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { reorderSuggestionsQueryOptions } from "@/lib/query/reports-query";
import {
  intelligenceCapabilities,
  nextRecommendationExpanded,
  type IntelligenceCapabilities,
} from "./intelligence-state";

const CONFIDENCE_STYLE: Readonly<Record<ReorderSuggestion["confidence"], string>> =
  Object.freeze({
    high: "border-positive/30 bg-positive-soft text-positive",
    medium: "border-warning/30 bg-warning-soft text-warning",
    low: "border-line bg-surface-subtle text-ink-muted",
  });

function money(valueMinor: number, currency: string): string {
  return formatMoney(toMinor(valueMinor, "intelligence value"), currency);
}

function moneyOrDash(valueMinor: number | null, currency: string): string {
  return valueMinor === null ? "—" : money(valueMinor, currency);
}

function roiLabel(roiBasisPoints: number | null): string {
  return roiBasisPoints === null
    ? "—"
    : `${Math.round(roiBasisPoints / 100).toLocaleString("en-PK")}%`;
}

function IntelligenceIcon({
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
      <path d="M9 18h6M10 22h4" />
      <path d="M8.3 15.5A7 7 0 1 1 15.7 15.5c-.5.35-.7.85-.7 1.5H9c0-.65-.2-1.15-.7-1.5Z" />
      <path d="m9.5 10 1.6 1.6 3.6-4" />
    </svg>
  );
}

function IntelligenceLoading(): JSX.Element {
  return (
    <div
      aria-label="Loading buying intelligence"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading buying intelligence</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-56 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

function PlanMetric({
  label,
  value,
  tone = "ink",
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "ink" | "muted" | "positive";
}): JSX.Element {
  const color =
    tone === "positive"
      ? "text-positive"
      : tone === "muted"
        ? "text-ink-subtle"
        : "text-ink";
  return (
    <div className="min-w-36 flex-1">
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className={`mt-1 font-mono text-xl font-bold ${color}`}>{value}</dd>
    </div>
  );
}

/**
 * Totals derived only from the suggestions actually shown. A configured purchase
 * budget and liquidity buffer are not modelled anywhere yet, so they are stated
 * as unavailable rather than invented.
 */
function PlanSummary({
  report,
  currency,
}: {
  readonly report: ReorderReport;
  readonly currency: string;
}): JSX.Element {
  const roiBasisPoints =
    report.totalEstCostMinor > 0
      ? Math.round(
          (report.totalExpProfitMinor / report.totalEstCostMinor) * 10_000,
        )
      : null;
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <h2 className="font-bold text-ink">Plan summary</h2>
        <span className="text-xs text-ink-muted">
          {report.costCoverage.costed}/{report.costCoverage.total} suggestions
          costed
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <dl className="flex flex-wrap gap-x-7 gap-y-5 divide-line md:divide-x">
          <PlanMetric
            label="Suggested investment"
            value={money(report.totalEstCostMinor, currency)}
          />
          <PlanMetric
            label="Expected gross profit"
            tone="positive"
            value={money(report.totalExpProfitMinor, currency)}
          />
          <PlanMetric label="Expected ROI" value={roiLabel(roiBasisPoints)} />
          <PlanMetric
            label="Suggestions"
            value={report.suggestions.length.toLocaleString("en-PK")}
          />
        </dl>
        <div className="mt-3 flex items-start gap-2.5 rounded-control border border-dashed border-info/30 bg-info-soft px-3 py-2.5 text-xs leading-5 text-info">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          Totals cover only the ranked suggestions below and exclude
          uncosted items. A configured purchase budget and liquidity buffer are
          not modelled yet, so no investable ceiling is enforced here.
        </div>
      </div>
    </section>
  );
}

function SuggestionDetail({
  suggestion,
  currency,
  windowDays,
  capabilities,
}: {
  readonly suggestion: ReorderSuggestion;
  readonly currency: string;
  readonly windowDays: number;
  readonly capabilities: IntelligenceCapabilities;
}): JSX.Element {
  const decisionTitle = capabilities.canDecide
    ? "Recommendation decisions are not built yet"
    : "recommendations.decide permission required";
  const decisionClass =
    "min-h-9 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink-subtle opacity-50";
  const reasons = [
    `Sales velocity: ${suggestion.windowUnitsSold.toLocaleString("en-PK")} sold in the last ${windowDays} days.`,
    suggestion.demandOpenCount > 0
      ? `Unmet demand: ${suggestion.demandOpenCount.toLocaleString("en-PK")} open matched customer request${suggestion.demandOpenCount === 1 ? "" : "s"}.`
      : "Unmet demand: no open matched requests.",
    suggestion.coverDaysRemaining === null
      ? `Stock cover: ${suggestion.availableUnits.toLocaleString("en-PK")} available; no recent sales to project cover.`
      : `Stock cover: ${suggestion.coverDaysRemaining.toLocaleString("en-PK")} day${suggestion.coverDaysRemaining === 1 ? "" : "s"} of cover at current velocity.`,
    suggestion.unitProfitMinor === null
      ? "Expected margin: no recent sale lines to derive unit profit."
      : `Expected margin: ${money(suggestion.unitProfitMinor, currency)} gross profit per unit (recent sales).`,
  ];
  return (
    <div className="border-t border-line bg-surface-subtle p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            Why the engine recommends this
          </p>
          <div className="mt-2 space-y-2">
            {reasons.map((reason) => (
              <div
                className="flex items-start gap-2 text-sm text-ink-muted"
                key={reason}
              >
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-positive" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            Cost &amp; return basis
          </p>
          <dl className="mt-1 divide-y divide-line-subtle text-sm">
            {[
              [
                "Unit landed cost",
                moneyOrDash(suggestion.unitLandedCostMinor, currency),
              ],
              [
                "Estimated cost",
                moneyOrDash(suggestion.estCostMinor, currency),
              ],
              [
                "Expected profit",
                moneyOrDash(suggestion.expProfitMinor, currency),
              ],
              ["ROI", roiLabel(suggestion.roiBasisPoints)],
              ["Supplier / lead time", "Not available"],
            ].map(([label, value]) => (
              <div className="flex justify-between gap-3 py-2" key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="font-semibold text-ink-subtle">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      {suggestion.confidence === "low" ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          Low confidence: sparse sales evidence. Treat the recommended quantity
          as a test order.
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {(["Accept", "− Reduce qty", "＋ Increase", "Defer", "Reject"] as const).map(
          (label) => (
            <button
              className={decisionClass}
              disabled
              key={label}
              title={decisionTitle}
              type="button"
            >
              {label}
            </button>
          ),
        )}
        <button
          className={decisionClass}
          disabled
          title={
            capabilities.canCreatePurchaseOrders
              ? "Draft PO creation is not built yet"
              : "purchases.create permission required"
          }
          type="button"
        >
          Create draft PO
        </button>
        <span className="ml-auto text-xs text-ink-muted">
          Read-only suggestion · decisions &amp; PO creation pending
        </span>
      </div>
    </div>
  );
}

function RecommendationsTable({
  report,
  currency,
  capabilities,
}: {
  readonly report: ReorderReport;
  readonly currency: string;
  readonly capabilities: IntelligenceCapabilities;
}): JSX.Element {
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const headers = [
    "Product",
    "Avail · Inb · Resv",
    `${report.windowDays}d sold`,
    "Unmet",
    "Cover",
    "Lead",
    "Rec qty",
    "Est. cost",
    "Exp. profit",
    "ROI",
    "Confidence",
    "Score",
    "",
  ] as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
        <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
          <tr>
            {headers.map((label, index) => (
              <th
                className={`px-3 py-3 ${(index >= 2 && index <= 9) || index === 11 ? "text-right" : ""}`}
                key={label === "" ? "actions" : label}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {report.suggestions.map((suggestion) => {
            const open = expanded.includes(suggestion.productVariantId);
            return (
              <>
                <tr
                  className="align-top hover:bg-surface-subtle"
                  key={suggestion.productVariantId}
                >
                  <td className="px-3 py-3">
                    <span className="block font-semibold text-ink">
                      {suggestion.name}
                    </span>
                    <span className="block font-mono text-[0.6875rem] text-ink-muted">
                      {suggestion.sku}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-ink-subtle">
                    {suggestion.availableUnits.toLocaleString("en-PK")} · — ·{" "}
                    {suggestion.reservedUnits.toLocaleString("en-PK")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-ink">
                    {suggestion.windowUnitsSold.toLocaleString("en-PK")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-ink">
                    {suggestion.demandOpenCount.toLocaleString("en-PK")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-ink-subtle">
                    {suggestion.coverDaysRemaining === null
                      ? "—"
                      : `${suggestion.coverDaysRemaining.toLocaleString("en-PK")}d`}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-ink-muted">
                    —
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-ink">
                    {suggestion.recommendedQty.toLocaleString("en-PK")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-ink">
                    {moneyOrDash(suggestion.estCostMinor, currency)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-positive">
                    {moneyOrDash(suggestion.expProfitMinor, currency)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-ink-subtle">
                    {roiLabel(suggestion.roiBasisPoints)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${CONFIDENCE_STYLE[suggestion.confidence]}`}
                    >
                      {suggestion.confidence}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-ink">
                    {suggestion.score.toLocaleString("en-PK")}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      aria-expanded={open}
                      className="min-h-8 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface"
                      onClick={() =>
                        setExpanded((current) =>
                          nextRecommendationExpanded(
                            current,
                            suggestion.productVariantId,
                          ),
                        )
                      }
                      type="button"
                    >
                      {open ? "Hide" : "Why"}
                    </button>
                  </td>
                </tr>
                {open ? (
                  <tr key={`${suggestion.productVariantId}-detail`}>
                    <td className="p-0" colSpan={headers.length}>
                      <SuggestionDetail
                        capabilities={capabilities}
                        currency={currency}
                        suggestion={suggestion}
                        windowDays={report.windowDays}
                      />
                    </td>
                  </tr>
                ) : null}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function IntelligenceWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const permissions = auth.data?.permissions;
  const capabilities = intelligenceCapabilities(permissions);
  const suggestions = useQuery(
    reorderSuggestionsQueryOptions(
      { windowDays: 30, limit: 20 },
      auth.data !== undefined && capabilities.canView,
    ),
  );

  if (auth.data === undefined && auth.isPending) return <IntelligenceLoading />;
  if (auth.isError || auth.data === undefined) {
    return (
      <CatalogForbiddenState
        description="The session could not be checked, so no recommendation, cost or supplier data was requested. Restore the API connection and retry."
        title="Intelligence access could not be verified"
      />
    );
  }
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing buying recommendations requires recommendations.view. No intelligence request was sent."
        title="Buying intelligence access required"
      />
    );
  }

  const currency = auth.data.organization.currency;
  const report = suggestions.data;

  let body: JSX.Element;
  if (suggestions.isPending) {
    body = (
      <div
        aria-label="Loading reorder suggestions"
        className="space-y-4"
        role="status"
      >
        <div className="h-40 animate-pulse rounded-card bg-line-subtle" />
        <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
      </div>
    );
  } else if (report === undefined) {
    const apiError = toApiError(suggestions.error);
    body = (
      <CatalogErrorState
        description="The reorder engine could not be reached. No product, quantity, cost or return is estimated in the browser."
        onRetry={() => {
          void suggestions.refetch();
        }}
        title="Reorder suggestions unavailable"
        {...(apiError.requestId === undefined
          ? {}
          : { requestId: apiError.requestId })}
      />
    );
  } else {
    body = (
      <>
        <PlanSummary currency={currency} report={report} />

        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
            <h2 className="font-bold text-ink">Recommendations</h2>
            <span className="text-xs text-ink-muted">
              {report.suggestions.length.toLocaleString("en-PK")} ranked ·
              deterministic · read-only
            </span>
          </div>
          {report.suggestions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
                <IntelligenceIcon className="size-6" />
              </span>
              <h3 className="mt-3 font-bold text-ink">
                No reorder suggestions right now
              </h3>
              <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-ink-muted">
                No quantity-tracked product currently needs reordering from
                posted-sales velocity, open demand or its reorder point. The
                engine invents nothing when there is no evidence.
              </p>
            </div>
          ) : (
            <RecommendationsTable
              capabilities={capabilities}
              currency={currency}
              report={report}
            />
          )}
        </section>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
              <IntelligenceIcon />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">
                Intelligence · Deterministic buying
              </p>
              <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
                Buying Plan — Reorder Recommendations
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
                {report === undefined
                  ? "Ranked from posted-sales velocity, open demand, stock cover and recorded cost."
                  : `Analysis window ${report.windowDays} days · business date ${report.businessDate} · ranked by verified velocity, demand and stock cover.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:opacity-50"
              disabled={suggestions.isFetching}
              onClick={() => {
                void suggestions.refetch();
              }}
              type="button"
            >
              <RefreshIcon
                className={`size-4 ${suggestions.isFetching ? "animate-spin" : ""}`}
              />
              Refresh suggestions
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-50"
              disabled
              title={
                capabilities.canCreatePurchaseOrders
                  ? "Draft PO creation is not built yet"
                  : "purchases.create permission required"
              }
              type="button"
            >
              <LayersIcon className="size-4" /> Create draft POs
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-sm leading-6 text-info">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong>The engine never places orders automatically.</strong> It
          ranks verified sales velocity, open matched demand, stock cover and
          recorded cost, then explains its reasons. Every quantity is a
          suggestion a permitted owner must approve — decisions and PO creation
          are not wired here.
        </p>
      </div>

      {body}
    </div>
  );
}
