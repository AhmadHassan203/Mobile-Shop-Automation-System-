"use client";

import {
  PAGINATION,
  formatMoney,
  type BulkStockInInput,
  type BulkStockInResult,
} from "@mobileshop/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent, type JSX } from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  LayersIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { ApiError, toApiError } from "@/lib/api/client";
import { bulkStockIn } from "@/lib/api/inventory";
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

// A bulk batch is capped by the shared contract; keep the UI in step so a user
// never fills rows the server would reject wholesale.
const MAX_ROWS = 100;

// =============================================================================
// Row + batch state
// =============================================================================

/**
 * One manual entry row. It is a deliberately small, flat subset of a Quick Stock
 * In: product identity + numbers + an optional per-row supplier override. Every
 * row is mapped to a full {@link QuickStockInFormState} and run through the
 * shared, already-tested {@link buildQuickStockInInput}, so this screen owns no
 * stock, pricing or payable rule of its own.
 */
export interface BulkRowState {
  readonly key: string;
  readonly productName: string;
  readonly brandId: string;
  readonly categoryId: string;
  readonly variantName: string;
  readonly barcode: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly sellingPrice: string;
  readonly supplierName: string;
  readonly supplierPhone: string;
}

/**
 * Settings shared by every row in the batch: where the stock lands, how it is
 * paid, and the default supplier used for any row that does not name its own.
 */
export interface BulkBatchState {
  readonly stockLocationId: string;
  readonly paymentStatus: "paid_full" | "credit";
  readonly paymentTender: QuickStockInPaymentTender;
  readonly supplierName: string;
  readonly supplierPhone: string;
}

export function makeBulkRow(key: string): BulkRowState {
  return {
    key,
    productName: "",
    brandId: "",
    categoryId: "",
    variantName: "",
    barcode: "",
    quantity: "1",
    unitCost: "",
    sellingPrice: "",
    supplierName: "",
    supplierPhone: "",
  };
}

export function initialBulkBatch(): BulkBatchState {
  return {
    stockLocationId: "",
    paymentStatus: "paid_full",
    paymentTender: "cash",
    supplierName: "",
    supplierPhone: "",
  };
}

/**
 * A row the user never touched (a spare added/duplicated line). Blank rows are
 * skipped entirely so an untouched line never blocks the batch or posts a ghost
 * receipt. Quantity is ignored here because it carries a sensible default of 1.
 */
export function isBulkRowBlank(row: BulkRowState): boolean {
  return (
    row.productName.trim() === "" &&
    row.variantName.trim() === "" &&
    row.barcode.trim() === "" &&
    row.unitCost.trim() === "" &&
    row.sellingPrice.trim() === "" &&
    row.supplierName.trim() === "" &&
    row.supplierPhone.trim() === ""
  );
}

// =============================================================================
// Pure builders (unit-tested directly, no React)
// =============================================================================

/**
 * Lift one flat bulk row + the batch defaults into the full Quick Stock In form
 * shape. The per-row supplier overrides the batch default when present; product
 * is always the reuse-or-create "new" path (the server reuses a matching
 * quantity variant, or creates one), and no IMEI is ever involved.
 */
export function rowToQuickStockInForm(
  row: BulkRowState,
  batch: BulkBatchState,
): QuickStockInFormState {
  const hasOwnSupplier = row.supplierName.trim().length > 0;
  return {
    ...initialQuickStockInForm(),
    productMode: "new",
    productName: row.productName,
    variantName: row.variantName.trim().length > 0 ? row.variantName : row.productName,
    categoryId: row.categoryId,
    brandId: row.brandId,
    sku: row.barcode,
    supplierMode: "new",
    supplierName: hasOwnSupplier ? row.supplierName : batch.supplierName,
    supplierPhone: hasOwnSupplier ? row.supplierPhone : batch.supplierPhone,
    stockLocationId: batch.stockLocationId,
    quantity: row.quantity,
    unitCost: row.unitCost,
    sellingPrice: row.sellingPrice,
    paymentStatus: batch.paymentStatus,
    paymentTender: batch.paymentTender,
  };
}

