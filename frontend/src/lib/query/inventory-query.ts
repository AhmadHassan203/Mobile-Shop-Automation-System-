import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getInventoryMovements,
  getSerializedUnit,
  getSerializedUnits,
  getStockBalances,
  getStockLocations,
  type InventoryMovementListParameters,
  type SerializedUnitListParameters,
  type StockBalanceListParameters,
  type StockLocationListParameters,
} from "@/lib/api/inventory";
import { queryKeys } from "./keys";

const listDefaults = {
  placeholderData: keepPreviousData,
  staleTime: 10_000,
  meta: { authDependent: true },
} as const;

export function stockBalancesQueryOptions(
  parameters: StockBalanceListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.inventoryBalances(parameters),
    queryFn: ({ signal }) => getStockBalances(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function inventoryMovementsQueryOptions(
  parameters: InventoryMovementListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.inventoryMovements(parameters),
    queryFn: ({ signal }) => getInventoryMovements(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function serializedUnitsQueryOptions(
  parameters: SerializedUnitListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.inventorySerializedUnits(parameters),
    queryFn: ({ signal }) => getSerializedUnits(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function serializedUnitQueryOptions(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.inventorySerializedUnit(id),
    queryFn: ({ signal }) => getSerializedUnit(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function stockLocationsQueryOptions(
  parameters: StockLocationListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.inventoryLocations(parameters),
    queryFn: ({ signal }) => getStockLocations(parameters, signal),
    enabled,
    ...listDefaults,
  });
}
