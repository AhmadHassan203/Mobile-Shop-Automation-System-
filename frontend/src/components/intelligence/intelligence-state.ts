import { PERMISSIONS } from "@mobileshop/shared";

export interface IntelligenceCapabilities {
  readonly canView: boolean;
  readonly canDecide: boolean;
  readonly canCreatePurchaseOrders: boolean;
  readonly canViewInventory: boolean;
  /** Trending products and top brands expose revenue, so they need this grant. */
  readonly canViewFinancialReports: boolean;
}

export type RecommendationDecision =
  "not_in_plan" | "in_plan" | "accepted" | "deferred" | "rejected";

export function intelligenceCapabilities(
  permissions: readonly string[] | undefined,
): IntelligenceCapabilities {
  const granted = permissions ?? [];
  return {
    canView: granted.includes(PERMISSIONS.RECOMMENDATIONS_VIEW),
    canDecide: granted.includes(PERMISSIONS.RECOMMENDATIONS_DECIDE),
    canCreatePurchaseOrders: granted.includes(PERMISSIONS.PURCHASES_CREATE),
    canViewInventory: granted.includes(PERMISSIONS.INVENTORY_VIEW),
    canViewFinancialReports: granted.includes(
      PERMISSIONS.REPORTS_VIEW_FINANCIAL,
    ),
  };
}

export function recommendationDecisionLabel(
  decision: RecommendationDecision,
): string {
  return {
    not_in_plan: "Not in plan",
    in_plan: "In plan",
    accepted: "Accepted",
    deferred: "Deferred",
    rejected: "Rejected",
  }[decision];
}

export function budgetFillPercent(selected: number, total: number): number {
  if (!Number.isFinite(selected) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (selected / total) * 100));
}

export function nextRecommendationExpanded(
  current: readonly string[],
  id: string,
): readonly string[] {
  return current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id];
}