export interface BulkRowFieldErrors {
  readonly index: number;
  readonly errors: FieldErrors;
}

export type BulkBuildResult =
  | {
      readonly ok: true;
      readonly value: BulkStockInInput;
      readonly labels: readonly string[];
    }
  | {
      readonly ok: false;
      readonly rowErrors: readonly BulkRowFieldErrors[];
      readonly formError?: string;
    };

/** A short human label for a row, used to caption its server result. */
function rowLabel(row: BulkRowState): string {
  return (
    row.productName.trim() || row.variantName.trim() || row.barcode.trim() || "Row"
  );
}

/**
 * Assemble the strict batch request from raw rows + batch settings. Each
 * non-blank row is validated by the shared Quick Stock In builder, so every
 * per-field message the single-item screen would show also appears here, keyed
 * to its grid row. Batch-level problems (no location, no default supplier) are
 * reported once as a `formError`.
 */
export function buildBulkStockInInput(
  rows: readonly BulkRowState[],
  batch: BulkBatchState,
): BulkBuildResult {
  const active = rows.filter((row) => !isBulkRowBlank(row));
  if (active.length === 0) {
    return { ok: false, rowErrors: [], formError: "Add at least one row to stock in." };
  }
  if (batch.stockLocationId.trim() === "") {
    return {
      ok: false,
      rowErrors: [],
      formError: "Choose the stock location that receives this batch.",
    };
  }
  // A row may omit its supplier, so the batch default must be able to cover it.
  const needsDefaultSupplier = active.some(
    (row) => row.supplierName.trim().length === 0,
  );
  if (needsDefaultSupplier && batch.supplierName.trim() === "") {
    return {
      ok: false,
      rowErrors: [],
      formError:
        "Enter a default supplier, or give every row its own supplier name.",
    };
  }

  const rowErrors: BulkRowFieldErrors[] = [];
  const values: BulkStockInInput["rows"] = [];
  const labels: string[] = [];
  active.forEach((row, index) => {
    const built = buildQuickStockInInput(rowToQuickStockInForm(row, batch));
    if (built.ok) {
      values.push(built.value);
      labels.push(rowLabel(row));
    } else {
      rowErrors.push({ index, errors: built.errors });
    }
  });

  if (rowErrors.length > 0) return { ok: false, rowErrors };
  return { ok: true, value: { rows: values }, labels };
}

/**
 * Best-effort parse of pasted spreadsheet rows. Each line is split on tabs
 * (falling back to commas) and mapped positionally to
 * name, brand, category, variant, barcode, qty, purchase, selling, supplier,
 * phone. Brand/category are matched by name against the loaded lists; an
 * unmatched or missing name is simply left blank for the user to pick — paste
 * never invents an id. Lines that are entirely empty are ignored.
 */
export function parsePastedBulkRows(
  text: string,
  brandsByName: ReadonlyMap<string, string>,
  categoriesByName: ReadonlyMap<string, string>,
  nextKey: (index: number) => string,
): readonly BulkRowState[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map(
      (cell) => cell.trim(),
    );
    const at = (i: number): string => cells[i] ?? "";
    const brandId = brandsByName.get(at(1).toLowerCase()) ?? "";
    const categoryId = categoriesByName.get(at(2).toLowerCase()) ?? "";
    const quantity = at(5).length > 0 ? at(5) : "1";
    return {
      ...makeBulkRow(nextKey(index)),
      productName: at(0),
      brandId,
      categoryId,
      variantName: at(3),
      barcode: at(4),
      quantity,
      unitCost: at(6),
      sellingPrice: at(7),
      supplierName: at(8),
      supplierPhone: at(9),
    };
  });
}

