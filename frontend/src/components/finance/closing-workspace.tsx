"use client";

import {
  formatMoney,
  fromMajor,
  PERMISSIONS,
  toMinor,
  type CashSession,
} from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type JSX } from "react";
import {
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { ShieldCheckIcon } from "@/components/ui/icons";
import { closeCashSession, openCashSession } from "@/lib/api/cash";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { currentCashSessionQueryOptions } from "@/lib/query/cash-query";
import { queryKeys } from "@/lib/query/keys";

function money(minor: number, currency: string): string {
  return formatMoney(toMinor(minor, "cash session amount"), currency);
}

/** Parse a major-unit PKR string to non-negative minor units, or null. */
function parseMinor(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const minor = fromMajor(trimmed);
    return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
  } catch {
    return null;
  }
}

function mutationMessage(error: ApiError, verb: string): string {
  if (error.code === "OPTIMISTIC_LOCK_FAILED") {
    return "The session changed since this page loaded. Nothing was saved. Refresh and try again.";
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return `Your current permissions no longer allow ${verb} a cash session.`;
  }
  if (error.code === "NETWORK_ERROR") {
    return `The cash-session API could not be reached, so the session was not ${verb === "opening" ? "opened" : "closed"}.`;
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return `The cash-session API did not respond in time, so the session was not ${verb === "opening" ? "opened" : "closed"}.`;
  }
  return `The session could not be ${verb === "opening" ? "opened" : "closed"}. Review the amount and try again.`;
}

const inputClass =
  "mt-1 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";

function ErrorBanner({
  error,
  verb,
}: {
  readonly error: ApiError;
  readonly verb: string;
}): JSX.Element {
  return (
    <div
      className="rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
      role="alert"
    >
      <p className="font-semibold">
        Session was not {verb === "opening" ? "opened" : "closed"}
      </p>
      <p className="mt-0.5">{mutationMessage(error, verb)}</p>
      {error.requestId === undefined ? null : (
        <p className="mt-1 font-mono text-xs">Ref: {error.requestId}</p>
      )}
    </div>
  );
}

