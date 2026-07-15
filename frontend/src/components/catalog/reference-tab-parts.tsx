"use client";

import { LIMITS } from "@mobileshop/shared";
import type { FormEvent, JSX, ReactNode } from "react";
import {
  AlertTriangleIcon,
  CloseIcon,
  SearchIcon,
} from "@/components/ui/icons";

/**
 * Presentation shared by the three catalog reference tabs and their editors.
 *
 * These deliberately carry no data or permission logic — they exist so the
 * category, brand and model surfaces stay pixel-identical to the product
 * catalog without triplicating its markup.
 */

export const controlClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent disabled:cursor-wait disabled:opacity-60";

const pagerButtonClass =
  "min-h-8 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45";

export const rowActionClass = pagerButtonClass;

export function ReferenceStatusPill({
  isActive,
}: {
  readonly isActive: boolean;
}): JSX.Element {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${
        isActive
          ? "bg-positive-soft text-positive"
          : "bg-surface-subtle text-ink-muted"
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export interface ReferenceSearchFormProps {
  readonly label: string;
  readonly placeholder: string;
  readonly defaultValue: string | undefined;
  readonly onSearch: (value: string | undefined) => void;
}

export function ReferenceSearchForm({
  label,
  placeholder,
  defaultValue,
  onSearch,
}: ReferenceSearchFormProps): JSX.Element {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    onSearch(
      typeof value === "string"
        ? value.trim().slice(0, LIMITS.MAX_SEARCH_TERM_LENGTH)
        : undefined,
    );
  };

  return (
    <form className="flex gap-2" onSubmit={submit} role="search">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
          defaultValue={defaultValue}
          maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
          name="q"
          placeholder={placeholder}
          type="search"
        />
      </label>
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
        type="submit"
      >
        <SearchIcon className="size-4" />
        <span className="hidden sm:inline">Search</span>
      </button>
    </form>
  );
}

export interface ReferenceSelectFilterProps {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string | undefined) => void;
  readonly children: ReactNode;
}

export function ReferenceSelectFilter({
  label,
  value,
  disabled = false,
  onChange,
  children,
}: ReferenceSelectFilterProps): JSX.Element {
  return (
    <label className="text-xs font-semibold text-ink-subtle">
      {label}
      <select
        className="mt-1.5 min-h-9 w-full rounded-control border border-line bg-surface px-2.5 text-xs text-ink"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || undefined)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

export function ReferenceStatusFilter({
  value,
  onChange,
}: {
  readonly value: boolean | undefined;
  readonly onChange: (value: string | undefined) => void;
}): JSX.Element {
  return (
    <ReferenceSelectFilter
      label="Status"
      onChange={onChange}
      value={value === undefined ? "" : String(value)}
    >
      <option value="">All statuses</option>
      <option value="true">Active</option>
      <option value="false">Inactive</option>
    </ReferenceSelectFilter>
  );
}

export interface ReferencePaginationFooterProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly busy: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

export function ReferencePaginationFooter({
  page,
  pageSize,
  total,
  totalPages,
  busy,
  onPrevious,
  onNext,
}: ReferencePaginationFooterProps): JSX.Element {
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-line-subtle px-4 py-3 sm:px-[1.125rem]">
      <p className="text-xs text-ink-muted">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}{" "}
        of {total}
      </p>
      <div className="ml-auto flex gap-2">
        <button
          className={pagerButtonClass}
          disabled={page <= 1 || busy}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        <span className="inline-flex min-h-8 items-center px-1 text-xs font-semibold text-ink-subtle">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <button
          className={pagerButtonClass}
          disabled={page >= totalPages || busy}
          onClick={onNext}
          type="button"
        >
          Next
        </button>
      </div>
    </footer>
  );
}

/** Inline, field-level problems. The id is the input's `aria-describedby`. */
export function ReferenceFieldError({
  id,
  messages,
}: {
  readonly id: string;
  readonly messages: readonly string[] | undefined;
}): JSX.Element | null {
  if (messages === undefined || messages.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-negative" id={id}>
      {messages.join(" ")}
    </p>
  );
}

export interface ReferenceErrorBannerProps {
  readonly title: string;
  readonly message: string;
  readonly requestId?: string | undefined;
  readonly onDismiss?: (() => void) | undefined;
}

export function ReferenceErrorBanner({
  title,
  message,
  requestId,
  onDismiss,
}: ReferenceErrorBannerProps): JSX.Element {
  return (
    <div
      className="mb-4 flex items-start gap-2.5 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
      role="alert"
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5">{message}</p>
        {requestId === undefined ? null : (
          <p className="mt-1 font-mono text-xs">Ref: {requestId}</p>
        )}
      </div>
      {onDismiss === undefined ? null : (
        <button
          aria-label={`Dismiss ${title}`}
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-control hover:bg-negative/10"
          onClick={onDismiss}
          type="button"
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Table chrome shared by all three tabs: title, live total, fetch indicator. */
export function ReferenceTableHeader({
  title,
  total,
  fetching,
}: {
  readonly title: string;
  readonly total: number;
  readonly fetching: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3.5 sm:px-[1.125rem]">
      <h3 className="text-[0.90625rem] font-semibold text-ink">{title}</h3>
      <span className="text-xs text-ink-muted">
        {total.toLocaleString()} total
      </span>
      {fetching ? (
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-muted"
          role="status"
        >
          <span className="size-3 animate-spin rounded-full border-2 border-line border-t-accent" />
          Updating
        </span>
      ) : null}
    </div>
  );
}
