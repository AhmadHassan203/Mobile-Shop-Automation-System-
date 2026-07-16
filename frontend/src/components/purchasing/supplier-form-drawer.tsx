"use client";

import {
  CreateSupplierInputSchema,
  PURCHASING_CONTRACT_LIMITS,
  UpdateSupplierInputSchema,
  type SupplierDetail,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { CatalogDrawer } from "@/components/catalog/catalog-drawer";
import { PlusIcon } from "@/components/ui/icons";
import { createSupplier, updateSupplier } from "@/lib/api/purchasing";
import type { ApiError } from "@/lib/api/client";
import { supplierQueryOptions } from "@/lib/query/purchasing-query";
import {
  FieldError,
  MutationErrorBanner,
  ValidationSummary,
  controlClass,
  fieldErrorControlProps,
  focusValidationSummary,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./purchasing-parts";
import {
  asPurchasingError,
  zodFieldErrors,
  type FieldErrors,
} from "./purchasing-state";

interface ContactDraft {
  readonly key: number;
  readonly name: string;
  readonly role: string;
  readonly phone: string;
  readonly email: string;
  readonly isPrimary: boolean;
}

interface SupplierDraft {
  readonly code: string;
  readonly name: string;
  readonly paymentTermsDays: string;
  readonly leadTimeDays: string;
  readonly addressLine: string;
  readonly city: string;
  readonly notes: string;
}

const EMPTY_DRAFT: SupplierDraft = {
  code: "",
  name: "",
  paymentTermsDays: "0",
  leadTimeDays: "0",
  addressLine: "",
  city: "",
  notes: "",
};

const SUPPLIER_VALIDATION_SUMMARY_ID = "supplier-form-validation-summary";
const SUPPLIER_CODE_ERROR_ID = "supplier-form-code-error";
const SUPPLIER_NAME_ERROR_ID = "supplier-form-name-error";
const SUPPLIER_PAYMENT_TERMS_ERROR_ID = "supplier-form-payment-terms-error";
const SUPPLIER_LEAD_TIME_ERROR_ID = "supplier-form-lead-time-error";
const SUPPLIER_ADDRESS_ERROR_ID = "supplier-form-address-error";
const SUPPLIER_CITY_ERROR_ID = "supplier-form-city-error";
const SUPPLIER_NOTES_ERROR_ID = "supplier-form-notes-error";

function detailDraft(detail: SupplierDetail): SupplierDraft {
  return {
    code: detail.code,
    name: detail.name,
    paymentTermsDays: String(detail.paymentTermsDays),
    leadTimeDays: String(detail.leadTimeDays),
    addressLine: detail.addressLine ?? "",
    city: detail.city ?? "",
    notes: detail.notes ?? "",
  };
}

function contactDrafts(detail: SupplierDetail): ContactDraft[] {
  return detail.contacts.map((contact, index) => ({
    key: index + 1,
    name: contact.name,
    role: contact.role ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    isPrimary: contact.isPrimary,
  }));
}

export interface SupplierFormDrawerProps {
  readonly mode: "create" | "edit";
  readonly supplierId?: string | undefined;
  readonly onClose: () => void;
  readonly onSaved: (supplier: SupplierDetail) => void;
}

export function SupplierFormDrawer({
  mode,
  supplierId,
  onClose,
  onSaved,
}: SupplierFormDrawerProps): JSX.Element {
  const detail = useQuery(
    supplierQueryOptions(supplierId ?? "", mode === "edit"),
  );
  const [draft, setDraft] = useState<SupplierDraft>(EMPTY_DRAFT);
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const nextContactKey = useRef(1);
  const initialized = useRef<string | null>(
    mode === "create" ? "create" : null,
  );
  const submittingRef = useRef(false);
  const validationSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      mode !== "edit" ||
      detail.data === undefined ||
      initialized.current === detail.data.id
    ) {
      return;
    }
    setFieldErrors({});
    setDraft(detailDraft(detail.data));
    const loadedContacts = contactDrafts(detail.data);
    setContacts(loadedContacts);
    nextContactKey.current = loadedContacts.length + 1;
    initialized.current = detail.data.id;
  }, [detail.data, mode]);

  useEffect(() => {
    if (validationAttempt > 0) {
      focusValidationSummary(validationSummaryRef.current);
    }
  }, [validationAttempt]);

  const closeIfIdle = useCallback(() => {
    if (!submittingRef.current) onClose();
  }, [onClose]);

  const updateDraft = (field: keyof SupplierDraft, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateContact = (
    key: number,
    field: keyof Omit<ContactDraft, "key">,
    value: string | boolean,
  ): void => {
    setContacts((current) =>
      current.map((contact) => {
        if (field === "isPrimary" && value === true) {
          return contact.key === key
            ? { ...contact, isPrimary: true }
            : { ...contact, isPrimary: false };
        }
        return contact.key === key ? { ...contact, [field]: value } : contact;
      }),
    );
  };

  const submit = async (): Promise<void> => {
    if (submittingRef.current) return;
    setFieldErrors({});
    setSubmissionError(null);
    const raw = {
      code: draft.code,
      name: draft.name,
      paymentTermsDays: Number(draft.paymentTermsDays),
      leadTimeDays: Number(draft.leadTimeDays),
      addressLine: draft.addressLine,
      city: draft.city,
      notes: draft.notes,
      contacts: contacts.map((contact) => ({
        name: contact.name,
        role: contact.role,
        phone: contact.phone,
        email: contact.email.length === 0 ? null : contact.email,
        isPrimary: contact.isPrimary,
      })),
    };
    if (mode === "edit") {
      if (detail.data === undefined) return;
      const parsed = UpdateSupplierInputSchema.safeParse({
        ...raw,
        version: detail.data.version,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error));
        setValidationAttempt((current) => current + 1);
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const saved = await updateSupplier(detail.data.id, parsed.data);
        submittingRef.current = false;
        onSaved(saved);
      } catch (error) {
        setSubmissionError(asPurchasingError(error));
        submittingRef.current = false;
        setSubmitting(false);
      }
      return;
    }

    const parsed = CreateSupplierInputSchema.safeParse(raw);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      setValidationAttempt((current) => current + 1);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await createSupplier(parsed.data);
      submittingRef.current = false;
      onSaved(saved);
    } catch (error) {
      setSubmissionError(asPurchasingError(error));
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const validationMessages = [
    ...new Set(Object.values(fieldErrors).flatMap((messages) => messages)),
  ];

  const footer = (
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
        disabled={submitting || (mode === "edit" && detail.data === undefined)}
        onClick={() => void submit()}
        type="button"
      >
        {submitting
          ? "Saving…"
          : mode === "create"
            ? "Create supplier"
            : "Save supplier"}
      </button>
    </>
  );

  return (
    <CatalogDrawer
      description="Supplier terms and active contacts are organization-level master data. Posted purchases retain their supplier permanently."
      footer={footer}
      onClose={closeIfIdle}
      title={mode === "create" ? "New supplier" : "Edit supplier"}
      titleId="supplier-form-title"
    >
      {detail.isPending && mode === "edit" ? (
        <div
          className="flex items-center gap-3 py-8 text-sm text-ink-muted"
          role="status"
        >
          <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          Loading supplier…
        </div>
      ) : detail.error !== null && detail.data === undefined ? (
        <MutationErrorBanner
          error={asPurchasingError(detail.error)}
          title="Supplier could not be loaded"
        />
      ) : (
        <div className="space-y-5">
          {submissionError === null ? null : (
            <MutationErrorBanner
              error={submissionError}
              title="Supplier was not saved"
            />
          )}
          <ValidationSummary
            focusRef={validationSummaryRef}
            id={SUPPLIER_VALIDATION_SUMMARY_ID}
            messages={validationMessages}
            title="Review the supplier before saving"
          />

          <section className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Supplier code <span className="text-negative">*</span>
              <input
                {...fieldErrorControlProps(
                  SUPPLIER_CODE_ERROR_ID,
                  fieldErrors.code,
                  "Supplier code",
                )}
                className={`${controlClass} mt-1.5 font-mono`}
                disabled={submitting}
                maxLength={PURCHASING_CONTRACT_LIMITS.SUPPLIER_CODE_LENGTH}
                onChange={(event) => updateDraft("code", event.target.value)}
                placeholder="SUP-001"
                required
                value={draft.code}
              />
              <FieldError
                id={SUPPLIER_CODE_ERROR_ID}
                messages={fieldErrors.code}
              />
            </label>
            <label className={labelClass}>
              Supplier name <span className="text-negative">*</span>
              <input
                {...fieldErrorControlProps(
                  SUPPLIER_NAME_ERROR_ID,
                  fieldErrors.name,
                  "Supplier name",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting}
                maxLength={PURCHASING_CONTRACT_LIMITS.NAME_LENGTH}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="Supplier legal or trading name"
                required
                value={draft.name}
              />
              <FieldError
                id={SUPPLIER_NAME_ERROR_ID}
                messages={fieldErrors.name}
              />
            </label>
            <label className={labelClass}>
              Payment terms (days)
              <input
                {...fieldErrorControlProps(
                  SUPPLIER_PAYMENT_TERMS_ERROR_ID,
                  fieldErrors.paymentTermsDays,
                  "Payment terms in days",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting}
                min={0}
                onChange={(event) =>
                  updateDraft("paymentTermsDays", event.target.value)
                }
                required
                type="number"
                value={draft.paymentTermsDays}
              />
              <FieldError
                id={SUPPLIER_PAYMENT_TERMS_ERROR_ID}
                messages={fieldErrors.paymentTermsDays}
              />
            </label>
            <label className={labelClass}>
              Lead time (days)
              <input
                {...fieldErrorControlProps(
                  SUPPLIER_LEAD_TIME_ERROR_ID,
                  fieldErrors.leadTimeDays,
                  "Lead time in days",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting}
                min={0}
                onChange={(event) =>
                  updateDraft("leadTimeDays", event.target.value)
                }
                required
                type="number"
                value={draft.leadTimeDays}
              />
              <FieldError
                id={SUPPLIER_LEAD_TIME_ERROR_ID}
                messages={fieldErrors.leadTimeDays}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Address
              <input
                {...fieldErrorControlProps(
                  SUPPLIER_ADDRESS_ERROR_ID,
                  fieldErrors.addressLine,
                  "Supplier address",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting}
                maxLength={PURCHASING_CONTRACT_LIMITS.ADDRESS_LENGTH}
                onChange={(event) =>
                  updateDraft("addressLine", event.target.value)
                }
                value={draft.addressLine}
              />
              <FieldError
                id={SUPPLIER_ADDRESS_ERROR_ID}
                messages={fieldErrors.addressLine}
              />
            </label>
            <label className={labelClass}>
              City
              <input
                {...fieldErrorControlProps(
                  SUPPLIER_CITY_ERROR_ID,
                  fieldErrors.city,
                  "Supplier city",
                )}
                className={`${controlClass} mt-1.5`}
                disabled={submitting}
                maxLength={PURCHASING_CONTRACT_LIMITS.CITY_LENGTH}
                onChange={(event) => updateDraft("city", event.target.value)}
                value={draft.city}
              />
              <FieldError
                id={SUPPLIER_CITY_ERROR_ID}
                messages={fieldErrors.city}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Notes
              <textarea
                {...fieldErrorControlProps(
                  SUPPLIER_NOTES_ERROR_ID,
                  fieldErrors.notes,
                  "Supplier notes",
                )}
                className={`${controlClass} mt-1.5 min-h-24 resize-y`}
                disabled={submitting}
                maxLength={PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH}
                onChange={(event) => updateDraft("notes", event.target.value)}
                value={draft.notes}
              />
              <FieldError
                id={SUPPLIER_NOTES_ERROR_ID}
                messages={fieldErrors.notes}
              />
            </label>
          </section>

          <section className="border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">Contacts</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  A contact needs a phone number or email. One may be primary.
                </p>
              </div>
              <button
                className={secondaryButtonClass}
                disabled={
                  submitting ||
                  contacts.length >=
                    PURCHASING_CONTRACT_LIMITS.MAX_CONTACTS_PER_SUPPLIER
                }
                onClick={() => {
                  const key = nextContactKey.current;
                  nextContactKey.current += 1;
                  setFieldErrors({});
                  setContacts((current) => [
                    ...current,
                    {
                      key,
                      name: "",
                      role: "",
                      phone: "",
                      email: "",
                      isPrimary: current.length === 0,
                    },
                  ]);
                }}
                type="button"
              >
                <PlusIcon className="size-4" /> Add contact
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {contacts.length === 0 ? (
                <p className="rounded-control border border-dashed border-line p-4 text-center text-xs text-ink-muted">
                  No active contacts. You can still save the supplier.
                </p>
              ) : null}
              {contacts.map((contact, index) => (
                <div
                  className="rounded-control border border-line bg-surface-subtle p-3"
                  key={contact.key}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
                      <input
                        checked={contact.isPrimary}
                        disabled={submitting}
                        onChange={(event) =>
                          updateContact(
                            contact.key,
                            "isPrimary",
                            event.target.checked,
                          )
                        }
                        type="checkbox"
                      />
                      Primary contact
                    </label>
                    <button
                      className="text-xs font-semibold text-negative hover:underline"
                      disabled={submitting}
                      onClick={() => {
                        setFieldErrors({});
                        setContacts((current) =>
                          current.filter((item) => item.key !== contact.key),
                        );
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={labelClass}>
                      Name
                      <input
                        {...fieldErrorControlProps(
                          `supplier-contact-${contact.key}-name-error`,
                          fieldErrors[`contacts.${index}.name`],
                          `Contact ${index + 1} name`,
                        )}
                        className={`${controlClass} mt-1`}
                        disabled={submitting}
                        onChange={(event) =>
                          updateContact(contact.key, "name", event.target.value)
                        }
                        required
                        value={contact.name}
                      />
                      <FieldError
                        id={`supplier-contact-${contact.key}-name-error`}
                        messages={fieldErrors[`contacts.${index}.name`]}
                      />
                    </label>
                    <label className={labelClass}>
                      Role
                      <input
                        {...fieldErrorControlProps(
                          `supplier-contact-${contact.key}-role-error`,
                          fieldErrors[`contacts.${index}.role`],
                          `Contact ${index + 1} role`,
                        )}
                        className={`${controlClass} mt-1`}
                        disabled={submitting}
                        onChange={(event) =>
                          updateContact(contact.key, "role", event.target.value)
                        }
                        value={contact.role}
                      />
                      <FieldError
                        id={`supplier-contact-${contact.key}-role-error`}
                        messages={fieldErrors[`contacts.${index}.role`]}
                      />
                    </label>
                    <label className={labelClass}>
                      Phone
                      <input
                        {...fieldErrorControlProps(
                          `supplier-contact-${contact.key}-phone-error`,
                          fieldErrors[`contacts.${index}.phone`],
                          `Contact ${index + 1} phone`,
                        )}
                        className={`${controlClass} mt-1`}
                        disabled={submitting}
                        onChange={(event) =>
                          updateContact(
                            contact.key,
                            "phone",
                            event.target.value,
                          )
                        }
                        value={contact.phone}
                      />
                      <FieldError
                        id={`supplier-contact-${contact.key}-phone-error`}
                        messages={fieldErrors[`contacts.${index}.phone`]}
                      />
                    </label>
                    <label className={labelClass}>
                      Email
                      <input
                        {...fieldErrorControlProps(
                          `supplier-contact-${contact.key}-email-error`,
                          fieldErrors[`contacts.${index}.email`],
                          `Contact ${index + 1} email`,
                        )}
                        className={`${controlClass} mt-1`}
                        disabled={submitting}
                        onChange={(event) =>
                          updateContact(
                            contact.key,
                            "email",
                            event.target.value,
                          )
                        }
                        type="email"
                        value={contact.email}
                      />
                      <FieldError
                        id={`supplier-contact-${contact.key}-email-error`}
                        messages={fieldErrors[`contacts.${index}.email`]}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </CatalogDrawer>
  );
}
