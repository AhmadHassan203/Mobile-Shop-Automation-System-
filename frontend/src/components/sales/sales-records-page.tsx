"use client";

import {
  formatMoney,
  LIMITS,
  PAGINATION,
  PAYMENT_METHODS,
  PERMISSIONS,
  SALE_STATUSES,
  toMinor,
  type PaymentMethod,
  type SaleStatus,
  type SaleSummary,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type JSX } from "react";
import { z } from "zod";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogNoResultsState,
} from "@/components/catalog/catalog-states";
import { CartIcon, SearchIcon } from "@/components/ui/icons";
import { toApiError, type ApiError } from "@/lib/api/client";
import type { SaleListParameters } from "@/lib/api/sales";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { salesQueryOptions } from "@/lib/query/sales-query";

const PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;

export const SALE_STATUS_LABELS: Readonly<Record<SaleStatus, string>> =
  Object.freeze({
    draft: "Draft",
    posted: "Posted",
    cancelled: "Cancelled",
    partially_returned: "Partially returned",
    returned: "Returned",
  });

const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> =
  Object.freeze({
    cash: "Cash",
    bank_transfer: "Bank transfer",
    card: "Card",
    digital_wallet: "Digital wallet",
    credit: "Credit",
  });

export function formatSaleMoney(valueMinor: number, currency: string): string {
  return formatMoney(toMinor(valueMinor, "sale value"), currency);
}

export function formatPaymentMethod(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method.replaceAll("_", " ");
}

export function saleStatusBadgeClass(status: SaleStatus): string {
  switch (status) {
    case "posted":
      return "bg-positive-soft text-positive";
    case "cancelled":
      return "bg-surface-subtle text-ink-muted";
    case "partially_returned":
      return "bg-warning-soft text-warning";
    case "returned":
      return "bg-negative-soft text-negative";
    case "draft":
    default:
      return "bg-accent-soft text-accent-ink";
  }
}

export function saleDateTimeLabel(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-PK", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value.replace("T", " ").slice(0, 16);
  }
}

function oneOf<TValue extends string>(
  value: string | null,
  options: readonly TValue[],
): TValue | undefined {
  return value !== null && options.includes(value as TValue)
    ? (value as TValue)
    : undefined;
}

