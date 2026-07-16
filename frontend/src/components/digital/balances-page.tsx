"use client";

import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { BALANCE_ACCOUNTS, digitalCapabilities } from "./digital-state";
import {
  Card,
  DigitalApiNotice,
  DigitalKpi,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  UnavailableTableRow,
  tableClass,
  thClass,
} from "./digital-ui";

export function DigitalBalancesRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalBalancesPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = digitalCapabilities(auth.data?.permissions);
  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Service balance visibility requires the server-provided permission."
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
        subtitle="Opening balances, settled movements, current float and pending exposure by service."
        title="Digital Services — Service Balances"
      />
      <DigitalApiNotice>
        The balance ledger API is not implemented. Opening, sent, received,
        current, pending, threshold and last-transaction values remain
        unavailable rather than being copied from prototype storage.
      </DigitalApiNotice>
      <div className="mb-[1.125rem] grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {BALANCE_ACCOUNTS.map((account) => (
          <DigitalKpi
            key={account}
            label={account}
            meta="Opening and current balance API pending"
            warning
          />
        ))}
      </div>
      <div className="mb-4 flex items-start gap-3 rounded-control border border-warning/25 bg-warning-soft p-3.5 text-xs text-warning">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">Low balance warning unavailable</p>
          <p className="mt-1">
            A service is never labeled low until both its current balance and
            configured threshold are returned by the server.
          </p>
        </div>
      </div>
      <Card
        hint="Pending transactions are separate from current balance"
        title="Balance movement"
      >
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {[
                  "Service",
                  "Opening Balance",
                  "Amount Sent Today",
                  "Amount Received Today",
                  "Current Balance",
                  "Pending Amount",
                  "Last Transaction",
                ].map((header) => (
                  <th className={thClass} key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <UnavailableTableRow
                columns={7}
                message="Service balances API is not available"
              />
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
