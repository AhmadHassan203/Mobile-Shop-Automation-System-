import { describe, expect, it } from "vitest";
import {
  budgetFillPercent,
  intelligenceCapabilities,
  nextRecommendationExpanded,
  recommendationDecisionLabel,
} from "./intelligence-state";

describe("intelligence workspace state", () => {
  it("keeps view, decision, purchasing and inventory grants independent", () => {
    expect(
      intelligenceCapabilities([
        "recommendations.view",
        "recommendations.decide",
        "inventory.view",
      ]),
    ).toEqual({
      canView: true,
      canDecide: true,
      canCreatePurchaseOrders: false,
      canViewInventory: true,
      canViewFinancialReports: false,
    });
  });

  it("clamps budget fill and handles unavailable totals safely", () => {
    expect(budgetFillPercent(250, 1000)).toBe(25);
    expect(budgetFillPercent(1200, 1000)).toBe(100);
    expect(budgetFillPercent(-20, 1000)).toBe(0);
    expect(budgetFillPercent(20, 0)).toBe(0);
    expect(budgetFillPercent(Number.NaN, 1000)).toBe(0);
  });

  it("toggles expanded recommendation ids without mutating the input", () => {
    const current = ["R-01"];
    expect(nextRecommendationExpanded(current, "R-02")).toEqual([
      "R-01",
      "R-02",
    ]);
    expect(nextRecommendationExpanded(current, "R-01")).toEqual([]);
    expect(current).toEqual(["R-01"]);
  });

  it("uses stable user-facing decision labels", () => {
    expect(recommendationDecisionLabel("not_in_plan")).toBe("Not in plan");
    expect(recommendationDecisionLabel("accepted")).toBe("Accepted");
    expect(recommendationDecisionLabel("rejected")).toBe("Rejected");
  });
});
