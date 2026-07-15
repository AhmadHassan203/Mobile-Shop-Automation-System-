import { z } from "zod";
import { LIMITS, PAGINATION } from "./constants";
import { createPageEnvelopeSchema } from "./catalog";
import {
  ADJUSTMENT_REASONS,
  MOVEMENT_TYPES,
  PRODUCT_CONDITIONS,
  PTA_STATUSES,
  SERIALIZED_STOCK_STATES,
  TRACKING_TYPES,
} from "./enums";
import { normalizeImei, type ImeiValidationCode } from "./imei";

/**
 * Public inventory contracts shared by the browser and API.
 *
 * Tenant scope, branch and actor always come from the authenticated server
 * context, so no schema here has an organization, branch or actor field. Unit
 * cost is owned by the purchasing slice: `serialized_units.actual_cost_minor`
 * and `landed_cost_minor` exist in the database but appear in NO contract
 * below, so cost can neither be smuggled in through an inventory request nor
 * leaked out through an inventory response.
 *
 * Balances are DERIVED from the append-only movement ledger plus the unit and
 * batch rows. `StockBalanceSchema` is a read model, never a stored table.
 */

export const INVENTORY_CONTRACT_LIMITS = Object.freeze({
  /** stock_locations.name is VARCHAR(200). */
  NAME_LENGTH: 200,
  /** stock_locations.code is VARCHAR(20) (migration 0001, applied). */
  CODE_LENGTH: 20,
  /** device_identifiers.normalized_value is VARCHAR(64). */
  IDENTIFIER_LENGTH: 64,
  /** inventory_movements.reference_type is VARCHAR(40). */
  REFERENCE_TYPE_LENGTH: 40,
  /** inventory_movements.reason is VARCHAR(500); mirrors LIMITS.MAX_REASON_LENGTH. */
  REASON_LENGTH: LIMITS.MAX_REASON_LENGTH,
  /** Pasted-spreadsheet ceiling for bulk IMEI entry (13_ §10). */
  MAX_BULK_IMEI_ROWS: LIMITS.MAX_BULK_IMEI_ROWS,
  /**
   * A dual-SIM handset carries imei1 + imei2 + a serial; eSIM models can add
   * one more. All of them share a single uniqueness namespace per organization.
   */
  MAX_IDENTIFIERS_PER_UNIT: 4,
  /** Keeps a single movement well inside the ledger's INTEGER quantity column. */
  MAX_MOVEMENT_QUANTITY: 1_000_000,
});

/**
 * Physical and virtual stock locations.
 *
 * Mirrors the `StockLocationKind` PostgreSQL enum created by migration 0001 and
 * already applied, so these are the only values the column will accept. The
 * public contract calls the field `locationType`; it maps to `stock_locations.kind`.
 */
export const STOCK_LOCATION_KINDS = ["store", "warehouse", "virtual"] as const;
export type StockLocationKind = (typeof STOCK_LOCATION_KINDS)[number];

function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

/** Location codes are compared upper-case; whitespace is represented by `-`. */
export function normalizeStockLocationCode(value: string): string {
  return normalizeDisplayText(value).replace(/\s+/g, "-").toUpperCase();
}

const requiredNameInputSchema = z
  .string()
  .transform(normalizeDisplayText)
  .pipe(
    z
      .string()
      .min(1, "Enter a name.")
      .max(
        INVENTORY_CONTRACT_LIMITS.NAME_LENGTH,
        `Name must be ${INVENTORY_CONTRACT_LIMITS.NAME_LENGTH} characters or fewer.`,
      ),
  );

const codeInputSchema = z
  .string()
  .transform(normalizeStockLocationCode)
  .pipe(
    z
      .string()
      .min(1, "Enter a code.")
      .max(
        INVENTORY_CONTRACT_LIMITS.CODE_LENGTH,
        `Code must be ${INVENTORY_CONTRACT_LIMITS.CODE_LENGTH} characters or fewer.`,
      )
      .regex(
        /^[A-Z0-9][A-Z0-9._-]*$/,
        "Code may contain only letters, numbers, dots, underscores and hyphens.",
      ),
  );

