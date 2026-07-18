"use client";

import {
  LIMITS,
  PAGINATION,
  PERMISSIONS,
  PRODUCT_CONDITIONS,
  PTA_STATUSES,
  TRACKING_TYPES,
} from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ProductFormDrawer } from "./add-product-drawer";
import { BrandsTab } from "./brands-tab";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogNoResultsState,
  CatalogTableSkeleton,
} from "./catalog-states";
import { CategoriesTab } from "./categories-tab";
import {
  catalogReadErrorCopy,
  ProductDetailDrawer,
} from "./product-detail-drawer";
import { ProductModelsTab } from "./product-models-tab";
import {
  BoxIcon,
  CheckCircleIcon,
  CloseIcon,
  EyeIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import {
  activateCatalogProduct,
  deactivateCatalogProduct,
  getCatalogProducts,
  type CatalogProduct,
  type ProductListParameters,
} from "@/lib/api/catalog";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  catalogProductsQueryOptions,
  catalogReferencesQueryOptions,
} from "@/lib/query/catalog-query";
import { queryKeys } from "@/lib/query/keys";

const PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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

/**
 * The products tab reads unprefixed query keys, which the other tabs never
 * touch — each reference tab namespaces its own. That keeps one URL shareable
 * across the whole workspace without any tab clobbering another's state.
 */
export function parametersFrom(
  searchParams: URLSearchParams,
): ProductListParameters {
  const q = searchParams.get("q")?.trim();
  const activeValue = searchParams.get("active");
  return {
    page: positivePage(searchParams.get("page")),
    pageSize: PAGE_SIZE,
    ...(q === undefined || q.length === 0 ? {} : { q }),
    ...(searchParams.get("brandId") === null
      ? {}
      : { brandId: searchParams.get("brandId") ?? undefined }),
    ...(searchParams.get("categoryId") === null
      ? {}
      : { categoryId: searchParams.get("categoryId") ?? undefined }),
    ...(oneOf(searchParams.get("trackingType"), TRACKING_TYPES) === undefined
      ? {}
      : {
          trackingType: oneOf(searchParams.get("trackingType"), TRACKING_TYPES),
        }),
    ...(oneOf(searchParams.get("condition"), PRODUCT_CONDITIONS) === undefined
      ? {}
      : {
          condition: oneOf(searchParams.get("condition"), PRODUCT_CONDITIONS),
        }),
    ...(oneOf(searchParams.get("ptaStatus"), PTA_STATUSES) === undefined
      ? {}
      : {
          ptaStatus: oneOf(searchParams.get("ptaStatus"), PTA_STATUSES),
        }),
    ...(activeValue === "true"
      ? { active: true }
      : activeValue === "false"
        ? { active: false }
        : {}),
  };
}

export const CATALOG_TABS = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "brands", label: "Brands" },
  { id: "models", label: "Models" },
] as const;

export type CatalogTabId = (typeof CATALOG_TABS)[number]["id"];

/** An unknown or absent `tab` is the products tab; a bad URL never blanks the page. */
export function catalogTabFrom(searchParams: URLSearchParams): CatalogTabId {
  const value = searchParams.get("tab");
  return CATALOG_TABS.some((tab) => tab.id === value)
    ? (value as CatalogTabId)
    : "products";
}

/**
 * The query string for a tab switch. Every other parameter is preserved, so a
 * search on the products tab survives a detour through Brands and back.
 */
export function catalogTabQuery(
  searchParams: URLSearchParams,
  tab: CatalogTabId,
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (tab === "products") next.delete("tab");
  else next.set("tab", tab);
  return next.toString();
}

