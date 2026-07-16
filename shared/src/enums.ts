/**
 * Controlled vocabularies for MobileShop OS.
 *
 * These mirror the approved blueprint exactly:
 *  - serialized stock states: 05_RULES.md §3
 *  - movement types:          04_DATA_MODEL.md §5
 *  - purchase statuses:       01_PRD.md §5.3
 *  - demand outcomes:         01_PRD.md §5.5
 *  - demand statuses:         13_ §15
 *  - cash session statuses:   13_ §14
 *  - fee calculation modes:   13_ §13
 *
 * Values are snake_case and are persisted, so renaming one is a migration.
 */

/** Serialized device lifecycle. A unit has exactly one active state (05_RULES §1.2). */
export const SERIALIZED_STOCK_STATES = [
  "pending_verification",
  "quarantined",
  "available",
  "reserved",
  "sold",
  "returned_inspection",
  "defective",
  "supplier_warranty",
  "customer_warranty",
  "repair",
  "written_off",
  "purchase_returned",
] as const;
export type SerializedStockState = (typeof SERIALIZED_STOCK_STATES)[number];

/**
 * Allowed serialized state transitions.
 *
 * Enforces 05_RULES §3: "A returned unit cannot jump directly to available without
 * inspection" — `sold` leads only to `returned_inspection`, never straight to
 * `available`. Terminal states have no outgoing transitions.
 */
export const SERIALIZED_STATE_TRANSITIONS: Readonly<
  Record<SerializedStockState, readonly SerializedStockState[]>
> = Object.freeze({
  pending_verification: [
    "quarantined",
    "available",
    "defective",
    "written_off",
    "purchase_returned",
  ],
  quarantined: [
    "available",
    "defective",
    "written_off",
    "purchase_returned",
    "pending_verification",
  ],
  available: [
    "reserved",
    "sold",
    "defective",
    "repair",
    "written_off",
    "quarantined",
    "purchase_returned",
  ],
  reserved: ["available", "sold", "defective", "quarantined"],
  sold: ["returned_inspection"],
  returned_inspection: [
    "available",
    "defective",
    "supplier_warranty",
    "repair",
    "written_off",
    "quarantined",
  ],
  defective: [
    "supplier_warranty",
    "repair",
    "written_off",
    "purchase_returned",
    "returned_inspection",
  ],
  supplier_warranty: [
    "available",
    "defective",
    "written_off",
    "purchase_returned",
    "repair",
  ],
  customer_warranty: ["repair", "defective", "available", "written_off"],
  repair: [
    "available",
    "defective",
    "written_off",
    "customer_warranty",
    "returned_inspection",
  ],
  written_off: [],
  purchase_returned: [],
});

/** States in which a unit may be added to a cart and sold. */
export const SALEABLE_STOCK_STATES: readonly SerializedStockState[] = [
  "available",
];

/** States that count as physically on hand for valuation. */
export const ON_HAND_STOCK_STATES: readonly SerializedStockState[] = [
  "pending_verification",
  "quarantined",
  "available",
  "reserved",
  "returned_inspection",
  "defective",
  "repair",
];

export function isTransitionAllowed(
  from: SerializedStockState,
  to: SerializedStockState,
): boolean {
  return SERIALIZED_STATE_TRANSITIONS[from].includes(to);
}

