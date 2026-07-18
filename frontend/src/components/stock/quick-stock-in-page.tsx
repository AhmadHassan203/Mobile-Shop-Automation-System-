"use client";

import {
  PAGINATION,
  PERMISSIONS,
  formatMoney,
  fromMajor,
  resolveQuickStockInAmounts,
  type QuickStockInInput,
  type QuickStockInPaymentData,
  type QuickStockInResult,
  type QuickStockInTender,
  type QuickStockInWalletProvider,
} from "@mobileshop/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, type FormEvent, type JSX } from "react";
import { CatalogForbiddenState } from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  LayersIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { ApiError, toApiError } from "@/lib/api/client";
import { quickStockIn, quickStockInInputSchema } from "@/lib/api/inventory";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  catalogBrandsQueryOptions,
  catalogCategoriesQueryOptions,
  catalogProductsQueryOptions,
} from "@/lib/query/catalog-query";
import { stockLocationsQueryOptions } from "@/lib/query/inventory-query";
import { suppliersQueryOptions } from "@/lib/query/purchasing-query";
import { queryKeys } from "@/lib/query/keys";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted";
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

// =============================================================================
// Form state
// =============================================================================

/**
 * The four tenders the shopkeeper picks from. JazzCash and EasyPaisa both map to
 * the contract's `digital_wallet` method with the matching `walletProvider`.
 */
export type QuickStockInPaymentTender =
  | "cash"
  | "bank_transfer"
  | "jazzcash"
  | "easypaisa";

export type QuickStockInPaymentStatus = "paid_full" | "partial" | "credit";

export interface QuickStockInFormState {
  readonly productMode: "existing" | "new";
  readonly productVariantId: string;
  readonly productFilter: string;
  readonly productName: string;
  readonly productModelName: string;
  readonly variantName: string;
  readonly categoryId: string;
  readonly brandId: string;
  readonly sku: string;
  readonly supplierMode: "existing" | "new";
  readonly supplierId: string;
  readonly supplierName: string;
  readonly supplierPhone: string;
  readonly supplierCode: string;
  readonly paymentTermsDays: string;
  readonly stockLocationId: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly sellingPrice: string;
  readonly paymentStatus: QuickStockInPaymentStatus;
  readonly paymentTender: QuickStockInPaymentTender;
  readonly amountPaid: string;
  readonly paymentReference: string;
  readonly supplierReference: string;
  readonly notes: string;
}

export function initialQuickStockInForm(): QuickStockInFormState {
  return {
    productMode: "existing",
    productVariantId: "",
    productFilter: "",
    productName: "",
    productModelName: "",
    variantName: "",
    categoryId: "",
    brandId: "",
    sku: "",
    supplierMode: "existing",
    supplierId: "",
    supplierName: "",
    supplierPhone: "",
    supplierCode: "",
    paymentTermsDays: "",
    stockLocationId: "",
    quantity: "1",
    unitCost: "",
    sellingPrice: "",
    paymentStatus: "paid_full",
    paymentTender: "cash",
    amountPaid: "",
    paymentReference: "",
    supplierReference: "",
    notes: "",
  };
}

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

// =============================================================================
// Pure builders and mappers (unit-tested directly)
// =============================================================================

interface MinorField {
  readonly minor?: number;
  readonly error?: string;
}

/** Convert a major-unit rupee string to integer minor units without floats. */
export function toMinorField(value: string): MinorField {
  const trimmed = value.trim();
  if (trimmed === "") return { error: "Enter an amount in rupees." };
  try {
    return { minor: fromMajor(trimmed) };
  } catch {
    return { error: "Enter a valid amount in rupees (up to 2 decimals)." };
  }
}

