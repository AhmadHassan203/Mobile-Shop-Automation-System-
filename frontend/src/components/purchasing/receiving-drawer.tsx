"use client";

import {
  CreateGoodsReceiptInputSchema,
  LANDED_COST_KINDS,
  PURCHASING_CONTRACT_LIMITS,
  fromMajor,
  toMajorString,
  toMinor,
  type CreateGoodsReceiptData,
  type GoodsReceiptDetail,
  type LandedCostKind,
  type PurchaseOrderDetail,
} from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import { PlusIcon } from "@/components/ui/icons";
import { createGoodsReceipt } from "@/lib/api/purchasing";
import { ApiError } from "@/lib/api/client";
import { stockLocationsQueryOptions } from "@/lib/query/inventory-query";
import { queryKeys } from "@/lib/query/keys";
import { purchaseOrderQueryOptions } from "@/lib/query/purchasing-query";
import {
  FieldError,
  MutationErrorBanner,
  SummaryItem,
  ValidationSummary,
  controlClass,
  fieldErrorControlProps,
  focusValidationSummary,
  labelClass,
  moneyText,
  primaryButtonClass,
  secondaryButtonClass,
} from "./purchasing-parts";
import {
  asPurchasingError,
  parseSerializedRows,
  receivingImpact,
  titleCase,
  zodFieldErrors,
  type FieldErrors,
  type ReceivingImpact,
  type SerializedRowsResult,
} from "./purchasing-state";

interface ReceivingLineDraft {
  readonly purchaseOrderLineId: string;
  readonly included: boolean;
  readonly stockLocationId: string;
  readonly unitCostMajor: string;
  readonly quantity: string;
  readonly serializedRows: string;
}

interface LandedCostDraft {
  readonly key: number;
  readonly kind: LandedCostKind;
  readonly amountMajor: string;
  readonly reference: string;
  readonly notes: string;
}

const RECEIVING_VALIDATION_SUMMARY_ID = "receiving-validation-summary";
const RECEIVING_LINES_ERROR_ID = "receiving-lines-error";
const RECEIVING_LANDED_COSTS_ERROR_ID = "receiving-landed-costs-error";
const RECEIVING_INVOICE_REFERENCE_ERROR_ID =
  "receiving-invoice-reference-error";
const RECEIVING_INVOICE_DUE_ERROR_ID = "receiving-invoice-due-error";
const RECEIVING_NOTES_ERROR_ID = "receiving-notes-error";

function initialLines(order: PurchaseOrderDetail): ReceivingLineDraft[] {
  return order.lines
    .filter((line) => line.quantityRemaining > 0)
    .map((line) => ({
      purchaseOrderLineId: line.id,
      included: false,
      stockLocationId: "",
      unitCostMajor: toMajorString(toMinor(line.unitCostMinor)),
      quantity: "1",
      serializedRows: "",
    }));
}

function minorFromMajor(value: string): number {
  try {
    return fromMajor(value);
  } catch {
    return Number.NaN;
  }
}

function serializedResults(
  order: PurchaseOrderDetail | undefined,
  drafts: readonly ReceivingLineDraft[],
): ReadonlyMap<string, SerializedRowsResult> {
  const results = new Map<string, SerializedRowsResult>();
  for (const draft of drafts) {
    const line = order?.lines.find(
      (candidate) => candidate.id === draft.purchaseOrderLineId,
    );
    if (line?.productVariant.trackingType === "serialized") {
      results.set(
        draft.purchaseOrderLineId,
        parseSerializedRows(draft.serializedRows),
      );
    }
  }
  return results;
}

