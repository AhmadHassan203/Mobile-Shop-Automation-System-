"use client";

import { PURCHASE_ORDER_STATUSES } from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type JSX } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogNoResultsState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { BoxIcon, EyeIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { queryKeys } from "@/lib/query/keys";
import {
  purchaseOrdersQueryOptions,
  suppliersQueryOptions,
} from "@/lib/query/purchasing-query";
import { PurchaseOrderDetailDrawer } from "./purchase-order-detail-drawer";
import { PurchaseOrderFormDrawer } from "./purchase-order-form-drawer";
import {
  PageControls,
  StatusBadge,
  controlClass,
  dateText,
  moneyText,
  primaryButtonClass,
  rowActionClass,
  secondaryButtonClass,
} from "./purchasing-parts";
import {
  applyPurchasingUpdates,
  asPurchasingError,
  orderParametersFrom,
  purchasingCapabilities,
  titleCase,
} from "./purchasing-state";
import { ReceiptDetailDrawer } from "./receipt-detail-drawer";
import { ReceivingDrawer } from "./receiving-drawer";

export interface PurchaseOrdersTabProps {
  readonly canViewSuppliers: boolean;
}

export function PurchaseOrdersTab({
  canViewSuppliers,
}: PurchaseOrdersTabProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = purchasingCapabilities(auth.data?.permissions);
  const parameters = orderParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const orders = useQuery(
    purchaseOrdersQueryOptions(parameters, capabilities.canViewPurchases),
  );
  const suppliers = useQuery(
    suppliersQueryOptions(
      { page: 1, pageSize: 100 },
      canViewSuppliers && capabilities.canViewPurchases,
    ),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [postedReceiptId, setPostedReceiptId] = useState<string | null>(null);

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
        "opage",
        resetPage,
      ),
    );
  };

  const clear = (): void => {
    update({
      oq: undefined,
      ostatus: undefined,
      osupplier: undefined,
      ofrom: undefined,
      oto: undefined,
      opage: undefined,
    });
  };

  const hasFilters =
    parameters.q !== undefined ||
    parameters.status !== undefined ||
    parameters.supplierId !== undefined ||
    parameters.from !== undefined ||
    parameters.to !== undefined;
  const readError =
    orders.error === null ? null : asPurchasingError(orders.error);

  const invalidateOrders = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.purchasingOrdersRoot,
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"
          key={searchParams.toString()}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            update({
              oq: String(form.get("oq") ?? "").trim() || undefined,
              ostatus: String(form.get("ostatus") ?? "") || undefined,
              osupplier: String(form.get("osupplier") ?? "") || undefined,
              ofrom: String(form.get("ofrom") ?? "") || undefined,
              oto: String(form.get("oto") ?? "") || undefined,
            });
          }}
        >
          <label className="text-xs font-semibold text-ink-subtle md:col-span-2">
            Search orders
            <span className="relative mt-1.5 block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                className={`${controlClass} pl-9`}
                defaultValue={parameters.q ?? ""}
                name="oq"
                placeholder="PO number, supplier code, name, or invoice reference"
              />
            </span>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Status
            <select
              className={`${controlClass} mt-1.5`}
              defaultValue={parameters.status ?? ""}
              name="ostatus"
            >
              <option value="">All statuses</option>
              {PURCHASE_ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </label>
          {canViewSuppliers ? (
            <label className="text-xs font-semibold text-ink-subtle">
              Supplier
              <select
                className={`${controlClass} mt-1.5`}
                defaultValue={parameters.supplierId ?? ""}
                disabled={suppliers.data === undefined}
                name="osupplier"
              >
                <option value="">All suppliers</option>
                {(suppliers.data?.items ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.code} - {supplier.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-xs font-semibold text-ink-subtle">
            From order date
            <input
              className={`${controlClass} mt-1.5`}
              defaultValue={parameters.from ?? ""}
              name="ofrom"
              type="date"
            />
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            To order date
            <input
              className={`${controlClass} mt-1.5`}
              defaultValue={parameters.to ?? ""}
              name="oto"
              type="date"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-6">
            <button className={secondaryButtonClass} type="submit">
              Apply filters
            </button>
            {hasFilters ? (
              <button className={rowActionClass} onClick={clear} type="button">
                Clear
              </button>
            ) : null}
            {capabilities.canEditPurchaseDrafts ? (
              <button
                className={`${primaryButtonClass} ml-auto`}
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                <PlusIcon className="size-4" /> New purchase order
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {orders.isPending ? (
        <CatalogTableSkeleton rows={7} />
      ) : orders.error !== null && orders.data === undefined ? (
        <CatalogErrorState
          description="No fallback or example orders are shown. Retry the real purchasing API request."
          onRetry={() => void orders.refetch()}
          title="Purchase orders could not be loaded"
          {...(readError?.requestId === undefined
            ? {}
            : { requestId: readError.requestId })}
        />
      ) : orders.data === undefined ? null : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {orders.data.total === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState onClear={clear} />
            ) : (
              <CatalogEmptyState
                action={
                  capabilities.canEditPurchaseDrafts ? (
                    <button
                      className={primaryButtonClass}
                      onClick={() => setCreateOpen(true)}
                      type="button"
                    >
                      <PlusIcon className="size-4" /> Create first draft
                    </button>
                  ) : undefined
                }
                description="Create a supplier-backed draft to begin purchasing. Drafts do not change stock or payables."
                icon={<BoxIcon className="size-6" />}
                title="No purchase orders yet"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] text-left">
                <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3 text-right">Progress</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {orders.data.items.map((item) => (
                    <tr className="hover:bg-surface-subtle/65" key={item.id}>
                      <td className="px-4 py-3.5">
                        <button
                          className="font-mono text-sm font-bold text-accent hover:underline"
                          onClick={() => setDetailId(item.id)}
                          type="button"
                        >
                          {item.number}
                        </button>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {item.totalUnits.toLocaleString("en-PK")} units
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-ink">
                          {item.supplier.name}
                        </p>
                        <p className="font-mono text-xs text-ink-muted">
                          {item.supplier.code}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge value={item.status} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-ink-subtle">
                        <p>{dateText(item.orderDate)}</p>
                        <p className="mt-0.5 text-ink-muted">
                          Expected {dateText(item.expectedOn)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-ink">
                        {item.receivedUnits.toLocaleString("en-PK")} /{" "}
                        {item.totalUnits.toLocaleString("en-PK")}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-ink">
                        {moneyText(item.totalMinor)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end">
                          <button
                            className={rowActionClass}
                            onClick={() => setDetailId(item.id)}
                            type="button"
                          >
                            <EyeIcon className="size-3.5" /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PageControls
            onPage={(page) => update({ opage: String(page) }, false)}
            page={orders.data.page}
            total={orders.data.total}
            totalPages={orders.data.totalPages}
          />
        </section>
      )}

      {createOpen && capabilities.canEditPurchaseDrafts ? (
        <PurchaseOrderFormDrawer
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={(saved) => {
            setCreateOpen(false);
            setDetailId(saved.id);
            void invalidateOrders();
          }}
        />
      ) : null}
      {editId === null || !capabilities.canEditPurchaseDrafts ? null : (
        <PurchaseOrderFormDrawer
          mode="edit"
          onClose={() => setEditId(null)}
          onSaved={(saved) => {
            queryClient.setQueryData(
              queryKeys.purchasingOrder(saved.id),
              saved,
            );
            setEditId(null);
            setDetailId(saved.id);
            void invalidateOrders();
          }}
          orderId={editId}
        />
      )}
      {detailId === null ? null : (
        <PurchaseOrderDetailDrawer
          canApprove={capabilities.canApprovePurchases}
          canEdit={capabilities.canEditPurchaseDrafts}
          canOrder={capabilities.canCreatePurchases}
          canReceive={
            capabilities.canReceivePurchases && capabilities.canViewInventory
          }
          onChanged={(saved) => {
            queryClient.setQueryData(
              queryKeys.purchasingOrder(saved.id),
              saved,
            );
            void invalidateOrders();
          }}
          onClose={() => setDetailId(null)}
          onEdit={(id) => {
            setDetailId(null);
            setEditId(id);
          }}
          onReceive={(id) => {
            setDetailId(null);
            setReceivingId(id);
          }}
          orderId={detailId}
        />
      )}
      {receivingId === null ? null : (
        <ReceivingDrawer
          onClose={() => setReceivingId(null)}
          onPosted={(receipt) => {
            setReceivingId(null);
            setPostedReceiptId(receipt.id);
            void invalidateOrders();
          }}
          orderId={receivingId}
        />
      )}
      {postedReceiptId === null ? null : (
        <ReceiptDetailDrawer
          onClose={() => setPostedReceiptId(null)}
          receiptId={postedReceiptId}
        />
      )}
    </div>
  );
}
