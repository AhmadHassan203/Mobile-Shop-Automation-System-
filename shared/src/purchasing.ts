import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import {
  PRODUCT_CONDITIONS,
  PTA_STATUSES,
  PURCHASE_ORDER_STATUSES,
  TRACKING_TYPES,
} from "./enums";
import { normalizeImei, normalizeSerial } from "./imei";

/**
 * Public contracts for suppliers, purchase orders and goods receiving.
 *
 * Tenant and branch scope always come from the authenticated session. Totals,
 * received progress, landed-cost allocations and payable amounts are response
 * values only: the server recalculates them inside the posting transaction.
 */
export const PURCHASING_CONTRACT_LIMITS = Object.freeze({
  SUPPLIER_CODE_LENGTH: 40,
  NAME_LENGTH: 200,
  CONTACT_ROLE_LENGTH: 100,
  PHONE_LENGTH: 20,
  EMAIL_LENGTH: 255,
  ADDRESS_LENGTH: 300,
  CITY_LENGTH: 100,
  NOTE_LENGTH: 500,
  REFERENCE_LENGTH: 100,
  IDENTIFIER_LENGTH: 64,
  MAX_CONTACTS_PER_SUPPLIER: 20,
  MAX_LINES_PER_PURCHASE_ORDER: 200,
  MAX_UNITS_PER_RECEIPT: 500,
  MAX_LANDED_COSTS_PER_RECEIPT: 20,
  MAX_QUANTITY_PER_LINE: 100_000,
  MAX_TERMS_DAYS: 3_650,
  MAX_LEAD_TIME_DAYS: 365,
  BASIS_POINTS_MAX: 10_000,
});

export const RECEIVABLE_PURCHASE_ORDER_STATUSES = [
  "approved",
  "ordered",
  "partially_received",
] as const;

export const RECEIVING_SERIALIZED_STATES = [
  "available",
  "pending_verification",
  "quarantined",
] as const;

export const LANDED_COST_KINDS = [
  "freight",
  "customs",
  "insurance",
  "handling",
  "tax",
  "other",
] as const;
export type LandedCostKind = (typeof LANDED_COST_KINDS)[number];

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeSupplierCode(value: string): string {
  return normalizeDisplayText(value).replace(/\s+/gu, "-").toUpperCase();
}

const requiredText = (label: string, maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(
      z
        .string()
        .min(1, `Enter ${label}.`)
        .max(maximum, `${label} must be ${maximum} characters or fewer.`),
    );

const nullableText = (label: string, maximum: number) =>
  z
    .string()
    .transform(normalizeDisplayText)
    .pipe(
      z
        .string()
        .min(1, `${label} cannot be blank.`)
        .max(maximum, `${label} must be ${maximum} characters or fewer.`),
    )
    .nullable();

const optionalNullableText = (label: string, maximum: number) =>
  nullableText(label, maximum).optional();

const supplierCodeInputSchema = z
  .string()
  .transform(normalizeSupplierCode)
  .pipe(
    z
      .string()
      .min(1, "Enter a supplier code.")
      .max(PURCHASING_CONTRACT_LIMITS.SUPPLIER_CODE_LENGTH)
      .regex(
        /^[A-Z0-9][A-Z0-9._/-]*$/,
        "Supplier code may contain only letters, numbers, dots, underscores, slashes and hyphens.",
      ),
  );

const positiveVersionSchema = z
  .number()
  .int()
  .positive("Provide the record version you are editing.");

const quantitySchema = z
  .number()
  .int()
  .positive()
  .max(PURCHASING_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE);

/** JSON money is an exact, safe integer number of minor currency units. */
export const NonnegativeMoneyMinorSchema = z
  .number()
  .int("Amount must be an integer number of minor units.")
  .safe("Amount is outside the safe integer range.")
  .nonnegative("Amount cannot be negative.");

const responseTimestampSchema = z.iso.datetime();
const responseBusinessDateSchema = z.iso.date();
const responseMoneySchema = z.number().int().safe().nonnegative();

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
const optionalSearchInputSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = normalizeDisplayText(value);
  return normalized.length === 0 ? undefined : normalized;
}, z.string().max(LIMITS.MAX_SEARCH_TERM_LENGTH).optional());
const optionalQueryBooleanSchema = z.preprocess((value) => {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}, z.boolean().optional());

