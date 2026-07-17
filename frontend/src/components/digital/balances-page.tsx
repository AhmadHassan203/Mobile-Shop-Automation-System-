"use client";

import {
  formatBusinessDateTime,
  formatMoney,
  toMinor,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { toApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { externalBalancesQueryOptions } from "@/lib/query/external-query";
import {
  externalCapabilities,
  EXTERNAL_PROVIDER_LABELS,
} from "./external-transaction-state";
import {
  Card,
  DigitalKpi,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  tableClass,
  thClass,
} from "./digital-ui";

const NOT_CONFIGURED = (
  <span className="text-ink-muted" title="No configured source in this system">
    Not configured
  </span>
);

export function DigitalBalancesRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalBalancesPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = externalCapabilities(auth.data?.permissions);
  const currency = auth.data?.organization.currency ?? "PKR";
  const query = useQuery(externalBalancesQueryOptions(capabilities.canView));

  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Service balance visibility requires the server-provided permission."
        permission="external.view"
      />
    );
  }

  const money = (minor: number): string =>
    formatMoney(toMinor(minor, "external balance"), currency);
  const providers = query.data?.providers ?? [];
  const totals = providers.reduce(
    (acc, provider) => ({
      sent: acc.sent + provider.amountSentTodayMinor,
      received: acc.received + provider.amountReceivedTodayMinor,
      count: acc.count + provider.transactionCount,
    }),
    { sent: 0, received: 0, count: 0 },
  );

  let body: JSX.Element;
  if (query.isPending) {
    body = <CatalogTableSkeleton rows={5} />;
  } else if (query.data === undefined) {
    const error = toApiError(query.error);
    body = (
      <CatalogErrorState
        description="The service balances API did not return a valid response. No cached or invented balances are shown."
        onRetry={() => {
          void query.refetch();
        }}
        title="Service balances could not be loaded"
        {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
      />
    );
  } else if (providers.length === 0) {
    body = (
      <CatalogEmptyState
        description="No external transactions have been recorded for the current business date. Movement appears here as transactions are recorded."
        title="No service activity today"
      />
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              {[
                "Provider",
                "Opening Balance",
                "Amount Sent Today",
                "Amount Received Today",
                "Net Movement",
                "Current Balance",
                "Transactions",
                "Last Transaction",
              ].map((header) => (
                <th className={thClass} key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr className="border-t border-line-subtle" key={provider.provider}>
                <td className="px-3.5 py-2.5 font-semibold text-ink">
                  {EXTERNAL_PROVIDER_LABELS[provider.provider]}
                </td>
                <td className="px-3.5 py-2.5">
                  {provider.openingBalanceMinor === null
                    ? NOT_CONFIGURED
                    : money(provider.openingBalanceMinor)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                  {money(provider.amountSentTodayMinor)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                  {money(provider.amountReceivedTodayMinor)}
                </td>
                <td
                  className={`px-3.5 py-2.5 text-right font-mono font-semibold ${
                    provider.netMovementMinor < 0 ? "text-negative" : "text-ink"
                  }`}
                >
                  {money(provider.netMovementMinor)}
                </td>
                <td className="px-3.5 py-2.5">
                  {provider.currentBalanceMinor === null
                    ? NOT_CONFIGURED
                    : money(provider.currentBalanceMinor)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                  {provider.transactionCount}
                </td>
                <td className="px-3.5 py-2.5 text-ink-muted">
                  {provider.lastTransactionAt === null
                    ? "—"
                    : formatBusinessDateTime(new Date(provider.lastTransactionAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <DigitalPageHeader
        actions={[
          { href: "/digital/new", label: "New transaction", primary: true },
          { href: "/digital/reconciliation", label: "Reconcile" },
        ]}
        subtitle="Settled movement by provider for the current business date. Sent, received, net movement and counts are live; opening/current balances are shown only when configured."
        title="Digital Services — Service Balances"
      />

      {query.data ? (
        <div className="mb-[1.125rem] grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DigitalKpi
            label="Amount sent today"
            meta="Principal sent from provider float"
            value={money(totals.sent)}
          />
          <DigitalKpi
            label="Amount received today"
            meta="Principal received into provider float"
            value={money(totals.received)}
          />
          <DigitalKpi
            label="Net movement"
            meta="Received minus sent, across providers"
            value={money(totals.received - totals.sent)}
          />
          <DigitalKpi
            label="Transactions today"
            meta={`Business date ${query.data.businessDate}`}
            value={String(totals.count)}
          />
        </div>
      ) : null}

      <div className="mb-4 flex items-start gap-3 rounded-control border border-warning/25 bg-warning-soft p-3.5 text-xs text-warning">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">
            Opening balances and low-balance thresholds are not configured
          </p>
          <p className="mt-1">
            This system has no configured opening balance or threshold source, so
            current balance and low-balance status are shown as “not configured”
            rather than derived or invented. Sent, received, net movement and
            counts are derived from recorded transactions.
          </p>
        </div>
      </div>

      <Card
        title="Balance movement"
        {...(query.data === undefined
          ? {}
          : { hint: `Business date ${query.data.businessDate}` })}
      >
        {body}
      </Card>
    </>
  );
}
