"use client";

import {
  LIMITS,
  MOVEMENT_TYPES,
  PAGINATION,
  PERMISSIONS,
  PRODUCT_CONDITIONS,
  PTA_STATUSES,
  SERIALIZED_STOCK_STATES,
  STOCK_LOCATION_KINDS,
  TRACKING_TYPES,
  type InventoryMovement,
  type SerializedUnitSummary,
  type StockBalance,
} from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { z } from "zod";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogNoResultsState,
} from "@/components/catalog/catalog-states";
import {
  QuantityActionDrawer,
  SerializedUnitActionDrawer,
  allowedManualTransitions,
  canTransferSerializedUnit,
  type QuantityStockAction,
  type SerializedUnitAction,
} from "./stock-action-drawer";
import {
  ActivityIcon,
  BoxIcon,
  CheckCircleIcon,
  CloseIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import type { ApiError } from "@/lib/api/client";
import { toApiError } from "@/lib/api/client";
import type {
  InventoryMovementListParameters,
  SerializedUnitListParameters,
  StockBalanceListParameters,
  StockLocationListParameters,
} from "@/lib/api/inventory";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { catalogProductsQueryOptions } from "@/lib/query/catalog-query";
import {
  inventoryMovementsQueryOptions,
  serializedUnitsQueryOptions,
  stockBalancesQueryOptions,
  stockLocationsQueryOptions,
} from "@/lib/query/inventory-query";
import { queryKeys } from "@/lib/query/keys";

const PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;
const locationReferenceParameters: StockLocationListParameters = {
  page: 1,
  pageSize: PAGINATION.MAX_PAGE_SIZE,
  active: true,
};

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function oneOf<TValue extends string>(
  value: string | null,
  options: readonly TValue[],
): TValue | undefined {
  return value !== null && options.includes(value as TValue)
    ? (value as TValue)
    : undefined;
}

function positivePage(value: string | null): number {
  if (value === null || !/^\d+$/u.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function searchValue(value: string | null): string | undefined {
  const normalized = value?.trim().slice(0, LIMITS.MAX_SEARCH_TERM_LENGTH);
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function uuidValue(value: string | null): string | undefined {
  if (value === null) return undefined;
  return z.uuid().safeParse(value).success ? value : undefined;
}

function activeValue(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function stockBalanceParametersFrom(
  searchParams: URLSearchParams,
): StockBalanceListParameters {
  const q = searchValue(searchParams.get("q"));
  const locationId = uuidValue(searchParams.get("locationId"));
  const trackingType = oneOf(searchParams.get("trackingType"), TRACKING_TYPES);
  return {
    page: positivePage(searchParams.get("page")),
    pageSize: PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(locationId === undefined ? {} : { stockLocationId: locationId }),
    ...(trackingType === undefined ? {} : { trackingType }),
  };
}

export function serializedUnitParametersFrom(
  searchParams: URLSearchParams,
): SerializedUnitListParameters {
  const q = searchValue(searchParams.get("uq"));
  const locationId = uuidValue(searchParams.get("ulocationId"));
  const state = oneOf(searchParams.get("ustate"), SERIALIZED_STOCK_STATES);
  const condition = oneOf(searchParams.get("ucondition"), PRODUCT_CONDITIONS);
  const ptaStatus = oneOf(searchParams.get("uptaStatus"), PTA_STATUSES);
  return {
    page: positivePage(searchParams.get("upage")),
    pageSize: PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(locationId === undefined ? {} : { stockLocationId: locationId }),
    ...(state === undefined ? {} : { state }),
    ...(condition === undefined ? {} : { condition }),
    ...(ptaStatus === undefined ? {} : { ptaStatus }),
  };
}

export function movementParametersFrom(
  searchParams: URLSearchParams,
): InventoryMovementListParameters {
  const q = searchValue(searchParams.get("mq"));
  const locationId = uuidValue(searchParams.get("mlocationId"));
  const movementType = oneOf(searchParams.get("movementType"), MOVEMENT_TYPES);
  return {
    page: positivePage(searchParams.get("mpage")),
    pageSize: PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(locationId === undefined ? {} : { stockLocationId: locationId }),
    ...(movementType === undefined ? {} : { movementType }),
  };
}

export function locationParametersFrom(
  searchParams: URLSearchParams,
): StockLocationListParameters {
  const q = searchValue(searchParams.get("lq"));
  const locationType = oneOf(
    searchParams.get("locationType"),
    STOCK_LOCATION_KINDS,
  );
  const active = activeValue(searchParams.get("lactive"));
  return {
    page: positivePage(searchParams.get("lpage")),
    pageSize: PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(locationType === undefined ? {} : { locationType }),
    ...(active === undefined ? {} : { active }),
  };
}

export const STOCK_TABS = [
  { id: "balances", label: "Balances" },
  { id: "units", label: "Serialized units" },
  { id: "movements", label: "Movements" },
  { id: "locations", label: "Locations" },
] as const;
export type StockTabId = (typeof STOCK_TABS)[number]["id"];

export function stockTabFrom(searchParams: URLSearchParams): StockTabId {
  const value = searchParams.get("tab");
  return STOCK_TABS.some((tab) => tab.id === value)
    ? (value as StockTabId)
    : "balances";
}

export function stockTabQuery(
  searchParams: URLSearchParams,
  tab: StockTabId,
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (tab === "balances") next.delete("tab");
  else next.set("tab", tab);
  return next.toString();
}

export function nextStockTabIndex(
  current: number,
  key: string,
  length: number,
): number | null {
  if (length === 0) return null;
  if (key === "ArrowRight") return (current + 1) % length;
  if (key === "ArrowLeft") return (current - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

export interface StockCapabilities {
  readonly canView: boolean;
  readonly canAdjust: boolean;
  readonly canReserve: boolean;
  readonly canTransfer: boolean;
  readonly canViewCatalog: boolean;
  readonly canManageLocations: boolean;
}

export function stockCapabilities(
  permissions: readonly string[] | undefined,
): StockCapabilities {
  const values = new Set(permissions ?? []);
  return {
    canView: values.has(PERMISSIONS.INVENTORY_VIEW),
    canAdjust: values.has(PERMISSIONS.INVENTORY_ADJUST),
    canReserve: values.has(PERMISSIONS.INVENTORY_RESERVE),
    canTransfer: values.has(PERMISSIONS.INVENTORY_TRANSFER),
    canViewCatalog: values.has(PERMISSIONS.CATALOG_VIEW),
    canManageLocations: values.has(PERMISSIONS.SETTINGS_MANAGE),
  };
}

export interface InventoryReadErrorCopy {
  readonly title: string;
  readonly description: string;
}

export function inventoryReadErrorCopy(
  error: ApiError,
): InventoryReadErrorCopy {
  if (error.code === "NETWORK_ERROR") {
    return {
      title: "The inventory API could not be reached",
      description:
        "The service may be offline. No cached demo stock or fallback records are shown.",
    };
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return {
      title: "The inventory API did not respond in time",
      description:
        "Retry the read. No stock values are inferred while the request is unresolved.",
    };
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return {
      title: "Inventory access was rejected",
      description:
        "The server rejected this read for the current permission set. Ask an owner to review inventory.view.",
    };
  }
  if (error.code === "INVALID_RESPONSE") {
    return {
      title: "The inventory response was rejected",
      description:
        "The API response did not match the strict inventory contract, so no potentially incorrect stock is displayed.",
    };
  }
  return {
    title: "Inventory could not be loaded",
    description:
      "The API did not return a usable inventory page. No fallback or mock records are shown.",
  };
}

function StockTableSkeleton(): JSX.Element {
  return (
    <div
      aria-label="Loading inventory records"
      className="overflow-hidden rounded-card border border-line bg-surface"
      role="status"
    >
      <span className="sr-only">Loading inventory records</span>
      <div className="h-12 animate-pulse border-b border-line-subtle bg-line-subtle/65" />
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="h-[4.5rem] animate-pulse border-b border-line-subtle bg-surface last:border-0"
          key={index}
        />
      ))}
    </div>
  );
}

export function StockInventoryRouteFallback(): JSX.Element {
  return (
    <div
      aria-label="Loading stock inventory"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading stock inventory</span>
      <div className="h-24 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-12 animate-pulse rounded-card bg-line-subtle" />
      <StockTableSkeleton />
    </div>
  );
}

interface PaginationProps {
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
  readonly onPage: (page: number) => void;
}

function Pagination({
  page,
  total,
  totalPages,
  onPage,
}: PaginationProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-muted">
      <p>
        {total === 0 ? "No records" : `${total} recorded`} · Page {page} of{" "}
        {Math.max(totalPages, 1)}
      </p>
      <div className="flex gap-2">
        <button
          className="min-h-8 rounded-control border border-line px-3 font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          type="button"
        >
          Previous
        </button>
        <button
          className="min-h-8 rounded-control border border-line px-3 font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

interface SearchFieldProps {
  readonly defaultValue: string | undefined;
  readonly label: string;
  readonly placeholder: string;
  readonly queryName: string;
  readonly onSearch: (value: string) => void;
}

function SearchField({
  defaultValue,
  label,
  placeholder,
  queryName,
  onSearch,
}: SearchFieldProps): JSX.Element {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get(queryName);
    onSearch(typeof value === "string" ? value.trim() : "");
  };
  return (
    <form
      className="flex gap-2"
      key={defaultValue ?? ""}
      onSubmit={submit}
      role="search"
    >
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
          defaultValue={defaultValue}
          maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
          name={queryName}
          placeholder={placeholder}
          type="search"
        />
      </label>
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
        type="submit"
      >
        <SearchIcon className="size-4" />
        <span className="hidden sm:inline">Search</span>
      </button>
    </form>
  );
}

function replaceSearch(
  pathname: string,
  current: URLSearchParams,
  replace: (href: string) => void,
  updates: Readonly<Record<string, string | undefined>>,
  resetPageKey?: string,
): void {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value.length === 0) next.delete(key);
    else next.set(key, value);
  }
  if (resetPageKey !== undefined) next.delete(resetPageKey);
  const query = next.toString();
  replace(query.length === 0 ? pathname : `${pathname}?${query}`);
}

function clearSearchKeys(
  pathname: string,
  current: URLSearchParams,
  replace: (href: string) => void,
  keys: readonly string[],
): void {
  const next = new URLSearchParams(current.toString());
  for (const key of keys) next.delete(key);
  const query = next.toString();
  replace(query.length === 0 ? pathname : `${pathname}?${query}`);
}

function ErrorPanel({
  error,
  retry,
}: {
  readonly error: ApiError;
  readonly retry: () => void;
}) {
  return (
    <CatalogErrorState
      {...inventoryReadErrorCopy(error)}
      onRetry={retry}
      {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
    />
  );
}

function SuccessBanner({
  message,
  onClose,
}: {
  readonly message: string;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="mb-4 flex items-start gap-2.5 rounded-control border border-positive/25 bg-positive-soft p-3 text-sm text-positive"
      role="status"
    >
      <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
      <button
        aria-label="Dismiss inventory success message"
        className="ml-auto grid size-7 shrink-0 place-items-center rounded-control hover:bg-positive/10"
        onClick={onClose}
        type="button"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}

const actionClass =
  "inline-flex min-h-8 items-center rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle";

interface BalancesTabProps {
  readonly capabilities: StockCapabilities;
}

type QuantityDrawerState = {
  readonly action: QuantityStockAction;
  readonly target?: StockBalance;
} | null;

function BalancesTab({ capabilities }: BalancesTabProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const parameters = stockBalanceParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const balances = useQuery(stockBalancesQueryOptions(parameters, true));
  const locations = useQuery(
    stockLocationsQueryOptions(locationReferenceParameters, true),
  );
  const products = useQuery({
    ...catalogProductsQueryOptions({
      page: 1,
      pageSize: PAGINATION.MAX_PAGE_SIZE,
      active: true,
      trackingType: "quantity",
    }),
    enabled: capabilities.canAdjust && capabilities.canViewCatalog,
  });
  const [drawer, setDrawer] = useState<QuantityDrawerState>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const activeLocations = locations.data?.items ?? [];
  const quantityProducts = products.data?.items ?? [];
  const hasFilters =
    parameters.q !== undefined ||
    parameters.stockLocationId !== undefined ||
    parameters.trackingType !== undefined;

  const update = (
    values: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void =>
    replaceSearch(
      pathname,
      new URLSearchParams(searchParams.toString()),
      router.replace,
      values,
      resetPage ? "page" : undefined,
    );

  const saved = (message: string): void => {
    setDrawer(null);
    setSuccess(message);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inventoryBalancesRoot,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inventoryMovementsRoot,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inventorySerializedUnitsRoot,
    });
  };
  const error =
    balances.error === null || balances.data !== undefined
      ? null
      : toApiError(balances.error);
  const balancePage = balances.data;

  return (
    <div>
      {success === null ? null : (
        <SuccessBanner message={success} onClose={() => setSuccess(null)} />
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          Each row is a derived product-and-location balance, never a stored
          rollup.
        </p>
        {capabilities.canAdjust &&
        capabilities.canViewCatalog &&
        activeLocations.length > 0 &&
        quantityProducts.length > 0 ? (
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
            onClick={() => setDrawer({ action: "adjust" })}
            type="button"
          >
            <PlusIcon className="size-4" /> Adjust quantity stock
          </button>
        ) : null}
      </div>

      <section
        aria-label="Stock balance search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <SearchField
          defaultValue={parameters.q}
          label="Search stock balances"
          onSearch={(value) => update({ q: value || undefined })}
          placeholder="Search SKU, product, or location"
          queryName="q"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink-subtle">
            Location
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              disabled={locations.isPending}
              onChange={(event) =>
                update({ locationId: event.target.value || undefined })
              }
              value={parameters.stockLocationId ?? ""}
            >
              <option value="">All active locations</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Tracking
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                update({ trackingType: event.target.value || undefined })
              }
              value={parameters.trackingType ?? ""}
            >
              <option value="">All tracking types</option>
              {TRACKING_TYPES.map((tracking) => (
                <option key={tracking} value={tracking}>
                  {titleCase(tracking)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasFilters ? (
          <button
            className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong"
            onClick={() =>
              clearSearchKeys(
                pathname,
                new URLSearchParams(searchParams.toString()),
                router.replace,
                ["q", "locationId", "trackingType", "page"],
              )
            }
            type="button"
          >
            Clear balance filters
          </button>
        ) : null}
      </section>

      {error !== null ? (
        <ErrorPanel error={error} retry={() => void balances.refetch()} />
      ) : balancePage === undefined ? (
        <StockTableSkeleton />
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {balancePage.items.length === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState
                onClear={() =>
                  clearSearchKeys(
                    pathname,
                    new URLSearchParams(searchParams.toString()),
                    router.replace,
                    ["q", "locationId", "trackingType", "page"],
                  )
                }
              />
            ) : (
              <CatalogEmptyState
                description="No real stock batch or serialized unit exists yet. Purchasing receiving will create units and batches; no demo quantity is inserted here."
                icon={<LayersIcon className="size-6" />}
                title="No recorded stock balances"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] border-collapse text-left">
                <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Product
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Location
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Tracking
                    </th>
                    <th className="px-4 py-3 text-right font-bold" scope="col">
                      On hand
                    </th>
                    <th className="px-4 py-3 text-right font-bold" scope="col">
                      Reserved
                    </th>
                    <th className="px-4 py-3 text-right font-bold" scope="col">
                      Available
                    </th>
                    <th className="px-4 py-3 text-right font-bold" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {balancePage.items.map((balance) => (
                    <tr
                      key={`${balance.productVariant.id}:${balance.locationId}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-ink">
                          {balance.productVariant.sku}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-subtle">
                          {balance.productVariant.name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-subtle">
                        {balance.locationName}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {titleCase(balance.trackingType)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-ink">
                        {balance.onHand}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-warning">
                        {balance.reserved}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-positive">
                        {balance.available}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {balance.trackingType === "quantity" &&
                          capabilities.canAdjust ? (
                            <button
                              className={actionClass}
                              onClick={() =>
                                setDrawer({ action: "adjust", target: balance })
                              }
                              type="button"
                            >
                              Adjust
                            </button>
                          ) : null}
                          {balance.trackingType === "quantity" &&
                          capabilities.canReserve &&
                          balance.available > 0 ? (
                            <button
                              className={actionClass}
                              onClick={() =>
                                setDrawer({
                                  action: "reserve",
                                  target: balance,
                                })
                              }
                              type="button"
                            >
                              Reserve
                            </button>
                          ) : null}
                          {balance.trackingType === "quantity" &&
                          capabilities.canReserve &&
                          balance.reserved > 0 ? (
                            <button
                              className={actionClass}
                              onClick={() =>
                                setDrawer({
                                  action: "release",
                                  target: balance,
                                })
                              }
                              type="button"
                            >
                              Release
                            </button>
                          ) : null}
                          {balance.trackingType === "quantity" &&
                          capabilities.canTransfer &&
                          balance.available > 0 &&
                          activeLocations.some(
                            (location) => location.id !== balance.locationId,
                          ) ? (
                            <button
                              className={actionClass}
                              onClick={() =>
                                setDrawer({
                                  action: "transfer",
                                  target: balance,
                                })
                              }
                              type="button"
                            >
                              Transfer
                            </button>
                          ) : null}
                          {balance.trackingType === "serialized" ? (
                            <span className="text-xs text-ink-muted">
                              Use unit actions
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            onPage={(page) =>
              update({ page: page === 1 ? undefined : String(page) }, false)
            }
            page={balancePage.page}
            total={balancePage.total}
            totalPages={balancePage.totalPages}
          />
        </section>
      )}

      {drawer === null ? null : (
        <QuantityActionDrawer
          action={drawer.action}
          locations={activeLocations}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          products={quantityProducts}
          {...(drawer.target === undefined ? {} : { target: drawer.target })}
        />
      )}
    </div>
  );
}

interface UnitsTabProps {
  readonly capabilities: StockCapabilities;
}

interface UnitDrawerState {
  readonly action: SerializedUnitAction;
  readonly unit: SerializedUnitSummary;
}

function UnitsTab({ capabilities }: UnitsTabProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const parameters = serializedUnitParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const units = useQuery(serializedUnitsQueryOptions(parameters, true));
  const locations = useQuery(
    stockLocationsQueryOptions(locationReferenceParameters, true),
  );
  const [drawer, setDrawer] = useState<UnitDrawerState | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const activeLocations = locations.data?.items ?? [];
  const hasFilters =
    parameters.q !== undefined ||
    parameters.stockLocationId !== undefined ||
    parameters.state !== undefined ||
    parameters.condition !== undefined ||
    parameters.ptaStatus !== undefined;

  const update = (
    values: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void =>
    replaceSearch(
      pathname,
      new URLSearchParams(searchParams.toString()),
      router.replace,
      values,
      resetPage ? "upage" : undefined,
    );

  const clear = (): void =>
    clearSearchKeys(
      pathname,
      new URLSearchParams(searchParams.toString()),
      router.replace,
      ["uq", "ulocationId", "ustate", "ucondition", "uptaStatus", "upage"],
    );

  const saved = (message: string): void => {
    setDrawer(null);
    setSuccess(message);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inventorySerializedUnitsRoot,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inventoryBalancesRoot,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.inventoryMovementsRoot,
    });
  };
  const error =
    units.error === null || units.data !== undefined
      ? null
      : toApiError(units.error);
  const unitPage = units.data;

  return (
    <div>
      {success === null ? null : (
        <SuccessBanner message={success} onClose={() => setSuccess(null)} />
      )}
      <p className="mb-4 text-xs text-ink-muted">
        Each row is one physical serialized unit. Identifiers come from the API;
        no sample IMEI is generated in the browser.
      </p>
      <section
        aria-label="Serialized unit search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <SearchField
          defaultValue={parameters.q}
          label="Search serialized units"
          onSearch={(value) => update({ uq: value || undefined })}
          placeholder="Search IMEI, serial, SKU, or product"
          queryName="uq"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-ink-subtle">
            Location
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              disabled={locations.isPending}
              onChange={(event) =>
                update({ ulocationId: event.target.value || undefined })
              }
              value={parameters.stockLocationId ?? ""}
            >
              <option value="">All active locations</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            State
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                update({ ustate: event.target.value || undefined })
              }
              value={parameters.state ?? ""}
            >
              <option value="">All states</option>
              {SERIALIZED_STOCK_STATES.map((state) => (
                <option key={state} value={state}>
                  {titleCase(state)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Condition
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                update({ ucondition: event.target.value || undefined })
              }
              value={parameters.condition ?? ""}
            >
              <option value="">All conditions</option>
              {PRODUCT_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {titleCase(condition)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            PTA status
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                update({ uptaStatus: event.target.value || undefined })
              }
              value={parameters.ptaStatus ?? ""}
            >
              <option value="">All PTA statuses</option>
              {PTA_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasFilters ? (
          <button
            className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong"
            onClick={clear}
            type="button"
          >
            Clear unit filters
          </button>
        ) : null}
      </section>

      {error !== null ? (
        <ErrorPanel error={error} retry={() => void units.refetch()} />
      ) : unitPage === undefined ? (
        <StockTableSkeleton />
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {unitPage.items.length === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState onClear={clear} />
            ) : (
              <CatalogEmptyState
                description="Serialized units are created only by a real purchasing receipt. That workflow has not recorded any units, so no placeholder IMEIs are displayed."
                icon={<BoxIcon className="size-6" />}
                title="No serialized units recorded"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[66rem] border-collapse text-left">
                <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Identifier
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Product
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Location
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      State
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Condition / PTA
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Received
                    </th>
                    <th className="px-4 py-3 text-right font-bold" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {unitPage.items.map((unit) => (
                    <tr key={unit.id}>
                      <td className="px-4 py-3">
                        {unit.identifiers.length === 0 ? (
                          <span className="text-xs text-ink-muted">
                            No identifier recorded
                          </span>
                        ) : (
                          unit.identifiers.map((identifier) => (
                            <p
                              className="font-mono text-xs text-ink"
                              key={`${identifier.type}:${identifier.value}`}
                            >
                              <span className="mr-1 text-[0.625rem] uppercase text-ink-muted">
                                {identifier.type}
                              </span>
                              {identifier.value}
                            </p>
                          ))
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-ink">
                          {unit.productVariant.sku}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-subtle">
                          {unit.productVariant.name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-subtle">
                        <span className="font-mono text-xs text-ink-muted">
                          {unit.stockLocation.code}
                        </span>
                        <br />
                        {unit.stockLocation.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-ink">
                          {titleCase(unit.state)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {titleCase(unit.condition)}
                        <br />
                        {titleCase(unit.ptaStatus)}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {unit.receivedAt === null ? (
                          "Not recorded"
                        ) : (
                          <time dateTime={unit.receivedAt}>
                            {unit.receivedAt.slice(0, 10)}
                          </time>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {capabilities.canAdjust &&
                          allowedManualTransitions(unit.state).length > 0 ? (
                            <button
                              className={actionClass}
                              onClick={() =>
                                setDrawer({ action: "transition", unit })
                              }
                              type="button"
                            >
                              {unit.state === "available"
                                ? "Reserve / state"
                                : unit.state === "reserved"
                                  ? "Release / state"
                                  : "Change state"}
                            </button>
                          ) : null}
                          {capabilities.canTransfer &&
                          canTransferSerializedUnit(unit) &&
                          activeLocations.some(
                            (location) => location.id !== unit.stockLocation.id,
                          ) ? (
                            <button
                              className={actionClass}
                              onClick={() =>
                                setDrawer({ action: "transfer", unit })
                              }
                              type="button"
                            >
                              Transfer
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            onPage={(page) =>
              update({ upage: page === 1 ? undefined : String(page) }, false)
            }
            page={unitPage.page}
            total={unitPage.total}
            totalPages={unitPage.totalPages}
          />
        </section>
      )}

      {drawer === null ? null : (
        <SerializedUnitActionDrawer
          action={drawer.action}
          locations={activeLocations}
          onClose={() => setDrawer(null)}
          onSaved={saved}
          unit={drawer.unit}
        />
      )}
    </div>
  );
}

function movementReference(movement: InventoryMovement): string {
  if (movement.referenceType === null) return "No source reference";
  return movement.referenceId === null
    ? titleCase(movement.referenceType)
    : `${titleCase(movement.referenceType)} · ${movement.referenceId}`;
}

function MovementsTab(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parameters = movementParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const movements = useQuery(inventoryMovementsQueryOptions(parameters, true));
  const locations = useQuery(
    stockLocationsQueryOptions(locationReferenceParameters, true),
  );
  const activeLocations = locations.data?.items ?? [];
  const locationNameById = new Map(
    activeLocations.map((location) => [
      location.id,
      `${location.code} · ${location.name}`,
    ]),
  );
  const hasFilters =
    parameters.q !== undefined ||
    parameters.stockLocationId !== undefined ||
    parameters.movementType !== undefined;

  const update = (
    values: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void =>
    replaceSearch(
      pathname,
      new URLSearchParams(searchParams.toString()),
      router.replace,
      values,
      resetPage ? "mpage" : undefined,
    );
  const clear = (): void =>
    clearSearchKeys(
      pathname,
      new URLSearchParams(searchParams.toString()),
      router.replace,
      ["mq", "mlocationId", "movementType", "mpage"],
    );
  const error =
    movements.error === null || movements.data !== undefined
      ? null
      : toApiError(movements.error);
  const movementPage = movements.data;

  return (
    <div>
      <p className="mb-4 text-xs text-ink-muted">
        This is the append-only stock ledger. Corrections appear as new
        movements; existing entries are never edited or deleted.
      </p>
      <section
        aria-label="Movement search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <SearchField
          defaultValue={parameters.q}
          label="Search inventory movements"
          onSearch={(value) => update({ mq: value || undefined })}
          placeholder="Search SKU, product, or reason"
          queryName="mq"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink-subtle">
            Location
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              disabled={locations.isPending}
              onChange={(event) =>
                update({ mlocationId: event.target.value || undefined })
              }
              value={parameters.stockLocationId ?? ""}
            >
              <option value="">All active locations</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Movement type
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                update({ movementType: event.target.value || undefined })
              }
              value={parameters.movementType ?? ""}
            >
              <option value="">All movement types</option>
              {MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasFilters ? (
          <button
            className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong"
            onClick={clear}
            type="button"
          >
            Clear movement filters
          </button>
        ) : null}
      </section>

      {error !== null ? (
        <ErrorPanel error={error} retry={() => void movements.refetch()} />
      ) : movementPage === undefined ? (
        <StockTableSkeleton />
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {movementPage.items.length === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState onClear={clear} />
            ) : (
              <CatalogEmptyState
                description="No receipt, sale, transfer, reservation or correction has written a stock movement yet. No sample ledger entries are shown."
                icon={<ActivityIcon className="size-6" />}
                title="No inventory movements recorded"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[68rem] border-collapse text-left">
                <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Occurred
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Product
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Movement
                    </th>
                    <th className="px-4 py-3 text-right font-bold" scope="col">
                      Quantity
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      State / source
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {movementPage.items.map((movement) => (
                    <tr key={movement.id}>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        <time dateTime={movement.occurredAt}>
                          {movement.occurredAt.replace("T", " ").slice(0, 16)}{" "}
                          UTC
                        </time>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-ink">
                          {movement.productVariant.sku}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-subtle">
                          {movement.productVariant.name}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-ink">
                          {titleCase(movement.movementType)}
                        </p>
                        <p
                          className="mt-0.5 font-mono text-[0.65rem] text-ink-muted"
                          title={movement.stockLocationId}
                        >
                          {locationNameById.get(movement.stockLocationId) ??
                            `Location ${movement.stockLocationId.slice(0, 8)}…`}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-ink">
                        {movement.quantity}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {movement.fromState === null &&
                        movement.toState === null
                          ? movementReference(movement)
                          : `${movement.fromState === null ? "None" : titleCase(movement.fromState)} → ${movement.toState === null ? "None" : titleCase(movement.toState)}`}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-ink-muted">
                        {movement.reason ?? "No reason recorded"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            onPage={(page) =>
              update({ mpage: page === 1 ? undefined : String(page) }, false)
            }
            page={movementPage.page}
            total={movementPage.total}
            totalPages={movementPage.totalPages}
          />
        </section>
      )}
    </div>
  );
}

function LocationsTab({
  canManage,
}: {
  readonly canManage: boolean;
}): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parameters = locationParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const locations = useQuery(stockLocationsQueryOptions(parameters, true));
  const hasFilters =
    parameters.q !== undefined ||
    parameters.locationType !== undefined ||
    parameters.active !== undefined;
  const update = (
    values: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void =>
    replaceSearch(
      pathname,
      new URLSearchParams(searchParams.toString()),
      router.replace,
      values,
      resetPage ? "lpage" : undefined,
    );
  const clear = (): void =>
    clearSearchKeys(
      pathname,
      new URLSearchParams(searchParams.toString()),
      router.replace,
      ["lq", "locationType", "lactive", "lpage"],
    );
  const error =
    locations.error === null || locations.data !== undefined
      ? null
      : toApiError(locations.error);
  const locationPage = locations.data;

  return (
    <div>
      <div className="mb-4 flex items-start gap-2 rounded-control border border-info/20 bg-info-soft p-3 text-xs leading-5 text-info">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Locations define where stock is held.{" "}
          {canManage
            ? "Your settings.manage grant can maintain locations through the API; this view currently keeps configuration read-only while stock actions use active locations."
            : "Your current permissions allow inventory reads but not location configuration."}
        </p>
      </div>
      <section
        aria-label="Stock location search and filters"
        className="mb-4 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <SearchField
          defaultValue={parameters.q}
          label="Search stock locations"
          onSearch={(value) => update({ lq: value || undefined })}
          placeholder="Search location name or code"
          queryName="lq"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink-subtle">
            Location type
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                update({ locationType: event.target.value || undefined })
              }
              value={parameters.locationType ?? ""}
            >
              <option value="">All location types</option>
              {STOCK_LOCATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {titleCase(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            Status
            <select
              className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
              onChange={(event) =>
                update({ lactive: event.target.value || undefined })
              }
              value={
                parameters.active === undefined ? "" : String(parameters.active)
              }
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        </div>
        {hasFilters ? (
          <button
            className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong"
            onClick={clear}
            type="button"
          >
            Clear location filters
          </button>
        ) : null}
      </section>

      {error !== null ? (
        <ErrorPanel error={error} retry={() => void locations.refetch()} />
      ) : locationPage === undefined ? (
        <StockTableSkeleton />
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {locationPage.items.length === 0 ? (
            hasFilters ? (
              <CatalogNoResultsState onClear={clear} />
            ) : (
              <CatalogEmptyState
                description="No stock location exists for this organization. Stock writes remain unavailable until an owner configures a real location."
                icon={<LayersIcon className="size-6" />}
                title="No stock locations configured"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-left">
                <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Name
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Code
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Type
                    </th>
                    <th className="px-4 py-3 font-bold" scope="col">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-bold" scope="col">
                      Version
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {locationPage.items.map((location) => (
                    <tr key={location.id}>
                      <td className="px-4 py-3 text-sm font-semibold text-ink">
                        {location.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-subtle">
                        {location.code}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {titleCase(location.locationType)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${location.isActive ? "bg-positive-soft text-positive" : "bg-surface-subtle text-ink-muted"}`}
                        >
                          {location.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-ink-muted">
                        {location.version}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            onPage={(page) =>
              update({ lpage: page === 1 ? undefined : String(page) }, false)
            }
            page={locationPage.page}
            total={locationPage.total}
            totalPages={locationPage.totalPages}
          />
        </section>
      )}
    </div>
  );
}

function StockWorkspace({
  capabilities,
}: {
  readonly capabilities: StockCapabilities;
}): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = stockTabFrom(new URLSearchParams(searchParams.toString()));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTab = (nextTab: StockTabId): void => {
    const query = stockTabQuery(
      new URLSearchParams(searchParams.toString()),
      nextTab,
    );
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };
  const keyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    const next = nextStockTabIndex(index, event.key, STOCK_TABS.length);
    if (next === null) return;
    event.preventDefault();
    const nextTab = STOCK_TABS[next];
    if (nextTab === undefined) return;
    selectTab(nextTab.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <header className="mb-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">
              Inventory · Proven stock
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
              Stock inventory
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
              Derived balances, named handset units and their append-only
              movement history. Prices and costs are intentionally outside this
              surface.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-positive-soft px-3 py-1.5 text-positive">
              Real API data
            </span>
            <span className="rounded-full bg-accent-soft px-3 py-1.5 text-accent-ink">
              Permission-aware actions
            </span>
          </div>
        </div>
      </header>

      <div
        className="mb-4 overflow-x-auto border-b border-line"
        role="tablist"
        aria-label="Inventory views"
      >
        <div className="flex min-w-max gap-1">
          {STOCK_TABS.map((item, index) => {
            const selected = item.id === tab;
            return (
              <button
                aria-controls={`stock-panel-${item.id}`}
                aria-selected={selected}
                className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${selected ? "border-accent text-accent" : "border-transparent text-ink-muted hover:text-ink"}`}
                id={`stock-tab-${item.id}`}
                key={item.id}
                onClick={() => selectTab(item.id)}
                onKeyDown={(event) => keyDown(event, index)}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <section
        aria-labelledby={`stock-tab-${tab}`}
        id={`stock-panel-${tab}`}
        role="tabpanel"
        tabIndex={0}
      >
        {tab === "balances" ? (
          <BalancesTab capabilities={capabilities} />
        ) : null}
        {tab === "units" ? <UnitsTab capabilities={capabilities} /> : null}
        {tab === "movements" ? <MovementsTab /> : null}
        {tab === "locations" ? (
          <LocationsTab canManage={capabilities.canManageLocations} />
        ) : null}
      </section>
    </div>
  );
}

export function StockInventoryPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  if (auth.data === undefined && auth.isPending) {
    return <StockInventoryRouteFallback />;
  }
  const capabilities = stockCapabilities(auth.data?.permissions);
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing stock requires the server-provided inventory.view permission. No inventory request was sent."
        title="Inventory access required"
      />
    );
  }
  return <StockWorkspace capabilities={capabilities} />;
}
