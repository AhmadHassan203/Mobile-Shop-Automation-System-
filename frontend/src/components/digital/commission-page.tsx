"use client";

import { formatMoney, toMinor } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { toApiError } from "@/lib/api/client";
import {
  EXTERNAL_COMMISSION_PERIODS,
  type ExternalCommissionPeriod,
} from "@/lib/api/external";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { externalCommissionQueryOptions } from "@/lib/query/external-query";
import {
  externalCapabilities,
  EXTERNAL_PROVIDER_LABELS,
  EXTERNAL_TYPE_LABELS,
} from "./external-transaction-state";
import {
  Card,
  DigitalKpi,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  fieldLabelClass,
  inputClass,
  tableClass,
  thClass,
} from "./digital-ui";

const PERIOD_LABELS: Record<ExternalCommissionPeriod, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

type GroupBy = "provider" | "type";

export function DigitalCommissionRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalCommissionPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = externalCapabilities(auth.data?.permissions);
  const currency = auth.data?.organization.currency ?? "PKR";
  const [period, setPeriod] = useState<ExternalCommissionPeriod>("month");
  const [groupBy, setGroupBy] = useState<GroupBy>("provider");
  const query = useQuery(
    externalCommissionQueryOptions(period, capabilities.canView),
  );

  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Commission reporting requires the server-provided permission."
        permission="external.view"
      />
    );
  }

  const money = (minor: number): string =>
    formatMoney(toMinor(minor, "external commission"), currency);

  const rows =
    query.data === undefined
      ? []
      : groupBy === "provider"
        ? query.data.byProvider.map((row) => ({
            key: row.provider,
            label: EXTERNAL_PROVIDER_LABELS[row.provider],
            ...row,
          }))
        : query.data.byType.map((row) => ({
            key: row.transactionType,
            label: EXTERNAL_TYPE_LABELS[row.transactionType],
            ...row,
          }));

  let body: JSX.Element;
  if (query.isPending) {
    body = <CatalogTableSkeleton rows={5} />;
  } else if (query.data === undefined) {
    const error = toApiError(query.error);
    body = (
      <CatalogErrorState
        description="The commission API did not return a valid response. No calculated or invented figures are shown."
        onRetry={() => {
          void query.refetch();
        }}
        title="Commission report could not be loaded"
        {...(error.requestId === undefined
          ? {}
          : { requestId: error.requestId })}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <CatalogEmptyState
        description="No external transactions fall in this period, so there is no commission to report."
        title="No commission in this period"
      />
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              {[
                groupBy === "provider" ? "Provider" : "Transaction type",
                "Customer Fees (Gross)",
                "Provider Cost",
                "Net Commission",
                "Transactions",
              ].map((header) => (
                <th className={thClass} key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-line-subtle" key={row.key}>
                <td className="px-3.5 py-2.5 font-semibold text-ink">
                  {row.label}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                  {money(row.grossFeeMinor)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                  {money(row.providerCostMinor)}
                </td>
                <td
                  className={`px-3.5 py-2.5 text-right font-mono font-semibold ${
                    row.netCommissionMinor < 0 ? "text-negative" : "text-accent"
                  }`}
                >
                  {money(row.netCommissionMinor)}
                </td>
                <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                  {row.transactionCount}
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
          { href: "/digital/history", label: "History" },
          { href: "/digital/new", label: "New transaction", primary: true },
        ]}
        subtitle="Net commission is the customer fee we charge less the provider's own charge. The principal is customer money and is never counted as earnings."
        title="Digital Services — Commission Report"
      />

      <Card className="mb-4" title="Report controls">
        <div className="grid gap-3 p-[1.125rem] sm:grid-cols-2 xl:grid-cols-3">
          <label>
            <span className={fieldLabelClass}>Period</span>
            <select
              className={inputClass}
              onChange={(event) =>
                setPeriod(event.target.value as ExternalCommissionPeriod)
              }
              value={period}
            >
              {EXTERNAL_COMMISSION_PERIODS.map((value) => (
                <option key={value} value={value}>
                  {PERIOD_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Group by</span>
            <select
              className={inputClass}
              onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              value={groupBy}
            >
              <option value="provider">Provider</option>
              <option value="type">Transaction type</option>
            </select>
          </label>
          {query.data === undefined ? null : (
            <div className="flex items-end text-xs text-ink-muted">
              <span>
                Business dates {query.data.from} to {query.data.to}
              </span>
            </div>
          )}
        </div>
      </Card>

      {query.data ? (
        <div className="mb-[1.125rem] grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DigitalKpi
            label="Customer fees (gross)"
            meta="Total service fee charged to customers"
            value={money(query.data.totals.grossFeeMinor)}
          />
          <DigitalKpi
            label="Provider cost"
            meta="Total charged to us by providers"
            value={money(query.data.totals.providerCostMinor)}
          />
          <DigitalKpi
            label="Net commission"
            meta="Gross customer fees minus provider cost"
            value={money(query.data.totals.netCommissionMinor)}
          />
          <DigitalKpi
            label="Transactions"
            meta={PERIOD_LABELS[query.data.period]}
            value={String(query.data.totals.transactionCount)}
          />
        </div>
      ) : null}

      <Card
        hint={
          groupBy === "provider" ? "Grouped by provider" : "Grouped by type"
        }
        title="Grouped commission"
      >
        {body}
      </Card>
    </>
  );
}
