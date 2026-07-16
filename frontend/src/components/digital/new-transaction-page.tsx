"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX, type ReactNode } from "react";
import { CloseIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  BALANCE_ACCOUNTS,
  DIGITAL_DIRECTIONS,
  DIGITAL_SERVICES,
  DIGITAL_SERVICE_AVAILABILITY,
  DIGITAL_STATUSES,
  FEE_COLLECTION_METHODS,
  digitalCapabilities,
  serviceFieldKind,
  transactionReviewBlockers,
  type DigitalDirection,
  type DigitalService,
  type DigitalStatus,
  type FeeCollectionMethod,
} from "./digital-state";
import {
  Card,
  DigitalApiNotice,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  fieldLabelClass,
  inputClass,
} from "./digital-ui";

const billTypes = [
  "Electricity",
  "Gas",
  "Water",
  "Internet",
  "Telephone",
  "Other",
] as const;
const billCompanies = [
  "LESCO",
  "SNGPL",
  "WASA",
  "PTCL",
  "StormFiber",
  "Other",
] as const;

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
    <label className="block min-w-0 flex-1">
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

function LocalInput({
  className = "",
  ...props
}: JSX.IntrinsicElements["input"]): JSX.Element {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

function ServiceFields({
  direction,
  feeMethod,
  onFeeMethod,
  service,
}: {
  readonly direction: DigitalDirection;
  readonly feeMethod: FeeCollectionMethod;
  readonly onFeeMethod: (value: FeeCollectionMethod) => void;
  readonly service: DigitalService;
}): JSX.Element {
  const kind = serviceFieldKind(service);
  return (
    <div className="mt-4 space-y-3">
      {kind === "wallet" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer Mobile Number">
            <LocalInput placeholder="03xx-xxxxxxx" />
          </Field>
          <Field label="Customer name" optional>
            <LocalInput />
          </Field>
        </div>
      ) : null}
      {kind === "bank" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bank Name">
              <LocalInput />
            </Field>
            <Field label="Beneficiary Name">
              <LocalInput />
            </Field>
          </div>
          <Field label="Masked Account / IBAN Reference">
            <LocalInput className="font-mono" placeholder="PK**1234" />
          </Field>
        </>
      ) : null}
      {kind === "bill" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bill Type">
              <select className={inputClass} defaultValue={billTypes[0]}>
                {billTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            <Field label="Company / Provider">
              <select className={inputClass} defaultValue={billCompanies[0]}>
                {billCompanies.map((company) => (
                  <option key={company}>{company}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Consumer / Reference Number">
            <LocalInput className="font-mono" />
          </Field>
        </>
      ) : null}
      {kind === "load" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer Mobile Number">
              <LocalInput placeholder="03xx-xxxxxxx" />
            </Field>
            <Field label="Network">
              <select
                className={inputClass}
                defaultValue={service === "Jazz Load" ? "Jazz" : "Zong"}
              >
                <option>Jazz</option>
                <option>Zong</option>
                <option>Other</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Load or Bundle">
              <select className={inputClass} defaultValue="Load">
                <option>Load</option>
                <option>Bundle</option>
              </select>
            </Field>
            <Field label="Package name" optional>
              <LocalInput />
            </Field>
          </div>
        </>
      ) : null}
      {kind === "other" ? (
        <Field label="Service reference">
          <LocalInput />
        </Field>
      ) : null}
      {direction === "RECEIVED_INTO_SHOP" ? (
        <Field label="Fee Collection Method">
          <select
            className={inputClass}
            onChange={(event) =>
              onFeeMethod(event.target.value as FeeCollectionMethod)
            }
            value={feeMethod}
          >
            {FEE_COLLECTION_METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );
}

function PreviewRow({
  label,
  value = "Unavailable",
}: {
  readonly label: string;
  readonly value?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-line-subtle py-1.5 text-xs last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function FinancialPreview({
  amount,
  canViewFeeRules,
  direction,
  feeMethod,
  status,
}: {
  readonly amount: string;
  readonly canViewFeeRules: boolean;
  readonly direction: DigitalDirection;
  readonly feeMethod: FeeCollectionMethod;
  readonly status: DigitalStatus;
}) {
  const principal =
    amount.trim().length === 0 ? "—" : `PKR ${amount.trim()} (entered)`;
  const sent = direction === "SENT_FROM_SHOP";
  const rows = sent
    ? [
        "Principal Amount",
        "Customer Service Fee",
        "Customer Gives Cash",
        "Provider Gross Commission",
        "Commission Tax",
        "Provider Net Commission",
        "Other Direct Charges",
        "Gross Service Earnings",
        "Net Service Earnings",
        "Physical Cash Increase",
        "Provider Float Decrease",
      ]
    : [
        "Principal Amount Received Digitally",
        "Customer Service Fee",
        "Fee Collection Method",
        "Cash Given to Customer",
        "Additional Cash Fee Received",
        "Provider Gross Commission",
        "Commission Tax",
        "Provider Net Commission",
        "Other Direct Charges",
        "Gross Service Earnings",
        "Net Service Earnings",
        "Physical Cash Decrease",
        "Provider Float Increase",
      ];
  return (
    <>
      <div className="p-[1.125rem]">
        {rows.map((label, index) => (
          <PreviewRow
            key={label}
            label={label}
            {...(index === 0
              ? { value: principal }
              : label === "Fee Collection Method"
                ? { value: feeMethod }
                : {})}
          />
        ))}
        <div className="mt-3 rounded-control bg-warning-soft p-3 text-xs text-warning">
          {canViewFeeRules
            ? "Fee rules and financial calculations are waiting for the server API. No browser-side fee schedule is used."
            : "Fee preview requires external_fee_rules.view. No fee, commission, float or earnings values were calculated."}
        </div>
        {status === "SUCCESSFUL" ? null : (
          <div className="mt-3 rounded-control bg-warning-soft p-3 text-xs text-warning">
            {status} transactions would be recorded without affecting settled
            balances or earnings.
          </div>
        )}
      </div>
    </>
  );
}

function ReviewModal({
  amount,
  blockers,
  cashier,
  direction,
  onClose,
  providerReference,
  service,
  status,
}: {
  readonly amount: string;
  readonly blockers: readonly string[];
  readonly cashier: string;
  readonly direction: DigitalDirection;
  readonly onClose: () => void;
  readonly providerReference: string;
  readonly service: DigitalService;
  readonly status: DigitalStatus;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="digital-review-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[35rem] flex-col overflow-hidden rounded-card bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold" id="digital-review-title">
            Review digital service transaction
          </h2>
          <button
            aria-label="Close transaction review"
            className="ml-auto grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-control border border-accent/25 bg-accent-soft p-3 text-sm text-accent-ink">
            <PreviewRow label="Service" value={service} />
            <PreviewRow
              label="Direction"
              value={
                direction === "SENT_FROM_SHOP"
                  ? "Amount Sent from shop"
                  : "Amount Received into shop"
              }
            />
            <PreviewRow
              label="Principal amount"
              value={amount.length === 0 ? "—" : `PKR ${amount} (entered)`}
            />
            <PreviewRow label="Customer service fee" />
            <PreviewRow label="Customer cash paid or received" />
            <PreviewRow label="Provider float impact" />
            <PreviewRow
              label="Provider transaction ID"
              value={
                providerReference.trim().length === 0 ? "—" : providerReference
              }
            />
            <PreviewRow label="Provider commission" />
            <PreviewRow label="Net service earnings" />
            <PreviewRow label="Status" value={status} />
            <PreviewRow label="Cashier" value={cashier || "—"} />
            <PreviewRow label="Timestamp" value="Not saved" />
          </div>
          <div className="mt-4 rounded-control border border-negative/25 bg-negative-soft p-4 text-xs text-negative">
            <p className="font-semibold">Confirm and Save is blocked</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Review uses only values entered on this page. No provider was
            contacted and no transaction ID, fee, timestamp or balance impact
            was generated.
          </p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            className="min-h-9 rounded-control border border-line px-3.5 text-sm font-semibold text-ink-subtle"
            onClick={onClose}
            type="button"
          >
            Back to Edit
          </button>
          <button
            className="min-h-9 rounded-control bg-accent px-3.5 text-sm font-semibold text-white opacity-45"
            disabled
            type="button"
          >
            Confirm and Save
          </button>
        </footer>
      </section>
    </div>
  );
}

export function DigitalNewTransactionRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalNewTransactionPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = digitalCapabilities(auth.data?.permissions);
  const [service, setService] = useState<DigitalService>(DIGITAL_SERVICES[0]);
  const [status, setStatus] = useState<DigitalStatus>(DIGITAL_STATUSES[0]);
  const [direction, setDirection] = useState<DigitalDirection>(
    DIGITAL_DIRECTIONS[0],
  );
  const [amountSent, setAmountSent] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [feeMethod, setFeeMethod] = useState<FeeCollectionMethod>(
    FEE_COLLECTION_METHODS[0],
  );
  const [providerReference, setProviderReference] = useState("");
  const [cashier, setCashier] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const amount = direction === "SENT_FROM_SHOP" ? amountSent : amountReceived;
  const effectiveCashier = cashier || auth.data?.user.fullName || "";
  const blockers = transactionReviewBlockers(
    {
      service,
      status,
      direction,
      principalAmount: amount,
      feeCollectionMethod: feeMethod,
      providerTransactionId: providerReference,
      cashierName: effectiveCashier,
    },
    capabilities,
    DIGITAL_SERVICE_AVAILABILITY,
  );

  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Viewing this workflow requires the server-provided permission."
        permission="external_services.view"
      />
    );
  }
  if (!capabilities.canRecord) {
    return (
      <DigitalPermissionGate
        description="Preparing a new manual provider record requires the server-provided permission."
        permission="external_services.record"
      />
    );
  }

  const chooseDirection = (next: DigitalDirection): void => {
    setDirection(next);
    if (next === "SENT_FROM_SHOP") setAmountReceived("");
    else setAmountSent("");
  };

  return (
    <>
      <DigitalPageHeader
        actions={[
          { href: "/digital/history", label: "History" },
          { href: "/digital/balances", label: "Balances" },
        ]}
        subtitle="Record an external JazzCash, Easypaisa, bank, bill or load transaction after completing it in the official provider app."
        title="Digital Services — New Transaction"
      />
      <DigitalApiNotice>
        This screen prepares a manual shop entry only. It does not connect to
        JazzCash, Easypaisa, banks, utilities or telecom providers. The save API
        and fee-rule API are not implemented, so final persistence is disabled.
      </DigitalApiNotice>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Service">
            <div className="p-[1.125rem]">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13.75rem]">
                <Field label="Service">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setService(event.target.value as DigitalService)
                    }
                    value={service}
                  >
                    {DIGITAL_SERVICES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setStatus(event.target.value as DigitalStatus)
                    }
                    value={status}
                  >
                    {DIGITAL_STATUSES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <ServiceFields
                direction={direction}
                feeMethod={feeMethod}
                onFeeMethod={setFeeMethod}
                service={service}
              />
            </div>
          </Card>

          <div className="grid gap-4 min-[821px]:grid-cols-2">
            <section
              className={`min-h-[11.125rem] rounded-card border-2 p-[1.125rem] text-left shadow-card ${
                direction === "SENT_FROM_SHOP"
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface opacity-65 hover:border-accent"
              }`}
            >
              <button
                className="block w-full text-left"
                onClick={() => chooseDirection("SENT_FROM_SHOP")}
                type="button"
              >
                <span className="block text-lg font-bold text-ink">
                  AMOUNT SENT
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Sent from shop wallet, account or provider float
                </span>
              </button>
              <label className="mt-4 block">
                <span className="block text-xs font-semibold text-ink-subtle">
                  Amount
                </span>
                <LocalInput
                  className="mt-1 min-h-[3.25rem] text-2xl font-bold"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => {
                    setAmountSent(event.target.value);
                    chooseDirection("SENT_FROM_SHOP");
                  }}
                  onFocus={() => chooseDirection("SENT_FROM_SHOP")}
                  placeholder="PKR"
                  type="number"
                  value={amountSent}
                />
              </label>
            </section>
            <section
              className={`min-h-[11.125rem] rounded-card border-2 p-[1.125rem] text-left shadow-card ${
                direction === "RECEIVED_INTO_SHOP"
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface opacity-65 hover:border-accent"
              }`}
            >
              <button
                className="block w-full text-left"
                onClick={() => chooseDirection("RECEIVED_INTO_SHOP")}
                type="button"
              >
                <span className="block text-lg font-bold text-ink">
                  AMOUNT RECEIVED
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Received into shop wallet, account or provider float
                </span>
              </button>
              <label className="mt-4 block">
                <span className="block text-xs font-semibold text-ink-subtle">
                  Amount
                </span>
                <LocalInput
                  className="mt-1 min-h-[3.25rem] text-2xl font-bold"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => {
                    setAmountReceived(event.target.value);
                    chooseDirection("RECEIVED_INTO_SHOP");
                  }}
                  onFocus={() => chooseDirection("RECEIVED_INTO_SHOP")}
                  placeholder="PKR"
                  type="number"
                  value={amountReceived}
                />
              </label>
            </section>
          </div>

          <Card title="Customer and provider details">
            <div className="space-y-3 p-[1.125rem]">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Customer Name" optional>
                  <LocalInput />
                </Field>
                <Field label="Customer Mobile Number">
                  <LocalInput placeholder="03xx-xxxxxxx" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Customer / Account Reference">
                  <LocalInput />
                </Field>
                <Field label="Provider Transaction ID">
                  <LocalInput
                    className="font-mono"
                    onChange={(event) =>
                      setProviderReference(event.target.value)
                    }
                    value={providerReference}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="External Transaction Date and Time">
                  <LocalInput type="datetime-local" />
                </Field>
                <Field label="Cashier">
                  <LocalInput
                    onChange={(event) => setCashier(event.target.value)}
                    placeholder={auth.data.user.fullName}
                    value={cashier}
                  />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Provider Gross Commission">
                  <LocalInput
                    min="0"
                    placeholder="API calculated"
                    type="number"
                  />
                </Field>
                <Field label="Provider Commission Tax">
                  <LocalInput
                    min="0"
                    placeholder="API calculated"
                    type="number"
                  />
                </Field>
                <Field label="Other Direct Charges">
                  <LocalInput
                    min="0"
                    placeholder="API calculated"
                    type="number"
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  className={`${inputClass} min-h-20 py-2.5`}
                  placeholder="Never store PIN, OTP, MPIN, password or biometric information."
                  rows={2}
                />
              </Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card
            hint={
              capabilities.canViewFeeRules
                ? "Fee rule API pending"
                : "Fee permission required"
            }
            title="Live financial preview"
          >
            <FinancialPreview
              amount={amount}
              canViewFeeRules={capabilities.canViewFeeRules}
              direction={direction}
              feeMethod={feeMethod}
              status={status}
            />
          </Card>
          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-accent px-4 text-[0.9375rem] font-semibold text-white hover:bg-accent-strong"
            onClick={() => setReviewOpen(true)}
            type="button"
          >
            Review &amp; Save Transaction
          </button>
          <Card title="Current balances">
            <div className="p-[1.125rem]">
              {BALANCE_ACCOUNTS.slice(0, 4).map((account) => (
                <PreviewRow key={account} label={account} />
              ))}
              <div className="mt-3 flex gap-2 rounded-control bg-warning-soft p-3 text-xs text-warning">
                <ShieldCheckIcon className="size-4 shrink-0" />
                Balance API pending. No opening or current amount is inferred.
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {reviewOpen ? (
        <ReviewModal
          amount={amount}
          blockers={blockers}
          cashier={effectiveCashier}
          direction={direction}
          onClose={() => setReviewOpen(false)}
          providerReference={providerReference}
          service={service}
          status={status}
        />
      ) : null}
    </>
  );
}
