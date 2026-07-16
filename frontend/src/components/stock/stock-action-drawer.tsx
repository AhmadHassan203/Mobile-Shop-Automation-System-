"use client";

import {
  ADJUSTMENT_REASONS,
  ON_HAND_STOCK_STATES,
  SERIALIZED_STATE_TRANSITIONS,
  type SerializedStockState,
  type SerializedUnitSummary,
  type StockBalance,
  type StockLocationReference,
} from "@mobileshop/shared";
import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type JSX } from "react";
import { ZodError } from "zod";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import { AlertTriangleIcon } from "@/components/ui/icons";
import type { CatalogProduct } from "@/lib/api/catalog";
import {
  adjustStock,
  adjustStockInputSchema,
  releaseStock,
  releaseStockInputSchema,
  reserveStock,
  reserveStockInputSchema,
  transferSerializedUnit,
  transferSerializedUnitInputSchema,
  transferStock,
  transferStockInputSchema,
  transitionSerializedUnit,
  transitionSerializedUnitInputSchema,
} from "@/lib/api/inventory";
import { ApiError } from "@/lib/api/client";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted";
const labelClass = "block text-xs font-semibold text-ink-subtle";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function inventoryMutationErrorMessage(error: ApiError): string {
  if (error.code === "OPTIMISTIC_LOCK_FAILED") {
    return "This stock changed after you opened the action. Nothing was changed. Close this panel, refresh, and try again.";
  }
  if (
    error.code === "INVENTORY_INSUFFICIENT_STOCK" ||
    error.code === "INVENTORY_NEGATIVE_STOCK_BLOCKED"
  ) {
    return `${error.message} Nothing was changed.`;
  }
  if (
    error.code === "INVENTORY_INVALID_STATE_TRANSITION" ||
    error.code === "INVENTORY_UNIT_NOT_AVAILABLE" ||
    error.code === "INVENTORY_UNIT_ALREADY_SOLD" ||
    error.code === "INVENTORY_DIRECT_EDIT_BLOCKED"
  ) {
    return `${error.message} Reload the inventory before choosing another action.`;
  }
  if (error.code === "VALIDATION_FAILED") {
    return `${error.message} Nothing was changed.`;
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return "Your current permissions do not allow this stock action. Nothing was changed.";
  }
  if (error.code === "NETWORK_ERROR") {
    return "The inventory API could not be reached, so the action was not confirmed. Reload before retrying.";
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return "The inventory API did not respond in time. Reload before retrying so the action is not duplicated.";
  }
  return "The stock action could not be completed. Nothing is shown as changed; reload before trying again.";
}

type FieldErrors = Readonly<Record<string, readonly string[]>>;

function zodFieldErrors(error: ZodError): FieldErrors {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}

