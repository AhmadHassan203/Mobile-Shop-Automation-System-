"use client";

import type { SupplierSummary } from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type JSX } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogNoResultsState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { CheckCircleIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { setSupplierActive } from "@/lib/api/purchasing";
import type { ApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { queryKeys } from "@/lib/query/keys";
import { suppliersQueryOptions } from "@/lib/query/purchasing-query";
import {
  MutationErrorBanner,
  PageControls,
  StatusBadge,
  controlClass,
  primaryButtonClass,
  rowActionClass,
  secondaryButtonClass,
} from "./purchasing-parts";
import {
  applyPurchasingUpdates,
  asPurchasingError,
  purchasingCapabilities,
  supplierParametersFrom,
} from "./purchasing-state";
import { SupplierFormDrawer } from "./supplier-form-drawer";

export function SuppliersTab(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = purchasingCapabilities(auth.data?.permissions);
  const parameters = supplierParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const suppliers = useQuery(
    suppliersQueryOptions(parameters, capabilities.canViewSuppliers),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<ApiError | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const navigate = (query: string): void => {
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };
  const update = (
    updates: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void => {
    navigate(
      applyPurchasingUpdates(
        new URLSearchParams(searchParams.toString()),
        updates,
        "spage",
        resetPage,
      ),
    );
  };
  const clear = (): void => {
    update({ sq: undefined, sactive: undefined, spage: undefined });
  };
  const hasFilters =
    parameters.q !== undefined || parameters.active !== undefined;
  const readError =
    suppliers.error === null ? null : asPurchasingError(suppliers.error);

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.purchasingSuppliersRoot,
    });
  };

  const toggleActive = async (supplier: SupplierSummary): Promise<void> => {
    if (busyId !== null) return;
    setBusyId(supplier.id);
    setMutationError(null);
    setSavedName(null);
    try {
      const saved = await setSupplierActive(
        supplier.id,
        supplier.version,
        !supplier.isActive,
      );
      queryClient.setQueryData(queryKeys.purchasingSupplier(saved.id), saved);
      setSavedName(
        `${saved.name} was ${saved.isActive ? "activated" : "deactivated"}.`,
      );
      await refresh();
      setBusyId(null);
    } catch (error) {
      setMutationError(asPurchasingError(error));
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {mutationError === null ? null : (
        <MutationErrorBanner
          error={mutationError}
          title="Supplier status was not changed"
        />
      )}
      {savedName === null ? null : (
        <div
          className="flex items-center gap-2 rounded-control border border-positive/25 bg-positive-soft p-3 text-sm font-semibold text-positive"
          role="status"
        >
          <CheckCircleIcon className="size-4" /> {savedName}
        </div>
      )}

      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
          key={searchParams.toString()}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            update({
              sq: String(form.get("sq") ?? "").trim() || undefined,
              sactive: String(form.get("sactive") ?? "") || undefined,
            });
          }}
        >
          <label className="text-xs font-semibold text-ink-subtle">
            Search suppliers
            <span className="relative mt-1.5 block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                className={`${controlClass} pl-9`}
                defaultValue={parameters.q ?? ""}
                name="sq"
                placeholder="Code, name, contact, phone, or email"
              />
            </span>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Status
            <select
              className={`${controlClass} mt-1.5`}
              defaultValue={
                parameters.active === undefined ? "" : String(parameters.active)
              }
              name="sactive"
            >
              <option value="">All suppliers</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button className={secondaryButtonClass} type="submit">
              Apply
            </button>
            {hasFilters ? (
              <button className={rowActionClass} onClick={clear} type="button">
                Clear
              </button>
            ) : null}
            {capabilities.canManageSuppliers ? (
              <button
                className={primaryButtonClass}
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                <PlusIcon className="size-4" /> New supplier
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {suppliers.isPending ? (
        <CatalogTableSkeleton rows={7} />
      ) : suppliers.error !== null && suppliers.data === undefined ? (
        <CatalogErrorState
          description="No placeholder supplier directory is shown. Retry the real supplier API request."
          onRetry={() => void suppliers.refetch()}
          title="Suppliers could not be loaded"
          {...(readError?.requestId === undefined
            ? {}
            : { requestId: readError.requestId })}
        />
      ) : suppliers.data === undefined ? null : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {suppliers.data.total === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState onClear={clear} />
            ) : (
              <CatalogEmptyState
                action={
                  capabilities.canManageSuppliers ? (
                    <button
                      className={primaryButtonClass}
                      onClick={() => setCreateOpen(true)}
                      type="button"
                    >
                      <PlusIcon className="size-4" /> Create first supplier
                    </button>
                  ) : undefined
                }
                description="Suppliers hold ordering terms and contacts. Historical purchasing records retain their supplier even after deactivation."
                title="No suppliers yet"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] text-left">
                <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Primary contact</th>
                    <th className="px-4 py-3 text-right">Terms</th>
                    <th className="px-4 py-3 text-right">Lead time</th>
                    <th className="px-4 py-3 text-right">On-time rate</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {suppliers.data.items.map((supplier) => (
                    <tr
                      className="hover:bg-surface-subtle/65"
                      key={supplier.id}
                    >
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-ink">
                          {supplier.name}
                        </p>
                        <p className="font-mono text-xs text-ink-muted">
                          {supplier.code}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        {supplier.primaryContact === null ? (
                          <span className="text-xs text-ink-muted">
                            Not recorded
                          </span>
                        ) : (
                          <>
                            <p className="text-sm text-ink">
                              {supplier.primaryContact.name}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {supplier.primaryContact.phone ??
                                supplier.primaryContact.email ??
                                supplier.primaryContact.role ??
                                "No channel"}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-ink">
                        {supplier.paymentTermsDays} days
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-ink">
                        {supplier.leadTimeDays} days
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-ink">
                        {supplier.onTimeRateBasisPoints === null
                          ? "-"
                          : `${(supplier.onTimeRateBasisPoints / 100).toFixed(2)}%`}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge
                          value={supplier.isActive ? "active" : "inactive"}
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        {capabilities.canManageSuppliers ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              className={rowActionClass}
                              onClick={() => setEditId(supplier.id)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className={rowActionClass}
                              disabled={busyId !== null}
                              onClick={() => void toggleActive(supplier)}
                              type="button"
                            >
                              {busyId === supplier.id
                                ? "Working..."
                                : supplier.isActive
                                  ? "Deactivate"
                                  : "Activate"}
                            </button>
                          </div>
                        ) : (
                          <p className="text-right text-xs text-ink-muted">
                            View only
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PageControls
            onPage={(page) => update({ spage: String(page) }, false)}
            page={suppliers.data.page}
            total={suppliers.data.total}
            totalPages={suppliers.data.totalPages}
          />
        </section>
      )}

      {createOpen ? (
        <SupplierFormDrawer
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={(saved) => {
            queryClient.setQueryData(
              queryKeys.purchasingSupplier(saved.id),
              saved,
            );
            setSavedName(`${saved.name} was created.`);
            setCreateOpen(false);
            void refresh();
          }}
        />
      ) : null}
      {editId === null ? null : (
        <SupplierFormDrawer
          mode="edit"
          onClose={() => setEditId(null)}
          onSaved={(saved) => {
            queryClient.setQueryData(
              queryKeys.purchasingSupplier(saved.id),
              saved,
            );
            setSavedName(`${saved.name} was saved.`);
            setEditId(null);
            void refresh();
          }}
          supplierId={editId}
        />
      )}
    </div>
  );
}
