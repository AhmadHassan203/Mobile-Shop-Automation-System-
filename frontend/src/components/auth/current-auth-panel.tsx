"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";

function formatSessionExpiry(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function CurrentAuthPanel() {
  const auth = useQuery(currentAuthQueryOptions);
  if (auth.data === undefined) return null;

  const { user, organization, branch, roles, session } = auth.data;

  return (
    <section
      aria-labelledby="signed-in-context-heading"
      className="mb-4 overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-[1.125rem] py-3.5">
        <ShieldCheckIcon className="size-[1.125rem] text-accent" />
        <h2
          className="text-[0.90625rem] font-semibold text-ink"
          id="signed-in-context-heading"
        >
          Signed-in context
        </h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive">
          <span className="size-1.5 rounded-full bg-current" /> Active session
        </span>
      </div>

      <dl className="grid gap-px bg-line-subtle sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface p-4">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            User
          </dt>
          <dd className="mt-1.5 text-sm font-semibold text-ink">
            {user.fullName}
          </dd>
          <dd className="mt-0.5 break-all text-xs text-ink-muted">
            {user.email}
          </dd>
        </div>
        <div className="bg-surface p-4">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            Organization
          </dt>
          <dd className="mt-1.5 text-sm font-semibold text-ink">
            {organization.name}
          </dd>
          <dd className="mt-0.5 text-xs text-ink-muted">
            {organization.currency} · {organization.timezone}
          </dd>
        </div>
        <div className="bg-surface p-4">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            Active branch
          </dt>
          <dd className="mt-1.5 text-sm font-semibold text-ink">
            {branch.name}
          </dd>
          <dd className="mt-0.5 font-mono text-xs text-ink-muted">
            {branch.code}
          </dd>
        </div>
        <div className="bg-surface p-4">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
            Session expires
          </dt>
          <dd className="mt-1.5 text-sm font-semibold text-ink">
            {formatSessionExpiry(session.expiresAt, organization.timezone)}
          </dd>
          <dd className="mt-0.5 text-xs text-ink-muted">
            {organization.timezone}
          </dd>
        </div>
      </dl>

      <div className="border-t border-line-subtle px-[1.125rem] py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold text-ink-muted">
            Assigned roles
          </span>
          {roles.length === 0 ? (
            <span className="text-xs text-warning">No roles assigned</span>
          ) : (
            roles.map((role) => (
              <code
                className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink"
                key={role}
              >
                {role}
              </code>
            ))
          )}
        </div>
      </div>

      {user.mustChangePassword ? (
        <div
          className="flex items-start gap-2.5 border-t border-warning/20 bg-warning-soft px-[1.125rem] py-3 text-[0.8125rem] text-warning"
          role="status"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            This account is marked for a password change. Self-service password
            change is not implemented yet; contact the administrator before
            using operational workflows.
          </p>
        </div>
      ) : null}
    </section>
  );
}
