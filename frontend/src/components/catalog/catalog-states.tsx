"use client";

import type { JSX, ReactNode } from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";

export interface CatalogTableSkeletonProps {
  readonly rows?: number;
}

/** Placeholder for a catalog table while the first real page is in flight. */
export function CatalogTableSkeleton({
  rows = 6,
}: CatalogTableSkeletonProps): JSX.Element {
  return (
    <div
      aria-label="Loading catalog records"
      className="overflow-hidden rounded-card border border-line bg-surface"
      role="status"
    >
      <span className="sr-only">Loading catalog records</span>
      <div className="h-12 animate-pulse border-b border-line-subtle bg-line-subtle/65" />
      {Array.from({ length: Math.max(1, rows) }, (_, index) => (
        <div
          className="h-[4.5rem] animate-pulse border-b border-line-subtle bg-surface last:border-0"
          key={index}
        />
      ))}
    </div>
  );
}

export interface CatalogEmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}

/** Shown when the organization genuinely has no records of this kind yet. */
export function CatalogEmptyState({
  icon,
  title,
  description,
  action,
}: CatalogEmptyStateProps): JSX.Element {
  return (
    <div className="px-5 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        {icon ?? <BoxIcon className="size-6" />}
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
        {description}
      </p>
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface CatalogErrorStateProps {
  readonly title: string;
  readonly description: string;
  readonly requestId?: string;
  readonly onRetry: () => void;
}

/**
 * The API failed. No fallback or mock rows are ever rendered in its place; the
 * request id is surfaced so an owner can quote it when reporting the failure.
 */
export function CatalogErrorState({
  title,
  description,
  requestId,
  onRetry,
}: CatalogErrorStateProps): JSX.Element {
  return (
    <section
      className="rounded-card border border-negative/25 bg-surface p-5 shadow-card"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
          <AlertTriangleIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
          {requestId === undefined ? null : (
            <p className="mt-2 font-mono text-xs text-ink-muted">
              Ref: {requestId}
            </p>
          )}
          <button
            className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-xs font-semibold text-white hover:bg-accent-strong"
            onClick={onRetry}
            type="button"
          >
            <RefreshIcon className="size-4" /> Retry
          </button>
        </div>
      </div>
    </section>
  );
}

export interface CatalogForbiddenStateProps {
  readonly title: string;
  readonly description: string;
}

/** The server-provided permission set does not allow this view. */
export function CatalogForbiddenState({
  title,
  description,
}: CatalogForbiddenStateProps): JSX.Element {
  return (
    <section
      className="rounded-card border border-warning/25 bg-warning-soft p-5 text-warning"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm">{description}</p>
        </div>
      </div>
    </section>
  );
}

export interface CatalogNoResultsStateProps {
  readonly onClear: () => void;
}

/** Records exist, but the active search or filters matched none of them. */
export function CatalogNoResultsState({
  onClear,
}: CatalogNoResultsStateProps): JSX.Element {
  return (
    <div className="px-5 py-14 text-center">
      <SearchIcon className="mx-auto size-9 text-ink-muted" />
      <h2 className="mt-3 text-base font-semibold text-ink">
        No matching records
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Try another search term or clear one of the filters.
      </p>
      <button
        className="mt-4 text-sm font-semibold text-accent hover:text-accent-strong"
        onClick={onClear}
        type="button"
      >
        Clear search and filters
      </button>
    </div>
  );
}