function optionalReason(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function FieldError({
  errors,
}: {
  readonly errors: readonly string[] | undefined;
}) {
  return errors === undefined ? null : (
    <p className="mt-1 text-xs text-negative">{errors.join(" ")}</p>
  );
}

export type QuantityStockAction = "adjust" | "reserve" | "release" | "transfer";

interface QuantityActionDrawerProps {
  readonly action: QuantityStockAction;
  readonly target?: StockBalance;
  readonly products: readonly CatalogProduct[];
  readonly locations: readonly StockLocationReference[];
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}

const quantityActionTitles: Readonly<Record<QuantityStockAction, string>> = {
  adjust: "Adjust quantity stock",
  reserve: "Reserve quantity stock",
  release: "Release reserved stock",
  transfer: "Transfer quantity stock",
};

export function QuantityActionDrawer({
  action,
  target,
  products,
  locations,
  onClose,
  onSaved,
}: QuantityActionDrawerProps): JSX.Element {
  const formId = useId();
  const [productVariantId, setProductVariantId] = useState(
    target?.productVariant.id ?? products[0]?.id ?? "",
  );
  const [stockLocationId, setStockLocationId] = useState(
    target?.locationId ?? locations[0]?.id ?? "",
  );
  const [toStockLocationId, setToStockLocationId] = useState(
    locations.find((location) => location.id !== target?.locationId)?.id ?? "",
  );
  const [quantity, setQuantity] = useState("1");
  const [movementType, setMovementType] = useState<
    "adjustment_in" | "adjustment_out"
  >("adjustment_in");
  const [adjustmentReason, setAdjustmentReason] = useState<
    (typeof ADJUSTMENT_REASONS)[number]
  >("stock_count_correction");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<ApiError | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const numericQuantity = Number(quantity);
      if (action === "adjust") {
        const parsed = adjustStockInputSchema.parse({
          productVariantId,
          stockLocationId,
          movementType,
          quantity: numericQuantity,
          adjustmentReason,
          reason,
        });
        return adjustStock(parsed);
      }
      if (action === "transfer") {
        const parsed = transferStockInputSchema.parse({
          productVariantId,
          fromStockLocationId: stockLocationId,
          toStockLocationId,
          quantity: numericQuantity,
          reason,
        });
        return transferStock(parsed);
      }

      const unparsed = {
        productVariantId,
        stockLocationId,
        quantity: numericQuantity,
        ...(optionalReason(reason) === undefined
          ? {}
          : { reason: optionalReason(reason) }),
      };
      if (action === "reserve") {
        return reserveStock(reserveStockInputSchema.parse(unparsed));
      }
      return releaseStock(releaseStockInputSchema.parse(unparsed));
    },
    onSuccess: () => {
      onSaved(
        `${quantityActionTitles[action]} completed. Live stock is refreshing.`,
      );
    },
    onError: (error) => {
      if (error instanceof ZodError) {
        setFieldErrors(zodFieldErrors(error));
        return;
      }
      setRequestError(
        error instanceof ApiError
          ? error
          : new ApiError("Unexpected inventory error.", { cause: error }),
      );
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFieldErrors({});
    setRequestError(null);
    mutation.mutate();
  };

  const close = (): void => {
    if (!mutation.isPending) onClose();
  };

  const selectedProduct =
    target?.productVariant ??
    products.find((product) => product.id === productVariantId);
  const selectedLocation = locations.find(
    (location) => location.id === stockLocationId,
  );

  return (
    <CatalogDrawer
      description="Every confirmed change is written through the inventory ledger and audit trail."
      footer={
        <>
          <button
            className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:opacity-50"
            disabled={mutation.isPending}
            onClick={close}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={mutation.isPending}
            form={formId}
            type="submit"
          >
            {mutation.isPending ? "Confirming…" : "Confirm stock action"}
          </button>
        </>
      }
      onClose={close}
      title={quantityActionTitles[action]}
      titleId={`${formId}-title`}
    >
      <form className="space-y-4" id={formId} onSubmit={submit}>
        {requestError === null ? null : (
          <div
            className="flex items-start gap-2 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
            role="alert"
          >
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Stock was not changed</p>
              <p className="mt-0.5">
                {inventoryMutationErrorMessage(requestError)}
              </p>
              {requestError.requestId === undefined ? null : (
                <p className="mt-1 font-mono text-xs">
                  Ref: {requestError.requestId}
                </p>
              )}
            </div>
          </div>
        )}

        <label className={labelClass}>
          Product variant
          {target === undefined ? (
            <select
              className={controlClass}
              disabled={mutation.isPending}
              onChange={(event) => setProductVariantId(event.target.value)}
              value={productVariantId}
            >
              <option value="">Select a quantity-tracked product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={controlClass}
              disabled
              value={`${selectedProduct?.sku ?? ""} · ${selectedProduct?.name ?? ""}`}
            />
          )}
          <FieldError errors={fieldErrors.productVariantId} />
        </label>

        <label className={labelClass}>
          {action === "transfer" ? "Source location" : "Stock location"}
          {target === undefined ? (
            <select
              className={controlClass}
              disabled={mutation.isPending}
              onChange={(event) => setStockLocationId(event.target.value)}
              value={stockLocationId}
            >
              <option value="">Select a location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={controlClass}
              disabled
              value={
                selectedLocation === undefined
                  ? target.locationName
                  : `${selectedLocation.code} · ${selectedLocation.name}`
              }
            />
          )}
          <FieldError
            errors={
              action === "transfer"
                ? fieldErrors.fromStockLocationId
                : fieldErrors.stockLocationId
            }
          />
        </label>

        {action === "transfer" ? (
          <label className={labelClass}>
            Destination location
            <select
              className={controlClass}
              disabled={mutation.isPending}
              onChange={(event) => setToStockLocationId(event.target.value)}
              value={toStockLocationId}
            >
              <option value="">Select a different active location</option>
              {locations
                .filter((location) => location.id !== stockLocationId)
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} · {location.name}
                  </option>
                ))}
            </select>
            <FieldError errors={fieldErrors.toStockLocationId} />
          </label>
        ) : null}

        {action === "adjust" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Direction
              <select
                className={controlClass}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setMovementType(
                    event.target.value as "adjustment_in" | "adjustment_out",
                  )
                }
                value={movementType}
              >
                <option value="adjustment_in">Increase stock</option>
                <option value="adjustment_out">Reduce stock</option>
              </select>
            </label>
            <label className={labelClass}>
              Adjustment category
              <select
                className={controlClass}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setAdjustmentReason(
                    event.target.value as (typeof ADJUSTMENT_REASONS)[number],
                  )
                }
                value={adjustmentReason}
              >
                {ADJUSTMENT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <label className={labelClass}>
          Quantity
          <input
            className={controlClass}
            disabled={mutation.isPending}
            inputMode="numeric"
            min="1"
            onChange={(event) => setQuantity(event.target.value)}
            step="1"
            type="number"
            value={quantity}
          />
          <FieldError errors={fieldErrors.quantity} />
        </label>

        <label className={labelClass}>
          Reason{" "}
          {action === "reserve" || action === "release" ? "(optional)" : ""}
          <textarea
            className={`${controlClass} min-h-24 resize-y`}
            disabled={mutation.isPending}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this stock action is required"
            value={reason}
          />
          <FieldError errors={fieldErrors.reason} />
        </label>

        {action === "adjust" ? (
          <p className="rounded-control bg-warning-soft p-3 text-xs leading-5 text-warning">
            Use adjustments only to correct a proven count. Purchases, sales and
            returns must use their own workflows so their source documents
            remain linked to stock.
          </p>
        ) : null}
      </form>
    </CatalogDrawer>
  );
}

