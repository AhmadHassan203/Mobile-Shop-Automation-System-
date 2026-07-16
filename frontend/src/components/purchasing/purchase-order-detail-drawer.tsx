"use client";

import type { PurchaseOrderDetail } from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState, type JSX } from "react";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import {
  cancelPurchaseOrder,
  transitionPurchaseOrder,
} from "@/lib/api/purchasing";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { purchaseOrderQueryOptions } from "@/lib/query/purchasing-query";
import {
  MutationErrorBanner,
  StatusBadge,
  SummaryItem,
  controlClass,
  dateText,
  labelClass,
  moneyText,
  primaryButtonClass,
  secondaryButtonClass,
} from "./purchasing-parts";
import { asPurchasingError } from "./purchasing-state";

type OrderAction = "approve" | "order" | "cancel" | "close";

export interface PurchaseOrderDetailDrawerProps {
  readonly orderId: string;
  readonly canEdit: boolean;
  readonly canOrder: boolean;
  readonly canApprove: boolean;
  readonly canReceive: boolean;
  readonly onClose: () => void;
  readonly onEdit: (orderId: string) => void;
  readonly onReceive: (orderId: string) => void;
  readonly onChanged: (order: PurchaseOrderDetail) => void;
}

function actionTitle(action: OrderAction): string {
  switch (action) {
    case "approve":
      return "Approve order";
    case "order":
      return "Mark as ordered";
    case "cancel":
      return "Cancel order";
    case "close":
      return "Close order";
  }
}

