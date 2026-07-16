"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type JSX } from "react";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import { ShieldCheckIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { financeCapabilities } from "./finance-state";

const CASH_LADDER = [
  ["Opening cash (float)", ""],
  ["Cash sales", "+"],
  ["Cash refunds", "−"],
  ["Expenses paid from drawer", "−"],
  ["Cash removed / deposited to bank", "−"],
] as const;

const TENDERS = [
  "Cash",
  "Card",
  "JazzCash / Easypaisa",
  "Bank transfer",
] as const;

function DrilldownDrawer({
  kind,
  onClose,
}: {
  readonly kind: "sales" | "expenses";
  readonly onClose: () => void;
}): JSX.Element {
  const sales = kind === "sales";
  return (
    <CatalogDrawer
      description={
        sales
          ? "Only cash tenders contribute to the drawer reconciliation."
          : "Only cash-source expenses reduce the drawer."
      }
      onClose={onClose}
      title={sales ? "Cash sales today" : "Expenses paid from drawer"}
      titleId="cash-drilldown-title"
    >
      <div className="overflow-hidden rounded-card border border-line">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-surface-subtle text-xs text-ink-muted">
            <tr>
              {(sales
                ? ["Invoice", "Time", "Customer", "Cash in"]
                : ["Ref", "Category", "Paid"]
              ).map((label) => (
                <th
                  className="px-3 py-2.5 font-semibold last:text-right"
                  key={label}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="border-t border-line p-5 text-center text-sm text-ink-muted">
          {sales ? "Sales" : "Expense"} API pending—no prototype rows are
          copied.
        </div>
      </div>
    </CatalogDrawer>
  );
}

function ClosingConfirmation({
  counted,
  onClose,
  reason,
}: {
  readonly counted: string;
  readonly onClose: () => void;
  readonly reason: string;
}): JSX.Element {
  const numericCounted = Number(counted);
  const formattedCounted =
    counted.length > 0 && Number.isFinite(numericCounted)
      ? `Rs ${numericCounted.toLocaleString("en-PK")}`
      : "—";
  return (
    <div
      aria-labelledby="confirm-closing-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4"
      role="dialog"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-card border border-line bg-surface shadow-overlay">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink" id="confirm-closing-title">
            Confirm daily closing
          </h2>
          <button
            aria-label="Close confirmation"
            className="ml-auto text-xl text-ink-muted"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-muted">
            Review the effect before it is recorded. A real closing will close
            the cash session and write an audit entry; it never changes a sale.
          </p>
          <div className="rounded-control border border-info/25 bg-info-soft p-4 text-sm text-info">
            <strong>What this records</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Expected closing cash: —</li>
              <li>Counted cash: {formattedCounted}</li>
              <li>Variance: — · awaiting Cash Sessions API</li>
              <li>
                Closes the current cash session and writes a variance audit
                entry.
              </li>
              <li>Sales records are not modified.</li>
            </ul>
          </div>
          {reason.trim().length > 0 ? (
            <p className="text-sm text-ink-muted">
              <strong className="text-ink">Reason on file:</strong> {reason}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-4">
          <button
            className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-bold text-ink"
            onClick={onClose}
            type="button"
          >
            Back
          </button>
          <button
            className="rounded-control bg-accent px-4 py-2 text-sm font-bold text-white opacity-50"
            disabled
            title="Cash Sessions API pending"
            type="button"
          >
            Confirm &amp; close session
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClosingWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const [drilldown, setDrilldown] = useState<"sales" | "expenses" | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (auth.data === undefined) {
    return (
      <div
        aria-label="Loading daily closing"
        className="h-72 animate-pulse rounded-card bg-line-subtle"
        role="status"
      />
    );
  }

  const capabilities = financeCapabilities(auth.data.permissions);
  if (!capabilities.canViewClosing) {
    return (
      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-wide text-negative">
          Access restricted
        </p>
        <h1 className="mt-2 text-xl font-bold text-ink">
          Cash-session permission required
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your session has no cash_sessions.view permission. No closing request
          was sent.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
        <Link className="font-semibold text-accent" href="/finance">
          Finance
        </Link>{" "}
        / Daily closing
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            Daily Closing
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Current business day · session identity, open time and cashier await
            the Cash Sessions API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="rounded-control border border-line bg-surface px-3.5 py-2 text-sm font-bold text-ink no-underline"
            href="/finance"
          >
            Finance overview
          </Link>
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
            Session status pending
          </span>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card xl:col-span-2">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <h2 className="font-bold text-ink">Cash drawer reconciliation</h2>
            <span className="ml-auto text-xs text-ink-muted">
              Count the drawer, not the sales
            </span>
          </div>
          <div className="space-y-5 p-5">
            <p className="text-xs text-ink-muted">
              The system builds expected cash from posted activity. Enter the
              physical amount you counted; nothing posts from this preview.
            </p>

            <dl className="divide-y divide-line-subtle">
              {CASH_LADDER.map(([label, sign]) => {
                const drill =
                  label === "Cash sales"
                    ? "sales"
                    : label === "Expenses paid from drawer"
                      ? "expenses"
                      : null;
                return (
                  <div className="flex items-center gap-3 py-3" key={label}>
                    <span className="w-4 font-mono text-xs text-ink-muted">
                      {sign}
                    </span>
                    {drill === null ? (
                      <dt className="flex-1 text-sm text-ink-muted">{label}</dt>
                    ) : (
                      <dt className="flex-1">
                        <button
                          className="text-left text-sm font-semibold text-accent"
                          onClick={() => setDrilldown(drill)}
                          type="button"
                        >
                          {label} →
                        </button>
                      </dt>
                    )}
                    <dd className="font-mono font-bold text-ink-muted">—</dd>
                  </div>
                );
              })}
              <div className="flex items-center justify-between gap-3 border-t-2 border-line py-4">
                <dt className="font-bold text-ink">= Expected closing cash</dt>
                <dd className="font-mono text-xl font-bold text-ink-muted">
                  —
                </dd>
              </div>
            </dl>

            <label className="block text-sm font-semibold text-ink">
              Counted cash in drawer
              <input
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2.5 font-normal"
                inputMode="numeric"
                min="0"
                onChange={(event) => setCounted(event.target.value)}
                placeholder="Enter the physical amount you counted, e.g. 137000"
                step="100"
                type="number"
                value={counted}
              />
              <span className="mt-1 block text-xs font-normal text-ink-muted">
                Count notes and coins. Nothing is posted until final
                confirmation.
              </span>
            </label>

            <div className="flex items-center justify-between gap-4 rounded-control border border-line bg-surface-subtle p-4">
              <div>
                <p className="text-xs text-ink-muted">
                  Variance (counted − expected)
                </p>
                <p className="mt-1 text-xl font-bold text-ink-muted">—</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Expected cash awaits its source ledger.
                </p>
              </div>
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-ink-muted">
                Awaiting API
              </span>
            </div>

            <label className="block text-sm font-semibold text-ink">
              Reason for variance
              <textarea
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Rs 200 short—recounted and confirmed."
                rows={3}
                value={reason}
              />
              <span className="mt-1 block text-xs font-normal text-ink-muted">
                Required whenever the drawer does not balance. Sales are never
                edited to hide a mismatch.
              </span>
            </label>

            <div className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-4 text-sm text-warning">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
              If cash does not match, record the variance and reason. Never
              change sales records—the audit trail must stay honest.
            </div>

            <dl className="divide-y divide-line-subtle">
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm text-ink-muted">Submitted by</dt>
                <dd className="text-sm font-semibold text-ink">
                  {auth.data.user.fullName}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm text-ink-muted">Approved by</dt>
                <dd className="text-sm font-semibold text-ink-muted">
                  Policy pending
                </dd>
              </div>
            </dl>

            <label className="flex items-start gap-2 text-sm text-ink">
              <input
                checked={attested}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
                onChange={(event) => setAttested(event.target.checked)}
                type="checkbox"
              />
              I have physically counted the drawer and the amount above is
              correct.
            </label>

            <button
              className="w-full rounded-control bg-accent px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              disabled={
                !capabilities.canCloseSession ||
                !attested ||
                counted.length === 0
              }
              onClick={() => setConfirming(true)}
              type="button"
            >
              Submit daily closing
            </button>
            <p className="text-center text-xs text-ink-muted">
              Final persistence remains disabled in the confirmation until the
              Cash Sessions API is built.
            </p>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-bold text-ink">Session details</h2>
            </div>
            <dl className="divide-y divide-line-subtle px-5">
              {[
                "Session ID",
                "Business date",
                "Opened",
                "Opening float",
                "Cashier",
                "Status",
              ].map((label) => (
                <div
                  className="flex items-center justify-between gap-3 py-3"
                  key={label}
                >
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="font-mono text-xs font-bold text-ink-muted">
                    {label === "Cashier" ? auth.data.user.fullName : "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <h2 className="font-bold text-ink">Money in today</h2>
              <span className="ml-auto text-xs text-ink-muted">By tender</span>
            </div>
            <div className="p-5">
              <dl className="divide-y divide-line-subtle">
                {TENDERS.map((tender) => (
                  <div
                    className="flex items-center justify-between gap-3 py-2.5"
                    key={tender}
                  >
                    <dt className="text-xs text-ink-muted">{tender}</dt>
                    <dd className="font-mono font-bold text-ink-muted">—</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 rounded-control border border-info/25 bg-info-soft p-3 text-xs text-info">
                Only cash lands in the drawer. Card, wallet and bank transfers
                settle elsewhere and do not affect the physical count.
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-bold text-ink">Session activity</h2>
            </div>
            <div className="space-y-4 p-5">
              {[
                "Session opened",
                "Cash sales recorded",
                "Expenses paid from drawer",
                "Closing count & reconciliation",
              ].map((title, index) => (
                <div className="flex gap-3" key={title}>
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${index === 3 ? "bg-warning" : "bg-line"}`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <p className="text-xs text-ink-muted">
                      Source activity pending
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {drilldown === null ? null : (
        <DrilldownDrawer kind={drilldown} onClose={() => setDrilldown(null)} />
      )}
      {confirming ? (
        <ClosingConfirmation
          counted={counted}
          onClose={() => setConfirming(false)}
          reason={reason}
        />
      ) : null}
    </div>
  );
}
