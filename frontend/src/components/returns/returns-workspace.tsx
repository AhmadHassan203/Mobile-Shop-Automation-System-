"use client";

import {
  LIMITS,
  PAGINATION,
  RETURN_REFUND_METHODS,
  RETURN_STATUSES,
  formatMoney,
  toMinor,
  type PostReturnInput,
  type ReturnDetail,
  type ReturnItemCondition,
  type ReturnRefundMethod,
  type ReturnStatus,
} from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
} from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogNoResultsState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  EyeIcon,
  PlusIcon,
  RefreshIcon,
  ReturnIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { toApiError, type ApiError } from "@/lib/api/client";
import type { ReturnListParameters } from "@/lib/api/returns";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  returnEligibilityQueryOptions,
  returnQueryOptions,
  returnsQueryOptions,
  useCreateReturnMutation,
  usePostReturnMutation,
} from "@/lib/query/returns-query";
import {
  EMPTY_RETURN_INTAKE,
  RETURN_BACKEND_GAPS,
  RETURN_CONDITION_OPTIONS,
  RETURN_REASONS,
  RETURN_TABS,
  buildCreateReturnInput,
  canSubmitReturnIntake,
  eligibilityLineLabel,
  isEligibilityLineReturnable,
  normalizeReturnInvoice,
  returnCapabilities,
  returnConditionLabel,
  returnOutcomeLabel,
  returnRouteQuery,
  returnStatusLabel,
  returnTabFrom,
  validateReturnIntake,
  type ReturnIntakeDraft,
  type ReturnReason,
  type ReturnTab,
} from "./return-state";

const PAGE_SIZE = PAGINATION.DEFAULT_PAGE_SIZE;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

const controlClass =
  "mt-1.5 min-h-10 w-full rounded-control border border-line bg-surface-subtle px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:cursor-not-allowed disabled:opacity-55";

