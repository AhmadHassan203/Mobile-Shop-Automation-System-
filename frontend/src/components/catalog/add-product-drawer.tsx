"use client";

import {
  CATALOG_CONTRACT_LIMITS,
  PRODUCT_CONDITIONS,
  PTA_STATUSES,
  TRACKING_TYPES,
  WARRANTY_TYPES,
} from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState, type JSX } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { BrandFormDrawer } from "./brand-form-drawer";
import { CatalogDrawer } from "./catalog-drawer";
import { CategoryFormDrawer } from "./category-form-drawer";
import { CatalogErrorState, CatalogTableSkeleton } from "./catalog-states";
import { catalogReadErrorCopy } from "./product-detail-drawer";
import { ProductModelFormDrawer } from "./product-model-form-drawer";
import { AlertTriangleIcon, CloseIcon, PlusIcon } from "@/components/ui/icons";
import {
  createCatalogProduct,
  createCatalogProductSchema,
  updateCatalogProduct,
  updateCatalogProductSchema,
  type CatalogBrand,
  type CatalogCategory,
  type CatalogProductDetail,
  type CatalogProductModel,
  type CatalogReferences,
  type CreateCatalogProductInput,
  type UpdateCatalogProductInput,
} from "@/lib/api/catalog";
import { ApiError, toApiError } from "@/lib/api/client";
import { catalogProductDetailQueryOptions } from "@/lib/query/catalog-query";
import { queryKeys } from "@/lib/query/keys";

const controlClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent disabled:cursor-wait disabled:opacity-60";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

interface RepeatableTextField {
  readonly value: string;
}

export interface ProductFormValues {
  readonly productModelId: string;
  readonly sku: string;
  readonly name: string;
  readonly trackingType: (typeof TRACKING_TYPES)[number];
  readonly condition: (typeof PRODUCT_CONDITIONS)[number];
  readonly ptaStatus: (typeof PTA_STATUSES)[number];
  readonly ram: string;
  readonly storage: string;
  readonly color: string;
  readonly region: string;
  readonly warrantyType: (typeof WARRANTY_TYPES)[number];
  readonly warrantyMonths: string;
  readonly aliases: RepeatableTextField[];
  readonly barcodes: RepeatableTextField[];
}

const EMPTY_FORM_VALUES: ProductFormValues = {
  productModelId: "",
  sku: "",
  name: "",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "unknown",
  ram: "",
  storage: "",
  color: "",
  region: "",
  warrantyType: "none",
  warrantyMonths: "",
  aliases: [],
  barcodes: [],
};

/**
 * Prefill for an edit.
 *
 * Barcodes are ordered primary-first because this form's contract is "the first
 * barcode is the primary one". Round-tripping them in stored order would let a
 * save silently re-designate the primary barcode the owner never touched.
 */
export function productFormValuesFromDetail(
  product: CatalogProductDetail,
): ProductFormValues {
  const barcodes = [...product.barcodes].sort((left, right) =>
    left.isPrimary === right.isPrimary ? 0 : left.isPrimary ? -1 : 1,
  );

  return {
    productModelId: product.productModel.id,
    sku: product.sku,
    name: product.name,
    trackingType: product.trackingType,
    condition: product.condition,
    ptaStatus: product.ptaStatus,
    ram: product.ram ?? "",
    storage: product.storage ?? "",
    color: product.color ?? "",
    region: product.region ?? "",
    warrantyType: product.warrantyType,
    warrantyMonths:
      product.warrantyMonths === null ? "" : String(product.warrantyMonths),
    aliases: product.aliases.map((alias) => ({ value: alias.alias })),
    barcodes: barcodes.map((barcode) => ({ value: barcode.barcode })),
  };
}

function optionalText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function repeatableValues(fields: readonly RepeatableTextField[]): string[] {
  return fields
    .map(({ value }) => value.trim())
    .filter((value) => value.length > 0);
}

export function createProductPayload(
  values: ProductFormValues,
): CreateCatalogProductInput {
  const ram = optionalText(values.ram);
  const storage = optionalText(values.storage);
  const color = optionalText(values.color);
  const region = optionalText(values.region);
  const warrantyMonths = optionalText(values.warrantyMonths);

  return {
    productModelId: values.productModelId,
    sku: values.sku,
    name: values.name,
    trackingType: values.trackingType,
    condition: values.condition,
    ptaStatus: values.ptaStatus,
    warrantyType: values.warrantyType,
    aliases: repeatableValues(values.aliases),
    barcodes: repeatableValues(values.barcodes),
    ...(ram === undefined ? {} : { ram }),
    ...(storage === undefined ? {} : { storage }),
    ...(color === undefined ? {} : { color }),
    ...(region === undefined ? {} : { region }),
    ...(values.warrantyType === "none" || warrantyMonths === undefined
      ? {}
      : { warrantyMonths: Number(warrantyMonths) }),
  };
}

