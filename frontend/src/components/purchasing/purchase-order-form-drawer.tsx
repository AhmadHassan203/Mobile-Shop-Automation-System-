"use client";

import {
  CreatePurchaseOrderInputSchema,
  PURCHASING_CONTRACT_LIMITS,
  UpdatePurchaseOrderInputSchema,
  fromMajor,
  multiplyByQuantity,
  sum,
  toMajorString,
  toMinor,
  type ProductSummary,
  type PurchaseOrderDetail,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
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
import { createPurchaseOrder, updatePurchaseOrder } from "@/lib/api/purchasing";
import type { ApiError } from "@/lib/api/client";
import { catalogProductsQueryOptions } from "@/lib/query/catalog-query";
import {
  purchaseOrderQueryOptions,
  suppliersQueryOptions,
} from "@/lib/query/purchasing-query";
import {
  FieldError,
  MutationErrorBanner,
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
  zodFieldErrors,
  type FieldErrors,
} from "./purchasing-state";

interface OrderDraft {
  readonly supplierId: string;
  readonly expectedOn: string;
  readonly notes: string;
}

interface OrderLineDraft {
  readonly key: number;
  readonly productVariantId: string;
  readonly quantity: string;
  readonly unitCostMajor: string;
  readonly notes: string;
}

interface ProductOption {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly trackingType: "serialized" | "quantity";
}

const EMPTY_ORDER: OrderDraft = {
  supplierId: "",
  expectedOn: "",
  notes: "",
};

const ORDER_VALIDATION_SUMMARY_ID = "purchase-order-form-validation-summary";
const ORDER_SUPPLIER_ERROR_ID = "purchase-order-form-supplier-error";
const ORDER_EXPECTED_ON_ERROR_ID = "purchase-order-form-expected-on-error";
const ORDER_NOTES_ERROR_ID = "purchase-order-form-notes-error";
const ORDER_LINES_ERROR_ID = "purchase-order-form-lines-error";

function blankLine(key: number): OrderLineDraft {
  return {
    key,
    productVariantId: "",
    quantity: "1",
    unitCostMajor: "0.00",
    notes: "",
  };
}

function minorFromMajor(value: string): number {
  try {
    return fromMajor(value);
  } catch {
    return Number.NaN;
  }
}

function productOption(product: ProductSummary): ProductOption {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    trackingType: product.trackingType,
  };
}

function orderDraft(detail: PurchaseOrderDetail): OrderDraft {
  return {
    supplierId: detail.supplier.id,
    expectedOn: detail.expectedOn ?? "",
    notes: detail.notes ?? "",
  };
}

function lineDrafts(detail: PurchaseOrderDetail): OrderLineDraft[] {
  return detail.lines.map((line, index) => ({
    key: index + 1,
    productVariantId: line.productVariant.id,
    quantity: String(line.quantityOrdered),
    unitCostMajor: toMajorString(toMinor(line.unitCostMinor)),
    notes: line.notes ?? "",
  }));
}

export interface PurchaseOrderFormDrawerProps {
  readonly mode: "create" | "edit";
  readonly orderId?: string | undefined;
  readonly onClose: () => void;
  readonly onSaved: (order: PurchaseOrderDetail) => void;
}

