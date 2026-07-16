import { PERMISSIONS } from "@mobileshop/shared";

export const DIGITAL_SERVICES = [
  "JazzCash",
  "Easypaisa",
  "Bank Transfer",
  "Utility Bill",
  "Jazz Load",
  "Zong Load",
  "Other",
] as const;
export type DigitalService = (typeof DIGITAL_SERVICES)[number];

export const DIGITAL_DIRECTIONS = [
  "SENT_FROM_SHOP",
  "RECEIVED_INTO_SHOP",
] as const;
export type DigitalDirection = (typeof DIGITAL_DIRECTIONS)[number];

export const DIGITAL_STATUSES = [
  "SUCCESSFUL",
  "PENDING",
  "FAILED",
  "DISPUTED",
] as const;
export type DigitalStatus = (typeof DIGITAL_STATUSES)[number];

export const FEE_COLLECTION_METHODS = [
  "Deduct from Customer Payout",
  "Collect Separately",
] as const;
export type FeeCollectionMethod = (typeof FEE_COLLECTION_METHODS)[number];

export const BALANCE_ACCOUNTS = [
  "Physical Cash",
  "JazzCash",
  "Easypaisa",
  "Bank Transfer",
  "Utility Bill",
  "Jazz Load",
  "Zong Load",
] as const;

export const COMMISSION_GROUPS = [
  "service",
  "direction",
  "cashier",
  "day",
  "week",
  "month",
] as const;
export type CommissionGroup = (typeof COMMISSION_GROUPS)[number];

export interface DigitalCapabilities {
  readonly canView: boolean;
  readonly canRecord: boolean;
  readonly canReverse: boolean;
  readonly canViewFeeRules: boolean;
  readonly canManageFeeRules: boolean;
}

export function digitalCapabilities(
  permissions: readonly string[] | undefined,
): DigitalCapabilities {
  const granted = new Set(permissions ?? []);
  return {
    canView: granted.has(PERMISSIONS.EXTERNAL_SERVICES_VIEW),
    canRecord: granted.has(PERMISSIONS.EXTERNAL_SERVICES_RECORD),
    canReverse: granted.has(PERMISSIONS.EXTERNAL_SERVICES_REVERSE),
    canViewFeeRules: granted.has(PERMISSIONS.EXTERNAL_FEE_RULES_VIEW),
    canManageFeeRules: granted.has(PERMISSIONS.EXTERNAL_FEE_RULES_MANAGE),
  };
}

export interface DigitalServiceAvailability {
  readonly transactionsRead: boolean;
  readonly transactionRecord: boolean;
  readonly transactionStatusMutation: boolean;
  readonly balancesRead: boolean;
  readonly commissionRead: boolean;
  readonly reconciliationRead: boolean;
  readonly reconciliationSave: boolean;
  readonly feeRulesRead: boolean;
}

/** Flip only when a strict server client for the named boundary exists. */
export const DIGITAL_SERVICE_AVAILABILITY: DigitalServiceAvailability =
  Object.freeze({
    transactionsRead: false,
    transactionRecord: false,
    transactionStatusMutation: false,
    balancesRead: false,
    commissionRead: false,
    reconciliationRead: false,
    reconciliationSave: false,
    feeRulesRead: false,
  });

export type ServiceFieldKind = "wallet" | "bank" | "bill" | "load" | "other";

export function serviceFieldKind(service: DigitalService): ServiceFieldKind {
  if (service === "JazzCash" || service === "Easypaisa") return "wallet";
  if (service === "Bank Transfer") return "bank";
  if (service === "Utility Bill") return "bill";
  if (service === "Jazz Load" || service === "Zong Load") return "load";
  return "other";
}

export interface DigitalTransactionDraft {
  readonly service: DigitalService;
  readonly status: DigitalStatus;
  readonly direction: DigitalDirection;
  readonly principalAmount: string;
  readonly feeCollectionMethod: FeeCollectionMethod;
  readonly providerTransactionId: string;
  readonly cashierName: string;
}

export function transactionReviewBlockers(
  draft: DigitalTransactionDraft,
  capabilities: DigitalCapabilities,
  services: DigitalServiceAvailability,
): readonly string[] {
  const blockers: string[] = [];
  const amount = Number(draft.principalAmount);
  if (
    draft.principalAmount.trim().length === 0 ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    blockers.push("Enter a principal amount greater than zero.");
  }
  if (
    draft.status === "SUCCESSFUL" &&
    draft.providerTransactionId.trim().length === 0
  ) {
    blockers.push("Successful transactions require a Provider Transaction ID.");
  }
  if (draft.cashierName.trim().length === 0) {
    blockers.push("Cashier is required.");
  }
  if (!capabilities.canRecord) {
    blockers.push("The external_services.record permission is required.");
  }
  if (!capabilities.canViewFeeRules) {
    blockers.push(
      "The external_fee_rules.view permission is required for fee preview.",
    );
  } else if (!services.feeRulesRead) {
    blockers.push("The external fee-rule API has not been implemented yet.");
  }
  if (!services.transactionRecord) {
    blockers.push(
      "The external-service transaction persistence API has not been implemented yet.",
    );
  }
  return blockers;
}

export interface DigitalTransactionSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly service: DigitalService;
  readonly direction: DigitalDirection;
  readonly status: DigitalStatus | "REVERSED";
  readonly cashierName: string;
}

export interface DigitalHistoryFilters {
  readonly date: string;
  readonly service: DigitalService | "";
  readonly direction: DigitalDirection | "";
  readonly status: DigitalTransactionSummary["status"] | "";
  readonly cashier: string;
}

export function filterDigitalTransactions(
  rows: readonly DigitalTransactionSummary[],
  filters: DigitalHistoryFilters,
): readonly DigitalTransactionSummary[] {
  const cashier = filters.cashier.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (
      filters.date.length > 0 &&
      row.createdAt.slice(0, 10) !== filters.date
    ) {
      return false;
    }
    if (filters.service.length > 0 && row.service !== filters.service) {
      return false;
    }
    if (filters.direction.length > 0 && row.direction !== filters.direction) {
      return false;
    }
    if (filters.status.length > 0 && row.status !== filters.status)
      return false;
    return (
      cashier.length === 0 ||
      row.cashierName.toLocaleLowerCase().includes(cashier)
    );
  });
}

export interface CountedBalanceInput {
  readonly account: (typeof BALANCE_ACCOUNTS)[number];
  readonly counted: string;
}

export interface ReconciliationReadiness {
  readonly expectedBalancesLoaded: boolean;
  readonly everyCountEntered: boolean;
  readonly canCalculateVariance: boolean;
  readonly canPersist: boolean;
}

export function reconciliationReadiness(
  expectedBalancesLoaded: boolean,
  counts: readonly CountedBalanceInput[],
  capabilities: DigitalCapabilities,
  services: DigitalServiceAvailability,
): ReconciliationReadiness {
  const everyCountEntered =
    counts.length === BALANCE_ACCOUNTS.length &&
    counts.every((count) => {
      const value = Number(count.counted);
      return (
        count.counted.trim().length > 0 && Number.isFinite(value) && value >= 0
      );
    });
  const canCalculateVariance = expectedBalancesLoaded && everyCountEntered;
  return {
    expectedBalancesLoaded,
    everyCountEntered,
    canCalculateVariance,
    canPersist:
      canCalculateVariance &&
      capabilities.canRecord &&
      services.reconciliationSave,
  };
}