// =============================================================================
// Suppliers
// =============================================================================

export const SupplierContactInputSchema = z
  .object({
    name: requiredText(
      "a contact name",
      PURCHASING_CONTRACT_LIMITS.NAME_LENGTH,
    ),
    role: optionalNullableText(
      "Contact role",
      PURCHASING_CONTRACT_LIMITS.CONTACT_ROLE_LENGTH,
    ),
    phone: optionalNullableText(
      "Phone",
      PURCHASING_CONTRACT_LIMITS.PHONE_LENGTH,
    ),
    email: z
      .string()
      .transform((value) => value.normalize("NFKC").trim().toLowerCase())
      .pipe(z.email().max(PURCHASING_CONTRACT_LIMITS.EMAIL_LENGTH))
      .nullable()
      .optional(),
    isPrimary: z.boolean().default(false),
  })
  .strict()
  .superRefine((contact, context) => {
    if ((contact.phone ?? null) === null && (contact.email ?? null) === null) {
      context.addIssue({
        code: "custom",
        message: "Enter a phone number or email address for this contact.",
        path: ["phone"],
      });
    }
  });
export type SupplierContactInput = z.input<typeof SupplierContactInputSchema>;
export type SupplierContactData = z.output<typeof SupplierContactInputSchema>;

const supplierInputShape = {
  code: supplierCodeInputSchema,
  name: requiredText("a supplier name", PURCHASING_CONTRACT_LIMITS.NAME_LENGTH),
  contacts: z
    .array(SupplierContactInputSchema)
    .max(PURCHASING_CONTRACT_LIMITS.MAX_CONTACTS_PER_SUPPLIER)
    .default([]),
  paymentTermsDays: z
    .number()
    .int()
    .nonnegative()
    .max(PURCHASING_CONTRACT_LIMITS.MAX_TERMS_DAYS)
    .default(0),
  leadTimeDays: z
    .number()
    .int()
    .nonnegative()
    .max(PURCHASING_CONTRACT_LIMITS.MAX_LEAD_TIME_DAYS)
    .default(0),
  addressLine: optionalNullableText(
    "Address",
    PURCHASING_CONTRACT_LIMITS.ADDRESS_LENGTH,
  ),
  city: optionalNullableText("City", PURCHASING_CONTRACT_LIMITS.CITY_LENGTH),
  notes: optionalNullableText("Notes", PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH),
};

interface SupplierInputWithContacts {
  readonly contacts: readonly { readonly isPrimary: boolean }[];
}

function refineSupplierContacts(
  supplier: SupplierInputWithContacts,
  context: z.RefinementCtx,
): void {
  const primaryCount = supplier.contacts.filter(
    (contact) => contact.isPrimary,
  ).length;
  if (primaryCount > 1) {
    context.addIssue({
      code: "custom",
      message: "Choose only one primary contact.",
      path: ["contacts"],
    });
  }
}

export const CreateSupplierInputSchema = z
  .object(supplierInputShape)
  .strict()
  .superRefine(refineSupplierContacts);
export type CreateSupplierInput = z.input<typeof CreateSupplierInputSchema>;
export type CreateSupplierData = z.output<typeof CreateSupplierInputSchema>;

export const UpdateSupplierInputSchema = z
  .object({ ...supplierInputShape, version: positiveVersionSchema })
  .strict()
  .superRefine(refineSupplierContacts);
export type UpdateSupplierInput = z.input<typeof UpdateSupplierInputSchema>;
export type UpdateSupplierData = z.output<typeof UpdateSupplierInputSchema>;

export const PurchasingVersionInputSchema = z
  .object({ version: positiveVersionSchema })
  .strict();
export type PurchasingVersionInput = z.input<
  typeof PurchasingVersionInputSchema
>;
export type PurchasingVersionData = z.output<
  typeof PurchasingVersionInputSchema
>;

export const SupplierListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchInputSchema,
    active: optionalQueryBooleanSchema,
  })
  .strict();
export type SupplierListQueryInput = z.input<typeof SupplierListQuerySchema>;
export type SupplierListQuery = z.output<typeof SupplierListQuerySchema>;

export const SupplierContactSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.NAME_LENGTH),
    role: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.CONTACT_ROLE_LENGTH)
      .nullable(),
    phone: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.PHONE_LENGTH)
      .nullable(),
    email: z.email().max(PURCHASING_CONTRACT_LIMITS.EMAIL_LENGTH).nullable(),
    isPrimary: z.boolean(),
  })
  .strict();