function buildProduct(form: QuickStockInFormState): QuickStockInInput["product"] {
  if (form.productMode === "existing") {
    return { mode: "existing", productVariantId: form.productVariantId };
  }
  return {
    mode: "new",
    productName: form.productName,
    ...(form.productModelName.trim().length > 0
      ? { productModelName: form.productModelName }
      : {}),
    variantName: form.variantName,
    categoryId: form.categoryId,
    brandId: form.brandId,
    ...(form.sku.trim().length > 0 ? { sku: form.sku } : {}),
  };
}

function buildSupplier(
  form: QuickStockInFormState,
): QuickStockInInput["supplier"] {
  if (form.supplierMode === "existing") {
    return { mode: "existing", supplierId: form.supplierId };
  }
  return {
    mode: "new",
    name: form.supplierName,
    ...(form.supplierPhone.trim().length > 0
      ? { phone: form.supplierPhone }
      : {}),
    ...(form.supplierCode.trim().length > 0 ? { code: form.supplierCode } : {}),
    ...(form.paymentTermsDays.trim().length > 0
      ? { paymentTermsDays: Number(form.paymentTermsDays) }
      : {}),
  };
}

interface ResolvedTender {
  readonly method: QuickStockInTender;
  readonly walletProvider?: QuickStockInWalletProvider;
}

/** Map the UI tender choice onto the contract's method + wallet provider. */
export function resolveTender(tender: QuickStockInPaymentTender): ResolvedTender {
  switch (tender) {
    case "cash":
      return { method: "cash" };
    case "bank_transfer":
      return { method: "bank_transfer" };
    case "jazzcash":
      return { method: "digital_wallet", walletProvider: "jazzcash" };
    case "easypaisa":
      return { method: "digital_wallet", walletProvider: "easypaisa" };
  }
}

function buildPayment(
  form: QuickStockInFormState,
  amountPaidMinor: number,
): QuickStockInInput["payment"] {
  if (form.paymentStatus === "credit") return { status: "credit" };
  const { method, walletProvider } = resolveTender(form.paymentTender);
  const tender = {
    method,
    ...(walletProvider !== undefined ? { walletProvider } : {}),
    ...(form.paymentReference.trim().length > 0
      ? { reference: form.paymentReference }
      : {}),
  };
  if (form.paymentStatus === "paid_full") {
    return { status: "paid_full", ...tender };
  }
  return { status: "partial", ...tender, amountPaidMinor };
}

/** A parsed-shaped payment used only for the live, informational summary math. */
function summaryPayment(
  form: QuickStockInFormState,
  amountPaidMinor: number,
): QuickStockInPaymentData {
  if (form.paymentStatus === "credit") return { status: "credit" };
  const { method } = resolveTender(form.paymentTender);
  if (form.paymentStatus === "paid_full") {
    return { status: "paid_full", method };
  }
  return { status: "partial", method, amountPaidMinor };
}

/** Map a Zod issue path to the form-state field key that renders its error. */
export function pathToField(path: ReadonlyArray<PropertyKey>): string {
  const segments = path.map(String);
  const [head, next] = segments;
  if (head === "product") {
    if (next === "name") return "productName";
    return next ?? "product";
  }
  if (head === "supplier") {
    if (next === "name") return "supplierName";
    if (next === "phone") return "supplierPhone";
    if (next === "code") return "supplierCode";
    return next ?? "supplier";
  }
  if (head === "payment") {
    if (next === "amountPaidMinor") return "amountPaid";
    if (next === "method" || next === "walletProvider") return "paymentTender";
    if (next === "reference") return "paymentReference";
    return "payment";
  }
  if (head === "unitCostMinor") return "unitCost";
  if (head === "sellingPriceMinor") return "sellingPrice";
  return head ?? "form";
}

export type QuickStockInBuildResult =
  | { readonly ok: true; readonly value: QuickStockInInput }
  | { readonly ok: false; readonly errors: FieldErrors };

/**
 * Assemble the strict request from raw form strings, converting rupees to minor
 * units and surfacing every validation problem as a per-field message. The API
 * layer re-parses, so this never sends an unchecked payload.
 */
