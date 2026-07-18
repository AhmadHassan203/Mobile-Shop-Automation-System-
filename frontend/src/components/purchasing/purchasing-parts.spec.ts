import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FieldError,
  ValidationSummary,
  fieldErrorControlProps,
  focusValidationSummary,
} from "./purchasing-parts";

describe("purchasing validation accessibility", () => {
  it("links invalid controls to their stable field-error region", () => {
    expect(
      fieldErrorControlProps("supplier-name-error", undefined, "Supplier name"),
    ).toEqual({
      "aria-invalid": false,
      "aria-label": "Supplier name",
    });
    expect(
      fieldErrorControlProps(
        "supplier-name-error",
        ["Enter a supplier name."],
        "Supplier name",
      ),
    ).toEqual({
      "aria-describedby": "supplier-name-error",
      "aria-invalid": true,
      "aria-label": "Supplier name",
    });
  });

  it("composes a stable control name and field-error description", () => {
    const messages = ["Enter a supplier name."];
    const html = renderToStaticMarkup(
      createElement(
        "label",
        null,
        "Supplier name",
        createElement("input", {
          ...fieldErrorControlProps(
            "supplier-name-error",
            messages,
            "Supplier name",
          ),
        }),
        createElement(FieldError, {
          id: "supplier-name-error",
          messages,
        }),
      ),
    );

    expect(html).toContain('aria-label="Supplier name"');
    expect(html).toContain('aria-describedby="supplier-name-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="supplier-name-error"');
  });

  it("keeps an atomic polite field-error region mounted before errors arrive", () => {
    const empty = renderToStaticMarkup(
      createElement(FieldError, {
        id: "supplier-name-error",
      }),
    );
    const invalid = renderToStaticMarkup(
      createElement(FieldError, {
        id: "supplier-name-error",
        messages: ["Enter a supplier name."],
      }),
    );

    expect(empty).toContain('id="supplier-name-error"');
    expect(empty).toContain('aria-live="polite"');
    expect(empty).toContain('aria-atomic="true"');
    expect(invalid).toContain("Enter a supplier name.");
  });

  it("renders failed validation as an announced programmatic focus target", () => {
    const html = renderToStaticMarkup(
      createElement(ValidationSummary, {
        id: "supplier-validation-summary",
        messages: ["Enter a supplier code.", "Enter a supplier name."],
        title: "Review the supplier before saving",
      }),
    );

    expect(html).toContain('id="supplier-validation-summary"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Review the supplier before saving");
    expect(html).toContain("Enter a supplier code.");
    expect(html).toContain("Enter a supplier name.");
  });

  it("moves focus to the validation summary target", () => {
    const focus = vi.fn();

    focusValidationSummary({ focus });
    focusValidationSummary(null);

    expect(focus).toHaveBeenCalledOnce();
  });
});
