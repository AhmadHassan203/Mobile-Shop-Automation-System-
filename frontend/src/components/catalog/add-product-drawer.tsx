"use client";

import {
  CATALOG_CONTRACT_LIMITS,
  PRODUCT_CONDITIONS,
  PTA_STATUSES,
  TRACKING_TYPES,
  WARRANTY_TYPES,
} from "@mobileshop/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  createCatalogProduct,
  createCatalogProductSchema,
  type CatalogProduct,
  type CatalogReferences,
  type CreateCatalogProductInput,
} from "@/lib/api/catalog";
import { ApiError, toApiError } from "@/lib/api/client";
import {
  AlertTriangleIcon,
  BoxIcon,
  CloseIcon,
  PlusIcon,
} from "@/components/ui/icons";

interface RepeatableTextField {
  readonly value: string;
}

interface ProductFormValues {
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

export interface AddProductDrawerProps {
  readonly references: CatalogReferences;
  readonly onClose: () => void;
  readonly onCreated: (product: CatalogProduct) => void;
}

const controlClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent disabled:cursor-wait disabled:opacity-60";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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

function createPayload(values: ProductFormValues): CreateCatalogProductInput {
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

function submissionMessage(error: ApiError): string {
  if (error.code === "CATALOG_SKU_DUPLICATE") {
    return "That SKU already belongs to another product.";
  }
  if (error.code === "CATALOG_BARCODE_DUPLICATE") {
    return "One of those barcodes already belongs to another product.";
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return "Your current permissions no longer allow product creation.";
  }
  if (error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT") {
    return "The catalog API could not be reached. Nothing was created.";
  }
  if (error.code === "CLIENT_VALIDATION_FAILED") return error.message;
  return "The product could not be created. Review the fields and try again.";
}

export function AddProductDrawer({
  references,
  onClose,
  onCreated,
}: AddProductDrawerProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    register,
    reset,
    setFocus,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    defaultValues: {
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
    },
  });
  const aliases = useFieldArray({ control, name: "aliases" });
  const barcodes = useFieldArray({ control, name: "barcodes" });
  const warrantyType = useWatch({ control, name: "warrantyType" });

