"use client";

import {
  fromMajor,
  toMajorString,
  toMinor,
  type EffectiveSalePrice,
  type SetVariantDefaultPriceInput,
  type VariantDefaultPriceResponse,
} from "@mobileshop/shared";
import { useState, type FormEvent, type JSX } from "react";
import { CheckCircleIcon } from "@/components/ui/icons";
import { toApiError, type ApiError } from "@/lib/api/client";
import { setVariantDefaultPrice } from "@/lib/api/pricing";

export interface ProductPriceDraft {
  readonly sellingPrice: string;
  readonly minimumPrice: string;
}

type ProductPriceField = keyof ProductPriceDraft;

export type ProductPriceDraftResult =
  | { readonly ok: true; readonly input: SetVariantDefaultPriceInput }
  | {
      readonly ok: false;
      readonly errors: Readonly<Partial<Record<ProductPriceField, string>>>;
    };

const EMPTY_DRAFT: ProductPriceDraft = {
  sellingPrice: "",
  minimumPrice: "",
};

/**
 * Only a variant default can safely prefill this fallback-price form. A live
 * rule may override a different hidden fallback, so copying that rule into the
 * form would silently change data the operator never read.
 */
export function productPriceDraftFrom(
  effectivePrice: EffectiveSalePrice | null,
): ProductPriceDraft {
  if (effectivePrice?.source !== "variant_default") return EMPTY_DRAFT;
  return {
    sellingPrice: toMajorString(
      toMinor(effectivePrice.unitPriceMinor, "default selling price"),
      "PKR",
    ),
    minimumPrice: toMajorString(
      toMinor(effectivePrice.minimumUnitPriceMinor, "minimum selling price"),
      "PKR",
    ),
  };
}

function parsePkrAmount(
  value: string,
  field: ProductPriceField,
  errors: Partial<Record<ProductPriceField, string>>,
): number | null {
  if (value.trim().length === 0) {
    errors[field] = "Enter an amount in PKR.";
    return null;
  }
  try {
    const minor = fromMajor(value, "PKR") as number;
    if (minor < 0) {
      errors[field] = "Amount cannot be negative.";
      return null;
    }
    return minor;
  } catch {
    errors[field] = "Use a valid PKR amount with at most 2 decimal places.";
    return null;
  }
}

/** Convert decimal PKR text to exact integer paisa; floating point is unused. */
export function productPriceInputFromDraft(
  draft: ProductPriceDraft,
  productVersion: number,
): ProductPriceDraftResult {
  const errors: Partial<Record<ProductPriceField, string>> = {};
  const unitPriceMinor = parsePkrAmount(
    draft.sellingPrice,
    "sellingPrice",
    errors,
  );
  const minimumUnitPriceMinor = parsePkrAmount(
    draft.minimumPrice,
    "minimumPrice",
    errors,
  );

  if (
    unitPriceMinor !== null &&
    minimumUnitPriceMinor !== null &&
    minimumUnitPriceMinor > unitPriceMinor
  ) {
    errors.minimumPrice = "Minimum price cannot exceed the selling price.";
  }
  if (!Number.isSafeInteger(productVersion) || productVersion <= 0) {
    errors.sellingPrice =
      "This product version is invalid. Reload the catalog before saving.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    input: {
      unitPriceMinor: unitPriceMinor as number,
      minimumUnitPriceMinor: minimumUnitPriceMinor as number,
      productVersion,
    },
  };
}

export function productPriceSaveErrorMessage(error: ApiError): string {
  if (error.code === "OPTIMISTIC_LOCK_FAILED") {
    return "This product changed after the drawer opened. Reload it and reapply the price.";
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return "Your current permissions do not allow pricing changes.";
  }
  if (error.code === "NETWORK_ERROR") {
    return "The pricing API could not be reached. Check the connection and try again.";
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return "The pricing API did not respond in time. Try again.";
  }
  if (error.code === "VALIDATION_FAILED") {
    return `The pricing API rejected this price: ${error.message}`;
  }
  return "The default price could not be saved. Try again.";
}