export function PurchaseOrderDetailDrawer({
  orderId,
  canEdit,
  canOrder,
  canApprove,
  canReceive,
  onClose,
  onEdit,
  onReceive,
  onChanged,
}: PurchaseOrderDetailDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const order = useQuery(purchaseOrderQueryOptions(orderId, true));
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const closeIfIdle = useCallback(() => {
    if (!submittingRef.current) onClose();
  }, [onClose]);

  const runAction = async (): Promise<void> => {
    if (
      pendingAction === null ||
      order.data === undefined ||
      submittingRef.current
    ) {
      return;
    }
    if (pendingAction === "cancel" && reason.trim().length === 0) {
      setActionError(
        new ApiError("Enter a cancellation reason before continuing.", {
          code: "CLIENT_VALIDATION_FAILED",
        }),
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      const saved =
        pendingAction === "cancel"
          ? await cancelPurchaseOrder(order.data.id, {
              version: order.data.version,
              reason,
            })
          : await transitionPurchaseOrder(order.data.id, pendingAction, {
              version: order.data.version,
              reason,
            });
      queryClient.setQueryData(queryKeys.purchasingOrder(saved.id), saved);
      setPendingAction(null);
      setReason("");
      submittingRef.current = false;
      setSubmitting(false);
      onChanged(saved);
    } catch (error) {
      setActionError(asPurchasingError(error));
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const data = order.data;
  const progress =
    data === undefined
      ? 0
      : Math.round((data.receivedUnits / data.totalUnits) * 100);
  const mayReceive =
    data !== undefined &&
    canReceive &&
    ["approved", "ordered", "partially_received"].includes(data.status) &&
    data.receivedUnits < data.totalUnits;

  const footer =
    data === undefined ? (
      <button
        className={secondaryButtonClass}
        onClick={closeIfIdle}
        type="button"
      >
        Close
      </button>
    ) : pendingAction !== null ? (
      <>
        <button
          className={secondaryButtonClass}
          disabled={submitting}
          onClick={() => {
            setPendingAction(null);
            setReason("");
            setActionError(null);
          }}
          type="button"
        >
          Back
        </button>
        <button
          className={
            pendingAction === "cancel"
              ? `${primaryButtonClass} !bg-negative hover:!bg-negative/90`
              : primaryButtonClass
          }
          disabled={submitting}
          onClick={() => void runAction()}
          type="button"
        >
          {submitting ? "Saving..." : actionTitle(pendingAction)}
        </button>
      </>
    ) : (
      <>
        <button
          className={secondaryButtonClass}
          onClick={closeIfIdle}
          type="button"
        >
          Close
        </button>
        {data.status === "draft" && canEdit ? (
          <button
            className={secondaryButtonClass}
            onClick={() => onEdit(data.id)}
            type="button"
          >
            Edit
          </button>
        ) : null}
        {mayReceive ? (
          <button
            className={primaryButtonClass}
            onClick={() => onReceive(data.id)}
            type="button"
          >
            Receive goods
          </button>
        ) : null}
      </>
    );

  return (
    <CatalogDrawer
      description="Commercial terms, lifecycle status, and receiving progress from the purchasing ledger."
      footer={footer}
      onClose={closeIfIdle}
      title={data?.number ?? "Purchase order"}
      titleId="purchase-order-detail-title"
    >
      {order.isPending ? (
        <div
          className="flex items-center gap-3 py-8 text-sm text-ink-muted"
          role="status"
        >
          <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          Loading purchase order...
        </div>
      ) : order.error !== null && data === undefined ? (
        <div>
          <MutationErrorBanner
            error={asPurchasingError(order.error)}
            title="Purchase order could not be loaded"
          />
          <button
            className={secondaryButtonClass}
            onClick={() => void order.refetch()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : data === undefined ? null : (
        <div className="space-y-5">
          {actionError === null ? null : (
            <MutationErrorBanner
              error={actionError}
              title="Order status was not changed"
            />
          )}

          <section className="rounded-card border border-line bg-surface-subtle p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold text-ink-muted">
                  {data.number}
                </p>
                <h3 className="mt-1 text-lg font-bold text-ink">
                  {data.supplier.name}
                </h3>
                <p className="text-xs text-ink-muted">{data.supplier.code}</p>
              </div>
              <StatusBadge value={data.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SummaryItem label="Order date">
                {dateText(data.orderDate)}
              </SummaryItem>
              <SummaryItem label="Expected">
                {dateText(data.expectedOn)}
              </SummaryItem>
              <SummaryItem label="Order total" strong>
                {moneyText(data.totalMinor)}
              </SummaryItem>
            </dl>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">Receiving progress</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {data.receivedUnits.toLocaleString("en-PK")} of{" "}
                  {data.totalUnits.toLocaleString("en-PK")} units received
                </p>
              </div>
              <strong className="text-sm text-ink">{progress}%</strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line-subtle">
              <div
                aria-label={`${progress}% received`}
                className="h-full rounded-full bg-accent transition-[width]"
                role="progressbar"
                style={{ width: `${progress}%` }}
              />
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-ink">Order lines</h3>
            <div className="mt-3 space-y-2">
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
                        {line.productVariant.sku} ·{" "}
                        {line.productVariant.trackingType}
                      </p>
                    </div>
                    <strong className="shrink-0 text-sm text-ink">
                      {moneyText(line.lineTotalMinor)}
                    </strong>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <SummaryItem label="Ordered">
                      {line.quantityOrdered.toLocaleString("en-PK")}
                    </SummaryItem>
                    <SummaryItem label="Received">
                      {line.quantityReceived.toLocaleString("en-PK")}
                    </SummaryItem>
                    <SummaryItem label="Remaining">
                      {line.quantityRemaining.toLocaleString("en-PK")}
                    </SummaryItem>
                  </dl>
                  <p className="mt-2 text-xs text-ink-muted">
                    {moneyText(line.unitCostMinor)} per unit
                    {line.notes === null ? "" : ` · ${line.notes}`}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {data.notes === null ? null : (
            <section className="rounded-control border border-line bg-surface-subtle p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Notes
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                {data.notes}
              </p>
            </section>
          )}

          {pendingAction === null ? (
            <section className="border-t border-line pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Status actions
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.status === "draft" && canApprove ? (
                  <button
                    className={secondaryButtonClass}
                    onClick={() => setPendingAction("approve")}
                    type="button"
                  >
                    Approve
                  </button>
                ) : null}
                {data.status === "approved" && canOrder ? (
                  <button
                    className={secondaryButtonClass}
                    onClick={() => setPendingAction("order")}
                    type="button"
                  >
                    Mark ordered
                  </button>
                ) : null}
                {["draft", "approved", "ordered"].includes(data.status) &&
                canApprove ? (
                  <button
                    className={`${secondaryButtonClass} !border-negative/30 !text-negative`}
                    onClick={() => setPendingAction("cancel")}
                    type="button"
                  >
                    Cancel order
                  </button>
                ) : null}
                {["partially_received", "received"].includes(data.status) &&
                canApprove ? (
                  <button
                    className={secondaryButtonClass}
                    onClick={() => setPendingAction("close")}
                    type="button"
                  >
                    Close order
                  </button>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="rounded-card border border-warning/30 bg-warning-soft p-4">
              <h3 className="font-semibold text-ink">
                {actionTitle(pendingAction)}
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                This status change is recorded against your user and cannot be
                silently reversed.
              </p>
              <label className={`${labelClass} mt-4`}>
                {pendingAction === "cancel"
                  ? "Reason (required)"
                  : "Reason (optional)"}
                <textarea
                  className={`${controlClass} mt-1.5 min-h-20 resize-y`}
                  disabled={submitting}
                  onChange={(event) => setReason(event.target.value)}
                  value={reason}
                />
              </label>
            </section>
          )}
        </div>
      )}
    </CatalogDrawer>
  );
}
