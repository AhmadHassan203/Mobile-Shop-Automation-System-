import {
  AppendDemandFollowUpInputSchema,
  AppendDemandFollowUpResultSchema,
  ConvertDemandRequestInputSchema,
  CreateDemandRequestInputSchema,
  DEMAND_CONVERSION_TARGETS,
  DemandConversionCapabilitySchema,
  DemandConversionResultSchema,
  DemandListQuerySchema,
  DemandListResultSchema,
  DemandRequestDetailSchema,
  DemandStatusTransitionResultSchema,
  PosSellablePageSchema,
  ProductSummarySchema,
  TransitionDemandStatusInputSchema,
  UpdateDemandRequestInputSchema,
  type AppendDemandFollowUpInput,
  type AppendDemandFollowUpResult,
  type ConvertDemandRequestInput,
  type CreateDemandRequestInput,
  type DemandConversionCapability,
  type DemandConversionResult,
  type DemandListQuery,
  type DemandListResult,
  type DemandRequestDetail,
  type DemandStatusTransitionResult,
  type PosSellablePage,
  type ProductSummary,
  type TransitionDemandStatusInput,
  type UpdateDemandRequestInput,
} from "@mobileshop/shared";
import { z } from "zod";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

/** Strict local adapter combining Catalog and scoped POS Pricing for capture. */
const captureProductIdentity = {
  productVariantId: z.uuid(),
  sku: z.string().min(1).max(100),
  displayName: z.string().min(1).max(500),
  trackingType: z.enum(["serialized", "quantity"]),
};

const checkingCaptureProductSchema = z
  .object({
    ...captureProductIdentity,
    availability: z.literal("checking"),
  })
  .strict();

const unavailableCaptureProductSchema = z
  .object({
    ...captureProductIdentity,
    availability: z.literal("lookup_unavailable"),
    reason: z.enum(["permission", "request_failed"]),
  })
  .strict();

const unpricedCaptureProductSchema = z
  .object({
    ...captureProductIdentity,
    availability: z.literal("price_not_configured"),
  })
  .strict();

const outOfStockCaptureProductSchema = z
  .object({
    ...captureProductIdentity,
    availability: z.literal("out_of_stock"),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    unitPriceMinor: z.number().int().safe().nonnegative(),
  })
  .strict();

const saleableCaptureProductSchema = z
  .object({
    ...captureProductIdentity,
    availability: z.literal("saleable"),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    unitPriceMinor: z.number().int().safe().nonnegative(),
    availableQuantity: z.number().int().safe().positive(),
    locationNames: z.array(z.string().min(1).max(200)).min(1).max(100),
  })
  .strict();

export const DemandCaptureProductSchema = z.discriminatedUnion("availability", [
  checkingCaptureProductSchema,
  unavailableCaptureProductSchema,
  unpricedCaptureProductSchema,
  outOfStockCaptureProductSchema,
  saleableCaptureProductSchema,
]);
export type DemandCaptureProduct = z.infer<typeof DemandCaptureProductSchema>;

export type DemandPricingLookupState =
  "checking" | "ready" | "permission_denied" | "request_failed";

function identity(product: ProductSummary) {
  return {
    productVariantId: product.id,
    sku: product.sku,
    displayName: `${product.productModel.brand.name} ${product.productModel.name} · ${product.name}`,
    trackingType: product.trackingType,
  };
}

/**
 * Classifies one exact catalog product from a SKU-filtered pricing response.
 * A successful exact lookup with no row means the active product has no
 * configured selling price; an errored lookup is never mislabeled as unpriced.
 */
