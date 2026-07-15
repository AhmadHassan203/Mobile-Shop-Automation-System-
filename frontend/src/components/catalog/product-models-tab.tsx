"use client";

import type { ProductModelReference } from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type JSX } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogNoResultsState,
  CatalogTableSkeleton,
} from "./catalog-states";
import { ProductModelFormDrawer } from "./product-model-form-drawer";
import {
  ReferenceErrorBanner,
  ReferencePaginationFooter,
  ReferenceSearchForm,
  ReferenceSelectFilter,
  ReferenceStatusFilter,
  ReferenceStatusPill,
  ReferenceTableHeader,
  rowActionClass,
} from "./reference-tab-parts";
import {
  PRODUCT_MODEL_PARAMETER_NAMES,
  applyParameterUpdates,
  clearFilterUpdates,
  hasReferenceFilters,
  productModelListParametersFrom,
  referenceCapabilities,
  referenceErrorMessage,
  runReferenceTransition,
} from "./reference-tab-state";
import { PlusIcon } from "@/components/ui/icons";
import {
  activateCatalogProductModel,
  deactivateCatalogProductModel,
} from "@/lib/api/catalog";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  catalogProductModelsQueryOptions,
  catalogReferencesQueryOptions,
} from "@/lib/query/catalog-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * Product model management: the brand and category pairing products hang off.
 *
 * Shares the `/inventory` route with the other catalog tabs, so it reads and
 * writes only its own `m*` search parameters.
 */
