/**
 * Safe, non-secret application constants.
 *
 * Rule 05_RULES.md §9: "No hidden magic numbers; configuration is named and
 * versioned." Values that the owner must be able to change at runtime (fee rules,
 * margin thresholds, budgets) live in `application_settings` in the database —
 * these are only the structural defaults and hard limits.
 */

export const APP_NAME = 'MobileShop OS';

/** API version prefix. Bump only for a breaking contract change (13_ §20). */
export const API_VERSION = 'v1';

/** Header carrying the correlation/request ID through every layer and log line. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Header carrying a client-generated key that makes a write safely retryable (13_ §12). */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Pagination defaults and hard cap — the cap prevents a client from asking for the whole table. */
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE: 1,
});

/** Deterministic reorder engine version. Stored on every run (13_ §18). */
export const RECOMMENDATION_ALGORITHM_VERSION = 'v1.0.0';

/**
 * Recency weights for average daily sales (09_ANALYTICS §3).
 *
 * The source document lists three terms but names `units_sold_previous_30` twice,
 * which would double-count one window and ignore days 61-90 entirely. Resolved as
 * three distinct consecutive 30-day windows (see docs/ASSUMPTIONS.md ASM-002),
 * consistent with the 7/30/90-day metrics required in 01_PRD.md §5.10.
 */
export const ADS_WINDOW_WEIGHTS = Object.freeze({
  /** Days 1-30 (most recent). */
  LAST_30: 0.5,
  /** Days 31-60. */
  PREVIOUS_30: 0.3,
  /** Days 61-90. */
  PRIOR_30: 0.2,
});

/** Priority score weights, 0-100 scale (09_ANALYTICS §4). */
export const RECOMMENDATION_SCORE_WEIGHTS = Object.freeze({
  SALES_VELOCITY: 0.3,
  QUALIFIED_UNMET_DEMAND: 0.25,
  EXPECTED_GROSS_PROFIT: 0.15,
  STOCKOUT_SEVERITY: 0.1,
  RECENCY_TREND: 0.1,
  SUPPLIER_RELIABILITY: 0.05,
  STRATEGIC_ATTACHMENT: 0.05,
});

/** Conversion weights for unmet demand by outcome (09_ANALYTICS §3). Owner-configurable. */
export const DEMAND_CONVERSION_WEIGHTS = Object.freeze({
  EXPLICIT_READY_TO_BUY_STOCKOUT: 1.0,
  REQUESTED_QUOTATION_FOLLOW_UP: 0.7,
  PRICE_TOO_HIGH: 0.25,
  CASUAL_INQUIRY: 0.15,
  DUPLICATE_SAME_CUSTOMER: 0.15,
  INVALID_OR_FRAUDULENT: 0.0,
});

/** Confidence bands (09_ANALYTICS §6). */
export const CONFIDENCE_THRESHOLDS = Object.freeze({
  HIGH_MIN: 75,
  MEDIUM_MIN: 50,
});

/** Structural limits. */
export const LIMITS = Object.freeze({
  MAX_SALE_LINES: 200,
  MAX_BULK_IMEI_ROWS: 500,
  MAX_SEARCH_TERM_LENGTH: 120,
  MIN_PASSWORD_LENGTH: 12,
  MAX_PASSWORD_LENGTH: 256,
  MAX_REASON_LENGTH: 500,
  MAX_NOTE_LENGTH: 2000,
});

/** Performance targets from 01_PRD.md §7 — asserted in tests, not merely aspirational. */
export const PERFORMANCE_TARGETS = Object.freeze({
  PRODUCT_SEARCH_MS: 500,
  SALE_POSTING_MS: 2000,
});

/** Number sequence keys for human-facing document numbers (13_ §19). */
export const SEQUENCE_KEYS = Object.freeze({
  SALE_INVOICE: 'sale_invoice',
  PURCHASE_ORDER: 'purchase_order',
  GOODS_RECEIPT: 'goods_receipt',
  RETURN: 'return',
  EXTERNAL_TRANSACTION: 'external_transaction',
  EXPENSE: 'expense',
  CASH_SESSION: 'cash_session',
  STOCK_ADJUSTMENT: 'stock_adjustment',
});
