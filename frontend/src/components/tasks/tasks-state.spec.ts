import { describe, expect, it } from "vitest";
import {
  TASK_PERMISSION_DISCLOSURE,
  taskFilterFrom,
  taskFilterQuery,
  validateFollowUpDraft,
} from "./tasks-state";

describe("tasks workspace state", () => {
  it("accepts known filters and defaults unknown input", () => {
    expect(taskFilterFrom(new URLSearchParams("filter=high"))).toBe("high");
    expect(taskFilterFrom(new URLSearchParams("filter=nope"))).toBe("all");
  });

  it("preserves unrelated query state and removes the default filter", () => {
    const query = taskFilterQuery(
      new URLSearchParams("source=dashboard"),
      "today",
    );
    expect(new URLSearchParams(query).get("filter")).toBe("today");
    expect(new URLSearchParams(query).get("source")).toBe("dashboard");
    expect(
      new URLSearchParams(
        taskFilterQuery(new URLSearchParams(query), "all"),
      ).has("filter"),
    ).toBe(false);
  });

  it("validates local follow-up capture without claiming persistence", () => {
    expect(
      validateFollowUpDraft({
        title: "Call customer when stock lands",
        workspace: "demand",
        priority: "high",
        due: "2026-07-20",
        context: "Customer has consented.",
      }),
    ).toEqual({});
    expect(
      validateFollowUpDraft({
        title: "x",
        workspace: "",
        priority: "medium",
        due: "tomorrow",
        context: "x".repeat(501),
      }),
    ).toEqual({
      title: "Describe the follow-up.",
      workspace: "Choose the source workspace.",
      due: "Choose a valid due date.",
      context: "Context must be 500 characters or less.",
    });
  });

  it("discloses the missing task authorization contract", () => {
    expect(TASK_PERMISSION_DISCLOSURE).toContain(
      "task permissions are not defined",
    );
    expect(TASK_PERMISSION_DISCLOSURE).toContain("task.view");
    expect(TASK_PERMISSION_DISCLOSURE).toContain("task.manage");
  });
});