function buildReceiptInput(
  order: PurchaseOrderDetail,
  drafts: readonly ReceivingLineDraft[],
  parsedRows: ReadonlyMap<string, SerializedRowsResult>,
  landedCosts: readonly LandedCostDraft[],
  supplierInvoiceReference: string,
  invoiceDueOn: string,
  notes: string,
): unknown {
  const included = drafts.filter((draft) => draft.included);
  return {
    purchaseOrderId: order.id,
    supplierInvoiceReference,
    invoiceDueOn: invoiceDueOn.length === 0 ? null : invoiceDueOn,
    notes,
    landedCosts: landedCosts.map((cost) => ({
      kind: cost.kind,
      amountMinor: minorFromMajor(cost.amountMajor),
      reference: cost.reference,
      notes: cost.notes,
    })),
    lines: included.map((draft) => {
      const orderLine = order.lines.find(
        (line) => line.id === draft.purchaseOrderLineId,
      );
      const base = {
        purchaseOrderLineId: draft.purchaseOrderLineId,
        stockLocationId: draft.stockLocationId,
        unitCostMinor: minorFromMajor(draft.unitCostMajor),
      };
      return orderLine?.productVariant.trackingType === "serialized"
        ? {
            ...base,
            trackingType: "serialized" as const,
            units: parsedRows.get(draft.purchaseOrderLineId)?.units ?? [],
          }
        : {
            ...base,
            trackingType: "quantity" as const,
            quantity: Number(draft.quantity),
          };
    }),
  };
}

function remainingErrors(
  order: PurchaseOrderDetail,
  drafts: readonly ReceivingLineDraft[],
  parsedRows: ReadonlyMap<string, SerializedRowsResult>,
): FieldErrors {
  const errors: Record<string, string[]> = {};
  drafts.forEach((draft, index) => {
    if (!draft.included) return;
    const orderLine = order.lines.find(
      (line) => line.id === draft.purchaseOrderLineId,
    );
    if (orderLine === undefined) {
      errors[`lines.${index}.purchaseOrderLineId`] = [
        "This purchase line is no longer available.",
      ];
      return;
    }
    const quantity =
      orderLine.productVariant.trackingType === "serialized"
        ? (parsedRows.get(orderLine.id)?.units.length ?? 0)
        : Number(draft.quantity);
    if (quantity > orderLine.quantityRemaining) {
      errors[`line.${orderLine.id}.quantity`] = [
        `Only ${orderLine.quantityRemaining.toLocaleString("en-PK")} unit${
          orderLine.quantityRemaining === 1 ? " remains" : "s remain"
        } on this order line.`,
      ];
    }
  });
  return errors;
}

function mergeErrors(left: FieldErrors, right: FieldErrors): FieldErrors {
  const merged: Record<string, readonly string[]> = { ...left };
  for (const [key, messages] of Object.entries(right)) {
    merged[key] = [...(merged[key] ?? []), ...messages];
  }
  return merged;
}

function messagesForFieldPaths(
  errors: FieldErrors,
  paths: readonly string[],
): readonly string[] | undefined {
  const messages = Object.entries(errors).flatMap(([key, values]) =>
    paths.some((path) => key === path || key.startsWith(`${path}.`))
      ? values
      : [],
  );
  const unique = [...new Set(messages)];
  return unique.length === 0 ? undefined : unique;
}

export function includedReceiptLineIndex(
  lines: readonly {
    readonly purchaseOrderLineId: string;
    readonly included: boolean;
  }[],
  purchaseOrderLineId: string,
): number {
  let includedIndex = 0;
  for (const line of lines) {
    if (line.purchaseOrderLineId === purchaseOrderLineId) {
      return line.included ? includedIndex : -1;
    }
    if (line.included) includedIndex += 1;
  }
  return -1;
}

export interface ReceivingLineFieldMessages {
  readonly stockLocation: readonly string[] | undefined;
  readonly unitCost: readonly string[] | undefined;
  readonly quantity: readonly string[] | undefined;
  readonly serializedUnits: readonly string[] | undefined;
}

