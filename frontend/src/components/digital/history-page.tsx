"use client";

import {
  EXTERNAL_PROVIDERS,
  EXTERNAL_TRANSACTION_TYPES,
  formatBusinessDateTime,
  formatMoney,
  toMinor,
  type ExternalProvider,
  type ExternalTransaction,
  type ExternalTransactionType,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type JSX, type ReactNode } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { CloseIcon, EyeIcon } from "@/components/ui/icons";
import { toApiError } from "@/lib/api/client";
import type { ExternalTransactionListParameters } from "@/lib/api/external";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  externalTransactionQueryOptions,
  externalTransactionsQueryOptions,
} from "@/lib/query/external-query";
import {
  externalCapabilities,
  EXTERNAL_PROVIDER_LABELS,
  EXTERNAL_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./external-transaction-state";
import {
  Card,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  fieldLabelClass,
  inputClass,
  tableClass,
  thClass,
} from "./digital-ui";

const PAGE_SIZE = 20;

function directionLabel(direction: ExternalTransaction["direction"]): string {
  return direction === "cash_in" ? "Cash in" : "Cash out";
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex justify-between gap-3 border-b border-line-subtle py-2 text-xs last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-semibold text-ink">{children}</span>
    </div>
  );
}

function DetailDrawer({
  id,
  currency,
  onClose,
}: {
  readonly id: string;
  readonly currency: string;
  readonly onClose: () => void;
}): JSX.Element {
  const query = useQuery(externalTransactionQueryOptions(id, true));
  const money = (minor: number): string =>
    formatMoney(toMinor(minor, "external amount"), currency);
  const txn = query.data;

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-labelledby="digital-detail-title"
        aria-modal="true"
        className="flex h-full w-full max-w-[28.75rem] flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold" id="digital-detail-title">
            Transaction details
          </h2>
          <button
            aria-label="Close transaction details"
            className="ml-auto grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {query.isPending ? (
            <div className="h-64 animate-pulse rounded-card bg-line-subtle" />
          ) : txn === undefined ? (
            <CatalogErrorState
              description="This transaction could not be loaded. No cached or invented record is shown."
              onRetry={() => {
                void query.refetch();
              }}
              title="Transaction unavailable"
            />
          ) : (
            <>
              <DetailRow label="Transaction ID">
                <span className="font-mono">{txn.txnNumber}</span>
              </DetailRow>
              <DetailRow label="Provider">
                {EXTERNAL_PROVIDER_LABELS[txn.provider]}
              </DetailRow>
              <DetailRow label="Type">
                {EXTERNAL_TYPE_LABELS[txn.transactionType]}
              </DetailRow>
              <DetailRow label="Direction">
                {directionLabel(txn.direction)}
              </DetailRow>
              <DetailRow label="Principal">
                {money(txn.principalMinor)}
              </DetailRow>
              <DetailRow label="Customer service fee">
                {money(txn.feeChargedMinor)}
              </DetailRow>
              <DetailRow label="Provider charge (our cost)">
                {money(txn.providerChargeMinor)}
              </DetailRow>
              <DetailRow label="Net service earnings">
                {money(txn.serviceProfitMinor)}
              </DetailRow>
              <DetailRow label="Physical cash impact">
                {money(txn.cashImpactMinor)}
              </DetailRow>
              <DetailRow label="Fee overridden">
                {txn.feeOverridden ? "Yes" : "No"}
              </DetailRow>
              <DetailRow label="Payment method">
                {PAYMENT_METHOD_LABELS[txn.paymentMethod]}
              </DetailRow>
              <DetailRow label="Provider reference">
                {txn.providerReference ?? "—"}
              </DetailRow>
              <DetailRow label="Account reference">
                {txn.accountReference ?? "—"}
              </DetailRow>
              <DetailRow label="Customer">
                {txn.customerName ?? "—"}
                {txn.customerPhone === null ? "" : ` · ${txn.customerPhone}`}
              </DetailRow>
              <DetailRow label="Notes">{txn.note ?? "—"}</DetailRow>
              <DetailRow label="Business date">{txn.businessDate}</DetailRow>
              <DetailRow label="Recorded at">
                {formatBusinessDateTime(new Date(txn.createdAt))}
              </DetailRow>
            </>
          )}
        </div>
        <footer className="border-t border-line px-5 py-3.5">
          <p className="text-xs text-ink-muted">
            Recorded external transactions are immutable. The backend has no
            status-change, reversal or dispute workflow, so those actions are
            not available here.
          </p>
        </footer>
      </aside>
    </div>
  );
}