export type SupplierContact = z.infer<typeof SupplierContactSchema>;

const supplierSummaryShape = {
  id: z.uuid(),
  code: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.SUPPLIER_CODE_LENGTH),
  name: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.NAME_LENGTH),
  primaryContact: SupplierContactSchema.nullable(),
  paymentTermsDays: z
    .number()
    .int()
    .nonnegative()
    .max(PURCHASING_CONTRACT_LIMITS.MAX_TERMS_DAYS),
  leadTimeDays: z
    .number()
    .int()
    .nonnegative()
    .max(PURCHASING_CONTRACT_LIMITS.MAX_LEAD_TIME_DAYS),
  onTimeRateBasisPoints: z
    .number()
    .int()
    .min(0)
    .max(PURCHASING_CONTRACT_LIMITS.BASIS_POINTS_MAX)
    .nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  createdAt: responseTimestampSchema,
  updatedAt: responseTimestampSchema,
};

export const SupplierSummarySchema = z.object(supplierSummaryShape).strict();
export type SupplierSummary = z.infer<typeof SupplierSummarySchema>;

export const SupplierDetailSchema = z
  .object({
    ...supplierSummaryShape,
    addressLine: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.ADDRESS_LENGTH)
      .nullable(),
    city: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.CITY_LENGTH)
      .nullable(),
    notes: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
    contacts: z
      .array(SupplierContactSchema)
      .max(PURCHASING_CONTRACT_LIMITS.MAX_CONTACTS_PER_SUPPLIER),
  })
  .strict();
export type SupplierDetail = z.infer<typeof SupplierDetailSchema>;

export const SupplierPageSchema = createPageEnvelopeSchema(
  SupplierSummarySchema,
);
export type SupplierPage = z.infer<typeof SupplierPageSchema>;

// =============================================================================
// Purchase orders
// =============================================================================

export const PurchaseOrderLineInputSchema = z
  .object({
    productVariantId: z.uuid(),
    quantity: quantitySchema,
    unitCostMinor: NonnegativeMoneyMinorSchema,
    notes: optionalNullableText(
      "Line notes",
      PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH,
    ),
  })
  .strict();
export type PurchaseOrderLineInput = z.input<
  typeof PurchaseOrderLineInputSchema
>;
export type PurchaseOrderLineData = z.output<
  typeof PurchaseOrderLineInputSchema
>;

interface PurchaseOrderInputWithLines {
  readonly lines: readonly {
    readonly productVariantId: string;
    readonly quantity: number;
    readonly unitCostMinor: number;
  }[];
}

function refinePurchaseOrderLines(
  order: PurchaseOrderInputWithLines,
  context: z.RefinementCtx,
): void {
  const firstLineByVariant = new Map<string, number>();
  let orderTotal = 0n;
  order.lines.forEach((line, index) => {
    const firstIndex = firstLineByVariant.get(line.productVariantId);
    if (firstIndex !== undefined) {
      context.addIssue({
        code: "custom",
        message: `This product duplicates line ${firstIndex + 1}.`,
        path: ["lines", index, "productVariantId"],
      });
    } else {
      firstLineByVariant.set(line.productVariantId, index);
    }

    const lineTotal = BigInt(line.unitCostMinor) * BigInt(line.quantity);
    orderTotal += lineTotal;
    if (lineTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
      context.addIssue({
        code: "custom",
        message: "Line total is outside the exact money range.",
        path: ["lines", index, "unitCostMinor"],
      });
    }
  });

  if (orderTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    context.addIssue({
      code: "custom",
      message: "Purchase order total is outside the exact money range.",
      path: ["lines"],
    });
  }
}

const purchaseOrderInputShape = {
  supplierId: z.uuid(),
  expectedOn: z.iso.date().nullable().optional(),
  notes: optionalNullableText(
    "Purchase order notes",
    PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH,
  ),
  lines: z
    .array(PurchaseOrderLineInputSchema)
    .min(1, "Add at least one purchase line.")
    .max(PURCHASING_CONTRACT_LIMITS.MAX_LINES_PER_PURCHASE_ORDER),
};