/**
 * A free-text justification that the actor must actually type.
 *
 * 13_ §10 requires a reason on every manual stock correction, and
 * INVENTORY_ADJUSTMENT_REASON_REQUIRED exists precisely so the server can
 * refuse one that is missing. Whitespace is normalized first so that "   "
 * cannot pass as an explanation.
 */
const requiredReasonInputSchema = z
  .string()
  .transform(normalizeDisplayText)
  .pipe(
    z
      .string()
      .min(1, "Enter a reason.")
      .max(
        INVENTORY_CONTRACT_LIMITS.REASON_LENGTH,
        `Reason must be ${INVENTORY_CONTRACT_LIMITS.REASON_LENGTH} characters or fewer.`,
      ),
  );

const optionalReasonInputSchema = z
  .string()
  .transform(normalizeDisplayText)
  .pipe(z.string().max(INVENTORY_CONTRACT_LIMITS.REASON_LENGTH))
  .nullable()
  .optional();

const movementQuantityInputSchema = z
  .number()
  .int()
  .positive("Enter a quantity of at least 1.")
  .max(
    INVENTORY_CONTRACT_LIMITS.MAX_MOVEMENT_QUANTITY,
    `Quantity must be ${INVENTORY_CONTRACT_LIMITS.MAX_MOVEMENT_QUANTITY} or fewer.`,
  );

/**
 * Optimistic concurrency token. Every inventory mutation against an existing
 * row carries the version the actor actually saw, so a concurrent edit fails
 * loudly with OPTIMISTIC_LOCK_FAILED instead of silently overwriting.
 */
const versionInputSchema = z
  .number()
  .int()
  .positive("Provide the record version you are editing.");

/** Body of the deactivate/reactivate transitions; identity comes from the path. */
export const InventoryVersionInputSchema = z
  .object({ version: versionInputSchema })
  .strict();
export type InventoryVersionInput = z.input<typeof InventoryVersionInputSchema>;
export type InventoryVersionData = z.output<typeof InventoryVersionInputSchema>;

// =============================================================================
// Stock locations
// =============================================================================

/**
 * `branchId` is deliberately absent: the branch comes from the authenticated
 * session, exactly like the organization. A client that could name its own
 * branch could create a location inside a branch it cannot see.
 */
export const CreateStockLocationInputSchema = z
  .object({
    name: requiredNameInputSchema,
    code: codeInputSchema,
    locationType: z.enum(STOCK_LOCATION_KINDS),
  })
  .strict();
export type CreateStockLocationInput = z.input<
  typeof CreateStockLocationInputSchema
>;
export type CreateStockLocationData = z.output<
  typeof CreateStockLocationInputSchema
>;

/**
 * Replace semantics, as in the catalog: the body is the whole editable
 * identity, so an omitted key can never mean "leave unchanged" to one side and
 * "clear it" to the other.
 */
export const UpdateStockLocationInputSchema = z
  .object({
    name: requiredNameInputSchema,
    code: codeInputSchema,
    locationType: z.enum(STOCK_LOCATION_KINDS),
    version: versionInputSchema,
  })
  .strict();
export type UpdateStockLocationInput = z.input<
  typeof UpdateStockLocationInputSchema
>;
export type UpdateStockLocationData = z.output<
  typeof UpdateStockLocationInputSchema
>;

const responseNameSchema = z
  .string()
  .min(1)
  .max(INVENTORY_CONTRACT_LIMITS.NAME_LENGTH);
const responseCodeSchema = z
  .string()
  .min(1)
  .max(INVENTORY_CONTRACT_LIMITS.CODE_LENGTH)
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/);
const responseTimestampSchema = z.iso.datetime();
const responseVersionSchema = z.number().int().positive();

export const StockLocationReferenceSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    code: responseCodeSchema,
    locationType: z.enum(STOCK_LOCATION_KINDS),
    isActive: z.boolean(),
    version: responseVersionSchema,
  })
  .strict();
export type StockLocationReference = z.infer<
  typeof StockLocationReferenceSchema
>;

export const StockLocationPageSchema = createPageEnvelopeSchema(
  StockLocationReferenceSchema,
);
export type StockLocationPage = z.infer<typeof StockLocationPageSchema>;

// =============================================================================
// List query surfaces
// =============================================================================

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

