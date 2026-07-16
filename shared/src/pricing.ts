import { z } from "zod";
import { createPageEnvelopeSchema } from "./catalog";
import { LIMITS, PAGINATION } from "./constants";
import { PRODUCT_CONDITIONS, PTA_STATUSES, TRACKING_TYPES } from "./enums";
import { DeviceIdentifierSchema } from "./inventory";

/**
 * Permission-safe POS pricing and stock-choice read contracts.
 *
 * The response is an authoritative server snapshot: every returned item has an
 * effective price, while `stock.availability` explicitly distinguishes real
 * saleable choices from a priced out-of-stock catalog row. Cost and margin are
 * deliberately absent. Tenant, branch and actor scope come exclusively from
 * the authenticated request context.
 */
export const PRICING_CONTRACT_LIMITS = Object.freeze({
  NAME_LENGTH: 240,
  SKU_LENGTH: 100,
  LOCATION_CODE_LENGTH: 20,
  SEARCH_LENGTH: LIMITS.MAX_SEARCH_TERM_LENGTH,
  MAX_LOCATION_CHOICES: 100,
  MAX_SERIALIZED_CHOICES: 500,
  MAX_QUANTITY_PER_LOCATION: 1_000_000,
});

export const EFFECTIVE_PRICE_SOURCES = [
  "price_rule",
  "variant_default",
] as const;
export type EffectivePriceSource = (typeof EFFECTIVE_PRICE_SOURCES)[number];

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

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
  const normalized = normalizeSearch(value);
  return normalized.length === 0 ? undefined : normalized;
}, z.string().max(PRICING_CONTRACT_LIMITS.SEARCH_LENGTH).optional());

/** Query for the single POS lookup endpoint. Scope is never client-selectable. */
export const PosSellableLookupQuerySchema = z
  .object({
    page: pageInputSchema,
    pageSize: pageSizeInputSchema,
    q: optionalSearchSchema,
    locationId: z.uuid().optional(),
    trackingType: z.enum(TRACKING_TYPES).optional(),
  })
  .strict();
export type PosSellableLookupQueryInput = z.input<
  typeof PosSellableLookupQuerySchema
>;
export type PosSellableLookupQuery = z.output<
  typeof PosSellableLookupQuerySchema
>;

const responseMoneySchema = z.number().int().safe().nonnegative();
const responseVersionSchema = z.number().int().positive();

/** Price selected by the server for this actor, branch and instant. */
export const EffectiveSalePriceSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    unitPriceMinor: responseMoneySchema,
    minimumUnitPriceMinor: responseMoneySchema,
    source: z.enum(EFFECTIVE_PRICE_SOURCES),
    sourceId: z.uuid().nullable(),
    version: responseVersionSchema,
    effectiveAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((price, context) => {
    if (price.minimumUnitPriceMinor > price.unitPriceMinor) {
      context.addIssue({
        code: "custom",
        message: "Minimum price cannot exceed the effective unit price.",
        path: ["minimumUnitPriceMinor"],
      });
    }
    if (price.source === "price_rule" && price.sourceId === null) {
      context.addIssue({
        code: "custom",
        message: "A rule-derived price must identify its source rule.",
        path: ["sourceId"],
      });
    }
    if (price.source === "variant_default" && price.sourceId !== null) {
      context.addIssue({
        code: "custom",
        message: "A variant default price cannot name a price rule.",
        path: ["sourceId"],
      });
    }
  });
export type EffectiveSalePrice = z.infer<typeof EffectiveSalePriceSchema>;

/**
 * Set the organization-level fallback price stored on one catalog variant.
 * The browser supplies only money and the product version it actually read;
 * tenant, branch and actor identity remain authenticated server context.
 */
export const SetVariantDefaultPriceInputSchema = z
  .object({
    unitPriceMinor: responseMoneySchema,
    minimumUnitPriceMinor: responseMoneySchema,
    productVersion: responseVersionSchema,
  })
  .strict()
  .superRefine((price, context) => {
    if (price.minimumUnitPriceMinor > price.unitPriceMinor) {
      context.addIssue({
        code: "custom",
        message: "Minimum price cannot exceed the default unit price.",
        path: ["minimumUnitPriceMinor"],
      });
    }
  });
export type SetVariantDefaultPriceInput = z.infer<
  typeof SetVariantDefaultPriceInputSchema
>;

/** Safe write acknowledgement; it contains price evidence and no cost data. */
export const VariantDefaultPriceResponseSchema = z
  .object({
    productVariantId: z.uuid(),
    effectivePrice: EffectiveSalePriceSchema,
  })
  .strict();
export type VariantDefaultPriceResponse = z.infer<
  typeof VariantDefaultPriceResponseSchema
>;

export const PosStockLocationSchema = z
  .object({
    id: z.uuid(),
    code: z.string().min(1).max(PRICING_CONTRACT_LIMITS.LOCATION_CODE_LENGTH),
    name: z.string().min(1).max(200),
  })
  .strict();
export type PosStockLocation = z.infer<typeof PosStockLocationSchema>;