function money(minor: number): string {
  return formatMoney(toMinor(minor));
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function oneOf<TValue extends string>(
  value: string | null,
  options: readonly TValue[],
): TValue | undefined {
  return value !== null && options.includes(value as TValue)
    ? (value as TValue)
    : undefined;
}

function positivePage(value: string | null): number {
  if (value === null || !/^\d+$/u.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function returnListParametersFrom(
  searchParams: URLSearchParams,
): ReturnListParameters {
  const q = searchParams.get("q")?.trim();
  const status = oneOf(searchParams.get("status"), RETURN_STATUSES);
  const saleId = searchParams.get("saleId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  return {
    page: positivePage(searchParams.get("page")),
    pageSize: PAGE_SIZE,
    sort: "created_at",
    direction: "desc",
    ...(q === undefined || q.length === 0 ? {} : { q }),
    ...(status === undefined ? {} : { status }),
    ...(saleId !== null && UUID_RE.test(saleId) ? { saleId } : {}),
    ...(from !== null && ISO_DATE_RE.test(from) ? { from } : {}),
    ...(to !== null && ISO_DATE_RE.test(to) ? { to } : {}),
  };
}

/** Read-copy for a failed Returns read. No mock rows are ever shown instead. */
export function returnReadErrorCopy(error: ApiError): {
  title: string;
  description: string;
} {
  if (error.code === "NETWORK_ERROR") {
    return {
      title: "The Returns API could not be reached",
      description:
        "You appear to be offline, or the API is not reachable. Nothing is shown in place of the real records — reconnect and retry.",
    };
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return {
      title: "The Returns API did not respond in time",
      description:
        "The request timed out before the API answered. No cached or placeholder cases are shown — retry when the connection is stable.",
    };
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return {
      title: "Returns access was refused",
      description:
        "The server rejected this read for the current permission set. Ask an owner to review your returns permissions.",
    };
  }
  if (error.code === "NOT_FOUND" || error.status === 404) {
    return {
      title: "No matching return",
      description:
        "The API found no such return, or no posted sale for that invoice, in your organization.",
    };
  }
  if (error.code === "INVALID_RESPONSE") {
    return {
      title: "The Returns API returned an unexpected response",
      description:
        "The response did not match the agreed contract, so it was rejected rather than displayed. Nothing here is guessed or filled in.",
    };
  }
  return {
    title: "Returns could not be loaded",
    description:
      "The API did not return a valid response. No fallback or mock cases are shown.",
  };
}

/** Headline for a failed intake/post. Every branch states nothing was written. */
export function returnWriteMessage(
  error: ApiError,
  subject: "saved" | "processed",
): string {
  if (error.code === "OPTIMISTIC_LOCK_FAILED") {
    return `This return changed since it loaded, so it was not ${subject}. Refresh the return to see the current values and try again.`;
  }
  if (
    error.code === "CONFLICT" ||
    error.code === "RETURN_EXCHANGE_UNAVAILABLE"
  ) {
    return error.message;
  }
  if (error.code === "VALIDATION_FAILED") {
    return `The API rejected this return: ${error.message}`;
  }
  if (error.code === "NOT_FOUND" || error.status === 404) {
    return `This return no longer exists for your organization, so it was not ${subject}.`;
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return `Your current permissions no longer allow this return to be ${subject}.`;
  }
  if (error.code === "NETWORK_ERROR") {
    return `The Returns API could not be reached, so nothing was ${subject}. Check your connection and try again.`;
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return `The Returns API did not respond in time, so nothing was ${subject}.`;
  }
  return `This return could not be ${subject}. Try again.`;
}

function statusBadgeClass(status: ReturnStatus): string {
  if (status === "posted") return "bg-positive-soft text-positive";
  if (status === "cancelled") return "bg-surface-subtle text-ink-muted";
  return "bg-warning-soft text-warning";
}

function ReturnsLoading(): JSX.Element {
  return (
    <div
      aria-label="Loading returns workspace"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading returns workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

function ReturnsAccessRequired({
  authFailed = false,
}: {
  readonly authFailed?: boolean;
}): JSX.Element {
  return (
    <section className="rounded-card border border-warning/30 bg-warning-soft p-6 shadow-card">
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 size-6 shrink-0 text-warning" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-warning">
            {authFailed
              ? "Access could not be verified"
              : "Returns access required"}
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink">
            {authFailed
              ? "The current session is unavailable"
              : "This queue is permission protected"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-subtle">
            {authFailed
              ? "The session check failed, so no Returns request was sent. Restore the API connection and retry."
              : "Viewing returns requires returns.view. No Returns data or linked Sales evidence was requested."}
          </p>
        </div>
      </div>
    </section>
  );
}

function UnavailableBadge({
  deferred = false,
}: {
  readonly deferred?: boolean;
}): JSX.Element {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide ${deferred ? "bg-warning-soft text-warning" : "bg-surface-subtle text-ink-muted"}`}
    >
      {deferred ? "Deferred" : "Not implemented"}
    </span>
  );
}

function WriteErrorBanner({
  title,
  error,
  onRetry,
}: {
  readonly title: string;
  readonly error: ApiError;
  readonly onRetry?: (() => void) | undefined;
}): JSX.Element {
  const conflict = error.code === "OPTIMISTIC_LOCK_FAILED";
  return (
    <div
      className="flex items-start gap-2.5 rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
      role="alert"
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{conflict ? "Version conflict" : title}</p>
        <p className="mt-0.5 leading-5">{error.message}</p>
        {error.requestId === undefined ? null : (
          <p className="mt-1 font-mono text-xs">Ref: {error.requestId}</p>
        )}
        {onRetry === undefined ? null : (
          <button
            className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-control border border-negative/30 px-2.5 text-xs font-semibold hover:bg-negative/10"
            onClick={onRetry}
            type="button"
          >
            <RefreshIcon className="size-3.5" /> Refresh
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  children,
  error,
  label,
}: {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly label: string;
}): JSX.Element {
  return (
    <label className="block text-xs font-semibold text-ink-subtle">
      {label}
      {children}
      {error === undefined ? null : (
        <span className="mt-1 block text-xs text-negative">{error}</span>
      )}
    </label>
  );
}

// =============================================================================
// New return intake (GET /returns/eligibility -> POST /returns)
// =============================================================================

function NewReturnDrawer({
  canCreate,
  canViewSales,
  onClose,
  onSaved,
}: {
  readonly canCreate: boolean;
  readonly canViewSales: boolean;
  readonly onClose: () => void;
  readonly onSaved: (created: ReturnDetail) => void;
}): JSX.Element {
  const [invoiceInput, setInvoiceInput] = useState("");
  const [submittedInvoice, setSubmittedInvoice] = useState("");
  const [draft, setDraft] = useState<ReturnIntakeDraft>(EMPTY_RETURN_INTAKE);

  const eligibility = useQuery(
    returnEligibilityQueryOptions(
      { invoiceNumber: submittedInvoice.length === 0 ? "" : submittedInvoice },
      canCreate && submittedInvoice.length > 0,
    ),
  );
  const create = useCreateReturnMutation();

  const data = eligibility.data;
  const eligibilityError =
    eligibility.error === null || data !== undefined
      ? null
      : toApiError(eligibility.error);
  const createError = create.isError ? toApiError(create.error) : null;
  const errors = validateReturnIntake(data ?? null, draft);
  const canSave =
    canCreate &&
    !create.isPending &&
    data !== undefined &&
    canSubmitReturnIntake(data, draft);

  const checkEligibility = (): void => {
    const normalized = normalizeReturnInvoice(invoiceInput);
    setInvoiceInput(normalized);
    setDraft(EMPTY_RETURN_INTAKE);
    create.reset();
    setSubmittedInvoice(normalized);
  };

  const toggleLine = (saleLineId: string): void => {
    setDraft((current) => {
      const next = { ...current.selections };
      if (next[saleLineId] !== undefined) delete next[saleLineId];
      else next[saleLineId] = { condition: "faulty", quantity: 1 };
      return { ...current, selections: next };
    });
  };

  const setLineCondition = (
    saleLineId: string,
    condition: ReturnItemCondition,
  ): void => {
    setDraft((current) => {
      const existing = current.selections[saleLineId];
      if (existing === undefined) return current;
      return {
        ...current,
        selections: {
          ...current.selections,
          [saleLineId]: { ...existing, condition },
        },
      };
    });
  };

  const setLineQuantity = (saleLineId: string, quantity: number): void => {
    setDraft((current) => {
      const existing = current.selections[saleLineId];
      if (existing === undefined) return current;
      return {
        ...current,
        selections: {
          ...current.selections,
          [saleLineId]: { ...existing, quantity },
        },
      };
    });
  };

  const save = (): void => {
    if (data === undefined || !canSave) return;
    create.mutate(buildCreateReturnInput(data, draft), {
      onSuccess: (created) => onSaved(created),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45"
      role="presentation"
    >
      <button
        aria-label="Close new return drawer"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="new-return-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <ReturnIcon className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-accent">
              Controlled intake
            </p>
            <h2 className="mt-0.5 font-bold text-ink" id="new-return-title">
              New return
            </h2>
          </div>
          <button
            aria-label="Close drawer"
            className="ml-auto grid size-9 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {!canCreate ? (
            <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
              returns.create is required to check eligibility or open a return.
              The form cannot bypass proof of purchase or policy.
            </div>
          ) : null}

          <section>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
              1 · Verify against the original sale
            </p>
            <Field label="Original invoice number">
              <div className="mt-1.5 flex gap-2">
                <input
                  className="min-h-10 min-w-0 flex-1 rounded-control border border-line bg-surface-subtle px-3 py-2 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface disabled:opacity-55"
                  disabled={!canCreate || eligibility.isFetching}
                  onChange={(event) => setInvoiceInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      invoiceInput.trim().length > 0
                    ) {
                      event.preventDefault();
                      checkEligibility();
                    }
                  }}
                  placeholder="Invoice no. — e.g. INV-2026-0711"
                  value={invoiceInput}
                />
                <button
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-xs font-bold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    !canCreate ||
                    eligibility.isFetching ||
                    invoiceInput.trim().length === 0
                  }
                  onClick={checkEligibility}
                  type="button"
                >
                  {eligibility.isFetching ? (
                    <RefreshIcon className="size-3.5 animate-spin" />
                  ) : null}
                  {eligibility.isFetching ? "Checking…" : "Check eligibility"}
                </button>
              </div>
              <span className="mt-1 block font-normal leading-5 text-ink-muted">
                Eligibility reads the real posted sale, its return window and
                any quantity already returned.
              </span>
            </Field>

            {eligibilityError !== null ? (
              <div className="mt-3">
                <CatalogErrorState
                  {...returnReadErrorCopy(eligibilityError)}
                  {...(eligibilityError.requestId === undefined
                    ? {}
                    : { requestId: eligibilityError.requestId })}
                  onRetry={() => {
                    void eligibility.refetch();
                  }}
                />
              </div>
            ) : null}
          </section>

          {data === undefined ? null : (
            <>
              <div className="rounded-control border border-line bg-surface-subtle p-3 text-xs leading-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-ink">
                    {data.sale.invoiceNumber}
                    {data.sale.customer === null
                      ? ""
                      : ` · ${data.sale.customer.name}`}
                  </p>
                  {canViewSales ? (
                    <Link
                      className="font-bold text-accent underline underline-offset-2"
                      href={`/sales/${data.sale.id}`}
                    >
                      Open original sale →
                    </Link>
                  ) : null}
                </div>
                <p className="mt-1 text-ink-muted">
                  Posted {formatDate(data.sale.postedAt)} · window{" "}
                  {data.sale.returnWindowDays} days · deadline{" "}
                  {formatDate(data.policy.deadline)}
                </p>
              </div>

              {data.state === "eligible" ? (
                <div
                  className="rounded-control border border-positive/25 bg-positive-soft p-3 text-xs leading-5 text-positive"
                  role="status"
                >
                  Within the return window. Select the exact line(s) received.
                </div>
              ) : data.state === "window_expired" ? (
                <div
                  className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning"
                  role="status"
                >
                  The return window has expired. A draft can still be recorded,
                  but an approver must supply a policy override at posting.
                </div>
              ) : (
                <div
                  className="rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative"
                  role="status"
                >
                  {data.state === "fully_returned"
                    ? "Every eligible line on this sale has already been returned."
                    : "This sale is not returnable."}
                </div>
              )}

              <section className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                  2 · Select returned lines
                </p>
                {errors.lines === undefined ? null : (
                  <p className="text-xs text-negative">{errors.lines}</p>
                )}
                <ul className="space-y-2">
                  {data.lines.map((line) => {
                    const selection = draft.selections[line.saleLineId];
                    const returnable = isEligibilityLineReturnable(line);
                    return (
                      <li
                        className="rounded-control border border-line p-3"
                        key={line.saleLineId}
                      >
                        <label className="flex items-start gap-2.5 text-xs">
                          <input
                            checked={selection !== undefined}
                            className="mt-0.5 size-4 shrink-0"
                            disabled={!returnable}
                            onChange={() => toggleLine(line.saleLineId)}
                            type="checkbox"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-ink-subtle">
                              {eligibilityLineLabel(line)}
                            </span>
                            <span className="mt-0.5 block text-ink-muted">
                              {returnable
                                ? `Refundable ${money(line.refundableMinor)}`
                                : "Already returned"}
                            </span>
                          </span>
                        </label>
                        {selection === undefined ? null : (
                          <div className="mt-2.5 grid gap-2 pl-6 sm:grid-cols-2">
                            <label className="text-[0.6875rem] font-semibold text-ink-subtle">
                              Observed condition
                              <select
                                className={controlClass}
                                onChange={(event) =>
                                  setLineCondition(
                                    line.saleLineId,
                                    event.target.value as ReturnItemCondition,
                                  )
                                }
                                value={selection.condition}
                              >
                                {RETURN_CONDITION_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {line.trackingType === "quantity" ? (
                              <label className="text-[0.6875rem] font-semibold text-ink-subtle">
                                Quantity (max {line.remainingQuantity})
                                <input
                                  className={controlClass}
                                  inputMode="numeric"
                                  max={line.remainingQuantity}
                                  min={1}
                                  onChange={(event) =>
                                    setLineQuantity(
                                      line.saleLineId,
                                      Number(event.target.value),
                                    )
                                  }
                                  type="number"
                                  value={selection.quantity}
                                />
                              </label>
                            ) : null}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                  3 · Reason & evidence
                </p>
                <Field label="Reason for return">
                  <select
                    className={controlClass}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        reason: event.target.value as ReturnReason,
                      }))
                    }
                    value={draft.reason}
                  >
                    {RETURN_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  error={
                    draft.evidenceNote.length > 0
                      ? errors.evidenceNote
                      : undefined
                  }
                  label="Evidence note"
                >
                  <textarea
                    className={`${controlClass} min-h-24 resize-y`}
                    maxLength={1_000}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        evidenceNote: event.target.value,
                      }))
                    }
                    placeholder="What you observed — bench result, box/seal state, battery health…"
                    value={draft.evidenceNote}
                  />
                  <span className="mt-1 flex justify-between gap-3 font-normal text-ink-muted">
                    <span>Evidence is never generated from the reason.</span>
                    <span>{draft.evidenceNote.length}/1000</span>
                  </span>
                </Field>
              </section>

              {createError === null ? null : (
                <WriteErrorBanner
                  error={createError}
                  title="Return was not saved"
                />
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <p className="text-xs text-ink-muted">
            {canSave
              ? "Saving places the returned line(s) into inspection."
              : "No return will be created until a returnable line is selected."}
          </p>
          <div className="flex gap-2">
            <button
              className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canSave}
              onClick={save}
              title={
                canCreate
                  ? "Save the returned line(s) to inspection"
                  : "returns.create permission required"
              }
              type="button"
            >
              {create.isPending ? "Saving…" : "Save to inspection"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

// =============================================================================
// Processing (GET /returns/:id -> POST /returns/:id/post)
// =============================================================================

function ProcessingDrawer({
  returnId,
  canApprove,
  onClose,
  onPosted,
}: {
  readonly returnId: string;
  readonly canApprove: boolean;
  readonly onClose: () => void;
  readonly onPosted: (record: ReturnDetail) => void;
}): JSX.Element {
  const detail = useQuery(returnQueryOptions(returnId, true));
  const post = usePostReturnMutation();
  const idempotencyKey = useRef(globalThis.crypto.randomUUID());

  const [refundEnabled, setRefundEnabled] = useState(false);
  const [refundMethod, setRefundMethod] = useState<ReturnRefundMethod>("cash");
  const [refundReference, setRefundReference] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const data = detail.data;
  const detailError =
    detail.error === null || data !== undefined
      ? null
      : toApiError(detail.error);
  const postError = post.isError ? toApiError(post.error) : null;

  const isDraft = data?.status === "draft";
  const needsOverride =
    data !== undefined && data.policy.expired && !data.policy.overridden;
  const refundReferenceRequired = refundEnabled && refundMethod !== "cash";
  const refundValid =
    !refundReferenceRequired || refundReference.trim().length > 0;
  const overrideValid = !needsOverride || overrideReason.trim().length > 0;
  const canPost =
    canApprove && isDraft && refundValid && overrideValid && !post.isPending;

  const submit = (): void => {
    if (data === undefined || !canPost) return;
    const input: PostReturnInput = {
      version: data.version,
      refund: refundEnabled
        ? {
            method: refundMethod,
            reference: refundMethod === "cash" ? null : refundReference.trim(),
          }
        : null,
      policyOverrideReason: needsOverride ? overrideReason.trim() : null,
    };
    post.mutate(
      { id: data.id, input, idempotencyKey: idempotencyKey.current },
      { onSuccess: (result) => onPosted(result.return) },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#111827]/45"
      role="presentation"
    >
      <button
        aria-label="Close return processing drawer"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="return-processing-title"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <ShieldCheckIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">
              Process return
            </p>
            <h2
              className="mt-0.5 truncate font-bold text-ink"
              id="return-processing-title"
            >
              {data === undefined
                ? "Loading return…"
                : (data.returnNumber ?? "Draft return")}
            </h2>
          </div>
          {data === undefined ? null : (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(data.status)}`}
            >
              {returnStatusLabel(data.status)}
            </span>
          )}
          <button
            aria-label="Close drawer"
            className="ml-1 grid size-9 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {detailError !== null ? (
            <CatalogErrorState
              {...returnReadErrorCopy(detailError)}
              {...(detailError.requestId === undefined
                ? {}
                : { requestId: detailError.requestId })}
              onRetry={() => {
                void detail.refetch();
              }}
            />
          ) : data === undefined ? (
            <CatalogTableSkeleton rows={5} />
          ) : (
            <>
              <section>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Original sale
                </p>
                <dl className="mt-2 divide-y divide-line overflow-hidden rounded-control border border-line text-sm">
                  <div className="flex justify-between gap-4 px-3 py-2.5">
                    <dt className="text-ink-muted">Invoice</dt>
                    <dd className="font-semibold text-ink-subtle">
                      {data.sale.invoiceNumber}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 px-3 py-2.5">
                    <dt className="text-ink-muted">Reason</dt>
                    <dd className="text-right font-semibold text-ink-subtle">
                      {data.reason}
                    </dd>
                  </div>
                  <div className="px-3 py-3">
                    <dt className="text-[0.625rem] font-bold uppercase tracking-wide text-ink-muted">
                      Evidence on file
                    </dt>
                    <dd className="mt-1 text-xs leading-5 text-ink-subtle">
                      {data.evidenceNote}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Returned lines
                </p>
                <div className="mt-2 overflow-hidden rounded-control border border-line">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-surface-subtle text-[0.625rem] uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Item</th>
                        <th className="px-3 py-2 font-semibold">Condition</th>
                        <th className="px-3 py-2 font-semibold">Outcome</th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Refund
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((line) => (
                        <tr className="border-t border-line" key={line.id}>
                          <td className="px-3 py-2.5">
                            <span className="block font-semibold text-ink-subtle">
                              {line.product.name}
                            </span>
                            <span className="font-mono text-ink-muted">
                              {line.trackingType === "serialized"
                                ? line.serializedUnit.identifiers[0]?.value
                                : `Qty ${line.quantity}`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-ink-subtle">
                            {returnConditionLabel(line.condition)}
                          </td>
                          <td className="px-3 py-2.5 text-ink-subtle">
                            {line.outcome === null
                              ? "Pending inspection"
                              : returnOutcomeLabel(line.outcome)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-ink-subtle">
                            {money(line.refundMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Refund total</dt>
                    <dd className="font-semibold text-ink-subtle">
                      {money(data.totals.refundMinor)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Receivable credit</dt>
                    <dd className="font-semibold text-ink-subtle">
                      {money(data.totals.receivableCreditMinor)}
                    </dd>
                  </div>
                </dl>
              </section>

              {isDraft ? (
                <section className="space-y-3 rounded-control border border-line p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                    Settlement
                  </p>
                  <label className="flex items-center gap-2.5 text-xs font-semibold text-ink-subtle">
                    <input
                      checked={refundEnabled}
                      className="size-4"
                      disabled={!canApprove}
                      onChange={(event) =>
                        setRefundEnabled(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Issue a refund now (otherwise the amount is credited to the
                    customer receivable)
                  </label>
                  {refundEnabled ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-[0.6875rem] font-semibold text-ink-subtle">
                        Method
                        <select
                          className={controlClass}
                          disabled={!canApprove}
                          onChange={(event) =>
                            setRefundMethod(
                              event.target.value as ReturnRefundMethod,
                            )
                          }
                          value={refundMethod}
                        >
                          {RETURN_REFUND_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {humanize(method)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {refundMethod === "cash" ? null : (
                        <label className="text-[0.6875rem] font-semibold text-ink-subtle">
                          Provider / transfer reference
                          <input
                            className={controlClass}
                            disabled={!canApprove}
                            maxLength={200}
                            onChange={(event) =>
                              setRefundReference(event.target.value)
                            }
                            placeholder="Required for non-cash"
                            value={refundReference}
                          />
                        </label>
                      )}
                    </div>
                  ) : null}
                  {needsOverride ? (
                    <label className="block text-[0.6875rem] font-semibold text-warning">
                      Policy override reason (return window expired)
                      <input
                        className={controlClass}
                        disabled={!canApprove}
                        maxLength={500}
                        onChange={(event) =>
                          setOverrideReason(event.target.value)
                        }
                        placeholder="Why this expired-window return is being approved"
                        value={overrideReason}
                      />
                    </label>
                  ) : null}
                </section>
              ) : (
                <div className="rounded-control border border-line bg-surface-subtle p-3 text-xs leading-5 text-ink-muted">
                  This return is {returnStatusLabel(data.status).toLowerCase()}{" "}
                  and can no longer be processed.
                </div>
              )}

              <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-bold">Exchange · unavailable</p>
                  <button
                    className="min-h-8 shrink-0 cursor-not-allowed rounded-control border border-warning/40 px-2.5 text-[0.6875rem] font-bold uppercase tracking-wide opacity-60"
                    disabled
                    title={`Exchange is deferred: ${data.exchange.reason}`}
                    type="button"
                  >
                    Request exchange
                  </button>
                </div>
                <p className="mt-0.5">
                  Atomic exchange posting is deferred (
                  <span className="font-mono">{data.exchange.reason}</span>), so
                  a replacement sale cannot be settled here. Process a refund or
                  receivable credit instead.
                </p>
              </div>

              {postError === null ? null : (
                <WriteErrorBanner
                  error={postError}
                  onRetry={
                    postError.code === "OPTIMISTIC_LOCK_FAILED"
                      ? () => {
                          void detail.refetch();
                          post.reset();
                        }
                      : undefined
                  }
                  title="Return was not processed"
                />
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6">
          <p className="text-xs text-ink-muted">
            {canApprove
              ? isDraft
                ? "Posting is atomic and idempotent."
                : "returns.approve granted"
              : "returns.approve required to process"}
          </p>
          <div className="flex gap-2">
            <button
              className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canPost}
              onClick={submit}
              title={
                canApprove
                  ? isDraft
                    ? "Post this return"
                    : "Only a draft return can be posted"
                  : "returns.approve permission required"
              }
              type="button"
            >
              {post.isPending ? "Processing…" : "Process return"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

// =============================================================================
// Returns queue (GET /returns)
// =============================================================================

function ReturnsQueue({
  canCreate,
  onOpen,
  onNew,
}: {
  readonly canCreate: boolean;
  readonly onOpen: (id: string) => void;
  readonly onNew: () => void;
}): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parameters = returnListParametersFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const returns = useQuery(returnsQueryOptions(parameters, true));
  const hasFilters =
    parameters.q !== undefined ||
    parameters.status !== undefined ||
    parameters.saleId !== undefined ||
    parameters.from !== undefined ||
    parameters.to !== undefined;

  const replaceParameters = (
    updates: Readonly<Record<string, string | undefined>>,
    resetPage = true,
  ): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value.length === 0) next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    const query = next.toString();
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  const clearFilters = (): void => {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "status", "saleId", "from", "to", "page"]) {
      next.delete(key);
    }
    const query = next.toString();
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  const search = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    replaceParameters({
      q:
        typeof value === "string"
          ? value.trim().slice(0, LIMITS.MAX_SEARCH_TERM_LENGTH)
          : undefined,
    });
  };

  const returnsError =
    returns.error === null || returns.data !== undefined
      ? null
      : toApiError(returns.error);

  return (
    <div>
      <section
        aria-label="Returns search and filters"
        className="border-b border-line px-4 py-3.5 sm:px-5"
      >
        <form
          className="flex gap-2"
          key={parameters.q ?? ""}
          onSubmit={search}
          role="search"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search returns</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              className="min-h-10 w-full rounded-control border border-line bg-surface-subtle py-2 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-muted/75 focus:border-accent focus:bg-surface"
              defaultValue={parameters.q}
              maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
              name="q"
              placeholder="Search return no., invoice, or IMEI"
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

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-semibold text-ink-subtle">
            Status
            <select
              className={controlClass}
              onChange={(event) =>
                replaceParameters({ status: event.target.value || undefined })
              }
              value={parameters.status ?? ""}
            >
              <option value="">All statuses</option>
              {RETURN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {returnStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            From
            <input
              className={controlClass}
              onChange={(event) =>
                replaceParameters({ from: event.target.value || undefined })
              }
              type="date"
              value={parameters.from ?? ""}
            />
          </label>
          <label className="text-xs font-semibold text-ink-subtle">
            To
            <input
              className={controlClass}
              onChange={(event) =>
                replaceParameters({ to: event.target.value || undefined })
              }
              type="date"
              value={parameters.to ?? ""}
            />
          </label>
        </div>

        {hasFilters ? (
          <button
            className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong"
            onClick={clearFilters}
            type="button"
          >
            Clear search and filters
          </button>
        ) : null}
      </section>

      {returns.isPending ? (
        <div className="p-4 sm:p-5">
          <CatalogTableSkeleton />
        </div>
      ) : null}

      {returnsError === null ? null : (
        <div className="p-4 sm:p-5">
          <CatalogErrorState
            {...returnReadErrorCopy(returnsError)}
            {...(returnsError.requestId === undefined
              ? {}
              : { requestId: returnsError.requestId })}
            onRetry={() => {
              void returns.refetch();
            }}
          />
        </div>
      )}

      {returns.data === undefined ? null : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3 sm:px-5">
            <span className="text-xs text-ink-muted">
              {returns.data.total.toLocaleString()} total
            </span>
            {returns.isFetching ? (
              <span
                className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-muted"
                role="status"
              >
                <span className="size-3 animate-spin rounded-full border-2 border-line border-t-accent" />
                Updating
              </span>
            ) : null}
          </div>

          {returns.data.items.length === 0 && !hasFilters ? (
            <CatalogEmptyState
              description="This organization has no returns yet. Cases appear here only after the API persists them."
              icon={<ReturnIcon className="size-6" />}
              title="No returns yet"
              {...(canCreate
                ? {
                    action: (
                      <button
                        className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                        onClick={onNew}
                        type="button"
                      >
                        <PlusIcon className="size-4" /> New return
                      </button>
                    ),
                  }
                : {
                    action: (
                      <p className="text-xs font-semibold text-ink-subtle">
                        A user with returns.create can open the first return.
                      </p>
                    ),
                  })}
            />
          ) : returns.data.items.length === 0 ? (
            <CatalogNoResultsState onClear={clearFilters} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] border-collapse text-left text-[0.8125rem]">
                  <thead className="bg-surface-subtle text-[0.6875rem] uppercase tracking-[0.04em] text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold sm:px-5">
                        Return
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Original sale
                      </th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Lines</th>
                      <th className="px-3 py-2.5 font-semibold">Refund</th>
                      <th className="px-3 py-2.5 font-semibold">Created</th>
                      <th className="px-4 py-2.5 text-right font-semibold sm:px-5">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.data.items.map((item) => (
                      <tr className="border-t border-line-subtle" key={item.id}>
                        <td className="px-4 py-3.5 sm:px-5">
                          <button
                            aria-haspopup="dialog"
                            className="rounded-control text-left font-semibold text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            onClick={() => onOpen(item.id)}
                            type="button"
                          >
                            {item.returnNumber ?? "Draft"}
                          </button>
                          {item.policyExpired ? (
                            <p className="mt-0.5 text-[0.6875rem] font-semibold text-warning">
                              Window expired
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3.5 font-mono text-xs text-ink-subtle">
                          {item.sale.invoiceNumber}
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                          >
                            {returnStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-ink-subtle">
                          {item.lineCount} · {item.unitCount} units
                        </td>
                        <td className="px-3 py-3.5 font-semibold text-ink-subtle">
                          {money(item.totalRefundMinor)}
                        </td>
                        <td className="px-3 py-3.5 text-ink-muted">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right sm:px-5">
                          <button
                            aria-haspopup="dialog"
                            className="inline-flex min-h-8 items-center gap-1 rounded-control border border-line px-2.5 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            onClick={() => onOpen(item.id)}
                            type="button"
                          >
                            <EyeIcon className="size-3.5" /> Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="flex flex-wrap items-center gap-3 border-t border-line-subtle px-4 py-3 sm:px-5">
                <p className="text-xs text-ink-muted">
                  Showing {(returns.data.page - 1) * returns.data.pageSize + 1}–
                  {Math.min(
                    returns.data.page * returns.data.pageSize,
                    returns.data.total,
                  )}{" "}
                  of {returns.data.total}
                </p>
                <div className="ml-auto flex gap-2">
                  <button
                    className="min-h-8 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={returns.data.page <= 1 || returns.isFetching}
                    onClick={() =>
                      replaceParameters(
                        { page: String(returns.data.page - 1) },
                        false,
                      )
                    }
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="inline-flex min-h-8 items-center px-1 text-xs font-semibold text-ink-subtle">
                    Page {returns.data.page} of{" "}
                    {Math.max(returns.data.totalPages, 1)}
                  </span>
                  <button
                    className="min-h-8 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={
                      returns.data.page >= returns.data.totalPages ||
                      returns.isFetching
                    }
                    onClick={() =>
                      replaceParameters(
                        { page: String(returns.data.page + 1) },
                        false,
                      )
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </footer>
            </>
          )}
        </>
      )}
    </div>
  );
}

function WarrantyPanel(): JSX.Element {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <ShieldCheckIcon className="size-6" />
      </span>
      <h3 className="mt-3 font-bold text-ink">Warranty claims unavailable</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-ink-muted">
        The Warranty module and claims contract are deferred. No open-claim
        count or case row is inferred.
      </p>
    </div>
  );
}

function BackendGapRegistry(): JSX.Element {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">Backend gap registry</h2>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              Queue, eligibility, intake and posting are wired. These are the
              dependencies that remain deferred or unimplemented.
            </p>
          </div>
          <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning">
            {RETURN_BACKEND_GAPS.length} tracked gaps
          </span>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead className="border-b border-line bg-surface-subtle text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Surface</th>
              <th className="px-4 py-3">Required contract</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Current safe behaviour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {RETURN_BACKEND_GAPS.map((gap) => (
              <tr key={gap.id}>
                <td className="px-4 py-3 font-semibold text-ink-subtle">
                  {gap.surface}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                  {gap.endpoint}
                </td>
                <td className="px-4 py-3">
                  <UnavailableBadge deferred={gap.status === "deferred"} />
                </td>
                <td className="max-w-xl px-4 py-3 text-xs leading-5 text-ink-muted">
                  {gap.consequence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ReturnsWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const capabilities = returnCapabilities(auth.data?.permissions);
  const tab = returnTabFrom(new URLSearchParams(searchParams.toString()));

  const switchTab = (nextTab: ReturnTab): void => {
    const query = returnRouteQuery(
      new URLSearchParams(searchParams.toString()),
      nextTab,
    );
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  if (auth.isPending && auth.data === undefined) return <ReturnsLoading />;
  if (auth.isError || auth.data === undefined) {
    return <ReturnsAccessRequired authFailed />;
  }
  if (!capabilities.canView) return <ReturnsAccessRequired />;

  return (
    <div className="space-y-4">
      <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
              <ReturnIcon className="size-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">
                Customer care · Controlled intake
              </p>
              <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
                Returns &amp; Warranty
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
                Take back faulty or unwanted devices safely — every unit passes
                inspection before it can be sold again.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {capabilities.canViewReports ? (
              <Link
                className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
                href="/reports?report=returns"
              >
                Returns report →
              </Link>
            ) : (
              <button
                className="min-h-10 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-muted opacity-55"
                disabled
                title="reports.view permission required"
                type="button"
              >
                Returns report →
              </button>
            )}
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!capabilities.canCreate}
              onClick={() => setNewOpen(true)}
              title={
                capabilities.canCreate
                  ? "Open controlled return intake"
                  : "returns.create permission required"
              }
              type="button"
            >
              <PlusIcon className="size-4" /> New return
            </button>
          </div>
        </div>
      </header>

      <section className="flex items-start gap-3 rounded-card border border-info/25 bg-info-soft p-4 text-sm leading-6 text-info">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
        <p>
          A returned unit never goes <strong>straight back to Available</strong>
          . It is verified against the original sale, inspected, then either
          restocked, quarantined, claimed on warranty, or written off — with a
          full audit trail.
        </p>
      </section>

      {savedNotice === null ? null : (
        <div
          className="flex items-start gap-2.5 rounded-card border border-positive/25 bg-positive-soft p-3 text-sm text-positive"
          role="status"
        >
          <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>{savedNotice}</p>
          <button
            aria-label="Dismiss saved message"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-control hover:bg-positive/10"
            onClick={() => setSavedNotice(null)}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div
          aria-label="Returns and warranty queues"
          className="flex overflow-x-auto border-b border-line bg-surface"
          role="tablist"
        >
          {RETURN_TABS.map((item) => (
            <button
              aria-selected={tab === item.id}
              className={`min-h-12 whitespace-nowrap border-b-2 px-5 text-sm font-semibold ${tab === item.id ? "border-accent text-accent" : "border-transparent text-ink-muted hover:text-ink"}`}
              key={item.id}
              onClick={() => switchTab(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-bold text-ink">
              {tab === "returns" ? "Returns queue" : "Warranty claims"}
            </h2>
            <p className="mt-1 text-xs text-ink-muted">
              {tab === "returns"
                ? "Change-of-mind & faulty units · open a case to inspect and post it"
                : "Faults under manufacturer or shop warranty"}
            </p>
          </div>
          {tab === "warranty" ? <UnavailableBadge deferred /> : null}
        </header>
        {tab === "returns" ? (
          <ReturnsQueue
            canCreate={capabilities.canCreate}
            onNew={() => setNewOpen(true)}
            onOpen={(id) => setProcessingId(id)}
          />
        ) : (
          <WarrantyPanel />
        )}
      </section>

      <BackendGapRegistry />

      {newOpen ? (
        <NewReturnDrawer
          canCreate={capabilities.canCreate}
          canViewSales={capabilities.canViewSales}
          onClose={() => setNewOpen(false)}
          onSaved={(created) => {
            setNewOpen(false);
            setProcessingId(created.id);
            setSavedNotice(
              `Return ${created.returnNumber ?? "draft"} was saved to inspection.`,
            );
          }}
        />
      ) : null}

      {processingId === null ? null : (
        <ProcessingDrawer
          canApprove={capabilities.canApprove}
          onClose={() => setProcessingId(null)}
          onPosted={(record) => {
            setProcessingId(null);
            setSavedNotice(
              `Return ${record.returnNumber ?? record.id} was processed.`,
            );
          }}
          returnId={processingId}
        />
      )}
    </div>
  );
}

export function ReturnsRouteFallback(): JSX.Element {
  return <ReturnsLoading />;
}