const baseListQueryFields = {
  page: pageInputSchema,
  pageSize: pageSizeInputSchema,
  q: optionalSearchInputSchema,
  active: optionalQueryBooleanSchema,
};

export const StockLocationListQuerySchema = z
  .object({
    ...baseListQueryFields,
    locationType: z.enum(STOCK_LOCATION_KINDS).optional(),
  })
  .strict();
export type StockLocationListQueryInput = z.input<
  typeof StockLocationListQuerySchema
>;
export type StockLocationListQuery = z.output<
  typeof StockLocationListQuerySchema
>;

export const SerializedUnitListQuerySchema = z
  .object({
    ...baseListQueryFields,
    productVariantId: z.uuid().optional(),
    stockLocationId: z.uuid().optional(),
    state: z.enum(SERIALIZED_STOCK_STATES).optional(),
    condition: z.enum(PRODUCT_CONDITIONS).optional(),
    ptaStatus: z.enum(PTA_STATUSES).optional(),
  })
  .strict();
export type SerializedUnitListQueryInput = z.input<
  typeof SerializedUnitListQuerySchema
>;
export type SerializedUnitListQuery = z.output<
  typeof SerializedUnitListQuerySchema
>;

export const InventoryMovementListQuerySchema = z
  .object({
    ...baseListQueryFields,
    productVariantId: z.uuid().optional(),
    stockLocationId: z.uuid().optional(),
    serializedUnitId: z.uuid().optional(),
    movementType: z.enum(MOVEMENT_TYPES).optional(),
  })
  .strict();
export type InventoryMovementListQueryInput = z.input<
  typeof InventoryMovementListQuerySchema
>;
export type InventoryMovementListQuery = z.output<
  typeof InventoryMovementListQuerySchema
>;

export const StockBalanceListQuerySchema = z
  .object({
    ...baseListQueryFields,
    productVariantId: z.uuid().optional(),
    stockLocationId: z.uuid().optional(),
    trackingType: z.enum(TRACKING_TYPES).optional(),
  })
  .strict();
export type StockBalanceListQueryInput = z.input<
  typeof StockBalanceListQuerySchema
>;
export type StockBalanceListQuery = z.output<
  typeof StockBalanceListQuerySchema
>;

// =============================================================================
// Serialized units
// =============================================================================

/**
 * An IMEI and a serial live in ONE uniqueness namespace per organization
 * (device_identifiers), so the same value cannot be imei1 on one handset and
 * imei2 on another. The type is carried explicitly rather than encoded in a
 * column name for exactly that reason.
 */
export const DEVICE_IDENTIFIER_TYPES = ["imei", "serial"] as const;
export type DeviceIdentifierType = (typeof DEVICE_IDENTIFIER_TYPES)[number];

export const DeviceIdentifierSchema = z
  .object({
    type: z.enum(DEVICE_IDENTIFIER_TYPES),
    value: z
      .string()
      .min(1)
      .max(INVENTORY_CONTRACT_LIMITS.IDENTIFIER_LENGTH)
      .regex(/^[A-Z0-9]+$/, "Identifiers are stored in normalized form."),
  })
  .strict();
export type DeviceIdentifier = z.infer<typeof DeviceIdentifierSchema>;

const nestedProductVariantSchema = z
  .object({
    id: z.uuid(),
    sku: z
      .string()
      .min(1)
      .regex(/^[A-Z0-9][A-Z0-9._/-]*$/),
    name: z.string().min(1),
  })
  .strict();

const nestedStockLocationSchema = z
  .object({
    id: z.uuid(),
    name: responseNameSchema,
    code: responseCodeSchema,
  })
  .strict();

/**
 * Identifiers ride on the summary as well as the detail: for a serialized unit
 * the IMEI *is* its identity, and a stock list without it cannot be reconciled
 * against the physical shelf. This is the one deliberate departure from the
 * catalog's summary/detail split, where aliases are a side collection.
 */
const serializedUnitSummaryShape = {
  id: z.uuid(),
  productVariant: nestedProductVariantSchema,
  stockLocation: nestedStockLocationSchema,
  state: z.enum(SERIALIZED_STOCK_STATES),
  condition: z.enum(PRODUCT_CONDITIONS),
  ptaStatus: z.enum(PTA_STATUSES),
  identifiers: z
    .array(DeviceIdentifierSchema)
    .max(INVENTORY_CONTRACT_LIMITS.MAX_IDENTIFIERS_PER_UNIT),
  receivedAt: responseTimestampSchema.nullable(),
  version: responseVersionSchema,
};