export function PurchaseOrderFormDrawer({
  mode,
  orderId,
  onClose,
  onSaved,
}: PurchaseOrderFormDrawerProps): JSX.Element {
  const order = useQuery(
    purchaseOrderQueryOptions(orderId ?? "", mode === "edit"),
  );
  const suppliers = useQuery(
    suppliersQueryOptions({ page: 1, pageSize: 100, active: true }, true),
  );
  const [productSearch, setProductSearch] = useState("");
  const products = useQuery(
    catalogProductsQueryOptions({
      page: 1,
      pageSize: 100,
      active: true,
      ...(productSearch.trim().length === 0 ? {} : { q: productSearch.trim() }),
    }),
  );
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_ORDER);
  const [lines, setLines] = useState<OrderLineDraft[]>([blankLine(1)]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const initialized = useRef<string | null>(
    mode === "create" ? "create" : null,
  );
  const nextLineKey = useRef(2);
  const submittingRef = useRef(false);
  const validationSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      mode !== "edit" ||
      order.data === undefined ||
      initialized.current === order.data.id
    ) {
      return;
    }
    setFieldErrors({});
    const loadedLines = lineDrafts(order.data);
    setDraft(orderDraft(order.data));
    setLines(loadedLines);
    nextLineKey.current = loadedLines.length + 1;
    initialized.current = order.data.id;
  }, [mode, order.data]);

  useEffect(() => {
    if (validationAttempt > 0) {
      focusValidationSummary(validationSummaryRef.current);
    }
  }, [validationAttempt]);

  const closeIfIdle = useCallback(() => {
    if (!submittingRef.current) onClose();
  }, [onClose]);

  const options = useMemo(() => {
    const values = new Map<string, ProductOption>();
    for (const product of products.data?.items ?? []) {
      values.set(product.id, productOption(product));
    }
    for (const line of order.data?.lines ?? []) {
      values.set(line.productVariant.id, {
        id: line.productVariant.id,
        sku: line.productVariant.sku,
        name: line.productVariant.name,
        trackingType: line.productVariant.trackingType,
      });
    }
    return [...values.values()].sort((left, right) =>
      left.sku.localeCompare(right.sku),
    );
  }, [order.data?.lines, products.data?.items]);

  const totalMinor = useMemo(() => {
    try {
      return sum(
        lines.map((line) =>
          multiplyByQuantity(
            fromMajor(line.unitCostMajor),
            Number(line.quantity),
          ),
        ),
      );
    } catch {
      return null;
    }
  }, [lines]);

  const updateLine = (
    key: number,
    field: keyof Omit<OrderLineDraft, "key">,
    value: string,
  ): void => {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  };

  const submit = async (): Promise<void> => {
    if (submittingRef.current) return;
    setFieldErrors({});
    setSubmissionError(null);
    const raw = {
      supplierId: draft.supplierId,
      expectedOn: draft.expectedOn.length === 0 ? null : draft.expectedOn,
      notes: draft.notes,
      lines: lines.map((line) => ({
        productVariantId: line.productVariantId,
        quantity: Number(line.quantity),
        unitCostMinor: minorFromMajor(line.unitCostMajor),
        notes: line.notes,
      })),
    };

    if (mode === "edit") {
      if (order.data === undefined) return;
      const parsed = UpdatePurchaseOrderInputSchema.safeParse({
        ...raw,
        version: order.data.version,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        setValidationAttempt((current) => current + 1);
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const saved = await updatePurchaseOrder(order.data.id, parsed.data);
        submittingRef.current = false;
        onSaved(saved);
      } catch (error) {
        setSubmissionError(asPurchasingError(error));
        submittingRef.current = false;
        setSubmitting(false);
      }
      return;
    }

    const parsed = CreatePurchaseOrderInputSchema.safeParse(raw);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      setValidationAttempt((current) => current + 1);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await createPurchaseOrder(parsed.data);
      submittingRef.current = false;
      onSaved(saved);
    } catch (error) {
      setSubmissionError(asPurchasingError(error));
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const referenceError =
    (mode === "edit" && order.data === undefined ? order.error : null) ??
    (suppliers.data === undefined ? suppliers.error : null) ??
    (products.data === undefined ? products.error : null);
  const loadingRequired =
    referenceError === null &&
    ((mode === "edit" && order.data === undefined) ||
      suppliers.data === undefined ||
      products.data === undefined);
  const validationMessages = [
    ...new Set(Object.values(fieldErrors).flatMap((messages) => messages)),
  ];

  return (
    <CatalogDrawer
      description="Draft orders reserve no stock and create no payable. Approval, ordering, and receiving are separate controlled actions."
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
            disabled={submitting || loadingRequired || referenceError !== null}
            onClick={() => void submit()}
            type="button"
          >
            {submitting
              ? "Saving..."
              : mode === "create"
                ? "Create draft"
                : "Save draft"}
          </button>
        </>
      }
      onClose={closeIfIdle}
      title={mode === "create" ? "New purchase order" : "Edit purchase order"}
      titleId="purchase-order-form-title"
    >
      {referenceError !== null ? (
        <div>
          <MutationErrorBanner
            error={asPurchasingError(referenceError)}
            title="Order references could not be loaded"
          />
          <button
            className={`${secondaryButtonClass} mt-3`}
            onClick={() => {
              if (mode === "edit") void order.refetch();
              void suppliers.refetch();
              void products.refetch();
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : (mode === "edit" && order.data === undefined) ||
        suppliers.data === undefined ||
        products.data === undefined ? (
        <div
          className="flex items-center gap-3 py-8 text-sm text-ink-muted"
          role="status"
        >
          <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          Loading order references...
        </div>
      ) : (
        <div className="space-y-5">
          {submissionError === null ? null : (
            <MutationErrorBanner
              error={submissionError}
              title="Purchase order was not saved"
            />
          )}
          <ValidationSummary
            focusRef={validationSummaryRef}
            id={ORDER_VALIDATION_SUMMARY_ID}
            messages={validationMessages}
            title="Review the purchase order before saving"
          />

          <section className="grid gap-4 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
              Supplier <span className="text-negative">*</span>
              <select
                {...fieldErrorControlProps(
                  ORDER_SUPPLIER_ERROR_ID,
                  fieldErrors.supplierId,
                  "Supplier",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    supplierId: event.target.value,
                  }))
                }
                required
                value={draft.supplierId}
              >
                <option value="">Select an active supplier</option>
                {order.data !== undefined &&
                !suppliers.data.items.some(
                  (supplier) => supplier.id === order.data?.supplier.id,
                ) ? (
                  <option value={order.data.supplier.id}>
                    {order.data.supplier.code} - {order.data.supplier.name}
                  </option>
                ) : null}
                {suppliers.data.items.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.code} - {supplier.name}
                  </option>
                ))}
              </select>
              <FieldError
                id={ORDER_SUPPLIER_ERROR_ID}
                messages={fieldErrors.supplierId}
              />
            </label>
            <label className={labelClass}>
              Expected delivery
              <input
                {...fieldErrorControlProps(
                  ORDER_EXPECTED_ON_ERROR_ID,
                  fieldErrors.expectedOn,
                  "Expected delivery",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    expectedOn: event.target.value,
                  }))
                }
                type="date"
                value={draft.expectedOn}
              />
              <FieldError
                id={ORDER_EXPECTED_ON_ERROR_ID}
                messages={fieldErrors.expectedOn}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Notes
              <textarea
                {...fieldErrorControlProps(
                  ORDER_NOTES_ERROR_ID,
                  fieldErrors.notes,
                  "Purchase order notes",
                )}
                className={`${controlClass} mt-1.5 min-h-20 resize-y`}
                disabled={submitting}
                maxLength={PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                value={draft.notes}
              />
              <FieldError
                id={ORDER_NOTES_ERROR_ID}
                messages={fieldErrors.notes}
              />
            </label>
          </section>

          <section className="border-t border-line pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">Purchase lines</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Costs are entered in PKR. Serialized and quantity-tracked
                  products are received through their appropriate flow later.
                </p>
              </div>
              <button
                className={secondaryButtonClass}
                disabled={
                  submitting ||
                  lines.length >=
                    PURCHASING_CONTRACT_LIMITS.MAX_LINES_PER_PURCHASE_ORDER
                }
                onClick={() => {
                  const key = nextLineKey.current;
                  nextLineKey.current += 1;
                  setFieldErrors({});
                  setLines((current) => [...current, blankLine(key)]);
                }}
                type="button"
              >
                <PlusIcon className="size-4" /> Add line
              </button>
            </div>

            <label className={`${labelClass} mt-4`}>
              Find products
              <input
                className={`${controlClass} mt-1.5`}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Search SKU, model, name, barcode, or alias"
                value={productSearch}
              />
            </label>
            {products.isFetching ? (
              <p className="mt-1 text-xs text-ink-muted" role="status">
                Refreshing product choices...
              </p>
            ) : null}

            <div className="mt-4 space-y-3">
              {lines.map((line, index) => {
                const selected = options.find(
                  (option) => option.id === line.productVariantId,
                );
                return (
                  <div
                    className="rounded-control border border-line bg-surface-subtle p-3"
                    key={line.key}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-ink-subtle">
                        Line {index + 1}
                        {selected === undefined
                          ? ""
                          : ` - ${selected.trackingType}`}
                      </p>
                      <button
                        className="text-xs font-semibold text-negative hover:underline"
                        disabled={submitting || lines.length === 1}
                        onClick={() => {
                          setFieldErrors({});
                          setLines((current) =>
                            current.filter((item) => item.key !== line.key),
                          );
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={`${labelClass} sm:col-span-2`}>
                        Product
                        <select
                          {...fieldErrorControlProps(
                            `purchase-order-line-${line.key}-product-error`,
                            fieldErrors[`lines.${index}.productVariantId`],
                            `Product for purchase line ${index + 1}`,
                          )}
                          className={`${controlClass} mt-1`}
                          disabled={submitting}
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "productVariantId",
                              event.target.value,
                            )
                          }
                          required
                          value={line.productVariantId}
                        >
                          <option value="">Select product</option>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.sku} - {option.name} (
                              {option.trackingType})
                            </option>
                          ))}
                        </select>
                        <FieldError
                          id={`purchase-order-line-${line.key}-product-error`}
                          messages={
                            fieldErrors[`lines.${index}.productVariantId`]
                          }
                        />
                      </label>
                      <label className={labelClass}>
                        Quantity
                        <input
                          {...fieldErrorControlProps(
                            `purchase-order-line-${line.key}-quantity-error`,
                            fieldErrors[`lines.${index}.quantity`],
                            `Quantity for purchase line ${index + 1}`,
                          )}
                          className={`${controlClass} mt-1`}
                          disabled={submitting}
                          min={1}
                          onChange={(event) =>
                            updateLine(line.key, "quantity", event.target.value)
                          }
                          required
                          type="number"
                          value={line.quantity}
                        />
                        <FieldError
                          id={`purchase-order-line-${line.key}-quantity-error`}
                          messages={fieldErrors[`lines.${index}.quantity`]}
                        />
                      </label>
                      <label className={labelClass}>
                        Unit cost (PKR)
                        <input
                          {...fieldErrorControlProps(
                            `purchase-order-line-${line.key}-unit-cost-error`,
                            fieldErrors[`lines.${index}.unitCostMinor`],
                            `Unit cost for purchase line ${index + 1}`,
                          )}
                          className={`${controlClass} mt-1 font-mono`}
                          disabled={submitting}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateLine(
                              line.key,
                              "unitCostMajor",
                              event.target.value,
                            )
                          }
                          placeholder="0.00"
                          required
                          value={line.unitCostMajor}
                        />
                        <FieldError
                          id={`purchase-order-line-${line.key}-unit-cost-error`}
                          messages={fieldErrors[`lines.${index}.unitCostMinor`]}
                        />
                      </label>
                      <label className={`${labelClass} sm:col-span-2`}>
                        Line notes
                        <input
                          {...fieldErrorControlProps(
                            `purchase-order-line-${line.key}-notes-error`,
                            fieldErrors[`lines.${index}.notes`],
                            `Notes for purchase line ${index + 1}`,
                          )}
                          className={`${controlClass} mt-1`}
                          disabled={submitting}
                          onChange={(event) =>
                            updateLine(line.key, "notes", event.target.value)
                          }
                          value={line.notes}
                        />
                        <FieldError
                          id={`purchase-order-line-${line.key}-notes-error`}
                          messages={fieldErrors[`lines.${index}.notes`]}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <FieldError
              id={ORDER_LINES_ERROR_ID}
              messages={fieldErrors.lines}
            />
          </section>

          <div className="rounded-control border border-accent/20 bg-accent-soft p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold text-ink-subtle">Draft total</span>
              <strong className="text-base text-ink">
                {totalMinor === null
                  ? "Review line values"
                  : moneyText(totalMinor)}
              </strong>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              No stock or supplier payable is created until goods are received.
            </p>
          </div>
        </div>
      )}
    </CatalogDrawer>
  );
}
