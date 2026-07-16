import { afterEach, describe, expect, it, vi } from "vitest";
import { REPAIR_API_GAPS, repairApiGap } from "./repairs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("repairs unavailable API boundary", () => {
  it("registers every deferred workflow dependency without making a request", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    expect(REPAIR_API_GAPS.map((gap) => gap.surface)).toEqual([
      "authorization",
      "queue",
      "booking",
      "workflow",
      "notification",
    ]);
    expect(repairApiGap("queue")).toMatchObject({
      requiredContract: "GET /repairs · GET /repairs/:id",
      status: "deferred",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose a fake success or available status", () => {
    expect(
      REPAIR_API_GAPS.every(
        (gap) =>
          gap.status === "deferred" || gap.status === "not_implemented",
      ),
    ).toBe(true);
    expect(JSON.stringify(REPAIR_API_GAPS)).not.toContain('"available"');
    expect(JSON.stringify(REPAIR_API_GAPS)).not.toContain("success");
  });
});