/** Mirrors the (organization, normalized_value) unique index within one unit. */
function refineSerializedUnitResponse(
  unit: { readonly identifiers: readonly DeviceIdentifier[] },
  context: z.RefinementCtx,
): void {
  const seen = new Map<string, number>();
  unit.identifiers.forEach((identifier, index) => {
    const firstIndex = seen.get(identifier.value);
    if (firstIndex !== undefined) {
      context.addIssue({
        code: "custom",
        message: `Identifier duplicates item ${firstIndex + 1}.`,
        path: ["identifiers", index],
      });
    } else {
      seen.set(identifier.value, index);
    }
  });
}

export const SerializedUnitSummarySchema = z
  .object(serializedUnitSummaryShape)
  .strict()
  .superRefine(refineSerializedUnitResponse);
export type SerializedUnitSummary = z.infer<typeof SerializedUnitSummarySchema>;

export const SerializedUnitDetailSchema = z
  .object({
    ...serializedUnitSummaryShape,
    createdAt: responseTimestampSchema,
    updatedAt: responseTimestampSchema,
  })
  .strict()
  .superRefine(refineSerializedUnitResponse);
export type SerializedUnitDetail = z.infer<typeof SerializedUnitDetailSchema>;

export const SerializedUnitSummaryPageSchema = createPageEnvelopeSchema(
  SerializedUnitSummarySchema,
);
export type SerializedUnitSummaryPage = z.infer<
  typeof SerializedUnitSummaryPageSchema
>;

// =============================================================================
// Bulk IMEI validation
// =============================================================================

export const BULK_IMEI_ROW_STATUSES = [
  "valid",
  "invalid",
  "duplicate_in_request",
] as const;
export type BulkImeiRowStatus = (typeof BULK_IMEI_ROW_STATUSES)[number];

/**
 * The wire vocabulary for `ImeiValidationCode`. `satisfies` rejects a code that
 * does not exist, and the companion type assertion fails compilation if
 * imei.ts ever grows a code this array does not carry — so the contract cannot
 * silently drift from the validator.
 */
export const IMEI_VALIDATION_CODES = [
  "EMPTY",
  "NON_DIGIT",
  "BAD_LENGTH",
  "CHECKSUM_FAILED",
  "ALL_SAME_DIGIT",
] as const satisfies readonly ImeiValidationCode[];

type ImeiValidationCodesAreExhaustive =
  ImeiValidationCode extends (typeof IMEI_VALIDATION_CODES)[number]
    ? true
    : never;
const _imeiValidationCodesAreExhaustive: ImeiValidationCodesAreExhaustive = true;
void _imeiValidationCodesAreExhaustive;

/**
 * Pre-save duplicate validation for pasted spreadsheet rows (13_ §10).
 *
 * Each row is normalized with `normalizeImei`, the same function that produces
 * the stored value, so what the staff member sees validated is exactly what
 * uniqueness will later be judged on. Duplicates against stock already in the
 * database are a database concern and are decided inside the receiving
 * transaction, never here.
 */
export const BulkImeiValidationInputSchema = z
  .object({
    identifiers: z
      .array(z.string())
      .min(1, "Enter at least one identifier.")
      .max(
        INVENTORY_CONTRACT_LIMITS.MAX_BULK_IMEI_ROWS,
        `Validate at most ${INVENTORY_CONTRACT_LIMITS.MAX_BULK_IMEI_ROWS} identifiers per request.`,
      ),
  })
  .strict();
export type BulkImeiValidationInput = z.input<
  typeof BulkImeiValidationInputSchema
>;
export type BulkImeiValidationData = z.output<
  typeof BulkImeiValidationInputSchema
>;