export const CreatePurchaseOrderInputSchema = z
  .object(purchaseOrderInputShape)
  .strict()
  .superRefine(refinePurchaseOrderLines);
export type CreatePurchaseOrderInput = z.input<
  typeof CreatePurchaseOrderInputSchema
>;
export type CreatePurchaseOrderData = z.output<
  typeof CreatePurchaseOrderInputSchema
>;

export const UpdatePurchaseOrderInputSchema = z
  .object({ ...purchaseOrderInputShape, version: positiveVersionSchema })
  .strict()
  .superRefine(refinePurchaseOrderLines);
export type UpdatePurchaseOrderInput = z.input<
  typeof UpdatePurchaseOrderInputSchema
>;
export type UpdatePurchaseOrderData = z.output<
  typeof UpdatePurchaseOrderInputSchema
>;

export const PurchaseOrderTransitionInputSchema = z
  .object({
    version: positiveVersionSchema,
    reason: optionalNullableText(
      "Reason",
      PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH,
    ),
  })
  .strict();
export type PurchaseOrderTransitionInput = z.input<
  typeof PurchaseOrderTransitionInputSchema
>;
export type PurchaseOrderTransitionData = z.output<
  typeof PurchaseOrderTransitionInputSchema
>;

export const CancelPurchaseOrderInputSchema = z
  .object({
    version: positiveVersionSchema,
    reason: requiredText(
      "a cancellation reason",
      PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH,
    ),
  })
  .strict();
export type CancelPurchaseOrderInput = z.input<
  typeof CancelPurchaseOrderInputSchema
>;
export type CancelPurchaseOrderData = z.output<
  typeof CancelPurchaseOrderInputSchema
>;

export const PurchaseOrderListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchInputSchema,
    status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
    supplierId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      query.from > query.to
    ) {
      context.addIssue({
        code: "custom",
        message: "The start date must not be after the end date.",
        path: ["from"],
      });
    }
  });
export type PurchaseOrderListQueryInput = z.input<
  typeof PurchaseOrderListQuerySchema
>;
export type PurchaseOrderListQuery = z.output<
  typeof PurchaseOrderListQuerySchema
>;

const nestedSupplierSchema = z
  .object({
    id: z.uuid(),
    code: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.SUPPLIER_CODE_LENGTH),
    name: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.NAME_LENGTH),
  })
  .strict();

const nestedProductVariantSchema = z
  .object({
    id: z.uuid(),
    sku: z.string().min(1).max(100),
    name: z.string().min(1).max(240),
    trackingType: z.enum(TRACKING_TYPES),
    condition: z.enum(PRODUCT_CONDITIONS),
    ptaStatus: z.enum(PTA_STATUSES),
  })
  .strict();

export const PurchaseOrderLineSchema = z
  .object({
    id: z.uuid(),
    productVariant: nestedProductVariantSchema,
    quantityOrdered: quantitySchema,
    quantityReceived: z
      .number()
      .int()
      .nonnegative()
      .max(PURCHASING_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE),
    quantityRemaining: z
      .number()
      .int()
      .nonnegative()
      .max(PURCHASING_CONTRACT_LIMITS.MAX_QUANTITY_PER_LINE),
    unitCostMinor: responseMoneySchema,
    lineTotalMinor: responseMoneySchema,
    notes: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
  })
  .strict()
  .superRefine((line, context) => {
    if (line.quantityReceived > line.quantityOrdered) {
      context.addIssue({
        code: "custom",
        message: "Received quantity exceeds ordered quantity.",
        path: ["quantityReceived"],
      });
    }
    if (
      line.quantityRemaining !==
      line.quantityOrdered - line.quantityReceived
    ) {
      context.addIssue({
        code: "custom",
        message: "Remaining quantity does not match ordered minus received.",
        path: ["quantityRemaining"],
      });
    }
    if (
      BigInt(line.lineTotalMinor) !==
      BigInt(line.unitCostMinor) * BigInt(line.quantityOrdered)
    ) {
      context.addIssue({
        code: "custom",
        message: "Line total does not match unit cost times quantity.",
        path: ["lineTotalMinor"],
      });
    }
  });
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>;