export interface ProductPricingFormProps {
  readonly productVariantId: string;
  readonly productVersion: number;
  readonly effectivePrice: EffectiveSalePrice | null;
  readonly canManage: boolean;
  readonly onSaved: (response: VariantDefaultPriceResponse) => void;
}

export function ProductPricingForm({
  productVariantId,
  productVersion: initialProductVersion,
  effectivePrice,
  canManage,
  onSaved,
}: ProductPricingFormProps): JSX.Element {
  const [draft, setDraft] = useState(() =>
    productPriceDraftFrom(effectivePrice),
  );
  const [productVersion, setProductVersion] = useState(initialProductVersion);
  const [errors, setErrors] = useState<
    Readonly<Partial<Record<ProductPriceField, string>>>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!canManage) {
    return (
      <p className="mt-4 rounded-control bg-surface-subtle px-3 py-2.5 text-xs text-ink-muted">
        View only. Changing the default price requires the pricing.manage
        permission.
      </p>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const result = productPriceInputFromDraft(draft, productVersion);
    if (!result.ok) {
      setErrors(result.errors);
      setSaved(false);
      return;
    }

    setErrors({});
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      const response = await setVariantDefaultPrice(
        productVariantId,
        result.input,
      );
      setDraft(productPriceDraftFrom(response.effectivePrice));
      setProductVersion(response.effectivePrice.version);
      setSaved(true);
      onSaved(response);
    } catch (error) {
      setSaveError(productPriceSaveErrorMessage(toApiError(error)));
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "mt-1 min-h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

  return (
    <form
      className="mt-4 border-t border-line-subtle pt-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <h4 className="text-sm font-semibold text-ink">Default price</h4>
      <p className="mt-1 text-xs text-ink-muted">
        Used when no active branch or organization price rule overrides it.
        Values are entered in PKR and saved exactly to paisa.
      </p>
      {effectivePrice?.source === "price_rule" ? (
        <p className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
          An active price rule is currently effective. Its amount is not copied
          into these fallback fields.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-ink-subtle">
          Selling price (PKR)
          <input
            aria-invalid={errors.sellingPrice === undefined ? undefined : true}
            autoComplete="off"
            className={fieldClass}
            inputMode="decimal"
            name="sellingPrice"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                sellingPrice: event.target.value,
              }));
            }}
            placeholder="0.00"
            required
            value={draft.sellingPrice}
          />
          {errors.sellingPrice === undefined ? null : (
            <span className="mt-1 block font-normal text-negative">
              {errors.sellingPrice}
            </span>
          )}
        </label>

        <label className="text-xs font-semibold text-ink-subtle">
          Minimum price (PKR)
          <input
            aria-invalid={errors.minimumPrice === undefined ? undefined : true}
            autoComplete="off"
            className={fieldClass}
            inputMode="decimal"
            name="minimumPrice"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                minimumPrice: event.target.value,
              }));
            }}
            placeholder="0.00"
            required
            value={draft.minimumPrice}
          />
          {errors.minimumPrice === undefined ? null : (
            <span className="mt-1 block font-normal text-negative">
              {errors.minimumPrice}
            </span>
          )}
        </label>
      </div>

      {saveError === null ? null : (
        <p className="mt-3 text-xs font-medium text-negative" role="alert">
          {saveError}
        </p>
      )}
      {saved ? (
        <p
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-positive"
          role="status"
        >
          <CheckCircleIcon className="size-4" /> Default price saved.
        </p>
      ) : null}

      <button
        className="mt-3 inline-flex min-h-10 items-center rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-55"
        disabled={saving}
        type="submit"
      >
        {saving ? "Saving price…" : "Save default price"}
      </button>
    </form>
  );
}
