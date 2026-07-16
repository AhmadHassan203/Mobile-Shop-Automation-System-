"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  LayersIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  intelligenceCapabilities,
  nextRecommendationExpanded,
} from "./intelligence-state";

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

function BudgetMetric({
  label,
  tone = "ink",
}: {
  readonly label: string;
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
      <dd className={`mt-1 text-xl font-bold ${color}`}>—</dd>
    </div>
  );
}

function DetailPreview({
  canCreatePurchaseOrders,
  canDecide,
  canViewInventory,
}: {
  readonly canCreatePurchaseOrders: boolean;
  readonly canDecide: boolean;
  readonly canViewInventory: boolean;
}): JSX.Element {
  const disabledDecisionTitle = canDecide
    ? "Recommendation API is pending"
    : "recommendations.decide permission required";
  const decisionClass =
    "min-h-9 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink-subtle opacity-50";
  return (
    <div className="border-t border-line bg-surface-subtle p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            Why the engine recommends this
          </p>
          <div className="mt-2 space-y-2">
            {[
              "Sales velocity evidence",
              "Qualified unmet demand",
              "Stock cover and supplier lead time",
              "Expected margin evidence",
            ].map((label) => (
              <div
                className="flex items-start gap-2 text-sm text-ink-muted"
                key={label}
              >
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-positive" />
                <span>{label} · API pending</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            Risks &amp; cautions
          </p>
          <div className="mt-2 flex items-start gap-2 text-sm text-ink-muted">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
            Risk flags will come from verified engine output.
          </div>
          <div className="my-3 h-px bg-line" />
          <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            Suggested supplier
          </p>
          <dl className="mt-1 divide-y divide-line-subtle text-sm">
            {["Supplier", "Lead time", "Terms", "On-time delivery"].map(
              (label) => (
                <div className="flex justify-between gap-3 py-2" key={label}>
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="font-semibold text-ink-subtle">API pending</dd>
                </div>
              ),
            )}
          </dl>
        </section>
      </div>
      <div className="mt-4 flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        Low-confidence recommendations will explicitly suggest a test quantity
        and disclose sparse evidence.
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          className={`${decisionClass} border-positive bg-positive-soft text-positive`}
          disabled
          title={disabledDecisionTitle}
          type="button"
        >
          Accept
        </button>
        <button
          className={decisionClass}
          disabled
          title={disabledDecisionTitle}
          type="button"
        >
          − Reduce qty
        </button>
        <button
          className={decisionClass}
          disabled
          title={disabledDecisionTitle}
          type="button"
        >
          ＋ Increase
        </button>
        <button
          className={decisionClass}
          disabled
          title={disabledDecisionTitle}
          type="button"
        >
          Defer
        </button>
        <button
          className={`${decisionClass} border-negative text-negative`}
          disabled
          title={disabledDecisionTitle}
          type="button"
        >
          Reject
        </button>
        <button
          className={decisionClass}
          disabled
          title={
            canCreatePurchaseOrders
              ? "Recommendation API is pending"
              : "purchases.create permission required"
          }
          type="button"
        >
          Create draft PO
        </button>
        <span className="ml-auto text-xs text-ink-muted">
          {canViewInventory
            ? "Inventory link activates for a verified product"
            : "inventory.view required"}
        </span>
      </div>
    </div>
  );
}

export function IntelligenceWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const [expanded, setExpanded] = useState<readonly string[]>([]);

  if (auth.data === undefined && auth.isPending) return <IntelligenceLoading />;
  if (auth.isError || auth.data === undefined) {
    return (
      <CatalogForbiddenState
        description="The session could not be checked, so no recommendation, cost or supplier data was requested. Restore the API connection and retry."
        title="Intelligence access could not be verified"
      />
    );
  }
  const capabilities = intelligenceCapabilities(auth.data.permissions);
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing buying recommendations requires recommendations.view. No intelligence request was sent."
        title="Buying intelligence access required"
      />
    );
  }
  const detailOpen = expanded.includes("preview");

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
                Algorithm, analysis window and generation time will be disclosed
                with every verified engine run.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-subtle opacity-50"
              disabled
              title={
                capabilities.canDecide
                  ? "Recommendation engine API pending"
                  : "recommendations.decide permission required"
              }
              type="button"
            >
              <RefreshIcon className="size-4" /> Re-run engine
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-50"
              disabled
              title={
                capabilities.canCreatePurchaseOrders
                  ? "Accepted recommendations API pending"
                  : "purchases.create permission required"
              }
              type="button"
            >
              <LayersIcon className="size-4" /> Create draft POs from accepted
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-sm leading-6 text-info">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong>The engine never places orders automatically.</strong> It
          ranks verified sales velocity, qualified unmet demand, margin,
          stockout severity and confidence, then explains its reasons. A
          permitted owner approves every quantity.
        </p>
      </div>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <h2 className="font-bold text-ink">Buying budget</h2>
          <span className="text-xs text-ink-muted">
            Updates after verified decisions · API pending
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <dl className="flex flex-wrap gap-x-7 gap-y-5 divide-line md:divide-x">
            <BudgetMetric label="Purchase budget" />
            <BudgetMetric label="Liquidity buffer (reserved)" tone="muted" />
            <BudgetMetric label="Selected investment" />
            <BudgetMetric label="Expected gross return" tone="positive" />
            <BudgetMetric label="Cash remaining" />
          </dl>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-line-subtle">
            <span className="block h-full w-0 rounded-full bg-accent" />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
            <span>Selected spend unavailable</span>
            <span>
              Investable ceiling appears when budget and buffer are configured
            </span>
          </div>
          <div className="mt-3 flex items-start gap-2.5 rounded-control border border-dashed border-warning/35 px-3 py-2.5 text-xs text-ink-muted">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            The liquidity-buffer warning appears only when verified selected
            spend crosses the configured investable ceiling.
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <h2 className="font-bold text-ink">Recommendations</h2>
          <span className="text-xs text-ink-muted">
            Counts, plan state and review progress · API pending
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
              <tr>
                {[
                  "Product",
                  "Avail · Inb · Resv",
                  "30d",
                  "Unmet",
                  "Cover",
                  "Lead",
                  "Rec qty",
                  "Est. cost",
                  "Exp. profit",
                  "ROI",
                  "Confidence",
                  "Score",
                  "Status",
                ].map((label, index) => (
                  <th
                    className={`px-3 py-3 ${(index >= 2 && index <= 9) || index === 11 ? "text-right" : ""}`}
                    key={label}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-5 py-12 text-center" colSpan={13}>
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
                    <IntelligenceIcon className="size-6" />
                  </span>
                  <h3 className="mt-3 font-bold text-ink">
                    Recommendation engine output is not connected
                  </h3>
                  <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-ink-muted">
                    No product, demand, quantity, cost, return, confidence or
                    score is estimated in the browser. The table is ready for
                    deterministic output with evidence.
                  </p>
                  <button
                    aria-expanded={detailOpen}
                    className="mt-4 min-h-9 rounded-control border border-line px-3.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
                    onClick={() =>
                      setExpanded((current) =>
                        nextRecommendationExpanded(current, "preview"),
                      )
                    }
                    type="button"
                  >
                    {detailOpen ? "Hide" : "Review"} recommendation detail
                    layout
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {detailOpen ? (
          <DetailPreview
            canCreatePurchaseOrders={capabilities.canCreatePurchaseOrders}
            canDecide={capabilities.canDecide}
            canViewInventory={capabilities.canViewInventory}
          />
        ) : null}
      </section>
    </div>
  );
}