// =============================================================================
// Presentational pieces
// =============================================================================

export function BulkStockInRouteFallback(): JSX.Element {
  return (
    <div aria-label="Loading Bulk Stock In" className="space-y-4" role="status">
      <span className="sr-only">Loading Bulk Stock In</span>
      <div className="h-32 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-64 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

function Header(): JSX.Element {
  return (
    <header className={sectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
            <LayersIcon className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">
              Inventory · Bulk Stock In
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
              Bulk Stock In
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Add many products to stock in one screen. Each row posts the full
              purchase, receipt, stock movement and supplier payable together —
              the same as Quick Stock In, one row at a time.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1.5 text-xs font-bold text-positive">
            <ShieldCheckIcon className="size-4" /> API-backed · permission scoped
          </span>
          <Link
            className="text-xs font-semibold text-accent hover:underline"
            href="/stock/quick-stock-in"
          >
            Single item? Use Quick Stock In →
          </Link>
        </div>
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
                ? `All ${result.okCount} rows received`
                : `${result.okCount} received · ${result.failedCount} failed`}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Received rows are committed. Failed rows changed nothing — fix them
              and start a new batch.
            </p>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-line border-t border-line">
          {result.rows.map((row) => {
            const label = labels[row.index] ?? `Row ${row.index + 1}`;
            if (row.status === "ok") {
              return (
                <li
                  className="flex items-center justify-between gap-4 py-2.5 text-sm"
                  key={row.index}
                >
                  <span className="flex items-center gap-2 text-ink">
                    <CheckCircleIcon className="size-4 shrink-0 text-positive" />
                    <span className="font-semibold">{label}</span>
                    {row.result.product.wasCreated ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                        new product
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right text-ink-muted">
                    +{row.result.quantityAdded} · on hand{" "}
                    {row.result.currentStockOnHand} ·{" "}
                    {row.result.goodsReceiptNumber}
                  </span>
                </li>
              );
            }
            return (
              <li
                className="flex items-start justify-between gap-4 py-2.5 text-sm"
                key={row.index}
              >
                <span className="flex items-start gap-2 text-negative">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="font-semibold text-ink">{label}</span>
                </span>
                <span className="text-right text-negative">
                  {row.error.message}
                  {row.error.field === undefined ? null : (
                    <span className="block font-mono text-xs text-ink-muted">
                      {row.error.field}
                    </span>
                  )}
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
            Start a new batch
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

function BulkStockInWorkspace(): JSX.Element {
  const queryClient = useQueryClient();
  // A monotonic counter for stable React keys. Only ever advanced from event
  // handlers (add / duplicate / paste / reset), never read during render.
  const keySeq = useRef(3);
  const nextRowKey = (): string => {
    keySeq.current += 1;
    return `row-${keySeq.current}`;
  };

  const [rows, setRows] = useState<readonly BulkRowState[]>(() => [
    makeBulkRow("row-1"),
    makeBulkRow("row-2"),
    makeBulkRow("row-3"),
  ]);
  const [batch, setBatch] = useState<BulkBatchState>(initialBulkBatch);
  const [rowErrors, setRowErrors] = useState<
    ReadonlyMap<number, FieldErrors>
  >(new Map());
  const [formError, setFormError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<BulkStockInResult | null>(null);
  const [resultLabels, setResultLabels] = useState<readonly string[]>([]);
  const [pasteText, setPasteText] = useState("");
  // Held across a retry of the SAME attempt; cleared on any edit or success so a
  // genuinely new batch always mints a fresh idempotency key (no double-post).
  const idempotencyKeyRef = useRef<string | null>(null);

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

  const brandsByName = useMemo(
    () =>
      new Map(brandItems.map((brand) => [brand.name.toLowerCase(), brand.id])),
    [brandItems],
  );
  const categoriesByName = useMemo(
    () =>
      new Map(
        categoryItems.map((category) => [
          category.name.toLowerCase(),
          category.id,
        ]),
      ),
    [categoryItems],
  );

  const dirtied = (): void => {
    idempotencyKeyRef.current = null;
  };

  const updateRow = <K extends keyof BulkRowState>(
    index: number,
    key: K,
    value: BulkRowState[K],
  ): void => {
    dirtied();
    setRows((previous) =>
      previous.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  };

  const updateBatch = <K extends keyof BulkBatchState>(
    key: K,
    value: BulkBatchState[K],
  ): void => {
    dirtied();
    setBatch((previous) => ({ ...previous, [key]: value }));
  };

  const addRow = (): void => {
    if (rows.length >= MAX_ROWS) return;
    dirtied();
    setRows((previous) => [...previous, makeBulkRow(nextRowKey())]);
  };

  const duplicateRow = (index: number): void => {
    if (rows.length >= MAX_ROWS) return;
    dirtied();
    setRows((previous) => {
      const source = previous[index];
      if (source === undefined) return previous;
      const copy = { ...source, key: nextRowKey() };
      return [...previous.slice(0, index + 1), copy, ...previous.slice(index + 1)];
    });
  };

  const removeRow = (index: number): void => {
    dirtied();
    setRows((previous) =>
      previous.length <= 1
        ? previous
        : previous.filter((_, i) => i !== index),
    );
    setRowErrors(new Map());
  };

  const applyPaste = (): void => {
    if (pasteText.trim() === "") return;
    dirtied();
    const parsed = parsePastedBulkRows(
      pasteText,
      brandsByName,
      categoriesByName,
      () => nextRowKey(),
    );
    if (parsed.length === 0) return;
    setRows((previous) => {
      const existing = previous.filter((row) => !isBulkRowBlank(row));
      return [...existing, ...parsed].slice(0, MAX_ROWS);
    });
    setPasteText("");
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
    const built = buildBulkStockInInput(rows, batch);
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
    setRows([makeBulkRow(nextRowKey()), makeBulkRow(nextRowKey())]);
    setBatch(initialBulkBatch());
    setRowErrors(new Map());
    setFormError(null);
    setRequestError(null);
    setResult(null);
    setResultLabels([]);
    idempotencyKeyRef.current = null;
    mutation.reset();
  };

  if (result !== null) {
    return (
      <ResultView labels={resultLabels} onReset={reset} result={result} />
    );
  }

  // Index bookkeeping is by the on-screen row order, matching how
  // buildBulkStockInInput keys its per-row errors.
  const activeRows = rows.filter((row) => !isBulkRowBlank(row));
  const batchTotalMinor = activeRows.reduce((total, row) => {
    const qty = Number(row.quantity);
    const unit = Number(row.unitCost);
    if (!Number.isFinite(qty) || !Number.isFinite(unit)) return total;
    return total + Math.round(unit * 100) * qty;
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

      {/* Batch settings ----------------------------------------------------- */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Batch settings</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Applied to every row. A row may still name its own supplier to override
          the default below.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            Stock location
            <select
              className={controlClass}
              onChange={(event) =>
                updateBatch("stockLocationId", event.target.value)
              }
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
            Default supplier name
            <input
              className={controlClass}
              onChange={(event) =>
                updateBatch("supplierName", event.target.value)
              }
              placeholder="e.g. Ali Traders"
              value={batch.supplierName}
            />
          </label>
          <label className={labelClass}>
            Default supplier phone
            <input
              className={controlClass}
              inputMode="tel"
              onChange={(event) =>
                updateBatch("supplierPhone", event.target.value)
              }
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

      {/* Rows --------------------------------------------------------------- */}
      <section className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={sectionTitleClass}>Products</h2>
            <p className="mt-1 text-xs text-ink-muted">
              {activeRows.length} of {rows.length} rows will be stocked in.
            </p>
          </div>
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-accent bg-accent-soft px-3 text-sm font-semibold text-accent hover:bg-accent-soft/70 disabled:opacity-50"
            disabled={rows.length >= MAX_ROWS}
            onClick={addRow}
            type="button"
          >
            + Add row
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-260 border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-ink-subtle">
                <th className="w-8 pb-2 pr-2">#</th>
                <th className="pb-2 pr-2">Product name</th>
                <th className="pb-2 pr-2">Brand</th>
                <th className="pb-2 pr-2">Category</th>
                <th className="pb-2 pr-2">Model / variant</th>
                <th className="pb-2 pr-2">Barcode</th>
                <th className="w-20 pb-2 pr-2">Qty</th>
                <th className="w-28 pb-2 pr-2">Purchase</th>
                <th className="w-28 pb-2 pr-2">Selling</th>
                <th className="pb-2 pr-2">Supplier</th>
                <th className="pb-2 pr-2">Phone</th>
                <th className="w-16 pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const errors = rowErrors.get(index);
                return (
                  <BulkRowInputs
                    brandItems={brandItems}
                    categoryItems={categoryItems}
                    errors={errors}
                    index={index}
                    key={row.key}
                    onDuplicate={() => duplicateRow(index)}
                    onRemove={() => removeRow(index)}
                    onUpdate={(field, value) => updateRow(index, field, value)}
                    removable={rows.length > 1}
                    row={row}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Paste --------------------------------------------------------------- */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Paste rows</h2>
        <p className="mt-1 text-xs text-ink-muted">
          One product per line, columns separated by tabs or commas: name, brand,
          category, model, barcode, qty, purchase, selling, supplier, phone.
          Brand and category are matched by name; unmatched ones are left for you
          to pick.
        </p>
        <textarea
          className={`${controlClass} mt-3 min-h-24 font-mono`}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={"Galaxy A15\tSamsung\tPhones\t8/256\t8901\t5\t28000\t33000\tAli Traders\t0300..."}
          value={pasteText}
        />
        <button
          className="mt-3 inline-flex min-h-9 items-center rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:opacity-50"
          disabled={pasteText.trim() === ""}
          onClick={applyPaste}
          type="button"
        >
          Add pasted rows
        </button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Batch purchase total{" "}
          <span className="font-mono font-semibold text-ink">
            {formatMoney(batchTotalMinor as never)}
          </span>
        </p>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-6 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
          disabled={mutation.isPending}
          type="submit"
        >
          {mutation.isPending
            ? "Saving…"
            : `Save batch & add stock (${activeRows.length})`}
        </button>
      </div>
    </form>
  );
}

interface CatalogRef {
  readonly id: string;
  readonly name: string;
}

function BulkRowInputs({
  row,
  index,
  errors,
  brandItems,
  categoryItems,
  removable,
  onUpdate,
  onDuplicate,
  onRemove,
}: {
  readonly row: BulkRowState;
  readonly index: number;
  readonly errors: FieldErrors | undefined;
  readonly brandItems: readonly CatalogRef[];
  readonly categoryItems: readonly CatalogRef[];
  readonly removable: boolean;
  readonly onUpdate: <K extends keyof BulkRowState>(
    field: K,
    value: BulkRowState[K],
  ) => void;
  readonly onDuplicate: () => void;
  readonly onRemove: () => void;
}): JSX.Element {
  const cell = "pb-2 pr-2 align-top";
  const errorList =
    errors === undefined ? [] : Object.values(errors).flat();
  return (
    <>
      <tr>
        <td className={`${cell} pt-2 text-xs font-semibold text-ink-muted`}>
          {index + 1}
        </td>
        <td className={cell}>
          <input
            aria-label={`Product name row ${index + 1}`}
            className={controlClass}
            onChange={(event) => onUpdate("productName", event.target.value)}
            value={row.productName}
          />
        </td>
        <td className={cell}>
          <select
            aria-label={`Brand row ${index + 1}`}
            className={controlClass}
            onChange={(event) => onUpdate("brandId", event.target.value)}
            value={row.brandId}
          >
            <option value="">Brand…</option>
            {brandItems.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </td>
        <td className={cell}>
          <select
            aria-label={`Category row ${index + 1}`}
            className={controlClass}
            onChange={(event) => onUpdate("categoryId", event.target.value)}
            value={row.categoryId}
          >
            <option value="">Category…</option>
            {categoryItems.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </td>
        <td className={cell}>
          <input
            aria-label={`Model or variant row ${index + 1}`}
            className={controlClass}
            onChange={(event) => onUpdate("variantName", event.target.value)}
            placeholder="Optional"
            value={row.variantName}
          />
        </td>
        <td className={cell}>
          <input
            aria-label={`Barcode row ${index + 1}`}
            className={controlClass}
            onChange={(event) => onUpdate("barcode", event.target.value)}
            placeholder="Optional"
            value={row.barcode}
          />
        </td>
        <td className={cell}>
          <input
            aria-label={`Quantity row ${index + 1}`}
            className={controlClass}
            inputMode="numeric"
            onChange={(event) => onUpdate("quantity", event.target.value)}
            value={row.quantity}
          />
        </td>
        <td className={cell}>
          <input
            aria-label={`Purchase price row ${index + 1}`}
            className={controlClass}
            inputMode="decimal"
            onChange={(event) => onUpdate("unitCost", event.target.value)}
            placeholder="0.00"
            value={row.unitCost}
          />
        </td>
        <td className={cell}>
          <input
            aria-label={`Selling price row ${index + 1}`}
            className={controlClass}
            inputMode="decimal"
            onChange={(event) => onUpdate("sellingPrice", event.target.value)}
            placeholder="0.00"
            value={row.sellingPrice}
          />
        </td>
        <td className={cell}>
          <input
            aria-label={`Supplier row ${index + 1}`}
            className={controlClass}
            onChange={(event) => onUpdate("supplierName", event.target.value)}
            placeholder="Default"
            value={row.supplierName}
          />
        </td>
        <td className={cell}>
          <input
            aria-label={`Supplier phone row ${index + 1}`}
            className={controlClass}
            inputMode="tel"
            onChange={(event) => onUpdate("supplierPhone", event.target.value)}
            placeholder="Optional"
            value={row.supplierPhone}
          />
        </td>
        <td className={`${cell} pt-2`}>
          <div className="flex items-center gap-1">
            <button
              aria-label={`Duplicate row ${index + 1}`}
              className="rounded-control border border-line px-2 py-1 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
              onClick={onDuplicate}
              title="Duplicate row"
              type="button"
            >
              Dup
            </button>
            <button
              aria-label={`Remove row ${index + 1}`}
              className="rounded-control border border-line px-2 py-1 text-xs font-semibold text-negative hover:bg-negative-soft disabled:opacity-40"
              disabled={!removable}
              onClick={onRemove}
              title="Remove row"
              type="button"
            >
              ✕
            </button>
          </div>
        </td>
      </tr>
      {errorList.length === 0 ? null : (
        <tr>
          <td />
          <td className="pb-2 text-xs text-negative" colSpan={11}>
            {errorList.join(" ")}
          </td>
        </tr>
      )}
    </>
  );
}

// =============================================================================
// Page
// =============================================================================

export function BulkStockInPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  if (auth.data === undefined && auth.isPending) {
    return <BulkStockInRouteFallback />;
  }
  const capabilities = quickStockInCapabilities(auth.data?.permissions);
  if (!capabilities.canReceive) {
    return (
      <CatalogForbiddenState
        description="Bulk Stock In requires the server-provided purchases.receive permission. No stock request was sent."
        title="Receiving access required"
      />
    );
  }
  return <BulkStockInWorkspace />;
}
