import { describe, expect, it } from "vitest";
import {
  REPORT_DEFINITIONS,
  REPORT_GROUP_ORDER,
  canPreviewReport,
  reportCapabilities,
  reportRangeFrom,
  reportRangeQuery,
  reportsByGroup,
} from "./reports-state";

describe("reports workspace state", () => {
  it("derives view, financial and export capabilities independently", () => {
    expect(reportCapabilities(["reports.view", "reports.export"])).toEqual({
      canView: true,
      canViewFinancial: false,
      canExport: true,
    });
  });

  it("routes valid ranges while preserving unrelated query state", () => {
    expect(reportRangeFrom(new URLSearchParams("range=7d"))).toBe("7d");
    expect(reportRangeFrom(new URLSearchParams("range=unknown"))).toBe("month");
    const query = reportRangeQuery(
      new URLSearchParams("source=dashboard"),
      "30d",
    );
    expect(new URLSearchParams(query).get("range")).toBe("30d");
    expect(new URLSearchParams(query).get("source")).toBe("dashboard");
    expect(
      new URLSearchParams(
        reportRangeQuery(new URLSearchParams(query), "month"),
      ).has("range"),
    ).toBe(false);
  });

  it("keeps every planned prototype report in its ordered group", () => {
    const grouped = reportsByGroup();
    expect([...grouped.keys()]).toEqual(REPORT_GROUP_ORDER);
    expect([...grouped.values()].flatMap((reports) => reports).length).toBe(
      REPORT_DEFINITIONS.length,
    );
    expect(grouped.get("Digital Services")).toHaveLength(5);
  });

  it("locks financial report previews without the sensitive grant", () => {
    const financial = REPORT_DEFINITIONS.find(
      (report) => report.name === "Daily sales & profit",
    );
    const operational = REPORT_DEFINITIONS.find(
      (report) => report.name === "Audit report",
    );
    expect(financial).toBeDefined();
    expect(operational).toBeDefined();
    expect(
      canPreviewReport(financial!, reportCapabilities(["reports.view"])),
    ).toBe(false);
    expect(
      canPreviewReport(operational!, reportCapabilities(["reports.view"])),
    ).toBe(true);
  });
});