function CloseResultSummary({
  currency,
  session,
}: {
  readonly currency: string;
  readonly session: CashSession;
}): JSX.Element {
  const variance = session.varianceMinor ?? 0;
  const varianceTone =
    variance < 0
      ? "text-negative"
      : variance > 0
        ? "text-positive"
        : "text-ink";
  return (
    <section className="overflow-hidden rounded-card border border-positive/30 bg-surface shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <ShieldCheckIcon className="size-4 text-positive" />
        <h2 className="font-bold text-ink">
          Session {session.sessionNumber} closed
        </h2>
      </div>
      <dl className="grid gap-px bg-line-subtle sm:grid-cols-3">
        <div className="bg-surface p-5">
          <dt className="text-xs text-ink-muted">Expected cash</dt>
          <dd className="mt-1 font-mono text-lg font-bold text-ink">
            {session.expectedCashMinor === null
              ? "—"
              : money(session.expectedCashMinor, currency)}
          </dd>
        </div>
        <div className="bg-surface p-5">
          <dt className="text-xs text-ink-muted">Counted cash</dt>
          <dd className="mt-1 font-mono text-lg font-bold text-ink">
            {session.countedCashMinor === null
              ? "—"
              : money(session.countedCashMinor, currency)}
          </dd>
        </div>
        <div className="bg-surface p-5">
          <dt className="text-xs text-ink-muted">
            Variance (counted − expected)
          </dt>
          <dd className={`mt-1 font-mono text-lg font-bold ${varianceTone}`}>
            {session.varianceMinor === null
              ? "—"
              : money(session.varianceMinor, currency)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function OpenSessionForm({
  canManage,
  onOpened,
}: {
  readonly canManage: boolean;
  readonly onOpened: () => void;
}): JSX.Element {
  const [openingMajor, setOpeningMajor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const openingMinor = parseMinor(openingMajor);

  const submit = async (): Promise<void> => {
    if (busy || !canManage || openingMinor === null) return;
    setBusy(true);
    setError(null);
    try {
      await openCashSession({ openingCashMinor: openingMinor });
      onOpened();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-bold text-ink">Open a cash session</h2>
        <p className="mt-1 text-sm text-ink-muted">
          No session is open for this branch. Count the opening float and open a
          session before recording the day&apos;s cash.
        </p>
      </div>
      <div className="space-y-4 p-5">
        {error === null ? null : <ErrorBanner error={error} verb="opening" />}
        <label className="block text-sm font-semibold text-ink">
          Opening cash / float (PKR)
          <input
            className={inputClass}
            disabled={busy || !canManage}
            inputMode="decimal"
            min="0"
            onChange={(event) => setOpeningMajor(event.target.value)}
            placeholder="e.g. 10000"
            step="0.01"
            type="number"
            value={openingMajor}
          />
          <span className="mt-1 block text-xs font-normal text-ink-muted">
            The physical cash in the drawer at the start of the session.
          </span>
        </label>
        {canManage ? (
          <button
            className="w-full rounded-control bg-accent px-4 py-3 text-sm font-bold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy || openingMinor === null}
            onClick={() => {
              void submit();
            }}
            type="button"
          >
            {busy ? "Opening…" : "Open cash session"}
          </button>
        ) : (
          <p className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
            Opening a session requires the cash_session.manage permission.
          </p>
        )}
      </div>
    </section>
  );
}

function CloseSessionPanel({
  canManage,
  currency,
  onClosed,
  session,
}: {
  readonly canManage: boolean;
  readonly currency: string;
  readonly onClosed: (closed: CashSession) => void;
  readonly session: CashSession;
}): JSX.Element {
  const [countedMajor, setCountedMajor] = useState("");
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const countedMinor = parseMinor(countedMajor);

  const submit = async (): Promise<void> => {
    if (busy || !canManage || countedMinor === null) return;
    setBusy(true);
    setError(null);
    try {
      const closed = await closeCashSession(session.id, {
        version: session.version,
        countedCashMinor: countedMinor,
        ...(note.trim().length === 0 ? {} : { note: note.trim() }),
      });
      onClosed(closed);
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-3">
      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card xl:col-span-2">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">Close the cash session</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Count the drawer and enter the physical amount. The server computes
            the expected cash and the variance; sales are never edited to hide a
            mismatch.
          </p>
        </div>
        <div className="space-y-4 p-5">
          {error === null ? null : <ErrorBanner error={error} verb="closing" />}
          <label className="block text-sm font-semibold text-ink">
            Counted cash in drawer (PKR)
            <input
              className={inputClass}
              disabled={busy || !canManage}
              inputMode="decimal"
              min="0"
              onChange={(event) => setCountedMajor(event.target.value)}
              placeholder="Enter the physical amount you counted"
              step="0.01"
              type="number"
              value={countedMajor}
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Note
            <span className="font-normal text-ink-muted"> (optional)</span>
            <textarea
              className={inputClass}
              disabled={busy || !canManage}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Rs 200 short — recounted and confirmed."
              rows={3}
              value={note}
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              checked={attested}
              className="mt-0.5 size-4 accent-[var(--color-accent)]"
              disabled={busy || !canManage}
              onChange={(event) => setAttested(event.target.checked)}
              type="checkbox"
            />
            I have physically counted the drawer and the amount above is
            correct.
          </label>
          {canManage ? (
            <button
              className="w-full rounded-control bg-accent px-4 py-3 text-sm font-bold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy || !attested || countedMinor === null}
              onClick={() => {
                void submit();
              }}
              type="button"
            >
              {busy ? "Closing…" : "Close cash session"}
            </button>
          ) : (
            <p className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
              Closing a session requires the cash_session.manage permission.
            </p>
          )}
        </div>
      </section>

      <aside className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">Session details</h2>
        </div>
        <dl className="divide-y divide-line-subtle px-5">
          {[
            ["Session", session.sessionNumber],
            ["Status", session.status],
            ["Opening float", money(session.openingCashMinor, currency)],
            ["Opened at", new Date(session.openedAt).toLocaleString("en-PK")],
            ["Cashier", session.cashier.fullName],
          ].map(([label, value]) => (
            <div
              className="flex items-center justify-between gap-3 py-3"
              key={label}
            >
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="text-right font-mono text-xs font-bold text-ink">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

export function ClosingWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const queryClient = useQueryClient();
  const [closeResult, setCloseResult] = useState<CashSession | null>(null);

  const permissions = auth.data?.permissions ?? [];
  const canView = permissions.includes(PERMISSIONS.CASH_SESSION_VIEW);
  const canManage = permissions.includes(PERMISSIONS.CASH_SESSION_MANAGE);
  const session = useQuery(
    currentCashSessionQueryOptions(auth.data !== undefined && canView),
  );

  const currency = auth.data?.organization.currency ?? "PKR";

  const refreshSession = (): void => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.currentCashSession,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.cashSessionsRoot,
    });
  };

  if (auth.data === undefined) {
    return (
      <div
        aria-label="Loading daily closing"
        className="h-72 animate-pulse rounded-card bg-line-subtle"
        role="status"
      />
    );
  }

  if (!canView) {
    return (
      <CatalogForbiddenState
        description="Viewing cash sessions requires the server-provided cash_session.view permission. No closing request was sent."
        title="Cash-session access required"
      />
    );
  }

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <nav aria-label="Breadcrumb" className="text-xs text-ink-muted">
          <Link className="font-semibold text-accent" href="/finance">
            Finance
          </Link>{" "}
          / Daily closing
        </nav>
        <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
          Daily Closing
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Open a cash session, then reconcile and close it against a counted
          drawer.
        </p>
      </div>
    </header>
  );

  let body: JSX.Element;
  if (session.isPending) {
    body = <CatalogTableSkeleton rows={5} />;
  } else if (session.data === undefined) {
    const error = toApiError(session.error);
    body = (
      <CatalogErrorState
        description="The cash-session API could not be reached. No session state is inferred."
        onRetry={() => {
          void session.refetch();
        }}
        title="Cash session could not be loaded"
        {...(error.requestId === undefined
          ? {}
          : { requestId: error.requestId })}
      />
    );
  } else if (session.data === null) {
    body = (
      <OpenSessionForm
        canManage={canManage}
        onOpened={() => {
          setCloseResult(null);
          refreshSession();
        }}
      />
    );
  } else {
    body = (
      <CloseSessionPanel
        canManage={canManage}
        currency={currency}
        onClosed={(closed) => {
          setCloseResult(closed);
          refreshSession();
        }}
        session={session.data}
      />
    );
  }

  return (
    <div className="space-y-5">
      {header}
      {closeResult === null ? null : (
        <CloseResultSummary currency={currency} session={closeResult} />
      )}
      {body}
    </div>
  );
}