/** APG tablist keyboard model: arrows wrap, Home/End jump to the ends. */
export function nextCatalogTabIndex(
  current: number,
  key: string,
  length: number,
): number | null {
  if (length === 0) return null;
  if (key === "ArrowRight") return (current + 1) % length;
  if (key === "ArrowLeft") return (current - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

/** Copy for a failed deactivate/reactivate. Nothing is optimistically flipped. */
export function productStatusChangeMessage(
  error: ApiError,
  wasActive: boolean,
): string {
  const action = wasActive ? "deactivated" : "reactivated";

  if (error.code === "OPTIMISTIC_LOCK_FAILED") {
    return `This product changed since the list loaded, so it was not ${action}. Refresh the catalog to see the current values and try again.`;
  }
  if (error.code === "VALIDATION_FAILED") {
    return `The API rejected this change: ${error.message}`;
  }
  if (error.code === "NOT_FOUND" || error.status === 404) {
    return `This product no longer exists for your organization, so it was not ${action}.`;
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return `Your current permissions no longer allow this product to be ${action}.`;
  }
  if (error.code === "NETWORK_ERROR") {
    return `The catalog API could not be reached, so this product was not ${action}. Check your connection and try again.`;
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return `The catalog API did not respond in time, so this product was not ${action}.`;
  }
  return `This product could not be ${action}. Try again.`;
}

export type ScanResolution =
  | { readonly kind: "existing"; readonly productId: string }
  | { readonly kind: "new"; readonly barcode: string };

/**
 * Decide what a scanned barcode means from a catalog search. The catalog list's
 * `q` already matches barcode, SKU, alias, model, brand and category, so any hit
 * is treated as the existing product (exact SKU preferred); an empty result is a
 * new product carrying the scanned barcode. A scan never creates a duplicate:
 * a known barcode always resolves to the existing product.
 */
export function resolveScannedProduct(
  items: readonly { readonly id: string; readonly sku: string }[],
  barcode: string,
): ScanResolution {
  const code = barcode.trim();
  const exact = items.find(
    (item) => item.sku.toLowerCase() === code.toLowerCase(),
  );
  const found = exact ?? items[0];
  return found === undefined
    ? { kind: "new", barcode: code }
    : { kind: "existing", productId: found.id };
}

function CatalogSkeleton(): JSX.Element {
  return (
    <div
      aria-label="Loading product catalog"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading product catalog</span>
      <div className="h-20 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <CatalogTableSkeleton />
    </div>
  );
}

export function ProductCatalogRouteFallback(): JSX.Element {
  return <CatalogSkeleton />;
}

function productAttributes(product: CatalogProduct): string {
  const values = [
    product.ram,
    product.storage,
    product.color,
    product.region,
  ].filter((value): value is string => value !== null);
  return values.length === 0 ? "No optional attributes" : values.join(" · ");
}

const actionClass =
  "inline-flex min-h-8 items-center gap-1 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

interface ProductRowActionsProps {
  readonly product: CatalogProduct;
  readonly busy: boolean;
  readonly canUpdate: boolean;
  readonly canDeactivate: boolean;
  readonly onView: (id: string) => void;
  readonly onEdit: (id: string) => void;
  readonly onToggleActive: (product: CatalogProduct) => void;
}

/**
 * Row actions. There is deliberately no delete: catalog rows are retired by the
 * database's no-hard-delete triggers, never removed, so offering one would
 * promise something the system will always refuse.
 */
function ProductRowActions({
  product,
  busy,
  canUpdate,
  canDeactivate,
  onView,
  onEdit,
  onToggleActive,
}: ProductRowActionsProps): JSX.Element {
  // Reactivation is an ordinary edit; only taking a product out of use is gated
  // on catalog.deactivate.
  const canToggle = product.isActive ? canDeactivate : canUpdate;

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        aria-haspopup="dialog"
        className={actionClass}
        onClick={() => onView(product.id)}
        type="button"
      >
        <EyeIcon className="size-3.5" /> View
      </button>
      {canUpdate ? (
        <button
          aria-haspopup="dialog"
          className={actionClass}
          onClick={() => onEdit(product.id)}
          type="button"
        >
          Edit
        </button>
      ) : null}
      {canToggle ? (
        <button
          className={actionClass}
          disabled={busy}
          onClick={() => onToggleActive(product)}
          type="button"
        >
          {busy ? "Working…" : product.isActive ? "Deactivate" : "Reactivate"}
        </button>
      ) : null}
    </div>
  );
}

interface ProductsTabProps {
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canDeactivate: boolean;
  readonly canViewPricing: boolean;
  readonly canManagePricing: boolean;
}

function ProductsTab({
  canCreate,
  canUpdate,
  canDeactivate,
  canViewPricing,
  canManagePricing,
}: ProductsTabProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [savedProduct, setSavedProduct] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<ApiError | null>(null);
  const [statusWasActive, setStatusWasActive] = useState(true);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [scan, setScan] = useState("");
  const [createBarcode, setCreateBarcode] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);

  const parameters = parametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const products = useQuery(catalogProductsQueryOptions(parameters));
  const references = useQuery(catalogReferencesQueryOptions(true));
  const hasFilters =
    parameters.q !== undefined ||
    parameters.brandId !== undefined ||
    parameters.categoryId !== undefined ||
    parameters.trackingType !== undefined ||
    parameters.condition !== undefined ||
    parameters.ptaStatus !== undefined ||
    parameters.active !== undefined;

  const replaceParameters = (
    updates: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value.length === 0) next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    const query = next.toString();
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  const clearFilters = (): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of [
      "q",
      "brandId",
      "categoryId",
      "trackingType",
      "condition",
      "ptaStatus",
      "active",
      "page",
    ]) {
      next.delete(key);
    }
    const query = next.toString();
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  const search = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = data.get("q");
    replaceParameters({
      q:
        typeof value === "string"
          ? value.trim().slice(0, LIMITS.MAX_SEARCH_TERM_LENGTH)
          : undefined,
    });
  };

  const invalidateProducts = (): void => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogProductsRoot,
    });
  };

  const toggleActive = async (product: CatalogProduct): Promise<void> => {
    if (busyRowId !== null) return;
    setStatusError(null);
    setStatusWasActive(product.isActive);
    setBusyRowId(product.id);
    try {
      if (product.isActive) {
        await deactivateCatalogProduct(product.id, product.version);
      } else {
        await activateCatalogProduct(product.id, product.version);
      }
      invalidateProducts();
    } catch (error) {
      setStatusError(toApiError(error));
    } finally {
      setBusyRowId(null);
    }
  };

  // A hardware scanner types the barcode then presses Enter. A known code opens
  // the existing product; an unknown one opens the create form pre-filled with
  // the barcode. The field is refocused after each scan for rapid entry.
  const resolveScan = async (raw: string): Promise<void> => {
    const code = raw.trim();
    if (code === "" || scanBusy) return;
    setScanBusy(true);
    setScanNotice(null);
    try {
      const page = await getCatalogProducts({ page: 1, pageSize: 5, q: code });
      const resolution = resolveScannedProduct(page.items, code);
      setScan("");
      if (resolution.kind === "existing") {
        setDetailId(resolution.productId);
        setScanNotice("Existing product found and opened.");
      } else {
        setCreateBarcode(code);
        setCreateOpen(true);
        setScanNotice("Not in the catalog — starting a new product with this barcode.");
      }
    } catch {
      setScanNotice("Barcode lookup failed. Try scanning again.");
    } finally {
      setScanBusy(false);
      scanRef.current?.focus();
    }
  };

  const productsError =
    products.error === null || products.data !== undefined
      ? null
      : toApiError(products.error);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {canCreate ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
            <input
              aria-label="Scan a barcode to find or add a product"
              className="min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:opacity-60"
              disabled={scanBusy}
              inputMode="numeric"
              onChange={(event) => setScan(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void resolveScan(scan);
                }
              }}
              placeholder="Scan a barcode, then Enter"
              ref={scanRef}
              value={scan}
            />
            <span className="text-xs text-ink-muted">
              {scanNotice ??
                "Scan to find an existing product, or start a new one with its barcode."}
            </span>
          </div>
        ) : (
          <span />
        )}
        {canCreate ? (
          <button
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={() => {
              setCreateBarcode(null);
              setCreateOpen(true);
            }}
            type="button"
          >
            <PlusIcon className="size-4" /> Add product
          </button>
        ) : null}
      </div>

      {savedProduct === null ? null : (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-control border border-positive/25 bg-positive-soft p-3 text-sm text-positive"
          role="status"
        >
          <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>{savedProduct}</strong> was saved and the catalog is
            refreshing.
          </p>
          <button
            aria-label="Dismiss product-saved message"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-control hover:bg-positive/10"
            onClick={() => setSavedProduct(null)}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}

      {statusError === null ? null : (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
          role="alert"
        >
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Product status was not changed</p>
            <p className="mt-0.5">
              {productStatusChangeMessage(statusError, statusWasActive)}
            </p>
            {statusError.requestId === undefined ? null : (
              <p className="mt-1 font-mono text-xs">
                Ref: {statusError.requestId}
              </p>
            )}
          </div>
          <button
            aria-label="Dismiss status-change error"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-control hover:bg-negative/10"
            onClick={() => setStatusError(null)}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}

      <section
        aria-label="Catalog search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <form
          className="flex gap-2"
          key={parameters.q ?? ""}
          onSubmit={search}
          role="search"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search product catalog</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
              defaultValue={parameters.q}
              maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
              name="q"
              placeholder="Search SKU, model, brand, category, alias, or barcode"
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
            Category
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              disabled={references.isPending}
              onChange={(event) =>
                replaceParameters({
                  categoryId: event.target.value || undefined,
                })
              }
              value={parameters.categoryId ?? ""}
            >
              <option value="">All categories</option>
              {references.data?.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Brand
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              disabled={references.isPending}
              onChange={(event) =>
                replaceParameters({ brandId: event.target.value || undefined })
              }
              value={parameters.brandId ?? ""}
            >
              <option value="">All brands</option>
              {references.data?.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Tracking
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                replaceParameters({
                  trackingType: event.target.value || undefined,
                })
              }
              value={parameters.trackingType ?? ""}
            >
              <option value="">All tracking types</option>
              {TRACKING_TYPES.map((trackingType) => (
                <option key={trackingType} value={trackingType}>
                  {titleCase(trackingType)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Status
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                replaceParameters({ active: event.target.value || undefined })
              }
              value={
                parameters.active === undefined ? "" : String(parameters.active)
              }
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </div>

        <details className="mt-3 border-t border-line-subtle pt-3">
          <summary className="w-fit text-xs font-semibold text-accent">
            More filters
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink-subtle">
              Condition
              <select
                className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
                onChange={(event) =>
                  replaceParameters({
                    condition: event.target.value || undefined,
                  })
                }
                value={parameters.condition ?? ""}
              >
                <option value="">All conditions</option>
                {PRODUCT_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {titleCase(condition)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-ink-subtle">
              PTA status
              <select
                className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
                onChange={(event) =>
                  replaceParameters({
                    ptaStatus: event.target.value || undefined,
                  })
                }
                value={parameters.ptaStatus ?? ""}
              >
                <option value="">All PTA statuses</option>
                {PTA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleCase(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        {hasFilters ? (
          <button
            className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong"
            onClick={clearFilters}
            type="button"
          >
            Clear search and filters
          </button>
        ) : null}
      </section>

      {products.isPending ? <CatalogTableSkeleton /> : null}

      {productsError === null ? null : (
        <CatalogErrorState
          {...catalogReadErrorCopy(productsError)}
          {...(productsError.requestId === undefined
            ? {}
            : { requestId: productsError.requestId })}
          onRetry={() => {
            void products.refetch();
          }}
        />
      )}

      {products.data === undefined ? null : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3.5 sm:px-[1.125rem]">
            <h2 className="text-[0.90625rem] font-semibold text-ink">
              Catalog variants
            </h2>
            <span className="text-xs text-ink-muted">
              {products.data.total.toLocaleString()} total
            </span>
            {products.isFetching ? (
              <span
                className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-muted"
                role="status"
              >
                <span className="size-3 animate-spin rounded-full border-2 border-line border-t-accent" />
                Updating
              </span>
            ) : null}
          </div>

          {products.data.items.length === 0 && !hasFilters ? (
            <CatalogEmptyState
              description="This organization has no catalog variants. Products appear here only after the API persists them."
              title="No products yet"
              {...(canCreate
                ? {
                    action: (
                      <button
                        className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                        onClick={() => setCreateOpen(true)}
                        type="button"
                      >
                        <PlusIcon className="size-4" /> Add first product
                      </button>
                    ),
                  }
                : {
                    action: (
                      <p className="text-xs font-semibold text-ink-subtle">
                        A catalog editor can create the first product.
                      </p>
                    ),
                  })}
            />
          ) : products.data.items.length === 0 ? (
            <CatalogNoResultsState onClear={clearFilters} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[74rem] border-collapse text-left text-[0.8125rem]">
                  <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-[0.04em] text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Product
                      </th>
                      <th className="px-3 py-2.5 font-semibold">SKU</th>
                      <th className="px-3 py-2.5 font-semibold">Category</th>
                      <th className="px-3 py-2.5 font-semibold">Tracking</th>
                      <th className="px-3 py-2.5 font-semibold">Condition</th>
                      <th className="px-3 py-2.5 font-semibold">PTA</th>
                      <th className="px-3 py-2.5 font-semibold">Warranty</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-right font-semibold sm:px-[1.125rem]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.data.items.map((product) => (
                      <tr
                        className="border-t border-line-subtle"
                        key={product.id}
                      >
                        <td className="px-4 py-3.5 sm:px-[1.125rem]">
                          <button
                            aria-haspopup="dialog"
                            className="rounded-control text-left font-semibold text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            onClick={() => setDetailId(product.id)}
                            type="button"
                          >
                            {product.productModel.brand.name}{" "}
                            {product.productModel.name}
                          </button>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {product.name}
                          </p>
                          <p className="mt-1 text-[0.6875rem] text-ink-muted">
                            {productAttributes(product)}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 font-mono text-xs font-semibold text-ink-subtle">
                          {product.sku}
                        </td>
                        <td className="px-3 py-3.5 text-ink-subtle">
                          {product.productModel.category.name}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-ink">
                            {titleCase(product.trackingType)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-ink-subtle">
                          {titleCase(product.condition)}
                        </td>
                        <td className="px-3 py-3.5 text-ink-subtle">
                          {titleCase(product.ptaStatus)}
                        </td>
                        <td className="px-3 py-3.5 text-ink-subtle">
                          {titleCase(product.warrantyType)}
                          {product.warrantyMonths === null
                            ? ""
                            : ` · ${product.warrantyMonths} mo`}
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              product.isActive
                                ? "bg-positive-soft text-positive"
                                : "bg-surface-subtle text-ink-muted"
                            }`}
                          >
                            {product.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 sm:px-[1.125rem]">
                          <ProductRowActions
                            busy={busyRowId === product.id}
                            canDeactivate={canDeactivate}
                            canUpdate={canUpdate}
                            onEdit={setEditId}
                            onToggleActive={(target) => {
                              void toggleActive(target);
                            }}
                            onView={setDetailId}
                            product={product}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="flex flex-wrap items-center gap-3 border-t border-line-subtle px-4 py-3 sm:px-[1.125rem]">
                <p className="text-xs text-ink-muted">
                  Showing{" "}
                  {(products.data.page - 1) * products.data.pageSize + 1}–
                  {Math.min(
                    products.data.page * products.data.pageSize,
                    products.data.total,
                  )}{" "}
                  of {products.data.total}
                </p>
                <div className="ml-auto flex gap-2">
                  <button
                    className="min-h-8 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={products.data.page <= 1 || products.isFetching}
                    onClick={() =>
                      replaceParameters(
                        { page: String(products.data.page - 1) },
                        false,
                      )
                    }
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="inline-flex min-h-8 items-center px-1 text-xs font-semibold text-ink-subtle">
                    Page {products.data.page} of{" "}
                    {Math.max(products.data.totalPages, 1)}
                  </span>
                  <button
                    className="min-h-8 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={
                      products.data.page >= products.data.totalPages ||
                      products.isFetching
                    }
                    onClick={() =>
                      replaceParameters(
                        { page: String(products.data.page + 1) },
                        false,
                      )
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      )}

      {detailId === null ? null : (
        <ProductDetailDrawer
          canManagePricing={canManagePricing}
          canUpdate={canUpdate}
          canView
          canViewPricing={canViewPricing}
          onClose={() => setDetailId(null)}
          onEdit={(id) => {
            setDetailId(null);
            setEditId(id);
          }}
          productId={detailId}
        />
      )}

      {createOpen && references.data !== undefined ? (
        <ProductFormDrawer
          canCreateReferences={canCreate}
          mode="create"
          {...(createBarcode === null
            ? {}
            : { initialBarcode: createBarcode })}
          onClose={() => {
            setCreateOpen(false);
            setCreateBarcode(null);
          }}
          onSaved={(product) => {
            setCreateOpen(false);
            setCreateBarcode(null);
            setSavedProduct(product.name);
            invalidateProducts();
          }}
          references={references.data}
        />
      ) : null}

      {editId !== null && references.data !== undefined ? (
        <ProductFormDrawer
          canCreateReferences={canCreate}
          mode="edit"
          onClose={() => setEditId(null)}
          onSaved={(product) => {
            setEditId(null);
            setSavedProduct(product.name);
            invalidateProducts();
          }}
          productId={editId}
          references={references.data}
        />
      ) : null}

      {(createOpen || editId !== null) && references.data === undefined ? (
        <ReferenceGateDrawer
          error={
            references.error === null ? null : toApiError(references.error)
          }
          onClose={() => {
            setCreateOpen(false);
            setEditId(null);
          }}
          onRetry={() => {
            void references.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function ReferenceGateDrawer({
  error,
  onClose,
  onRetry,
}: {
  readonly error: ApiError | null;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="reference-gate-title"
        aria-modal="true"
        className="flex h-full w-full max-w-xl flex-col bg-surface p-6 shadow-overlay"
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <BoxIcon className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-ink" id="reference-gate-title">
              Preparing product form
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              The form uses real active category, brand, and model records.
            </p>
          </div>
          <button
            aria-label="Close product form"
            autoFocus
            className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="mt-8">
          {error === null ? (
            <div
              className="flex items-center gap-3 text-sm text-ink-subtle"
              role="status"
            >
              <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
              Loading catalog references…
            </div>
          ) : (
            <CatalogErrorState
              {...catalogReadErrorCopy(error)}
              {...(error.requestId === undefined
                ? {}
                : { requestId: error.requestId })}
              onRetry={onRetry}
            />
          )}
        </div>
      </section>
    </div>
  );
}

export function ProductCatalogPage(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useQuery(currentAuthQueryOptions);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const permissions = auth.data?.permissions;
  const canView = permissions?.includes(PERMISSIONS.CATALOG_VIEW) === true;
  const canCreate = permissions?.includes(PERMISSIONS.CATALOG_CREATE) === true;
  const canUpdate = permissions?.includes(PERMISSIONS.CATALOG_UPDATE) === true;
  const canDeactivate =
    permissions?.includes(PERMISSIONS.CATALOG_DEACTIVATE) === true;
  const canViewPricing =
    permissions?.includes(PERMISSIONS.PRICING_VIEW) === true;
  const canManagePricing =
    permissions?.includes(PERMISSIONS.PRICING_MANAGE) === true;

  const activeTab = catalogTabFrom(
    new URLSearchParams(searchParams.toString()),
  );

  const selectTab = (tab: CatalogTabId): void => {
    const query = catalogTabQuery(
      new URLSearchParams(searchParams.toString()),
      tab,
    );
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  const onTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    const nextIndex = nextCatalogTabIndex(
      index,
      event.key,
      CATALOG_TABS.length,
    );
    if (nextIndex === null) return;
    const nextTab = CATALOG_TABS[nextIndex];
    if (nextTab === undefined) return;
    event.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    selectTab(nextTab.id);
  };

  if (auth.data !== undefined && !canView) {
    return (
      <CatalogForbiddenState
        description="This route requires the server-provided catalog.view permission. No catalog request was sent."
        title="Catalog access required"
      />
    );
  }

  return (
    <div>
      <header className="mb-5">
        <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-accent">
          Catalog · Product identity
        </p>
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.01em] text-ink">
          Product catalog
        </h1>
        <p className="mt-1 max-w-3xl text-[0.84375rem] text-ink-muted">
          Define and find sellable variants by model, SKU, category, brand,
          alias, or barcode. A catalog product is not physical inventory.
        </p>
      </header>

      <div className="mb-4 flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-[0.8125rem] text-info">
        <ShieldCheckIcon className="mt-0.5 size-[1.125rem] shrink-0" />
        <p>
          Catalog identity stays separate from operations. Open Stock for real
          quantities and device identifiers; open a product’s View drawer for
          its live Pricing. Supplier cost remains in permissioned purchasing
          workflows.
        </p>
      </div>

      <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          aria-label="Product catalog sections"
          className="flex w-max min-w-full gap-1 border-b border-line"
          role="tablist"
        >
          {CATALOG_TABS.map((tab, index) => (
            <button
              aria-controls={`catalog-panel-${tab.id}`}
              aria-selected={tab.id === activeTab}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                tab.id === activeTab
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-muted hover:border-line hover:text-ink"
              }`}
              id={`catalog-tab-${tab.id}`}
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              tabIndex={tab.id === activeTab ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        aria-labelledby={`catalog-tab-${activeTab}`}
        id={`catalog-panel-${activeTab}`}
        role="tabpanel"
      >
        {auth.data === undefined ? (
          <CatalogTableSkeleton />
        ) : activeTab === "products" ? (
          <ProductsTab
            canCreate={canCreate}
            canDeactivate={canDeactivate}
            canManagePricing={canManagePricing}
            canUpdate={canUpdate}
            canViewPricing={canViewPricing}
          />
        ) : activeTab === "categories" ? (
          <CategoriesTab />
        ) : activeTab === "brands" ? (
          <BrandsTab />
        ) : (
          <ProductModelsTab />
        )}
      </div>
    </div>
  );
}
