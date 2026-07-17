/**
 * Stable machine-readable error codes.
 *
 * Rule 05_RULES.md §9: "API errors use stable machine codes plus human-readable
 * messages." These codes are part of the public API contract — never rename one
 * without versioning, because clients branch on them.
 */

export const ERROR_CODES = {
  // --- Generic (1xxx) ------------------------------------------------------
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  OPTIMISTIC_LOCK_FAILED: "OPTIMISTIC_LOCK_FAILED",

  // --- Auth (2xxx) ---------------------------------------------------------
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  AUTH_SESSION_INVALID: "AUTH_SESSION_INVALID",
  AUTH_USER_INACTIVE: "AUTH_USER_INACTIVE",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_TOO_MANY_ATTEMPTS: "AUTH_TOO_MANY_ATTEMPTS",
  FORBIDDEN_PERMISSION: "FORBIDDEN_PERMISSION",
  FORBIDDEN_SCOPE: "FORBIDDEN_SCOPE",
  REASON_REQUIRED: "REASON_REQUIRED",

  // --- Catalog (3xxx) ------------------------------------------------------
  CATALOG_SKU_DUPLICATE: "CATALOG_SKU_DUPLICATE",
  CATALOG_BARCODE_DUPLICATE: "CATALOG_BARCODE_DUPLICATE",
  CATALOG_VARIANT_INACTIVE: "CATALOG_VARIANT_INACTIVE",
  CATALOG_TRACKING_TYPE_LOCKED: "CATALOG_TRACKING_TYPE_LOCKED",

  // --- Inventory (4xxx) ----------------------------------------------------
  IMEI_INVALID: "IMEI_INVALID",
  IMEI_DUPLICATE: "IMEI_DUPLICATE",
  SERIAL_DUPLICATE: "SERIAL_DUPLICATE",
  INVENTORY_UNIT_NOT_AVAILABLE: "INVENTORY_UNIT_NOT_AVAILABLE",
  INVENTORY_UNIT_ALREADY_SOLD: "INVENTORY_UNIT_ALREADY_SOLD",
  INVENTORY_INVALID_STATE_TRANSITION: "INVENTORY_INVALID_STATE_TRANSITION",
  INVENTORY_INSUFFICIENT_STOCK: "INVENTORY_INSUFFICIENT_STOCK",
  INVENTORY_NEGATIVE_STOCK_BLOCKED: "INVENTORY_NEGATIVE_STOCK_BLOCKED",
  INVENTORY_DIRECT_EDIT_BLOCKED: "INVENTORY_DIRECT_EDIT_BLOCKED",
  INVENTORY_UNIT_HAS_HISTORY: "INVENTORY_UNIT_HAS_HISTORY",
  INVENTORY_ADJUSTMENT_REASON_REQUIRED: "INVENTORY_ADJUSTMENT_REASON_REQUIRED",

  // --- Purchasing (5xxx) ---------------------------------------------------
  PURCHASE_ORDER_NOT_APPROVED: "PURCHASE_ORDER_NOT_APPROVED",
  PURCHASE_ORDER_INVALID_STATUS: "PURCHASE_ORDER_INVALID_STATUS",
  PURCHASE_RECEIVE_EXCEEDS_ORDERED: "PURCHASE_RECEIVE_EXCEEDS_ORDERED",
  PURCHASE_SERIAL_COUNT_MISMATCH: "PURCHASE_SERIAL_COUNT_MISMATCH",
  PURCHASE_NEGATIVE_AMOUNT: "PURCHASE_NEGATIVE_AMOUNT",

  // --- Sales (6xxx) --------------------------------------------------------
  SALE_EMPTY_CART: "SALE_EMPTY_CART",
  SALE_ALREADY_POSTED: "SALE_ALREADY_POSTED",
  SALE_POSTED_IMMUTABLE: "SALE_POSTED_IMMUTABLE",
  SALE_PAYMENT_MISMATCH: "SALE_PAYMENT_MISMATCH",
  SALE_SERIALIZED_UNIT_REQUIRED: "SALE_SERIALIZED_UNIT_REQUIRED",
  SALE_BELOW_MIN_MARGIN: "SALE_BELOW_MIN_MARGIN",
  SALE_DISCOUNT_NOT_AUTHORIZED: "SALE_DISCOUNT_NOT_AUTHORIZED",
  SALE_CREDIT_NOT_AUTHORIZED: "SALE_CREDIT_NOT_AUTHORIZED",
  SALE_CASH_SESSION_REQUIRED: "SALE_CASH_SESSION_REQUIRED",

  // --- Returns (7xxx) ------------------------------------------------------
  RETURN_ORIGINAL_SALE_REQUIRED: "RETURN_ORIGINAL_SALE_REQUIRED",
  RETURN_QUANTITY_EXCEEDS_SOLD: "RETURN_QUANTITY_EXCEEDS_SOLD",
  RETURN_WINDOW_EXPIRED: "RETURN_WINDOW_EXPIRED",
  RETURN_UNIT_MISMATCH: "RETURN_UNIT_MISMATCH",

  // --- External services (8xxx) -------------------------------------------
  EXTERNAL_FEE_RULE_NOT_FOUND: "EXTERNAL_FEE_RULE_NOT_FOUND",
  EXTERNAL_REFERENCE_DUPLICATE: "EXTERNAL_REFERENCE_DUPLICATE",
  EXTERNAL_PRINCIPAL_INVALID: "EXTERNAL_PRINCIPAL_INVALID",
  EXTERNAL_INSUFFICIENT_FLOAT: "EXTERNAL_INSUFFICIENT_FLOAT",
  EXTERNAL_TRANSACTION_POSTED_IMMUTABLE:
    "EXTERNAL_TRANSACTION_POSTED_IMMUTABLE",

  // --- Cash sessions (9xxx) ------------------------------------------------
  CASH_SESSION_ALREADY_OPEN: "CASH_SESSION_ALREADY_OPEN",
  CASH_SESSION_NOT_OPEN: "CASH_SESSION_NOT_OPEN",
  CASH_SESSION_ALREADY_CLOSED: "CASH_SESSION_ALREADY_CLOSED",
  CASH_SESSION_INVALID_STATUS: "CASH_SESSION_INVALID_STATUS",
  CASH_SESSION_VARIANCE_REASON_REQUIRED:
    "CASH_SESSION_VARIANCE_REASON_REQUIRED",
  CASH_SESSION_REOPEN_NOT_AUTHORIZED: "CASH_SESSION_REOPEN_NOT_AUTHORIZED",

  // --- Finance (10xxx) -----------------------------------------------------
  LEDGER_DUPLICATE_POSTING: "LEDGER_DUPLICATE_POSTING",
  LEDGER_UNBALANCED: "LEDGER_UNBALANCED",
  RECEIVABLE_OVERPAYMENT: "RECEIVABLE_OVERPAYMENT",
  PAYABLE_OVERPAYMENT: "PAYABLE_OVERPAYMENT",

  // --- Recommendations (11xxx) --------------------------------------------
  RECOMMENDATION_RUN_NOT_FOUND: "RECOMMENDATION_RUN_NOT_FOUND",
  RECOMMENDATION_AUTO_ORDER_BLOCKED: "RECOMMENDATION_AUTO_ORDER_BLOCKED",
  RECOMMENDATION_ALREADY_DECIDED: "RECOMMENDATION_ALREADY_DECIDED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Wire shape for every non-2xx API response. */
export interface ApiErrorBody {
  /**
   * Always one of `ERROR_CODES`. Clients must treat an unrecognized value as a
   * generic failure rather than crashing, so that adding a code is not breaking.
   */
  readonly code: ErrorCode;
  readonly message: string;
  /** Field-level validation problems, keyed by dotted field path. */
  readonly details?: Readonly<Record<string, readonly string[]>> | undefined;
  /** Correlation ID — lets the user quote one value that finds the exact log line. */
  readonly requestId?: string | undefined;
  readonly timestamp?: string | undefined;
}

/**
 * Domain error carrying a stable code and HTTP status.
 * Thrown by domain/application services; translated to `ApiErrorBody` at the boundary.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Readonly<Record<string, readonly string[]>> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      status?: number;
      details?: Record<string, readonly string[]>;
      cause?: unknown;
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "DomainError";
    this.code = code;
    this.status = options.status ?? DEFAULT_ERROR_STATUS[code] ?? 400;
    this.details = options.details;
  }

  toBody(requestId?: string): ApiErrorBody {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      requestId,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Default HTTP status per code. Codes absent here fall back to 400. */
export const DEFAULT_ERROR_STATUS: Partial<Record<ErrorCode, number>> =
  Object.freeze({
    [ERROR_CODES.VALIDATION_FAILED]: 422,
    [ERROR_CODES.NOT_FOUND]: 404,
    [ERROR_CODES.CONFLICT]: 409,
    [ERROR_CODES.INTERNAL_ERROR]: 500,
    [ERROR_CODES.RATE_LIMITED]: 429,
    [ERROR_CODES.IDEMPOTENCY_KEY_REUSED]: 409,
    [ERROR_CODES.OPTIMISTIC_LOCK_FAILED]: 409,

    [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 401,
    [ERROR_CODES.AUTH_SESSION_EXPIRED]: 401,
    [ERROR_CODES.AUTH_SESSION_INVALID]: 401,
    [ERROR_CODES.AUTH_USER_INACTIVE]: 403,
    [ERROR_CODES.AUTH_REQUIRED]: 401,
    [ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS]: 429,
    [ERROR_CODES.FORBIDDEN_PERMISSION]: 403,
    [ERROR_CODES.FORBIDDEN_SCOPE]: 403,

    [ERROR_CODES.IMEI_DUPLICATE]: 409,
    [ERROR_CODES.SERIAL_DUPLICATE]: 409,
    [ERROR_CODES.INVENTORY_UNIT_ALREADY_SOLD]: 409,
    [ERROR_CODES.INVENTORY_UNIT_NOT_AVAILABLE]: 409,
    [ERROR_CODES.CATALOG_SKU_DUPLICATE]: 409,
    [ERROR_CODES.CATALOG_BARCODE_DUPLICATE]: 409,
    [ERROR_CODES.SALE_ALREADY_POSTED]: 409,
    [ERROR_CODES.SALE_POSTED_IMMUTABLE]: 409,
    [ERROR_CODES.EXTERNAL_REFERENCE_DUPLICATE]: 409,
    [ERROR_CODES.EXTERNAL_INSUFFICIENT_FLOAT]: 409,
    [ERROR_CODES.CASH_SESSION_ALREADY_OPEN]: 409,
    [ERROR_CODES.CASH_SESSION_NOT_OPEN]: 409,
    [ERROR_CODES.CASH_SESSION_ALREADY_CLOSED]: 409,
    [ERROR_CODES.LEDGER_DUPLICATE_POSTING]: 409,
  });

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
