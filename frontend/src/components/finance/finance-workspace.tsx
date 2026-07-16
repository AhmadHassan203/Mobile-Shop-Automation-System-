"use client";

import {
  EXPENSE_CATEGORIES,
  formatMoney,
  fromMajor,
  PAYMENT_METHODS,
  PERMISSIONS,
  toMinor,
  type ExpenseCategory,
  type PaymentMethod,
} from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type JSX } from "react";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { ShieldCheckIcon } from "@/components/ui/icons";
import { createExpense } from "@/lib/api/expenses";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { expensesQueryOptions } from "@/lib/query/expenses-query";
import { queryKeys } from "@/lib/query/keys";
import { financeCapabilities } from "./finance-state";

const MAIN_KPIS = [
  { label: "Sales revenue", meta: "Sales ledger pending", href: "/reports" },
  { label: "Gross profit", meta: "Margin analytics pending", href: "/reports" },
  {
    label: "Operating expenses",
    meta: "Expense ledger pending",
    href: "#expenses",
  },
  {
    label: "Estimated net operating",
    meta: "Finance read model pending",
    href: "/reports",
  },
] as const;

const DIGITAL_KPIS = [
  {
    label: "Digital sent",
    meta: "Principal movement only",
    href: "/digital/history",
  },
  {
    label: "Digital received",
    meta: "Principal movement only",
    href: "/digital/history",
  },
  {
    label: "Digital fees + commission",
    meta: "Gross service earnings",
    href: "/digital/commission",
  },
  {
    label: "Net digital earnings",
    meta: "Settlement API pending",
    href: "/digital/commission",
  },
] as const;

const PNL_ROWS = [
  "Sales revenue",
  "Less: Discounts given",
  "Less: Returns & refunds",
  "Net sales",
  "Less: Cost of goods sold (COGS)",
  "Gross profit",
  "Less: Operating expenses",
  "Estimated net operating profit",
] as const;

const DIGITAL_PNL_ROWS = [
  "Digital principal sent",
  "Digital principal received",
  "Customer service fees",
  "Provider gross commission",
  "Less: Commission tax",
  "Less: Other direct charges",
  "Net digital-service earnings",
  "Combined operating + digital earnings",
] as const;

function money(minor: number, currency: string): string {
  return formatMoney(toMinor(minor, "finance amount"), currency);
}

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

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

const CATEGORY_LABELS: Readonly<Record<ExpenseCategory, string>> =
  Object.freeze(
    Object.fromEntries(
      EXPENSE_CATEGORIES.map((category) => [category, titleCase(category)]),
    ) as Record<ExpenseCategory, string>,
  );

const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> =
  Object.freeze({
    cash: "Cash",
    bank_transfer: "Bank transfer",
    card: "Card",
    digital_wallet: "Digital wallet",
    credit: "Credit",
  });

function PendingKpi({
  accent = false,
  href,
  label,
  meta,
}: {
  readonly accent?: boolean;
  readonly href: string;
  readonly label: string;
  readonly meta: string;
}): JSX.Element {
  return (
    <Link
      className={`rounded-card border bg-surface p-4 shadow-card ${
        accent ? "border-accent/35" : "border-line"
      }`}
      href={href}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p
        className={`mt-2 text-xl font-bold ${accent ? "text-accent" : "text-ink-muted"}`}
      >
        —
      </p>
      <p className="mt-1 text-[0.6875rem] text-ink-muted">{meta}</p>
    </Link>
  );
}

function PendingRows({ rows }: { readonly rows: readonly string[] }): JSX.Element {
  return (
    <dl className="divide-y divide-line-subtle">
      {rows.map((label, index) => {
        const total = [3, 5, 7].includes(index);
        return (
          <div
            className={`flex items-start justify-between gap-4 py-3 ${
              total ? "font-bold" : ""
            }`}
            key={label}
          >
            <dt
              className={
                label.startsWith("Less:") ? "text-ink-muted" : "text-ink"
              }
            >
              {label}
              {label === "Less: Cost of goods sold (COGS)" ? (
                <span className="mt-1 block max-w-md text-[0.6875rem] font-normal text-ink-muted">
                  Booked only when items sell—not when stock is bought.
                </span>
              ) : null}
            </dt>
            <dd className="font-mono text-ink-muted">—</dd>
          </div>
        );
      })}
    </dl>
  );
}