export function receivingLineFieldMessages(
  errors: FieldErrors,
  receiptLineIndex: number,
  purchaseOrderLineId: string,
): ReceivingLineFieldMessages {
  if (receiptLineIndex < 0) {
    return {
      stockLocation: undefined,
      unitCost: undefined,
      quantity: undefined,
      serializedUnits: undefined,
    };
  }
  const receiptLinePrefix = `lines.${receiptLineIndex}`;
  const remainingQuantity =
    errors[`line.${purchaseOrderLineId}.quantity`] ?? [];
  const quantity = [
    ...(messagesForFieldPaths(errors, [`${receiptLinePrefix}.quantity`]) ?? []),
    ...remainingQuantity,
  ];
  const serializedUnits = [
    ...(errors[`line.${purchaseOrderLineId}.serializedRows`] ?? []),
    ...(messagesForFieldPaths(errors, [`${receiptLinePrefix}.units`]) ?? []),
    ...remainingQuantity,
  ];
  return {
    stockLocation: messagesForFieldPaths(errors, [
      `${receiptLinePrefix}.stockLocationId`,
    ]),
    unitCost: messagesForFieldPaths(errors, [
      `${receiptLinePrefix}.unitCostMinor`,
    ]),
    quantity: quantity.length === 0 ? undefined : [...new Set(quantity)],
    serializedUnits:
      serializedUnits.length === 0 ? undefined : [...new Set(serializedUnits)],
  };
}

export interface ReceivingDrawerProps {
  readonly orderId: string;
  readonly onClose: () => void;
  readonly onPosted: (receipt: GoodsReceiptDetail) => void;
}