export function ProductModelsTab(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProductModelReference | null>(null);
  const [transitionError, setTransitionError] = useState<ApiError | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = referenceCapabilities(auth.data?.permissions);
  const parameters = productModelListParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const models = useQuery(
    catalogProductModelsQueryOptions(parameters, capabilities.canView),
  );
  // Feeds the brand and category filter selects.
  const references = useQuery(
    catalogReferencesQueryOptions(capabilities.canView),
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
        PRODUCT_MODEL_PARAMETER_NAMES.page,
        resetPage,
      );
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
    },
    [pathname, router, searchParams],
  );

  /**
   * A model edit reaches the product filters, the Add Product drawer and the
   * denormalized model names on product rows.
   */
  const refresh = useCallback((): void => {
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
    replaceParameters(clearFilterUpdates(PRODUCT_MODEL_PARAMETER_NAMES));
  }, [replaceParameters]);

  const toggleActive = async (row: ProductModelReference): Promise<void> => {
    setTransitionError(null);
    setPendingId(row.id);
    try {
      const saved = await runReferenceTransition(row, capabilities, {
        activate: activateCatalogProductModel,
        deactivate: deactivateCatalogProductModel,
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
        description="Viewing product models requires the server-provided catalog.view permission. No model request was sent."
        title="Catalog access required"
      />
    );
  }

  const listError =
    models.error !== null && models.data === undefined
      ? toApiError(models.error)
      : null;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">Product models</h2>
          <p className="mt-1 max-w-2xl text-[0.84375rem] text-ink-muted">
            A model pairs a brand with a category. Products are the sellable
            variants of a model.
          </p>
        </div>
        {capabilities.canCreate ? (
          <button
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={() => setCreating(true)}
            type="button"
          >
            <PlusIcon className="size-4" /> New model
          </button>
        ) : null}
      </header>

      {transitionError === null ? null : (
        <ReferenceErrorBanner
          message={referenceErrorMessage(transitionError, "productModel")}
          onDismiss={() => setTransitionError(null)}
          requestId={transitionError.requestId}
          title="Model status was not changed"
        />
      )}

      <section
        aria-label="Product model search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <ReferenceSearchForm
          defaultValue={parameters.q}
          key={parameters.q ?? ""}
          label="Search product models"
          onSearch={(value) =>
            replaceParameters({ [PRODUCT_MODEL_PARAMETER_NAMES.q]: value })
          }
          placeholder="Search model, brand, or category"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ReferenceSelectFilter
            disabled={references.isPending}
            label="Brand"
            onChange={(value) =>
              replaceParameters({
                [PRODUCT_MODEL_PARAMETER_NAMES.brandId]: value,
              })
            }
            value={parameters.brandId ?? ""}
          >
            <option value="">All brands</option>
            {references.data?.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </ReferenceSelectFilter>
          <ReferenceSelectFilter
            disabled={references.isPending}
            label="Category"
            onChange={(value) =>
              replaceParameters({
                [PRODUCT_MODEL_PARAMETER_NAMES.categoryId]: value,
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
          </ReferenceSelectFilter>
          <ReferenceStatusFilter
            onChange={(value) =>
              replaceParameters({
                [PRODUCT_MODEL_PARAMETER_NAMES.active]: value,
              })
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

      {models.isPending ? <CatalogTableSkeleton /> : null}

      {listError === null ? null : (
        <CatalogErrorState
          description="The API did not return a valid product model page. No fallback or mock records are shown."
          onRetry={() => {
            void models.refetch();
          }}
          title="Product models could not be loaded"
          {...(listError.requestId === undefined
            ? {}
            : { requestId: listError.requestId })}
        />
      )}

      {models.data === undefined ? null : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <ReferenceTableHeader
            fetching={models.isFetching}
            title="Product models"
            total={models.data.total}
          />

          {models.data.items.length === 0 && !hasFilters ? (
            <CatalogEmptyState
              action={
                capabilities.canCreate ? (
                  <button
                    aria-haspopup="dialog"
                    className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                    onClick={() => setCreating(true)}
                    type="button"
                  >
                    <PlusIcon className="size-4" /> Add first model
                  </button>
                ) : (
                  <p className="text-xs font-semibold text-ink-subtle">
                    A catalog editor can create the first model.
                  </p>
                )
              }
              description="This organization has no product models. They appear here only after the API persists them."
              title="No product models yet"
            />
          ) : models.data.items.length === 0 ? (
            <CatalogNoResultsState onClear={clearFilters} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse text-left text-[0.8125rem]">
                  <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-[0.04em] text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Model
                      </th>
                      <th className="px-3 py-2.5 font-semibold">Brand</th>
                      <th className="px-3 py-2.5 font-semibold">Category</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.data.items.map((model) => {
                      const canToggle = model.isActive
                        ? capabilities.canDeactivate
                        : capabilities.canUpdate;
                      const busy = pendingId === model.id;
                      return (
                        <tr
                          className="border-t border-line-subtle"
                          key={model.id}
                        >
                          <td className="px-4 py-3.5 font-semibold text-ink sm:px-[1.125rem]">
                            {model.name}
                          </td>
                          <td className="px-3 py-3.5 text-ink-subtle">
                            {model.brandName}
                          </td>
                          <td className="px-3 py-3.5 text-ink-subtle">
                            {model.categoryName}
                          </td>
                          <td className="px-3 py-3.5">
                            <ReferenceStatusPill isActive={model.isActive} />
                          </td>
                          <td className="px-4 py-3.5 sm:px-[1.125rem]">
                            <div className="flex flex-wrap gap-2">
                              {capabilities.canUpdate ? (
                                <button
                                  aria-haspopup="dialog"
                                  aria-label={`Edit ${model.name}`}
                                  className={rowActionClass}
                                  disabled={busy}
                                  onClick={() => setEditing(model)}
                                  type="button"
                                >
                                  Edit
                                </button>
                              ) : null}
                              {canToggle ? (
                                <button
                                  aria-label={`${model.isActive ? "Deactivate" : "Reactivate"} ${model.name}`}
                                  className={rowActionClass}
                                  disabled={busy}
                                  onClick={() => {
                                    void toggleActive(model);
                                  }}
                                  type="button"
                                >
                                  {model.isActive ? "Deactivate" : "Reactivate"}
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
                busy={models.isFetching}
                onNext={() =>
                  replaceParameters(
                    {
                      [PRODUCT_MODEL_PARAMETER_NAMES.page]: String(
                        models.data.page + 1,
                      ),
                    },
                    false,
                  )
                }
                onPrevious={() =>
                  replaceParameters(
                    {
                      [PRODUCT_MODEL_PARAMETER_NAMES.page]: String(
                        models.data.page - 1,
                      ),
                    },
                    false,
                  )
                }
                page={models.data.page}
                pageSize={models.data.pageSize}
                total={models.data.total}
                totalPages={models.data.totalPages}
              />
            </>
          )}
        </section>
      )}

      {creating ? (
        <ProductModelFormDrawer
          mode="create"
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      ) : null}
      {editing === null ? null : (
        <ProductModelFormDrawer
          mode="edit"
          model={editing}
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
