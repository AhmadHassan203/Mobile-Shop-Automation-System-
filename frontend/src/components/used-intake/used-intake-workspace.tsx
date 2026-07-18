"use client";

import { PAGINATION, PERMISSIONS } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type JSX, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  LockIcon,
  PhoneCheckIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { catalogProductsQueryOptions } from "@/lib/query/catalog-query";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  EMPTY_USED_INTAKE_DRAFT,
  USED_INTAKE_BACKEND_GAPS,
  USED_INTAKE_GATES,
  USED_INTAKE_INSPECTION_ITEMS,
  cnicLastFour,
  normalizeUsedIntakeSearch,
  usedIntakeGatePreview,
  validateUsedIntakeDraft,
  type UsedIntakeDraft,
  type UsedIntakeDraftErrors,
  type UsedIntakeGatePreview,
} from "./used-intake-state";

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/70 focus:border-accent focus:bg-surface disabled:cursor-not-allowed disabled:opacity-60";

function LoadingWorkspace(): JSX.Element {
  return (
    <div
      aria-label="Loading used intake workspace"
      className="space-y-4"
      role="status"
    >
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-24 animate-pulse rounded-card bg-line-subtle"
            key={index}
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

function MetricCard({
  accent = false,
  label,
  meta,
}: {
  readonly accent?: boolean;
  readonly label: string;
  readonly meta: string;
}): JSX.Element {
  return (
    <article
      className={`rounded-card border bg-surface p-4 shadow-card ${accent ? "border-negative/30" : "border-line"}`}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight ${accent ? "text-negative" : "text-ink"}`}
      >
        —
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{meta}</p>
    </article>
  );
}

function Field({
  children,
  error,
  help,
  label,
}: {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly help?: ReactNode;
  readonly label: string;
}): JSX.Element {
  return (
    <label className="block text-xs font-semibold text-ink-subtle">
      {label}
      {children}
      {error === undefined ? null : (
        <span className="mt-1 block text-xs font-normal text-negative">
          {error}
        </span>
      )}
      {help === undefined ? null : (
        <span className="mt-1 block text-xs font-normal leading-5 text-ink-muted">
          {help}
        </span>
      )}
    </label>
  );
}

function GateBadge({
  gate,
}: {
  readonly gate: UsedIntakeGatePreview;
}): JSX.Element {
  const style =
    gate.state === "locally_ready"
      ? "bg-info-soft text-info"
      : gate.state === "pending_external"
        ? "bg-warning-soft text-warning"
        : "bg-negative-soft text-negative";
  const label =
    gate.state === "locally_ready"
      ? "Input ready"
      : gate.state === "pending_external"
        ? "External proof pending"
        : "Input pending";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${style}`}
    >
      {label}
    </span>
  );
}

function IntakeDrawer({
  canViewCatalog,
  onClose,
}: {
  readonly canViewCatalog: boolean;
  readonly onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<UsedIntakeDraft>(EMPTY_USED_INTAKE_DRAFT);
  const [errors, setErrors] = useState<UsedIntakeDraftErrors>({});
  const [reviewed, setReviewed] = useState(false);
  const catalog = useQuery(
    catalogProductsQueryOptions(
      {
        page: 1,
        pageSize: PAGINATION.MAX_PAGE_SIZE,
        active: true,
        trackingType: "serialized",
      },
      canViewCatalog,
    ),
  );
  const gatePreview = useMemo(() => usedIntakeGatePreview(draft), [draft]);
  const locallyValid = Object.keys(errors).length === 0 && reviewed;

  const update = <K extends keyof UsedIntakeDraft>(
    key: K,
    value: UsedIntakeDraft[K],
  ): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setReviewed(false);
  };

  const review = (): void => {
    setErrors(validateUsedIntakeDraft(draft));
    setReviewed(true);
  };

  return (
    <div
      aria-label="New used-device intake"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-sidebar/60"
      role="dialog"
    >
      <button
        aria-label="Close intake drawer"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <section className="relative flex h-full w-full max-w-2xl flex-col border-l border-line bg-surface shadow-overlay">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">
              Quarantine-first capture
            </p>
            <h2 className="mt-1 text-xl font-bold text-ink">
              New used-device intake
            </h2>
          </div>
          <button
            aria-label="Close"
            className="rounded-control border border-line p-2 text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex gap-3 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm leading-6 text-warning">
            <LockIcon className="mt-0.5 size-5 shrink-0" />
            <p>
              A saved device must enter <strong>Quarantine</strong>. This form
              can validate local input, but cannot save or clear a gate until
              the secure intake API and verification adapters exist.
            </p>
          </div>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
              Seller identity
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                error={errors.sellerName}
                label="Seller full name (as on CNIC)"
              >
                <input
                  className={controlClass}
                  onChange={(event) => update("sellerName", event.target.value)}
                  placeholder="e.g. Waleed Ahmed"
                  value={draft.sellerName}
                />
              </Field>
              <Field
                error={errors.cnic}
                help={
                  cnicLastFour(draft.cnic) === null
                    ? "Restricted: production may retain only a protected token and the last four digits."
                    : `Display fragment only: •••• ${cnicLastFour(draft.cnic)}`
                }
                label="CNIC number — restricted"
              >
                <input
                  autoComplete="off"
                  className={`${controlClass} font-mono`}
                  inputMode="numeric"
                  maxLength={15}
                  onChange={(event) => update("cnic", event.target.value)}
                  placeholder="35202-XXXXXXX-1"
                  value={draft.cnic}
                />
              </Field>
            </div>
            <label
              className={`mt-4 flex items-start gap-3 rounded-control border p-3 text-xs leading-5 ${errors.consent === undefined ? "border-line text-ink-subtle" : "border-negative/35 bg-negative-soft text-negative"}`}
            >
              <input
                checked={draft.consent}
                className="mt-0.5"
                onChange={(event) => update("consent", event.target.checked)}
                type="checkbox"
              />
              <span>
                Seller consents to identity capture and Police e-Gadget
                verification and declares lawful ownership.{" "}
                <strong>Required.</strong>
                {errors.consent === undefined ? null : (
                  <span className="mt-1 block">{errors.consent}</span>
                )}
              </span>
            </label>
          </section>

          <section className="border-t border-line pt-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
              Device
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                error={errors.device}
                help={
                  !canViewCatalog
                    ? "catalog.view is required to load serialized variants."
                    : undefined
                }
                label="Model"
              >
                <select
                  className={controlClass}
                  onChange={(event) =>
                    update("productVariantId", event.target.value)
                  }
                  value={draft.productVariantId}
                >
                  <option value="">— Select serialized model —</option>
                  {(catalog.data?.items ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.productModel.brand.name}{" "}
                      {product.productModel.name} · {product.name}
                    </option>
                  ))}
                  <option value="__other">Other / not in catalog</option>
                </select>
              </Field>
              <Field label="Variant (storage · colour)">
                <input
                  className={controlClass}
                  onChange={(event) => update("variant", event.target.value)}
                  placeholder="128 GB · Black"
                  value={draft.variant}
                />
              </Field>
            </div>
            {draft.productVariantId === "__other" ? (
              <div className="mt-4">
                <Field error={errors.device} label="Device description">
                  <input
                    className={controlClass}
                    onChange={(event) =>
                      update("otherDevice", event.target.value)
                    }
                    placeholder="Brand, model, storage and colour"
                    value={draft.otherDevice}
                  />
                </Field>
              </div>
            ) : null}
            {catalog.error === null ? null : (
              <p className="mt-3 rounded-control border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
                Serialized catalog models could not be loaded. The intake API is
                still unavailable, so no record is affected.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                error={errors.imei}
                help="A local checksum can reject bad input; it cannot claim PTA approval or lost/stolen clearance."
                label="IMEI"
              >
                <input
                  className={`${controlClass} font-mono`}
                  inputMode="numeric"
                  maxLength={18}
                  onChange={(event) => update("imei", event.target.value)}
                  placeholder="15-digit IMEI"
                  value={draft.imei}
                />
              </Field>
              <Field
                error={errors.egadgetReference}
                help="Entering a reference is not proof that the external check passed."
                label="Police e-Gadget reference"
              >
                <input
                  className={`${controlClass} font-mono`}
                  onChange={(event) =>
                    update("egadgetReference", event.target.value)
                  }
                  placeholder="e.g. EG-LHR-2026-0xxxx"
                  value={draft.egadgetReference}
                />
              </Field>
            </div>
          </section>

          <section className="border-t border-line pt-5">
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
              Physical inspection
            </h3>
            <div className="mt-3 grid gap-2">
              {USED_INTAKE_INSPECTION_ITEMS.map((item, index) => (
                <label
                  className="flex items-center justify-between gap-4 rounded-control border border-line px-3 py-2.5 text-xs text-ink-subtle"
                  key={item}
                >
                  {item}
                  <input
                    checked={draft.inspection[index] ?? false}
                    onChange={(event) => {
                      const next = [...draft.inspection];
                      next[index] = event.target.checked;
                      update("inspection", next);
                    }}
                    type="checkbox"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field
                error={errors.batteryHealth}
                help="Below 90% blocks the battery gate."
                label="Battery health (%)"
              >
                <input
                  className={controlClass}
                  max={100}
                  min={0}
                  onChange={(event) =>
                    update("batteryHealth", event.target.value)
                  }
                  type="number"
                  value={draft.batteryHealth}
                />
              </Field>
              <Field label="Grade">
                <select
                  className={controlClass}
                  onChange={(event) =>
                    update(
                      "grade",
                      event.target.value as UsedIntakeDraft["grade"],
                    )
                  }
                  value={draft.grade}
                >
                  <option value="grade_a">Grade A</option>
                  <option value="grade_b">Grade B</option>
                  <option value="grade_c">Grade C</option>
                </select>
              </Field>
              <Field
                error={errors.quotedBuyPrice}
                help="A quote is not an approval or payment."
                label="Quoted buy price (Rs)"
              >
                <input
                  className={controlClass}
                  min={0}
                  onChange={(event) =>
                    update("quotedBuyPrice", event.target.value)
                  }
                  placeholder="e.g. 195000"
                  type="number"
                  value={draft.quotedBuyPrice}
                />
              </Field>
            </div>
          </section>

          <section className="border-t border-line pt-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
                Five-gate review
              </h3>
              <span className="rounded-full bg-negative-soft px-2.5 py-1 text-[0.6875rem] font-bold text-negative">
                Saleable: NO
              </span>
            </div>
            <div className="mt-3 divide-y divide-line overflow-hidden rounded-control border border-line">
              {gatePreview.map((gate) => (
                <div
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
                  key={gate.name}
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {gate.name}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                      {gate.explanation}
                    </p>
                  </div>
                  <GateBadge gate={gate} />
                </div>
              ))}
            </div>
            {reviewed ? (
              <div
                className={`mt-3 rounded-control border p-3 text-xs leading-5 ${locallyValid ? "border-info/30 bg-info-soft text-info" : "border-negative/30 bg-negative-soft text-negative"}`}
                role="status"
              >
                {locallyValid
                  ? "Local input is complete. External evidence is still pending, so this device remains blocked from saving and sale."
                  : "Correct the highlighted input before an intake could be submitted. No record has been created."}
              </div>
            ) : null}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">
          <button
            className="min-h-10 rounded-control border border-line px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-control border border-accent/30 bg-accent-soft px-4 text-sm font-semibold text-accent hover:bg-accent/15"
            onClick={review}
            type="button"
          >
            Review quarantine gates
          </button>
          <button
            className="min-h-10 cursor-not-allowed rounded-control bg-accent px-4 text-sm font-semibold text-white opacity-50"
            disabled
            title="Used-intake persistence and verification APIs are not implemented"
            type="button"
          >
            Save → send to Quarantine
          </button>
        </footer>
      </section>
    </div>
  );
}

function EmptyIntakeQueue({
  onNew,
}: {
  readonly onNew: () => void;
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="border-b border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">Used-device intake records</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Quarantined records sort before cleared devices when the API is
              connected.
            </p>
          </div>
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
            API unavailable
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search used intakes</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-3 size-4 text-ink-muted" />
            <input
              className={`${controlClass} mt-0 pl-9`}
              disabled
              onChange={(event) =>
                normalizeUsedIntakeSearch(event.target.value)
              }
              placeholder="Search intake, seller, device or IMEI"
            />
          </label>
          <select
            aria-label="Intake status"
            className={`${controlClass} mt-0 sm:w-52`}
            disabled
            defaultValue="quarantine"
          >
            <option value="quarantine">In quarantine</option>
            <option value="cleared">Cleared · saleable</option>
          </select>
        </div>
      </header>
      <div className="flex min-h-72 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <PhoneCheckIcon className="size-6" />
        </span>
        <h3 className="mt-4 font-bold text-ink">
          No verified intake records are available
        </h3>
        <p className="mt-1 max-w-xl text-sm leading-6 text-ink-muted">
          Buy-backs and trade-ins will appear here only after the secure intake
          API exists. Prototype devices, valuations and gate results are never
          copied into production.
        </p>
        <button
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white"
          onClick={onNew}
          type="button"
        >
          <PlusIcon className="size-4" /> Review new intake
        </button>
      </div>
      <div className="grid border-t border-line sm:grid-cols-5">
        {USED_INTAKE_GATES.map((gate, index) => (
          <div
            className="border-b border-line p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            key={gate}
          >
            <p className="text-[0.625rem] font-bold uppercase tracking-wide text-accent">
              Gate {index + 1}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-ink-subtle">
              {gate}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function UsedIntakeWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const canViewCatalog =
    auth.data?.permissions.includes(PERMISSIONS.CATALOG_VIEW) ?? false;

  if (auth.isPending) return <LoadingWorkspace />;

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-accent">
              Second-hand stock · Quarantine first
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
              Used Device Intake &amp; Trade-in
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
              Every second-hand phone is held in quarantine until it passes all
              verification gates—protecting the shop from stolen, blacklisted or
              misrepresented devices.
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white shadow-sm"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <PlusIcon className="size-4" /> New intake
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-warning-soft px-3 py-1.5 text-warning">
            Persistence API pending
          </span>
          <span className="rounded-full bg-negative-soft px-3 py-1.5 text-negative">
            Quarantine enforced in UI
          </span>
          <span className="rounded-full bg-surface-subtle px-3 py-1.5 text-ink-subtle">
            No fabricated devices or values
          </span>
        </div>
      </header>

      <section className="flex gap-3 rounded-card border border-negative/30 bg-negative-soft p-4 text-sm leading-6 text-negative">
        <ShieldCheckIcon className="mt-0.5 size-6 shrink-0" />
        <p>
          A used device <strong>cannot be marked saleable</strong> until
          identity, IMEI / PTA, Police e-Gadget and physical-inspection gates
          all pass. A screenshot or seller statement is{" "}
          <strong>not sufficient verification</strong>.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          accent
          label="In quarantine"
          meta="Backend-derived count unavailable"
        />
        <MetricCard label="Cleared · saleable" meta="All gates must pass" />
        <MetricCard
          label="Capital held in quarantine"
          meta="Approved buy value unavailable"
        />
        <MetricCard
          label="Potential resale margin"
          meta="No invented valuation formula"
        />
      </section>

      <EmptyIntakeQueue onNew={() => setDrawerOpen(true)} />

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <header className="flex items-start gap-3 border-b border-line p-4 sm:p-5">
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <h2 className="font-bold text-ink">Backend gap registry</h2>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              These are implementation boundaries, not optional form
              enhancements. No control above claims they exist.
            </p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Capability</th>
                <th className="px-4 py-3">Required production boundary</th>
                <th className="px-4 py-3">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {USED_INTAKE_BACKEND_GAPS.map((gap) => (
                <tr key={gap.capability}>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {gap.capability}
                  </td>
                  <td className="px-4 py-3 text-xs leading-5 text-ink-muted">
                    {gap.requirement}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
                      Not implemented
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-card border border-line bg-surface p-4 shadow-card">
          <LockIcon className="size-5 text-accent" />
          <h3 className="mt-3 text-sm font-bold text-ink">
            Restricted identity by design
          </h3>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Full CNIC values must never appear in ordinary records, reports,
            exports or audit payloads.
          </p>
        </article>
        <article className="rounded-card border border-line bg-surface p-4 shadow-card">
          <CheckCircleIcon className="size-5 text-accent" />
          <h3 className="mt-3 text-sm font-bold text-ink">
            Evidence, not checkboxes alone
          </h3>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Every external and physical gate needs an attributed result,
            timestamp and immutable evidence reference.
          </p>
        </article>
        <article className="rounded-card border border-line bg-surface p-4 shadow-card">
          <ShieldCheckIcon className="size-5 text-accent" />
          <h3 className="mt-3 text-sm font-bold text-ink">Atomic clearance</h3>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Only a server transaction may move a cleared unit from quarantine
            into saleable inventory.
          </p>
        </article>
      </section>

      {drawerOpen ? (
        <IntakeDrawer
          canViewCatalog={canViewCatalog}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function UsedIntakeRouteFallback(): JSX.Element {
  return <LoadingWorkspace />;
}
