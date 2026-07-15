"use client";

import {
  CATALOG_CONTRACT_LIMITS,
  type CategoryReference,
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
  createCatalogCategory,
  createCatalogCategorySchema,
  updateCatalogCategory,
  updateCatalogCategorySchema,
} from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/client";
import { catalogReferencesQueryOptions } from "@/lib/query/catalog-query";

interface CategoryFormValues {
  readonly name: string;
  /** "" is the wire-level "no parent"; the contract sends null. */
  readonly parentCategoryId: string;
}

export interface CategoryFormDrawerProps {
  readonly mode: "create" | "edit";
  readonly category?: CategoryReference | undefined;
  readonly onClose: () => void;
  readonly onSaved: (category: CategoryReference) => void;
}

const FORM_ID = "category-form";
const TITLE_ID = "category-form-title";
const NAME_ERROR_ID = "category-form-name-error";
const PARENT_ERROR_ID = "category-form-parent-error";

function createCategory(
  name: string,
  parentCategoryId: string | null,
): Promise<CategoryReference> {
  return createCatalogCategory(
    createCatalogCategorySchema.parse({ name, parentCategoryId }),
  );
}

function updateCategory(
  category: CategoryReference,
  name: string,
  parentCategoryId: string | null,
): Promise<CategoryReference> {
  return updateCatalogCategory(
    category.id,
    updateCatalogCategorySchema.parse({
      name,
      parentCategoryId,
      version: category.version,
    }),
  );
}

/**
 * Create or edit a category, including where it sits in the tree.
 *
 * The parent list offers active categories only and never the category being
 * edited. Deeper cycles (re-parenting under one's own descendant) are the
 * server's call — it holds the whole tree and an advisory lock — so a rejection
 * lands inline on the parent field rather than being guessed at here.
 */
export function CategoryFormDrawer({
  mode,
  category,
  onClose,
  onSaved,
}: CategoryFormDrawerProps): JSX.Element {
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const references = useQuery(catalogReferencesQueryOptions(true));
  const {
    formState: { errors },
    handleSubmit,
    register,
    setFocus,
  } = useForm<CategoryFormValues>({
    defaultValues: {
      name: category?.name ?? "",
      parentCategoryId: category?.parentCategoryId ?? "",
    },
  });

  const closeIfIdle = useCallback(() => {
    if (!submittingRef.current) onClose();
  }, [onClose]);

  const submit = async (values: CategoryFormValues): Promise<void> => {
    if (submittingRef.current) return;
    setSubmissionError(null);
    submittingRef.current = true;
    setSubmitting(true);

    const parentCategoryId =
      values.parentCategoryId.length === 0 ? null : values.parentCategoryId;

    try {
      const saved =
        mode === "edit" && category !== undefined
          ? await updateCategory(category, values.name, parentCategoryId)
          : await createCategory(values.name, parentCategoryId);
      submittingRef.current = false;
      onSaved(saved);
    } catch (error) {
      setSubmissionError(clientOrApiError(error, "Review the category."));
      submittingRef.current = false;
      setSubmitting(false);
      setFocus("name");
    }
  };

  // A category can never parent itself, so it is not offered as its own parent.
  const parentOptions = (references.data?.categories ?? []).filter(
    (option) => option.id !== category?.id,
  );
  const currentParentId = category?.parentCategoryId ?? null;
  // An inactive (or not-yet-loaded) parent would otherwise vanish from the
  // select and silently save as "top level". Keep it selectable and truthful.
  const orphanedParentId =
    currentParentId !== null &&
    !parentOptions.some((option) => option.id === currentParentId)
      ? currentParentId
      : null;

  const nameMessages = mergeFieldMessages(
    errors.name?.message,
    fieldMessages(submissionError, "name"),
  );
  const parentMessages = fieldMessages(submissionError, "parentCategoryId");

  return (
    <CatalogDrawer
      description={
        mode === "create"
          ? "Categories organize models. This creates catalog identity only."
          : "Renaming or re-parenting a category updates everything filed under it."
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
                ? "Create category"
                : "Save changes"}
          </button>
        </>
      }
      onClose={closeIfIdle}
      title={mode === "create" ? "New category" : "Edit category"}
      titleId={TITLE_ID}
    >
      {submissionError === null ? null : (
        <ReferenceErrorBanner
          message={referenceErrorMessage(submissionError, "category")}
          requestId={submissionError.requestId}
          title={
            mode === "create"
              ? "Category was not created"
              : "Category was not saved"
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
            Category name <span className="text-negative">*</span>
            <input
              aria-describedby={
                nameMessages === undefined ? undefined : NAME_ERROR_ID
              }
              aria-invalid={nameMessages !== undefined}
              autoComplete="off"
              className={`${controlClass} mt-1.5`}
              placeholder="Smartphones"
              {...register("name", {
                required: "Enter a category name.",
                validate: (value) =>
                  value.trim().length > 0 || "Enter a category name.",
                maxLength: {
                  value: CATALOG_CONTRACT_LIMITS.NAME_LENGTH,
                  message: `Name must be ${CATALOG_CONTRACT_LIMITS.NAME_LENGTH} characters or fewer.`,
                },
              })}
            />
          </label>
          <ReferenceFieldError id={NAME_ERROR_ID} messages={nameMessages} />

          <label className="mt-4 block text-xs font-semibold text-ink-subtle">
            Parent category
            <select
              aria-describedby={
                parentMessages === undefined ? undefined : PARENT_ERROR_ID
              }
              aria-invalid={parentMessages !== undefined}
              className={`${controlClass} mt-1.5`}
              disabled={references.isPending}
              {...register("parentCategoryId")}
            >
              <option value="">No parent (top level)</option>
              {orphanedParentId === null ? null : (
                <option value={orphanedParentId}>
                  Current parent — not in the active list
                </option>
              )}
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <ReferenceFieldError id={PARENT_ERROR_ID} messages={parentMessages} />

          {references.isError ? (
            <div
              className="mt-2 rounded-control bg-warning-soft p-2.5 text-xs text-warning"
              role="alert"
            >
              <p>
                The active category list could not be loaded, so no parent can
                be chosen right now.
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
          ) : (
            <p className="mt-1.5 text-xs text-ink-muted">
              Only active categories can be a parent.
            </p>
          )}
        </fieldset>
      </form>
    </CatalogDrawer>
  );
}
