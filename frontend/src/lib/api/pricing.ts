import {
  PosSellableLookupQuerySchema,
  PosSellablePageSchema,
  SetVariantDefaultPriceInputSchema,
  VariantDefaultPriceResponseSchema,
  type PosSellableLookupQuery,
  type PosSellablePage,
  type SetVariantDefaultPriceInput,
  type VariantDefaultPriceResponse,
} from "@mobileshop/shared";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const posLookupPageSchema = PosSellablePageSchema;
export type PosLookupParameters = PosSellableLookupQuery;
export type PosLookupPage = PosSellablePage;
export const setVariantDefaultPriceInputSchema =
  SetVariantDefaultPriceInputSchema;
export const variantDefaultPriceResponseSchema =
  VariantDefaultPriceResponseSchema;

function posLookupPath(parameters: PosLookupParameters): string {
  const parsed = PosSellableLookupQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
  });
  if (parsed.q !== undefined) query.set("q", parsed.q);
  if (parsed.locationId !== undefined) {
    query.set("locationId", parsed.locationId);
  }
  if (parsed.trackingType !== undefined) {
    query.set("trackingType", parsed.trackingType);
  }
  return `/pricing/pos-lookup?${query.toString()}`;
}

/** One authoritative price + stock-choice lookup for the counter. */
export function getPosLookup(
  parameters: PosLookupParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<PosLookupPage> {
  return client.request(posLookupPath(parameters), {
    method: "GET",
    schema: posLookupPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

/** Set one variant's organization fallback price with an optimistic version. */
export function setVariantDefaultPrice(
  productVariantId: string,
  input: SetVariantDefaultPriceInput,
  client: ApiClient = apiClient,
): Promise<VariantDefaultPriceResponse> {
  const json = SetVariantDefaultPriceInputSchema.parse(input);
  return client.request(
    `/pricing/variants/${encodeURIComponent(productVariantId)}/default`,
    {
      method: "PUT",
      schema: VariantDefaultPriceResponseSchema,
      json,
    },
  );
}