const purchaseOrderSummaryShape = {
  id: z.uuid(),
  number: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH),
  supplier: nestedSupplierSchema,
  status: z.enum(PURCHASE_ORDER_STATUSES),
  orderDate: responseBusinessDateSchema,
  expectedOn: responseBusinessDateSchema.nullable(),
  totalMinor: responseMoneySchema,
  totalUnits: z.number().int().positive(),
  receivedUnits: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: responseTimestampSchema,
  updatedAt: responseTimestampSchema,
};

interface PurchaseOrderSummaryInvariants {
  readonly totalUnits: number;
  readonly receivedUnits: number;
}

function refinePurchaseOrderSummary(
  order: PurchaseOrderSummaryInvariants,
  context: z.RefinementCtx,
): void {
  if (order.receivedUnits > order.totalUnits) {
    context.addIssue({
      code: "custom",
      message: "Received units exceed ordered units.",
      path: ["receivedUnits"],
    });
  }
}

export const PurchaseOrderSummarySchema = z
  .object(purchaseOrderSummaryShape)
  .strict()
  .superRefine(refinePurchaseOrderSummary);
export type PurchaseOrderSummary = z.infer<typeof PurchaseOrderSummarySchema>;

export const PurchaseOrderDetailSchema = z
  .object({
    ...purchaseOrderSummaryShape,
    notes: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
    approvedAt: responseTimestampSchema.nullable(),
    orderedAt: responseTimestampSchema.nullable(),
    closedAt: responseTimestampSchema.nullable(),
    cancelledAt: responseTimestampSchema.nullable(),
    lines: z
      .array(PurchaseOrderLineSchema)
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.MAX_LINES_PER_PURCHASE_ORDER),
  })
  .strict()
  .superRefine(refinePurchaseOrderSummary);
export type PurchaseOrderDetail = z.infer<typeof PurchaseOrderDetailSchema>;

export const PurchaseOrderPageSchema = createPageEnvelopeSchema(
  PurchaseOrderSummarySchema,
);
export type PurchaseOrderPage = z.infer<typeof PurchaseOrderPageSchema>;

// =============================================================================
// Goods receiving
// =============================================================================

const imeiInputSchema = z
  .string()
  .min(1, "Enter an IMEI.")
  .max(PURCHASING_CONTRACT_LIMITS.IDENTIFIER_LENGTH)
  .regex(
    /^[0-9\s.-]+$/,
    "IMEI may contain digits and common spreadsheet separators only.",
  )
  .transform((value, context) => {
    const normalized = normalizeImei(value);
    if (normalized === null || ![15, 16].includes(normalized.length)) {
      context.addIssue({
        code: "custom",
        message: "IMEI must contain 15 digits (or 16 for IMEISV).",
      });
      return z.NEVER;
    }
    return normalized;
  });

const optionalImeiInputSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  imeiInputSchema.nullable().optional(),
);

const optionalSerialInputSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .min(1)
    .max(PURCHASING_CONTRACT_LIMITS.IDENTIFIER_LENGTH)
    .transform((value, context) => {
      const normalized = normalizeSerial(value);
      if (normalized === null) {
        context.addIssue({ code: "custom", message: "Serial is empty." });
        return z.NEVER;
      }
      return normalized;
    })
    .nullable()
    .optional(),
);

export const ReceiveSerializedUnitInputSchema = z
  .object({
    imei1: imeiInputSchema,
    imei2: optionalImeiInputSchema,
    serialNumber: optionalSerialInputSchema,
    initialState: z.enum(RECEIVING_SERIALIZED_STATES).default("available"),
  })
  .strict()
  .superRefine((unit, context) => {
    const identifiers = [unit.imei1, unit.imei2, unit.serialNumber].filter(
      (value): value is string => value !== undefined && value !== null,
    );
    const firstIndexByIdentifier = new Map<string, number>();
    identifiers.forEach((identifier, index) => {
      const first = firstIndexByIdentifier.get(identifier);
      if (first !== undefined) {
        context.addIssue({
          code: "custom",
          message: "A unit cannot repeat the same IMEI or serial.",
          path: [index === 1 ? "imei2" : "serialNumber"],
        });
      } else {
        firstIndexByIdentifier.set(identifier, index);
      }
    });
  });
export type ReceiveSerializedUnitInput = z.input<
  typeof ReceiveSerializedUnitInputSchema
>;
export type ReceiveSerializedUnitData = z.output<
  typeof ReceiveSerializedUnitInputSchema
>;

