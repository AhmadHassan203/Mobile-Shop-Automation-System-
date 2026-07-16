"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { CheckCircleIcon, CloseIcon, LockIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  BALANCE_ACCOUNTS,
  DIGITAL_SERVICE_AVAILABILITY,
  digitalCapabilities,
  reconciliationReadiness,
  type CountedBalanceInput,
} from "./digital-state";
import {
  Card,
  DigitalApiNotice,
  DigitalKpi,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  UnavailableTableRow,
  fieldLabelClass,
  inputClass,
  tableClass,
  thClass,
} from "./digital-ui";

const summaryLabels = [
  "Expected physical cash impact",
  "Successful transactions",
  "Pending transactions",
  "Reversed transactions",
  "Missing provider references",
  "Calculated service earnings",
] as const;

function ReconciliationModal({
  cashier,
  counts,
  onClose,
  reason,
}: {
  readonly cashier: string;
  readonly counts: readonly CountedBalanceInput[];
  readonly onClose: () => void;
  readonly reason: string;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="reconciliation-review-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[35rem] flex-col overflow-hidden rounded-card bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2
            className="text-base font-semibold"
            id="reconciliation-review-title"
          >
            Review reconciliation impact
          </h2>
          <button
            aria-label="Close reconciliation review"
            className="ml-auto grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-control border border-accent/25 bg-accent-soft p-4 text-sm text-accent-ink">
            <p className="font-semibold">Saving would record:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>
                {counts.filter((count) => count.counted.length > 0).length}{" "}
                locally entered counted balances.
              </li>
              <li>
                Cashier: {cashier.trim().length === 0 ? "Not entered" : cashier}
              </li>
              <li>
                Variance reason:{" "}
                {reason.trim().length === 0 ? "Not entered" : reason}
              </li>
              <li>
                Expected balances and calculated variances from the server.
              </li>
              <li>An immutable saved reconciliation record and timestamp.</li>
            </ul>
          </div>
          <div className="mt-4 rounded-control border border-negative/25 bg-negative-soft p-4 text-xs text-negative">
            <p className="font-semibold">Save is blocked</p>
            <p className="mt-1">
              Expected balances and the reconciliation persistence API are not
              available. No variance can be calculated safely and no local ID or
              timestamp will be invented.
            </p>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            className="min-h-9 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-subtle"
            onClick={onClose}
            type="button"
          >
            Back
          </button>
          <button
            className="min-h-9 rounded-control bg-accent px-3.5 text-sm font-semibold text-white opacity-45"
            disabled
            type="button"
          >
            Confirm Save
          </button>
        </footer>
      </section>
    </div>
  );
}

export function DigitalReconciliationRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalReconciliationPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = digitalCapabilities(auth.data?.permissions);
  const [counts, setCounts] = useState<readonly CountedBalanceInput[]>(
    BALANCE_ACCOUNTS.map((account) => ({ account, counted: "" })),
  );
  const [reason, setReason] = useState("");
  const [cashier, setCashier] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const readiness = reconciliationReadiness(
    false,
    counts,
    capabilities,
    DIGITAL_SERVICE_AVAILABILITY,
  );

  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Digital reconciliation requires the server-provided permission."
        permission="external_services.view"
      />
    );
  }
  const effectiveCashier = cashier || auth.data.user.fullName;

  return (
    <>
      <DigitalPageHeader
        actions={[
          { href: "/digital/balances", label: "Balances" },
          { href: "/digital/new", label: "New transaction", primary: true },
        ]}
        subtitle="Compare counted cash and provider app balances against server records."
        title="Digital Services — Reconciliation"
      />
      <DigitalApiNotice>
        Expected balances, transactions and saved reconciliations are not
        available. Counted values remain local to this page; no variance or
        reconciliation record is invented.
      </DigitalApiNotice>
      <div className="mb-[1.125rem] grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaryLabels.map((label) => (
          <DigitalKpi
            key={label}
            label={label}
            meta="Digital services only · API pending"
          />
        ))}
      </div>
      <Card className="mb-4" title="Reconciliation checklist">
        <div className="grid gap-3 p-[1.125rem] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Expected balances loaded", readiness.expectedBalancesLoaded],
            ["All counted balances entered", readiness.everyCountEntered],
            ["Variances calculated", readiness.canCalculateVariance],
            ["Persistence ready", readiness.canPersist],
          ].map(([label, ready]) => (
            <div
              className={`flex items-center gap-2 rounded-control border p-3 text-xs font-semibold ${
                ready
                  ? "border-positive/25 bg-positive-soft text-positive"
                  : "border-warning/25 bg-warning-soft text-warning"
              }`}
              key={String(label)}
            >
              {ready ? (
                <CheckCircleIcon className="size-4 shrink-0" />
              ) : (
                <LockIcon className="size-4 shrink-0" />
              )}
              {label}
            </div>
          ))}
        </div>
      </Card>
      <Card
        className="mb-4"
        hint="Variance reason is required before saving if any row does not match"
        title="Counted balances"
      >
        <div className="p-[1.125rem]">
          {counts.map((count) => (
            <div
              className="grid items-center gap-3 border-b border-line-subtle py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_15rem_auto]"
              key={count.account}
            >
              <p className="text-xs text-ink-muted">
                {count.account} expected <strong>Unavailable</strong>
              </p>
              <label>
                <span className="sr-only">{count.account} counted balance</span>
                <input
                  className={inputClass}
                  min="0"
                  onChange={(event) =>
                    setCounts((current) =>
                      current.map((item) =>
                        item.account === count.account
                          ? { ...item, counted: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder="Counted amount"
                  type="number"
                  value={count.counted}
                />
              </label>
              <span className="rounded-full bg-warning-soft px-2.5 py-1 text-center text-[0.6875rem] font-semibold text-warning">
                Variance unavailable
              </span>
            </div>
          ))}
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_16.25rem]">
            <label>
              <span className={fieldLabelClass}>Reason for variance</span>
              <textarea
                className={`${inputClass} min-h-20 py-2.5`}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                value={reason}
              />
            </label>
            <label>
              <span className={fieldLabelClass}>Cashier</span>
              <input
                className={inputClass}
                onChange={(event) => setCashier(event.target.value)}
                placeholder={auth.data.user.fullName}
                value={cashier}
              />
            </label>
          </div>
          <button
            className="mt-4 min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!capabilities.canRecord}
            onClick={() => setReviewOpen(true)}
            title={
              capabilities.canRecord
                ? "Review safely; final persistence remains disabled"
                : "Requires external_services.record"
            }
            type="button"
          >
            Save reconciliation
          </button>
        </div>
      </Card>
      <Card title="Saved reconciliations">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {["ID", "Timestamp", "Cashier", "Reason", "Variances"].map(
                  (header) => (
                    <th className={thClass} key={header}>
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              <UnavailableTableRow
                columns={5}
                message="Saved reconciliation API is not available"
              />
            </tbody>
          </table>
        </div>
      </Card>

      {reviewOpen ? (
        <ReconciliationModal
          cashier={effectiveCashier}
          counts={counts}
          onClose={() => setReviewOpen(false)}
          reason={reason}
        />
      ) : null}
    </>
  );
}
