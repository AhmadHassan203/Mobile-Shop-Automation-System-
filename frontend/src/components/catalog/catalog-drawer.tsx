"use client";

import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";

/**
 * Everything the browser can focus inside the panel. Disabled controls and
 * programmatic-only targets (`tabindex="-1"`, including the panel itself) are
 * excluded so the Tab cycle matches what a keyboard user actually reaches.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export interface CatalogDrawerProps {
  /** Id given to the heading; also the panel's `aria-labelledby` target. */
  readonly titleId: string;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

/**
 * The shared right-side slide-over used by every catalog editor.
 *
 * It is deliberately presentational: it owns modal semantics (labelling, focus
 * trap, Escape, backdrop dismissal, scroll lock) and nothing else. Callers that
 * must not close mid-request — a form that is submitting, for example — guard
 * inside their own `onClose`, so the drawer never has to know about their state.
 *
 * A footer control can drive a form rendered in `children` by pointing at it:
 * `<form id="x">` in the body, `<button type="submit" form="x">` in the footer.
 */
export function CatalogDrawer({
  titleId,
  title,
  description,
  onClose,
  children,
  footer,
}: CatalogDrawerProps): JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Returning focus to the trigger keeps keyboard position after closing.
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        {...(description === undefined
          ? {}
          : { "aria-describedby": descriptionId })}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink" id={titleId}>
              {title}
            </h2>
            {description === undefined ? null : (
              <p className="mt-0.5 text-xs text-ink-muted" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <button
            aria-label={`Close ${title}`}
            className="ml-auto grid size-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer === undefined ? null : (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
}