export const ReceiveSerializedLineInputSchema = z
  .object({
    purchaseOrderLineId: z.uuid(),
    trackingType: z.literal("serialized"),
    stockLocationId: z.uuid(),
    unitCostMinor: NonnegativeMoneyMinorSchema,
    units: z
      .array(ReceiveSerializedUnitInputSchema)
      .min(1, "Enter at least one serialized unit.")
      .max(PURCHASING_CONTRACT_LIMITS.MAX_UNITS_PER_RECEIPT),
  })
  .strict();
export type ReceiveSerializedLineInput = z.input<
  typeof ReceiveSerializedLineInputSchema
>;
export type ReceiveSerializedLineData = z.output<
  typeof ReceiveSerializedLineInputSchema
>;

export const ReceiveQuantityLineInputSchema = z
  .object({
    purchaseOrderLineId: z.uuid(),
    trackingType: z.literal("quantity"),
    stockLocationId: z.uuid(),
    unitCostMinor: NonnegativeMoneyMinorSchema,
    quantity: quantitySchema,
  })
  .strict();
export type ReceiveQuantityLineInput = z.input<
  typeof ReceiveQuantityLineInputSchema
>;
export type ReceiveQuantityLineData = z.output<
  typeof ReceiveQuantityLineInputSchema
>;

export const GoodsReceiptLineInputSchema = z.discriminatedUnion(
  "trackingType",
  [ReceiveSerializedLineInputSchema, ReceiveQuantityLineInputSchema],
);
export type GoodsReceiptLineInput = z.input<typeof GoodsReceiptLineInputSchema>;
export type GoodsReceiptLineData = z.output<typeof GoodsReceiptLineInputSchema>;

export const LandedCostInputSchema = z
  .object({
    kind: z.enum(LANDED_COST_KINDS),
    amountMinor: NonnegativeMoneyMinorSchema.positive(),
    reference: optionalNullableText(
      "Cost reference",
      PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH,
    ),
    notes: optionalNullableText(
      "Cost notes",
      PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH,
    ),
  })
  .strict();
export type LandedCostInput = z.input<typeof LandedCostInputSchema>;
export type LandedCostData = z.output<typeof LandedCostInputSchema>;

export const CreateGoodsReceiptInputSchema = z
  .object({
    purchaseOrderId: z.uuid(),
    supplierInvoiceReference: optionalNullableText(
      "Supplier invoice reference",
      PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH,
    ),
    invoiceDueOn: z.iso.date().nullable().optional(),
    notes: optionalNullableText(
      "Goods receipt notes",
      PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH,
    ),
    landedCosts: z
      .array(LandedCostInputSchema)
      .max(PURCHASING_CONTRACT_LIMITS.MAX_LANDED_COSTS_PER_RECEIPT)
      .default([]),
    lines: z
      .array(GoodsReceiptLineInputSchema)
      .min(1, "Receive at least one purchase line.")
      .max(PURCHASING_CONTRACT_LIMITS.MAX_LINES_PER_PURCHASE_ORDER),
  })
  .strict()
  .superRefine((receipt, context) => {
    const seenDestinations = new Map<string, number>();
    const seenIdentifiers = new Map<string, string>();
    let unitCount = 0;
    let actualCostTotal = 0n;

    receipt.lines.forEach((line, lineIndex) => {
      const destinationKey = `${line.purchaseOrderLineId}:${line.stockLocationId}`;
      const firstLine = seenDestinations.get(destinationKey);
      if (firstLine !== undefined) {
        context.addIssue({
          code: "custom",
          message: `This order line and location duplicate receipt line ${firstLine + 1}.`,
          path: ["lines", lineIndex, "stockLocationId"],
        });
      } else {
        seenDestinations.set(destinationKey, lineIndex);
      }

      if (line.trackingType === "quantity") {
        unitCount += line.quantity;
        actualCostTotal += BigInt(line.unitCostMinor) * BigInt(line.quantity);
        return;
      }

      unitCount += line.units.length;
      actualCostTotal += BigInt(line.unitCostMinor) * BigInt(line.units.length);
      line.units.forEach((unit, unitIndex) => {
        const values = [
          ["imei1", unit.imei1],
          ["imei2", unit.imei2],
          ["serialNumber", unit.serialNumber],
        ] as const;
        values.forEach(([field, value]) => {
          if (value === undefined || value === null) return;
          const firstPath = seenIdentifiers.get(value);
          if (firstPath !== undefined) {
            context.addIssue({
              code: "custom",
              message: `Identifier duplicates ${firstPath}.`,
              path: ["lines", lineIndex, "units", unitIndex, field],
            });
          } else {
            seenIdentifiers.set(
              value,
              `line ${lineIndex + 1}, unit ${unitIndex + 1}`,
            );
          }
        });
      });
    });

    if (unitCount > PURCHASING_CONTRACT_LIMITS.MAX_UNITS_PER_RECEIPT) {
      context.addIssue({
        code: "custom",
        message: `A receipt may contain at most ${PURCHASING_CONTRACT_LIMITS.MAX_UNITS_PER_RECEIPT} units.`,
        path: ["lines"],
      });
    }

    if (actualCostTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
      context.addIssue({
        code: "custom",
        message: "Receipt invoice total is outside the exact money range.",
        path: ["lines"],
      });
    }

    const landedCostTotal = receipt.landedCosts.reduce(
      (total, cost) => total + BigInt(cost.amountMinor),
      actualCostTotal,
    );
    if (landedCostTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
      context.addIssue({
        code: "custom",
        message: "Receipt landed-cost total is outside the exact money range.",
        path: ["landedCosts"],
      });
    }
  });
