"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type JSX } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogNoResultsState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { EyeIcon, SearchIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  goodsReceiptsQueryOptions,
  suppliersQueryOptions,
} from "@/lib/query/purchasing-query";
import {
  PageControls,
  controlClass,
  dateText,
  moneyText,
  rowActionClass,
  secondaryButtonClass,
} from "./purchasing-parts";
import {
  applyPurchasingUpdates,
  asPurchasingError,
  purchasingCapabilities,
  receiptParametersFrom,
} from "./purchasing-state";
import { ReceiptDetailDrawer } from "./receipt-detail-drawer";

export interface ReceiptsTabProps {
  readonly canViewSuppliers: boolean;
}

export function ReceiptsTab({
  canViewSuppliers,
}: ReceiptsTabProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = purchasingCapabilities(auth.data?.permissions);
  const parameters = receiptParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const receipts = useQuery(
    goodsReceiptsQueryOptions(parameters, capabilities.canViewPurchases),
  );
  const suppliers = useQuery(
    suppliersQueryOptions(
      { page: 1, pageSize: 100 },
      canViewSuppliers && capabilities.canViewPurchases,
    ),
  );
  const [detailId, setDetailId] = useState<string | null>(null);

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
        "rpage",
        resetPage,
      ),
    );
  };
  const clear = (): void => {
    update({
      rq: undefined,
      rsupplier: undefined,
      rfrom: undefined,
      rto: undefined,
      rpage: undefined,
    });
  };
  const hasFilters =
    parameters.q !== undefined ||
    parameters.supplierId !== undefined ||
    parameters.from !== undefined ||
    parameters.to !== undefined;
  const readError =
    receipts.error === null ? null : asPurchasingError(receipts.error);

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          key={searchParams.toString()}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            update({
              rq: String(form.get("rq") ?? "").trim() || undefined,
              rsupplier: String(form.get("rsupplier") ?? "") || undefined,
              rfrom: String(form.get("rfrom") ?? "") || undefined,
              rto: String(form.get("rto") ?? "") || undefined,
            });
          }}
        >
          <label className="text-xs font-semibold text-ink-subtle md:col-span-2">
            Search receipts
            <span className="relative mt-1.5 block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                className={`${controlClass} pl-9`}
                defaultValue={parameters.q ?? ""}
                name="rq"
                placeholder="Receipt, PO, supplier, or invoice reference"
              />
            </span>
          </label>
          {canViewSuppliers ? (
            <label className="text-xs font-semibold text-ink-subtle">
              Supplier
              <select
                className={`${controlClass} mt-1.5`}
                defaultValue={parameters.supplierId ?? ""}
                disabled={suppliers.data === undefined}
                name="rsupplier"
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
            Received from
            <input
              className={`${controlClass} mt-1.5`}
              defaultValue={parameters.from ?? ""}
              name="rfrom"
              type="date"
            />
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Received to
            <input
              className={`${controlClass} mt-1.5`}
              defaultValue={parameters.to ?? ""}
              name="rto"
              type="date"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-5">
            <button className={secondaryButtonClass} type="submit">
              Apply filters
            </button>
            {hasFilters ? (
              <button className={rowActionClass} onClick={clear} type="button">
                Clear
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {receipts.isPending ? (
        <CatalogTableSkeleton rows={7} />
      ) : receipts.error !== null && receipts.data === undefined ? (
        <CatalogErrorState
          description="No mock receipt history is shown. Retry the real purchasing API request."
          onRetry={() => void receipts.refetch()}
          title="Goods receipts could not be loaded"
          {...(readError?.requestId === undefined
            ? {}
            : { requestId: readError.requestId })}
        />
      ) : receipts.data === undefined ? null : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {receipts.data.total === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState onClear={clear} />
            ) : (
              <CatalogEmptyState
                description="Receipts appear here only after an approved or ordered purchase is physically received and posted atomically."
                title="No goods receipts yet"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[62rem] text-left">
                <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Purchase order</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3 text-right">Units</th>
                    <th className="px-4 py-3 text-right">Payable</th>
                    <th className="px-4 py-3 text-right">Inventory value</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {receipts.data.items.map((receipt) => (
                    <tr className="hover:bg-surface-subtle/65" key={receipt.id}>
                      <td className="px-4 py-3.5">
                        <button
                          className="font-mono text-sm font-bold text-accent hover:underline"
                          onClick={() => setDetailId(receipt.id)}
                          type="button"
                        >
                          {receipt.number}
                        </button>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {dateText(receipt.receivedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-sm text-ink">
                        {receipt.purchaseOrder.number}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-ink">
                          {receipt.supplier.name}
                        </p>
                        <p className="font-mono text-xs text-ink-muted">
                          {receipt.supplier.code}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-ink-subtle">
                        {receipt.supplierInvoiceReference ?? "Not supplied"}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-ink">
                        {receipt.unitCount.toLocaleString("en-PK")}
                        <p className="text-xs text-ink-muted">
                          {receipt.lineCount} lines
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold text-ink">
                        {moneyText(receipt.payableTotalMinor)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-bold text-ink">
                        {moneyText(receipt.landedCostTotalMinor)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end">
                          <button
                            className={rowActionClass}
                            onClick={() => setDetailId(receipt.id)}
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
            onPage={(page) => update({ rpage: String(page) }, false)}
            page={receipts.data.page}
            total={receipts.data.total}
            totalPages={receipts.data.totalPages}
          />
        </section>
      )}

      {detailId === null ? null : (
        <ReceiptDetailDrawer
          onClose={() => setDetailId(null)}
          receiptId={detailId}
        />
      )}
    </div>
  );
}
