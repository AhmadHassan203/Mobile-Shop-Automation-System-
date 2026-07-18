"use client";

import {
  PAGINATION,
  type BulkStockInInput,
  type BulkStockInResult,
  type PosSellableItem,
} from "@mobileshop/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  PhoneCheckIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { ApiError, toApiError } from "@/lib/api/client";
import { bulkStockIn } from "@/lib/api/inventory";
import { getPosLookup } from "@/lib/api/pricing";
import {
  buildQuickStockInInput,
  initialQuickStockInForm,
  quickStockInCapabilities,
  quickStockInInvalidationKeys,
  QuickStockInErrorBanner,
  type FieldErrors,
  type QuickStockInFormState,
  type QuickStockInPaymentTender,
} from "@/components/stock/quick-stock-in-page";
import {
  initialBulkBatch,
  type BulkBatchState,
  type BulkBuildResult,
  type BulkRowFieldErrors,
} from "@/components/stock/bulk-stock-in-page";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  catalogBrandsQueryOptions,
  catalogCategoriesQueryOptions,
} from "@/lib/query/catalog-query";
import { stockLocationsQueryOptions } from "@/lib/query/inventory-query";

const controlClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted";
const labelClass = "block text-xs font-semibold text-ink-subtle";
const sectionClass =
  "rounded-card border border-line bg-surface p-5 shadow-card sm:p-6";
const sectionTitleClass = "text-sm font-bold text-ink";
const toggleBase =
  "min-h-9 flex-1 rounded-control border px-3 text-sm font-semibold transition-colors";

const REFERENCE_PARAMETERS = {
  page: 1,
  pageSize: PAGINATION.MAX_PAGE_SIZE,
  active: true,
} as const;

const MAX_LINES = 100;

// =============================================================================
// State
// =============================================================================

/**
 * One scanned (or manually added) stock line. An `existing` line reuses a
 * resolved product variant; a `new` line captures the minimum details to create
 * a quantity-tracked product with the scanned code as its SKU. Either way the
 * line is mapped to a full Quick Stock In form and posted through the shared
 * bulk endpoint — no stock rule lives here, and no IMEI is ever required.
 */
export interface BarcodeLine {
  readonly key: string;
  readonly mode: "existing" | "new";
  readonly productVariantId: string;
  readonly displayName: string;
  readonly productName: string;
  readonly brandId: string;
  readonly categoryId: string;
  readonly barcode: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly sellingPrice: string;
}

/** A bare minor→major string for prefilling a price input (informational). */
export function minorToInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function existingLine(
  key: string,
  item: {
    readonly productVariantId: string;
    readonly name: string;
    readonly barcode: string;
    readonly unitPriceMinor: number;
  },
): BarcodeLine {
  return {
    key,
    mode: "existing",
    productVariantId: item.productVariantId,
    displayName: item.name,
    productName: item.name,
    brandId: "",
    categoryId: "",
    barcode: item.barcode,
    quantity: "1",
    unitCost: "",
    sellingPrice: item.unitPriceMinor > 0 ? minorToInput(item.unitPriceMinor) : "",
  };
}

export function newLine(key: string, barcode: string): BarcodeLine {
  return {
    key,
    mode: "new",
    productVariantId: "",
    displayName: barcode.length > 0 ? `New · ${barcode}` : "New product",
    productName: "",
    brandId: "",
    categoryId: "",
    barcode,
    quantity: "1",
    unitCost: "",
    sellingPrice: "",
  };
}

/**
 * Resolve a scanned code against the POS lookup results. The lookup already
 * searched SKU, name and the barcode table, so an exact SKU match is preferred
 * and any first quantity-tracked candidate is otherwise accepted. Serialized
 * results are ignored — this flow is quantity-only.
 */
export function matchScannedItem(
  items: readonly PosSellableItem[],
  code: string,
): PosSellableItem | undefined {
  const quantityItems = items.filter((item) => item.trackingType === "quantity");
  const exact = quantityItems.find(
    (item) => item.sku.toLowerCase() === code.toLowerCase(),
  );
  return exact ?? quantityItems[0];
}

// =============================================================================
// Pure builders (unit-tested directly)
// =============================================================================