export type CreateGoodsReceiptInput = z.input<
  typeof CreateGoodsReceiptInputSchema
>;
export type CreateGoodsReceiptData = z.output<
  typeof CreateGoodsReceiptInputSchema
>;

export const GoodsReceiptListQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchInputSchema,
    purchaseOrderId: z.uuid().optional(),
    supplierId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      query.from > query.to
    ) {
      context.addIssue({
        code: "custom",
        message: "The start date must not be after the end date.",
        path: ["from"],
      });
    }
  });
export type GoodsReceiptListQueryInput = z.input<
  typeof GoodsReceiptListQuerySchema
>;
export type GoodsReceiptListQuery = z.output<
  typeof GoodsReceiptListQuerySchema
>;

const nestedPurchaseOrderSchema = z
  .object({
    id: z.uuid(),
    number: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH),
  })
  .strict();

const nestedStockLocationSchema = z
  .object({
    id: z.uuid(),
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.NAME_LENGTH),
  })
  .strict();

export const ReceivedSerializedUnitSchema = z
  .object({
    id: z.uuid(),
    imei1: z.string().min(15).max(16).regex(/^\d+$/),
    imei2: z.string().min(15).max(16).regex(/^\d+$/).nullable(),
    serialNumber: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.IDENTIFIER_LENGTH)
      .nullable(),
    state: z.enum(RECEIVING_SERIALIZED_STATES),
    actualCostMinor: responseMoneySchema,
    landedCostMinor: responseMoneySchema,
  })
  .strict();
export type ReceivedSerializedUnit = z.infer<
  typeof ReceivedSerializedUnitSchema
>;

export const GoodsReceiptLineSchema = z
  .object({
    id: z.uuid(),
    purchaseOrderLineId: z.uuid(),
    productVariant: nestedProductVariantSchema,
    stockLocation: nestedStockLocationSchema,
    quantityReceived: quantitySchema,
    unitCostMinor: responseMoneySchema,
    actualCostTotalMinor: responseMoneySchema,
    landedCostAllocatedMinor: responseMoneySchema,
    landedCostTotalMinor: responseMoneySchema,
    stockBatchId: z.uuid().nullable(),
    serializedUnits: z
      .array(ReceivedSerializedUnitSchema)
      .max(PURCHASING_CONTRACT_LIMITS.MAX_UNITS_PER_RECEIPT),
  })
  .strict()
  .superRefine((line, context) => {
    if (
      BigInt(line.actualCostTotalMinor) !==
      BigInt(line.unitCostMinor) * BigInt(line.quantityReceived)
    ) {
      context.addIssue({
        code: "custom",
        message: "Actual cost total does not match unit cost times quantity.",
        path: ["actualCostTotalMinor"],
      });
    }
    if (
      line.landedCostTotalMinor !==
      line.actualCostTotalMinor + line.landedCostAllocatedMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Landed total does not reconcile.",
        path: ["landedCostTotalMinor"],
      });
    }
    if (
      line.productVariant.trackingType === "serialized" &&
      line.serializedUnits.length !== line.quantityReceived
    ) {
      context.addIssue({
        code: "custom",
        message: "Serialized unit count does not match received quantity.",
        path: ["serializedUnits"],
      });
    }
    if (
      line.productVariant.trackingType === "quantity" &&
      line.serializedUnits.length !== 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Quantity-tracked lines cannot contain serialized units.",
        path: ["serializedUnits"],
      });
    }
  });
