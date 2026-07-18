import {
  AdjustStockInputSchema,
  BulkStockInInputSchema,
  BulkStockInResultSchema,
  IDEMPOTENCY_KEY_HEADER,
  InventoryMovementListQuerySchema,
  InventoryMovementPageSchema,
  QuickStockInInputSchema,
  QuickStockInResultSchema,
  ReleaseStockInputSchema,
  ReserveStockInputSchema,
  SerializedUnitDetailSchema,
  SerializedUnitListQuerySchema,
  SerializedUnitSummaryPageSchema,
  StockBalanceListQuerySchema,
  StockBalancePageSchema,
  StockBalanceSchema,
  StockLocationListQuerySchema,
  StockLocationPageSchema,
  TransferSerializedUnitInputSchema,
  TransferStockInputSchema,
  TransitionSerializedUnitInputSchema,
  type AdjustStockInput,
  type BulkStockInInput,
  type BulkStockInResult,
  type InventoryMovementListQuery,
  type InventoryMovementPage,
  type QuickStockInInput,
  type QuickStockInResult,
  type ReleaseStockInput,
  type ReserveStockInput,
  type SerializedUnitDetail,
  type SerializedUnitListQuery,
  type SerializedUnitSummaryPage,
  type StockBalance,
  type StockBalanceListQuery,
  type StockBalancePage,
  type StockLocationListQuery,
  type StockLocationPage,
  type TransferSerializedUnitInput,
  type TransferStockInput,
  type TransitionSerializedUnitInput,
} from "@mobileshop/shared";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const quickStockInInputSchema = QuickStockInInputSchema;
export const quickStockInResultSchema = QuickStockInResultSchema;
export const bulkStockInInputSchema = BulkStockInInputSchema;
export const bulkStockInResultSchema = BulkStockInResultSchema;

export const stockBalancePageSchema = StockBalancePageSchema;
export const inventoryMovementPageSchema = InventoryMovementPageSchema;
export const serializedUnitPageSchema = SerializedUnitSummaryPageSchema;
export const serializedUnitDetailSchema = SerializedUnitDetailSchema;
export const stockLocationPageSchema = StockLocationPageSchema;
export const stockBalanceSchema = StockBalanceSchema;

export const adjustStockInputSchema = AdjustStockInputSchema;
export const reserveStockInputSchema = ReserveStockInputSchema;
export const releaseStockInputSchema = ReleaseStockInputSchema;
export const transferStockInputSchema = TransferStockInputSchema;
export const transitionSerializedUnitInputSchema =
  TransitionSerializedUnitInputSchema;
export const transferSerializedUnitInputSchema =
  TransferSerializedUnitInputSchema;

export type StockBalanceList = StockBalancePage;
export type InventoryMovementList = InventoryMovementPage;
export type SerializedUnitList = SerializedUnitSummaryPage;
export type StockLocationList = StockLocationPage;
export type InventoryStockBalance = StockBalance;
export type InventorySerializedUnit = SerializedUnitDetail;

export type StockBalanceListParameters = StockBalanceListQuery;
export type InventoryMovementListParameters = InventoryMovementListQuery;
export type SerializedUnitListParameters = SerializedUnitListQuery;
export type StockLocationListParameters = StockLocationListQuery;

interface BaseListParameters {
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string | undefined;
  readonly active?: boolean | undefined;
}

function baseListQuery(parameters: BaseListParameters): URLSearchParams {
  const query = new URLSearchParams({
    page: String(parameters.page),
    pageSize: String(parameters.pageSize),
  });
  if (parameters.q !== undefined && parameters.q.length > 0) {
    query.set("q", parameters.q);
  }
  if (parameters.active !== undefined) {
    query.set("active", String(parameters.active));
  }
  return query;
}

function listPath(path: string, query: URLSearchParams): string {
  return `${path}?${query.toString()}`;
}

function stockBalancePath(parameters: StockBalanceListParameters): string {
  const parsed = StockBalanceListQuerySchema.parse(parameters);
  const query = baseListQuery(parsed);
  if (parsed.productVariantId !== undefined) {
    query.set("productVariantId", parsed.productVariantId);
  }
  if (parsed.stockLocationId !== undefined) {
    query.set("stockLocationId", parsed.stockLocationId);
  }
  if (parsed.trackingType !== undefined) {
    query.set("trackingType", parsed.trackingType);
  }
  return listPath("/inventory", query);
}

function movementPath(parameters: InventoryMovementListParameters): string {
  const parsed = InventoryMovementListQuerySchema.parse(parameters);
  const query = baseListQuery(parsed);
  if (parsed.productVariantId !== undefined) {
    query.set("productVariantId", parsed.productVariantId);
  }
  if (parsed.stockLocationId !== undefined) {
    query.set("stockLocationId", parsed.stockLocationId);
  }
  if (parsed.serializedUnitId !== undefined) {
    query.set("serializedUnitId", parsed.serializedUnitId);
  }
  if (parsed.movementType !== undefined) {
    query.set("movementType", parsed.movementType);
  }
  return listPath("/inventory/movements", query);
}