/** Inventory movement ledger types (04_DATA_MODEL.md §5). */
export const MOVEMENT_TYPES = [
  "purchase_receive",
  "sale",
  "sale_return",
  "purchase_return",
  "transfer_out",
  "transfer_in",
  "reserve",
  "release",
  "adjustment_in",
  "adjustment_out",
  "damage",
  "write_off",
  "repair_issue",
  "repair_return",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * Sign each movement type applies to on-hand quantity.
 * `reserve`/`release` move quantity between available and reserved without
 * changing on-hand, so they are 0 here.
 */
export const MOVEMENT_ON_HAND_SIGN: Readonly<Record<MovementType, -1 | 0 | 1>> =
  Object.freeze({
    purchase_receive: 1,
    sale: -1,
    sale_return: 1,
    purchase_return: -1,
    transfer_out: -1,
    transfer_in: 1,
    reserve: 0,
    release: 0,
    adjustment_in: 1,
    adjustment_out: -1,
    damage: -1,
    write_off: -1,
    repair_issue: -1,
    repair_return: 1,
  });

/** Physical/commercial condition (01_PRD.md §5.2). */
export const PRODUCT_CONDITIONS = [
  "new",
  "used",
  "open_box",
  "refurbished",
] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

/**
 * PTA (Pakistan Telecommunication Authority) registration status.
 * Recorded as configurable data only — no compliance behavior is inferred or
 * automated here (13_ §2: "Do not invent legal, PTA, FBR ... behavior").
 */
export const PTA_STATUSES = [
  "pta_approved",
  "non_pta",
  "pta_pending",
  "not_applicable",
  "unknown",
] as const;
export type PtaStatus = (typeof PTA_STATUSES)[number];

export const POLICE_VERIFICATION_STATUSES = [
  "not_required",
  "pending",
  "cleared",
  "flagged",
  "unknown",
] as const;
export type PoliceVerificationStatus =
  (typeof POLICE_VERIFICATION_STATUSES)[number];

/** How a product's stock is tracked. Cannot change once transactions exist (05_RULES §2). */
export const TRACKING_TYPES = ["serialized", "quantity"] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const WARRANTY_TYPES = [
  "official",
  "local",
  "shop",
  "none",
  "supplier",
] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];

/** Purchase order lifecycle (01_PRD.md §5.3). */
export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "approved",
  "ordered",
  "partially_received",
  "received",
  "closed",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

/**
 * Allowed purchase-order lifecycle moves.
 *
 * Receiving may follow approval directly (the explicit `ordered` step records
 * supplier dispatch when the shop uses it). A partially received order can be
 * closed short, but it cannot be cancelled because stock has already arrived.
 */
export const PURCHASE_ORDER_STATUS_TRANSITIONS: Readonly<
  Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>
> = Object.freeze({
  draft: ["approved", "cancelled"],
  approved: ["ordered", "partially_received", "received", "cancelled"],
  ordered: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "closed"],
  received: ["closed"],
  closed: [],
  cancelled: [],
});