export function ReceivingDrawer({
  orderId,
  onClose,
  onPosted,
}: ReceivingDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const order = useQuery(purchaseOrderQueryOptions(orderId, true));
  const locations = useQuery(
    stockLocationsQueryOptions({ page: 1, pageSize: 100, active: true }, true),
  );
  const [lines, setLines] = useState<ReceivingLineDraft[]>([]);
  const [landedCosts, setLandedCosts] = useState<LandedCostDraft[]>([]);
  const [supplierInvoiceReference, setSupplierInvoiceReference] = useState("");
  const [invoiceDueOn, setInvoiceDueOn] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const initialized = useRef<string | null>(null);
  const nextCostKey = useRef(1);
  const receiptIdempotencyKey = useRef(crypto.randomUUID());
  const submittedReceiptInput = useRef<CreateGoodsReceiptData | null>(null);
  const submittingRef = useRef(false);
  const validationSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (order.data === undefined) return;
    const identity = `${order.data.id}:${order.data.version}`;
    if (initialized.current === identity) return;
    setFieldErrors({});
    setLines(initialLines(order.data));
    initialized.current = identity;
  }, [order.data]);

  useEffect(() => {
    if (validationAttempt > 0) {
      focusValidationSummary(validationSummaryRef.current);
    }
  }, [validationAttempt]);

  const closeIfIdle = useCallback(() => {
    if (!submittingRef.current) onClose();
  }, [onClose]);

  const parsedRows = useMemo(
    () => serializedResults(order.data, lines),
    [lines, order.data],
  );

  const draftInput = useMemo(
    () =>
      order.data === undefined
        ? null
        : buildReceiptInput(
            order.data,
            lines,
            parsedRows,
            landedCosts,
            supplierInvoiceReference,
            invoiceDueOn,
            notes,
          ),
    [
      invoiceDueOn,
      landedCosts,
      lines,
      notes,
      order.data,
      parsedRows,
      supplierInvoiceReference,
    ],
  );

  const impact = useMemo<ReceivingImpact | null>(() => {
    if (order.data === undefined) return null;
    try {
      const impactLines = lines.flatMap((draft) => {
        if (!draft.included) return [];
        const orderLine = order.data.lines.find(
          (line) => line.id === draft.purchaseOrderLineId,
        );
        if (orderLine === undefined) return [];
        const quantity =
          orderLine.productVariant.trackingType === "serialized"
            ? (parsedRows.get(orderLine.id)?.units.length ?? 0)
            : Number(draft.quantity);
        return [
          {
            quantity,
            unitCostMinor: fromMajor(draft.unitCostMajor),
          },
        ];
      });
      return receivingImpact(
        impactLines,
        landedCosts.map((cost) => fromMajor(cost.amountMajor)),
      );
    } catch {
      return null;
    }
  }, [landedCosts, lines, order.data, parsedRows]);

  const updateLine = (
    purchaseOrderLineId: string,
    changes: Partial<Omit<ReceivingLineDraft, "purchaseOrderLineId">>,
  ): void => {
    setLines((current) =>
      current.map((line) =>
        line.purchaseOrderLineId === purchaseOrderLineId
          ? { ...line, ...changes }
          : line,
      ),
    );
  };

  const submit = async (): Promise<void> => {
    if (
      order.data === undefined ||
      draftInput === null ||
      submittingRef.current
    ) {
      return;
    }
    setFieldErrors({});
    setSubmissionError(null);

    const bulkErrors: Record<string, string[]> = {};
    lines.forEach((draft) => {
      if (!draft.included) return;
      const result = parsedRows.get(draft.purchaseOrderLineId);
      if (result !== undefined && result.errors.length > 0) {
        bulkErrors[`line.${draft.purchaseOrderLineId}.serializedRows`] =
          result.errors.map((error) => `Row ${error.line}: ${error.message}`);
      }
    });
    const limits = remainingErrors(order.data, lines, parsedRows);
    const parsed = CreateGoodsReceiptInputSchema.safeParse(draftInput);
    const schemaErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    const combined = mergeErrors(mergeErrors(schemaErrors, limits), bulkErrors);
    if (Object.keys(combined).length > 0 || !parsed.success) {
      setFieldErrors(combined);
      setValidationAttempt((current) => current + 1);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const protectedInput = submittedReceiptInput.current ?? parsed.data;
      submittedReceiptInput.current = protectedInput;
      const receipt = await createGoodsReceipt(
        protectedInput,
        receiptIdempotencyKey.current,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.purchasingOrdersRoot,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.purchasingReceiptsRoot,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.inventoryBalancesRoot,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.inventoryMovementsRoot,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.inventorySerializedUnitsRoot,
        }),
      ]);
      submittingRef.current = false;
      onPosted(receipt);
    } catch (error) {
      const apiError = asPurchasingError(error);
      const outcomeUnknown =
        apiError.code === "NETWORK_ERROR" ||
        apiError.code === "REQUEST_TIMEOUT";
      setSubmissionError(apiError);
      if (!outcomeUnknown) {
        submittedReceiptInput.current = null;
        receiptIdempotencyKey.current = crypto.randomUUID();
      }
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const referenceError =
    (order.data === undefined ? order.error : null) ??
    (locations.data === undefined ? locations.error : null);
  const loading =
    referenceError === null &&
    (order.data === undefined || locations.data === undefined);
  const receivable =
    order.data !== undefined &&
    ["approved", "ordered", "partially_received"].includes(order.data.status);
  const includedCount = lines.filter((line) => line.included).length;
  const receiptOutcomeUnknown =
    submissionError?.code === "NETWORK_ERROR" ||
    submissionError?.code === "REQUEST_TIMEOUT";
  const validationMessages = [
    ...new Set(Object.values(fieldErrors).flatMap((messages) => messages)),
  ];

  return (
    <CatalogDrawer
      description="One atomic posting creates stock, movements, landed valuation, receipt history, and the supplier payable together."
      footer={
        <>
          <button
            className={secondaryButtonClass}
            disabled={submitting}
            onClick={closeIfIdle}
            type="button"
          >
            Cancel
          </button>
          <button
            className={primaryButtonClass}
            disabled={
              submitting ||
              loading ||
              referenceError !== null ||
              !receivable ||
              includedCount === 0
            }
            onClick={() => void submit()}
            type="button"
          >
            {submitting
              ? "Posting..."
              : receiptOutcomeUnknown
                ? "Retry same receipt"
                : "Post goods receipt"}
          </button>
        </>
      }
      onClose={closeIfIdle}
      title={
        order.data === undefined
          ? "Receive goods"
          : `Receive ${order.data.number}`
      }
      titleId="receiving-title"
    >
      {referenceError !== null ? (
        <div>
          <MutationErrorBanner
            error={asPurchasingError(referenceError)}
            title="Receiving references could not be loaded"
          />
          <button
            className={secondaryButtonClass}
            onClick={() => {
              void order.refetch();
              void locations.refetch();
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : order.data === undefined || locations.data === undefined ? (
        <div
          className="flex items-center gap-3 py-8 text-sm text-ink-muted"
          role="status"
        >
          <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          Loading order and stock locations...
        </div>
      ) : !receivable ? (
        <MutationErrorBanner
          error={
            new ApiError(
              `Order ${order.data.status.replaceAll("_", " ")} cannot receive goods.`,
              { code: "PURCHASE_ORDER_INVALID_STATUS" },
            )
          }
          title="Order is not receivable"
        />
      ) : (
        <div className="space-y-6">
          {submissionError === null ? null : (
            <MutationErrorBanner
              error={submissionError}
              title={
                receiptOutcomeUnknown
                  ? "Receipt outcome needs confirmation"
                  : "Receipt was not posted"
              }
            />
          )}
          {receiptOutcomeUnknown ? (
            <div
              className="rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning"
              role="alert"
            >
              The server response was interrupted, so the result is not yet
              known. Keep this drawer open and use{" "}
              <strong>Retry same receipt</strong>; the protected request key
              makes that exact retry safe and prevents a duplicate receipt. The
              receipt fields are locked until the retry succeeds or you close
              this drawer to verify the order manually.
            </div>
          ) : null}
          <ValidationSummary
            focusRef={validationSummaryRef}
            id={RECEIVING_VALIDATION_SUMMARY_ID}
            messages={validationMessages}
            title="Review the receipt before posting"
          />

          <section className="rounded-card border border-line bg-surface-subtle p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-muted">Supplier</p>
                <p className="mt-0.5 font-bold text-ink">
                  {order.data.supplier.name}
                </p>
                <p className="font-mono text-xs text-ink-muted">
                  {order.data.supplier.code}
                </p>
              </div>
              <p className="text-right text-xs text-ink-muted">
                {order.data.totalUnits - order.data.receivedUnits} total units
                remain
              </p>
            </div>
          </section>

          <section>
            <div>
              <h3 className="font-semibold text-ink">
                Remaining purchase lines
              </h3>
              <p className="mt-0.5 text-xs text-ink-muted">
                Select only the lines physically counted in this delivery.
              </p>
            </div>
            <div className="mt-3 space-y-3">
              {lines.length === 0 ? (
                <p className="rounded-control border border-dashed border-line p-4 text-center text-sm text-ink-muted">
                  This order has no remaining units to receive.
                </p>
              ) : null}
              {lines.map((draft) => {
                const orderLine = order.data.lines.find(
                  (line) => line.id === draft.purchaseOrderLineId,
                );
                if (orderLine === undefined) return null;
                const bulk = parsedRows.get(orderLine.id);
                const lineErrorPrefix = `receiving-line-${draft.purchaseOrderLineId}`;
                const receiptLineIndex = includedReceiptLineIndex(
                  lines,
                  draft.purchaseOrderLineId,
                );
                const lineMessages = receivingLineFieldMessages(
                  fieldErrors,
                  receiptLineIndex,
                  orderLine.id,
                );
                return (
                  <article
                    className={`rounded-card border p-4 ${
                      draft.included
                        ? "border-accent/40 bg-accent-soft/30"
                        : "border-line"
                    }`}
                    key={draft.purchaseOrderLineId}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        checked={draft.included}
                        className="mt-1 size-4 accent-[var(--color-accent)]"
                        disabled={submitting || receiptOutcomeUnknown}
                        onChange={(event) => {
                          setFieldErrors({});
                          updateLine(draft.purchaseOrderLineId, {
                            included: event.target.checked,
                          });
                        }}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {orderLine.productVariant.name}
                        </span>
                        <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                          {orderLine.productVariant.sku} ·{" "}
                          {orderLine.productVariant.trackingType} ·{" "}
                          {orderLine.quantityRemaining} remaining
                        </span>
                      </span>
                    </label>

                    {draft.included ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className={labelClass}>
                          Stock location{" "}
                          <span className="text-negative">*</span>
                          <select
                            {...fieldErrorControlProps(
                              `${lineErrorPrefix}-stock-location-error`,
                              lineMessages.stockLocation,
                              `Stock location for ${orderLine.productVariant.name}`,
                            )}
                            className={`${controlClass} mt-1`}
                            disabled={submitting || receiptOutcomeUnknown}
                            onChange={(event) =>
                              updateLine(draft.purchaseOrderLineId, {
                                stockLocationId: event.target.value,
                              })
                            }
                            required
                            value={draft.stockLocationId}
                          >
                            <option value="">Select destination</option>
                            {locations.data.items.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.code} - {location.name} (
                                {location.locationType})
                              </option>
                            ))}
                          </select>
                          <FieldError
                            id={`${lineErrorPrefix}-stock-location-error`}
                            messages={lineMessages.stockLocation}
                          />
                        </label>
                        <label className={labelClass}>
                          Approved unit cost (PKR)
                          <input
                            {...fieldErrorControlProps(
                              `${lineErrorPrefix}-unit-cost-error`,
                              lineMessages.unitCost,
                              `Approved unit cost for ${orderLine.productVariant.name}`,
                            )}
                            className={`${controlClass} mt-1 cursor-not-allowed bg-surface-subtle font-mono`}
                            readOnly
                            value={draft.unitCostMajor}
                          />
                          <p className="mt-1 text-[0.6875rem] font-normal text-ink-muted">
                            Locked to the approved PO line. An invoice variance
                            requires PO reapproval or a future variance
                            workflow.
                          </p>
                          <FieldError
                            id={`${lineErrorPrefix}-unit-cost-error`}
                            messages={lineMessages.unitCost}
                          />
                        </label>

                        {orderLine.productVariant.trackingType ===
                        "quantity" ? (
                          <label className={labelClass}>
                            Quantity received (max {orderLine.quantityRemaining}
                            )
                            <input
                              {...fieldErrorControlProps(
                                `${lineErrorPrefix}-quantity-error`,
                                lineMessages.quantity,
                                `Quantity received for ${orderLine.productVariant.name}`,
                              )}
                              className={`${controlClass} mt-1`}
                              disabled={submitting || receiptOutcomeUnknown}
                              max={orderLine.quantityRemaining}
                              min={1}
                              onChange={(event) =>
                                updateLine(draft.purchaseOrderLineId, {
                                  quantity: event.target.value,
                                })
                              }
                              required
                              type="number"
                              value={draft.quantity}
                            />
                            <FieldError
                              id={`${lineErrorPrefix}-quantity-error`}
                              messages={lineMessages.quantity}
                            />
                          </label>
                        ) : (
                          <label className={`${labelClass} sm:col-span-2`}>
                            Serialized units (max {orderLine.quantityRemaining})
                            <textarea
                              {...fieldErrorControlProps(
                                `${lineErrorPrefix}-serialized-units-error`,
                                lineMessages.serializedUnits,
                                `Serialized units for ${orderLine.productVariant.name}`,
                              )}
                              className={`${controlClass} mt-1 min-h-36 resize-y font-mono text-xs`}
                              disabled={submitting || receiptOutcomeUnknown}
                              onChange={(event) =>
                                updateLine(draft.purchaseOrderLineId, {
                                  serializedRows: event.target.value,
                                })
                              }
                              placeholder={
                                "IMEI1, IMEI2, serial, available\nIMEI1, , serial, pending_verification"
                              }
                              required
                              spellCheck={false}
                              value={draft.serializedRows}
                            />
                            <p className="mt-1 text-[0.6875rem] font-normal text-ink-muted">
                              One unit per row. Comma, tab, or pipe columns:
                              IMEI1, optional IMEI2, optional serial, optional
                              state. IMEI checksums and duplicates are validated
                              before posting.
                            </p>
                            <p className="mt-1 text-xs font-normal text-ink-subtle">
                              {bulk?.rowCount ?? 0} rows ·{" "}
                              {bulk?.units.length ?? 0} valid
                            </p>
                            <FieldError
                              id={`${lineErrorPrefix}-serialized-units-error`}
                              messages={lineMessages.serializedUnits}
                            />
                          </label>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <FieldError
              id={RECEIVING_LINES_ERROR_ID}
              messages={fieldErrors.lines}
            />
          </section>

          <section className="border-t border-line pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">Landed costs</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Freight, customs, and similar costs are allocated by exact
                  line value into inventory valuation.
                </p>
              </div>
              <button
                className={secondaryButtonClass}
                disabled={
                  submitting ||
                  receiptOutcomeUnknown ||
                  landedCosts.length >=
                    PURCHASING_CONTRACT_LIMITS.MAX_LANDED_COSTS_PER_RECEIPT
                }
                onClick={() => {
                  const key = nextCostKey.current;
                  nextCostKey.current += 1;
                  setFieldErrors({});
                  setLandedCosts((current) => [
                    ...current,
                    {
                      key,
                      kind: "freight",
                      amountMajor: "0.00",
                      reference: "",
                      notes: "",
                    },
                  ]);
                }}
                type="button"
              >
                <PlusIcon className="size-4" /> Add cost
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {landedCosts.map((cost, index) => (
                <div
                  className="rounded-control border border-line bg-surface-subtle p-3"
                  key={cost.key}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={labelClass}>
                      Cost type
                      <select
                        {...fieldErrorControlProps(
                          `receiving-landed-cost-${cost.key}-kind-error`,
                          fieldErrors[`landedCosts.${index}.kind`],
                          `Landed cost ${index + 1} type`,
                        )}
                        className={`${controlClass} mt-1`}
                        disabled={submitting || receiptOutcomeUnknown}
                        onChange={(event) =>
                          setLandedCosts((current) =>
                            current.map((item) =>
                              item.key === cost.key
                                ? {
                                    ...item,
                                    kind: event.target.value as LandedCostKind,
                                  }
                                : item,
                            ),
                          )
                        }
                        value={cost.kind}
                      >
                        {LANDED_COST_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {titleCase(kind)}
                          </option>
                        ))}
                      </select>
                      <FieldError
                        id={`receiving-landed-cost-${cost.key}-kind-error`}
                        messages={fieldErrors[`landedCosts.${index}.kind`]}
                      />
                    </label>
                    <label className={labelClass}>
                      Amount (PKR)
                      <input
                        {...fieldErrorControlProps(
                          `receiving-landed-cost-${cost.key}-amount-error`,
                          fieldErrors[`landedCosts.${index}.amountMinor`],
                          `Landed cost ${index + 1} amount`,
                        )}
                        className={`${controlClass} mt-1 font-mono`}
                        disabled={submitting || receiptOutcomeUnknown}
                        inputMode="decimal"
                        onChange={(event) =>
                          setLandedCosts((current) =>
                            current.map((item) =>
                              item.key === cost.key
                                ? { ...item, amountMajor: event.target.value }
                                : item,
                            ),
                          )
                        }
                        required
                        value={cost.amountMajor}
                      />
                      <FieldError
                        id={`receiving-landed-cost-${cost.key}-amount-error`}
                        messages={
                          fieldErrors[`landedCosts.${index}.amountMinor`]
                        }
                      />
                    </label>
                    <label className={labelClass}>
                      Reference
                      <input
                        {...fieldErrorControlProps(
                          `receiving-landed-cost-${cost.key}-reference-error`,
                          fieldErrors[`landedCosts.${index}.reference`],
                          `Landed cost ${index + 1} reference`,
                        )}
                        className={`${controlClass} mt-1`}
                        disabled={submitting || receiptOutcomeUnknown}
                        onChange={(event) =>
                          setLandedCosts((current) =>
                            current.map((item) =>
                              item.key === cost.key
                                ? { ...item, reference: event.target.value }
                                : item,
                            ),
                          )
                        }
                        value={cost.reference}
                      />
                      <FieldError
                        id={`receiving-landed-cost-${cost.key}-reference-error`}
                        messages={fieldErrors[`landedCosts.${index}.reference`]}
                      />
                    </label>
                    <label className={labelClass}>
                      Notes
                      <input
                        {...fieldErrorControlProps(
                          `receiving-landed-cost-${cost.key}-notes-error`,
                          fieldErrors[`landedCosts.${index}.notes`],
                          `Landed cost ${index + 1} notes`,
                        )}
                        className={`${controlClass} mt-1`}
                        disabled={submitting || receiptOutcomeUnknown}
                        onChange={(event) =>
                          setLandedCosts((current) =>
                            current.map((item) =>
                              item.key === cost.key
                                ? { ...item, notes: event.target.value }
                                : item,
                            ),
                          )
                        }
                        value={cost.notes}
                      />
                      <FieldError
                        id={`receiving-landed-cost-${cost.key}-notes-error`}
                        messages={fieldErrors[`landedCosts.${index}.notes`]}
                      />
                    </label>
                  </div>
                  <button
                    className="mt-3 text-xs font-semibold text-negative hover:underline"
                    disabled={submitting || receiptOutcomeUnknown}
                    onClick={() => {
                      setFieldErrors({});
                      setLandedCosts((current) =>
                        current.filter((item) => item.key !== cost.key),
                      );
                    }}
                    type="button"
                  >
                    Remove landed cost
                  </button>
                </div>
              ))}
            </div>
            <FieldError
              id={RECEIVING_LANDED_COSTS_ERROR_ID}
              messages={fieldErrors.landedCosts}
            />
          </section>

          <section className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <label className={labelClass}>
              Supplier invoice reference
              <input
                {...fieldErrorControlProps(
                  RECEIVING_INVOICE_REFERENCE_ERROR_ID,
                  fieldErrors.supplierInvoiceReference,
                  "Supplier invoice reference",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting || receiptOutcomeUnknown}
                maxLength={PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH}
                onChange={(event) =>
                  setSupplierInvoiceReference(event.target.value)
                }
                value={supplierInvoiceReference}
              />
              <FieldError
                id={RECEIVING_INVOICE_REFERENCE_ERROR_ID}
                messages={fieldErrors.supplierInvoiceReference}
              />
            </label>
            <label className={labelClass}>
              Invoice due date
              <input
                {...fieldErrorControlProps(
                  RECEIVING_INVOICE_DUE_ERROR_ID,
                  fieldErrors.invoiceDueOn,
                  "Invoice due date",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting || receiptOutcomeUnknown}
                onChange={(event) => setInvoiceDueOn(event.target.value)}
                type="date"
                value={invoiceDueOn}
              />
              <FieldError
                id={RECEIVING_INVOICE_DUE_ERROR_ID}
                messages={fieldErrors.invoiceDueOn}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Receipt notes
              <textarea
                {...fieldErrorControlProps(
                  RECEIVING_NOTES_ERROR_ID,
                  fieldErrors.notes,
                  "Receipt notes",
                )}
                className={`${controlClass} mt-1.5 min-h-20 resize-y`}
                disabled={submitting || receiptOutcomeUnknown}
                maxLength={PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH}
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
              <FieldError
                id={RECEIVING_NOTES_ERROR_ID}
                messages={fieldErrors.notes}
              />
            </label>
          </section>

          <section className="rounded-card border border-accent/25 bg-accent-soft p-4">
            <h3 className="font-semibold text-ink">Posting impact</h3>
            {impact === null ? (
              <p className="mt-2 text-sm text-ink-muted">
                Select valid receipt lines and costs to preview reconciliation.
              </p>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <SummaryItem label="Supplier payable" strong>
                    {moneyText(impact.payableMinor)}
                  </SummaryItem>
                  <SummaryItem label="Inventory value" strong>
                    {moneyText(impact.inventoryValueMinor)}
                  </SummaryItem>
                  <SummaryItem label="Product actual cost">
                    {moneyText(impact.actualTotalMinor)}
                  </SummaryItem>
                  <SummaryItem label="Landed cost added">
                    {moneyText(impact.landedCostExtraMinor)}
                  </SummaryItem>
                </dl>
                <p className="mt-3 text-xs text-ink-muted">
                  Allocation by selected line value:{" "}
                  {impact.allocations.length === 0
                    ? "no selected lines"
                    : impact.allocations.map(moneyText).join(" + ")}
                  .
                </p>
              </>
            )}
            <p className="mt-3 border-t border-accent/20 pt-3 text-xs text-ink-subtle">
              Posting is atomic: if any identifier, remaining quantity, stock
              location, payable, or valuation check fails, no stock or
              accounting record is written.
            </p>
          </section>
        </div>
      )}
    </CatalogDrawer>
  );
}
