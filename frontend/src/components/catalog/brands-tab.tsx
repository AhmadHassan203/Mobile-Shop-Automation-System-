"use client";

import type { BrandReference } from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type JSX } from "react";
import { BrandFormDrawer } from "./brand-form-drawer";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogNoResultsState,
  CatalogTableSkeleton,
} from "./catalog-states";
import {
  ReferenceErrorBanner,
  ReferencePaginationFooter,
  ReferenceSearchForm,
  ReferenceStatusFilter,
  ReferenceStatusPill,
  ReferenceTableHeader,
  rowActionClass,
} from "./reference-tab-parts";
import {
  BRAND_PARAMETER_NAMES,
  applyParameterUpdates,
  brandListParametersFrom,
  clearFilterUpdates,
  hasReferenceFilters,
  referenceCapabilities,
  referenceErrorMessage,
  runReferenceTransition,
} from "./reference-tab-state";
import { PlusIcon } from "@/components/ui/icons";
import {
  activateCatalogBrand,
  deactivateCatalogBrand,
} from "@/lib/api/catalog";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { catalogBrandsQueryOptions } from "@/lib/query/catalog-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * Brand management. Shares the `/inventory` route with the other catalog tabs,
 * so it reads and writes only its own `b*` search parameters.
 */
export function BrandsTab(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BrandReference | null>(null);
  const [transitionError, setTransitionError] = useState<ApiError | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = referenceCapabilities(auth.data?.permissions);
  const parameters = brandListParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const brands = useQuery(
    catalogBrandsQueryOptions(parameters, capabilities.canView),
  );
  const hasFilters = hasReferenceFilters(parameters);

  const replaceParameters = useCallback(
    (
      updates: Readonly<Record<string, string | undefined>>,
      resetPage = true,
    ): void => {
      const query = applyParameterUpdates(
        new URLSearchParams(searchParams.toString()),
        updates,
        BRAND_PARAMETER_NAMES.page,
        resetPage,
      );
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
    },
    [pathname, router, searchParams],
  );

  /**
   * A brand rename reaches the product filters, the Add Product drawer and the
   * denormalized brand names on model and product rows.
   */
  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogBrandsRoot,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogModelsRoot,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogReferences,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogProductsRoot,
    });
  }, [queryClient]);

  const closeDrawer = useCallback((): void => {
    setCreating(false);
    setEditing(null);
  }, []);

  const handleSaved = useCallback((): void => {
    setCreating(false);
    setEditing(null);
    refresh();
  }, [refresh]);

  const clearFilters = useCallback((): void => {
    replaceParameters(clearFilterUpdates(BRAND_PARAMETER_NAMES));
  }, [replaceParameters]);

  const toggleActive = async (row: BrandReference): Promise<void> => {
    setTransitionError(null);
    setPendingId(row.id);
    try {
      const saved = await runReferenceTransition(row, capabilities, {
        activate: activateCatalogBrand,
        deactivate: deactivateCatalogBrand,
      });
      if (saved !== null) refresh();
    } catch (error) {
      setTransitionError(toApiError(error));
    } finally {
      setPendingId(null);
    }
  };

  if (auth.data !== undefined && !capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing brands requires the server-provided catalog.view permission. No brand request was sent."
        title="Catalog access required"
      />
    );
  }

  const listError =
    brands.error !== null && brands.data === undefined
      ? toApiError(brands.error)
      : null;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">Brands</h2>
          <p className="mt-1 max-w-2xl text-[0.84375rem] text-ink-muted">
            The manufacturers behind your models. A brand is catalog identity
            only.
          </p>
        </div>
        {capabilities.canCreate ? (
          <button
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={() => setCreating(true)}
            type="button"
          >
            <PlusIcon className="size-4" /> New brand
          </button>
        ) : null}
      </header>

      {transitionError === null ? null : (
        <ReferenceErrorBanner
          message={referenceErrorMessage(transitionError, "brand")}
          onDismiss={() => setTransitionError(null)}
          requestId={transitionError.requestId}
          title="Brand status was not changed"
        />
      )}

      <section
        aria-label="Brand search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <ReferenceSearchForm
          defaultValue={parameters.q}
          key={parameters.q ?? ""}
          label="Search brands"
          onSearch={(value) =>
            replaceParameters({ [BRAND_PARAMETER_NAMES.q]: value })
          }
          placeholder="Search brand name"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ReferenceStatusFilter
            onChange={(value) =>
              replaceParameters({ [BRAND_PARAMETER_NAMES.active]: value })
            }
            value={parameters.active}
          />
        </div>
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

      {brands.isPending ? <CatalogTableSkeleton /> : null}

      {listError === null ? null : (
        <CatalogErrorState
          description="The API did not return a valid brand page. No fallback or mock records are shown."
          onRetry={() => {
            void brands.refetch();
          }}
          title="Brands could not be loaded"
          {...(listError.requestId === undefined
            ? {}
            : { requestId: listError.requestId })}
        />
      )}

      {brands.data === undefined ? null : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <ReferenceTableHeader
            fetching={brands.isFetching}
            title="Brands"
            total={brands.data.total}
          />

          {brands.data.items.length === 0 && !hasFilters ? (
            <CatalogEmptyState
              action={
                capabilities.canCreate ? (
                  <button
                    aria-haspopup="dialog"
                    className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                    onClick={() => setCreating(true)}
                    type="button"
                  >
                    <PlusIcon className="size-4" /> Add first brand
                  </button>
                ) : (
                  <p className="text-xs font-semibold text-ink-subtle">
                    A catalog editor can create the first brand.
                  </p>
                )
              }
              description="This organization has no brands. They appear here only after the API persists them."
              title="No brands yet"
            />
          ) : brands.data.items.length === 0 ? (
            <CatalogNoResultsState onClear={clearFilters} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left text-[0.8125rem]">
                  <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-[0.04em] text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Name
                      </th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {brands.data.items.map((brand) => {
                      const canToggle = brand.isActive
                        ? capabilities.canDeactivate
                        : capabilities.canUpdate;
                      const busy = pendingId === brand.id;
                      return (
                        <tr
                          className="border-t border-line-subtle"
                          key={brand.id}
                        >
                          <td className="px-4 py-3.5 font-semibold text-ink sm:px-[1.125rem]">
                            {brand.name}
                          </td>
                          <td className="px-3 py-3.5">
                            <ReferenceStatusPill isActive={brand.isActive} />
                          </td>
                          <td className="px-4 py-3.5 sm:px-[1.125rem]">
                            <div className="flex flex-wrap gap-2">
                              {capabilities.canUpdate ? (
                                <button
                                  aria-haspopup="dialog"
                                  aria-label={`Edit ${brand.name}`}
                                  className={rowActionClass}
                                  disabled={busy}
                                  onClick={() => setEditing(brand)}
                                  type="button"
                                >
                                  Edit
                                </button>
                              ) : null}
                              {canToggle ? (
                                <button
                                  aria-label={`${brand.isActive ? "Deactivate" : "Reactivate"} ${brand.name}`}
                                  className={rowActionClass}
                                  disabled={busy}
                                  onClick={() => {
                                    void toggleActive(brand);
                                  }}
                                  type="button"
                                >
                                  {brand.isActive ? "Deactivate" : "Reactivate"}
                                </button>
                              ) : null}
                              {!capabilities.canUpdate && !canToggle ? (
                                <span className="text-xs text-ink-muted">
                                  View only
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ReferencePaginationFooter
                busy={brands.isFetching}
                onNext={() =>
                  replaceParameters(
                    {
                      [BRAND_PARAMETER_NAMES.page]: String(
                        brands.data.page + 1,
                      ),
                    },
                    false,
                  )
                }
                onPrevious={() =>
                  replaceParameters(
                    {
                      [BRAND_PARAMETER_NAMES.page]: String(
                        brands.data.page - 1,
                      ),
                    },
                    false,
                  )
                }
                page={brands.data.page}
                pageSize={brands.data.pageSize}
                total={brands.data.total}
                totalPages={brands.data.totalPages}
              />
            </>
          )}
        </section>
      )}

      {creating ? (
        <BrandFormDrawer
          mode="create"
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      ) : null}
      {editing === null ? null : (
        <BrandFormDrawer
          brand={editing}
          mode="edit"
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
