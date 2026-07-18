import {
  LIMITS,
  PAGINATION,
  PERMISSIONS,
  PURCHASE_ORDER_STATUSES,
  RECEIVING_SERIALIZED_STATES,
  allocateByIntegerWeights,
  multiplyByQuantity,
  normalizeSerial,
  sum,
  toMinor,
  validateImei,
  type GoodsReceiptListQuery,
  type PurchaseOrderListQuery,
  type PurchaseOrderStatus,
  type ReceiveSerializedUnitData,
  type SupplierListQuery,
} from "@mobileshop/shared";
import { z } from "zod";
import { ApiError, toApiError } from "@/lib/api/client";

export const PURCHASING_PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;

export const PURCHASING_TABS = [
  { id: "add-stock", label: "Add stock" },
  { id: "orders", label: "Purchase orders" },
  { id: "suppliers", label: "Suppliers" },
  { id: "receipts", label: "Receipts" },
] as const;

export type PurchasingTabId = (typeof PURCHASING_TABS)[number]["id"];

export interface PurchasingCapabilities {
  readonly canViewPurchases: boolean;
  readonly canViewSuppliers: boolean;
  readonly canViewCatalog: boolean;
  readonly canManageSuppliers: boolean;
  readonly canCreatePurchases: boolean;
  /**
   * Draft create/edit forms need supplier and catalog reference reads in
   * addition to the write permission. Lifecycle transitions do not.
   */
  readonly canEditPurchaseDrafts: boolean;
  readonly canApprovePurchases: boolean;
  readonly canReceivePurchases: boolean;
  readonly canViewInventory: boolean;
}

export function purchasingCapabilities(
  permissions: readonly string[] | undefined,
): PurchasingCapabilities {
  const granted = permissions ?? [];
  const canViewSuppliers = granted.includes(PERMISSIONS.SUPPLIERS_VIEW);
  const canViewCatalog = granted.includes(PERMISSIONS.CATALOG_VIEW);
  const canCreatePurchases = granted.includes(PERMISSIONS.PURCHASES_CREATE);
  return {
    canViewPurchases: granted.includes(PERMISSIONS.PURCHASES_VIEW),
    canViewSuppliers,
    canViewCatalog,
    canManageSuppliers: granted.includes(PERMISSIONS.SUPPLIERS_MANAGE),
    canCreatePurchases,
    canEditPurchaseDrafts:
      canCreatePurchases && canViewSuppliers && canViewCatalog,
    canApprovePurchases: granted.includes(PERMISSIONS.PURCHASES_APPROVE),
    canReceivePurchases: granted.includes(PERMISSIONS.PURCHASES_RECEIVE),
    canViewInventory: granted.includes(PERMISSIONS.INVENTORY_VIEW),
  };
}

export function purchasingTabFrom(
  searchParams: URLSearchParams,
): PurchasingTabId {
  const value = searchParams.get("tab");
  return PURCHASING_TABS.some((tab) => tab.id === value)
    ? (value as PurchasingTabId)
    : "add-stock";
}

export function purchasingTabQuery(
  searchParams: URLSearchParams,
  tab: PurchasingTabId,
): string {
  const next = new URLSearchParams(searchParams.toString());
  // Add stock is the default tab, so it carries no query parameter.
  if (tab === "add-stock") next.delete("tab");
  else next.set("tab", tab);
  return next.toString();
}