export function barcodeLineToForm(
  line: BarcodeLine,
  batch: BulkBatchState,
): QuickStockInFormState {
  const base: QuickStockInFormState = {
    ...initialQuickStockInForm(),
    supplierMode: "new",
    supplierName: batch.supplierName,
    supplierPhone: batch.supplierPhone,
    stockLocationId: batch.stockLocationId,
    quantity: line.quantity,
    unitCost: line.unitCost,
    sellingPrice: line.sellingPrice,
    paymentStatus: batch.paymentStatus,
    paymentTender: batch.paymentTender,
  };
  if (line.mode === "existing") {
    return {
      ...base,
      productMode: "existing",
      productVariantId: line.productVariantId,
    };
  }
  return {
    ...base,
    productMode: "new",
    productName: line.productName,
    variantName: line.productName,
    brandId: line.brandId,
    categoryId: line.categoryId,
    sku: line.barcode,
  };
}

function lineLabel(line: BarcodeLine): string {
  return line.mode === "existing"
    ? line.displayName
    : line.productName.trim() || line.barcode.trim() || "New product";
}

/**
 * Assemble the strict batch from scanned lines. Reuses the shared Quick Stock In
 * builder per line, so every per-field message is preserved and keyed to its
 * line. Batch-level gaps (no location, no supplier) are reported once.
 */
export function buildBarcodeBatch(
  lines: readonly BarcodeLine[],
  batch: BulkBatchState,
): BulkBuildResult {
  if (lines.length === 0) {
    return { ok: false, rowErrors: [], formError: "Scan or add at least one item." };
  }
  if (batch.stockLocationId.trim() === "") {
    return {
      ok: false,
      rowErrors: [],
      formError: "Choose the stock location that receives these items.",
    };
  }
  if (batch.supplierName.trim() === "") {
    return {
      ok: false,
      rowErrors: [],
      formError: "Enter the supplier these items were bought from.",
    };
  }

  const rowErrors: BulkRowFieldErrors[] = [];
  const values: BulkStockInInput["rows"] = [];
  const labels: string[] = [];
  lines.forEach((line, index) => {
    const built = buildQuickStockInInput(barcodeLineToForm(line, batch));
    if (built.ok) {
      values.push(built.value);
      labels.push(lineLabel(line));
    } else {
      rowErrors.push({ index, errors: built.errors });
    }
  });

  if (rowErrors.length > 0) return { ok: false, rowErrors };
  return { ok: true, value: { rows: values }, labels };
}

// =============================================================================
// Presentational
// =============================================================================

