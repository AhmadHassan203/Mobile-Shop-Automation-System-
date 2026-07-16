import Link from "next/link";
import type { JSX, ReactNode } from "react";
import {
  AlertTriangleIcon,
  LockIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";

export const fieldLabelClass =
  "mb-1.5 block text-xs font-semibold text-ink-subtle";
export const inputClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted/70 focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted";

export interface DigitalHeaderAction {
  readonly href: string;
  readonly label: string;
  readonly primary?: boolean;
}

export function DigitalPageHeader({
  title,
  subtitle,
  actions,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly actions: readonly DigitalHeaderAction[];
}): JSX.Element {
  return (
    <header className="mb-5 flex flex-wrap items-start gap-4">
      <div>
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-1 max-w-3xl text-[0.8125rem] text-ink-muted">
          {subtitle}
        </p>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            className={`inline-flex min-h-9 items-center rounded-control px-3.5 text-sm font-semibold no-underline ${
              action.primary === true
                ? "bg-accent text-white hover:bg-accent-strong"
                : "border border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
            }`}
            href={action.href}
            key={action.href}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </header>
  );
}

export function DigitalApiNotice({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-[1.125rem] flex items-start gap-3 rounded-control border border-info/20 bg-info-soft p-3.5 text-[0.8125rem] text-info">
      <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function DigitalPermissionGate({
  permission,
  description,
}: {
  readonly permission: string;
  readonly description: string;
}): JSX.Element {
  return (
    <section
      className="rounded-card border border-warning/30 bg-surface p-6 shadow-card"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
          <LockIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-ink">
            Digital Services access required
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-subtle">
            {description} No external-service data request was sent.
          </p>
          <code className="mt-3 inline-flex rounded-full bg-warning-soft px-2.5 py-1 text-xs text-warning">
            {permission}
          </code>
        </div>
      </div>
    </section>
  );
}

export function DigitalRouteSkeleton(): JSX.Element {
  return (
    <div className="space-y-4" role="status">
      <span className="sr-only">Loading Digital Services</span>
      <div className="h-24 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-28 animate-pulse rounded-card bg-line-subtle"
            key={index}
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

export function DigitalKpi({
  label,
  value = "Unavailable",
  meta,
  warning = false,
}: {
  readonly label: string;
  readonly value?: string;
  readonly meta: string;
  readonly warning?: boolean;
}): JSX.Element {
  return (
    <article
      className={`rounded-card border bg-surface p-4 shadow-card ${
        warning ? "border-t-[3px] border-warning" : "border-line"
      }`}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p
        className={`mt-1.5 text-xl font-bold tracking-tight ${
          warning ? "text-warning" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-ink-muted">{meta}</p>
    </article>
  );
}

export function UnavailableTableRow({
  columns,
  message,
}: {
  readonly columns: number;
  readonly message: string;
}): JSX.Element {
  return (
    <tr>
      <td className="px-5 py-12 text-center" colSpan={columns}>
        <AlertTriangleIcon className="mx-auto size-8 text-warning opacity-60" />
        <p className="mt-2 text-sm font-semibold text-ink-subtle">{message}</p>
        <p className="mt-1 text-xs text-ink-muted">
          No prototype, cached, or locally invented records are displayed.
        </p>
      </td>
    </tr>
  );
}

export function Card({
  title,
  hint,
  children,
  className = "",
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <section
      className={`overflow-hidden rounded-card border border-line bg-surface shadow-card ${className}`}
    >
      <header className="flex min-h-[3.25rem] flex-wrap items-center gap-2 border-b border-line-subtle px-[1.125rem] py-3.5">
        <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
        {hint === undefined ? null : (
          <span className="ml-auto text-xs text-ink-muted">{hint}</span>
        )}
      </header>
      {children}
    </section>
  );
}

export const tableClass = "w-full min-w-max border-collapse text-[0.8125rem]";
export const thClass =
  "sticky top-0 whitespace-nowrap border-b border-line bg-surface-subtle px-3.5 py-2.5 text-left text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted";
