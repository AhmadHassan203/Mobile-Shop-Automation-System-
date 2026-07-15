import {
  ERROR_CODES,
  LIMITS,
  PAGINATION,
  PERMISSIONS,
} from "@mobileshop/shared";
import { z } from "zod";
import type {
  BrandListParameters,
  CategoryListParameters,
  ProductModelListParameters,
} from "@/lib/api/catalog";
import { ApiError, toApiError } from "@/lib/api/client";

/**
 * URL, permission and transition arithmetic for the catalog reference tabs.
 *
 * The category, brand, model and product tabs all live on one route, so each
 * tab namespaces its own search parameters and only ever reads and writes its
 * own keys — otherwise switching a brand filter would silently reset the
 * product tab's paging. Keeping this logic free of React and of the network is
 * also what lets the node test harness exercise it directly.
 */

export const REFERENCE_PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;

export interface ReferenceParameterNames {
  readonly q: string;
  readonly active: string;
  readonly page: string;
}

export interface ProductModelParameterNames extends ReferenceParameterNames {
  readonly brandId: string;
  readonly categoryId: string;
}

export const CATEGORY_PARAMETER_NAMES: ReferenceParameterNames = Object.freeze({
  q: "cq",
  active: "cactive",
  page: "cpage",
});

export const BRAND_PARAMETER_NAMES: ReferenceParameterNames = Object.freeze({
  q: "bq",
  active: "bactive",
  page: "bpage",
});

export const PRODUCT_MODEL_PARAMETER_NAMES: ProductModelParameterNames =
  Object.freeze({
    q: "mq",
    active: "mactive",
    page: "mpage",
    brandId: "mbrandId",
    categoryId: "mcategoryId",
  });

function positivePage(value: string | null): number {
  if (value === null || !/^\d+$/u.test(value)) return PAGINATION.DEFAULT_PAGE;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : PAGINATION.DEFAULT_PAGE;
}

function activeFrom(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/** Bounded here so a hand-edited URL cannot spend a round trip earning a 422. */
function searchFrom(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim().slice(0, LIMITS.MAX_SEARCH_TERM_LENGTH);
  return trimmed.length === 0 ? undefined : trimmed;
}

function identifierFrom(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

interface BaseReferenceParameters {
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly active?: boolean;
}

function baseParametersFrom(
  searchParams: URLSearchParams,
  names: ReferenceParameterNames,
): BaseReferenceParameters {
  const q = searchFrom(searchParams.get(names.q));
  const active = activeFrom(searchParams.get(names.active));
  return {
    page: positivePage(searchParams.get(names.page)),
    pageSize: REFERENCE_PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(active === undefined ? {} : { active }),
  };
}

export function categoryListParametersFrom(
  searchParams: URLSearchParams,
): CategoryListParameters {
  return baseParametersFrom(searchParams, CATEGORY_PARAMETER_NAMES);
}

export function brandListParametersFrom(
  searchParams: URLSearchParams,
): BrandListParameters {
  return baseParametersFrom(searchParams, BRAND_PARAMETER_NAMES);
}

export function productModelListParametersFrom(
  searchParams: URLSearchParams,
): ProductModelListParameters {
  const brandId = identifierFrom(
    searchParams.get(PRODUCT_MODEL_PARAMETER_NAMES.brandId),
  );
  const categoryId = identifierFrom(
    searchParams.get(PRODUCT_MODEL_PARAMETER_NAMES.categoryId),
  );
  return {
    ...baseParametersFrom(searchParams, PRODUCT_MODEL_PARAMETER_NAMES),
    ...(brandId === undefined ? {} : { brandId }),
    ...(categoryId === undefined ? {} : { categoryId }),
  };
}

/**
 * Returns the next query string, touching only the keys handed in. Every other
 * tab's parameters — including its paging — survive untouched.
 */
export function applyParameterUpdates(
  current: URLSearchParams,
  updates: Readonly<Record<string, string | undefined>>,
  pageKey: string,
  resetPage: boolean,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value.length === 0) next.delete(key);
    else next.set(key, value);
  }
  if (resetPage) next.delete(pageKey);
  return next.toString();
}

/** Clears this tab's own filters only; a sibling tab's state is not collateral. */
export function clearFilterUpdates(
  names: ReferenceParameterNames | ProductModelParameterNames,
): Record<string, undefined> {
  const updates: Record<string, undefined> = {
    [names.q]: undefined,
    [names.active]: undefined,
  };
  if ("brandId" in names) {
    updates[names.brandId] = undefined;
    updates[names.categoryId] = undefined;
  }
  return updates;
}

export function hasReferenceFilters(parameters: {
  readonly q?: string | undefined;
  readonly active?: boolean | undefined;
  readonly brandId?: string | undefined;
  readonly categoryId?: string | undefined;
}): boolean {
  return (
    parameters.q !== undefined ||
    parameters.active !== undefined ||
    parameters.brandId !== undefined ||
    parameters.categoryId !== undefined
  );
}