export const BulkImeiValidationRowSchema = z
  .object({
    /** 0-based position in the submitted `identifiers` array. */
    index: z.number().int().nonnegative(),
    normalized: z
      .string()
      .min(1)
      .max(INVENTORY_CONTRACT_LIMITS.IDENTIFIER_LENGTH)
      .nullable(),
    status: z.enum(BULK_IMEI_ROW_STATUSES),
    code: z.enum(IMEI_VALIDATION_CODES).nullable(),
    /** Present only for `duplicate_in_request`: the row this one repeats. */
    duplicateOfIndex: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.status === "valid" && row.normalized === null) {
      context.addIssue({
        code: "custom",
        message: "A valid row must carry its normalized value.",
        path: ["normalized"],
      });
    }
    if (row.status === "valid" && row.code !== null) {
      context.addIssue({
        code: "custom",
        message: "A valid row cannot carry a validation code.",
        path: ["code"],
      });
    }
    if (row.status === "invalid" && row.code === null) {
      context.addIssue({
        code: "custom",
        message: "An invalid row must say why it failed.",
        path: ["code"],
      });
    }
    if (
      row.status === "duplicate_in_request" &&
      row.duplicateOfIndex === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A duplicate row must point at the row it repeats.",
        path: ["duplicateOfIndex"],
      });
    }
    if (
      row.status !== "duplicate_in_request" &&
      row.duplicateOfIndex !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Only a duplicate row points at another row.",
        path: ["duplicateOfIndex"],
      });
    }
    if (row.duplicateOfIndex !== null && row.duplicateOfIndex >= row.index) {
      context.addIssue({
        code: "custom",
        message: "A duplicate must point at an earlier row.",
        path: ["duplicateOfIndex"],
      });
    }
  });
export type BulkImeiValidationRow = z.infer<typeof BulkImeiValidationRowSchema>;

