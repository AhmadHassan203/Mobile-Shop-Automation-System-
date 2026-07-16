"use client";

import { LIMITS, PAGINATION } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  CheckCircleIcon,
  CloseIcon,
  LockIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { catalogProductsQueryOptions } from "@/lib/query/catalog-query";
import { stockBalancesQueryOptions } from "@/lib/query/inventory-query";
import {
  POS_SERVICE_AVAILABILITY,
  addCartProduct,
  buildPosProducts,
  cartUnitCount,
  checkoutBlockers,
  posCapabilities,
  posFlowSteps,
  setCartQuantity,
  type PosCartLine,
  type PosProduct,
} from "./pos-state";

const SOURCE_PAGE_SIZE = PAGINATION.MAX_PAGE_SIZE;
const shortcuts = [
  ["/", "Search"],
  ["F2", "Customer"],
  ["F4", "Discount"],
  ["F8", "Payment"],
  ["Ctrl+Enter", "Review & post"],
] as const;
const paymentMethods = ["Cash", "Bank", "Card", "JazzCash"] as const;
type Overlay = "customer" | "review" | "receipt" | null;

function ErrorPanel({
  error,
  label,
  retry,
}: {
  readonly error: ApiError;
  readonly label: string;
  readonly retry: () => void;
}): JSX.Element {
  return (
    <div
      className="rounded-control border border-negative/25 bg-negative-soft p-4 text-sm text-negative"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">{label} could not be loaded</p>
          <p className="mt-1 text-xs">
            {error.code === "NETWORK_ERROR"
              ? "The API is unreachable. No demo or cached counter records are shown."
              : error.code === "INVALID_RESPONSE"
                ? "The server response failed its strict contract, so it was not displayed."
                : "The API did not return a usable response. No values were inferred."}
          </p>
          {error.requestId === undefined ? null : (
            <p className="mt-1 font-mono text-[0.6875rem]">
              Request {error.requestId}
            </p>
          )}
          <button
            className="mt-3 min-h-8 rounded-control border border-negative/30 bg-surface px-3 text-xs font-semibold"
            onClick={retry}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

function CounterSkeleton(): JSX.Element {
  return (
    <div className="space-y-4" role="status">
      <span className="sr-only">Loading point of sale</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-4 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-[340px_minmax(0,1fr)_344px]">
        <div className="h-[34rem] animate-pulse rounded-card bg-line-subtle" />
        <div className="h-[34rem] animate-pulse rounded-card bg-line-subtle" />
        <div className="h-[34rem] animate-pulse rounded-card bg-line-subtle min-[821px]:col-span-2 min-[1201px]:col-span-1" />
      </div>
    </div>
  );
}

export function SellRouteFallback(): JSX.Element {
  return <CounterSkeleton />;
}

function PermissionGate({ missing }: { readonly missing: readonly string[] }) {
  return (
    <section
      className="rounded-card border border-warning/30 bg-surface p-6 shadow-card"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
          <ShieldCheckIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-ink">
            Sell access required
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-subtle">
            The counter needs server-provided permission to prepare sales and
            read both active catalog identity and branch stock. No catalog or
            inventory request was sent.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {missing.map((permission) => (
              <code
                className="rounded-full bg-warning-soft px-2.5 py-1 text-xs text-warning"
                key={permission}
              >
                {permission}
              </code>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StockBadge({ available }: { readonly available: number }) {
  const className =
    available <= 0
      ? "bg-negative-soft text-negative"
      : available <= 2
        ? "bg-warning-soft text-warning"
        : "bg-positive-soft text-positive";
  const label =
    available <= 0
      ? "Out"
      : available <= 2
        ? `Low · ${available}`
        : `In stock · ${available}`;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function ProductResults({
  products,
  cart,
  onAdd,
}: {
  readonly products: readonly PosProduct[];
  readonly cart: readonly PosCartLine[];
  readonly onAdd: (product: PosProduct) => void;
}): JSX.Element {
  if (products.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-ink-muted">
        <SearchIcon className="mx-auto size-9 opacity-45" />
        <h4 className="mt-3 text-sm font-semibold text-ink-subtle">No match</h4>
        <p className="mt-1 text-xs">
          No active product matched this search. No fallback items are shown.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[35rem] space-y-2 overflow-y-auto px-4 pb-4">
      {products.map((product) => {
        const selected =
          cart.find((line) => line.productId === product.id)?.quantity ?? 0;
        const atLimit = selected >= product.available;
        return (
          <button
            aria-label={`Add ${product.sku} to cart`}
            className="flex w-full items-center gap-3 rounded-[0.625rem] border border-line bg-surface p-3 text-left shadow-sm transition-colors hover:border-accent disabled:cursor-not-allowed disabled:hover:border-line"
            disabled={product.available <= 0 || atLimit}
            key={product.id}
            onClick={() => onAdd(product)}
            type="button"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-control border border-line bg-surface-subtle text-ink-muted">
              <BoxIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] font-semibold text-ink">
                {product.brandName} {product.modelName} · {product.name}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-ink-muted">
                {product.sku}
              </span>
              <span className="mt-1 block text-[0.6875rem] text-ink-muted">
                {product.categoryName} · {product.trackingType} ·{" "}
                {product.locationNames.length === 0
                  ? "no stocked location"
                  : product.locationNames.join(", ")}
              </span>
            </span>
            <span className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-xs font-semibold text-ink-subtle">
                Price unavailable
              </span>
              <StockBadge available={product.available} />
              {selected > 0 ? (
                <span className="text-[0.6875rem] font-semibold text-accent">
                  {selected} selected
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Cart({
  lines,
  onClear,
  onQuantity,
}: {
  readonly lines: readonly PosCartLine[];
  readonly onClear: () => void;
  readonly onQuantity: (productId: string, quantity: number) => void;
}): JSX.Element {
  const units = cartUnitCount(lines);
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex min-h-[3.25rem] items-center gap-3 border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Cart</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            {units === 0 ? "Empty" : `${units} ${units === 1 ? "item" : "items"}`}
          </span>
          {lines.length === 0 ? null : (
            <button
              className="min-h-8 rounded-control px-2.5 text-xs font-semibold text-ink-muted hover:bg-surface-subtle"
              onClick={onClear}
              type="button"
            >
              Clear
            </button>
          )}
        </div>
      </header>
      <div className="p-[1.125rem]">
        {lines.length === 0 ? (
          <div className="px-4 py-10 text-center text-ink-muted">
            <BoxIcon className="mx-auto size-10 opacity-45" />
            <h3 className="mt-3 text-[0.9375rem] font-semibold text-ink-subtle">
              Cart is empty
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs">
              Search on the left and tap a product to stage it. Serialized unit
              selection will use a real IMEI only after the sales API exists.
            </p>
          </div>
        ) : (
          <div>
            <div>
              {lines.map((line) => (
                <div
                  className="flex items-center gap-3 border-b border-line-subtle py-3 last:border-0"
                  key={line.productId}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-control border border-line bg-surface-subtle text-ink-muted">
                    <BoxIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-ink">
                      {line.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-ink-muted">
                      {line.sku}
                    </p>
                    {line.trackingType === "serialized" ? (
                      <p className="mt-1 text-[0.6875rem] text-warning">
                        IMEI selection pending · no identifier invented
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center overflow-hidden rounded-control border border-line">
                    <button
                      aria-label={`Decrease ${line.name} quantity`}
                      className="grid size-7 place-items-center text-base text-ink-subtle hover:bg-surface-subtle"
                      onClick={() => onQuantity(line.productId, line.quantity - 1)}
                      type="button"
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-xs font-semibold text-ink">
                      {line.quantity}
                    </span>
                    <button
                      aria-label={`Increase ${line.name} quantity`}
                      className="grid size-7 place-items-center text-base text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={line.quantity >= line.availableSnapshot}
                      onClick={() => onQuantity(line.productId, line.quantity + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-[5.75rem] shrink-0 text-right">
                    <p className="text-xs font-semibold text-ink">—</p>
                    <p className="text-[0.6875rem] text-ink-muted">
                      price pending
                    </p>
                  </div>
                  <button
                    aria-label={`Remove ${line.name} from cart`}
                    className="grid size-7 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-negative-soft hover:text-negative"
                    onClick={() => onQuantity(line.productId, 0)}
                    type="button"
                  >
                    <CloseIcon className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-line-subtle pt-4">
              <div className="flex gap-3 max-sm:flex-col">
                <label className="w-36 max-sm:w-full">
                  <span className="mb-1 block text-xs font-semibold text-ink-subtle">
                    Discount (Rs) <kbd className="font-mono text-[0.6875rem]">F4</kbd>
                  </span>
                  <input
                    className="min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 text-sm text-ink-muted"
                    disabled
                    placeholder="Pricing required"
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-semibold text-ink-subtle">
                    Reason <span className="font-normal text-ink-muted">(pending)</span>
                  </span>
                  <input
                    className="min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 text-sm text-ink-muted"
                    disabled
                    placeholder="Loyal customer, display piece, price match"
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-warning">
                Discount validation is unavailable until authoritative prices
                and margin rules are exposed by the server.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CustomerCard({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Customer</h2>
        <button
          className="ml-auto min-h-8 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
          onClick={onOpen}
          type="button"
        >
          Change <kbd className="font-mono text-[0.6875rem]">F2</kbd>
        </button>
      </header>
      <div className="flex items-center gap-3 p-[1.125rem]">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">
          WI
        </span>
        <div>
          <p className="font-semibold text-ink">Walk-in</p>
          <p className="text-xs text-ink-muted">No account · anonymous sale</p>
        </div>
      </div>
    </section>
  );
}

function PaymentCard({
  lines,
  onReview,
}: {
  readonly lines: readonly PosCartLine[];
  readonly onReview: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">Payment</h2>
        <span className="ml-auto text-xs text-ink-muted">
          Split supported · API pending
        </span>
      </header>
      <div className="p-[1.125rem]">
        {[
          ["Subtotal", "—"],
          ["Discount", "—"],
          ["Grand total", "Unavailable"],
        ].map(([label, value], index) => (
          <div
            className="flex items-center justify-between gap-3 border-b border-line-subtle py-1.5 last:border-0"
            key={label}
          >
            <span
              className={`text-ink-muted ${index === 2 ? "text-sm" : "text-xs"}`}
            >
              {label}
            </span>
            <span
              className={`font-semibold text-ink ${index === 2 ? "text-base" : "text-xs"}`}
            >
              {value}
            </span>
          </div>
        ))}
        <fieldset className="mt-4" disabled>
          <legend className="mb-1.5 text-xs font-semibold text-ink-subtle">
            Payment method <kbd className="font-mono text-[0.6875rem]">F8</kbd>
          </legend>
          <div className="grid grid-cols-2 overflow-hidden rounded-control border border-line">
            {paymentMethods.map((method) => (
              <button
                className="min-h-9 border-b border-r border-line bg-surface-subtle px-2 text-xs font-semibold text-ink-muted last:border-r-0"
                key={method}
                type="button"
              >
                {method}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="mt-2 text-[0.6875rem] text-ink-muted">
          Cash, bank, card and JazzCash remain visible for the final split-payment
          workflow. No collection is attempted.
        </p>
        <button
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-45"
          disabled={lines.length === 0}
          onClick={onReview}
          type="button"
        >
          Review &amp; post sale
          <kbd className="font-mono text-[0.6875rem] opacity-75">Ctrl+Enter</kbd>
        </button>
        {lines.length === 0 ? null : (
          <p className="mt-2 text-center text-[0.6875rem] text-warning">
            Review is safe; final posting remains disabled.
          </p>
        )}
      </div>
    </section>
  );
}

function ProfitCard({ authorized }: { readonly authorized: boolean }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">
          Profit preview
        </h2>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
            authorized
              ? "bg-accent-soft text-accent-ink"
              : "bg-line-subtle text-ink-muted"
          }`}
        >
          {authorized ? "Owner view" : "Restricted"}
        </span>
      </header>
      <div className="p-[1.125rem]">
        {authorized ? (
          <>
            {[
              ["Cost basis (COGS)", "—"],
              ["Gross profit", "—"],
              ["Gross margin", "—"],
            ].map(([label, value]) => (
              <div
                className="flex justify-between gap-3 border-b border-line-subtle py-1.5 text-xs last:border-0"
                key={label}
              >
                <span className="text-ink-muted">{label}</span>
                <span className="font-semibold text-ink">{value}</span>
              </div>
            ))}
            <div className="mt-3 rounded-control bg-warning-soft p-3 text-xs text-warning">
              Cost basis and margin are not calculated in the browser. The
              pricing/cost service must provide authorized values.
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Cost basis will use recorded inventory cost.{" "}
              <Link className="font-semibold text-accent" href="/stock">
                See inventory →
              </Link>
            </p>
            <button
              className="mt-2 min-h-8 rounded-control px-2.5 text-xs font-semibold text-ink-muted"
              disabled
              type="button"
            >
              Hide amounts
            </button>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-control bg-surface-subtle p-3 text-xs text-ink-muted">
            <LockIcon className="size-4 shrink-0" />
            <p>
              The sales.view_profit permission is required. Cost and profit data
              were not requested or inferred.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function CustomerDrawer({ onClose }: { readonly onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-labelledby="customer-drawer-title"
        aria-modal="true"
        className="flex h-full w-full max-w-[28.75rem] flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold" id="customer-drawer-title">
            Select customer
          </h2>
          <button
            aria-label="Close customer picker"
            className="ml-auto grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <label>
            <span className="sr-only">Search name or phone</span>
            <input
              className="min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 text-sm text-ink-muted"
              disabled
              placeholder="Search name or phone…"
              type="search"
            />
          </label>
          <button
            className="mt-4 flex w-full items-start gap-3 rounded-control border border-accent bg-accent-soft p-3 text-left"
            onClick={onClose}
            type="button"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-control bg-accent text-xs font-bold text-white">
              WI
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Walk-in</span>
              <span className="block text-xs text-ink-muted">
                Anonymous sale · no account
              </span>
            </span>
            <CheckCircleIcon className="ml-auto size-5 text-accent" />
          </button>
          <div className="mt-4 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
            Customer search is pending because no customer API exists. No names,
            phone numbers, spend, order history or credit values are fabricated.
          </div>
          <button
            className="mt-4 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 text-sm font-semibold text-ink-muted opacity-55"
            disabled
            type="button"
          >
            + Add a new customer
          </button>
        </div>
      </aside>
    </div>
  );
}

function ReviewModal({
  blockers,
  lines,
  onClose,
  onReceipt,
}: {
  readonly blockers: readonly string[];
  readonly lines: readonly PosCartLine[];
  readonly onClose: () => void;
  readonly onReceipt: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="review-modal-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[35rem] flex-col overflow-hidden rounded-card bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold" id="review-modal-title">
            Review &amp; post sale
          </h2>
          <button
            aria-label="Close sale review"
            className="ml-auto grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-2 text-xs text-ink-muted">
            Posting this sale would:
          </p>
          <div className="rounded-control border border-accent/25 bg-accent-soft p-4 text-[0.8125rem] text-accent-ink">
            <ul className="list-disc space-y-1 pl-5">
              {lines.map((line) => (
                <li key={line.productId}>
                  Reduce <strong>{line.name}</strong> available stock by{" "}
                  {line.quantity}
                  {line.trackingType === "serialized"
                    ? " after explicit IMEI selection"
                    : ""}
                  .
                </li>
              ))}
              <li>Use the selected Walk-in customer.</li>
              <li>Record revenue only after authoritative pricing.</li>
              <li>Collect payment only through the server workflow.</li>
              <li>Issue a receipt only after an atomic posted-sale response.</li>
            </ul>
          </div>
          <div className="mt-4 rounded-control border border-negative/25 bg-negative-soft p-4 text-xs text-negative">
            <p className="font-semibold">Posting is blocked</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            This review is a local draft. It has not reserved stock, generated
            an invoice, collected money, or changed the database.
          </p>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            className="min-h-9 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-subtle"
            onClick={onClose}
            type="button"
          >
            Back
          </button>
          <button
            className="min-h-9 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-muted"
            onClick={onReceipt}
            type="button"
          >
            Receipt status
          </button>
          <button
            className="min-h-9 rounded-control bg-positive px-3.5 text-sm font-semibold text-white opacity-45"
            disabled
            type="button"
          >
            Confirm &amp; post
          </button>
        </footer>
      </section>
    </div>
  );
}

function ReceiptModal({
  branchName,
  lines,
  onClose,
}: {
  readonly branchName: string;
  readonly lines: readonly PosCartLine[];
  readonly onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="receipt-modal-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[26.25rem] flex-col overflow-hidden rounded-card bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold" id="receipt-modal-title">
            Receipt ready
          </h2>
          <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-warning">
            Pending
          </span>
          <button
            aria-label="Close receipt status"
            className="ml-auto grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-control border border-dashed border-line bg-surface-subtle px-4 py-4 font-mono text-xs text-ink">
            <p className="text-center text-sm font-bold">MobileShop OS</p>
            <p className="text-center text-ink-muted">{branchName}</p>
            <p className="text-center text-ink-muted">Sales receipt</p>
            <div className="my-2 border-t border-dashed border-line" />
            <div className="flex justify-between gap-3">
              <span>Invoice</span>
              <span>Not issued</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Date</span>
              <span>Not posted</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Customer</span>
              <span>Walk-in</span>
            </div>
            <div className="my-2 border-t border-dashed border-line" />
            {lines.length === 0 ? (
              <p className="text-center text-ink-muted">No posted items</p>
            ) : (
              lines.map((line) => (
                <div className="mb-1 flex justify-between gap-3" key={line.productId}>
                  <span>
                    {line.name} ×{line.quantity}
                  </span>
                  <span>—</span>
                </div>
              ))
            )}
            <div className="my-2 border-t border-dashed border-line" />
            <div className="flex justify-between gap-3 font-bold">
              <span>TOTAL</span>
              <span>Unavailable</span>
            </div>
            <div className="my-2 border-t border-dashed border-line" />
            <p className="text-center text-warning">
              No receipt exists until the server confirms a posted sale.
            </p>
          </div>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            className="min-h-9 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-muted opacity-45"
            disabled
            type="button"
          >
            Print
          </button>
          <button
            className="min-h-9 rounded-control bg-accent px-3.5 text-sm font-semibold text-white opacity-45"
            disabled
            type="button"
          >
            Share on WhatsApp
          </button>
          <button
            className="min-h-9 rounded-control px-3.5 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export function SellWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = posCapabilities(auth.data?.permissions);
  const canReadSources =
    capabilities.canCreateSale &&
    capabilities.canViewCatalog &&
    capabilities.canViewInventory;
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<readonly PosCartLine[]>([]);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [counterNotice, setCounterNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const productParameters = {
    page: 1,
    pageSize: SOURCE_PAGE_SIZE,
    active: true,
    ...(search.length === 0 ? {} : { q: search }),
  } as const;
  const stockParameters = {
    page: 1,
    pageSize: SOURCE_PAGE_SIZE,
  } as const;
  const catalog = useQuery({
    ...catalogProductsQueryOptions(productParameters),
    enabled: canReadSources,
  });
  const stock = useQuery(
    stockBalancesQueryOptions(stockParameters, canReadSources),
  );
  const products = useMemo(
    () => buildPosProducts(catalog.data?.items ?? [], stock.data?.items ?? []),
    [catalog.data?.items, stock.data?.items],
  );
  const sourceReady = catalog.data !== undefined && stock.data !== undefined;
  const flow = posFlowSteps(sourceReady, cart);
  const blockers = checkoutBlockers(
    capabilities,
    POS_SERVICE_AVAILABILITY,
    cart,
  );
  const catalogError =
    catalog.error === null || catalog.data !== undefined
      ? null
      : toApiError(catalog.error);
  const stockError =
    stock.error === null || stock.data !== undefined
      ? null
      : toApiError(stock.error);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        setOverlay("customer");
        return;
      }
      if (event.key === "F4") {
        event.preventDefault();
        setCounterNotice(
          cart.length === 0
            ? "Add items before applying a discount."
            : "Discount entry is waiting for the pricing and margin API.",
        );
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        setCounterNotice("Payment selection is waiting for the collection API.");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (cart.length > 0) setOverlay("review");
        else setCounterNotice("Cart is empty — add a product first.");
        return;
      }
      if (event.key === "Escape") setOverlay(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cart.length]);

  if (auth.data === undefined) return <CounterSkeleton />;

  const missing = [
    capabilities.canCreateSale ? null : "sales.create",
    capabilities.canViewCatalog ? null : "catalog.view",
    capabilities.canViewInventory ? null : "inventory.view",
  ].filter((permission): permission is string => permission !== null);
  if (missing.length > 0) return <PermissionGate missing={missing} />;

  const onSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSearch(searchDraft.trim().slice(0, LIMITS.MAX_SEARCH_TERM_LENGTH));
  };
  const add = (product: PosProduct): void => {
    setCart((current) => addCartProduct(current, product));
    setCounterNotice(
      `${product.name} staged. Stock is not reserved until a real sale workflow posts it.`,
    );
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">
            Sell — Point of Sale
          </h1>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">
            Counter-speed checkout: search or scan, add to cart, take payment,
            print the receipt — all on one screen.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {shortcuts.map(([key, label]) => (
              <span
                className="rounded-full bg-line-subtle px-2.5 py-1 text-[0.6875rem] font-semibold text-ink-subtle"
                key={key}
              >
                <kbd className="font-mono font-bold">{key}</kbd> {label}
              </span>
            ))}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            className="min-h-9 rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink-muted opacity-55"
            disabled
            title="Demand capture API is not implemented"
            type="button"
          >
            Record demand
          </button>
          <button
            className="min-h-9 rounded-control px-3.5 text-sm font-semibold text-ink-muted opacity-55"
            disabled
            title="Held-sale persistence is not implemented"
            type="button"
          >
            Hold sale
          </button>
        </div>
      </div>

      <section className="mb-4 rounded-card border border-info/20 bg-info-soft p-3.5 text-xs text-info">
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Live now: active catalog identity and derived branch stock
            </p>
            <p className="mt-1">
              API pending: prices, customers, discounts, payments, atomic sale
              posting, profit, held sales, demand capture and receipt delivery.
              The counter will not invent those values or mutate stock through a
              non-sales endpoint.
            </p>
          </div>
        </div>
      </section>

      <ol
        aria-label="Point of sale workflow"
        className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7"
      >
        {flow.map((step, index) => (
          <li
            className={`flex items-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold ${
              step.status === "complete"
                ? "border-positive/25 bg-positive-soft text-positive"
                : step.status === "current"
                  ? "border-accent/25 bg-accent-soft text-accent-ink"
                  : step.status === "blocked"
                    ? "border-warning/25 bg-warning-soft text-warning"
                    : "border-line bg-surface text-ink-muted"
            }`}
            key={step.id}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-current text-[0.625rem]">
              {step.status === "complete" ? "✓" : index + 1}
            </span>
            {step.label}
            {step.status === "blocked" ? (
              <LockIcon className="ml-auto size-3.5" />
            ) : null}
          </li>
        ))}
      </ol>

      {counterNotice === null ? null : (
        <div
          className="mb-4 flex items-start gap-2 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs text-warning"
          role="status"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>{counterNotice}</p>
          <button
            aria-label="Dismiss counter notice"
            className="ml-auto grid size-6 shrink-0 place-items-center rounded-control hover:bg-warning/10"
            onClick={() => setCounterNotice(null)}
            type="button"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-[340px_minmax(0,1fr)_344px]">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <header className="flex min-h-[3.25rem] items-center border-b border-line-subtle px-[1.125rem] py-3.5">
            <h2 className="text-[0.9375rem] font-semibold text-ink">Products</h2>
            <span className="ml-auto text-xs text-ink-muted">
              {catalog.data === undefined
                ? "Loading"
                : `${products.length} of ${catalog.data.total} items`}
            </span>
          </header>
          <form className="flex gap-2 p-4 pb-2" onSubmit={onSearch} role="search">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search product, brand or SKU</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                autoComplete="off"
                className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
                maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search product, brand or SKU… (press /)"
                ref={searchRef}
                type="search"
                value={searchDraft}
              />
            </label>
            <button
              className="min-h-10 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
              type="submit"
            >
              Find
            </button>
          </form>
          {catalogError === null ? null : (
            <div className="p-4">
              <ErrorPanel
                error={catalogError}
                label="Catalog"
                retry={() => {
                  void catalog.refetch();
                }}
              />
            </div>
          )}
          {stockError === null ? null : (
            <div className="p-4">
              <ErrorPanel
                error={stockError}
                label="Branch stock"
                retry={() => {
                  void stock.refetch();
                }}
              />
            </div>
          )}
          {catalogError !== null || stockError !== null ? null : !sourceReady ? (
            <div className="space-y-2 px-4 pb-4">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  className="h-[4.5rem] animate-pulse rounded-control bg-line-subtle"
                  key={index}
                />
              ))}
            </div>
          ) : (
            <ProductResults cart={cart} onAdd={add} products={products} />
          )}
          {catalog.data !== undefined && catalog.data.total > catalog.data.items.length ? (
            <p className="border-t border-line-subtle px-4 py-2 text-[0.6875rem] text-warning">
              Showing the first {catalog.data.items.length} matching products.
              Narrow the search before selecting.
            </p>
          ) : null}
          {stock.data !== undefined && stock.data.total > stock.data.items.length ? (
            <p className="border-t border-line-subtle px-4 py-2 text-[0.6875rem] text-warning">
              The stock page is truncated. A missing balance is not treated as
              saleable stock.
            </p>
          ) : null}
        </section>

        <Cart
          lines={cart}
          onClear={() => {
            setCart([]);
            setCounterNotice("Cart cleared. No server data was changed.");
          }}
          onQuantity={(productId, quantity) =>
            setCart((current) => setCartQuantity(current, productId, quantity))
          }
        />

        <aside className="space-y-4 min-[821px]:col-span-2 min-[1201px]:col-span-1">
          <CustomerCard onOpen={() => setOverlay("customer")} />
          <div className="grid grid-cols-1 gap-4 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-1">
            <PaymentCard lines={cart} onReview={() => setOverlay("review")} />
            <ProfitCard authorized={capabilities.canViewProfit} />
          </div>
          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
                <LockIcon className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  Review &amp; complete
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  No sale has been posted, no invoice number consumed and no
                  receipt issued.
                </p>
                <button
                  className="mt-3 min-h-8 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
                  onClick={() => setOverlay("receipt")}
                  type="button"
                >
                  Receipt status
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {overlay === "customer" ? (
        <CustomerDrawer onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "review" ? (
        <ReviewModal
          blockers={blockers}
          lines={cart}
          onClose={() => setOverlay(null)}
          onReceipt={() => setOverlay("receipt")}
        />
      ) : null}
      {overlay === "receipt" ? (
        <ReceiptModal
          branchName={auth.data.branch.name}
          lines={cart}
          onClose={() => setOverlay(null)}
        />
      ) : null}
    </>
  );
}