export function isPurchaseOrderTransitionAllowed(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return PURCHASE_ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export const SALE_STATUSES = [
  "draft",
  "posted",
  "cancelled",
  "partially_returned",
  "returned",
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "digital_wallet",
  "credit",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RETURN_STATUSES = ["draft", "posted", "cancelled"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/** What physically happens to a returned item (01_PRD.md §5.8). */
export const RETURN_OUTCOMES = [
  "restock",
  "quarantine",
  "supplier_warranty",
  "write_off",
  "repair",
] as const;
export type ReturnOutcome = (typeof RETURN_OUTCOMES)[number];

/** Cash session lifecycle (13_ §14). */
export const CASH_SESSION_STATUSES = [
  "open",
  "closing_pending",
  "closed",
  "reviewed",
  "reopened_with_authorization",
] as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number];

/** Customer demand pipeline status (13_ §15). */
export const DEMAND_STATUSES = [
  "new",
  "contacted",
  "sourcing",
  "available",
  "customer_notified",
  "converted_to_sale",
  "not_interested",
  "closed",
] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

/** Why a request did or did not become a sale (01_PRD.md §5.5). */
export const DEMAND_OUTCOMES = [
  "sold_immediately",
  "reserved",
  "quotation_sent",
  "unavailable",
  "price_too_high",
  "customer_postponed",
  "bought_elsewhere",
  "incompatible_requirement",
  "invalid_or_fraudulent",
  "unknown",
] as const;
export type DemandOutcome = (typeof DEMAND_OUTCOMES)[number];

export const DEMAND_URGENCIES = [
  "immediate",
  "within_week",
  "within_month",
  "flexible",
] as const;
export type DemandUrgency = (typeof DEMAND_URGENCIES)[number];

export const DEMAND_CHANNELS = [
  "walk_in",
  "phone",
  "whatsapp",
  "referral",
  "other",
] as const;
export type DemandChannel = (typeof DEMAND_CHANNELS)[number];

/**
 * External money service direction (13_ §13).
 *
 * The approved prototype (assets/digital.js) names these SENT_FROM_SHOP and
 * RECEIVED_INTO_SHOP, describing the movement of the shop's provider float:
 *   send       = customer sends money  -> shop float goes OUT, cash comes IN
 *   withdrawal = customer takes money  -> shop float comes IN, cash goes OUT
 * The cash leg is never inferred from this; it is configured explicitly per rule
 * (13_ §13: "Do not assume every send or withdrawal affects physical cash the same way").
 */
export const EXTERNAL_SERVICE_TYPES = ["send", "withdrawal"] as const;
export type ExternalServiceType = (typeof EXTERNAL_SERVICE_TYPES)[number];

/** Prototype direction codes, retained for import/mapping fidelity. */
export const EXTERNAL_DIRECTION_BY_SERVICE_TYPE: Readonly<
  Record<ExternalServiceType, string>
> = Object.freeze({
  send: "SENT_FROM_SHOP",
  withdrawal: "RECEIVED_INTO_SHOP",
});

/**
 * Provider float/balance accounts tracked per service (prototype digital-balances.html).
 * Seeded as settings, not hardcoded behavior — providers are configurable.
 */
export const EXTERNAL_BALANCE_ACCOUNTS = [
  "physical_cash",
  "jazzcash_float",
  "easypaisa_float",
  "bank_balance",
  "utility_bill_float",
  "jazz_load_float",
  "zong_load_float",
] as const;
export type ExternalBalanceAccount = (typeof EXTERNAL_BALANCE_ACCOUNTS)[number];

/**
 * Fee calculation modes (13_ §13).
 *  - fixed:                a flat fee regardless of amount
 *  - proportional_block:   fee pro-rated across the block (partial blocks charged pro-rata)
 *  - per_started_block:    every started block charged in full (PKR 1,500 -> 2 blocks)
 *  - percentage:           a percentage of the principal
 */
export const FEE_CALCULATION_MODES = [
  "fixed",
  "proportional_block",
  "per_started_block",
  "percentage",
] as const;
export type FeeCalculationMode = (typeof FEE_CALCULATION_MODES)[number];

/** Direction cash physically moves in the drawer. Explicit and configurable (13_ §13). */
export const CASH_DIRECTIONS = ["in", "out", "none"] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

/**
 * External transaction lifecycle.
 *
 * Mirrors the approved prototype's vocabulary (SUCCESSFUL/PENDING/FAILED/REVERSED/
 * DISPUTED), plus `draft` for the pre-posting step. `pending` and `disputed` are
 * real operational states: the provider transaction may not settle immediately,
 * and the shop must be able to record that without faking success.
 */
export const EXTERNAL_TRANSACTION_STATUSES = [
  "draft",
  "successful",
  "pending",
  "failed",
  "reversed",
  "disputed",
] as const;
export type ExternalTransactionStatus =
  (typeof EXTERNAL_TRANSACTION_STATUSES)[number];

/** Statuses whose fee/profit counts toward reported service revenue. */
export const EXTERNAL_REVENUE_STATUSES: readonly ExternalTransactionStatus[] = [
  "successful",
];

/** Financial ledger entry direction. */
export const LEDGER_DIRECTIONS = ["debit", "credit"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

/** What produced a financial entry — every entry links to its source (13_ §16). */
export const LEDGER_SOURCE_TYPES = [
  "sale",
  "return",
  "refund",
  "payment",
  "external_transaction",
  "expense",
  "supplier_payment",
  "receivable_payment",
  "goods_receipt",
  "purchase_return",
  "owner_capital",
  "owner_withdrawal",
  "cash_movement",
  "stock_adjustment",
  "opening_balance",
] as const;
export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

export const ADJUSTMENT_REASONS = [
  "stock_count_correction",
  "damage",
  "theft_or_loss",
  "expiry",
  "supplier_shortage",
  "data_entry_error",
  "opening_balance",
  "other",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/** Recommendation confidence bands (09_ANALYTICS §6): High 75-100, Medium 50-74, Low <50. */
export const CONFIDENCE_LABELS = ["low", "medium", "high"] as const;
export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];

export function confidenceLabelFor(score: number): ConfidenceLabel {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

/** Owner decision on a recommendation (04_DATA_MODEL §9). */
export const RECOMMENDATION_DECISIONS = [
  "accepted",
  "reduced",
  "increased",
  "deferred",
  "rejected",
] as const;
export type RecommendationDecisionType =
  (typeof RECOMMENDATION_DECISIONS)[number];