export function BarcodeStockInRouteFallback(): JSX.Element {
  return (
    <div aria-label="Loading Barcode Stock In" className="space-y-4" role="status">
      <span className="sr-only">Loading Barcode Stock In</span>
      <div className="h-32 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-56 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

function Header(): JSX.Element {
  return (
    <header className={sectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
            <PhoneCheckIcon className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">
              Inventory · Barcode Stock In
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
              Barcode Stock In
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Scan to add stock fast. A known barcode selects the product and
              bumps its quantity; an unknown one opens a quick new-product line.
              A hardware scanner types like a keyboard — no camera needed.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1.5 text-xs font-bold text-positive">
          <ShieldCheckIcon className="size-4" /> API-backed · permission scoped
        </span>
      </div>
    </header>
  );
}

function ResultView({
  result,
  labels,
  onReset,
}: {
  readonly result: BulkStockInResult;
  readonly labels: readonly string[];
  readonly onReset: () => void;
}): JSX.Element {
  const allOk = result.failedCount === 0;
  return (
    <div className="space-y-5">
      <Header />
      <section className={sectionClass}>
        <div className="flex items-start gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-card ${
              allOk
                ? "bg-positive-soft text-positive"
                : "bg-warning-soft text-warning"
            }`}
          >
            {allOk ? (
              <CheckCircleIcon className="size-5" />
            ) : (
              <AlertTriangleIcon className="size-5" />
            )}
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">
              {allOk
                ? `All ${result.okCount} items received`
                : `${result.okCount} received · ${result.failedCount} failed`}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Received items are committed. Failed lines changed nothing.
            </p>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {result.rows.map((row) => {
            const label = labels[row.index] ?? `Line ${row.index + 1}`;
            return row.status === "ok" ? (
              <li
                className="flex items-center justify-between gap-4 py-2.5 text-sm"
                key={row.index}
              >
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <CheckCircleIcon className="size-4 shrink-0 text-positive" />
                  {label}
                </span>
                <span className="text-right text-ink-muted">
                  +{row.result.quantityAdded} · on hand{" "}
                  {row.result.currentStockOnHand}
                </span>
              </li>
            ) : (
              <li
                className="flex items-start justify-between gap-4 py-2.5 text-sm"
                key={row.index}
              >
                <span className="flex items-start gap-2 font-semibold text-ink">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-negative" />
                  {label}
                </span>
                <span className="text-right text-negative">
                  {row.error.message}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-6 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={onReset}
            type="button"
          >
            Scan a new batch
          </button>
          <Link
            className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
            href="/stock"
          >
            View stock inventory
          </Link>
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// Workspace
// =============================================================================

function BarcodeStockInWorkspace(): JSX.Element {
  const queryClient = useQueryClient();
  const keySeq = useRef(0);
  const nextKey = (): string => {
    keySeq.current += 1;
    return `line-${keySeq.current}`;
  };

  const [lines, setLines] = useState<readonly BarcodeLine[]>([]);
  const [batch, setBatch] = useState<BulkBatchState>(initialBulkBatch);
  const [scan, setScan] = useState("");
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<number, FieldErrors>>(
    new Map(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<BulkStockInResult | null>(null);
  const [resultLabels, setResultLabels] = useState<readonly string[]>([]);
  const idempotencyKeyRef = useRef<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const categories = useQuery(
    catalogCategoriesQueryOptions(REFERENCE_PARAMETERS, true),
  );
  const brands = useQuery(catalogBrandsQueryOptions(REFERENCE_PARAMETERS, true));
  const locations = useQuery(
    stockLocationsQueryOptions(REFERENCE_PARAMETERS, true),
  );
  const categoryItems = useMemo(
    () => categories.data?.items ?? [],
    [categories.data],
  );
  const brandItems = useMemo(() => brands.data?.items ?? [], [brands.data]);
  const locationItems = locations.data?.items ?? [];

  const dirtied = (): void => {
    idempotencyKeyRef.current = null;
  };

  const focusScan = (): void => {
    scanInputRef.current?.focus();
  };

  const incrementQuantity = (predicate: (line: BarcodeLine) => boolean): boolean => {
    let found = false;
    setLines((previous) =>
      previous.map((line) => {
        if (found || !predicate(line)) return line;
        found = true;
        const next = Number(line.quantity);
        const bumped = Number.isFinite(next) ? next + 1 : 1;
        return { ...line, quantity: String(bumped) };
      }),
    );
    return found;
  };

  const resolveScan = async (raw: string): Promise<void> => {
    const code = raw.trim();
    if (code === "" || resolving) return;
    dirtied();
    setScan("");
    setScanNotice(null);

    // A code we already have as a new-product line just bumps its quantity —
    // never a second line, so a duplicate barcode is merged, not duplicated.
    if (
      incrementQuantity(
        (line) => line.mode === "new" && line.barcode === code,
      )
    ) {
      setScanNotice(`+1 · ${code}`);
      focusScan();
      return;
    }

    setResolving(true);
    try {
      const page = await getPosLookup({
        q: code,
        trackingType: "quantity",
        page: 1,
        pageSize: 5,
      });
      const match = matchScannedItem(page.items, code);
      if (match !== undefined) {
        // Known product: bump an existing line for that variant, or add one.
        const bumped = incrementQuantity(
          (line) =>
            line.mode === "existing" &&
            line.productVariantId === match.productVariantId,
        );
        if (!bumped) {
          setLines((previous) =>
            previous.length >= MAX_LINES
              ? previous
              : [
                  ...previous,
                  existingLine(nextKey(), {
                    productVariantId: match.productVariantId,
                    name: match.name,
                    barcode: code,
                    unitPriceMinor: match.effectivePrice.unitPriceMinor,
                  }),
                ],
          );
        }
        setScanNotice(`${match.name} added`);
      } else {
        setLines((previous) =>
          previous.length >= MAX_LINES
            ? previous
            : [...previous, newLine(nextKey(), code)],
        );
        setScanNotice(`New product — complete its details (${code})`);
      }
    } catch (error) {
      setRequestError(error instanceof ApiError ? error : toApiError(error));
    } finally {
      setResolving(false);
      focusScan();
    }
  };

  const onScanKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      void resolveScan(scan);
    }
  };

  const updateLine = <K extends keyof BarcodeLine>(
    index: number,
    key: K,
    value: BarcodeLine[K],
  ): void => {
    dirtied();
    setLines((previous) =>
      previous.map((line, i) => (i === index ? { ...line, [key]: value } : line)),
    );
  };

  const removeLine = (index: number): void => {
    dirtied();
    setLines((previous) => previous.filter((_, i) => i !== index));
    setRowErrors(new Map());
  };

  const updateBatch = <K extends keyof BulkBatchState>(
    key: K,
    value: BulkBatchState[K],
  ): void => {
    dirtied();
    setBatch((previous) => ({ ...previous, [key]: value }));
  };

  const mutation = useMutation({
    mutationFn: (payload: { value: BulkStockInInput; key: string }) =>
      bulkStockIn(payload.value, payload.key),
    onSuccess: (data) => {
      setResult(data);
      idempotencyKeyRef.current = null;
      for (const key of quickStockInInvalidationKeys()) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => {
      setRequestError(error instanceof ApiError ? error : toApiError(error));
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setRowErrors(new Map());
    setFormError(null);
    setRequestError(null);
    if (mutation.isPending) return;
    const built = buildBarcodeBatch(lines, batch);
    if (!built.ok) {
      setRowErrors(new Map(built.rowErrors.map((e) => [e.index, e.errors])));
      setFormError(built.formError ?? null);
      return;
    }
    const key = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = key;
    setResultLabels(built.labels);
    mutation.mutate({ value: built.value, key });
  };

  const reset = (): void => {
    keySeq.current = 0;
    setLines([]);
    setBatch(initialBulkBatch());
    setScan("");
    setScanNotice(null);
    setRowErrors(new Map());
    setFormError(null);
    setRequestError(null);
    setResult(null);
    setResultLabels([]);
    idempotencyKeyRef.current = null;
    mutation.reset();
  };

  if (result !== null) {
    return <ResultView labels={resultLabels} onReset={reset} result={result} />;
  }

  const totalUnits = lines.reduce((sum, line) => {
    const q = Number(line.quantity);
    return sum + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);

  return (
    <form className="space-y-5" onSubmit={submit}>
      <Header />

      {requestError === null ? null : (
        <QuickStockInErrorBanner error={requestError} />
      )}
      {formError === null ? null : (
        <div
          className="flex items-start gap-2 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
          role="alert"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}

      {/* Scan box ----------------------------------------------------------- */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Scan barcode</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            aria-label="Scan or type a barcode"
            autoFocus
            className={`${controlClass} max-w-md font-mono text-base`}
            disabled={resolving}
            onChange={(event) => setScan(event.target.value)}
            onKeyDown={onScanKeyDown}
            placeholder="Scan a barcode, then Enter"
            ref={scanInputRef}
            value={scan}
          />
          <button
            className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:opacity-50"
            disabled={resolving || scan.trim() === ""}
            onClick={() => void resolveScan(scan)}
            type="button"
          >
            {resolving ? "Resolving…" : "Add"}
          </button>
          {scanNotice === null ? null : (
            <span className="text-sm text-ink-muted">{scanNotice}</span>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          The field stays focused for rapid scanning. Scanning the same code
          again increases its quantity.
        </p>
      </section>

      {/* Batch settings ----------------------------------------------------- */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Batch settings</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            Stock location
            <select
              className={controlClass}
              onChange={(event) => updateBatch("stockLocationId", event.target.value)}
              value={batch.stockLocationId}
            >
              <option value="">Select location…</option>
              {locationItems.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Supplier name
            <input
              className={controlClass}
              onChange={(event) => updateBatch("supplierName", event.target.value)}
              placeholder="e.g. Ali Traders"
              value={batch.supplierName}
            />
          </label>
          <label className={labelClass}>
            Supplier phone
            <input
              className={controlClass}
              inputMode="tel"
              onChange={(event) => updateBatch("supplierPhone", event.target.value)}
              placeholder="Optional"
              value={batch.supplierPhone}
            />
          </label>
          <div>
            <span className={labelClass}>Payment</span>
            <div className="mt-1.5 flex gap-2" role="group" aria-label="Payment">
              <button
                aria-pressed={batch.paymentStatus === "paid_full"}
                className={`${toggleBase} ${
                  batch.paymentStatus === "paid_full"
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
                }`}
                onClick={() => updateBatch("paymentStatus", "paid_full")}
                type="button"
              >
                Paid
              </button>
              <button
                aria-pressed={batch.paymentStatus === "credit"}
                className={`${toggleBase} ${
                  batch.paymentStatus === "credit"
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
                }`}
                onClick={() => updateBatch("paymentStatus", "credit")}
                type="button"
              >
                Credit
              </button>
            </div>
          </div>
        </div>
        {batch.paymentStatus === "paid_full" ? (
          <label className={`${labelClass} mt-4 block max-w-xs`}>
            Paid via
            <select
              className={controlClass}
              onChange={(event) =>
                updateBatch(
                  "paymentTender",
                  event.target.value as QuickStockInPaymentTender,
                )
              }
              value={batch.paymentTender}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">EasyPaisa</option>
            </select>
          </label>
        ) : null}
      </section>

      {/* Lines -------------------------------------------------------------- */}
      <section className={sectionClass}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={sectionTitleClass}>Scanned items</h2>
          <span className="text-xs text-ink-muted">
            {lines.length} lines · {totalUnits} units
          </span>
        </div>
        {lines.length === 0 ? (
          <p className="mt-4 rounded-control border border-dashed border-line bg-surface-subtle p-6 text-center text-sm text-ink-muted">
            No items yet. Scan a barcode above to begin.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {lines.map((line, index) => {
              const errors = rowErrors.get(index);
              const errorList = errors === undefined ? [] : Object.values(errors).flat();
              return (
                <li
                  className="rounded-control border border-line bg-surface-subtle/40 p-3"
                  key={line.key}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {line.mode === "existing"
                          ? line.displayName
                          : "New product"}
                        {line.barcode.length > 0 ? (
                          <span className="ml-2 font-mono text-xs text-ink-muted">
                            {line.barcode}
                          </span>
                        ) : null}
                      </p>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs ${
                          line.mode === "existing"
                            ? "bg-positive-soft text-positive"
                            : "bg-accent-soft text-accent"
                        }`}
                      >
                        {line.mode === "existing" ? "existing" : "new product"}
                      </span>
                    </div>
                    <button
                      aria-label={`Remove line ${index + 1}`}
                      className="rounded-control border border-line px-2 py-1 text-xs font-semibold text-negative hover:bg-negative-soft"
                      onClick={() => removeLine(index)}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>

                  {line.mode === "new" ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <label className={labelClass}>
                        Product name
                        <input
                          aria-label={`Product name line ${index + 1}`}
                          className={controlClass}
                          onChange={(event) =>
                            updateLine(index, "productName", event.target.value)
                          }
                          value={line.productName}
                        />
                      </label>
                      <label className={labelClass}>
                        Brand
                        <select
                          aria-label={`Brand line ${index + 1}`}
                          className={controlClass}
                          onChange={(event) =>
                            updateLine(index, "brandId", event.target.value)
                          }
                          value={line.brandId}
                        >
                          <option value="">Brand…</option>
                          {brandItems.map((brand) => (
                            <option key={brand.id} value={brand.id}>
                              {brand.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelClass}>
                        Category
                        <select
                          aria-label={`Category line ${index + 1}`}
                          className={controlClass}
                          onChange={(event) =>
                            updateLine(index, "categoryId", event.target.value)
                          }
                          value={line.categoryId}
                        >
                          <option value="">Category…</option>
                          {categoryItems.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <label className={labelClass}>
                      Quantity
                      <input
                        aria-label={`Quantity line ${index + 1}`}
                        className={controlClass}
                        inputMode="numeric"
                        onChange={(event) =>
                          updateLine(index, "quantity", event.target.value)
                        }
                        value={line.quantity}
                      />
                    </label>
                    <label className={labelClass}>
                      Purchase price
                      <input
                        aria-label={`Purchase price line ${index + 1}`}
                        className={controlClass}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(index, "unitCost", event.target.value)
                        }
                        placeholder="0.00"
                        value={line.unitCost}
                      />
                    </label>
                    <label className={labelClass}>
                      Selling price
                      <input
                        aria-label={`Selling price line ${index + 1}`}
                        className={controlClass}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(index, "sellingPrice", event.target.value)
                        }
                        placeholder="0.00"
                        value={line.sellingPrice}
                      />
                    </label>
                  </div>

                  {errorList.length === 0 ? null : (
                    <p className="mt-2 text-xs text-negative">
                      {errorList.join(" ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {lines.length} lines ·{" "}
          <span className="font-mono font-semibold text-ink">
            {totalUnits}
          </span>{" "}
          units
        </p>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-6 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
          disabled={mutation.isPending || lines.length === 0}
          type="submit"
        >
          {mutation.isPending ? "Saving…" : `Save & add stock (${lines.length})`}
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Page
// =============================================================================

export function BarcodeStockInPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  if (auth.data === undefined && auth.isPending) {
    return <BarcodeStockInRouteFallback />;
  }
  const capabilities = quickStockInCapabilities(auth.data?.permissions);
  if (!capabilities.canReceive) {
    return (
      <CatalogForbiddenState
        description="Barcode Stock In requires the server-provided purchases.receive permission. No stock request was sent."
        title="Receiving access required"
      />
    );
  }
  return <BarcodeStockInWorkspace />;
}
