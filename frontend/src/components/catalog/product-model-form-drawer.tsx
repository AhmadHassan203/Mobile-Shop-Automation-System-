"use client";

import {
  CATALOG_CONTRACT_LIMITS,
  type ProductModelReference,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
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
import { RefreshIcon } from "@/components/ui/icons";
import {
  createCatalogProductModel,
  createCatalogProductModelSchema,
  updateCatalogProductModel,
  updateCatalogProductModelSchema,
} from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/client";
import { catalogReferencesQueryOptions } from "@/lib/query/catalog-query";

interface ProductModelFormValues {
  readonly name: string;
  readonly brandId: string;
  readonly categoryId: string;
}

export interface ProductModelFormDrawerProps {
  readonly mode: "create" | "edit";
  readonly model?: ProductModelReference | undefined;
  readonly onClose: () => void;
  readonly onSaved: (model: ProductModelReference) => void;
}

const FORM_ID = "product-model-form";
const TITLE_ID = "product-model-form-title";
const NAME_ERROR_ID = "product-model-form-name-error";
const BRAND_ERROR_ID = "product-model-form-brand-error";
const CATEGORY_ERROR_ID = "product-model-form-category-error";

function createModel(
  values: ProductModelFormValues,
): Promise<ProductModelReference> {
  return createCatalogProductModel(
    createCatalogProductModelSchema.parse({
      name: values.name,
      brandId: values.brandId,
      categoryId: values.categoryId,
    }),
  );
}

function updateModel(
  model: ProductModelReference,
  values: ProductModelFormValues,
): Promise<ProductModelReference> {
  return updateCatalogProductModel(
    model.id,
    updateCatalogProductModelSchema.parse({
      name: values.name,
      brandId: values.brandId,
      categoryId: values.categoryId,
      version: model.version,
    }),
  );
}

/**
 * Create or edit a product model — the brand/category pairing that products
 * hang off. Both selects offer active records only, matching the server's
 * create-time rule that a model cannot reference a retired brand or category.
 */
export function ProductModelFormDrawer({
  mode,
  model,
  onClose,
  onSaved,
}: ProductModelFormDrawerProps): JSX.Element {
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const references = useQuery(catalogReferencesQueryOptions(true));
  const {
    formState: { errors },
    handleSubmit,
    register,
    setFocus,
  } = useForm<ProductModelFormValues>({
    defaultValues: {
      name: model?.name ?? "",
      brandId: model?.brandId ?? "",
      categoryId: model?.categoryId ?? "",
    },
  });

  const closeIfIdle = useCallback(() => {
    if (!submittingRef.current) onClose();
  }, [onClose]);

  const submit = async (values: ProductModelFormValues): Promise<void> => {
    if (submittingRef.current) return;
    setSubmissionError(null);
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const saved =
        mode === "edit" && model !== undefined
          ? await updateModel(model, values)
          : await createModel(values);
      submittingRef.current = false;
      onSaved(saved);
    } catch (error) {
      setSubmissionError(clientOrApiError(error, "Review the product model."));
      submittingRef.current = false;
      setSubmitting(false);
      setFocus("name");
    }
  };

  const brands = references.data?.brands ?? [];
  const categories = references.data?.categories ?? [];
  // A model whose brand or category has since been retired keeps its real value
  // visible rather than silently re-pointing at whatever sorts first.
  const orphanedBrand =
    model !== undefined && !brands.some((brand) => brand.id === model.brandId)
      ? model
      : null;
  const orphanedCategory =
    model !== undefined &&
    !categories.some((category) => category.id === model.categoryId)
      ? model
      : null;

  const nameMessages = mergeFieldMessages(
    errors.name?.message,
    fieldMessages(submissionError, "name"),
  );
  const brandMessages = mergeFieldMessages(
    errors.brandId?.message,
    fieldMessages(submissionError, "brandId"),
  );
  const categoryMessages = mergeFieldMessages(
    errors.categoryId?.message,
    fieldMessages(submissionError, "categoryId"),
  );

  return (
    <CatalogDrawer
      description={
        mode === "create"
          ? "A model is a brand and category pairing. This creates catalog identity only."
          : "Editing a model updates every product that references it."
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
            disabled={submitting || references.isPending}
            form={FORM_ID}
            type="submit"
          >
            {submitting ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : null}
            {submitting
              ? "Saving…"
              : mode === "create"
                ? "Create model"
                : "Save changes"}
          </button>
        </>
      }
      onClose={closeIfIdle}
      title={mode === "create" ? "New product model" : "Edit product model"}
      titleId={TITLE_ID}
    >
      {submissionError === null ? null : (
        <ReferenceErrorBanner
          message={referenceErrorMessage(submissionError, "productModel")}
          requestId={submissionError.requestId}
          title={
            mode === "create" ? "Model was not created" : "Model was not saved"
          }
        />
      )}

      {references.isError ? (
        <div
          className="mb-4 rounded-control bg-warning-soft p-2.5 text-xs text-warning"
          role="alert"
        >
          <p>
            Active brands and categories could not be loaded, so this model
            cannot be saved yet.
          </p>
          <button
            className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-control border border-warning/30 px-2.5 text-xs font-semibold hover:bg-warning/10"
            onClick={() => {
              void references.refetch();
            }}
            type="button"
          >
            <RefreshIcon className="size-3.5" /> Retry
          </button>
        </div>
      ) : null}

      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => submit(values))(event);
        }}
      >
        <fieldset disabled={submitting}>
          <label className="block text-xs font-semibold text-ink-subtle">
            Model name <span className="text-negative">*</span>
            <input
              aria-describedby={
                nameMessages === undefined ? undefined : NAME_ERROR_ID
              }
              aria-invalid={nameMessages !== undefined}
              autoComplete="off"
              className={`${controlClass} mt-1.5`}
              placeholder="Galaxy A56"
              {...register("name", {
                required: "Enter a model name.",
                validate: (value) =>
                  value.trim().length > 0 || "Enter a model name.",
                maxLength: {
                  value: CATALOG_CONTRACT_LIMITS.NAME_LENGTH,
                  message: `Name must be ${CATALOG_CONTRACT_LIMITS.NAME_LENGTH} characters or fewer.`,
                },
              })}
            />
          </label>
          <ReferenceFieldError id={NAME_ERROR_ID} messages={nameMessages} />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-ink-subtle">
                Brand <span className="text-negative">*</span>
                <select
                  aria-describedby={
                    brandMessages === undefined ? undefined : BRAND_ERROR_ID
                  }
                  aria-invalid={brandMessages !== undefined}
                  className={`${controlClass} mt-1.5`}
                  disabled={references.isPending}
                  {...register("brandId", { required: "Select a brand." })}
                >
                  <option value="">Select a brand</option>
                  {orphanedBrand === null ? null : (
                    <option value={orphanedBrand.brandId}>
                      {orphanedBrand.brandName} — not in the active list
                    </option>
                  )}
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <ReferenceFieldError
                id={BRAND_ERROR_ID}
                messages={brandMessages}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-subtle">
                Category <span className="text-negative">*</span>
                <select
                  aria-describedby={
                    categoryMessages === undefined
                      ? undefined
                      : CATEGORY_ERROR_ID
                  }
                  aria-invalid={categoryMessages !== undefined}
                  className={`${controlClass} mt-1.5`}
                  disabled={references.isPending}
                  {...register("categoryId", {
                    required: "Select a category.",
                  })}
                >
                  <option value="">Select a category</option>
                  {orphanedCategory === null ? null : (
                    <option value={orphanedCategory.categoryId}>
                      {orphanedCategory.categoryName} — not in the active list
                    </option>
                  )}
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <ReferenceFieldError
                id={CATEGORY_ERROR_ID}
                messages={categoryMessages}
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            Only active brands and categories can be referenced.
          </p>
        </fieldset>
      </form>
    </CatalogDrawer>
  );
}
