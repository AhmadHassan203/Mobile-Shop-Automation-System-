"use client";

import type { CategoryReference } from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { CategoryFormDrawer } from "./category-form-drawer";
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
  CATEGORY_PARAMETER_NAMES,
  applyParameterUpdates,
  categoryListParametersFrom,
  clearFilterUpdates,
  hasReferenceFilters,
  referenceCapabilities,
  referenceErrorMessage,
  runReferenceTransition,
} from "./reference-tab-state";
import { PlusIcon } from "@/components/ui/icons";
import {
  activateCatalogCategory,
  deactivateCatalogCategory,
} from "@/lib/api/catalog";
import { toApiError, type ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  catalogCategoriesQueryOptions,
  catalogReferencesQueryOptions,
} from "@/lib/query/catalog-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * Category management: the tree products are filed under.
 *
 * Shares the `/inventory` route with the brand, model and product tabs, so it
 * reads and writes only its own `c*` search parameters.
 */
export function CategoriesTab(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CategoryReference | null>(null);
  const [transitionError, setTransitionError] = useState<ApiError | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = referenceCapabilities(auth.data?.permissions);
  const parameters = categoryListParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const categories = useQuery(
    catalogCategoriesQueryOptions(parameters, capabilities.canView),
  );
  // Also the source for resolving a row's parent name.
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
        CATEGORY_PARAMETER_NAMES.page,
        resetPage,
      );
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
    },
    [pathname, router, searchParams],
  );

  /**
   * A category rename reaches the product filters, the Add Product drawer and
   * the denormalized names on product rows, so all three are refreshed.
   */
  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogCategoriesRoot,
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
    replaceParameters(clearFilterUpdates(CATEGORY_PARAMETER_NAMES));
  }, [replaceParameters]);

  const toggleActive = async (row: CategoryReference): Promise<void> => {
    setTransitionError(null);
    setPendingId(row.id);
    try {
      const saved = await runReferenceTransition(row, capabilities, {
        activate: activateCatalogCategory,
        deactivate: deactivateCatalogCategory,
      });
      if (saved !== null) refresh();
    } catch (error) {
      setTransitionError(toApiError(error));
    } finally {
      setPendingId(null);
    }
  };

  const categoryNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const option of references.data?.categories ?? []) {
      names.set(option.id, option.name);
    }
    for (const option of categories.data?.items ?? []) {
      names.set(option.id, option.name);
    }
    return names;
  }, [references.data, categories.data]);

  const parentLabel = (category: CategoryReference): ReactNode => {
    if (category.parentCategoryId === null) {
      return <span className="text-ink-muted">Top level</span>;
    }
    const name = categoryNames.get(category.parentCategoryId);
    return (
      name ?? <span className="text-ink-muted">Not in the active list</span>
    );
  };

  if (auth.data !== undefined && !capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing categories requires the server-provided catalog.view permission. No category request was sent."
        title="Catalog access required"
      />
    );
  }

  const listError =
    categories.error !== null && categories.data === undefined
      ? toApiError(categories.error)
      : null;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">Categories</h2>
          <p className="mt-1 max-w-2xl text-[0.84375rem] text-ink-muted">
            Group models by what they are. A category can sit under a parent to
            form a tree.
          </p>
        </div>
        {capabilities.canCreate ? (
          <button
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={() => setCreating(true)}
            type="button"
          >
            <PlusIcon className="size-4" /> New category
          </button>
        ) : null}
      </header>

      {transitionError === null ? null : (
        <ReferenceErrorBanner
          message={referenceErrorMessage(transitionError, "category")}
          onDismiss={() => setTransitionError(null)}
          requestId={transitionError.requestId}
          title="Category status was not changed"
        />
      )}

      <section
        aria-label="Category search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <ReferenceSearchForm
          defaultValue={parameters.q}
          key={parameters.q ?? ""}
          label="Search categories"
          onSearch={(value) =>
            replaceParameters({ [CATEGORY_PARAMETER_NAMES.q]: value })
          }
          placeholder="Search category name"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ReferenceStatusFilter
            onChange={(value) =>
              replaceParameters({ [CATEGORY_PARAMETER_NAMES.active]: value })
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

      {categories.isPending ? <CatalogTableSkeleton /> : null}

      {listError === null ? null : (
        <CatalogErrorState
          description="The API did not return a valid category page. No fallback or mock records are shown."
          onRetry={() => {
            void categories.refetch();
          }}
          title="Categories could not be loaded"
          {...(listError.requestId === undefined
            ? {}
            : { requestId: listError.requestId })}
        />
      )}

      {categories.data === undefined ? null : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <ReferenceTableHeader
            fetching={categories.isFetching}
            title="Categories"
            total={categories.data.total}
          />

          {categories.data.items.length === 0 && !hasFilters ? (
            <CatalogEmptyState
              action={
                capabilities.canCreate ? (
                  <button
                    aria-haspopup="dialog"
                    className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                    onClick={() => setCreating(true)}
                    type="button"
                  >
                    <PlusIcon className="size-4" /> Add first category
                  </button>
                ) : (
                  <p className="text-xs font-semibold text-ink-subtle">
                    A catalog editor can create the first category.
                  </p>
                )
              }
              description="This organization has no categories. They appear here only after the API persists them."
              title="No categories yet"
            />
          ) : categories.data.items.length === 0 ? (
            <CatalogNoResultsState onClear={clearFilters} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] border-collapse text-left text-[0.8125rem]">
                  <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-[0.04em] text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Name
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Parent category
                      </th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold sm:px-[1.125rem]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.data.items.map((category) => {
                      const canToggle = category.isActive
                        ? capabilities.canDeactivate
                        : capabilities.canUpdate;
                      const busy = pendingId === category.id;
                      return (
                        <tr
                          className="border-t border-line-subtle"
                          key={category.id}
                        >
                          <td className="px-4 py-3.5 font-semibold text-ink sm:px-[1.125rem]">
                            {category.name}
                          </td>
                          <td className="px-3 py-3.5 text-ink-subtle">
                            {parentLabel(category)}
                          </td>
                          <td className="px-3 py-3.5">
                            <ReferenceStatusPill isActive={category.isActive} />
                          </td>
                          <td className="px-4 py-3.5 sm:px-[1.125rem]">
                            <div className="flex flex-wrap gap-2">
                              {capabilities.canUpdate ? (
                                <button
                                  aria-haspopup="dialog"
                                  aria-label={`Edit ${category.name}`}
                                  className={rowActionClass}
                                  disabled={busy}
                                  onClick={() => setEditing(category)}
                                  type="button"
                                >
                                  Edit
                                </button>
                              ) : null}
                              {canToggle ? (
                                <button
                                  aria-label={`${category.isActive ? "Deactivate" : "Reactivate"} ${category.name}`}
                                  className={rowActionClass}
                                  disabled={busy}
                                  onClick={() => {
                                    void toggleActive(category);
                                  }}
                                  type="button"
                                >
                                  {category.isActive
                                    ? "Deactivate"
                                    : "Reactivate"}
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
                busy={categories.isFetching}
                onNext={() =>
                  replaceParameters(
                    {
                      [CATEGORY_PARAMETER_NAMES.page]: String(
                        categories.data.page + 1,
                      ),
                    },
                    false,
                  )
                }
                onPrevious={() =>
                  replaceParameters(
                    {
                      [CATEGORY_PARAMETER_NAMES.page]: String(
                        categories.data.page - 1,
                      ),
                    },
                    false,
                  )
                }
                page={categories.data.page}
                pageSize={categories.data.pageSize}
                total={categories.data.total}
                totalPages={categories.data.totalPages}
              />
            </>
          )}
        </section>
      )}

      {creating ? (
        <CategoryFormDrawer
          mode="create"
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      ) : null}
      {editing === null ? null : (
        <CategoryFormDrawer
          category={editing}
          mode="edit"
          onClose={closeDrawer}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