export function buildQuickStockInInput(
  form: QuickStockInFormState,
): QuickStockInBuildResult {
  const errors: Record<string, string[]> = {};
  const unit = toMinorField(form.unitCost);
  const selling = toMinorField(form.sellingPrice);
  if (unit.error !== undefined) (errors.unitCost ??= []).push(unit.error);
  if (selling.error !== undefined) {
    (errors.sellingPrice ??= []).push(selling.error);
  }

  // Only a partial payment carries a typed amount; paid-in-full and credit are
  // exact by construction and send no amount in the body.
  let amountPaidMinor = 0;
  if (form.paymentStatus === "partial") {
    const paid = toMinorField(form.amountPaid);
    if (paid.error !== undefined) (errors.amountPaid ??= []).push(paid.error);
    amountPaidMinor = paid.minor ?? 0;
  }

  const value = {
    product: buildProduct(form),
    supplier: buildSupplier(form),
    stockLocationId: form.stockLocationId,
    quantity: Number(form.quantity),
    unitCostMinor: unit.minor ?? 0,
    sellingPriceMinor: selling.minor ?? 0,
    payment: buildPayment(form, amountPaidMinor),
    ...(form.supplierReference.trim().length > 0
      ? { supplierReference: form.supplierReference }
      : {}),
    ...(form.notes.trim().length > 0 ? { notes: form.notes } : {}),
  } as QuickStockInInput;

  const parsed = quickStockInInputSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = pathToField(issue.path);
      // A money-conversion error we already produced is friendlier than the
      // schema's generic complaint on the fallback zero.
      if (
        (field === "unitCost" ||
          field === "sellingPrice" ||
          field === "amountPaid") &&
        errors[field] !== undefined
      ) {
        continue;
      }
      (errors[field] ??= []).push(issue.message);
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}

// =============================================================================
// Permissions, error copy and cache invalidation
// =============================================================================

export interface QuickStockInCapabilities {
  readonly canReceive: boolean;
}

export function quickStockInCapabilities(
  permissions: readonly string[] | undefined,
): QuickStockInCapabilities {
  return {
    canReceive: new Set(permissions ?? []).has(PERMISSIONS.PURCHASES_RECEIVE),
  };
}

export function quickStockInErrorMessage(error: ApiError): string {
  if (error.code === "VALIDATION_FAILED") {
    return `${error.message} Nothing was received.`;
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return "Your current permissions do not allow receiving stock. Nothing was received.";
  }
  if (error.code === "NETWORK_ERROR") {
    return "The inventory API could not be reached, so nothing was received. Retry safely — the same request key prevents a duplicate.";
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return "The inventory API did not respond in time. Retry safely — the same request key prevents a duplicate receipt.";
  }
  return `${error.message} Nothing was received; review the details and try again.`;
}

/** Every read whose result the receipt can change. Only existing roots. */
export function quickStockInInvalidationKeys(): ReadonlyArray<
  readonly string[]
> {
  return [
    queryKeys.inventoryBalancesRoot,
    queryKeys.inventoryMovementsRoot,
    queryKeys.inventoryLocationsRoot,
    queryKeys.catalogProductsRoot,
    queryKeys.purchasingOrdersRoot,
    queryKeys.purchasingReceiptsRoot,
    queryKeys.purchasingSuppliersRoot,
    queryKeys.posLookupRoot,
  ];
}

// =============================================================================
// Presentational pieces
// =============================================================================

function FieldError({
  errors,
}: {
  readonly errors: readonly string[] | undefined;
}): JSX.Element | null {
  return errors === undefined ? null : (
    <p className="mt-1 text-xs text-negative">{errors.join(" ")}</p>
  );
}

export function QuickStockInErrorBanner({
  error,
}: {
  readonly error: ApiError;
}): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
      role="alert"
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">Stock was not received</p>
        <p className="mt-0.5">{quickStockInErrorMessage(error)}</p>
        {error.requestId === undefined ? null : (
          <p className="mt-1 font-mono text-xs">Ref: {error.requestId}</p>
        )}
      </div>
    </div>
  );
}