/**
 * An update is the same identity as a create plus the version the editor saw.
 * `trackingType` is carried through unchanged — the field is read-only in edit
 * mode, so this always echoes the stored value back and the server's
 * CATALOG_TRACKING_TYPE_LOCKED guard stays a backstop rather than a hurdle.
 */
export function updateProductPayload(
  values: ProductFormValues,
  version: number,
): UpdateCatalogProductInput {
  return { ...createProductPayload(values), version };
}

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

/**
 * Server-reported errors, keyed by the form field that caused them.
 *
 * Duplicate SKU and duplicate barcode arrive as 409s whose body may carry no
 * `details`, so they are attached to the field the owner must actually fix
 * instead of being left to a banner they have to interpret.
 */
export function productFieldErrors(error: ApiError): FieldErrors {
  const details = error.details ?? {};
  if (error.code === "CATALOG_SKU_DUPLICATE" && details.sku === undefined) {
    return { ...details, sku: [error.message] };
  }
  if (
    error.code === "CATALOG_BARCODE_DUPLICATE" &&
    details.barcodes === undefined
  ) {
    return { ...details, barcodes: [error.message] };
  }
  if (
    error.code === "CATALOG_TRACKING_TYPE_LOCKED" &&
    details.trackingType === undefined
  ) {
    return { ...details, trackingType: [error.message] };
  }
  return details;
}

/** Headline for a failed save. Every branch states that nothing was written. */
export function productSubmissionMessage(
  error: ApiError,
  mode: "create" | "edit",
): string {
  const subject = mode === "create" ? "created" : "saved";

  if (error.code === "OPTIMISTIC_LOCK_FAILED") {
    return "Someone else changed this product since you opened it. Nothing was saved. Close this form and reopen the product to see the current values, then reapply your edit.";
  }
  if (error.code === "CATALOG_TRACKING_TYPE_LOCKED") {
    return "Tracking type cannot change after a product is created. Nothing was saved.";
  }
  if (error.code === "CATALOG_SKU_DUPLICATE") {
    return "That SKU already belongs to another product in this organization.";
  }
  if (error.code === "CATALOG_BARCODE_DUPLICATE") {
    return "One of those barcodes already belongs to another product in this organization.";
  }
  if (error.code === "VALIDATION_FAILED") {
    return "The API rejected some fields. Review the messages shown against them.";
  }
  if (error.code === "NOT_FOUND" || error.status === 404) {
    return "This product no longer exists for your organization. Nothing was saved.";
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return `Your current permissions no longer allow this product to be ${subject}.`;
  }
  if (error.code === "NETWORK_ERROR") {
    return `The catalog API could not be reached, so nothing was ${subject}. Check your connection and try again.`;
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return `The catalog API did not respond in time, so nothing was ${subject}. Try again when the connection is stable.`;
  }
  if (error.code === "CLIENT_VALIDATION_FAILED") return error.message;
  return `The product could not be ${subject}. Review the fields and try again.`;
}

interface ReferenceOption {
  readonly id: string;
  readonly name: string;
}

interface ModelOption extends ReferenceOption {
  readonly brandId: string;
  readonly brandName: string;
  readonly categoryId: string;
  readonly categoryName: string;
}

function mergeOptions<TOption extends ReferenceOption>(
  base: readonly TOption[],
  extra: readonly TOption[],
): TOption[] {
  const known = new Set(base.map((option) => option.id));
  return [...base, ...extra.filter((option) => !known.has(option.id))];
}

function toModelOption(model: CatalogProductModel): ModelOption {
  return {
    id: model.id,
    name: model.name,
    brandId: model.brandId,
    brandName: model.brandName,
    categoryId: model.categoryId,
    categoryName: model.categoryName,
  };
}

/**
 * The product's own model, brand and category as selectable options.
 *
 * Reference lists only carry active records. A product whose model was later
 * deactivated must still edit cleanly, so its stored relationship is offered
 * explicitly rather than silently collapsing the select to blank and turning an
 * unrelated edit into an accidental model change.
 */
