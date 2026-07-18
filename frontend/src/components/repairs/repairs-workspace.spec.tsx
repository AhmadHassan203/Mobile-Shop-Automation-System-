import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RepairKanban } from "./repairs-workspace";

describe("repair kanban UI", () => {
  it("renders the exact five stages with honest unavailable counts", () => {
    const html = renderToStaticMarkup(
      <RepairKanban focusedStage={null} onBook={vi.fn()} />,
    );
    for (const stage of [
      "Received",
      "Awaiting parts",
      "In repair",
      "Ready",
      "Delivered",
    ]) {
      expect(html).toContain(stage);
    }
    expect(html.match(/data-stage=/gu)).toHaveLength(5);
    expect(html).toContain("New intake list unavailable");
    expect(html).toContain("Pickup queue unavailable");
    expect(html).toContain("Book repair");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("REP-018");
  });

  it("visually focuses only the requested stage", () => {
    const html = renderToStaticMarkup(
      <RepairKanban focusedStage="ready" onBook={vi.fn()} />,
    );
    expect(html).toContain('id="repair-stage-ready"');
    expect(
      html.match(/shadow-\[0_0_0_3px_var\(--accent-soft\)\]/gu),
    ).toHaveLength(1);
  });
});