function serializedUnitPath(parameters: SerializedUnitListParameters): string {
  const parsed = SerializedUnitListQuerySchema.parse(parameters);
  const query = baseListQuery(parsed);
  if (parsed.productVariantId !== undefined) {
    query.set("productVariantId", parsed.productVariantId);
  }
  if (parsed.stockLocationId !== undefined) {
    query.set("stockLocationId", parsed.stockLocationId);
  }
  if (parsed.state !== undefined) query.set("state", parsed.state);
  if (parsed.condition !== undefined) query.set("condition", parsed.condition);
  if (parsed.ptaStatus !== undefined) query.set("ptaStatus", parsed.ptaStatus);
  return listPath("/serialized-units", query);
}

function stockLocationPath(parameters: StockLocationListParameters): string {
  const parsed = StockLocationListQuerySchema.parse(parameters);
  const query = baseListQuery(parsed);
  if (parsed.locationType !== undefined) {
    query.set("locationType", parsed.locationType);
  }
  return listPath("/locations", query);
}

export function getStockBalances(
  parameters: StockBalanceListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<StockBalanceList> {
  return client.request(stockBalancePath(parameters), {
    method: "GET",
    schema: stockBalancePageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getInventoryMovements(
  parameters: InventoryMovementListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<InventoryMovementList> {
  return client.request(movementPath(parameters), {
    method: "GET",
    schema: inventoryMovementPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getSerializedUnits(
  parameters: SerializedUnitListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<SerializedUnitList> {
  return client.request(serializedUnitPath(parameters), {
    method: "GET",
    schema: serializedUnitPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getSerializedUnit(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<InventorySerializedUnit> {
  return client.request(`/serialized-units/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: serializedUnitDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getStockLocations(
  parameters: StockLocationListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<StockLocationList> {
  return client.request(stockLocationPath(parameters), {
    method: "GET",
    schema: stockLocationPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function quickStockIn(
  input: QuickStockInInput,
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<QuickStockInResult> {
  const body = QuickStockInInputSchema.parse(input);
  return client.request("/inventory/quick-stock-in", {
    method: "POST",
    schema: QuickStockInResultSchema,
    json: body,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
  });
}

/**
 * Post a whole batch of Quick Stock In rows in one request. The batch key is the
 * request-level idempotency lock; the server derives a stable per-row key from
 * it, so retrying the same batch replays each row's original result rather than
 * double-posting. The response is a per-row report (batch-level partial success).
 */
export function bulkStockIn(
  input: BulkStockInInput,
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<BulkStockInResult> {
  const body = BulkStockInInputSchema.parse(input);
  return client.request("/inventory/bulk-stock-in", {
    method: "POST",
    schema: BulkStockInResultSchema,
    json: body,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
  });
}

export function adjustStock(
  input: AdjustStockInput,
  client: ApiClient = apiClient,
): Promise<InventoryStockBalance> {
  const body = adjustStockInputSchema.parse(input);
  return client.request("/inventory/adjustments", {
    method: "POST",
    schema: stockBalanceSchema,
    json: body,
  });
}

export function reserveStock(
  input: ReserveStockInput,
  client: ApiClient = apiClient,
): Promise<InventoryStockBalance> {
  const body = reserveStockInputSchema.parse(input);
  return client.request("/inventory/reservations", {
    method: "POST",
    schema: stockBalanceSchema,
    json: body,
  });
}

export function releaseStock(
  input: ReleaseStockInput,
  client: ApiClient = apiClient,
): Promise<InventoryStockBalance> {
  const body = releaseStockInputSchema.parse(input);
  return client.request(
    `/inventory/reservations/${encodeURIComponent(body.productVariantId)}`,
    {
      method: "DELETE",
      schema: stockBalanceSchema,
      json: body,
    },
  );
}

export function transferStock(
  input: TransferStockInput,
  client: ApiClient = apiClient,
): Promise<StockBalanceList> {
  const body = transferStockInputSchema.parse(input);
  return client.request("/inventory/transfers", {
    method: "POST",
    schema: stockBalancePageSchema,
    json: body,
  });
}

export function transitionSerializedUnit(
  id: string,
  input: TransitionSerializedUnitInput,
  client: ApiClient = apiClient,
): Promise<InventorySerializedUnit> {
  const body = transitionSerializedUnitInputSchema.parse(input);
  return client.request(
    `/serialized-units/${encodeURIComponent(id)}/transition`,
    {
      method: "POST",
      schema: serializedUnitDetailSchema,
      json: body,
    },
  );
}

export function transferSerializedUnit(
  id: string,
  input: TransferSerializedUnitInput,
  client: ApiClient = apiClient,
): Promise<InventorySerializedUnit> {
  const body = transferSerializedUnitInputSchema.parse(input);
  return client.request(
    `/serialized-units/${encodeURIComponent(id)}/transfer`,
    {
      method: "POST",
      schema: serializedUnitDetailSchema,
      json: body,
    },
  );
}