export interface ReferenceCapabilities {
  readonly canView: boolean;
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly canDeactivate: boolean;
}

/**
 * Mirrors the server's permission map for UI affordances only — the backend
 * remains the authority. Reactivation is deliberately a `catalog.update`, not a
 * `catalog.deactivate`: the deactivate grant is one-directional.
 */
export function referenceCapabilities(
  permissions: readonly string[] | undefined,
): ReferenceCapabilities {
  const granted = permissions ?? [];
  return {
    canView: granted.includes(PERMISSIONS.CATALOG_VIEW),
    canCreate: granted.includes(PERMISSIONS.CATALOG_CREATE),
    canUpdate: granted.includes(PERMISSIONS.CATALOG_UPDATE),
    canDeactivate: granted.includes(PERMISSIONS.CATALOG_DEACTIVATE),
  };
}

export type ReferenceEntity = "category" | "brand" | "productModel";

const ENTITY_LABELS: Readonly<Record<ReferenceEntity, string>> = Object.freeze({
  category: "category",
  brand: "brand",
  productModel: "product model",
});

export function referenceEntityLabel(entity: ReferenceEntity): string {
  return ENTITY_LABELS[entity];
}

/**
 * Turns a failure into something an owner can act on. Nothing here ever implies
 * a write happened: an optimistic-lock clash in particular says plainly that the
 * record moved and the edit was not saved.
 */
export function referenceErrorMessage(
  error: ApiError,
  entity: ReferenceEntity,
): string {
  const label = ENTITY_LABELS[entity];
  switch (error.code) {
    case ERROR_CODES.OPTIMISTIC_LOCK_FAILED:
      return `This ${label} changed since you opened it. Nothing was saved — reload the list and reapply your change.`;
    case ERROR_CODES.CONFLICT:
      return `Another ${label} in this organization already uses that name.`;
    case ERROR_CODES.NOT_FOUND:
      return `This ${label} no longer exists. Reload the list.`;
    case ERROR_CODES.VALIDATION_FAILED:
      return `Some values were rejected. Review the highlighted fields and try again.`;
    case ERROR_CODES.CATALOG_TRACKING_TYPE_LOCKED:
      return `Tracking type cannot be changed on an existing product.`;
    case ERROR_CODES.FORBIDDEN_PERMISSION:
    case ERROR_CODES.FORBIDDEN_SCOPE:
      return `Your current permissions do not allow this change.`;
    case "NETWORK_ERROR":
    case "REQUEST_TIMEOUT":
      return `The catalog API could not be reached. Nothing was saved.`;
    case "CLIENT_VALIDATION_FAILED":
      return error.message;
    default:
      return error.status === 403
        ? `Your current permissions do not allow this change.`
        : `The ${label} could not be saved. Review the fields and try again.`;
  }
}

/** Field-level problems the server reported, keyed by the contract's field name. */
export function fieldMessages(
  error: ApiError | null,
  field: string,
): readonly string[] | undefined {
  const messages = error?.details?.[field];
  return messages === undefined || messages.length === 0 ? undefined : messages;
}

/**
 * A local contract violation must read as a validation problem rather than as
 * an unexplained failure, so a schema rejection never reaches the user as
 * "an unexpected client error occurred".
 */
export function clientOrApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof z.ZodError) {
    return new ApiError(error.issues[0]?.message ?? fallback, {
      code: "CLIENT_VALIDATION_FAILED",
    });
  }
  return toApiError(error);
}

/** The field's own validation wins; the server's report is the fallback. */
export function mergeFieldMessages(
  clientMessage: string | undefined,
  serverMessages: readonly string[] | undefined,
): readonly string[] | undefined {
  if (clientMessage !== undefined) return [clientMessage];
  return serverMessages;
}

export interface ReferenceRow {
  readonly id: string;
  readonly isActive: boolean;
  readonly version: number;
}

export interface ReferenceTransitionApi<TRow> {
  readonly deactivate: (id: string, version: number) => Promise<TRow>;
  readonly activate: (id: string, version: number) => Promise<TRow>;
}

/**
 * Runs the row's one legal transition, always carrying the version the row was
 * rendered with so a concurrent edit loses optimistically rather than silently.
 * Returns null — never a request — when the caller lacks the grant, which keeps
 * a stale render from firing a call the server would only reject.
 */
export async function runReferenceTransition<TRow extends ReferenceRow>(
  row: TRow,
  capabilities: ReferenceCapabilities,
  api: ReferenceTransitionApi<TRow>,
): Promise<TRow | null> {
  if (row.isActive) {
    if (!capabilities.canDeactivate) return null;
    return api.deactivate(row.id, row.version);
  }
  if (!capabilities.canUpdate) return null;
  return api.activate(row.id, row.version);
}