export function QuickStockInSubmitButton({
  pending,
}: {
  readonly pending: boolean;
}): JSX.Element {
  return (
    <button
      className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-6 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : "Save Purchase & Add Stock"}
    </button>
  );
}

function SummaryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** Human label for the recorded tender, including the specific wallet service. */
export function paymentMethodLabel(result: {
  readonly paymentStatus: QuickStockInResult["paymentStatus"];
  readonly paymentMethod: QuickStockInResult["paymentMethod"];
  readonly walletProvider: QuickStockInResult["walletProvider"];
}): string {
  if (result.paymentStatus === "credit" || result.paymentMethod === null) {
    return "On credit (unpaid)";
  }
  if (result.paymentMethod === "cash") return "Cash";
  if (result.paymentMethod === "bank_transfer") return "Bank transfer";
  if (result.walletProvider === "jazzcash") return "JazzCash";
  if (result.walletProvider === "easypaisa") return "EasyPaisa";
  return "Digital wallet";
}

const successLinkClass =
  "inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle";

export function QuickStockInSuccess({
  result,
  onReset,
}: {
  readonly result: QuickStockInResult;
  readonly onReset: () => void;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div
        className="flex items-start gap-2.5 rounded-card border border-positive/25 bg-positive-soft p-4 text-sm text-positive"
        role="status"
      >
        <CheckCircleIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-base font-bold">Stock added successfully</p>
          <p className="mt-0.5">
            The purchase order, goods receipt, stock movement, payment and
            supplier payable were recorded as one transaction.
          </p>
        </div>
      </div>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Receipt summary</h2>
        <dl className="mt-3 divide-y divide-line-subtle">
          <SummaryRow
            label="Product"
            value={`${result.product.sku} · ${result.product.name}${
              result.product.wasCreated ? " (new)" : ""
            }`}
          />
          <SummaryRow
            label="Supplier"
            value={`${result.supplier.name}${
              result.supplier.wasCreated ? " (new)" : ""
            }`}
          />
          <SummaryRow
            label="Quantity added"
            value={String(result.quantityAdded)}
          />
          <SummaryRow
            label="Purchase total"
            value={formatMoney(result.purchaseTotalMinor as never)}
          />
          <SummaryRow
            label="Paid amount"
            value={formatMoney(result.paidAmountMinor as never)}
          />
          <SummaryRow
            label="Remaining payable"
            value={formatMoney(result.remainingPayableMinor as never)}
          />
          <SummaryRow
            label="Payment method"
            value={paymentMethodLabel(result)}
          />
          <SummaryRow
            label="Selling price"
            value={formatMoney(result.sellingPriceMinor as never)}
          />
          <SummaryRow
            label="Current stock on hand"
            value={String(result.currentStockOnHand)}
          />
          <SummaryRow
            label="Purchase order"
            value={result.purchaseOrderNumber}
          />
          <SummaryRow
            label="Goods receipt"
            value={result.goodsReceiptNumber}
          />
        </dl>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
          onClick={onReset}
          type="button"
        >
          Add More Stock
        </button>
        <Link className={successLinkClass} href="/stock">
          View Current Stock
        </Link>
        <Link className={successLinkClass} href="/inventory">
          Open Product
        </Link>
        <Link className={successLinkClass} href="/purchases">
          View Purchase Record
        </Link>
      </div>
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
              Inventory · Quick Stock In
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
              Quick Stock In
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Receive quantity-tracked stock in one screen. The shop sees a
              single action; the server still records the full purchase, receipt,
              stock movement and supplier payable together.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1.5 text-xs font-bold text-positive">
          <ShieldCheckIcon className="size-4" /> API-backed · permission scoped
        </span>
      </div>
      <div className="mt-4 grid gap-3 border-t border-line pt-4 text-xs text-ink-muted sm:grid-cols-3">
        <p>
          <strong className="block text-ink">1 · Choose product</strong>
          Reuse a quantity product or create one inline.
        </p>
        <p>
          <strong className="block text-ink">2 · Choose supplier</strong>
          Reuse a supplier or type a new one.
        </p>
        <p>
          <strong className="block text-ink">3 · Record payment</strong>
          Paid, partial or credit — the payable posts to match.
        </p>
      </div>
    </header>
  );
}