/** Quantity stock is chosen from one exact location and concurrency version. */
export const PosQuantityLocationChoiceSchema = z
  .object({
    location: PosStockLocationSchema,
    availableQuantity: z
      .number()
      .int()
      .positive()
      .max(PRICING_CONTRACT_LIMITS.MAX_QUANTITY_PER_LOCATION),
    stockVersion: responseVersionSchema,
  })
  .strict();
export type PosQuantityLocationChoice = z.infer<
  typeof PosQuantityLocationChoiceSchema
>;

const outOfStockAvailabilitySchema = z
  .object({ availability: z.literal("out_of_stock") })
  .strict();

export const PosQuantityAvailabilitySchema = z.discriminatedUnion(
  "availability",
  [
    z
      .object({
        availability: z.literal("saleable"),
        locationChoices: z
          .array(PosQuantityLocationChoiceSchema)
          .min(1)
          .max(PRICING_CONTRACT_LIMITS.MAX_LOCATION_CHOICES),
      })
      .strict()
      .superRefine((stock, context) => {
        const locations = new Set<string>();
        stock.locationChoices.forEach((choice, index) => {
          if (locations.has(choice.location.id)) {
            context.addIssue({
              code: "custom",
              message: "A quantity location can appear only once.",
              path: ["locationChoices", index, "location", "id"],
            });
          }
          locations.add(choice.location.id);
        });
      }),
    outOfStockAvailabilitySchema,
  ],
);
export type PosQuantityAvailability = z.infer<
  typeof PosQuantityAvailabilitySchema
>;

/** A real shelf unit, never a generated or browser-entered IMEI choice. */
export const PosSerializedUnitChoiceSchema = z
  .object({
    serializedUnitId: z.uuid(),
    unitVersion: responseVersionSchema,
    location: PosStockLocationSchema,
    condition: z.enum(PRODUCT_CONDITIONS),
    ptaStatus: z.enum(PTA_STATUSES),
    identifiers: z.array(DeviceIdentifierSchema).min(1).max(4),
  })
  .strict()
  .superRefine((unit, context) => {
    const firstIndexByIdentifier = new Map<string, number>();
    unit.identifiers.forEach((identifier, index) => {
      const firstIndex = firstIndexByIdentifier.get(identifier.value);
      if (firstIndex !== undefined) {
        context.addIssue({
          code: "custom",
          message: `Identifier duplicates item ${firstIndex + 1}.`,
          path: ["identifiers", index, "value"],
        });
      } else {
        firstIndexByIdentifier.set(identifier.value, index);
      }
    });
  });
export type PosSerializedUnitChoice = z.infer<
  typeof PosSerializedUnitChoiceSchema
>;

export const PosSerializedAvailabilitySchema = z.discriminatedUnion(
  "availability",
  [
    z
      .object({
        availability: z.literal("saleable"),
        serializedUnitChoices: z
          .array(PosSerializedUnitChoiceSchema)
          .min(1)
          .max(PRICING_CONTRACT_LIMITS.MAX_SERIALIZED_CHOICES),
      })
      .strict()
      .superRefine((stock, context) => {
        const units = new Set<string>();
        stock.serializedUnitChoices.forEach((choice, index) => {
          if (units.has(choice.serializedUnitId)) {
            context.addIssue({
              code: "custom",
              message: "A serialized unit can appear only once.",
              path: ["serializedUnitChoices", index, "serializedUnitId"],
            });
          }
          units.add(choice.serializedUnitId);
        });
      }),
    outOfStockAvailabilitySchema,
  ],
);
export type PosSerializedAvailability = z.infer<
  typeof PosSerializedAvailabilitySchema
>;

const sellableIdentityShape = {
  productVariantId: z.uuid(),
  sku: z
    .string()
    .min(1)
    .max(PRICING_CONTRACT_LIMITS.SKU_LENGTH)
    .regex(/^[A-Z0-9][A-Z0-9._/-]*$/),
  name: z.string().min(1).max(PRICING_CONTRACT_LIMITS.NAME_LENGTH),
  brandName: z.string().min(1).max(200),
  modelName: z.string().min(1).max(200),
  categoryName: z.string().min(1).max(200),
  condition: z.enum(PRODUCT_CONDITIONS),
  ptaStatus: z.enum(PTA_STATUSES),
  productVersion: responseVersionSchema,
  effectivePrice: EffectiveSalePriceSchema,
};

const quantitySellableSchema = z
  .object({
    ...sellableIdentityShape,
    trackingType: z.literal("quantity"),
    stock: PosQuantityAvailabilitySchema,
  })
  .strict();

const serializedSellableSchema = z
  .object({
    ...sellableIdentityShape,
    trackingType: z.literal("serialized"),
    stock: PosSerializedAvailabilitySchema,
  })
  .strict();

export const PosSellableItemSchema = z.discriminatedUnion("trackingType", [
  serializedSellableSchema,
  quantitySellableSchema,
]);
export type PosSellableItem = z.infer<typeof PosSellableItemSchema>;

export const PosSellablePageSchema = createPageEnvelopeSchema(
  PosSellableItemSchema,
);
export type PosSellablePage = z.infer<typeof PosSellablePageSchema>;
