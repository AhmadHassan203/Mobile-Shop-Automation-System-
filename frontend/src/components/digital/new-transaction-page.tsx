"use client";

import {
  EXTERNAL_PROVIDERS,
  EXTERNAL_TRANSACTION_TYPES,
  formatMoney,
  PAYMENT_METHODS,
  toMinor,
  type ExternalProvider,
  type ExternalTransaction,
  type ExternalTransactionType,
  type PaymentMethod,
} from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type JSX, type ReactNode } from "react";
import {
  CatalogEmptyState,
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { ShieldCheckIcon } from "@/components/ui/icons";
import { toApiError, type ApiError } from "@/lib/api/client";
import { createExternalTransaction } from "@/lib/api/external";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { externalTransactionsQueryOptions } from "@/lib/query/external-query";
import { queryKeys } from "@/lib/query/keys";
import {
  buildExternalInput,
  CASH_DIRECTION_LABELS,
  externalCapabilities,
  externalPreview,
  EXTERNAL_PROVIDER_LABELS,
  EXTERNAL_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  recordExternalTransaction,
  type ExternalFormValues,
} from "./external-transaction-state";
import {
  Card,
  DigitalPageHeader,
  DigitalRouteSkeleton,
  fieldLabelClass,
  inputClass,
  tableClass,
  thClass,
} from "./digital-ui";

const EMPTY_FORM: ExternalFormValues = {
  provider: EXTERNAL_PROVIDERS[0],
  transactionType: EXTERNAL_TRANSACTION_TYPES[0],
  principalMajor: "",
  providerChargeMajor: "",
  paymentMethod: PAYMENT_METHODS[0],
  providerReference: "",
  accountReference: "",
  customerName: "",
  customerPhone: "",
  note: "",
};

function submissionMessage(error: ApiError): string {
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return "Your current permissions no longer allow recording external transactions. Nothing was recorded.";
  }
  if (error.code === "VALIDATION_FAILED") {
    return "The API rejected the transaction. Review the amounts and try again.";
  }
  if (error.code === "NETWORK_ERROR") {
    return "The external-service API could not be reached, so nothing was recorded. Check your connection and try again.";
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return "The external-service API did not respond in time, so nothing was recorded.";
  }
  if (error.code === "CLIENT_VALIDATION_FAILED") return error.message;
  return "The transaction could not be recorded. Review the fields and try again.";
}