function ExpenseDrawer({
  onClose,
  onSaved,
}: {
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): JSX.Element {
  const [category, setCategory] = useState<ExpenseCategory>(
    EXPENSE_CATEGORIES[0],
  );
  const [amountMajor, setAmountMajor] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PAYMENT_METHODS[0],
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const amountMinor = parseMinor(amountMajor);
  const valid =
    amountMinor !== null && amountMinor > 0 && note.trim().length > 0;

  const submit = async (): Promise<void> => {
    if (busy || !valid || amountMinor === null) return;
    setBusy(true);
    setError(null);
    try {
      await createExpense({
        category,
        amountMinor,
        paymentMethod,
        note: note.trim(),
      });
      onSaved();
    } catch (caught) {
      setError(toApiError(caught));
      setBusy(false);
    }
  };

  return (
    <CatalogDrawer
      description="Record an operating expense. It lowers net operating profit but never changes COGS — the cost of an item is booked only when that item sells."
      footer={
        <>
          <button
            className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-bold text-ink disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-control bg-accent px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !valid}
            onClick={() => {
              void submit();
            }}
            type="button"
          >
            {busy ? "Recording…" : "Record expense"}
          </button>
        </>
      }
      onClose={onClose}
      title="Record an expense"
      titleId="record-expense-title"
    >
      <div className="space-y-4">
        {error === null ? null : (
          <div
            className="rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
            role="alert"
          >
            <p className="font-semibold">Expense was not recorded</p>
            <p className="mt-0.5">
              {error.code === "FORBIDDEN_PERMISSION" || error.status === 403
                ? "Your current permissions no longer allow recording expenses."
                : error.code === "NETWORK_ERROR"
                  ? "The expense API could not be reached. Nothing was recorded."
                  : "The expense could not be recorded. Review the fields and try again."}
            </p>
            {error.requestId === undefined ? null : (
              <p className="mt-1 font-mono text-xs">Ref: {error.requestId}</p>
            )}
          </div>
        )}
        <label className="block text-sm font-semibold text-ink">
          Category
          <select
            className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
            disabled={busy}
            onChange={(event) =>
              setCategory(event.target.value as ExpenseCategory)
            }
            value={category}
          >
            {EXPENSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            Amount (PKR)
            <input
              className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
              disabled={busy}
              inputMode="decimal"
              min="0"
              onChange={(event) => setAmountMajor(event.target.value)}
              placeholder="0"
              step="0.01"
              type="number"
              value={amountMajor}
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Payment method
            <select
              className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
              disabled={busy}
              onChange={(event) =>
                setPaymentMethod(event.target.value as PaymentMethod)
              }
              value={paymentMethod}
            >
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold text-ink">
          Note
          <textarea
            className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. WAPDA bill · receipt #4471"
            rows={3}
            value={note}
          />
          <span className="mt-1 block text-xs font-normal text-ink-muted">
            A short description is required so the entry is auditable at closing.
          </span>
        </label>
      </div>
    </CatalogDrawer>
  );
}

function ExpensesSection({
  canCreate,
  canView,
  currency,
  onRecord,
}: {
  readonly canCreate: boolean;
  readonly canView: boolean;
  readonly currency: string;
  readonly onRecord: () => void;
}): JSX.Element {
  const query = useQuery(
    expensesQueryOptions({ page: 1, pageSize: 20 }, canView),
  );

  let body: JSX.Element;
  if (!canView) {
    body = (
      <div className="p-5">
        <CatalogForbiddenState
          description="Viewing expenses requires the server-provided expenses.view permission."
          title="Expenses view not permitted"
        />
      </div>
    );
  } else if (query.isPending) {
    body = (
      <div className="p-5">
        <CatalogTableSkeleton rows={4} />
      </div>
    );
  } else if (query.data === undefined) {
    const error = toApiError(query.error);
    body = (
      <div className="p-5">
        <CatalogErrorState
          description="The expense API did not return a valid page. No fallback or mock rows are shown."
          onRetry={() => {
            void query.refetch();
          }}
          title="Expenses could not be loaded"
          {...(error.requestId === undefined
            ? {}
            : { requestId: error.requestId })}
        />
      </div>
    );
  } else if (query.data.items.length === 0) {
    body = (
      <CatalogEmptyState
        description="Recorded operating expenses appear here. No placeholder rows are shown."
        title="No expenses recorded yet"
      />
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
          <thead className="bg-surface-subtle text-xs text-ink-muted">
            <tr>
              {["Ref", "Category", "Method", "Date", "Note", "Amount"].map(
                (label) => (
                  <th
                    className="px-4 py-3 font-semibold last:text-right"
                    key={label}
                  >
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {query.data.items.map((expense) => (
              <tr key={expense.id}>
                <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">
                  {expense.expenseNumber}
                </td>
                <td className="px-4 py-3 text-ink">
                  {CATEGORY_LABELS[expense.category]}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {PAYMENT_METHOD_LABELS[expense.paymentMethod]}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {expense.businessDate}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-ink-muted">
                  {expense.note}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                  {money(expense.amountMinor, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const total =
    query.data === undefined ? null : `${query.data.total} entries`;

  return (
    <section
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
      id="expenses"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <h2 className="font-bold text-ink">Operating expenses</h2>
        <span className="ml-auto text-xs text-ink-muted">
          {total ?? "Expenses"}
        </span>
        {canCreate ? (
          <button
            className="rounded-control bg-accent px-3 py-1.5 text-xs font-bold text-white"
            onClick={onRecord}
            type="button"
          >
            + Record expense
          </button>
        ) : null}
      </div>
      {body}
      <div className="border-t border-line bg-surface-subtle px-5 py-4 text-xs text-ink-muted">
        Operating expenses lower net operating profit but stay separate from
        COGS—the cost of an item is booked only when that item sells.
      </div>
    </section>
  );
}

export function FinanceWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const queryClient = useQueryClient();
  const [expenseOpen, setExpenseOpen] = useState(false);

  if (auth.data === undefined) {
    return (
      <div
        aria-label="Loading finance workspace"
        className="h-72 animate-pulse rounded-card bg-line-subtle"
        role="status"
      />
    );
  }

  const capabilities = financeCapabilities(auth.data.permissions);
  const canViewExpenses = auth.data.permissions.includes(
    PERMISSIONS.EXPENSES_VIEW,
  );
  const currency = auth.data.organization.currency;

  if (!capabilities.canViewFinance) {
    return (
      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-wide text-negative">
          Access restricted
        </p>
        <h1 className="mt-2 text-xl font-bold text-ink">
          Finance permission required
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your current session has no finance read permission. No financial
          request was sent.
        </p>
      </section>
    );
  }

  const closeExpenseDrawer = (): void => setExpenseOpen(false);
  const handleExpenseSaved = (): void => {
    setExpenseOpen(false);
    void queryClient.invalidateQueries({ queryKey: queryKeys.expensesRoot });
  };

  return (
    <div className="space-y-[1.125rem]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            Finance &amp; Cash
          </h1>
          <p className="mt-1 max-w-4xl text-sm text-ink-muted">
            Management view for the current business day—<em>profit</em> is what
            you earned, <em>cash</em> is what you hold. They are not the same
            number.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-control border border-line bg-surface px-3.5 py-2 text-sm font-bold text-ink no-underline hover:bg-surface-subtle"
            href="/closing"
          >
            Daily closing
          </Link>
          <button
            className="rounded-control bg-accent px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={!capabilities.canCreateExpense}
            onClick={() => setExpenseOpen(true)}
            title={
              capabilities.canCreateExpense
                ? "Record an operating expense"
                : "expenses.create permission required"
            }
            type="button"
          >
            + Record expense
          </button>
        </div>
      </header>

      <section
        aria-label="Finance key performance indicators"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {MAIN_KPIS.map((item, index) => (
          <PendingKpi
            accent={index === 0}
            href={item.href}
            key={item.label}
            label={item.label}
            meta={item.meta}
          />
        ))}
      </section>

      <div className="flex items-start gap-2.5 rounded-card border border-info/25 bg-info-soft px-4 py-3 text-sm text-info">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>Profit is not cash.</strong> Buying stock reduces cash now, but
          becomes COGS only when the item sells. The revenue KPIs stay blank
          until the source-led Finance and Sales APIs exist; recorded expenses
          below are live.
        </p>
      </div>

      <section
        aria-label="Digital service key performance indicators"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {DIGITAL_KPIS.map((item, index) => (
          <PendingKpi
            accent={index === 3}
            href={item.href}
            key={item.label}
            label={item.label}
            meta={item.meta}
          />
        ))}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card xl:col-span-2">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <h2 className="font-bold text-ink">Profit &amp; loss—today</h2>
            <span className="ml-auto text-xs text-ink-muted">
              How revenue becomes profit
            </span>
          </div>
          <div className="p-5">
            <PendingRows rows={PNL_ROWS} />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-bold text-ink">Digital services earnings</h2>
            </div>
            <div className="p-5">
              <PendingRows rows={DIGITAL_PNL_ROWS} />
            </div>
          </section>
        </aside>
      </div>

      <ExpensesSection
        canCreate={capabilities.canCreateExpense}
        canView={canViewExpenses}
        currency={currency}
        onRecord={() => setExpenseOpen(true)}
      />

      {expenseOpen ? (
        <ExpenseDrawer
          onClose={closeExpenseDrawer}
          onSaved={handleExpenseSaved}
        />
      ) : null}
    </div>
  );
}
