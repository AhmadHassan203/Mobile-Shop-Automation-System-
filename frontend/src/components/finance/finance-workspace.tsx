"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type JSX } from "react";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import { ShieldCheckIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
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

const EXPENSE_CATEGORIES = [
  "Shop rent (daily accrual)",
  "Electricity",
  "Salaries / wages",
  "Staff tea / misc",
  "Packaging / bags",
  "Internet / DSL",
  "Repairs & maintenance",
  "Marketing / ads",
  "Transport / delivery",
  "Bank charges",
  "Other",
] as const;

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

function PendingRows({
  rows,
}: {
  readonly rows: readonly string[];
}): JSX.Element {
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
}: {
  readonly onClose: () => void;
}): JSX.Element {
  const [source, setSource] = useState<"cash" | "bank">("cash");
  const [amount, setAmount] = useState("");
  const numericAmount = Number(amount);
  const formattedAmount =
    amount.length > 0 && Number.isFinite(numericAmount) && numericAmount >= 0
      ? `Rs ${numericAmount.toLocaleString("en-PK")}`
      : "the entered amount";
  return (
    <CatalogDrawer
      description="Capture category, amount, funding source and audit evidence. Persistence is locked until the Finance API is available."
      footer={
        <>
          <button
            className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-bold text-ink"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-control bg-accent px-4 py-2 text-sm font-bold text-white opacity-50"
            disabled
            title="Finance API pending"
            type="button"
          >
            Record expense
          </button>
        </>
      }
      onClose={onClose}
      title="Record an expense"
      titleId="record-expense-title"
    >
      <div className="space-y-4">
        <label className="block text-sm font-semibold text-ink">
          Category
          <select className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal">
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            Amount (Rs)
            <input
              className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
              inputMode="numeric"
              min="0"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
              step="100"
              type="number"
              value={amount}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold text-ink">
              Paid from
            </legend>
            <div className="mt-1 flex rounded-control border border-line p-1">
              {(["cash", "bank"] as const).map((value) => (
                <button
                  className={`flex-1 rounded-control px-2 py-1.5 text-xs font-bold ${
                    source === value
                      ? "bg-accent text-white"
                      : "text-ink-muted hover:bg-surface-subtle"
                  }`}
                  key={value}
                  onClick={() => setSource(value)}
                  type="button"
                >
                  {value === "cash" ? "Cash drawer" : "Bank / wallet"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <label className="block text-sm font-semibold text-ink">
          Date
          <input
            className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
            type="date"
          />
          <span className="mt-1 block text-xs font-normal text-ink-muted">
            Recorded against the current business day.
          </span>
        </label>
        <label className="block text-sm font-semibold text-ink">
          Evidence / note
          <textarea
            className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 font-normal"
            placeholder="e.g. WAPDA bill photo attached · receipt #4471"
            rows={3}
          />
          <span className="mt-1 block text-xs font-normal text-ink-muted">
            Attach a reference so the entry is auditable at closing.
          </span>
        </label>
        <div className="rounded-control border border-info/25 bg-info-soft p-4 text-sm text-info">
          <strong>Impact preview</strong>
          <p className="mt-1">
            {formattedAmount} will reduce operating profit and the{" "}
            {source === "cash" ? "cash drawer" : "bank / wallet"}; it will never
            alter COGS. Final balances await the Finance API.
          </p>
        </div>
      </div>
    </CatalogDrawer>
  );
}

export function FinanceWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
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
          <button
            className="rounded-control border border-line bg-surface px-3.5 py-2 text-sm font-bold text-ink opacity-50"
            disabled
            title={
              capabilities.canExportFinance
                ? "Finance export API pending"
                : "reports.export permission required"
            }
            type="button"
          >
            Export for accountant
          </button>
          <button
            className="rounded-control bg-accent px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50"
            disabled={!capabilities.canCreateExpense}
            onClick={() => setExpenseOpen(true)}
            title={
              capabilities.canCreateExpense
                ? "Preview the prototype expense drawer"
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
          <strong>Profit is not cash.</strong> Buying stock reduces cash now,
          but becomes COGS only when the item sells. Values stay blank until the
          source-led Finance and Sales APIs exist.
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
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <h2 className="font-bold text-ink">Cash &amp; bank</h2>
              <span className="ml-auto text-xs text-ink-muted">
                What you actually hold
              </span>
            </div>
            <div className="p-5">
              <dl className="divide-y divide-line-subtle">
                {[
                  { label: "Cash in drawer", href: "/closing" },
                  { label: "Bank & digital wallets" },
                  {
                    label: "Digital service floats",
                    href: "/digital/balances",
                  },
                  { label: "Digital cash impact", href: "/digital/history" },
                  { label: "Total liquid funds" },
                ].map((item) => {
                  const content = (
                    <>
                      <dt className="text-xs text-ink-muted">{item.label}</dt>
                      <dd className="font-mono font-bold text-ink-muted">—</dd>
                    </>
                  );
                  return item.href === undefined ? (
                    <div
                      className="flex items-center justify-between gap-3 py-3"
                      key={item.label}
                    >
                      {content}
                    </div>
                  ) : (
                    <Link
                      className="flex items-center justify-between gap-3 py-3 no-underline hover:text-accent"
                      href={item.href}
                      key={item.label}
                    >
                      {content}
                    </Link>
                  );
                })}
              </dl>
              <p className="my-3 text-xs text-ink-muted">
                Cash session state and balances await their source APIs.
              </p>
              <Link
                className="block rounded-control border border-line px-4 py-2.5 text-center text-sm font-bold text-ink no-underline hover:bg-surface-subtle"
                href="/closing"
              >
                Go to Daily Closing →
              </Link>
            </div>
          </section>

          <Link
            className="block rounded-card border border-line bg-surface p-5 text-ink no-underline shadow-card"
            href="/customers"
          >
            <p className="text-xs font-semibold text-ink-muted">
              Receivables—owed to you
            </p>
            <p className="mt-1 text-xl font-bold text-ink-muted">—</p>
            <p className="mt-1 text-xs text-ink-muted">
              Customer credit API pending →
            </p>
          </Link>
          <Link
            className="block rounded-card border border-line bg-surface p-5 text-ink no-underline shadow-card"
            href="/purchases?tab=suppliers"
          >
            <p className="text-xs font-semibold text-ink-muted">
              Payables—you owe suppliers
            </p>
            <p className="mt-1 text-xl font-bold text-ink-muted">—</p>
            <p className="mt-1 text-xs text-ink-muted">
              Supplier payable summary pending →
            </p>
          </Link>
        </aside>
      </div>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">
            Digital services earnings—today
          </h2>
          <span className="ml-auto text-xs text-ink-muted">
            Principal kept separate from sales revenue
          </span>
        </div>
        <div className="p-5">
          <PendingRows rows={DIGITAL_PNL_ROWS} />
        </div>
      </section>

      <section
        className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
        id="expenses"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">Operating expenses—today</h2>
          <span className="ml-auto text-xs text-ink-muted">
            0 entries · API pending
          </span>
          <button
            className="rounded-control bg-accent px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            disabled={!capabilities.canCreateExpense}
            onClick={() => setExpenseOpen(true)}
            type="button"
          >
            + Record expense
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
            <thead className="bg-surface-subtle text-xs text-ink-muted">
              <tr>
                {[
                  "Ref",
                  "Category",
                  "Source",
                  "Date",
                  "Evidence / note",
                  "Amount",
                ].map((label) => (
                  <th
                    className="px-4 py-3 font-semibold last:text-right"
                    key={label}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
          <div className="border-t border-line p-5 text-center text-sm text-ink-muted">
            No API-backed expenses are available yet.
          </div>
        </div>
        <div className="border-t border-line bg-surface-subtle px-5 py-4 text-xs text-ink-muted">
          Operating expenses lower net operating profit but stay separate from
          COGS—the cost of an item is booked only when that item sells.
        </div>
      </section>

      {expenseOpen ? (
        <ExpenseDrawer onClose={() => setExpenseOpen(false)} />
      ) : null}
    </div>
  );
}