export function QuickStockInRouteFallback(): JSX.Element {
  return (
    <div
      aria-label="Loading Quick Stock In"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading Quick Stock In</span>
      <div className="h-32 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-48 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-48 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

// =============================================================================
// Workspace
// =============================================================================

function QuickStockInWorkspace({
  embedded = false,
}: {
  readonly embedded?: boolean;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<QuickStockInFormState>(
    initialQuickStockInForm,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<QuickStockInResult | null>(null);
  // Held across a retry of the SAME attempt; cleared on any edit or success so a
  // genuinely new submission always mints a fresh idempotency key.
  const idempotencyKeyRef = useRef<string | null>(null);

  function update<K extends keyof QuickStockInFormState>(
    key: K,
    value: QuickStockInFormState[K],
  ): void {
    idempotencyKeyRef.current = null;
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  const products = useQuery({
    ...catalogProductsQueryOptions(
      {
        page: 1,
        pageSize: PAGINATION.MAX_PAGE_SIZE,
        active: true,
        ...(form.productFilter.trim().length > 0
          ? { q: form.productFilter.trim() }
          : {}),
      },
      form.productMode === "existing",
    ),
  });
  const categories = useQuery(
    catalogCategoriesQueryOptions(
      REFERENCE_PARAMETERS,
      form.productMode === "new",
    ),
  );
  const brands = useQuery(
    catalogBrandsQueryOptions(REFERENCE_PARAMETERS, form.productMode === "new"),
  );
  const suppliers = useQuery(
    suppliersQueryOptions(
      REFERENCE_PARAMETERS,
      form.supplierMode === "existing",
    ),
  );
  const locations = useQuery(
    stockLocationsQueryOptions(REFERENCE_PARAMETERS, true),
  );

  const productItems = products.data?.items ?? [];
  const categoryItems = categories.data?.items ?? [];
  const brandItems = brands.data?.items ?? [];
  const supplierItems = suppliers.data?.items ?? [];
  const locationItems = locations.data?.items ?? [];

  const mutation = useMutation({
    mutationFn: (payload: { value: QuickStockInInput; key: string }) =>
      quickStockIn(payload.value, payload.key),
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
    setFieldErrors({});
    setRequestError(null);
    if (mutation.isPending) return;
    const built = buildQuickStockInInput(form);
    if (!built.ok) {
      setFieldErrors(built.errors);
      return;
    }
    const key = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = key;
    mutation.mutate({ value: built.value, key });
  };

  const reset = (): void => {
    setForm(initialQuickStockInForm());
    setFieldErrors({});
    setRequestError(null);
    setResult(null);
    idempotencyKeyRef.current = null;
    mutation.reset();
  };

  if (result !== null) {
    return (
      <div className="space-y-5">
        {embedded ? null : <Header />}
        <QuickStockInSuccess result={result} onReset={reset} />
      </div>
    );
  }

  const quantityNumber = Number(form.quantity);
  const validQuantity = Number.isInteger(quantityNumber) && quantityNumber > 0;
  const unitMinor = toMinorField(form.unitCost).minor;
  const sellingMinor = toMinorField(form.sellingPrice).minor;
  const amountPaidMinor =
    form.paymentStatus === "partial"
      ? (toMinorField(form.amountPaid).minor ?? 0)
      : 0;

  // Mirror the server's own paid/remaining split so the shopkeeper sees the
  // exact figures that will be posted.
  const amounts =
    unitMinor !== undefined && validQuantity
      ? resolveQuickStockInAmounts({
          quantity: quantityNumber,
          unitCostMinor: unitMinor,
          payment: summaryPayment(form, amountPaidMinor),
        })
      : undefined;
  const potentialSalesMinor =
    sellingMinor !== undefined && validQuantity
      ? sellingMinor * quantityNumber
      : undefined;
  const potentialProfitMinor =
    amounts !== undefined && potentialSalesMinor !== undefined
      ? potentialSalesMinor - amounts.purchaseTotalMinor
      : undefined;
  const showMinor = (value: number | undefined): string =>
    value === undefined ? "—" : formatMoney(value as never);

  return (
    <form className="space-y-5" onSubmit={submit}>
      {embedded ? null : <Header />}

      {requestError === null ? null : (
        <QuickStockInErrorBanner error={requestError} />
      )}

      {/* Product ------------------------------------------------------------ */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Product</h2>
        <div className="mt-3 flex gap-2" role="group" aria-label="Product mode">
          <button
            aria-pressed={form.productMode === "existing"}
            className={`${toggleBase} ${
              form.productMode === "existing"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
            }`}
            onClick={() => update("productMode", "existing")}
            type="button"
          >
            Existing product
          </button>
          <button
            aria-pressed={form.productMode === "new"}
            className={`${toggleBase} ${
              form.productMode === "new"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
            }`}
            onClick={() => update("productMode", "new")}
            type="button"
          >
            New product
          </button>
        </div>

        {form.productMode === "existing" ? (
          <div className="mt-4 space-y-4">
            <label className={labelClass}>
              Filter products
              <input
                className={controlClass}
                onChange={(event) =>
                  update("productFilter", event.target.value)
                }
                placeholder="Search SKU or product name"
                value={form.productFilter}
              />
            </label>
            <label className={labelClass}>
              Quantity-tracked product
              <select
                className={controlClass}
                disabled={products.isPending}
                onChange={(event) =>
                  update("productVariantId", event.target.value)
                }
                value={form.productVariantId}
              >
                <option value="">Select a product</option>
                {productItems.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} · {product.name}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.productVariantId} />
            </label>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Product name
              <input
                className={controlClass}
                onChange={(event) => update("productName", event.target.value)}
                placeholder="e.g. Galaxy A15"
                value={form.productName}
              />
              <FieldError errors={fieldErrors.productName} />
            </label>
            <label className={labelClass}>
              Model name (optional)
              <input
                className={controlClass}
                onChange={(event) =>
                  update("productModelName", event.target.value)
                }
                placeholder="Defaults to the product name"
                value={form.productModelName}
              />
              <FieldError errors={fieldErrors.productModelName} />
            </label>
            <label className={labelClass}>
              Variant name
              <input
                className={controlClass}
                onChange={(event) => update("variantName", event.target.value)}
                placeholder="e.g. Galaxy A15 8/256 Black"
                value={form.variantName}
              />
              <FieldError errors={fieldErrors.variantName} />
            </label>
            <label className={labelClass}>
              SKU (optional)
              <input
                className={controlClass}
                onChange={(event) => update("sku", event.target.value)}
                placeholder="Generated when left blank"
                value={form.sku}
              />
              <FieldError errors={fieldErrors.sku} />
            </label>
            <label className={labelClass}>
              Category
              <select
                className={controlClass}
                disabled={categories.isPending}
                onChange={(event) => update("categoryId", event.target.value)}
                value={form.categoryId}
              >
                <option value="">Select a category</option>
                {categoryItems.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.categoryId} />
            </label>
            <label className={labelClass}>
              Brand
              <select
                className={controlClass}
                disabled={brands.isPending}
                onChange={(event) => update("brandId", event.target.value)}
                value={form.brandId}
              >
                <option value="">Select a brand</option>
                {brandItems.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.brandId} />
            </label>
          </div>
        )}
      </section>

      {/* Supplier ----------------------------------------------------------- */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Supplier</h2>
        <div className="mt-3 flex gap-2" role="group" aria-label="Supplier mode">
          <button
            aria-pressed={form.supplierMode === "existing"}
            className={`${toggleBase} ${
              form.supplierMode === "existing"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
            }`}
            onClick={() => update("supplierMode", "existing")}
            type="button"
          >
            Existing supplier
          </button>
          <button
            aria-pressed={form.supplierMode === "new"}
            className={`${toggleBase} ${
              form.supplierMode === "new"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
            }`}
            onClick={() => update("supplierMode", "new")}
            type="button"
          >
            New supplier
          </button>
        </div>

        {form.supplierMode === "existing" ? (
          <label className={`${labelClass} mt-4`}>
            Supplier
            <select
              className={controlClass}
              disabled={suppliers.isPending}
              onChange={(event) => update("supplierId", event.target.value)}
              value={form.supplierId}
            >
              <option value="">Select a supplier</option>
              {supplierItems.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} · {supplier.name}
                </option>
              ))}
            </select>
            <FieldError errors={fieldErrors.supplierId} />
          </label>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              Supplier name
              <input
                className={controlClass}
                onChange={(event) => update("supplierName", event.target.value)}
                placeholder="e.g. City Distributors"
                value={form.supplierName}
              />
              <FieldError errors={fieldErrors.supplierName} />
            </label>
            <label className={labelClass}>
              Phone (optional)
              <input
                className={controlClass}
                inputMode="tel"
                onChange={(event) => update("supplierPhone", event.target.value)}
                placeholder="e.g. 0300 1234567"
                value={form.supplierPhone}
              />
              <FieldError errors={fieldErrors.supplierPhone} />
            </label>
            <label className={labelClass}>
              Code (optional)
              <input
                className={controlClass}
                onChange={(event) => update("supplierCode", event.target.value)}
                placeholder="Generated when blank"
                value={form.supplierCode}
              />
              <FieldError errors={fieldErrors.supplierCode} />
            </label>
            <label className={labelClass}>
              Payment terms (days, optional)
              <input
                className={controlClass}
                inputMode="numeric"
                min="0"
                onChange={(event) =>
                  update("paymentTermsDays", event.target.value)
                }
                step="1"
                type="number"
                value={form.paymentTermsDays}
              />
              <FieldError errors={fieldErrors.paymentTermsDays} />
            </label>
          </div>
        )}
      </section>

      {/* Stock -------------------------------------------------------------- */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Stock</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>
            Stock location
            <select
              className={controlClass}
              disabled={locations.isPending}
              onChange={(event) =>
                update("stockLocationId", event.target.value)
              }
              value={form.stockLocationId}
            >
              <option value="">Select a location</option>
              {locationItems.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </select>
            <FieldError errors={fieldErrors.stockLocationId} />
          </label>
          <label className={labelClass}>
            Quantity
            <input
              className={controlClass}
              inputMode="numeric"
              min="1"
              onChange={(event) => update("quantity", event.target.value)}
              step="1"
              type="number"
              value={form.quantity}
            />
            <FieldError errors={fieldErrors.quantity} />
          </label>
          <div className="hidden sm:block" />
          <label className={labelClass}>
            Unit purchase cost (rupees)
            <input
              className={controlClass}
              inputMode="decimal"
              onChange={(event) => update("unitCost", event.target.value)}
              placeholder="0.00"
              value={form.unitCost}
            />
            <FieldError errors={fieldErrors.unitCost} />
          </label>
          <label className={labelClass}>
            Selling price (rupees)
            <input
              className={controlClass}
              inputMode="decimal"
              onChange={(event) => update("sellingPrice", event.target.value)}
              placeholder="0.00"
              value={form.sellingPrice}
            />
            <FieldError errors={fieldErrors.sellingPrice} />
          </label>
        </div>
      </section>

      {/* Payment ------------------------------------------------------------ */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Payment</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Payment status
            <select
              className={controlClass}
              onChange={(event) =>
                update(
                  "paymentStatus",
                  event.target.value as QuickStockInPaymentStatus,
                )
              }
              value={form.paymentStatus}
            >
              <option value="paid_full">Paid in full</option>
              <option value="partial">Partially paid</option>
              <option value="credit">Buy on credit</option>
            </select>
          </label>
          <label className={labelClass}>
            Payment method
            <select
              className={controlClass}
              disabled={form.paymentStatus === "credit"}
              onChange={(event) =>
                update(
                  "paymentTender",
                  event.target.value as QuickStockInPaymentTender,
                )
              }
              value={form.paymentTender}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">EasyPaisa</option>
            </select>
            <FieldError errors={fieldErrors.paymentTender} />
          </label>
          {form.paymentStatus === "partial" ? (
            <label className={labelClass}>
              Amount paid (rupees)
              <input
                className={controlClass}
                inputMode="decimal"
                onChange={(event) => update("amountPaid", event.target.value)}
                placeholder="0.00"
                value={form.amountPaid}
              />
              <FieldError errors={fieldErrors.amountPaid} />
            </label>
          ) : null}
          {form.paymentStatus === "credit" ? null : (
            <label className={labelClass}>
              Payment reference (optional)
              <input
                className={controlClass}
                onChange={(event) =>
                  update("paymentReference", event.target.value)
                }
                placeholder="Transaction or slip number"
                value={form.paymentReference}
              />
              <FieldError errors={fieldErrors.paymentReference} />
            </label>
          )}
        </div>
      </section>

      {/* Reference ---------------------------------------------------------- */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Reference</h2>
        <div className="mt-4 space-y-4">
          <label className={labelClass}>
            Supplier reference (optional)
            <input
              className={controlClass}
              onChange={(event) =>
                update("supplierReference", event.target.value)
              }
              placeholder="Invoice or bill number"
              value={form.supplierReference}
            />
            <FieldError errors={fieldErrors.supplierReference} />
          </label>
          <label className={labelClass}>
            Notes (optional)
            <textarea
              className={`${controlClass} min-h-24 resize-y`}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Anything to remember about this delivery"
              value={form.notes}
            />
            <FieldError errors={fieldErrors.notes} />
          </label>
        </div>
      </section>

      {/* Summary ------------------------------------------------------------ */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Summary</h2>
        <dl className="mt-3 divide-y divide-line-subtle">
          <SummaryRow
            label="Purchase total"
            value={showMinor(amounts?.purchaseTotalMinor)}
          />
          <SummaryRow
            label="Potential sales"
            value={showMinor(potentialSalesMinor)}
          />
          <SummaryRow
            label="Potential gross profit"
            value={showMinor(potentialProfitMinor)}
          />
          <SummaryRow
            label="Paid amount"
            value={showMinor(amounts?.paidAmountMinor)}
          />
          <SummaryRow
            label="Remaining payable"
            value={showMinor(amounts?.remainingPayableMinor)}
          />
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          Figures are informational. The server recomputes and stores every
          amount as exact minor units.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <QuickStockInSubmitButton pending={mutation.isPending} />
      </div>
    </form>
  );
}

export function QuickStockInPage({
  embedded = false,
}: {
  /** When embedded (e.g. inside Purchasing → Add Stock) the standalone page
   * header is suppressed so there is no nested workspace shell. */
  readonly embedded?: boolean;
} = {}): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  if (auth.data === undefined && auth.isPending) {
    return <QuickStockInRouteFallback />;
  }
  const capabilities = quickStockInCapabilities(auth.data?.permissions);
  if (!capabilities.canReceive) {
    return (
      <CatalogForbiddenState
        description="Quick Stock In requires the server-provided purchases.receive permission. No stock request was sent."
        title="Receiving access required"
      />
    );
  }
  return <QuickStockInWorkspace embedded={embedded} />;
}