function storedModelOption(product: CatalogProductDetail): ModelOption {
  return {
    id: product.productModel.id,
    name: product.productModel.name,
    brandId: product.productModel.brand.id,
    brandName: product.productModel.brand.name,
    categoryId: product.productModel.category.id,
    categoryName: product.productModel.category.name,
  };
}

function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}): JSX.Element | null {
  if (message === undefined) return null;
  return (
    <span className="mt-1 block text-xs text-negative" id={id}>
      {message}
    </span>
  );
}

interface ProductFormBodyProps {
  readonly mode: "create" | "edit";
  readonly product: CatalogProductDetail | null;
  readonly references: CatalogReferences;
  readonly canCreateReferences: boolean;
  readonly onClose: () => void;
  readonly onSaved: (product: CatalogProductDetail) => void;
}

function ProductFormBody({
  mode,
  product,
  references,
  canCreateReferences,
  onClose,
  onSaved,
}: ProductFormBodyProps): JSX.Element {
  const queryClient = useQueryClient();
  const formId = useId();
  const fieldId = useId();
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    product?.productModel.category.id ?? "",
  );
  const [selectedBrandId, setSelectedBrandId] = useState(
    product?.productModel.brand.id ?? "",
  );
  const [extraCategories, setExtraCategories] = useState<ReferenceOption[]>([]);
  const [extraBrands, setExtraBrands] = useState<ReferenceOption[]>([]);
  const [extraModels, setExtraModels] = useState<ModelOption[]>(
    product === null ? [] : [storedModelOption(product)],
  );
  const [referenceDrawer, setReferenceDrawer] = useState<
    "category" | "brand" | "model" | null
  >(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    register,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    defaultValues:
      product === null
        ? EMPTY_FORM_VALUES
        : productFormValuesFromDetail(product),
  });
  const aliases = useFieldArray({ control, name: "aliases" });
  const barcodes = useFieldArray({ control, name: "barcodes" });
  const warrantyType = useWatch({ control, name: "warrantyType" });
  const trackingType = useWatch({ control, name: "trackingType" });

  const categoryOptions = useMemo(
    () => mergeOptions<ReferenceOption>(references.categories, extraCategories),
    [references.categories, extraCategories],
  );
  const brandOptions = useMemo(
    () => mergeOptions<ReferenceOption>(references.brands, extraBrands),
    [references.brands, extraBrands],
  );
  const modelOptions = useMemo(
    () =>
      mergeOptions(references.productModels.map(toModelOption), extraModels),
    [references.productModels, extraModels],
  );
  const visibleModels = useMemo(
    () =>
      modelOptions.filter(
        (model) =>
          (selectedBrandId.length === 0 || model.brandId === selectedBrandId) &&
          (selectedCategoryId.length === 0 ||
            model.categoryId === selectedCategoryId),
      ),
    [modelOptions, selectedBrandId, selectedCategoryId],
  );

  const invalidateReferences = (): void => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogReferences,
    });
  };

  const closeUnlessBusy = (): void => {
    // A nested reference drawer owns Escape and the backdrop while it is open.
    if (submitting || referenceDrawer !== null) return;
    onClose();
  };

  const errorFor = (field: keyof ProductFormValues): string | undefined =>
    (errors[field]?.message as string | undefined) ?? serverErrors[field]?.[0];

  const submit = async (values: ProductFormValues): Promise<void> => {
    if (submitting) return;
    setSubmissionError(null);
    setServerErrors({});

    const parsed =
      product === null
        ? createCatalogProductSchema.safeParse(createProductPayload(values))
        : updateCatalogProductSchema.safeParse(
            updateProductPayload(values, product.version),
          );

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      setServerErrors(fieldErrors);
      setSubmissionError(
        new ApiError(
          parsed.error.issues[0]?.message ?? "Review the product fields.",
          { code: "CLIENT_VALIDATION_FAILED" },
        ),
      );
      return;
    }

    setSubmitting(true);
    try {
      const saved =
        product === null
          ? await createCatalogProduct(parsed.data as CreateCatalogProductInput)
          : await updateCatalogProduct(
              product.id,
              parsed.data as UpdateCatalogProductInput,
            );
      // A create returns a summary; the caller only needs identity + version.
      onSaved(saved as CatalogProductDetail);
    } catch (error) {
      const apiError = toApiError(error);
      setSubmissionError(apiError);
      setServerErrors(productFieldErrors(apiError));
      setSubmitting(false);
    }
  };

  const skuError = errorFor("sku");
  const nameError = errorFor("name");
  const modelError = errorFor("productModelId");
  const warrantyMonthsError = errorFor("warrantyMonths");
  const aliasesError = serverErrors.aliases?.[0];
  const barcodesError = serverErrors.barcodes?.[0];
  const trackingError = serverErrors.trackingType?.[0];

  const referenceAddButton = (
    target: "category" | "brand" | "model",
    label: string,
  ): JSX.Element | null =>
    canCreateReferences ? (
      <button
        aria-haspopup="dialog"
        className="inline-flex min-h-7 items-center gap-1 rounded-control border border-line px-2 text-[0.6875rem] font-semibold text-accent hover:bg-accent-soft"
        onClick={() => setReferenceDrawer(target)}
        type="button"
      >
        <PlusIcon className="size-3" /> {label}
      </button>
    ) : null;

  return (
    <CatalogDrawer
      description={
        mode === "create"
          ? "Create a sellable catalog definition. This does not add physical stock, IMEIs, cost, or a selling price."
          : "Edit this variant's catalog identity. Stock, IMEIs, cost and price are not part of this form."
      }
      footer={
        <>
          <button
            className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-wait disabled:opacity-50"
            disabled={submitting}
            onClick={closeUnlessBusy}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={submitting || visibleModels.length === 0}
            form={formId}
            type="submit"
          >
            {submitting ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            {submitting
              ? mode === "create"
                ? "Creating product…"
                : "Saving product…"
              : mode === "create"
                ? "Create product"
                : "Save product"}
          </button>
        </>
      }
      onClose={closeUnlessBusy}
      title={mode === "create" ? "Add product" : "Edit product"}
      titleId="product-form-title"
    >
      <form
        className="min-w-0"
        id={formId}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => submit(values))(event);
        }}
      >
        {submissionError === null ? null : (
          <div
            className="mb-5 flex items-start gap-2.5 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
            role="alert"
          >
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">
                {mode === "create"
                  ? "Product was not created"
                  : "Product was not saved"}
              </p>
              <p className="mt-0.5">
                {productSubmissionMessage(submissionError, mode)}
              </p>
              {submissionError.requestId === undefined ? null : (
                <p className="mt-1 font-mono text-xs">
                  Ref: {submissionError.requestId}
                </p>
              )}
            </div>
          </div>
        )}

        <fieldset disabled={submitting}>
          <legend className="text-sm font-semibold text-ink">
            Product model
          </legend>
          <p className="mt-1 text-xs text-ink-muted">
            Category and brand narrow the active model list; the selected model
            is the stored relationship.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  className="text-xs font-semibold text-ink-subtle"
                  htmlFor={`${fieldId}-category`}
                >
                  Category
                </label>
                {referenceAddButton("category", "Add new")}
              </div>
              <select
                className={`${controlClass} mt-1.5`}
                id={`${fieldId}-category`}
                onChange={(event) => {
                  setSelectedCategoryId(event.target.value);
                  setValue("productModelId", "");
                }}
                value={selectedCategoryId}
              >
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  className="text-xs font-semibold text-ink-subtle"
                  htmlFor={`${fieldId}-brand`}
                >
                  Brand
                </label>
                {referenceAddButton("brand", "Add new")}
              </div>
              <select
                className={`${controlClass} mt-1.5`}
                id={`${fieldId}-brand`}
                onChange={(event) => {
                  setSelectedBrandId(event.target.value);
                  setValue("productModelId", "");
                }}
                value={selectedBrandId}
              >
                <option value="">All brands</option>
                {brandOptions.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-model`}
              >
                Model <span className="text-negative">*</span>
              </label>
              {referenceAddButton("model", "Add new")}
            </div>
            <select
              aria-describedby={
                modelError === undefined ? undefined : `${fieldId}-model-error`
              }
              aria-invalid={modelError !== undefined}
              className={`${controlClass} mt-1.5`}
              id={`${fieldId}-model`}
              {...register("productModelId", {
                required: "Select a product model.",
              })}
            >
              <option value="">Select a model</option>
              {visibleModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.brandName} · {model.name} · {model.categoryName}
                </option>
              ))}
            </select>
            <FieldError id={`${fieldId}-model-error`} message={modelError} />
            {visibleModels.length === 0 ? (
              <p className="mt-2 rounded-control bg-warning-soft p-2.5 text-xs text-warning">
                No active model matches these filters.
                {canCreateReferences
                  ? " Use Add new to create one without leaving this form."
                  : " A catalog editor can create one."}
              </p>
            ) : null}
          </div>
        </fieldset>

        <div className="my-5 border-t border-line-subtle" />

        <fieldset disabled={submitting}>
          <legend className="text-sm font-semibold text-ink">
            Variant identity
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-sku`}
              >
                Internal SKU <span className="text-negative">*</span>
              </label>
              <input
                aria-describedby={
                  skuError === undefined ? undefined : `${fieldId}-sku-error`
                }
                aria-invalid={skuError !== undefined}
                autoCapitalize="characters"
                autoComplete="off"
                className={`${controlClass} mt-1.5 font-mono`}
                id={`${fieldId}-sku`}
                placeholder="PH-BRAND-MODEL-VARIANT"
                {...register("sku", {
                  required: "Enter an internal SKU.",
                  maxLength: {
                    value: CATALOG_CONTRACT_LIMITS.SKU_LENGTH,
                    message: "SKU is too long.",
                  },
                })}
              />
              <FieldError id={`${fieldId}-sku-error`} message={skuError} />
            </div>
            <div>
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-name`}
              >
                Variant name <span className="text-negative">*</span>
              </label>
              <input
                aria-describedby={
                  nameError === undefined ? undefined : `${fieldId}-name-error`
                }
                aria-invalid={nameError !== undefined}
                autoComplete="off"
                className={`${controlClass} mt-1.5`}
                id={`${fieldId}-name`}
                placeholder="256 GB · Black"
                {...register("name", {
                  required: "Enter a variant name.",
                  maxLength: {
                    value: CATALOG_CONTRACT_LIMITS.NAME_LENGTH,
                    message: "Name is too long.",
                  },
                })}
              />
              <FieldError id={`${fieldId}-name-error`} message={nameError} />
            </div>

            <div>
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-tracking`}
              >
                Tracking{" "}
                {mode === "create" ? (
                  <span className="text-negative">*</span>
                ) : null}
              </label>
              {mode === "edit" ? (
                <>
                  <input
                    aria-describedby={`${fieldId}-tracking-note`}
                    className={`${controlClass} mt-1.5 bg-surface-subtle text-ink-subtle`}
                    id={`${fieldId}-tracking`}
                    readOnly
                    value={titleCase(trackingType)}
                  />
                  <p
                    className="mt-1 text-xs text-ink-muted"
                    id={`${fieldId}-tracking-note`}
                  >
                    Tracking type cannot change after a product is created.
                    Serialized and quantity stock are recorded differently, so
                    switching is a data migration, not an edit. Create a new
                    product if you need the other tracking type.
                  </p>
                  <FieldError
                    id={`${fieldId}-tracking-error`}
                    message={trackingError}
                  />
                </>
              ) : (
                <select
                  className={`${controlClass} mt-1.5`}
                  id={`${fieldId}-tracking`}
                  {...register("trackingType")}
                >
                  {TRACKING_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {titleCase(value)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-condition`}
              >
                Condition <span className="text-negative">*</span>
              </label>
              <select
                className={`${controlClass} mt-1.5`}
                id={`${fieldId}-condition`}
                {...register("condition")}
              >
                {PRODUCT_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {titleCase(condition)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-pta`}
              >
                PTA status <span className="text-negative">*</span>
              </label>
              <select
                className={`${controlClass} mt-1.5`}
                id={`${fieldId}-pta`}
                {...register("ptaStatus")}
              >
                {PTA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleCase(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div className="my-5 border-t border-line-subtle" />

        <fieldset disabled={submitting}>
          <legend className="text-sm font-semibold text-ink">
            Attributes and warranty
          </legend>
          <p className="mt-1 text-xs text-ink-muted">
            Leave fields blank when they do not apply.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["ram", "storage", "color", "region"] as const).map((field) => (
              <div key={field}>
                <label
                  className="text-xs font-semibold text-ink-subtle"
                  htmlFor={`${fieldId}-${field}`}
                >
                  {titleCase(field)}
                </label>
                <input
                  className={`${controlClass} mt-1.5`}
                  id={`${fieldId}-${field}`}
                  maxLength={CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH}
                  {...register(field)}
                />
              </div>
            ))}
            <div>
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-warranty-type`}
              >
                Warranty type
              </label>
              <select
                className={`${controlClass} mt-1.5`}
                id={`${fieldId}-warranty-type`}
                {...register("warrantyType", {
                  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                    if (event.target.value === "none") {
                      setValue("warrantyMonths", "", { shouldValidate: true });
                    }
                  },
                })}
              >
                {WARRANTY_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-xs font-semibold text-ink-subtle"
                htmlFor={`${fieldId}-warranty-months`}
              >
                Warranty months
              </label>
              <input
                aria-describedby={
                  warrantyMonthsError === undefined
                    ? undefined
                    : `${fieldId}-warranty-months-error`
                }
                aria-invalid={warrantyMonthsError !== undefined}
                className={`${controlClass} mt-1.5`}
                disabled={warrantyType === "none"}
                id={`${fieldId}-warranty-months`}
                inputMode="numeric"
                max={CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS}
                min={1}
                type="number"
                {...register("warrantyMonths", {
                  validate: (value) => {
                    if (warrantyType === "none") return value.length === 0;
                    return (
                      (/^\d+$/u.test(value) &&
                        Number(value) >= 1 &&
                        Number(value) <=
                          CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS) ||
                      `Use a whole number from 1 to ${CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS}.`
                    );
                  },
                })}
              />
              <FieldError
                id={`${fieldId}-warranty-months-error`}
                message={warrantyMonthsError}
              />
            </div>
          </div>
        </fieldset>

        <div className="my-5 border-t border-line-subtle" />

        <fieldset disabled={submitting}>
          <legend className="text-sm font-semibold text-ink">
            Search identities
          </legend>
          <p className="mt-1 text-xs text-ink-muted">
            {mode === "create"
              ? "Barcodes are optional. Aliases help counter search find local spellings and common variations."
              : "These lists are the end state. Anything you remove is retired, not deleted, and its value becomes reusable."}
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-ink-subtle">
                Aliases ({aliases.fields.length}/
                {CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT})
              </p>
              <button
                className="inline-flex min-h-8 items-center gap-1 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  aliases.fields.length >=
                  CATALOG_CONTRACT_LIMITS.MAX_ALIASES_PER_PRODUCT
                }
                onClick={() => aliases.append({ value: "" })}
                type="button"
              >
                <PlusIcon className="size-3.5" /> Add alias
              </button>
            </div>
            {aliases.fields.length === 0 ? (
              <p className="mt-2 text-xs text-ink-muted">No aliases added.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {aliases.fields.map((field, index) => (
                  <div className="flex items-center gap-2" key={field.id}>
                    <label className="sr-only" htmlFor={`alias-${field.id}`}>
                      Alias {index + 1}
                    </label>
                    <input
                      className={controlClass}
                      id={`alias-${field.id}`}
                      maxLength={CATALOG_CONTRACT_LIMITS.ALIAS_LENGTH}
                      placeholder="Local spelling or search name"
                      {...register(`aliases.${index}.value`)}
                    />
                    <button
                      aria-label={`Remove alias ${index + 1}`}
                      className="grid size-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-negative-soft hover:text-negative"
                      onClick={() => aliases.remove(index)}
                      type="button"
                    >
                      <CloseIcon className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <FieldError
              id={`${fieldId}-aliases-error`}
              message={aliasesError}
            />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-ink-subtle">
                Barcodes ({barcodes.fields.length}/
                {CATALOG_CONTRACT_LIMITS.MAX_BARCODES_PER_PRODUCT})
              </p>
              <button
                className="inline-flex min-h-8 items-center gap-1 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  barcodes.fields.length >=
                  CATALOG_CONTRACT_LIMITS.MAX_BARCODES_PER_PRODUCT
                }
                onClick={() => barcodes.append({ value: "" })}
                type="button"
              >
                <PlusIcon className="size-3.5" /> Add barcode
              </button>
            </div>
            {barcodes.fields.length === 0 ? (
              <p className="mt-2 text-xs text-ink-muted">
                No barcode required. The product remains searchable by SKU,
                model, brand, category, and aliases.
              </p>
            ) : (
              <>
                <p className="mt-2 text-xs text-ink-muted">
                  The first barcode is the primary one.
                </p>
                <div className="mt-2 space-y-2">
                  {barcodes.fields.map((field, index) => (
                    <div className="flex items-center gap-2" key={field.id}>
                      <label
                        className="sr-only"
                        htmlFor={`barcode-${field.id}`}
                      >
                        Barcode {index + 1}
                        {index === 0 ? " (primary)" : ""}
                      </label>
                      <input
                        className={`${controlClass} font-mono`}
                        id={`barcode-${field.id}`}
                        inputMode="numeric"
                        maxLength={CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH}
                        placeholder="Scan or type a barcode"
                        {...register(`barcodes.${index}.value`)}
                      />
                      {index === 0 ? (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-ink">
                          Primary
                        </span>
                      ) : null}
                      <button
                        aria-label={`Remove barcode ${index + 1}`}
                        className="grid size-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-negative-soft hover:text-negative"
                        onClick={() => barcodes.remove(index)}
                        type="button"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <FieldError
              id={`${fieldId}-barcodes-error`}
              message={barcodesError}
            />
          </div>
        </fieldset>
      </form>

      {referenceDrawer === "category" ? (
        <CategoryFormDrawer
          mode="create"
          onClose={() => setReferenceDrawer(null)}
          onSaved={(category: CatalogCategory) => {
            setExtraCategories((previous) => [
              ...previous,
              { id: category.id, name: category.name },
            ]);
            setSelectedCategoryId(category.id);
            setReferenceDrawer(null);
            invalidateReferences();
          }}
        />
      ) : null}
      {referenceDrawer === "brand" ? (
        <BrandFormDrawer
          mode="create"
          onClose={() => setReferenceDrawer(null)}
          onSaved={(brand: CatalogBrand) => {
            setExtraBrands((previous) => [
              ...previous,
              { id: brand.id, name: brand.name },
            ]);
            setSelectedBrandId(brand.id);
            setReferenceDrawer(null);
            invalidateReferences();
          }}
        />
      ) : null}
      {referenceDrawer === "model" ? (
        <ProductModelFormDrawer
          mode="create"
          onClose={() => setReferenceDrawer(null)}
          onSaved={(model: CatalogProductModel) => {
            setExtraModels((previous) => [...previous, toModelOption(model)]);
            // Align the narrowing selects so the new model is actually visible.
            setSelectedCategoryId(model.categoryId);
            setSelectedBrandId(model.brandId);
            setValue("productModelId", model.id);
            setReferenceDrawer(null);
            invalidateReferences();
          }}
        />
      ) : null}
    </CatalogDrawer>
  );
}

export type ProductFormDrawerProps = {
  readonly references: CatalogReferences;
  readonly canCreateReferences: boolean;
  readonly onClose: () => void;
  readonly onSaved: (product: CatalogProductDetail) => void;
} & (
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly productId: string }
);

/**
 * Create or edit one catalog product.
 *
 * In edit mode the stored detail is fetched before the form mounts, so every
 * field — including the version this edit is based on — is prefilled from what
 * the server actually holds rather than from a list row that may be stale.
 */
export function ProductFormDrawer(props: ProductFormDrawerProps): JSX.Element {
  const { references, canCreateReferences, onClose, onSaved } = props;
  const productId = props.mode === "edit" ? props.productId : "";
  const detail = useQuery(
    catalogProductDetailQueryOptions(productId, props.mode === "edit"),
  );

  if (props.mode === "create") {
    return (
      <ProductFormBody
        canCreateReferences={canCreateReferences}
        mode="create"
        onClose={onClose}
        onSaved={onSaved}
        product={null}
        references={references}
      />
    );
  }

  if (detail.data !== undefined) {
    return (
      <ProductFormBody
        canCreateReferences={canCreateReferences}
        key={detail.data.id}
        mode="edit"
        onClose={onClose}
        onSaved={onSaved}
        product={detail.data}
        references={references}
      />
    );
  }

  const error = detail.error === null ? null : toApiError(detail.error);

  return (
    <CatalogDrawer
      description="Loading the stored product before anything can be edited."
      onClose={onClose}
      title="Edit product"
      titleId="product-form-title"
    >
      {error === null ? (
        <CatalogTableSkeleton rows={5} />
      ) : (
        <CatalogErrorState
          {...catalogReadErrorCopy(error)}
          {...(error.requestId === undefined
            ? {}
            : { requestId: error.requestId })}
          onRetry={() => {
            void detail.refetch();
          }}
        />
      )}
    </CatalogDrawer>
  );
}