  const visibleModels = useMemo(
    () =>
      references.productModels.filter(
        (model) =>
          (selectedBrandId.length === 0 || model.brandId === selectedBrandId) &&
          (selectedCategoryId.length === 0 ||
            model.categoryId === selectedCategoryId),
      ),
    [references.productModels, selectedBrandId, selectedCategoryId],
  );

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose, submitting]);

  const submit = async (values: ProductFormValues): Promise<void> => {
    if (submitting) return;
    setSubmissionError(null);

    const parsed = createCatalogProductSchema.safeParse(createPayload(values));
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setSubmissionError(
        new ApiError(firstIssue?.message ?? "Review the product fields.", {
          code: "CLIENT_VALIDATION_FAILED",
        }),
      );
      return;
    }

    setSubmitting(true);
    try {
      const product = await createCatalogProduct(parsed.data);
      reset();
      onCreated(product);
    } catch (error) {
      setSubmissionError(toApiError(error));
      setSubmitting(false);
      setFocus("sku");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        aria-describedby="add-product-description"
        aria-labelledby="add-product-title"
        aria-modal="true"
        className="flex h-full w-full max-w-[46rem] flex-col bg-surface shadow-overlay"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <BoxIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2
              className="text-base font-semibold text-ink"
              id="add-product-title"
            >
              Add product
            </h2>
            <p
              className="mt-0.5 text-xs text-ink-muted"
              id="add-product-description"
            >
              Create a sellable catalog definition. This does not add physical
              stock, IMEIs, cost, or a selling price.
            </p>
          </div>
          <button
            aria-label="Close add product"
            className="ml-auto grid size-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink disabled:cursor-wait disabled:opacity-50"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            void handleSubmit((values) => submit(values))(event);
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {submissionError === null ? null : (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
                role="alert"
              >
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-semibold">Product was not created</p>
                  <p className="mt-0.5">{submissionMessage(submissionError)}</p>
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
                Category and brand narrow the existing active model list; the
                selected model is the stored relationship.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-ink-subtle">
                  Category
                  <select
                    className={`${controlClass} mt-1.5`}
                    onChange={(event) => {
                      setSelectedCategoryId(event.target.value);
                      setValue("productModelId", "");
                    }}
                    value={selectedCategoryId}
                  >
                    <option value="">All categories</option>
                    {references.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-subtle">
                  Brand
                  <select
                    className={`${controlClass} mt-1.5`}
                    onChange={(event) => {
                      setSelectedBrandId(event.target.value);
                      setValue("productModelId", "");
                    }}
                    value={selectedBrandId}
                  >
                    <option value="">All brands</option>
                    {references.brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-xs font-semibold text-ink-subtle">
                Model <span className="text-negative">*</span>
                <select
                  aria-invalid={errors.productModelId !== undefined}
                  className={`${controlClass} mt-1.5`}
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
              </label>
              {errors.productModelId?.message === undefined ? null : (
                <p className="mt-1 text-xs text-negative">
                  {errors.productModelId.message}
                </p>
              )}
              {visibleModels.length === 0 ? (
                <p className="mt-2 rounded-control bg-warning-soft p-2.5 text-xs text-warning">
                  No active model matches these filters. Category, brand, and
                  model management is a separate catalog workflow.
                </p>
              ) : null}
            </fieldset>

            <div className="my-5 border-t border-line-subtle" />

            <fieldset disabled={submitting}>
              <legend className="text-sm font-semibold text-ink">
                Variant identity
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-ink-subtle">
                  Internal SKU <span className="text-negative">*</span>
                  <input
                    aria-invalid={errors.sku !== undefined}
                    autoCapitalize="characters"
                    autoComplete="off"
                    className={`${controlClass} mt-1.5 font-mono`}
                    placeholder="PH-BRAND-MODEL-VARIANT"
                    {...register("sku", {
                      required: "Enter an internal SKU.",
                      maxLength: {
                        value: CATALOG_CONTRACT_LIMITS.SKU_LENGTH,
                        message: "SKU is too long.",
                      },
                    })}
                  />
                  {errors.sku?.message === undefined ? null : (
                    <span className="mt-1 block text-xs text-negative">
                      {errors.sku.message}
                    </span>
                  )}
                </label>
                <label className="text-xs font-semibold text-ink-subtle">
                  Variant name <span className="text-negative">*</span>
                  <input
                    aria-invalid={errors.name !== undefined}
                    autoComplete="off"
                    className={`${controlClass} mt-1.5`}
                    placeholder="256 GB · Black"
                    {...register("name", {
                      required: "Enter a variant name.",
                      maxLength: {
                        value: CATALOG_CONTRACT_LIMITS.NAME_LENGTH,
                        message: "Name is too long.",
                      },
                    })}
                  />
                  {errors.name?.message === undefined ? null : (
                    <span className="mt-1 block text-xs text-negative">
                      {errors.name.message}
                    </span>
                  )}
                </label>
                <label className="text-xs font-semibold text-ink-subtle">
                  Tracking <span className="text-negative">*</span>
                  <select
                    className={`${controlClass} mt-1.5`}
                    {...register("trackingType")}
                  >
                    {TRACKING_TYPES.map((trackingType) => (
                      <option key={trackingType} value={trackingType}>
                        {titleCase(trackingType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-subtle">
                  Condition <span className="text-negative">*</span>
                  <select
                    className={`${controlClass} mt-1.5`}
                    {...register("condition")}
                  >
                    {PRODUCT_CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {titleCase(condition)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-subtle sm:col-span-2">
                  PTA status <span className="text-negative">*</span>
                  <select
                    className={`${controlClass} mt-1.5`}
                    {...register("ptaStatus")}
                  >
                    {PTA_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {titleCase(status)}
                      </option>
                    ))}
                  </select>
                </label>
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
                {(["ram", "storage", "color", "region"] as const).map(
                  (field) => (
                    <label
                      className="text-xs font-semibold text-ink-subtle"
                      key={field}
                    >
                      {titleCase(field)}
                      <input
                        className={`${controlClass} mt-1.5`}
                        maxLength={CATALOG_CONTRACT_LIMITS.ATTRIBUTE_LENGTH}
                        {...register(field)}
                      />
                    </label>
                  ),
                )}
                <label className="text-xs font-semibold text-ink-subtle">
                  Warranty type
                  <select
                    className={`${controlClass} mt-1.5`}
                    {...register("warrantyType", {
                      onChange: (
                        event: React.ChangeEvent<HTMLSelectElement>,
                      ) => {
                        if (event.target.value === "none") {
                          setValue("warrantyMonths", "", {
                            shouldValidate: true,
                          });
                        }
                      },
                    })}
                  >
                    {WARRANTY_TYPES.map((warrantyType) => (
                      <option key={warrantyType} value={warrantyType}>
                        {titleCase(warrantyType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-subtle">
                  Warranty months
                  <input
                    className={`${controlClass} mt-1.5`}
                    disabled={warrantyType === "none"}
                    inputMode="numeric"
                    min={1}
                    max={CATALOG_CONTRACT_LIMITS.MAX_WARRANTY_MONTHS}
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
                  {errors.warrantyMonths?.message === undefined ? null : (
                    <span className="mt-1 block text-xs text-negative">
                      {errors.warrantyMonths.message}
                    </span>
                  )}
                </label>
              </div>
            </fieldset>

            <div className="my-5 border-t border-line-subtle" />

            <fieldset disabled={submitting}>
              <legend className="text-sm font-semibold text-ink">
                Search identities
              </legend>
              <p className="mt-1 text-xs text-ink-muted">
                Barcodes are optional. Aliases help counter search find local
                spellings and common variations.
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
                  <p className="mt-2 text-xs text-ink-muted">
                    No aliases added.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {aliases.fields.map((field, index) => (
                      <div className="flex items-center gap-2" key={field.id}>
                        <label
                          className="sr-only"
                          htmlFor={`alias-${field.id}`}
                        >
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
                  <div className="mt-2 space-y-2">
                    {barcodes.fields.map((field, index) => (
                      <div className="flex items-center gap-2" key={field.id}>
                        <label
                          className="sr-only"
                          htmlFor={`barcode-${field.id}`}
                        >
                          Barcode {index + 1}
                        </label>
                        <input
                          className={`${controlClass} font-mono`}
                          id={`barcode-${field.id}`}
                          inputMode="numeric"
                          maxLength={CATALOG_CONTRACT_LIMITS.BARCODE_LENGTH}
                          placeholder="Scan or type a barcode"
                          {...register(`barcodes.${index}.value`)}
                        />
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
                )}
              </div>
            </fieldset>
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
            <button
              className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-wait disabled:opacity-50"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
              disabled={submitting || visibleModels.length === 0}
              type="submit"
            >
              {submitting ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              {submitting ? "Creating product…" : "Create product"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