function Field({
  label,
  optional = false,
  children,
}: {
  readonly label: string;
  readonly optional?: boolean;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <label className="block min-w-0">
      <span className={fieldLabelClass}>
        {label}{" "}
        {optional ? (
          <span className="font-normal text-ink-muted">(optional)</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function PreviewRow({
  label,
  value,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}): JSX.Element {
  return (
    <div className="flex justify-between gap-3 border-b border-line-subtle py-2 text-xs last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span
        className={`text-right font-semibold ${emphasis ? "text-accent" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}

function RecordedTransaction({
  currency,
  onRecordAnother,
  transaction,
}: {
  readonly currency: string;
  readonly onRecordAnother: () => void;
  readonly transaction: ExternalTransaction;
}): JSX.Element {
  const money = (minor: number): string =>
    formatMoney(toMinor(minor, "external amount"), currency);
  return (
    <Card hint="Recorded by the server" title="Transaction recorded">
      <div className="p-[1.125rem]">
        <div className="mb-3 flex items-start gap-2.5 rounded-control border border-positive/25 bg-positive-soft p-3 text-xs text-positive">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            Transaction {transaction.txnNumber} was recorded for{" "}
            {transaction.businessDate}. The figures below are the server&apos;s,
            not this browser&apos;s.
          </span>
        </div>
        <PreviewRow
          label="Provider"
          value={EXTERNAL_PROVIDER_LABELS[transaction.provider]}
        />
        <PreviewRow
          label="Transaction type"
          value={EXTERNAL_TYPE_LABELS[transaction.transactionType]}
        />
        <PreviewRow
          label="Principal (customer money, not profit)"
          value={money(transaction.principalMinor)}
        />
        <PreviewRow
          emphasis
          label="Fee charged (revenue)"
          value={money(transaction.feeChargedMinor)}
        />
        <PreviewRow
          label="Provider charge"
          value={money(transaction.providerChargeMinor)}
        />
        <PreviewRow
          emphasis
          label="Service profit (fee − provider charge)"
          value={money(transaction.serviceProfitMinor)}
        />
        <PreviewRow
          label="Cash direction"
          value={CASH_DIRECTION_LABELS[transaction.direction]}
        />
        <PreviewRow
          label="Drawer cash impact"
          value={money(transaction.cashImpactMinor)}
        />
        <button
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
          onClick={onRecordAnother}
          type="button"
        >
          Record another transaction
        </button>
      </div>
    </Card>
  );
}

function RecentTransactions({
  canView,
  currency,
}: {
  readonly canView: boolean;
  readonly currency: string;
}): JSX.Element {
  const query = useQuery(
    externalTransactionsQueryOptions({ page: 1, pageSize: 10 }, canView),
  );
  const money = (minor: number): string =>
    formatMoney(toMinor(minor, "external amount"), currency);

  if (query.isPending) return <CatalogTableSkeleton rows={4} />;

  if (query.data === undefined) {
    const error = toApiError(query.error);
    return (
      <CatalogErrorState
        description="The external-service API did not return a valid transaction page. No fallback or mock rows are shown."
        onRetry={() => {
          void query.refetch();
        }}
        title="Recent transactions could not be loaded"
        {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
      />
    );
  }

  if (query.data.items.length === 0) {
    return (
      <CatalogEmptyState
        description="External transactions appear here after the API records them. No placeholder rows are shown."
        title="No external transactions yet"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            {[
              "Txn #",
              "Date",
              "Provider",
              "Type",
              "Principal",
              "Fee",
              "Service profit",
              "Direction",
            ].map((header) => (
              <th className={thClass} key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {query.data.items.map((txn) => (
            <tr className="border-t border-line-subtle" key={txn.id}>
              <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-ink">
                {txn.txnNumber}
              </td>
              <td className="px-3.5 py-2.5 text-ink-muted">
                {txn.businessDate}
              </td>
              <td className="px-3.5 py-2.5 text-ink">
                {EXTERNAL_PROVIDER_LABELS[txn.provider]}
              </td>
              <td className="px-3.5 py-2.5 text-ink">
                {EXTERNAL_TYPE_LABELS[txn.transactionType]}
              </td>
              <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                {money(txn.principalMinor)}
              </td>
              <td className="px-3.5 py-2.5 text-right font-mono text-ink">
                {money(txn.feeChargedMinor)}
              </td>
              <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-accent">
                {money(txn.serviceProfitMinor)}
              </td>
              <td className="px-3.5 py-2.5 text-ink-muted">
                {txn.direction === "cash_in" ? "Cash in" : "Cash out"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DigitalNewTransactionRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalNewTransactionPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ExternalFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recorded, setRecorded] = useState<ExternalTransaction | null>(null);
  // One idempotency key per logical transaction. It is minted lazily on the
  // first submit, reused across every retry after an uncertain response, and
  // retired only on a confirmed success or a deliberate reset (below), so a
  // retry never records a duplicate.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const capabilities = externalCapabilities(auth.data?.permissions);
  const currency = auth.data?.organization.currency ?? "PKR";

  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <CatalogForbiddenState
        description="Viewing external money-service transactions requires the server-provided external.view permission. No external-service request was sent."
        title="External services access required"
      />
    );
  }

  const preview = externalPreview(values);
  const money = (minor: number): string =>
    formatMoney(toMinor(minor, "external amount"), currency);
  const update = <TKey extends keyof ExternalFormValues>(
    key: TKey,
    value: ExternalFormValues[TKey],
  ): void => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFormError(null);
  };

  const submit = async (): Promise<void> => {
    if (submitting || !capabilities.canCreate) return;
    setFormError(null);
    setSubmissionError(null);
    const result = buildExternalInput(values);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSubmitting(true);
    try {
      // The key held in state is reused on retry and minted only when absent;
      // recordExternalTransaction retires it after this confirmed success.
      const saved = await recordExternalTransaction(result.input, {
        heldKey: idempotencyKey,
        setHeldKey: setIdempotencyKey,
        create: createExternalTransaction,
      });
      setRecorded(saved);
      setValues(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: queryKeys.externalRoot });
    } catch (error) {
      setSubmissionError(toApiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DigitalPageHeader
        actions={[{ href: "/digital/history", label: "History" }]}
        subtitle="Record an external JazzCash, Easypaisa, bank, utility or load transaction the cashier already completed in the provider app. The principal is the customer's money, never shop profit."
        title="Digital Services — New External Transaction"
      />

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {recorded === null ? null : (
            <RecordedTransaction
              currency={currency}
              onRecordAnother={() => {
                // Deliberate "new transaction": drop the retired key so the
                // next submit mints a fresh one for a distinct transaction.
                setIdempotencyKey(null);
                setRecorded(null);
              }}
              transaction={recorded}
            />
          )}

          <Card title="Transaction details">
            <div className="space-y-3 p-[1.125rem]">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Provider">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      update("provider", event.target.value as ExternalProvider)
                    }
                    value={values.provider}
                  >
                    {EXTERNAL_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {EXTERNAL_PROVIDER_LABELS[provider]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Transaction type">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      update(
                        "transactionType",
                        event.target.value as ExternalTransactionType,
                      )
                    }
                    value={values.transactionType}
                  >
                    {EXTERNAL_TRANSACTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EXTERNAL_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Principal amount (PKR)">
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      update("principalMajor", event.target.value)
                    }
                    placeholder="e.g. 1000"
                    step="0.01"
                    type="number"
                    value={values.principalMajor}
                  />
                </Field>
                <Field label="Provider charge (PKR)" optional>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      update("providerChargeMajor", event.target.value)
                    }
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={values.providerChargeMajor}
                  />
                </Field>
              </div>
              <Field label="Payment method">
                <select
                  className={inputClass}
                  onChange={(event) =>
                    update(
                      "paymentMethod",
                      event.target.value as PaymentMethod,
                    )
                  }
                  value={values.paymentMethod}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Provider reference" optional>
                  <input
                    className={`${inputClass} font-mono`}
                    onChange={(event) =>
                      update("providerReference", event.target.value)
                    }
                    value={values.providerReference}
                  />
                </Field>
                <Field label="Account / bill reference" optional>
                  <input
                    className={`${inputClass} font-mono`}
                    onChange={(event) =>
                      update("accountReference", event.target.value)
                    }
                    value={values.accountReference}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Customer name" optional>
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      update("customerName", event.target.value)
                    }
                    value={values.customerName}
                  />
                </Field>
                <Field label="Customer phone" optional>
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      update("customerPhone", event.target.value)
                    }
                    placeholder="03xx-xxxxxxx"
                    value={values.customerPhone}
                  />
                </Field>
              </div>
              <Field label="Note" optional>
                <textarea
                  className={`${inputClass} min-h-16 py-2.5`}
                  onChange={(event) => update("note", event.target.value)}
                  placeholder="Never store PIN, OTP or password information."
                  rows={2}
                  value={values.note}
                />
              </Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card
            hint="Server recomputes on save"
            title="Live fee &amp; profit preview"
          >
            <div className="p-[1.125rem]">
              <PreviewRow
                label="Principal (customer money)"
                value={
                  preview.principalValid && preview.principalMinor !== null
                    ? money(preview.principalMinor)
                    : "—"
                }
              />
              <PreviewRow
                label="Cash direction"
                value={CASH_DIRECTION_LABELS[preview.direction]}
              />
              <PreviewRow
                emphasis
                label="Fee charged (revenue)"
                value={preview.feeMinor === null ? "—" : money(preview.feeMinor)}
              />
              <PreviewRow
                label="Provider charge"
                value={money(preview.providerChargeMinor)}
              />
              <PreviewRow
                emphasis
                label="Service profit (fee − provider charge)"
                value={
                  preview.serviceProfitMinor === null
                    ? "—"
                    : money(preview.serviceProfitMinor)
                }
              />
              <div className="mt-3 flex items-start gap-2 rounded-control bg-warning-soft p-3 text-xs text-warning">
                <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
                The principal is the customer&apos;s money passing through — it is
                not revenue or profit. Only the fee is revenue; service profit is
                the fee less the provider charge. The server recomputes every
                figure on save.
              </div>
            </div>
          </Card>

          {formError === null ? null : (
            <div
              className="rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
              role="alert"
            >
              {formError}
            </div>
          )}
          {submissionError === null ? null : (
            <div
              className="rounded-control border border-negative/25 bg-negative-soft p-3 text-sm text-negative"
              role="alert"
            >
              <p className="font-semibold">Transaction was not recorded</p>
              <p className="mt-0.5">{submissionMessage(submissionError)}</p>
              {submissionError.requestId === undefined ? null : (
                <p className="mt-1 font-mono text-xs">
                  Ref: {submissionError.requestId}
                </p>
              )}
            </div>
          )}

          {capabilities.canCreate ? (
            <button
              className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-accent px-4 text-[0.9375rem] font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting || !preview.principalValid}
              onClick={() => {
                void submit();
              }}
              type="button"
            >
              {submitting ? "Recording…" : "Record transaction"}
            </button>
          ) : (
            <p className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
              Recording requires the external.create permission. You can review
              transactions but not record new ones.
            </p>
          )}
        </aside>
      </div>

      <section className="mt-4">
        <Card title="Recent external transactions">
          <div className="p-[1.125rem]">
            <RecentTransactions canView={capabilities.canView} currency={currency} />
          </div>
        </Card>
      </section>
    </>
  );
}
