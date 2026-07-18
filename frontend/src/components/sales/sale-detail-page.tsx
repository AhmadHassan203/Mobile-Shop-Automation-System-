"use client";

import {
  PERMISSIONS,
  type SaleDetail,
  type SaleLine,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { JSX } from "react";
import {
  CatalogErrorState,
  CatalogForbiddenState,
} from "@/components/catalog/catalog-states";
import { AlertTriangleIcon, LockIcon } from "@/components/ui/icons";
import { toApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { saleQueryOptions } from "@/lib/query/sales-query";
import {
  formatPaymentMethod,
  formatSaleMoney,
  saleDateTimeLabel,
  SALE_STATUS_LABELS,
  saleStatusBadgeClass,
} from "./sales-records-page";

function BackToRecords(): JSX.Element {
  return (
    <Link className="text-xs font-semibold text-accent" href="/sales">
      &larr; Sale records
    </Link>
  );
}

/** Shown for an unknown or foreign id — never a substituted sale. */
export function SaleNotFoundState({
  id,
}: {
  readonly id: string;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <header>
        <BackToRecords />
        <h1 className="mt-2 text-xl font-bold text-ink sm:text-2xl">
          Sale record
        </h1>
        <p className="mt-1 font-mono text-xs text-ink-muted">{id}</p>
      </header>
      <section
        className="rounded-card border border-line bg-surface p-6 shadow-card"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
            <AlertTriangleIcon className="size-5" />
          </span>
          <div>
            <h2 className="font-bold text-ink">This sale was not found</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
              No sale with this id exists in your branch, or it belongs to
              another branch you cannot access. No other sale is ever shown in
              its place.
            </p>
            <Link
              className="mt-4 inline-flex rounded-control bg-accent px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-accent-strong"
              href="/sales"
            >
              Back to sale records
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="max-w-[62%] text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function SaleLineRow({
  line,
  currency,
}: {
  readonly line: SaleLine;
  readonly currency: string;
}): JSX.Element {
  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-mono text-xs font-semibold text-ink">
          {line.product.sku}
        </p>
        <p className="mt-0.5 text-sm text-ink-subtle">{line.product.name}</p>
        {line.trackingType === "serialized" ? (
          <p className="mt-1 space-x-2">
            {line.serializedUnit.identifiers.map((identifier) => (
              <span
                className="font-mono text-[0.65rem] text-ink-muted"
                key={`${identifier.type}:${identifier.value}`}
              >
                <span className="mr-1 uppercase">{identifier.type}</span>
                {identifier.value}
              </span>
            ))}
          </p>
        ) : null}
        {line.discountReason === null ? null : (
          <p className="mt-1 text-[0.65rem] text-ink-muted">
            Discount reason: {line.discountReason}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-ink-muted">{line.location.name}</td>
      <td className="px-4 py-3 text-right font-mono text-sm text-ink">
        {line.quantity}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm text-ink">
        {formatSaleMoney(line.unitPriceMinor, currency)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm text-ink">
        {formatSaleMoney(line.discountMinor, currency)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-ink">
        {formatSaleMoney(line.lineTotalMinor, currency)}
      </td>
    </tr>
  );
}

export interface SaleDetailViewProps {
  readonly sale: SaleDetail;
  readonly timezone: string;
  readonly organizationName: string;
  readonly branchName: string;
}

/** The pure detail surface. Presentational so it renders in unit tests. */
export function SaleDetailView({
  sale,
  timezone,
  organizationName,
  branchName,
}: SaleDetailViewProps): JSX.Element {
  const whenValue = sale.postedAt ?? sale.createdAt;
  const returned =
    sale.status === "returned" || sale.status === "partially_returned";
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <BackToRecords />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-bold text-ink sm:text-2xl">
              {sale.invoiceNumber ?? "Unposted draft"}
            </h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${saleStatusBadgeClass(sale.status)}`}
            >
              {SALE_STATUS_LABELS[sale.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {organizationName} · {branchName} ·{" "}
            <time dateTime={whenValue}>
              {saleDateTimeLabel(whenValue, timezone)}
            </time>
            {sale.postedAt === null ? " (created, not yet posted)" : ""}
          </p>
        </div>
        {sale.invoiceNumber === null ? null : (
          <Link
            className="rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink no-underline hover:bg-surface-subtle"
            href={`/sales/${sale.id}`}
          >
            Refresh record
          </Link>
        )}
      </header>

      {returned ? (
        <div
          className="flex items-start gap-2.5 rounded-control border border-warning/25 bg-warning-soft p-3 text-sm text-warning"
          role="status"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            This sale has {sale.status === "returned" ? "been fully" : "a"}{" "}
            return recorded against it. Return documents are managed in the{" "}
            <Link className="font-bold underline" href="/returns">
              Returns workspace
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-surface p-5 shadow-card lg:col-span-1">
          <h2 className="mb-2 text-sm font-bold text-ink">Record details</h2>
          <dl className="divide-y divide-line-subtle">
            <DetailRow label="Cashier">
              {sale.cashier === null ? (
                <span className="text-ink-muted">Not recorded</span>
              ) : (
                sale.cashier.fullName
              )}
            </DetailRow>
            <DetailRow label="Salesperson">
              {sale.salesperson === null ? (
                <span className="text-ink-muted">Not recorded</span>
              ) : (
                sale.salesperson.fullName
              )}
            </DetailRow>
            <DetailRow label="Customer">
              {sale.customer === null ? (
                <span className="text-ink-muted">Walk-in</span>
              ) : (
                <span>
                  {sale.customer.name === null ? null : (
                    <span className="block">{sale.customer.name}</span>
                  )}
                  <span className="block font-mono text-xs text-ink-muted">
                    {sale.customer.phone}
                  </span>
                </span>
              )}
            </DetailRow>
            {sale.postedAt === null ? null : (
              <DetailRow label="Posted">
                <time dateTime={sale.postedAt}>
                  {saleDateTimeLabel(sale.postedAt, timezone)}
                </time>
              </DetailRow>
            )}
            {sale.cancelledAt === null ? null : (
              <DetailRow label="Cancelled">
                <time dateTime={sale.cancelledAt}>
                  {saleDateTimeLabel(sale.cancelledAt, timezone)}
                </time>
              </DetailRow>
            )}
            {sale.discountReason === null ? null : (
              <DetailRow label="Discount reason">
                {sale.discountReason}
              </DetailRow>
            )}
            {sale.note === null ? null : (
              <DetailRow label="Note">{sale.note}</DetailRow>
            )}
            {sale.hold === null ? null : (
              <DetailRow label="Held by">{sale.hold.heldBy.fullName}</DetailRow>
            )}
          </dl>
        </section>

        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card lg:col-span-2">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-bold text-ink">Line items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Product
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Location
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    Unit price
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    Discount
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    Line total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {sale.lines.map((line) => (
                  <SaleLineRow
                    currency={sale.currency}
                    key={line.id}
                    line={line}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <dl className="space-y-1 border-t border-line px-5 py-4">
            <div className="flex justify-between text-sm">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="font-mono text-ink">
                {formatSaleMoney(sale.totals.subtotalMinor, sale.currency)}
              </dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-ink-muted">Discount</dt>
              <dd className="font-mono text-ink">
                {formatSaleMoney(sale.totals.discountMinor, sale.currency)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line-subtle pt-2 text-base font-bold">
              <dt className="text-ink">Total</dt>
              <dd className="font-mono text-ink">
                {formatSaleMoney(sale.totals.totalMinor, sale.currency)}
              </dd>
            </div>
            {sale.profit.availability === "available" ? (
              <div className="mt-2 flex justify-between border-t border-line-subtle pt-2 text-sm">
                <dt className="text-ink-muted">
                  Gross profit
                  {sale.profit.grossMarginBasisPoints === null
                    ? ""
                    : ` · ${(sale.profit.grossMarginBasisPoints / 100).toFixed(2)}% margin`}
                </dt>
                <dd
                  className={`font-mono font-bold ${sale.profit.grossProfitMinor >= 0 ? "text-positive" : "text-negative"}`}
                >
                  {formatSaleMoney(sale.profit.grossProfitMinor, sale.currency)}
                </dd>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-line-subtle pt-2 text-xs text-ink-muted">
                <LockIcon className="size-3" /> Profit is restricted for your
                role
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold text-ink">Payment breakdown</h2>
        </div>
        {sale.settlement.payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">
            No payment has been recorded. Payments are captured when a draft is
            posted.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Method
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Reference
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Recorded
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {sale.settlement.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-sm text-ink">
                      {formatPaymentMethod(payment.method)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                      {payment.reference ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      <time dateTime={payment.recordedAt}>
                        {saleDateTimeLabel(payment.recordedAt, timezone)}
                      </time>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-bold text-ink">
                      {formatSaleMoney(payment.amountMinor, sale.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="space-y-1 border-t border-line px-5 py-4">
          <div className="flex justify-between text-sm">
            <dt className="text-ink-muted">Paid now</dt>
            <dd className="font-mono text-ink">
              {formatSaleMoney(sale.settlement.paidMinor, sale.currency)}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-ink-muted">On credit (receivable)</dt>
            <dd className="font-mono text-ink">
              {formatSaleMoney(sale.settlement.receivableMinor, sale.currency)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function SaleDetailSkeleton(): JSX.Element {
  return (
    <div aria-label="Loading sale record" className="space-y-4" role="status">
      <span className="sr-only">Loading sale record</span>
      <div className="h-20 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-card bg-line-subtle" />
        <div className="h-72 animate-pulse rounded-card bg-line-subtle lg:col-span-2" />
      </div>
      <div className="h-40 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

export function SaleDetailPage({ id }: { readonly id: string }): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const permissions = auth.data?.permissions ?? [];
  const canView =
    auth.data === undefined || permissions.includes(PERMISSIONS.SALES_VIEW);
  const sale = useQuery(
    saleQueryOptions(id, auth.data !== undefined && canView),
  );

  if (auth.data === undefined && auth.isPending) {
    return <SaleDetailSkeleton />;
  }
  if (
    auth.data !== undefined &&
    !permissions.includes(PERMISSIONS.SALES_VIEW)
  ) {
    return (
      <CatalogForbiddenState
        description="Viewing a sale requires the server-provided sales.view permission. No sales request was sent."
        title="Sales access required"
      />
    );
  }
  if (sale.data !== undefined) {
    return (
      <SaleDetailView
        branchName={auth.data?.branch.name ?? "Your branch"}
        organizationName={auth.data?.organization.name ?? "Your shop"}
        sale={sale.data}
        timezone={auth.data?.organization.timezone ?? "Asia/Karachi"}
      />
    );
  }
  if (sale.isPending) {
    return <SaleDetailSkeleton />;
  }
  const error = toApiError(sale.error);
  if (error.code === "NOT_FOUND" || error.status === 404) {
    return <SaleNotFoundState id={id} />;
  }
  if (
    error.code === "FORBIDDEN_SCOPE" ||
    error.code === "FORBIDDEN_PERMISSION" ||
    error.status === 403
  ) {
    return (
      <CatalogForbiddenState
        description="This sale is outside your branch or location scope. No other sale is shown in its place."
        title="Sale not accessible"
      />
    );
  }
  return (
    <CatalogErrorState
      description="The sales ledger did not return this record. No fallback or substitute sale is shown."
      onRetry={() => void sale.refetch()}
      title="This sale could not be loaded"
      {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
    />
  );
}
