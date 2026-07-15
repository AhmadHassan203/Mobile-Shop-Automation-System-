"use client";

import {
  CATALOG_CONTRACT_LIMITS,
  type BrandReference,
} from "@mobileshop/shared";
import { useCallback, useRef, useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { CatalogDrawer } from "./catalog-drawer";
import {
  ReferenceErrorBanner,
  ReferenceFieldError,
  controlClass,
} from "./reference-tab-parts";
import {
  clientOrApiError,
  fieldMessages,
  mergeFieldMessages,
  referenceErrorMessage,
} from "./reference-tab-state";
import {
  createCatalogBrand,
  createCatalogBrandSchema,
  updateCatalogBrand,
  updateCatalogBrandSchema,
} from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/client";

interface BrandFormValues {
  readonly name: string;
}

export interface BrandFormDrawerProps {
  readonly mode: "create" | "edit";
  readonly brand?: BrandReference | undefined;
  readonly onClose: () => void;
  readonly onSaved: (brand: BrandReference) => void;
}

const FORM_ID = "brand-form";
const TITLE_ID = "brand-form-title";
const NAME_ERROR_ID = "brand-form-name-error";

function createBrand(name: string): Promise<BrandReference> {
  return createCatalogBrand(createCatalogBrandSchema.parse({ name }));
}

/** The version the editor opened travels with the edit, never a re-read one. */
function updateBrand(
  brand: BrandReference,
  name: string,
): Promise<BrandReference> {
  return updateCatalogBrand(
    brand.id,
    updateCatalogBrandSchema.parse({ name, version: brand.version }),
  );
}

/**
 * Create or rename a brand. Self-contained by design: it owns its own mutation
 * and error handling so the Add Product flow can open it to fix a missing brand
 * without the user losing the product they were part-way through describing.
 */
export function BrandFormDrawer({
  mode,
  brand,
  onClose,
  onSaved,
}: BrandFormDrawerProps): JSX.Element {
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Read by the close handler, which must keep a stable identity: the drawer
  // re-focuses its panel whenever `onClose` changes, which would yank focus out
  // of the field on every parent re-render.
  const submittingRef = useRef(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setFocus,
  } = useForm<BrandFormValues>({
    defaultValues: { name: brand?.name ?? "" },
  });

  const closeIfIdle = useCallback(() => {
    if (!submittingRef.current) onClose();
  }, [onClose]);

  const submit = async (values: BrandFormValues): Promise<void> => {
    if (submittingRef.current) return;
    setSubmissionError(null);
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const saved =
        mode === "edit" && brand !== undefined
          ? await updateBrand(brand, values.name)
          : await createBrand(values.name);
      submittingRef.current = false;
      onSaved(saved);
    } catch (error) {
      setSubmissionError(clientOrApiError(error, "Review the brand name."));
      submittingRef.current = false;
      setSubmitting(false);
      setFocus("name");
    }
  };

  const nameMessages = mergeFieldMessages(
    errors.name?.message,
    fieldMessages(submissionError, "name"),
  );

  return (
    <CatalogDrawer
      description={
        mode === "create"
          ? "Brands group the models you sell. This creates catalog identity only."
          : "Renaming a brand updates every model and product that references it."
      }
      footer={
        <>
          <button
            className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-wait disabled:opacity-50"
            disabled={submitting}
            onClick={closeIfIdle}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={submitting}
            form={FORM_ID}
            type="submit"
          >
            {submitting ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : null}
            {submitting
              ? "Saving…"
              : mode === "create"
                ? "Create brand"
                : "Save changes"}
          </button>
        </>
      }
      onClose={closeIfIdle}
      title={mode === "create" ? "New brand" : "Edit brand"}
      titleId={TITLE_ID}
    >
      {submissionError === null ? null : (
        <ReferenceErrorBanner
          message={referenceErrorMessage(submissionError, "brand")}
          requestId={submissionError.requestId}
          title={
            mode === "create" ? "Brand was not created" : "Brand was not saved"
          }
        />
      )}

      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => submit(values))(event);
        }}
      >
        <fieldset disabled={submitting}>
          <label className="block text-xs font-semibold text-ink-subtle">
            Brand name <span className="text-negative">*</span>
            <input
              aria-describedby={
                nameMessages === undefined ? undefined : NAME_ERROR_ID
              }
              aria-invalid={nameMessages !== undefined}
              autoComplete="off"
              className={`${controlClass} mt-1.5`}
              placeholder="Samsung"
              {...register("name", {
                required: "Enter a brand name.",
                validate: (value) =>
                  value.trim().length > 0 || "Enter a brand name.",
                maxLength: {
                  value: CATALOG_CONTRACT_LIMITS.NAME_LENGTH,
                  message: `Name must be ${CATALOG_CONTRACT_LIMITS.NAME_LENGTH} characters or fewer.`,
                },
              })}
            />
          </label>
          <ReferenceFieldError id={NAME_ERROR_ID} messages={nameMessages} />
        </fieldset>
      </form>
    </CatalogDrawer>
  );
}