export function adaptDemandCaptureProduct(
  productInput: ProductSummary,
  lookupInput: PosSellablePage | undefined,
  lookupState: DemandPricingLookupState,
): DemandCaptureProduct {
  const product = ProductSummarySchema.parse(productInput);
  const base = identity(product);
  if (lookupState === "checking") {
    return DemandCaptureProductSchema.parse({
      ...base,
      availability: "checking",
    });
  }
  if (lookupState === "permission_denied") {
    return DemandCaptureProductSchema.parse({
      ...base,
      availability: "lookup_unavailable",
      reason: "permission",
    });
  }
  if (lookupState === "request_failed" || lookupInput === undefined) {
    return DemandCaptureProductSchema.parse({
      ...base,
      availability: "lookup_unavailable",
      reason: "request_failed",
    });
  }

  const lookup = PosSellablePageSchema.parse(lookupInput);
  const item = lookup.items.find(
    (candidate) => candidate.productVariantId === product.id,
  );
  if (item === undefined) {
    return DemandCaptureProductSchema.parse({
      ...base,
      availability: "price_not_configured",
    });
  }
  if (item.stock.availability === "out_of_stock") {
    return DemandCaptureProductSchema.parse({
      ...base,
      availability: "out_of_stock",
      currency: item.effectivePrice.currency,
      unitPriceMinor: item.effectivePrice.unitPriceMinor,
    });
  }

  const availableQuantity =
    item.trackingType === "serialized"
      ? item.stock.serializedUnitChoices.length
      : item.stock.locationChoices.reduce(
          (total, choice) => total + choice.availableQuantity,
          0,
        );
  const locationNames = [
    ...new Set(
      item.trackingType === "serialized"
        ? item.stock.serializedUnitChoices.map((choice) => choice.location.name)
        : item.stock.locationChoices.map((choice) => choice.location.name),
    ),
  ];
  return DemandCaptureProductSchema.parse({
    ...base,
    availability: "saleable",
    currency: item.effectivePrice.currency,
    unitPriceMinor: item.effectivePrice.unitPriceMinor,
    availableQuantity,
    locationNames,
  });
}

export const demandListResultSchema = DemandListResultSchema;
export const demandRequestDetailSchema = DemandRequestDetailSchema;
export const demandConversionCapabilitiesSchema = z
  .array(DemandConversionCapabilitySchema)
  .length(DEMAND_CONVERSION_TARGETS.length);

export type DemandListParameters = DemandListQuery;
export type DemandList = DemandListResult;
export type DemandRecord = DemandRequestDetail;

function demandListPath(parameters: DemandListParameters): string {
  const parsed = DemandListQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
    view: parsed.view,
    sort: parsed.sort,
    direction: parsed.direction,
  });
  for (const key of [
    "q",
    "status",
    "outcome",
    "urgency",
    "channel",
    "match",
    "availability",
    "followUp",
    "fromDate",
    "toDate",
  ] as const) {
    const value = parsed[key];
    if (value !== undefined) query.set(key, value);
  }
  return `/demand?${query.toString()}`;
}

export function getDemandRequests(
  parameters: DemandListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<DemandList> {
  return client.request(demandListPath(parameters), {
    method: "GET",
    schema: demandListResultSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getDemandRequest(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<DemandRecord> {
  return client.request(`/demand/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: demandRequestDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getDemandConversionCapabilities(
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<readonly DemandConversionCapability[]> {
  return client.request("/demand/conversion-capabilities", {
    method: "GET",
    schema: demandConversionCapabilitiesSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createDemandRequest(
  input: CreateDemandRequestInput,
  client: ApiClient = apiClient,
): Promise<DemandRecord> {
  return client.request("/demand", {
    method: "POST",
    schema: demandRequestDetailSchema,
    json: CreateDemandRequestInputSchema.parse(input),
  });
}

export function updateDemandRequest(
  id: string,
  input: UpdateDemandRequestInput,
  client: ApiClient = apiClient,
): Promise<DemandRecord> {
  return client.request(`/demand/${encodeURIComponent(id)}`, {
    method: "PATCH",
    schema: demandRequestDetailSchema,
    json: UpdateDemandRequestInputSchema.parse(input),
  });
}

export function transitionDemandRequestStatus(
  id: string,
  input: TransitionDemandStatusInput,
  client: ApiClient = apiClient,
): Promise<DemandStatusTransitionResult> {
  return client.request(`/demand/${encodeURIComponent(id)}/status`, {
    method: "POST",
    schema: DemandStatusTransitionResultSchema,
    json: TransitionDemandStatusInputSchema.parse(input),
  });
}

export function appendDemandFollowUp(
  id: string,
  input: AppendDemandFollowUpInput,
  client: ApiClient = apiClient,
): Promise<AppendDemandFollowUpResult> {
  return client.request(`/demand/${encodeURIComponent(id)}/follow-ups`, {
    method: "POST",
    schema: AppendDemandFollowUpResultSchema,
    json: AppendDemandFollowUpInputSchema.parse(input),
  });
}

export function convertDemandRequest(
  id: string,
  input: ConvertDemandRequestInput,
  client: ApiClient = apiClient,
): Promise<DemandConversionResult> {
  return client.request(`/demand/${encodeURIComponent(id)}/convert`, {
    method: "POST",
    schema: DemandConversionResultSchema,
    json: ConvertDemandRequestInputSchema.parse(input),
  });
}
