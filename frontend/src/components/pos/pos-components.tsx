"use client";

import {
  formatMoney,
  toMinor,
  type CustomerSummary,
  type PosSellableItem,
  type ProductSummary,
  type SaleReceipt,
  type SaleReview,
} from "@mobileshop/shared";
import Link from "next/link";
import { useState, type ReactNode, type RefObject } from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  CheckCircleIcon,
  CloseIcon,
  LockIcon,
  RefreshIcon,
  SearchIcon,
} from "@/components/ui/icons";
import type { ApiError } from "@/lib/api/client";
import {
  POS_PAYMENT_OPTIONS,
  cartUnitCount,
  posAvailableCount,
  type PosCartLine,
} from "./pos-state";

export function formatPosMoney(valueMinor: number, currency = "PKR"): string {
  return formatMoney(toMinor(valueMinor, "POS value"), currency);
}

export function PosError({
  error,
  title,
  retry,
}: {
  readonly error: ApiError;
  readonly title: string;
  readonly retry: () => void;
}) {
  const description =
    error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT"
      ? "The server could not be reached. No counter values were inferred."
      : error.code === "INVALID_RESPONSE"
        ? "The response failed its strict contract and was not displayed."
        : error.status === 403
          ? "Your current permissions do not allow this operation."
          : error.message;
  return (
    <div
      className="rounded-control border border-negative/25 bg-negative-soft p-4 text-sm text-negative"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-xs leading-5">{description}</p>
          {error.requestId === undefined ? null : (
            <p className="mt-1 font-mono text-[0.6875rem]">
              Ref: {error.requestId}
            </p>
          )}
          <button
            className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-control border border-negative/30 bg-surface px-3 text-xs font-bold"
            onClick={retry}
            type="button"
          >
            <RefreshIcon className="size-3.5" /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}

function identifierLabel(
  identifiers: readonly { readonly type: string; readonly value: string }[],
): string {
  return identifiers
    .map((identifier) => `${identifier.type.toUpperCase()} ${identifier.value}`)
    .join(" · ");
}

export function ProductResults({
  items,
  unpricedItems,
  selectedChoices,
  onChoice,
  onAdd,
  canRecordDemand,
  canManagePricing,
  pricingAvailable,
}: {
  readonly items: readonly PosSellableItem[];
  readonly unpricedItems: readonly ProductSummary[];
  readonly selectedChoices: Readonly<Record<string, string>>;
  readonly onChoice: (productVariantId: string, choiceId: string) => void;
  readonly onAdd: (item: PosSellableItem, choiceId: string) => void;
  readonly canRecordDemand: boolean;
  readonly canManagePricing: boolean;
  readonly pricingAvailable: boolean;
}) {
  if (items.length === 0 && unpricedItems.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-ink-muted">
        <SearchIcon className="mx-auto size-9 opacity-45" />
        <h3 className="mt-3 text-sm font-bold text-ink">No match</h3>
        <p className="mt-1 text-xs">Try another product, brand, SKU or IMEI.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[36rem] space-y-2 overflow-y-auto px-4 pb-4">
      {items.map((item) => {
        const available = posAvailableCount(item);
        const out = item.stock.availability === "out_of_stock";
        const choices =
          item.stock.availability === "out_of_stock"
            ? []
            : item.trackingType === "quantity"
              ? item.stock.locationChoices.map((choice) => ({
                  id: choice.location.id,
                  label: `${choice.location.name} · ${choice.availableQuantity} available`,
                }))
              : item.stock.serializedUnitChoices.map((choice) => ({
                  id: choice.serializedUnitId,
                  label: `${identifierLabel(choice.identifiers)} · ${choice.location.name}`,
                }));
        const selected =
          selectedChoices[item.productVariantId] ?? choices[0]?.id ?? "";
        return (
          <article
            className={`rounded-[0.625rem] border p-3 shadow-sm ${
              out
                ? "border-negative/20 bg-negative-soft/45"
                : "border-line bg-surface hover:border-accent"
            }`}
            key={item.productVariantId}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-control border border-line bg-surface text-ink-muted">
                <BoxIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[0.8125rem] font-bold text-ink">
                  {item.brandName} {item.modelName} · {item.name}
                </h3>
                <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-ink-muted">
                  {item.sku} · {item.categoryName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-ink">
                  {formatPosMoney(
                    item.effectivePrice.unitPriceMinor,
                    item.effectivePrice.currency,
                  )}
                </p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${
                    out
                      ? "bg-negative-soft text-negative"
                      : available <= 2
                        ? "bg-warning-soft text-warning"
                        : "bg-positive-soft text-positive"
                  }`}
                >
                  {out
                    ? "Out"
                    : available <= 2
                      ? `Low · ${available}`
                      : `In stock · ${available}`}
                </span>
              </div>
            </div>
            {out ? (
              canRecordDemand ? (
                <Link
                  className="mt-2 inline-flex text-xs font-bold text-negative"
                  href={`/demand?productVariantId=${encodeURIComponent(item.productVariantId)}`}
                >
                  Out of stock — record demand →
                </Link>
              ) : (
                <p className="mt-2 text-xs text-negative">
                  Out of stock · demand permission not granted
                </p>
              )
            ) : (
              <div className="mt-2.5 flex items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-[0.6875rem] font-bold text-ink-muted">
                    {item.trackingType === "serialized"
                      ? "Choose real IMEI / unit"
                      : "Choose stock location"}
                  </span>
                  <select
                    aria-label={`Choose ${item.sku} ${item.trackingType === "serialized" ? "unit" : "location"}`}
                    className="min-h-9 w-full rounded-control border border-line bg-surface px-2 text-xs text-ink"
                    onChange={(event) =>
                      onChoice(item.productVariantId, event.target.value)
                    }
                    value={selected}
                  >
                    {choices.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="min-h-9 shrink-0 rounded-control bg-accent px-3 text-xs font-bold text-white hover:bg-accent-strong"
                  onClick={() => onAdd(item, selected)}
                  type="button"
                >
                  Add
                </button>
              </div>
            )}
          </article>
        );
      })}
      {unpricedItems.map((item) => (
        <article
          className="rounded-[0.625rem] border border-warning/25 bg-warning-soft/35 p-3 shadow-sm"
          key={item.id}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-control border border-line bg-surface text-ink-muted">
              <BoxIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[0.8125rem] font-bold text-ink">
                {item.productModel.brand.name} {item.productModel.name} ·{" "}
                {item.name}
              </h3>
              <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-ink-muted">
                {item.sku} · {item.productModel.category.name}
              </p>
              <p className="mt-2 text-xs font-bold text-warning">
                {pricingAvailable
                  ? "Price not configured — unavailable for sale"
                  : "Price could not be verified — unavailable for sale"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-ink-muted">
                No selling price
              </p>
              <Link
                className="mt-2 inline-flex text-[0.6875rem] font-bold text-accent"
                href={`/inventory?tab=products&q=${encodeURIComponent(item.sku)}`}
              >
                {canManagePricing
                  ? "Open catalog / pricing →"
                  : "View in catalog →"}
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function CartPanel({
  lines,
  discountText,
  discountReason,
  canDiscount,
  discountRef,
  onDiscountText,
  onDiscountReason,
  onQuantity,
  onClear,
}: {
  readonly lines: readonly PosCartLine[];
  readonly discountText: string;
  readonly discountReason: string;
  readonly canDiscount: boolean;
  readonly discountRef: RefObject<HTMLInputElement | null>;
  readonly onDiscountText: (value: string) => void;
  readonly onDiscountReason: (value: string) => void;
  readonly onQuantity: (key: string, quantity: number) => void;
  readonly onClear: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex min-h-[3.25rem] items-center gap-3 border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-bold text-ink">Cart</h2>
        <span className="ml-auto text-xs text-ink-muted">
          {lines.length === 0 ? "Empty" : `${cartUnitCount(lines)} items`}
        </span>
        {lines.length === 0 ? null : (
          <button
            className="text-xs font-bold text-ink-muted"
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
        )}
      </header>
      <div className="p-[1.125rem]">
        {lines.length === 0 ? (
          <div className="px-4 py-12 text-center text-ink-muted">
            <BoxIcon className="mx-auto size-10 opacity-45" />
            <h3 className="mt-3 font-bold text-ink">Cart is empty</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5">
              Select an exact location or real IMEI from the priced products.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-line-subtle">
              {lines.map((line) => (
                <div className="flex items-center gap-3 py-3" key={line.key}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-bold text-ink">
                      {line.brandName} {line.modelName} · {line.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-ink-muted">
                      {line.sku} · {line.location.name}
                    </p>
                    {line.trackingType === "serialized" ? (
                      <p className="mt-1 truncate font-mono text-[0.6875rem] text-info">
                        {identifierLabel(line.identifiers)}
                      </p>
                    ) : null}
                  </div>
                  {line.trackingType === "quantity" ? (
                    <div className="flex shrink-0 items-center overflow-hidden rounded-control border border-line">
                      <button
                        aria-label={`Decrease ${line.name}`}
                        className="grid size-7 place-items-center hover:bg-surface-subtle"
                        onClick={() => onQuantity(line.key, line.quantity - 1)}
                        type="button"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-xs font-bold">
                        {line.quantity}
                      </span>
                      <button
                        aria-label={`Increase ${line.name}`}
                        className="grid size-7 place-items-center hover:bg-surface-subtle disabled:opacity-40"
                        disabled={line.quantity >= line.availableSnapshot}
                        onClick={() => onQuantity(line.key, line.quantity + 1)}
                        type="button"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-ink-muted">1</span>
                  )}
                  <div className="w-24 shrink-0 text-right">
                    <p className="text-xs font-bold text-ink">
                      {formatPosMoney(
                        line.unitPriceMinor * line.quantity,
                        line.currency,
                      )}
                    </p>
                    <p className="text-[0.625rem] text-ink-muted">
                      {formatPosMoney(line.unitPriceMinor, line.currency)} each
                    </p>
                  </div>
                  <button
                    aria-label={`Remove ${line.name}`}
                    className="grid size-7 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-negative-soft hover:text-negative"
                    onClick={() => onQuantity(line.key, 0)}
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
                  <span className="mb-1 block text-xs font-bold text-ink-subtle">
                    Discount (Rs){" "}
                    <kbd className="font-mono text-[0.6875rem]">F4</kbd>
                  </span>
                  <input
                    className="min-h-10 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:bg-surface-subtle"
                    disabled={!canDiscount}
                    inputMode="decimal"
                    onChange={(event) => onDiscountText(event.target.value)}
                    placeholder="0.00"
                    ref={discountRef}
                    value={discountText}
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-bold text-ink-subtle">
                    Reason{" "}
                    {discountText.trim() === "" || discountText === "0"
                      ? "(optional)"
                      : "(required)"}
                  </span>
                  <input
                    className="min-h-10 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:bg-surface-subtle"
                    disabled={!canDiscount}
                    onChange={(event) => onDiscountReason(event.target.value)}
                    placeholder="Loyal customer, display piece, price match"
                    value={discountReason}
                  />
                </label>
              </div>
              {!canDiscount ? (
                <p className="mt-2 text-xs text-warning">
                  Discount permission is not granted.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export interface PaymentEditorValue {
  readonly amount: string;
  readonly reference: string;
}

export function PaymentPanel({
  totals,
  currency,
  values,
  paymentRef,
  onChange,
  onFillCash,
  editorDisabled,
  reviewDisabled,
  onReview,
}: {
  readonly totals: {
    readonly subtotalMinor: number;
    readonly discountMinor: number;
    readonly totalMinor: number;
  } | null;
  readonly currency: string;
  readonly values: Readonly<Record<string, PaymentEditorValue>>;
  readonly paymentRef: RefObject<HTMLInputElement | null>;
  readonly onChange: (method: string, value: PaymentEditorValue) => void;
  readonly onFillCash: () => void;
  readonly editorDisabled: boolean;
  readonly reviewDisabled: boolean;
  readonly onReview: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-bold text-ink">Payment</h2>
        <span className="ml-auto text-xs text-ink-muted">Split supported</span>
      </header>
      <div className="p-[1.125rem]">
        {[
          ["Subtotal", totals?.subtotalMinor ?? 0],
          ["Discount", -(totals?.discountMinor ?? 0)],
          ["Grand total", totals?.totalMinor ?? 0],
        ].map(([label, value], index) => (
          <div className="flex justify-between gap-3 py-1.5" key={label}>
            <span
              className={
                index === 2 ? "text-sm font-bold" : "text-xs text-ink-muted"
              }
            >
              {label}
            </span>
            <span
              className={
                index === 2 ? "text-lg font-bold" : "text-xs font-bold"
              }
            >
              {formatPosMoney(Number(value), currency)}
            </span>
          </div>
        ))}
        <div className="mt-3 border-t border-line-subtle pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-ink-subtle">
              Payment legs <kbd className="font-mono">F8</kbd>
            </p>
            <button
              className="text-[0.6875rem] font-bold text-accent"
              disabled={editorDisabled || totals === null}
              onClick={onFillCash}
              type="button"
            >
              Fill total in cash
            </button>
          </div>
          <div className="space-y-2">
            {POS_PAYMENT_OPTIONS.map((option, index) => {
              const value = values[option.method] ?? {
                amount: "",
                reference: "",
              };
              return (
                <div
                  className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"
                  key={option.method}
                >
                  <label className="contents">
                    <span className="self-center text-xs font-semibold text-ink-muted">
                      {option.label}
                    </span>
                    <input
                      aria-label={`${option.label} amount in rupees`}
                      className="min-h-9 rounded-control border border-line bg-surface px-2 text-sm"
                      disabled={editorDisabled}
                      inputMode="decimal"
                      onChange={(event) =>
                        onChange(option.method, {
                          ...value,
                          amount: event.target.value,
                        })
                      }
                      placeholder="0.00"
                      ref={index === 0 ? paymentRef : undefined}
                      value={value.amount}
                    />
                  </label>
                  {option.needsReference &&
                  value.amount.trim() !== "" &&
                  value.amount !== "0" ? (
                    <input
                      aria-label={`${option.label} reference`}
                      className="col-start-2 min-h-9 rounded-control border border-line bg-surface px-2 text-xs"
                      disabled={editorDisabled}
                      onChange={(event) =>
                        onChange(option.method, {
                          ...value,
                          reference: event.target.value,
                        })
                      }
                      placeholder="Provider / transfer reference"
                      value={value.reference}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        <button
          className="mt-4 min-h-11 w-full rounded-control bg-accent px-4 text-sm font-bold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-45"
          disabled={reviewDisabled}
          onClick={onReview}
          type="button"
        >
          Review &amp; post sale{" "}
          <kbd className="ml-1 font-mono text-[0.6875rem] opacity-75">
            Ctrl+Enter
          </kbd>
        </button>
      </div>
    </section>
  );
}

export function CustomerCard({
  customer,
  onChange,
}: {
  readonly customer: CustomerSummary | null;
  readonly onChange: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-bold text-ink">Customer</h2>
        <button
          className="ml-auto text-xs font-bold text-accent"
          onClick={onChange}
          type="button"
        >
          Change <kbd className="font-mono">F2</kbd>
        </button>
      </header>
      <div className="flex items-center gap-3 p-[1.125rem]">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">
          {customer === null
            ? "WI"
            : customer.name
                .split(/\s+/u)
                .map((word) => word[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">
            {customer?.name ?? "Walk-in"}
          </p>
          <p className="truncate font-mono text-xs text-ink-muted">
            {customer?.phone ?? "No account · anonymous sale"}
          </p>
        </div>
      </div>
    </section>
  );
}

export function ProfitPreview({
  review,
}: {
  readonly review: SaleReview | null;
}) {
  const [amountsHidden, setAmountsHidden] = useState(false);
  const marginWarning = review?.warnings.find(
    (warning) => warning.code === "below_minimum_margin",
  );
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-bold text-ink">Profit preview</h2>
        <span className="ml-auto rounded-full bg-line-subtle px-2 py-1 text-[0.625rem] font-bold text-ink-muted">
          {review?.profit.availability === "available"
            ? "Authorized"
            : "Restricted"}
        </span>
      </header>
      <div className="p-[1.125rem] text-xs">
        {review === null ? (
          <p className="leading-5 text-ink-muted">
            Server-computed cost and margin appear only after Review. The
            browser never calculates COGS.
          </p>
        ) : review.profit.availability === "redacted" ? (
          <div className="flex items-start gap-2 text-info">
            <LockIcon className="mt-0.5 size-4" />
            <p>Cost and profit are redacted for this role.</p>
          </div>
        ) : (
          <>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Cost basis (COGS)</dt>
                <dd
                  className={`font-bold ${amountsHidden ? "blur-sm select-none" : ""}`}
                >
                  {formatPosMoney(review.profit.cogsMinor, review.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Gross profit</dt>
                <dd
                  className={`${review.profit.grossProfitMinor >= 0 ? "font-bold text-positive" : "font-bold text-negative"} ${amountsHidden ? "blur-sm select-none" : ""}`}
                >
                  {formatPosMoney(
                    review.profit.grossProfitMinor,
                    review.currency,
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Gross margin</dt>
                <dd
                  className={`font-bold ${amountsHidden ? "blur-sm select-none" : ""}`}
                >
                  {review.profit.grossMarginBasisPoints === null
                    ? "Unavailable"
                    : `${(review.profit.grossMarginBasisPoints / 100).toFixed(2)}%`}
                </dd>
              </div>
            </dl>
            {marginWarning === undefined ? null : (
              <p className="mt-3 rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative">
                {marginWarning.message}
              </p>
            )}
            <p className="mt-3 text-[0.6875rem] leading-5 text-ink-muted">
              Cost basis uses recorded inventory cost.{" "}
              <Link className="font-bold text-accent" href="/inventory">
                See inventory →
              </Link>
            </p>
            <button
              className="mt-2 min-h-8 rounded-control border border-line px-2.5 text-[0.6875rem] font-bold text-ink-subtle"
              onClick={() => setAmountsHidden((hidden) => !hidden)}
              type="button"
            >
              {amountsHidden ? "Show amounts" : "Hide amounts"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export function Overlay({
  title,
  onClose,
  children,
  footer,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
      role="dialog"
    >
      <section className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-card border border-line bg-surface shadow-overlay">
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">{title}</h2>
          <button
            aria-label="Close"
            className="ml-auto grid size-8 place-items-center rounded-control hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer === undefined ? null : (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
}

export function ReviewContent({ review }: { readonly review: SaleReview }) {
  return (
    <div className="space-y-4">
      <div className="rounded-control border border-line bg-surface-subtle p-3">
        {review.lines.map((line) => (
          <div
            className="flex justify-between gap-3 border-b border-line-subtle py-2 text-xs last:border-0"
            key={line.id}
          >
            <span>
              <strong>{line.product.name}</strong>
              <span className="mt-0.5 block font-mono text-ink-muted">
                {line.product.sku} · {line.quantity} ×{" "}
                {formatPosMoney(line.unitPriceMinor, review.currency)}
              </span>
            </span>
            <strong>
              {formatPosMoney(line.lineTotalMinor, review.currency)}
            </strong>
          </div>
        ))}
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="font-bold">
            {formatPosMoney(review.totals.subtotalMinor, review.currency)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Discount</dt>
          <dd className="font-bold text-negative">
            −{formatPosMoney(review.totals.discountMinor, review.currency)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base">
          <dt className="font-bold">Grand total</dt>
          <dd className="font-bold">
            {formatPosMoney(review.totals.totalMinor, review.currency)}
          </dd>
        </div>
      </dl>
      {review.warnings.length === 0 ? (
        <div className="flex items-start gap-2 rounded-control border border-positive/25 bg-positive-soft p-3 text-xs text-positive">
          <CheckCircleIcon className="size-4" />
          <p>Server review completed without warnings.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {review.warnings.map((warning, index) => (
            <div
              className={`rounded-control border p-3 text-xs ${warning.severity === "blocking" ? "border-negative/25 bg-negative-soft text-negative" : warning.severity === "warning" ? "border-warning/25 bg-warning-soft text-warning" : "border-info/25 bg-info-soft text-info"}`}
              key={`${warning.code}-${index}`}
            >
              <strong>
                {warning.severity === "blocking"
                  ? "Blocking"
                  : warning.severity === "warning"
                    ? "Attention"
                    : "Info"}
              </strong>
              <p className="mt-1">{warning.message}</p>
            </div>
          ))}
        </div>
      )}
      {review.profit.availability === "redacted" ? (
        <p className="flex items-center gap-2 text-xs text-info">
          <LockIcon className="size-4" /> Profit is restricted for this role.
        </p>
      ) : (
        <p className="text-xs text-ink-muted">
          Gross profit:{" "}
          <strong
            className={
              review.profit.grossProfitMinor >= 0
                ? "text-positive"
                : "text-negative"
            }
          >
            {formatPosMoney(review.profit.grossProfitMinor, review.currency)}
          </strong>
        </p>
      )}
    </div>
  );
}

export function ReceiptContent({ receipt }: { readonly receipt: SaleReceipt }) {
  return (
    <div className="mx-auto max-w-md rounded-control border border-dashed border-line bg-surface-subtle p-5 font-mono text-xs leading-5 text-ink">
      <div className="text-center">
        <p className="font-bold">{receipt.shop.organizationName}</p>
        <p>{receipt.shop.branchName}</p>
        {receipt.shop.addressLine === null ? null : (
          <p>{receipt.shop.addressLine}</p>
        )}
        <p className="mt-2 font-bold">{receipt.invoiceNumber}</p>
        <p>{new Date(receipt.issuedAt).toLocaleString("en-PK")}</p>
      </div>
      <div className="my-3 border-t border-dashed border-line" />
      {receipt.lines.map((line) => (
        <div className="mb-2" key={line.id}>
          <div className="flex justify-between gap-3">
            <span>{line.product.name}</span>
            <strong>
              {formatPosMoney(line.lineTotalMinor, receipt.currency)}
            </strong>
          </div>
          <p className="text-ink-muted">
            {line.quantity} ×{" "}
            {formatPosMoney(line.unitPriceMinor, receipt.currency)}
          </p>
          {line.trackingType === "serialized" ? (
            <p>{identifierLabel(line.identifiers)}</p>
          ) : null}
        </div>
      ))}
      <div className="my-3 border-t border-dashed border-line" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>
          {formatPosMoney(receipt.totals.subtotalMinor, receipt.currency)}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Discount</span>
        <span>
          −{formatPosMoney(receipt.totals.discountMinor, receipt.currency)}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-sm font-bold">
        <span>Total</span>
        <span>
          {formatPosMoney(receipt.totals.totalMinor, receipt.currency)}
        </span>
      </div>
      <div className="my-3 border-t border-dashed border-line" />
      {receipt.settlement.payments.map((payment) => (
        <div className="flex justify-between" key={payment.id}>
          <span>{payment.method.replaceAll("_", " ")}</span>
          <span>{formatPosMoney(payment.amountMinor, receipt.currency)}</span>
        </div>
      ))}
      <p className="mt-3 text-center">Cashier: {receipt.cashier.fullName}</p>
      {receipt.footer === null ? null : (
        <p className="mt-2 text-center">{receipt.footer}</p>
      )}
    </div>
  );
}