function positivePage(value: string | null): number {
  if (value === null || !/^\d+$/u.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function searchValue(value: string | null): string | undefined {
  const normalized = value?.trim().slice(0, LIMITS.MAX_SEARCH_TERM_LENGTH);
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function isoDateValue(value: string | null): string | undefined {
  if (value === null) return undefined;
  return z.iso.date().safeParse(value).success ? value : undefined;
}

export function saleRecordsParametersFrom(
  searchParams: URLSearchParams,
): SaleListParameters {
  const q = searchValue(searchParams.get("q"));
  const status = oneOf(searchParams.get("status"), SALE_STATUSES);
  const paymentMethod = oneOf(searchParams.get("method"), PAYMENT_METHODS);
  const from = isoDateValue(searchParams.get("from"));
  const toRaw = isoDateValue(searchParams.get("to"));
  // A start after the end is dropped so the server never rejects the read.
  const to = from !== undefined && toRaw !== undefined && from > toRaw
    ? undefined
    : toRaw;
  return {
    page: positivePage(searchParams.get("page")),
    pageSize: PAGE_SIZE,
    sort: "posted_at",
    direction: "desc",
    ...(q === undefined ? {} : { q }),
    ...(status === undefined ? {} : { status }),
    ...(paymentMethod === undefined ? {} : { paymentMethod }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

export function salesRecordsReadErrorCopy(error: ApiError): {
  readonly title: string;
  readonly description: string;
} {
  if (error.code === "NETWORK_ERROR") {
    return {
      title: "The sales ledger could not be reached",
      description:
        "The service may be offline. No cached or fallback sales are shown.",
    };
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return {
      title: "The sales ledger did not respond in time",
      description:
        "Retry the read. No sale figures are inferred while the request is unresolved.",
    };
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return {
      title: "Sales access was rejected",
      description:
        "The server rejected this read for the current permission set. Ask an owner to review sales.view.",
    };
  }
  if (error.code === "INVALID_RESPONSE") {
    return {
      title: "The sales response was rejected",
      description:
        "The API response did not match the strict sales contract, so no potentially incorrect records are displayed.",
    };
  }
  return {
    title: "Sales could not be loaded",
    description:
      "The API did not return a usable sales page. No fallback or mock records are shown.",
  };
}

function SalesTableSkeleton(): JSX.Element {
  return (
    <div
      aria-label="Loading sale records"
      className="overflow-hidden rounded-card border border-line bg-surface"
      role="status"
    >
      <span className="sr-only">Loading sale records</span>
      <div className="h-12 animate-pulse border-b border-line-subtle bg-line-subtle/65" />
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="h-[4.5rem] animate-pulse border-b border-line-subtle bg-surface last:border-0"
          key={index}
        />
      ))}
    </div>
  );
}

export function SalesRecordsRouteFallback(): JSX.Element {
  return (
    <div aria-label="Loading sale records" className="space-y-4" role="status">
      <span className="sr-only">Loading sale records</span>
      <div className="h-24 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-32 animate-pulse rounded-card bg-line-subtle" />
      <SalesTableSkeleton />
    </div>
  );
}

interface PaginationProps {
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
  readonly onPage: (page: number) => void;
}

function Pagination({
  page,
  total,
  totalPages,
  onPage,
}: PaginationProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-muted">
      <p>
        {total === 0 ? "No records" : `${total} recorded`} · Page {page} of{" "}
        {Math.max(totalPages, 1)}
      </p>
      <div className="flex gap-2">
        <button
          className="min-h-8 rounded-control border border-line px-3 font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className="min-h-8 rounded-control border border-line px-3 font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** The customer column only shows a name or phone when one was recorded. */
function SaleCustomerCell({
  customer,
}: {
  readonly customer: SaleSummary["customer"];
}): JSX.Element {
  if (customer === null) {
    return <span className="text-xs text-ink-muted">Walk-in</span>;
  }
  return (
    <div className="min-w-0">
      {customer.name === null ? null : (
        <p className="truncate text-sm text-ink">{customer.name}</p>
      )}
      <p className="truncate font-mono text-xs text-ink-muted">
        {customer.phone}
      </p>
    </div>
  );
}

function SaleProfitCell({
  profit,
  currency,
}: {
  readonly profit: SaleSummary["profit"];
  readonly currency: string;
}): JSX.Element {
  if (profit.availability !== "available") {
    return <span className="text-xs text-ink-muted">Restricted</span>;
  }
  const tone =
    profit.grossProfitMinor > 0
      ? "text-positive"
      : profit.grossProfitMinor < 0
        ? "text-negative"
        : "text-ink";
  return (
    <span className={`font-mono text-sm font-bold ${tone}`}>
      {formatSaleMoney(profit.grossProfitMinor, currency)}
    </span>
  );
}

export interface SaleRecordsTableProps {
  readonly items: readonly SaleSummary[];
  readonly currency: string;
  readonly timezone: string;
  readonly canViewProfit: boolean;
}

/** The pure records table. It is presentational so it renders in unit tests. */
export function SaleRecordsTable({
  items,
  currency,
  timezone,
  canViewProfit,
}: SaleRecordsTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full ${canViewProfit ? "min-w-[64rem]" : "min-w-[56rem]"} border-collapse text-left`}
      >
        <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-4 py-3 font-bold" scope="col">
              Invoice
            </th>
            <th className="px-4 py-3 font-bold" scope="col">
              Date &amp; time
            </th>
            <th className="px-4 py-3 font-bold" scope="col">
              Cashier
            </th>
            <th className="px-4 py-3 font-bold" scope="col">
              Customer
            </th>
            <th className="px-4 py-3 text-right font-bold" scope="col">
              Items
            </th>
            <th className="px-4 py-3 font-bold" scope="col">
              Payment
            </th>
            <th className="px-4 py-3 font-bold" scope="col">
              Status
            </th>
            <th className="px-4 py-3 text-right font-bold" scope="col">
              Total
            </th>
            {canViewProfit ? (
              <th className="px-4 py-3 text-right font-bold" scope="col">
                Gross profit
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {items.map((sale) => {
            const when = sale.postedAt ?? sale.createdAt;
            return (
              <tr className="transition hover:bg-surface-subtle" key={sale.id}>
                <td className="px-4 py-3">
                  <Link
                    aria-label={`Open sale ${sale.invoiceNumber ?? "draft"}`}
                    className="font-mono text-sm font-bold text-accent no-underline hover:underline"
                    href={`/sales/${sale.id}`}
                  >
                    {sale.invoiceNumber ?? "Unposted draft"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-ink-muted">
                  <time dateTime={when}>
                    {saleDateTimeLabel(when, timezone)}
                  </time>
                  {sale.postedAt === null ? (
                    <span className="ml-1 text-[0.625rem] uppercase tracking-wide text-ink-muted">
                      (created)
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-ink-subtle">
                  {sale.cashier === null ? (
                    <span className="text-xs text-ink-muted">Not recorded</span>
                  ) : (
                    sale.cashier.fullName
                  )}
                </td>
                <td className="px-4 py-3">
                  <SaleCustomerCell customer={sale.customer} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-ink">
                  {sale.unitCount}
                </td>
                <td className="px-4 py-3">
                  {sale.paymentMethods.length === 0 ? (
                    <span className="text-xs text-ink-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {sale.paymentMethods.map((method) => (
                        <span
                          className="rounded-full border border-line bg-surface-subtle px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-muted"
                          key={method}
                        >
                          {formatPaymentMethod(method)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${saleStatusBadgeClass(sale.status)}`}
                  >
                    {SALE_STATUS_LABELS[sale.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm font-bold text-ink">
                  {formatSaleMoney(sale.totalMinor, currency)}
                </td>
                {canViewProfit ? (
                  <td className="px-4 py-3 text-right">
                    <SaleProfitCell currency={currency} profit={sale.profit} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface FiltersState {
  readonly q: string | undefined;
  readonly status: SaleStatus | undefined;
  readonly paymentMethod: PaymentMethod | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
}

const FILTER_KEYS = ["q", "status", "method", "from", "to", "page"] as const;

function SalesFilters({
  filters,
  onSearch,
  onUpdate,
  onClear,
  hasFilters,
}: {
  readonly filters: FiltersState;
  readonly onSearch: (value: string) => void;
  readonly onUpdate: (values: Readonly<Record<string, string | undefined>>) => void;
  readonly onClear: () => void;
  readonly hasFilters: boolean;
}): JSX.Element {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    onSearch(typeof value === "string" ? value.trim() : "");
  };
  return (
    <section
      aria-label="Sale record search and filters"
      className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <form
        className="flex gap-2"
        key={filters.q ?? ""}
        onSubmit={submit}
        role="search"
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search sales by invoice number</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
            defaultValue={filters.q}
            maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
            name="q"
            placeholder="Search invoice number, customer, SKU or IMEI"
            type="search"
          />
        </label>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
          type="submit"
        >
          <SearchIcon className="size-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </form>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-ink-subtle">
          Status
          <select
            className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
            onChange={(event) =>
              onUpdate({ status: event.target.value || undefined })
            }
            value={filters.status ?? ""}
          >
            <option value="">All statuses</option>
            {SALE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SALE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-subtle">
          Payment method
          <select
            className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
            onChange={(event) =>
              onUpdate({ method: event.target.value || undefined })
            }
            value={filters.paymentMethod ?? ""}
          >
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {formatPaymentMethod(method)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-subtle">
          From (business date)
          <input
            className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
            onChange={(event) =>
              onUpdate({ from: event.target.value || undefined })
            }
            type="date"
            value={filters.from ?? ""}
          />
        </label>
        <label className="text-xs font-semibold text-ink-subtle">
          To (business date)
          <input
            className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
            onChange={(event) =>
              onUpdate({ to: event.target.value || undefined })
            }
            type="date"
            value={filters.to ?? ""}
          />
        </label>
      </div>
      {hasFilters ? (
        <button
          className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong"
          onClick={onClear}
          type="button"
        >
          Clear sale filters
        </button>
      ) : null}
    </section>
  );
}

function SalesWorkspace({
  currency,
  timezone,
  canViewProfit,
}: {
  readonly currency: string;
  readonly timezone: string;
  readonly canViewProfit: boolean;
}): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parameters = saleRecordsParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const sales = useQuery(salesQueryOptions(parameters, true));
  const filters: FiltersState = {
    q: parameters.q,
    status: parameters.status,
    paymentMethod: parameters.paymentMethod,
    from: parameters.from,
    to: parameters.to,
  };
  const hasFilters =
    filters.q !== undefined ||
    filters.status !== undefined ||
    filters.paymentMethod !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined;

  const applyParams = (
    values: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value.length === 0) next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    const query = next.toString();
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };
  const clear = (): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) next.delete(key);
    const query = next.toString();
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };
  const error =
    sales.error === null || sales.data !== undefined
      ? null
      : toApiError(sales.error);
  const page = sales.data;

  return (
    <div>
      <header className="mb-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">
              Sales · Immutable ledger
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
              Sale records
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
              Every posted invoice and unposted draft from your branch. Figures
              are the server&apos;s exact ledger values; open a record to see its
              full line items and settlement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-positive-soft px-3 py-1.5 text-positive">
              Real API data
            </span>
            {canViewProfit ? (
              <span className="rounded-full bg-accent-soft px-3 py-1.5 text-accent-ink">
                Profit visible
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <SalesFilters
        filters={filters}
        hasFilters={hasFilters}
        onClear={clear}
        onSearch={(value) => applyParams({ q: value || undefined })}
        onUpdate={applyParams}
      />

      {error !== null ? (
        <CatalogErrorState
          {...salesRecordsReadErrorCopy(error)}
          onRetry={() => void sales.refetch()}
          {...(error.requestId === undefined
            ? {}
            : { requestId: error.requestId })}
        />
      ) : page === undefined ? (
        <SalesTableSkeleton />
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {page.items.length === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState onClear={clear} />
            ) : (
              <CatalogEmptyState
                description="No sale has been recorded for this branch yet. Posting a sale from the counter will create the first invoice; no sample records are shown here."
                icon={<CartIcon className="size-6" />}
                title="No sale records yet"
              />
            )
          ) : (
            <SaleRecordsTable
              canViewProfit={canViewProfit}
              currency={currency}
              items={page.items}
              timezone={timezone}
            />
          )}
          <Pagination
            onPage={(next) =>
              applyParams({ page: next === 1 ? undefined : String(next) }, false)
            }
            page={page.page}
            total={page.total}
            totalPages={page.totalPages}
          />
        </section>
      )}
    </div>
  );
}

export function SalesRecordsPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  if (auth.data === undefined && auth.isPending) {
    return <SalesRecordsRouteFallback />;
  }
  const permissions = auth.data?.permissions ?? [];
  if (!permissions.includes(PERMISSIONS.SALES_VIEW)) {
    return (
      <CatalogForbiddenState
        description="Viewing sale records requires the server-provided sales.view permission. No sales request was sent."
        title="Sales access required"
      />
    );
  }
  return (
    <SalesWorkspace
      canViewProfit={permissions.includes(PERMISSIONS.SALES_VIEW_PROFIT)}
      currency={auth.data?.organization.currency ?? "PKR"}
      timezone={auth.data?.organization.timezone ?? "Asia/Karachi"}
    />
  );
}