export function nextPurchasingTabIndex(
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

function positivePage(value: string | null): number {
  if (value === null || !/^\d+$/u.test(value)) return PAGINATION.DEFAULT_PAGE;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : PAGINATION.DEFAULT_PAGE;
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

function statusValue(value: string | null): PurchaseOrderStatus | undefined {
  return PURCHASE_ORDER_STATUSES.includes(value as PurchaseOrderStatus)
    ? (value as PurchaseOrderStatus)
    : undefined;
}

function dateValue(value: string | null): string | undefined {
  if (value === null) return undefined;
  return z.iso.date().safeParse(value).success ? value : undefined;
}

export function orderParametersFrom(
  searchParams: URLSearchParams,
): PurchaseOrderListQuery {
  const q = searchValue(searchParams.get("oq"));
  const status = statusValue(searchParams.get("ostatus"));
  const supplierId = uuidValue(searchParams.get("osupplier"));
  const from = dateValue(searchParams.get("ofrom"));
  const to = dateValue(searchParams.get("oto"));
  return {
    page: positivePage(searchParams.get("opage")),
    pageSize: PURCHASING_PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(status === undefined ? {} : { status }),
    ...(supplierId === undefined ? {} : { supplierId }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

export function supplierParametersFrom(
  searchParams: URLSearchParams,
): SupplierListQuery {
  const q = searchValue(searchParams.get("sq"));
  const activeValue = searchParams.get("sactive");
  return {
    page: positivePage(searchParams.get("spage")),
    pageSize: PURCHASING_PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(activeValue === "true"
      ? { active: true }
      : activeValue === "false"
        ? { active: false }
        : {}),
  };
}

export function receiptParametersFrom(
  searchParams: URLSearchParams,
): GoodsReceiptListQuery {
  const q = searchValue(searchParams.get("rq"));
  const supplierId = uuidValue(searchParams.get("rsupplier"));
  const from = dateValue(searchParams.get("rfrom"));
  const to = dateValue(searchParams.get("rto"));
  return {
    page: positivePage(searchParams.get("rpage")),
    pageSize: PURCHASING_PAGE_SIZE,
    ...(q === undefined ? {} : { q }),
    ...(supplierId === undefined ? {} : { supplierId }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

export function applyPurchasingUpdates(
  current: URLSearchParams,
  updates: Readonly<Record<string, string | undefined>>,
  pageKey: string,
  resetPage = true,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value.length === 0) next.delete(key);
    else next.set(key, value);
  }
  if (resetPage) next.delete(pageKey);
  return next.toString();
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function purchasingErrorMessage(error: ApiError): string {
  switch (error.code) {
    case "OPTIMISTIC_LOCK_FAILED":
      return "This record changed after it was opened. Nothing was overwritten; reload and try again.";
    case "PURCHASE_ORDER_INVALID_STATUS":
    case "PURCHASE_ORDER_NOT_APPROVED":
    case "PURCHASE_RECEIVE_EXCEEDS_ORDERED":
    case "IMEI_INVALID":
    case "IMEI_DUPLICATE":
    case "SERIAL_DUPLICATE":
    case "VALIDATION_FAILED":
    case "CONFLICT":
      return error.message;
    case "FORBIDDEN_PERMISSION":
    case "FORBIDDEN_SCOPE":
      return "Your current permissions do not allow this action.";
    case "NOT_FOUND":
      return "This record is no longer available in your organization and branch.";
    case "NETWORK_ERROR":
    case "REQUEST_TIMEOUT":
      return "The connection ended before confirmation. The outcome may be unknown; refresh the relevant record before attempting the action again.";
    default:
      return error.status === 403
        ? "Your current permissions do not allow this action."
        : "The action could not be completed. Review the form and try again.";
  }
}

export function asPurchasingError(error: unknown): ApiError {
  if (error instanceof z.ZodError) {
    return new ApiError(error.issues[0]?.message ?? "Review the form.", {
      code: "CLIENT_VALIDATION_FAILED",
    });
  }
  return toApiError(error);
}

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

export interface SerializedRowError {
  readonly line: number;
  readonly message: string;
}

export interface SerializedRowsResult {
  readonly units: readonly ReceiveSerializedUnitData[];
  readonly errors: readonly SerializedRowError[];
  readonly rowCount: number;
}

/**
 * Bulk format: IMEI1[, IMEI2][, serial][, initial_state]. Tabs and pipes work
 * too, which makes spreadsheet paste useful without silently guessing columns.
 */
export function parseSerializedRows(text: string): SerializedRowsResult {
  const rows = text
    .split(/\r?\n/u)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter((row) => row.raw.length > 0);
  const errors: SerializedRowError[] = [];
  const units: ReceiveSerializedUnitData[] = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    const columns = row.raw.split(/[,\t|]/u).map((value) => value.trim());
    if (columns.length > 4) {
      errors.push({
        line: row.line,
        message: "Use at most four columns: IMEI1, IMEI2, serial, state.",
      });
      continue;
    }
    const imei1Raw = columns[0] ?? "";
    const imei1 = validateImei(imei1Raw, {
      requireChecksum: true,
      allowImeiSv: true,
    });
    if (!imei1.valid || imei1.normalized === null) {
      errors.push({
        line: row.line,
        message: imei1.message ?? "IMEI1 is invalid.",
      });
      continue;
    }

    const imei2Raw = columns[1] ?? "";
    const imei2 =
      imei2Raw.length === 0
        ? null
        : validateImei(imei2Raw, {
            requireChecksum: true,
            allowImeiSv: true,
          });
    if (imei2 !== null && (!imei2.valid || imei2.normalized === null)) {
      errors.push({
        line: row.line,
        message: imei2.message ?? "IMEI2 is invalid.",
      });
      continue;
    }

    const serialRaw = columns[2] ?? "";
    const serialNumber =
      serialRaw.length === 0 ? null : normalizeSerial(serialRaw);
    if (serialRaw.length > 0 && serialNumber === null) {
      errors.push({ line: row.line, message: "Serial number is empty." });
      continue;
    }
    const stateRaw = columns[3] ?? "available";
    const initialState = RECEIVING_SERIALIZED_STATES.includes(
      stateRaw as (typeof RECEIVING_SERIALIZED_STATES)[number],
    )
      ? (stateRaw as (typeof RECEIVING_SERIALIZED_STATES)[number])
      : null;
    if (initialState === null) {
      errors.push({
        line: row.line,
        message: `State must be ${RECEIVING_SERIALIZED_STATES.join(", ")}.`,
      });
      continue;
    }

    const identifiers = [
      imei1.normalized,
      ...(imei2?.normalized === undefined || imei2.normalized === null
        ? []
        : [imei2.normalized]),
      ...(serialNumber === null ? [] : [serialNumber]),
    ];
    const duplicate = identifiers.find((identifier) => seen.has(identifier));
    if (duplicate !== undefined) {
      errors.push({
        line: row.line,
        message: `Identifier duplicates row ${seen.get(duplicate)}.`,
      });
      continue;
    }
    for (const identifier of identifiers) seen.set(identifier, row.line);
    units.push({
      imei1: imei1.normalized,
      imei2: imei2?.normalized ?? null,
      serialNumber,
      initialState,
    });
  }

  return { units, errors, rowCount: rows.length };
}

export interface ReceivingImpactLine {
  readonly quantity: number;
  readonly unitCostMinor: number;
}

export interface ReceivingImpact {
  readonly actualTotalMinor: number;
  readonly landedCostExtraMinor: number;
  readonly inventoryValueMinor: number;
  readonly payableMinor: number;
  readonly allocations: readonly number[];
}

export function receivingImpact(
  lines: readonly ReceivingImpactLine[],
  landedCostsMinor: readonly number[],
): ReceivingImpact {
  const values = lines.map((line) =>
    multiplyByQuantity(toMinor(line.unitCostMinor), line.quantity),
  );
  const actualTotalMinor = sum(values);
  const landedCostExtraMinor = sum(
    landedCostsMinor.map((value) => toMinor(value)),
  );
  if (actualTotalMinor === 0 && landedCostExtraMinor > 0) {
    throw new Error(
      "Landed costs cannot be allocated when every received line has zero value.",
    );
  }
  const allocations =
    landedCostExtraMinor === 0
      ? values.map(() => 0)
      : allocateByIntegerWeights(landedCostExtraMinor, values);
  return {
    actualTotalMinor,
    landedCostExtraMinor,
    inventoryValueMinor: sum([actualTotalMinor, landedCostExtraMinor]),
    payableMinor: actualTotalMinor,
    allocations,
  };
}