export type GoodsReceiptLine = z.infer<typeof GoodsReceiptLineSchema>;

export const LandedCostSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(LANDED_COST_KINDS),
    amountMinor: responseMoneySchema.positive(),
    reference: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH)
      .nullable(),
    notes: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
  })
  .strict();
export type LandedCost = z.infer<typeof LandedCostSchema>;

export const PayableReferenceSchema = z
  .object({
    id: z.uuid(),
    dueOn: responseBusinessDateSchema,
    amountMinor: responseMoneySchema,
    outstandingMinor: responseMoneySchema,
    status: z.enum(["open", "partially_paid", "paid", "cancelled"]),
  })
  .strict()
  .superRefine((payable, context) => {
    if (payable.outstandingMinor > payable.amountMinor) {
      context.addIssue({
        code: "custom",
        message: "Outstanding payable cannot exceed its original amount.",
        path: ["outstandingMinor"],
      });
    }
  });
export type PayableReference = z.infer<typeof PayableReferenceSchema>;

const goodsReceiptSummaryShape = {
  id: z.uuid(),
  number: z.string().min(1).max(PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH),
  purchaseOrder: nestedPurchaseOrderSchema,
  supplier: nestedSupplierSchema,
  supplierInvoiceReference: z
    .string()
    .min(1)
    .max(PURCHASING_CONTRACT_LIMITS.REFERENCE_LENGTH)
    .nullable(),
  receivedAt: responseTimestampSchema,
  lineCount: z.number().int().positive(),
  unitCount: z.number().int().positive(),
  actualCostTotalMinor: responseMoneySchema,
  landedCostTotalMinor: responseMoneySchema,
  payableTotalMinor: responseMoneySchema,
  createdAt: responseTimestampSchema,
};

interface GoodsReceiptSummaryInvariants {
  readonly actualCostTotalMinor: number;
  readonly landedCostTotalMinor: number;
  readonly payableTotalMinor: number;
}

function refineGoodsReceiptSummary(
  receipt: GoodsReceiptSummaryInvariants,
  context: z.RefinementCtx,
): void {
  if (receipt.landedCostTotalMinor < receipt.actualCostTotalMinor) {
    context.addIssue({
      code: "custom",
      message: "Landed cost cannot be lower than actual product cost.",
      path: ["landedCostTotalMinor"],
    });
  }
  if (receipt.payableTotalMinor !== receipt.actualCostTotalMinor) {
    context.addIssue({
      code: "custom",
      message: "Supplier payable must reconcile to the invoice product cost.",
      path: ["payableTotalMinor"],
    });
  }
}

export const GoodsReceiptSummarySchema = z
  .object(goodsReceiptSummaryShape)
  .strict()
  .superRefine(refineGoodsReceiptSummary);
export type GoodsReceiptSummary = z.infer<typeof GoodsReceiptSummarySchema>;

export const GoodsReceiptDetailSchema = z
  .object({
    ...goodsReceiptSummaryShape,
    invoiceDueOn: responseBusinessDateSchema,
    notes: z
      .string()
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.NOTE_LENGTH)
      .nullable(),
    landedCosts: z
      .array(LandedCostSchema)
      .max(PURCHASING_CONTRACT_LIMITS.MAX_LANDED_COSTS_PER_RECEIPT),
    lines: z
      .array(GoodsReceiptLineSchema)
      .min(1)
      .max(PURCHASING_CONTRACT_LIMITS.MAX_LINES_PER_PURCHASE_ORDER),
    payable: PayableReferenceSchema,
  })
  .strict()
  .superRefine(refineGoodsReceiptSummary);
export type GoodsReceiptDetail = z.infer<typeof GoodsReceiptDetailSchema>;

export const GoodsReceiptPageSchema = createPageEnvelopeSchema(
  GoodsReceiptSummarySchema,
);
export type GoodsReceiptPage = z.infer<typeof GoodsReceiptPageSchema>;
