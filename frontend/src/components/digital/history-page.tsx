"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { CloseIcon, EyeIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  DIGITAL_DIRECTIONS,
  DIGITAL_SERVICES,
  DIGITAL_STATUSES,
  digitalCapabilities,
  type DigitalDirection,
  type DigitalService,
  type DigitalStatus,
} from "./digital-state";
import {
  Card,
  DigitalApiNotice,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  UnavailableTableRow,
  fieldLabelClass,
  inputClass,
  tableClass,
  thClass,
} from "./digital-ui";

const detailRows = [
  "Status",
  "Direction",
  "Principal",
  "Customer service fee",
  "Customer cash paid",
  "Customer payout",
  "Provider float in",
  "Provider float out",
  "Physical cash in",
  "Physical cash out",
  "Provider net commission",
  "Net service earnings",
  "Provider reference",
  "Customer",
  "Reversal of",
  "Notes",
] as const;

function DetailDrawer({
  canRecord,
  canReverse,
  onClose,
}: {
  readonly canRecord: boolean;
  readonly canReverse: boolean;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-labelledby="digital-detail-title"
        aria-modal="true"
        className="flex h-full w-full max-w-[28.75rem] flex-col bg-surface shadow-overlay"
        role="dialog"
      >
        <header className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold" id="digital-detail-title">
            Transaction details
          </h2>
          <button
            aria-label="Close transaction details"
            className="ml-auto grid size-8 place-items-center rounded-control text-ink-muted hover:bg-surface-subtle"
            onClick={onClose}
            type="button"
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 rounded-control bg-warning-soft p-3 text-xs text-warning">
            Transaction detail API pending. This drawer preserves the complete
            record layout without inventing a transaction.
          </div>
          {detailRows.map((label) => (
            <div
              className="flex justify-between gap-3 border-b border-line-subtle py-2 text-xs last:border-0"
              key={label}
            >
              <span className="text-ink-muted">{label}</span>
              <span className="font-semibold text-ink">Unavailable</span>
            </div>
          ))}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            className="min-h-9 rounded-control border border-positive/30 px-3 text-xs font-semibold text-positive opacity-45"
            disabled
            title={
              canRecord
                ? "Status mutation API is not implemented"
                : "Requires external_services.record"
            }
            type="button"
          >
            Mark Successful
          </button>
          <button
            className="min-h-9 rounded-control border border-negative/30 px-3 text-xs font-semibold text-negative opacity-45"
            disabled
            title={
              canReverse
                ? "Reversal API is not implemented"
                : "Requires external_services.reverse"
            }
            type="button"
          >
            Reverse
          </button>
          <button
            className="min-h-9 rounded-control px-3 text-xs font-semibold text-ink-muted opacity-45"
            disabled
            type="button"
          >
            Dispute
          </button>
        </footer>
      </aside>
    </div>
  );
}

export function DigitalHistoryRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalHistoryPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = digitalCapabilities(auth.data?.permissions);
  const [date, setDate] = useState("");
  const [service, setService] = useState<DigitalService | "">("");
  const [direction, setDirection] = useState<DigitalDirection | "">("");
  const [status, setStatus] = useState<DigitalStatus | "">("");
  const [cashier, setCashier] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Transaction history requires the server-provided permission."
        permission="external_services.view"
      />
    );
  }

  return (
    <>
      <DigitalPageHeader
        actions={[
          { href: "/digital/new", label: "New transaction", primary: true },
          { href: "/digital/reconciliation", label: "Reconcile" },
        ]}
        subtitle="Manual records for external provider transactions, with pending, dispute and reversal controls."
        title="Digital Services — Transaction History"
      />
      <DigitalApiNotice>
        Transaction reads and status mutations are not implemented. Filters
        remain operational for future server rows; the empty result is
        authoritative for this unavailable boundary, not a zero-activity claim.
      </DigitalApiNotice>

      <Card className="mb-4" title="Filters">
        <div className="grid gap-3 p-[1.125rem] sm:grid-cols-2 xl:grid-cols-5">
          <label>
            <span className={fieldLabelClass}>Date</span>
            <input
              className={inputClass}
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </label>
          <label>
            <span className={fieldLabelClass}>Service</span>
            <select
              className={inputClass}
              onChange={(event) =>
                setService(event.target.value as DigitalService | "")
              }
              value={service}
            >
              <option value="">All</option>
              {DIGITAL_SERVICES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Direction</span>
            <select
              className={inputClass}
              onChange={(event) =>
                setDirection(event.target.value as DigitalDirection | "")
              }
              value={direction}
            >
              <option value="">All</option>
              <option value={DIGITAL_DIRECTIONS[0]}>Amount Sent</option>
              <option value={DIGITAL_DIRECTIONS[1]}>Amount Received</option>
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Status</span>
            <select
              className={inputClass}
              onChange={(event) =>
                setStatus(event.target.value as DigitalStatus | "")
              }
              value={status}
            >
              <option value="">All</option>
              {DIGITAL_STATUSES.map((value) => (
                <option key={value}>{value}</option>
              ))}
              <option>REVERSED</option>
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Cashier</span>
            <input
              className={inputClass}
              onChange={(event) => setCashier(event.target.value)}
              placeholder="Any"
              value={cashier}
            />
          </label>
        </div>
      </Card>

      <Card hint="Unavailable · transaction API pending" title="Transactions">
        <div className="flex justify-end border-b border-line-subtle px-4 py-2">
          <button
            className="inline-flex min-h-8 items-center gap-2 rounded-control border border-line px-3 text-xs font-semibold text-ink-subtle hover:bg-surface-subtle"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <EyeIcon className="size-4" /> Detail drawer layout
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {[
                  "Transaction ID",
                  "Date and Time",
                  "Service",
                  "Direction",
                  "Principal",
                  "Service Fee",
                  "Provider Commission",
                  "Net Earnings",
                  "Provider Reference",
                  "Cashier",
                  "Status",
                  "Action",
                ].map((header) => (
                  <th className={thClass} key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <UnavailableTableRow
                columns={12}
                message="Transaction history API is not available"
              />
            </tbody>
          </table>
        </div>
      </Card>

      {drawerOpen ? (
        <DetailDrawer
          canRecord={capabilities.canRecord}
          canReverse={capabilities.canReverse}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </>
  );
}
