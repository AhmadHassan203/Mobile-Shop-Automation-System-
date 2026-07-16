"use client";

import type { CurrentAuth } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type JSX, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  PERMISSION_GROUPS,
  PRICE_BANDS,
  PROTOTYPE_ROLES,
  REORDER_WEIGHTS,
  SETTINGS_TABS,
  WARRANTY_TYPES,
  permissionsForGroup,
  roleIsAssigned,
  settingsCapabilities,
  type SettingsCapabilities,
  type SettingsTabId,
} from "./settings-state";

const controlClass =
  "min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70 focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted";
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50";

function Card({
  title,
  hint,
  children,
  action,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {hint === undefined ? null : (
          <span className="text-xs text-ink-muted">{hint}</span>
        )}
        {action === undefined ? null : <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function PendingBadge({
  label = "API pending",
}: {
  readonly label?: string;
}): JSX.Element {
  return (
    <span className="inline-flex rounded-full bg-warning-soft px-2.5 py-1 text-[0.6875rem] font-bold text-warning">
      {label}
    </span>
  );
}

function ReadOnlyField({
  label,
  value,
  help,
}: {
  readonly label: string;
  readonly value: string;
  readonly help?: ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-subtle">
        {label}
      </span>
      <input className={controlClass} disabled value={value} />
      {help === undefined ? null : (
        <span className="mt-1 block text-xs leading-5 text-ink-muted">
          {help}
        </span>
      )}
    </label>
  );
}

function KeyValue({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-subtle py-2.5 last:border-b-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-right text-xs font-semibold text-ink">{children}</dd>
    </div>
  );
}

function SettingsSkeleton(): JSX.Element {
  return (
    <div aria-label="Loading settings" className="space-y-4" role="status">
      <div className="h-36 animate-pulse rounded-card border border-line bg-surface" />
      <div className="h-12 animate-pulse rounded-card border border-line bg-surface" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-96 animate-pulse rounded-card border border-line bg-surface lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-card border border-line bg-surface" />
      </div>
    </div>
  );
}

function SettingsForbidden(): JSX.Element {
  return (
    <section className="rounded-card border border-warning/30 bg-warning-soft p-6 shadow-card">
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 size-6 shrink-0 text-warning" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-warning">
            Settings access required
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink">
            This workspace is permission protected
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-subtle">
            settings.view is required. No configuration endpoint was requested
            and no values are exposed.
          </p>
        </div>
      </div>
    </section>
  );
}

function ShopProfile({ auth }: { readonly auth: CurrentAuth }): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card
            hint="Used on invoices, reports and receipts"
            title="Shop profile"
          >
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <ReadOnlyField label="Shop name" value={auth.organization.name} />
              <ReadOnlyField
                help={`Signed in as ${auth.user.fullName}; /auth/me does not identify the organization owner.`}
                label="Owner"
                value="Pending settings API"
              />
              <div className="sm:col-span-2">
                <ReadOnlyField
                  help="The current authentication context exposes this branch. Branch editing needs a settings API."
                  label="Branch / address"
                  value={auth.branch.name}
                />
              </div>
              <ReadOnlyField
                label="Timezone"
                value={auth.organization.timezone}
              />
              <ReadOnlyField
                help="Import conversion and reporting rules are not editable without a configuration contract."
                label="Reporting currency"
                value={auth.organization.currency}
              />
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-ink-subtle">
                  Business date
                </span>
                <div className="flex min-h-10 items-center justify-between gap-3 rounded-control border border-dashed border-line bg-surface-subtle px-3 py-2 text-sm text-ink-muted">
                  <span>Pending operational settings API</span>
                  <PendingBadge label="Set automatically" />
                </div>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  This will advance through daily closing and will not be
                  manually editable.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
              <button className={primaryButtonClass} disabled type="button">
                Save profile
              </button>
              <p className="text-xs text-ink-muted">
                Profile persistence is pending; issued invoices will remain
                immutable.
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Cash session">
            <dl className="px-4 py-2">
              <KeyValue label="State">
                <PendingBadge label="Unavailable" />
              </KeyValue>
              <KeyValue label="Opened">—</KeyValue>
              <KeyValue label="Opening float">—</KeyValue>
            </dl>
            <div className="border-t border-line p-4">
              <a className={`${secondaryButtonClass} w-full`} href="/closing">
                Go to daily closing →
              </a>
            </div>
          </Card>
          <div className="rounded-control border border-info/25 bg-info-soft p-4 text-sm leading-6 text-info">
            Settings shape future behavior. They never alter a transaction that
            has already been posted.
          </div>
        </div>
      </div>

      <Card
        hint="The current session exposes one branch; no additional branches are invented."
        title="Shop & branches"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
              <tr>
                {[
                  "Branch",
                  "Code",
                  "Organization",
                  "Session scope",
                  "Configuration status",
                ].map((heading) => (
                  <th className="px-4 py-3 font-bold" key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line-subtle">
                <td className="px-4 py-3 text-sm font-semibold text-ink">
                  {auth.branch.name}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-subtle">
                  {auth.branch.code}
                </td>
                <td className="px-4 py-3 text-sm text-ink-subtle">
                  {auth.organization.name}
                </td>
                <td className="px-4 py-3 text-xs text-ink-muted">
                  {auth.scopes.length.toLocaleString("en-PK")} assigned scope
                  {auth.scopes.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3">
                  <PendingBadge />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AccessPanel({ text }: { readonly text: string }): JSX.Element {
  return (
    <div className="flex gap-3 rounded-control border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
      <ShieldCheckIcon className="size-5 shrink-0" />
      <p>{text}</p>
    </div>
  );
}

function RolesAndPermissions({
  auth,
  capabilities,
  onRole,
}: {
  readonly auth: CurrentAuth;
  readonly capabilities: SettingsCapabilities;
  readonly onRole: (roleCode: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="rounded-control border border-info/25 bg-info-soft p-4 text-sm leading-6 text-info">
        Roles are modeled from day one, but this screen reports only the current
        server session. Role definitions and staff accounts require dedicated
        APIs.
      </div>

      {capabilities.canViewUsers ? (
        <Card
          action={
            <button className={secondaryButtonClass} disabled type="button">
              {capabilities.canManageUsers
                ? "Add user — API pending"
                : "User management permission required"}
            </button>
          }
          hint="Only the authenticated user is available without a users endpoint."
          title="Users"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                <tr>
                  {[
                    "User",
                    "Email",
                    "Effective roles",
                    "Branch",
                    "Account status",
                  ].map((heading) => (
                    <th
                      className="px-4 py-3 font-bold"
                      key={heading}
                      scope="col"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line-subtle">
                  <td className="px-4 py-3 text-sm font-semibold text-ink">
                    {auth.user.fullName}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-subtle">
                    {auth.user.email}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {auth.roles.map((role) => (
                        <span
                          className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink"
                          key={role}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-subtle">
                    {auth.branch.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive">
                      Current authenticated session
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="border-t border-line p-4 text-xs text-ink-muted">
            User create, edit, deactivate, and password controls remain disabled
            until a users API exists.
          </div>
        </Card>
      ) : (
        <AccessPanel text="users.view is required to see the users table. The current session identity is not expanded into staff administration." />
      )}

      {capabilities.canViewRoles ? (
        <Card
          hint="Least privilege by design · select a row for the permission layout"
          title="Roles"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Role
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    What they can do
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    Full grants
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {PROTOTYPE_ROLES.map((role) => {
                  const assigned = roleIsAssigned(role.code, auth.roles);
                  return (
                    <tr
                      className="cursor-pointer hover:bg-surface-subtle"
                      key={role.code}
                      onClick={() => onRole(role.code)}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-ink">
                        {role.label}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {assigned
                          ? "Assigned to the current session; definition details are not exposed by /auth/me."
                          : "Role definition API pending — no grant summary is assumed."}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-ink-muted">
                        —
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${assigned ? "bg-positive-soft text-positive" : "bg-surface-subtle text-ink-muted"}`}
                        >
                          {assigned ? "Assigned" : "Definition pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <AccessPanel text="roles.view is required to inspect role definitions and the permission matrix." />
      )}

      {capabilities.canViewRoles ? (
        <Card
          hint="Derived only from permissions returned for the current session."
          title="Effective permission matrix"
        >
          <div className="grid gap-x-6 px-4 py-2 md:grid-cols-2">
            {PERMISSION_GROUPS.map((group, index) => {
              const matches = permissionsForGroup(index, auth.permissions);
              return (
                <div
                  className="flex items-start justify-between gap-4 border-b border-line-subtle py-3"
                  key={group.label}
                >
                  <span className="text-sm text-ink-subtle">{group.label}</span>
                  <div className="max-w-[60%] text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${matches.length > 0 ? "bg-positive-soft text-positive" : "bg-surface-subtle text-ink-muted"}`}
                    >
                      {matches.length > 0
                        ? `${matches.length} effective grant${matches.length === 1 ? "" : "s"}`
                        : "No effective grant"}
                    </span>
                    {matches.length === 0 ? null : (
                      <p className="mt-1 break-words font-mono text-[0.625rem] leading-4 text-ink-muted">
                        {matches.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function PriceBands(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="rounded-control border border-info/25 bg-info-soft p-4 text-sm leading-6 text-info">
        Price bands group catalog tiers for demand, margin, and buying. The live
        boundaries and review dates require a pricing/settings API and are not
        copied from prototype seed data.
      </div>
      <Card
        hint="Review schedule unavailable · configuration API pending"
        title="Price bands"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-bold" scope="col">
                  Band
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Range (Rs)
                </th>
                <th className="px-4 py-3 text-right font-bold" scope="col">
                  Phones in band
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  What it&apos;s for
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {PRICE_BANDS.map((band) => (
                <tr key={band.label}>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-ink">
                      {band.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`${band.label} lower boundary`}
                        className={`${controlClass} w-28 text-right`}
                        disabled
                        placeholder="—"
                      />
                      <span className="text-ink-muted">–</span>
                      <input
                        aria-label={`${band.label} upper boundary`}
                        className={`${controlClass} w-28 text-right`}
                        disabled
                        placeholder="—"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-ink-muted">
                    —
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">
                    {band.purpose}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-xs text-ink-muted">
            Saving boundaries will re-tag affected products on future valuation
            and create an audit event.
          </p>
          <button className={primaryButtonClass} disabled type="button">
            Save bands
          </button>
        </div>
      </Card>
    </div>
  );
}

function ReorderEngine({
  onImpact,
}: {
  readonly onImpact: () => void;
}): JSX.Element {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card
          action={<PendingBadge label="Version unavailable" />}
          title="Reorder engine"
        >
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <ReadOnlyField
              help="Extra cover held against supplier delay before a stockout."
              label="Safety stock (days)"
              value=""
            />
            <ReadOnlyField
              help="How often demand and cover are re-evaluated."
              label="Review period (days)"
              value=""
            />
            <ReadOnlyField label="Service level" value="" />
            <ReadOnlyField
              help="The budget and liquidity buffer are unavailable without the configuration service."
              label="Liquidity buffer (%)"
              value=""
            />
          </div>
        </Card>

        <Card
          hint='How raw requests become "qualified" demand'
          title="Demand conversion weights"
        >
          <p className="px-4 pt-4 text-xs leading-5 text-ink-muted">
            Recorded demand is weighted by customer intent before it feeds the
            buying plan. Live weights are pending and remain blank.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Customer intent
                  </th>
                  <th className="px-4 py-3 text-right font-bold" scope="col">
                    Weight
                  </th>
                  <th className="px-4 py-3 font-bold" scope="col">
                    Meaning
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {REORDER_WEIGHTS.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-3 text-sm text-ink-subtle">
                      {row.label}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        aria-label={`${row.label} weight`}
                        className={`${controlClass} ml-auto w-24 text-right`}
                        disabled
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">
                      {row.meaning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
            <p className="text-xs leading-5 text-ink-muted">
              Formulas will be versioned and audited. Re-scoring will not alter
              posted transactions.
            </p>
            <button
              className={secondaryButtonClass}
              onClick={onImpact}
              type="button"
            >
              Review save impact
            </button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Current formula">
          <dl className="px-4 py-2">
            {["Version", "Effective", "Author", "Method"].map((label) => (
              <KeyValue key={label} label={label}>
                —
              </KeyValue>
            ))}
          </dl>
          <div className="border-t border-line p-4">
            <p className="text-xs leading-5 text-ink-muted">
              Every recommendation will show its reasons and confidence; the
              formula metadata API is pending.
            </p>
            <a
              className={`${secondaryButtonClass} mt-3 w-full`}
              href="/intelligence"
            >
              Open buying plan →
            </a>
          </div>
        </Card>
        <div className="rounded-control border border-warning/30 bg-warning-soft p-4 text-sm leading-6 text-warning">
          The engine recommends; it never buys on its own. A person approves
          every purchase order.
        </div>
      </div>
    </div>
  );
}

function PoliciesAndBackup({
  capabilities,
}: {
  readonly capabilities: SettingsCapabilities;
}): JSX.Element {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card title="Warranty policies">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-wide text-ink-muted">
                <tr>
                  {["Type", "Applies to", "Default cover", "Honored by"].map(
                    (heading) => (
                      <th
                        className="px-4 py-3 font-bold"
                        key={heading}
                        scope="col"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {WARRANTY_TYPES.map((warranty) => (
                  <tr key={warranty.type}>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-ink-subtle">
                        {warranty.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-subtle">
                      {warranty.applies}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-ink-muted">
                      —
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line p-4">
            <div className="max-w-xs">
              <ReadOnlyField
                help="Unwanted, unopened items only. Faulty units follow the returns and warranty workflow."
                label="Change-of-mind return window (days)"
                value=""
              />
            </div>
          </div>
        </Card>

        <Card title="Configuration status">
          <dl className="px-4 py-2">
            <KeyValue label="Settings persistence">
              <PendingBadge />
            </KeyValue>
            <KeyValue label="Versioned formula store">
              <PendingBadge />
            </KeyValue>
            <KeyValue label="Warranty policy store">
              <PendingBadge />
            </KeyValue>
            <KeyValue label="Audit export">
              <PendingBadge />
            </KeyValue>
          </dl>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Data & backup">
          <div className="space-y-4 p-4">
            <ReadOnlyField label="Backup schedule" value="" />
            <dl>
              <KeyValue label="Last backup">—</KeyValue>
              <KeyValue label="Destinations">—</KeyValue>
              <KeyValue label="Retention">—</KeyValue>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button className={primaryButtonClass} disabled type="button">
                Run backup now
              </button>
              <button className={secondaryButtonClass} disabled type="button">
                Test restore
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              Backup state and restore verification require infrastructure APIs.
            </p>
          </div>
        </Card>

        <div className="flex gap-3 rounded-control border border-positive/25 bg-positive-soft p-4 text-sm leading-6 text-positive">
          <CheckCircleIcon className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>Posted transactions are immutable.</strong> Corrections use
            reversing entries. Critical actions belong in an append-only audit
            trail with who, what, and when.
          </p>
        </div>

        <Card
          action={
            <button className={secondaryButtonClass} disabled type="button">
              Full audit report →
            </button>
          }
          title="Recent audit activity"
        >
          {capabilities.canViewAudit ? (
            <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
              <ShieldCheckIcon className="size-8 text-ink-muted" />
              <p className="mt-3 font-semibold text-ink">
                No audit records loaded
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">
                audit.view is granted, but no audit endpoint exists. Prototype
                events are not shown as real activity.
              </p>
              <button
                className={`${secondaryButtonClass} mt-3`}
                disabled
                type="button"
              >
                {capabilities.canExport
                  ? "Export audit — API pending"
                  : "reports.export required"}
              </button>
            </div>
          ) : (
            <AccessPanel text="audit.view is required to read recent audit activity. No audit event was requested." />
          )}
        </Card>
      </div>
    </div>
  );
}

function RoleDrawer({
  roleCode,
  auth,
  capabilities,
  onClose,
}: {
  readonly roleCode: string;
  readonly auth: CurrentAuth;
  readonly capabilities: SettingsCapabilities;
  readonly onClose: () => void;
}): JSX.Element {
  const role = PROTOTYPE_ROLES.find((item) => item.code === roleCode);
  const assigned = roleIsAssigned(roleCode, auth.roles);
  return (
    <div
      aria-label={`${role?.label ?? roleCode} permission preview`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-sidebar/55"
      role="dialog"
    >
      <button
        aria-label="Close role preview"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <section className="relative flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-overlay">
        <header className="flex items-center gap-3 border-b border-line p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent">
              Role
            </p>
            <h2 className="mt-1 text-lg font-bold text-ink">
              {role?.label ?? roleCode}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="ml-auto rounded-control border border-line p-2 text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${assigned ? "bg-positive-soft text-positive" : "bg-surface-subtle text-ink-muted"}`}
            >
              {assigned ? "Assigned to current session" : "Definition pending"}
            </span>
            <PendingBadge label="Full grants unavailable" />
          </div>
          <div className="mt-4 rounded-control border border-info/25 bg-info-soft p-3 text-sm leading-6 text-info">
            /auth/me returns effective session permissions, not per-role
            definitions. The matrix therefore avoids attributing unioned grants
            to this role.
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Permission set
          </p>
          <dl className="mt-2">
            {PERMISSION_GROUPS.map((group, index) => {
              const sessionMatches = permissionsForGroup(
                index,
                auth.permissions,
              );
              return (
                <KeyValue key={group.label} label={group.label}>
                  <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-ink-muted">
                    {assigned && sessionMatches.length > 0
                      ? `${sessionMatches.length} session grant${sessionMatches.length === 1 ? "" : "s"} · role source unknown`
                      : "Role definition pending"}
                  </span>
                </KeyValue>
              );
            })}
          </dl>
          <div className="mt-4 border-t border-line pt-4 text-xs leading-5 text-ink-muted">
            Audit remains append-only. Viewing it requires audit.view; no role
            can edit audit events.
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line p-4">
          <button
            className={secondaryButtonClass}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button className={primaryButtonClass} disabled type="button">
            {capabilities.canManageRoles
              ? "Save role — API pending"
              : "roles.manage required"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ReorderImpactModal({
  onClose,
}: {
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div
      aria-label="Save reorder configuration impact"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar/55 p-4"
      role="dialog"
    >
      <button
        aria-label="Close configuration impact"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <section className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-card border border-line bg-surface shadow-overlay">
        <header className="flex items-center gap-3 border-b border-line p-5">
          <h2 className="text-base font-bold text-ink">
            Save reorder configuration
          </h2>
          <button
            aria-label="Close"
            className="ml-auto rounded-control border border-line p-2 text-ink-muted"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="space-y-3 p-5">
          <p className="text-sm text-ink-muted">
            Saving will not touch a posted transaction. Live version and
            recommendation counts are deliberately omitted until the API exists.
          </p>
          <div className="rounded-control border border-accent/25 bg-accent-soft p-4 text-sm text-accent-ink">
            <p className="font-semibold">When this configuration is saved:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
              <li>
                A new immutable formula version supersedes the current version.
              </li>
              <li>
                Active reorder recommendations re-score on the next engine run.
              </li>
              <li>
                Only the Intelligence buying plan changes; no ledger entry
                changes.
              </li>
              <li>The actor and timestamp are appended to the audit trail.</li>
            </ul>
          </div>
          <div className="flex gap-2 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
            Older formula versions stay explainable. Persistence remains
            disabled until versioning and audit contracts exist.
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line p-4">
          <button
            className={secondaryButtonClass}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button className={primaryButtonClass} disabled type="button">
            Save & version formula — API pending
          </button>
        </footer>
      </section>
    </div>
  );
}

export function SettingsWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const [tab, setTab] = useState<SettingsTabId>("profile");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);

  if (auth.data === undefined && auth.isPending) return <SettingsSkeleton />;
  const capabilities = settingsCapabilities(auth.data?.permissions);
  if (!capabilities.canView || auth.data === undefined)
    return <SettingsForbidden />;

  return (
    <div>
      <header className="mb-5 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">
              System · Configuration
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
              Settings
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
              Configure {auth.data.organization.name} — shop profile, branches,
              users, roles, price bands, reorder policy, and data safety. Posted
              transactions remain immutable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={secondaryButtonClass}
              disabled={!capabilities.canViewAudit}
              onClick={() => setTab("policies")}
              type="button"
            >
              Audit trail
            </button>
            <button className={primaryButtonClass} disabled type="button">
              {capabilities.canManage
                ? "Save all changes — API pending"
                : "settings.manage required"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <PendingBadge label="Configuration API pending" />
          <span className="rounded-full bg-positive-soft px-3 py-1.5 text-positive">
            Real authentication context
          </span>
          <span className="rounded-full bg-surface-subtle px-3 py-1.5 text-ink-subtle">
            No prototype values persisted
          </span>
        </div>
      </header>

      <div
        aria-label="Settings sections"
        className="mb-5 overflow-x-auto border-b border-line"
        role="tablist"
      >
        <div className="flex min-w-max gap-1">
          {SETTINGS_TABS.map((item) => (
            <button
              aria-selected={item.id === tab}
              className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${item.id === tab ? "border-accent text-accent" : "border-transparent text-ink-muted hover:text-ink"}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section
        aria-label={SETTINGS_TABS.find((item) => item.id === tab)?.label}
        role="tabpanel"
      >
        {tab === "profile" ? <ShopProfile auth={auth.data} /> : null}
        {tab === "roles" ? (
          <RolesAndPermissions
            auth={auth.data}
            capabilities={capabilities}
            onRole={setSelectedRole}
          />
        ) : null}
        {tab === "bands" ? <PriceBands /> : null}
        {tab === "reorder" ? (
          <ReorderEngine onImpact={() => setImpactOpen(true)} />
        ) : null}
        {tab === "policies" ? (
          <PoliciesAndBackup capabilities={capabilities} />
        ) : null}
      </section>

      {selectedRole === null ? null : (
        <RoleDrawer
          auth={auth.data}
          capabilities={capabilities}
          onClose={() => setSelectedRole(null)}
          roleCode={selectedRole}
        />
      )}
      {impactOpen ? (
        <ReorderImpactModal onClose={() => setImpactOpen(false)} />
      ) : null}
    </div>
  );
}

export function SettingsRouteFallback(): JSX.Element {
  return <SettingsSkeleton />;
}