export function DigitalHistoryRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalHistoryPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = externalCapabilities(auth.data?.permissions);
  const currency = auth.data?.organization.currency ?? "PKR";
  const [date, setDate] = useState("");
  const [provider, setProvider] = useState<ExternalProvider | "">("");
  const [transactionType, setTransactionType] = useState<
    ExternalTransactionType | ""
  >("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const trimmedSearch = search.trim();
  const params: ExternalTransactionListParameters = {
    page,
    pageSize: PAGE_SIZE,
    ...(trimmedSearch.length === 0 ? {} : { q: trimmedSearch }),
    ...(provider === "" ? {} : { provider }),
    ...(transactionType === "" ? {} : { transactionType }),
    ...(date === "" ? {} : { from: date, to: date }),
  };
  const query = useQuery(
    externalTransactionsQueryOptions(params, capabilities.canView),
  );

  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Transaction history requires the server-provided permission."
        permission="external.view"
      />
    );
  }

  const money = (minor: number): string =>
    formatMoney(toMinor(minor, "external amount"), currency);
  const resetPage = (): void => setPage(1);

  let body: JSX.Element;
  if (query.isPending) {
    body = <CatalogTableSkeleton rows={6} />;
  } else if (query.data === undefined) {
    const error = toApiError(query.error);
    body = (
      <CatalogErrorState
        description="The transaction history API did not return a valid page. No cached or invented rows are shown."
        onRetry={() => {
          void query.refetch();
        }}
        title="Transactions could not be loaded"
        {...(error.requestId === undefined
          ? {}
          : { requestId: error.requestId })}
      />
    );
  } else if (query.data.items.length === 0) {
    body = (
      <CatalogEmptyState
        description="No recorded external transactions match these filters for this branch."
        title="No transactions found"
      />
    );
  } else {
    const data = query.data;
    body = (
      <>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {[
                  "Transaction ID",
                  "Date and Time",
                  "Provider",
                  "Type",
                  "Direction",
                  "Principal",
                  "Service Fee",
                  "Provider Charge",
                  "Net Earnings",
                  "Provider Reference",
                  "Action",
                ].map((header) => (
                  <th className={thClass} key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((txn) => (
                <tr className="border-t border-line-subtle" key={txn.id}>
                  <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-ink">
                    {txn.txnNumber}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-muted">
                    {formatBusinessDateTime(new Date(txn.createdAt))}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {EXTERNAL_PROVIDER_LABELS[txn.provider]}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink">
                    {EXTERNAL_TYPE_LABELS[txn.transactionType]}
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-muted">
                    {directionLabel(txn.direction)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                    {money(txn.principalMinor)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                    {money(txn.feeChargedMinor)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                    {money(txn.providerChargeMinor)}
                  </td>
                  <td
                    className={`px-3.5 py-2.5 text-right font-mono font-semibold ${
                      txn.serviceProfitMinor < 0
                        ? "text-negative"
                        : "text-accent"
                    }`}
                  >
                    {money(txn.serviceProfitMinor)}
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-xs text-ink-muted">
                    {txn.providerReference ?? "—"}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <button
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
                      onClick={() => setSelectedId(txn.id)}
                      type="button"
                    >
                      <EyeIcon className="size-4" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle px-4 py-3 text-xs text-ink-muted">
          <span>
            Page {data.page} of {Math.max(1, data.totalPages)} · {data.total}{" "}
            transaction{data.total === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              className="min-h-8 rounded-control border border-line px-3 font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
              disabled={data.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="min-h-8 rounded-control border border-line px-3 font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DigitalPageHeader
        actions={[
          { href: "/digital/new", label: "New transaction", primary: true },
          { href: "/digital/reconciliation", label: "Reconcile" },
        ]}
        subtitle="Recorded external provider transactions for this branch. Every row is a completed record; the backend has no pending/reversal workflow."
        title="Digital Services — Transaction History"
      />

      <Card className="mb-4" title="Filters">
        <div className="grid gap-3 p-[1.125rem] sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <span className={fieldLabelClass}>Business date</span>
            <input
              className={inputClass}
              onChange={(event) => {
                setDate(event.target.value);
                resetPage();
              }}
              type="date"
              value={date}
            />
          </label>
          <label>
            <span className={fieldLabelClass}>Provider</span>
            <select
              className={inputClass}
              onChange={(event) => {
                setProvider(event.target.value as ExternalProvider | "");
                resetPage();
              }}
              value={provider}
            >
              <option value="">All providers</option>
              {EXTERNAL_PROVIDERS.map((value) => (
                <option key={value} value={value}>
                  {EXTERNAL_PROVIDER_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Type</span>
            <select
              className={inputClass}
              onChange={(event) => {
                setTransactionType(
                  event.target.value as ExternalTransactionType | "",
                );
                resetPage();
              }}
              value={transactionType}
            >
              <option value="">All types</option>
              {EXTERNAL_TRANSACTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {EXTERNAL_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2 lg:col-span-1">
            <span className={fieldLabelClass}>Search reference / customer</span>
            <input
              className={inputClass}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Txn #, reference or customer"
              value={search}
            />
          </label>
          <label>
            <span className={fieldLabelClass}>Direction</span>
            <select
              className={inputClass}
              disabled
              title="The list API has no direction filter. Direction is shown per row."
              value=""
            >
              <option value="">Not filterable</option>
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Status</span>
            <select
              className={inputClass}
              disabled
              title="Recorded transactions are completed facts; the backend has no status workflow."
              value=""
            >
              <option value="">Not applicable</option>
            </select>
          </label>
        </div>
      </Card>

      <Card
        title="Transactions"
        {...(query.data === undefined
          ? {}
          : {
              hint: `${query.data.total} recorded transaction${
                query.data.total === 1 ? "" : "s"
              }`,
            })}
      >
        {body}
      </Card>

      {selectedId === null ? null : (
        <DetailDrawer
          currency={currency}
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
