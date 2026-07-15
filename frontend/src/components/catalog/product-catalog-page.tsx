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
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AddProductDrawer } from "./add-product-drawer";
import {
  AlertTriangleIcon,
  BoxIcon,
  CheckCircleIcon,
  CloseIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import type { CatalogProduct, ProductListParameters } from "@/lib/api/catalog";
import { toApiError } from "@/lib/api/client";
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

function parametersFrom(searchParams: URLSearchParams): ProductListParameters {
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

function CatalogSkeleton() {
  return (
    <div
      aria-label="Loading product catalog"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading product catalog</span>
      <div className="h-20 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="h-12 animate-pulse border-b border-line-subtle bg-line-subtle/65" />
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-[4.5rem] animate-pulse border-b border-line-subtle bg-surface last:border-0"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

export function ProductCatalogRouteFallback() {
  return <CatalogSkeleton />;
}

function ReferenceStateDialog({
  failed,
  loading,
  onClose,
  onRetry,
}: {
  readonly failed: boolean;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}) {
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="reference-dialog-title"
        aria-modal="true"
        className="flex h-full w-full max-w-md flex-col bg-surface p-6 shadow-overlay"
        onKeyDown={keepFocusInside}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <BoxIcon className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-ink" id="reference-dialog-title">
              Preparing product form
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              The form uses real active category, brand, and model records.
            </p>
          </div>
          <button
            aria-label="Close add product"
            autoFocus
            className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="mt-8">
          {loading ? (
            <div
              className="flex items-center gap-3 text-sm text-ink-subtle"
              role="status"
            >
              <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
              Loading catalog references…
            </div>
          ) : null}
          {failed ? (
            <div
              className="rounded-control border border-negative/25 bg-negative-soft p-4 text-sm text-negative"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Reference data unavailable</p>
                  <p className="mt-1 text-xs">
                    The form cannot create a valid product until models load.
                  </p>
                </div>
              </div>
              <button
                className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control bg-negative px-3 text-xs font-semibold text-white"
                onClick={onRetry}
                type="button"
              >
                <RefreshIcon className="size-4" /> Retry
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
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

function EmptyCatalog({
  canCreate,
  onAdd,
}: {
  readonly canCreate: boolean;
  readonly onAdd: () => void;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <BoxIcon className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">No products yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
        This organization has no catalog variants. Products appear here only
        after the API persists them.
      </p>
      {canCreate ? (
        <button
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
          onClick={onAdd}
          type="button"
        >
          <PlusIcon className="size-4" /> Add first product
        </button>
      ) : (
        <p className="mt-4 text-xs font-semibold text-ink-subtle">
          A catalog editor can create the first product.
        </p>
      )}
    </div>
  );
}

export function ProductCatalogPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const auth = useQuery(currentAuthQueryOptions);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<string | null>(null);
  const canView =
    auth.data?.permissions.includes(PERMISSIONS.CATALOG_VIEW) === true;
  const canCreate =
    auth.data?.permissions.includes(PERMISSIONS.CATALOG_CREATE) === true;
  const parameters = parametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const products = useQuery({
    ...catalogProductsQueryOptions(parameters),
    enabled: canView,
  });
  const references = useQuery(catalogReferencesQueryOptions(canView));
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

  if (auth.data !== undefined && !canView) {
    return (
      <section
        className="rounded-card border border-warning/25 bg-warning-soft p-5 text-warning"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
          <div>
            <h1 className="text-base font-semibold">Catalog access required</h1>
            <p className="mt-1 text-sm">
              This route requires the server-provided catalog.view permission.
              No product request was sent.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
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
        </div>
        {canCreate ? (
          <button
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <PlusIcon className="size-4" /> Add product
          </button>
        ) : null}
      </header>

      {createdProduct === null ? null : (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-control border border-positive/25 bg-positive-soft p-3 text-sm text-positive"
          role="status"
        >
          <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>{createdProduct}</strong> was created and the catalog is
            refreshing.
          </p>
          <button
            aria-label="Dismiss product-created message"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-control hover:bg-positive/10"
            onClick={() => setCreatedProduct(null)}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}

      <div className="mb-4 flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-[0.8125rem] text-info">
        <ShieldCheckIcon className="mt-0.5 size-[1.125rem] shrink-0" />
        <p>
          This view contains catalog identity only. Stock quantities, IMEIs,
          supplier cost, and selling prices will appear only through their real
          inventory, purchasing, and pricing workflows.
        </p>
      </div>

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
            onClick={() => router.replace(pathname)}
            type="button"
          >
            Clear search and filters
          </button>
        ) : null}
      </section>

      {products.isPending ? <CatalogSkeleton /> : null}

      {products.error !== null && products.data === undefined ? (
        <section
          className="rounded-card border border-negative/25 bg-surface p-5 shadow-card"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
              <AlertTriangleIcon className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold text-ink">
                Catalog could not be loaded
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                The API did not return a valid product page. No fallback or mock
                products are shown.
              </p>
              {toApiError(products.error).requestId === undefined ? null : (
                <p className="mt-2 font-mono text-xs text-ink-muted">
                  Ref: {toApiError(products.error).requestId}
                </p>
              )}
              <button
                className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-xs font-semibold text-white hover:bg-accent-strong"
                onClick={() => {
                  void products.refetch();
                }}
                type="button"
              >
                <RefreshIcon className="size-4" /> Retry catalog
              </button>
            </div>
          </div>
        </section>
      ) : null}

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
            <EmptyCatalog
              canCreate={canCreate}
              onAdd={() => setDrawerOpen(true)}
            />
          ) : products.data.items.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <SearchIcon className="mx-auto size-9 text-ink-muted" />
              <h2 className="mt-3 text-base font-semibold text-ink">
                No matching products
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Try another search term or clear one of the filters.
              </p>
              <button
                className="mt-4 text-sm font-semibold text-accent hover:text-accent-strong"
                onClick={() => router.replace(pathname)}
                type="button"
              >
                Clear search and filters
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[66rem] border-collapse text-left text-[0.8125rem]">
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
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Status
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
                          <p className="font-semibold text-ink">
                            {product.productModel.brand.name}{" "}
                            {product.productModel.name}
                          </p>
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
                        <td className="px-4 py-3.5 sm:px-[1.125rem]">
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

      {drawerOpen && references.data !== undefined ? (
        <AddProductDrawer
          onClose={() => setDrawerOpen(false)}
          onCreated={(product) => {
            setDrawerOpen(false);
            setCreatedProduct(product.name);
            void queryClient.invalidateQueries({
              queryKey: queryKeys.catalogProductsRoot,
            });
          }}
          references={references.data}
        />
      ) : null}
      {drawerOpen && references.data === undefined ? (
        <ReferenceStateDialog
          failed={references.isError}
          loading={references.isPending || references.isFetching}
          onClose={() => setDrawerOpen(false)}
          onRetry={() => {
            void references.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
