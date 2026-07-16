"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, type JSX } from "react";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import { goodsReceiptQueryOptions } from "@/lib/query/purchasing-query";
import {
  MutationErrorBanner,
  StatusBadge,
  SummaryItem,
  dateText,
  moneyText,
  secondaryButtonClass,
} from "./purchasing-parts";
import { asPurchasingError, titleCase } from "./purchasing-state";

export interface ReceiptDetailDrawerProps {
  readonly receiptId: string;
  readonly onClose: () => void;
}

export function ReceiptDetailDrawer({
  receiptId,
  onClose,
}: ReceiptDetailDrawerProps): JSX.Element {
  const receipt = useQuery(goodsReceiptQueryOptions(receiptId, true));
  const close = useCallback(() => onClose(), [onClose]);
  const data = receipt.data;

  return (
    <CatalogDrawer
      description="Posted goods receipt, inventory valuation, and supplier payable reconciliation."
      footer={
        <button className={secondaryButtonClass} onClick={close} type="button">
          Close
        </button>
      }
      onClose={close}
      title={data?.number ?? "Goods receipt"}
      titleId="receipt-detail-title"
    >
      {receipt.isPending ? (
        <div
          className="flex items-center gap-3 py-8 text-sm text-ink-muted"
          role="status"
        >
          <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          Loading goods receipt...
        </div>
      ) : receipt.error !== null && data === undefined ? (
        <div>
          <MutationErrorBanner
            error={asPurchasingError(receipt.error)}
            title="Goods receipt could not be loaded"
          />
          <button
            className={secondaryButtonClass}
            onClick={() => void receipt.refetch()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : data === undefined ? null : (
        <div className="space-y-5">
          <section className="rounded-card border border-line bg-surface-subtle p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold text-ink-muted">
                  {data.number}
                </p>
                <h3 className="mt-1 text-lg font-bold text-ink">
                  {data.supplier.name}
                </h3>
                <p className="text-xs text-ink-muted">
                  PO {data.purchaseOrder.number} · received{" "}
                  {dateText(data.receivedAt)}
                </p>
              </div>
              <StatusBadge value={data.payable.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SummaryItem label="Supplier invoice">
                {data.supplierInvoiceReference ?? "Not supplied"}
              </SummaryItem>
              <SummaryItem label="Invoice due">
                {dateText(data.invoiceDueOn)}
              </SummaryItem>
              <SummaryItem label="Units">
                {data.unitCount.toLocaleString("en-PK")}
              </SummaryItem>
            </dl>
          </section>

          <section>
            <h3 className="font-semibold text-ink">Financial reconciliation</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 rounded-card border border-line p-4">
              <SummaryItem label="Supplier payable" strong>
                {moneyText(data.payableTotalMinor)}
              </SummaryItem>
              <SummaryItem label="Outstanding">
                {moneyText(data.payable.outstandingMinor)}
              </SummaryItem>
              <SummaryItem label="Product actual cost">
                {moneyText(data.actualCostTotalMinor)}
              </SummaryItem>
              <SummaryItem label="Inventory value" strong>
                {moneyText(data.landedCostTotalMinor)}
              </SummaryItem>
            </dl>
            <p className="mt-2 text-xs text-ink-muted">
              Supplier payable equals product actual cost. Landed costs increase
              inventory value without inflating this supplier payable.
            </p>
          </section>

          {data.landedCosts.length === 0 ? null : (
            <section>
              <h3 className="font-semibold text-ink">Landed costs</h3>
              <div className="mt-3 divide-y divide-line overflow-hidden rounded-control border border-line">
                {data.landedCosts.map((cost) => (
                  <div
                    className="flex items-start justify-between gap-3 p-3"
                    key={cost.id}
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {titleCase(cost.kind)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {[cost.reference, cost.notes]
                          .filter(Boolean)
                          .join(" · ") || "No reference"}
                      </p>
                    </div>
                    <strong className="shrink-0 text-sm text-ink">
                      {moneyText(cost.amountMinor)}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-semibold text-ink">Received lines</h3>
            <div className="mt-3 space-y-3">
              {data.lines.map((line) => (
                <article
                  className="rounded-control border border-line p-3"
                  key={line.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {line.productVariant.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">
                        {line.productVariant.sku} · {line.stockLocation.code} -{" "}
                        {line.stockLocation.name}
                      </p>
                    </div>
                    <strong className="shrink-0 text-sm text-ink">
                      {moneyText(line.landedCostTotalMinor)}
                    </strong>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SummaryItem label="Quantity">
                      {line.quantityReceived.toLocaleString("en-PK")}
                    </SummaryItem>
                    <SummaryItem label="Unit actual">
                      {moneyText(line.unitCostMinor)}
                    </SummaryItem>
                    <SummaryItem label="Actual total">
                      {moneyText(line.actualCostTotalMinor)}
                    </SummaryItem>
                    <SummaryItem label="Landed allocated">
                      {moneyText(line.landedCostAllocatedMinor)}
                    </SummaryItem>
                  </dl>

                  {line.serializedUnits.length === 0 ? null : (
                    <details className="mt-3 border-t border-line pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-accent">
                        {line.serializedUnits.length} serialized identifier
                        {line.serializedUnits.length === 1 ? "" : "s"}
                      </summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[30rem] text-left text-xs">
                          <thead className="text-ink-muted">
                            <tr>
                              <th className="pb-2 pr-3 font-semibold">
                                IMEI 1
                              </th>
                              <th className="pb-2 pr-3 font-semibold">
                                IMEI 2
                              </th>
                              <th className="pb-2 pr-3 font-semibold">
                                Serial
                              </th>
                              <th className="pb-2 font-semibold">
                                Initial state
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line-subtle font-mono text-ink">
                            {line.serializedUnits.map((unit) => (
                              <tr key={unit.id}>
                                <td className="py-2 pr-3">{unit.imei1}</td>
                                <td className="py-2 pr-3">
                                  {unit.imei2 ?? "-"}
                                </td>
                                <td className="py-2 pr-3">
                                  {unit.serialNumber ?? "-"}
                                </td>
                                <td className="py-2 font-sans">
                                  {titleCase(unit.state)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>

          {data.notes === null ? null : (
            <section className="rounded-control border border-line bg-surface-subtle p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Receipt notes
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                {data.notes}
              </p>
            </section>
          )}
        </div>
      )}
    </CatalogDrawer>
  );
}
