"use client";

import { formatMoney, toMinor } from "@mobileshop/shared";
import type { JSX, ReactNode, Ref } from "react";
import { AlertTriangleIcon } from "@/components/ui/icons";
import type { ApiError } from "@/lib/api/client";
import { purchasingErrorMessage, titleCase } from "./purchasing-state";

export const controlClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70 focus:border-accent disabled:cursor-not-allowed disabled:opacity-55";
export const labelClass = "block text-xs font-semibold text-ink-subtle";
export const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-55";
export const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50";
export const rowActionClass =
  "inline-flex min-h-8 items-center gap-1 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45";

export function moneyText(value: number): string {
  return formatMoney(toMinor(value));
}

export function dateText(value: string | null): string {
  if (value === null) return "—";
  const instant = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(instant.getTime())) return value;
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(instant);
}

export function StatusBadge({
  value,
}: {
  readonly value: string;
}): JSX.Element {
  const tone =
    value === "received" || value === "paid" || value === "available"
      ? "bg-positive-soft text-positive"
      : value === "cancelled" || value === "quarantined"
        ? "bg-negative-soft text-negative"
        : value === "partially_received" || value === "partially_paid"
          ? "bg-warning-soft text-warning"
          : value === "approved" || value === "ordered"
            ? "bg-info-soft text-info"
            : "bg-surface-subtle text-ink-subtle";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${tone}`}
    >
      {titleCase(value)}
    </span>
  );
}

export interface FieldErrorControlProps {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid": boolean;
  readonly "aria-label": string;
}

export function fieldErrorControlProps(
  id: string,
  messages: readonly string[] | undefined,
  label: string,
): FieldErrorControlProps {
  const invalid = messages !== undefined && messages.length > 0;
  return {
    "aria-invalid": invalid,
    "aria-label": label,
    ...(invalid ? { "aria-describedby": id } : {}),
  };
}

export function focusValidationSummary(
  target: Pick<HTMLElement, "focus"> | null,
): void {
  target?.focus();
}

export function FieldError({
  id,
  messages,
}: {
  readonly id: string;
  readonly messages?: readonly string[] | undefined;
}): JSX.Element {
  const hasMessages = messages !== undefined && messages.length > 0;
  return (
    <span
      aria-atomic="true"
      aria-live="polite"
      className={
        hasMessages
          ? "mt-1 block space-y-0.5 text-xs font-normal text-negative"
          : "sr-only"
      }
      id={id}
    >
      {(messages ?? []).map((message) => (
        <span className="block" key={message}>
          {message}
        </span>
      ))}
    </span>
  );
}

export function ValidationSummary({
  focusRef,
  id,
  messages,
  title,
}: {
  readonly focusRef?: Ref<HTMLDivElement> | undefined;
  readonly id: string;
  readonly messages: readonly string[];
  readonly title: string;
}): JSX.Element | null {
  if (messages.length === 0) return null;
  return (
    <div
      aria-atomic="true"
      className="rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
      id={id}
      ref={focusRef}
      role="alert"
      tabIndex={-1}
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

export function MutationErrorBanner({
  error,
  title,
}: {
  readonly error: ApiError;
  readonly title: string;
}): JSX.Element {
  return (
    <div
      className="mb-4 flex items-start gap-2.5 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
      role="alert"
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5">{purchasingErrorMessage(error)}</p>
        {error.requestId === undefined ? null : (
          <p className="mt-1 font-mono text-xs">Ref: {error.requestId}</p>
        )}
      </div>
    </div>
  );
}

export function SummaryItem({
  label,
  children,
  strong = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly strong?: boolean;
}): JSX.Element {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm ${strong ? "font-bold text-ink" : "text-ink"}`}
      >
        {children}
      </dd>
    </div>
  );
}

export function PageControls({
  page,
  totalPages,
  total,
  onPage,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
}): JSX.Element | null {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-muted">
      <p>
        {total.toLocaleString("en-PK")} record{total === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-2">
        <button
          className={rowActionClass}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          type="button"
        >
          Previous
        </button>
        <span className="min-w-20 text-center">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <button
          className={rowActionClass}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
