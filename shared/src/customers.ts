import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import { normalizePakistanPhone } from "./phone";

/** Strict customer contracts with Pakistan-mobile normalization at the edge. */
export const CUSTOMER_CONTRACT_LIMITS = Object.freeze({
  NAME_LENGTH: 200,
  PHONE_LENGTH: 20,
  EMAIL_LENGTH: 255,
  ADDRESS_LENGTH: 500,
  NOTE_LENGTH: 500,
  REFERENCE_LENGTH: 120,
});

export const CUSTOMER_MARKETING_CONSENT_STATUSES = [
  "pending",
  "granted",
  "declined",
  "withdrawn",
] as const;
export type CustomerMarketingConsentStatus =
  (typeof CUSTOMER_MARKETING_CONSENT_STATUSES)[number];

export const CUSTOMER_SORT_FIELDS = ["name", "created_at"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

const requiredNameSchema = z
  .string()
  .transform(normalizeDisplayText)
  .pipe(
    z
      .string()
      .min(1, "Enter the customer's full name.")
      .max(CUSTOMER_CONTRACT_LIMITS.NAME_LENGTH),
  );

const nullableText = (maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(z.string().min(1).max(maximum))
    .nullable();

/**
 * All accepted counter formats become one PK E.164 identity before persistence
 * and uniqueness checks (0300-1234567 -> +923001234567).
 */
export const PakistanMobileInputSchema = z
  .string()
  .transform((value, context) => {
    const result = normalizePakistanPhone(value);
    if (!result.valid || result.normalized === null) {
      context.addIssue({
        code: "custom",
        message: result.reason ?? "Enter a valid Pakistani mobile number.",
      });
      return z.NEVER;
    }
    return result.normalized;
  });
export type PakistanMobileInput = z.input<typeof PakistanMobileInputSchema>;
export type PakistanMobile = z.output<typeof PakistanMobileInputSchema>;

const nullableEmailInputSchema = z
  .string()
  .transform((value) => value.normalize("NFKC").trim().toLowerCase())
  .pipe(z.email().max(CUSTOMER_CONTRACT_LIMITS.EMAIL_LENGTH))
  .nullable();

const customerEditableShape = {
  name: requiredNameSchema,
  phone: PakistanMobileInputSchema,
  email: nullableEmailInputSchema.default(null),
  marketingConsent: z
    .enum(CUSTOMER_MARKETING_CONSENT_STATUSES)
    .default("pending"),
  addressLine: nullableText(CUSTOMER_CONTRACT_LIMITS.ADDRESS_LENGTH).default(
    null,
  ),
  notes: nullableText(CUSTOMER_CONTRACT_LIMITS.NOTE_LENGTH).default(null),
};

/** Basic customer registration intentionally accepts no identity document. */
export const CreateCustomerInputSchema = z
  .object(customerEditableShape)
  .strict();
export type CreateCustomerInput = z.input<typeof CreateCustomerInputSchema>;
export type CreateCustomerData = z.output<typeof CreateCustomerInputSchema>;

/** Replace semantics plus optimistic concurrency. */
export const UpdateCustomerInputSchema = z
  .object({
    name: requiredNameSchema,
    phone: PakistanMobileInputSchema,
    email: nullableEmailInputSchema,
    marketingConsent: z.enum(CUSTOMER_MARKETING_CONSENT_STATUSES),
    addressLine: nullableText(CUSTOMER_CONTRACT_LIMITS.ADDRESS_LENGTH),
    notes: nullableText(CUSTOMER_CONTRACT_LIMITS.NOTE_LENGTH),
    version: z.number().int().positive(),
  })
  .strict();
export type UpdateCustomerInput = z.input<typeof UpdateCustomerInputSchema>;
export type UpdateCustomerData = z.output<typeof UpdateCustomerInputSchema>;

export const CustomerVersionInputSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export type CustomerVersionInput = z.input<typeof CustomerVersionInputSchema>;
export type CustomerVersionData = z.output<typeof CustomerVersionInputSchema>;

const pageInputSchema = z.coerce
  .number()
  .int()
  .positive()
  .default(PAGINATION.DEFAULT_PAGE);
const pageSizeInputSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(PAGINATION.MAX_PAGE_SIZE)
  .default(PAGINATION.DEFAULT_PAGE_SIZE);
const optionalSearchSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = normalizeDisplayText(value);
  return normalized.length === 0 ? undefined : normalized;
}, z.string().max(LIMITS.MAX_SEARCH_TERM_LENGTH).optional());
const optionalQueryBooleanSchema = z.preprocess((value) => {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}, z.boolean().optional());

export const CustomerListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchSchema,
    hasReceivable: optionalQueryBooleanSchema,
    active: optionalQueryBooleanSchema,
    sort: z.enum(CUSTOMER_SORT_FIELDS).default("name"),
    direction: z.enum(SORT_DIRECTIONS).default("asc"),
  })
  .strict();
export type CustomerListQueryInput = z.input<typeof CustomerListQuerySchema>;
export type CustomerListQuery = z.output<typeof CustomerListQuerySchema>;

const responseMoneySchema = z.number().int().safe().nonnegative();
const responsePhoneSchema = z
  .string()
  .max(CUSTOMER_CONTRACT_LIMITS.PHONE_LENGTH)
  .regex(/^\+923\d{9}$/, "Customer phone must be normalized PK E.164.");

const customerSummaryShape = {
  id: z.uuid(),
  name: z.string().min(1).max(CUSTOMER_CONTRACT_LIMITS.NAME_LENGTH),
  phone: responsePhoneSchema,
  marketingConsent: z.enum(CUSTOMER_MARKETING_CONSENT_STATUSES),
  purchaseCount: z.number().int().nonnegative(),
  lifetimeSpendMinor: responseMoneySchema,
  receivableBalanceMinor: responseMoneySchema,
  lastVisitAt: z.iso.datetime().nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const CustomerSummarySchema = z.object(customerSummaryShape).strict();
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;

const availableSensitiveCustomerFieldsSchema = z
  .object({
    availability: z.literal("available"),
    nationalIdentityReference: z
      .string()
      .min(1)
      .max(CUSTOMER_CONTRACT_LIMITS.REFERENCE_LENGTH)
      .nullable(),
    externalReference: z
      .string()
      .min(1)
      .max(CUSTOMER_CONTRACT_LIMITS.REFERENCE_LENGTH)
      .nullable(),
  })
  .strict();
const redactedSensitiveCustomerFieldsSchema = z
  .object({
    availability: z.literal("redacted"),
  })
  .strict();

/** Redaction is structural: the redacted branch has no sensitive keys. */
export const CustomerSensitiveFieldsSchema = z.discriminatedUnion(
  "availability",
  [
    availableSensitiveCustomerFieldsSchema,
    redactedSensitiveCustomerFieldsSchema,
  ],
);
export type CustomerSensitiveFields = z.infer<
  typeof CustomerSensitiveFieldsSchema
>;

export const CustomerDetailSchema = z
  .object({
    ...customerSummaryShape,
    email: z.email().max(CUSTOMER_CONTRACT_LIMITS.EMAIL_LENGTH).nullable(),
    addressLine: z
      .string()
      .min(1)
      .max(CUSTOMER_CONTRACT_LIMITS.ADDRESS_LENGTH)
      .nullable(),
    notes: z
      .string()
      .min(1)
      .max(CUSTOMER_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
    sensitive: CustomerSensitiveFieldsSchema,
  })
  .strict();
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;

export const CustomerPageSchema = createPageEnvelopeSchema(
  CustomerSummarySchema,
);
export type CustomerPage = z.infer<typeof CustomerPageSchema>;