export type SerializedUnitAction = "transition" | "transfer";

export function allowedManualTransitions(
  state: SerializedStockState,
): readonly SerializedStockState[] {
  // The sales workflow alone may mark a handset sold. The backend enforces the
  // same boundary; filtering it here prevents offering a guaranteed refusal.
  return SERIALIZED_STATE_TRANSITIONS[state].filter((next) => next !== "sold");
}

export function canTransferSerializedUnit(
  unit: SerializedUnitSummary,
): boolean {
  return ON_HAND_STOCK_STATES.includes(unit.state) && unit.state !== "sold";
}

interface SerializedUnitActionDrawerProps {
  readonly action: SerializedUnitAction;
  readonly unit: SerializedUnitSummary;
  readonly locations: readonly StockLocationReference[];
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}

export function SerializedUnitActionDrawer({
  action,
  unit,
  locations,
  onClose,
  onSaved,
}: SerializedUnitActionDrawerProps): JSX.Element {
  const formId = useId();
  const transitions = allowedManualTransitions(unit.state);
  const [toState, setToState] = useState<SerializedStockState | "">(
    transitions[0] ?? "",
  );
  const [toStockLocationId, setToStockLocationId] = useState(
    locations.find((location) => location.id !== unit.stockLocation.id)?.id ??
      "",
  );
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<ApiError | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (action === "transition") {
        const parsed = transitionSerializedUnitInputSchema.parse({
          toState,
          reason,
          version: unit.version,
        });
        return transitionSerializedUnit(unit.id, parsed);
      }
      const parsed = transferSerializedUnitInputSchema.parse({
        toStockLocationId,
        reason,
        version: unit.version,
      });
      return transferSerializedUnit(unit.id, parsed);
    },
    onSuccess: () =>
      onSaved(
        action === "transition"
          ? "Serialized unit state changed. Live stock is refreshing."
          : "Serialized unit transferred. Live stock is refreshing.",
      ),
    onError: (error) => {
      if (error instanceof ZodError) {
        setFieldErrors(zodFieldErrors(error));
        return;
      }
      setRequestError(
        error instanceof ApiError
          ? error
          : new ApiError("Unexpected inventory error.", { cause: error }),
      );
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFieldErrors({});
    setRequestError(null);
    mutation.mutate();
  };
  const close = (): void => {
    if (!mutation.isPending) onClose();
  };
  const primaryIdentifier = unit.identifiers[0];

  return (
    <CatalogDrawer
      description="The unit version shown here is sent with the action, so a concurrent change cannot be overwritten."
      footer={
        <>
          <button
            className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:opacity-50"
            disabled={mutation.isPending}
            onClick={close}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={mutation.isPending}
            form={formId}
            type="submit"
          >
            {mutation.isPending ? "Confirming…" : "Confirm unit action"}
          </button>
        </>
      }
      onClose={close}
      title={action === "transition" ? "Change unit state" : "Transfer unit"}
      titleId={`${formId}-title`}
    >
      <form className="space-y-4" id={formId} onSubmit={submit}>
        {requestError === null ? null : (
          <div
            className="flex items-start gap-2 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
            role="alert"
          >
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Unit was not changed</p>
              <p className="mt-0.5">
                {inventoryMutationErrorMessage(requestError)}
              </p>
              {requestError.requestId === undefined ? null : (
                <p className="mt-1 font-mono text-xs">
                  Ref: {requestError.requestId}
                </p>
              )}
            </div>
          </div>
        )}

        <dl className="grid gap-3 rounded-control border border-line bg-surface-subtle p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Unit</dt>
            <dd className="mt-0.5 font-mono text-ink">
              {primaryIdentifier?.value ?? unit.id}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Product</dt>
            <dd className="mt-0.5 text-ink">
              {unit.productVariant.sku} · {unit.productVariant.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-muted">
              Current state
            </dt>
            <dd className="mt-0.5 text-ink">{titleCase(unit.state)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Location</dt>
            <dd className="mt-0.5 text-ink">
              {unit.stockLocation.code} · {unit.stockLocation.name}
            </dd>
          </div>
        </dl>

        {action === "transition" ? (
          <label className={labelClass}>
            New state
            <select
              className={controlClass}
              disabled={mutation.isPending}
              onChange={(event) =>
                setToState(event.target.value as SerializedStockState)
              }
              value={toState}
            >
              <option value="">Select an allowed state</option>
              {transitions.map((state) => (
                <option key={state} value={state}>
                  {titleCase(state)}
                </option>
              ))}
            </select>
            <FieldError errors={fieldErrors.toState} />
          </label>
        ) : (
          <label className={labelClass}>
            Destination location
            <select
              className={controlClass}
              disabled={mutation.isPending}
              onChange={(event) => setToStockLocationId(event.target.value)}
              value={toStockLocationId}
            >
              <option value="">Select a different active location</option>
              {locations
                .filter((location) => location.id !== unit.stockLocation.id)
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} · {location.name}
                  </option>
                ))}
            </select>
            <FieldError errors={fieldErrors.toStockLocationId} />
          </label>
        )}

        <label className={labelClass}>
          Reason
          <textarea
            className={`${controlClass} min-h-24 resize-y`}
            disabled={mutation.isPending}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this unit is changing"
            value={reason}
          />
          <FieldError errors={fieldErrors.reason} />
        </label>
      </form>
    </CatalogDrawer>
  );
}