export const BulkImeiValidationResultSchema = z
  .object({
    rows: z
      .array(BulkImeiValidationRowSchema)
      .max(INVENTORY_CONTRACT_LIMITS.MAX_BULK_IMEI_ROWS),
    validCount: z.number().int().nonnegative(),
    invalidCount: z.number().int().nonnegative(),
    duplicateCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((result, context) => {
    const counted = {
      valid: 0,
      invalid: 0,
      duplicate_in_request: 0,
    } satisfies Record<BulkImeiRowStatus, number>;
    for (const row of result.rows) counted[row.status] += 1;

    if (counted.valid !== result.validCount) {
      context.addIssue({
        code: "custom",
        message: "validCount does not match the rows.",
        path: ["validCount"],
      });
    }
    if (counted.invalid !== result.invalidCount) {
      context.addIssue({
        code: "custom",
        message: "invalidCount does not match the rows.",
        path: ["invalidCount"],
      });
    }
    if (counted.duplicate_in_request !== result.duplicateCount) {
      context.addIssue({
        code: "custom",
        message: "duplicateCount does not match the rows.",
        path: ["duplicateCount"],
      });
    }
  });
export type BulkImeiValidationResult = z.infer<
  typeof BulkImeiValidationResultSchema
>;

/**
 * Decide the per-row verdicts for a validated bulk request.
 *
 * Lives in the contract package because both sides need the identical verdict:
 * the browser previews it before the staff member saves, and the API returns
 * it. Normalization-only — the authoritative duplicate check against stored
 * stock stays in the receiving transaction.
 */
export function evaluateBulkImeiRequest(
  input: BulkImeiValidationData,
): BulkImeiValidationResult {
  const firstIndexByValue = new Map<string, number>();
  const rows: BulkImeiValidationRow[] = input.identifiers.map(
    (raw, index): BulkImeiValidationRow => {
      const normalized = normalizeImei(raw);
      if (normalized === null) {
        return {
          index,
          normalized: null,
          status: "invalid",
          code: "EMPTY",
          duplicateOfIndex: null,
        };
      }
      if (normalized.length > INVENTORY_CONTRACT_LIMITS.IDENTIFIER_LENGTH) {
        return {
          index,
          normalized: null,
          status: "invalid",
          code: "BAD_LENGTH",
          duplicateOfIndex: null,
        };
      }

      const firstIndex = firstIndexByValue.get(normalized);
      if (firstIndex !== undefined) {
        return {
          index,
          normalized,
          status: "duplicate_in_request",
          code: null,
          duplicateOfIndex: firstIndex,
        };
      }
      firstIndexByValue.set(normalized, index);
      return {
        index,
        normalized,
        status: "valid",
        code: null,
        duplicateOfIndex: null,
      };
    },
  );

  return {
    rows,
    validCount: rows.filter((row) => row.status === "valid").length,
    invalidCount: rows.filter((row) => row.status === "invalid").length,
    duplicateCount: rows.filter((row) => row.status === "duplicate_in_request")
      .length,
  };
}

// =============================================================================
// Movement ledger responses
// =============================================================================

/**
 * One append-only ledger row. Direction is carried by `movementType` through
 * MOVEMENT_ON_HAND_SIGN, never by a negative quantity, so a movement can never
 * be read with the wrong sign.
 */
export const InventoryMovementSchema = z
  .object({
    id: z.uuid(),
    productVariant: nestedProductVariantSchema,
    stockLocationId: z.uuid(),
    serializedUnitId: z.uuid().nullable(),
    stockBatchId: z.uuid().nullable(),
    movementType: z.enum(MOVEMENT_TYPES),
    quantity: z
      .number()
      .int()
      .positive()
      .max(INVENTORY_CONTRACT_LIMITS.MAX_MOVEMENT_QUANTITY),
    fromState: z.enum(SERIALIZED_STOCK_STATES).nullable(),
    toState: z.enum(SERIALIZED_STOCK_STATES).nullable(),
    referenceType: z
      .string()
      .min(1)
      .max(INVENTORY_CONTRACT_LIMITS.REFERENCE_TYPE_LENGTH)
      .nullable(),
    referenceId: z.uuid().nullable(),
    reason: z
      .string()
      .min(1)
      .max(INVENTORY_CONTRACT_LIMITS.REASON_LENGTH)
      .nullable(),
    occurredAt: responseTimestampSchema,
  })
  .strict()
  .superRefine((movement, context) => {
    // These mirror the CHECK constraints on inventory_movements, so a corrupted
    // row can never be served as a valid response.
    const isSerialized = movement.serializedUnitId !== null;
    if (isSerialized === (movement.stockBatchId !== null)) {
      context.addIssue({
        code: "custom",
        message:
          "A movement targets exactly one of a serialized unit or a stock batch.",
        path: ["serializedUnitId"],
      });
    }
    if (isSerialized && movement.quantity !== 1) {
      context.addIssue({
        code: "custom",
        message: "A serialized movement always has a quantity of 1.",
        path: ["quantity"],
      });
    }
    if (!isSerialized && movement.fromState !== null) {
      context.addIssue({
        code: "custom",
        message: "Only a serialized movement carries a state.",
        path: ["fromState"],
      });
    }
    if (!isSerialized && movement.toState !== null) {
      context.addIssue({
        code: "custom",
        message: "Only a serialized movement carries a state.",
        path: ["toState"],
      });
    }
  });
export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;

export const InventoryMovementPageSchema = createPageEnvelopeSchema(
  InventoryMovementSchema,
);
export type InventoryMovementPage = z.infer<typeof InventoryMovementPageSchema>;

// =============================================================================
// Stock balance read model
// =============================================================================

/**
 * Derived balance for one variant at one location. Never stored: it is computed
 * from the movement ledger plus the unit and batch rows, so it cannot drift out
 * of agreement with the ledger that produced it.
 */
export const StockBalanceSchema = z
  .object({
    productVariant: nestedProductVariantSchema,
    locationId: z.uuid(),
    locationName: responseNameSchema,
    trackingType: z.enum(TRACKING_TYPES),
    onHand: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((balance, context) => {
    if (balance.reserved > balance.onHand) {
      context.addIssue({
        code: "custom",
        message: "Reserved stock cannot exceed stock on hand.",
        path: ["reserved"],
      });
    }
    if (balance.available !== balance.onHand - balance.reserved) {
      context.addIssue({
        code: "custom",
        message: "available must equal onHand minus reserved.",
        path: ["available"],
      });
    }
  });
export type StockBalance = z.infer<typeof StockBalanceSchema>;

export const StockBalancePageSchema =
  createPageEnvelopeSchema(StockBalanceSchema);
export type StockBalancePage = z.infer<typeof StockBalancePageSchema>;

// =============================================================================
// Mutation inputs
// =============================================================================

/**
 * Quantity-tracked stock correction.
 *
 * `movementType` is restricted to the two adjustment directions so that a
 * caller cannot post a sale or a receipt through the adjustment endpoint and
 * bypass the workflow that owns it. Both a controlled `adjustmentReason` and a
 * typed `reason` are mandatory: the enum makes corrections reportable, the free
 * text makes them explainable (13_ §10).
 */
export const ADJUSTMENT_MOVEMENT_TYPES = [
  "adjustment_in",
  "adjustment_out",
] as const;
export type AdjustmentMovementType = (typeof ADJUSTMENT_MOVEMENT_TYPES)[number];

export const AdjustStockInputSchema = z
  .object({
    productVariantId: z.uuid(),
    stockLocationId: z.uuid(),
    movementType: z.enum(ADJUSTMENT_MOVEMENT_TYPES),
    quantity: movementQuantityInputSchema,
    adjustmentReason: z.enum(ADJUSTMENT_REASONS),
    reason: requiredReasonInputSchema,
  })
  .strict();
export type AdjustStockInput = z.input<typeof AdjustStockInputSchema>;
export type AdjustStockData = z.output<typeof AdjustStockInputSchema>;

/** Reserve and release are symmetric, so they share one shape. */
const reservationInputShape = {
  productVariantId: z.uuid(),
  stockLocationId: z.uuid(),
  quantity: movementQuantityInputSchema,
  reason: optionalReasonInputSchema,
};

export const ReserveStockInputSchema = z.object(reservationInputShape).strict();
export type ReserveStockInput = z.input<typeof ReserveStockInputSchema>;
export type ReserveStockData = z.output<typeof ReserveStockInputSchema>;

export const ReleaseStockInputSchema = z.object(reservationInputShape).strict();
export type ReleaseStockInput = z.input<typeof ReleaseStockInputSchema>;
export type ReleaseStockData = z.output<typeof ReleaseStockInputSchema>;

/**
 * Quantity-tracked transfer between two locations. A transfer moves value out
 * of one location's control and into another's, so the reason is mandatory.
 */
export const TransferStockInputSchema = z
  .object({
    productVariantId: z.uuid(),
    fromStockLocationId: z.uuid(),
    toStockLocationId: z.uuid(),
    quantity: movementQuantityInputSchema,
    reason: requiredReasonInputSchema,
  })
  .strict()
  .superRefine((transfer, context) => {
    if (transfer.fromStockLocationId === transfer.toStockLocationId) {
      context.addIssue({
        code: "custom",
        message: "Choose a destination different from the source location.",
        path: ["toStockLocationId"],
      });
    }
  });
export type TransferStockInput = z.input<typeof TransferStockInputSchema>;
export type TransferStockData = z.output<typeof TransferStockInputSchema>;

/**
 * Move one serialized unit to another location. The unit is named by the path,
 * so only the destination, the reason and the version it was read at travel in
 * the body.
 */
export const TransferSerializedUnitInputSchema = z
  .object({
    toStockLocationId: z.uuid(),
    reason: requiredReasonInputSchema,
    version: versionInputSchema,
  })
  .strict();
export type TransferSerializedUnitInput = z.input<
  typeof TransferSerializedUnitInputSchema
>;
export type TransferSerializedUnitData = z.output<
  typeof TransferSerializedUnitInputSchema
>;

/**
 * Manual serialized state change.
 *
 * `fromState` is intentionally absent: the current state is whatever the
 * database holds, and letting a client assert it would invite a caller to
 * describe a lifecycle that never happened. The server reads the stored state,
 * checks `isTransitionAllowed`, and rejects with
 * INVENTORY_INVALID_STATE_TRANSITION. `version` is what makes the read-then-act
 * safe against a concurrent change.
 */
export const TransitionSerializedUnitInputSchema = z
  .object({
    toState: z.enum(SERIALIZED_STOCK_STATES),
    reason: requiredReasonInputSchema,
    version: versionInputSchema,
  })
  .strict();
export type TransitionSerializedUnitInput = z.input<
  typeof TransitionSerializedUnitInputSchema
>;
export type TransitionSerializedUnitData = z.output<
  typeof TransitionSerializedUnitInputSchema
>;
