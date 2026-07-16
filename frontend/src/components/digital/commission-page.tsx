"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  COMMISSION_GROUPS,
  digitalCapabilities,
  type CommissionGroup,
} from "./digital-state";
import {
  Card,
  DigitalApiNotice,
  DigitalKpi,
  DigitalPageHeader,
  DigitalPermissionGate,
  DigitalRouteSkeleton,
  UnavailableTableRow,
  fieldLabelClass,
  inputClass,
  tableClass,
  thClass,
} from "./digital-ui";

const commissionServices = [
  "JazzCash",
  "Easypaisa",
  "Bank Transfer",
  "Utility Bill",
  "Jazz Load",
  "Zong Load",
] as const;
const summaryLabels = [
  "Total principal sent",
  "Total principal received",
  "Customer fees",
  "Net digital-service earnings",
  "Provider gross commission",
  "Commission tax",
  "Provider net commission",
  "Other direct charges",
] as const;

export function DigitalCommissionRouteFallback(): JSX.Element {
  return <DigitalRouteSkeleton />;
}

export function DigitalCommissionPage(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const capabilities = digitalCapabilities(auth.data?.permissions);
  const [groupBy, setGroupBy] = useState<CommissionGroup>("service");
  if (auth.data === undefined) return <DigitalRouteSkeleton />;
  if (!capabilities.canView) {
    return (
      <DigitalPermissionGate
        description="Commission reporting requires the server-provided permission."
        permission="external_services.view"
      />
    );
  }

  return (
    <>
      <DigitalPageHeader
        actions={[
          { href: "/digital/history", label: "History" },
          { href: "/digital/new", label: "New transaction", primary: true },
        ]}
        subtitle="Principal stays separate from earnings. Net earnings are customer fees plus provider net commission minus direct charges."
        title="Digital Services — Commission Report"
      />
      <DigitalApiNotice>
        Settled transaction and commission APIs are not implemented. Grouping is
        ready for server rows, but no principal, fee, tax, charge, commission or
        earnings value is calculated in the browser.
      </DigitalApiNotice>
      <Card className="mb-4" title="Report grouping">
        <div className="p-[1.125rem]">
          <label className="block max-w-[16.25rem]">
            <span className={fieldLabelClass}>Group by</span>
            <select
              className={inputClass}
              onChange={(event) =>
                setGroupBy(event.target.value as CommissionGroup)
              }
              value={groupBy}
            >
              {COMMISSION_GROUPS.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      {!capabilities.canViewFeeRules ? (
        <div className="mb-4 rounded-control border border-warning/25 bg-warning-soft p-3.5 text-xs text-warning">
          Fee-rule details require external_fee_rules.view. No rule snapshots or
          calculated customer fees are exposed.
        </div>
      ) : null}
      <div className="mb-[1.125rem] grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {commissionServices.map((service) => (
          <DigitalKpi
            key={service}
            label={`${service} Net Earnings`}
            meta="Settled digital services only · API pending"
          />
        ))}
      </div>
      <div className="mb-[1.125rem] grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaryLabels.map((label) => (
          <DigitalKpi
            key={label}
            label={label}
            meta="Settled digital services only · API pending"
          />
        ))}
      </div>
      <Card hint={`Group by ${groupBy}`} title="Grouped earnings">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                {[
                  "Group",
                  "Sent Principal",
                  "Received Principal",
                  "Sent Fees",
                  "Received Fees",
                  "Gross Commission",
                  "Tax",
                  "Net Commission",
                  "Direct Charges",
                  "Net Earnings",
                ].map((header) => (
                  <th className={thClass} key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <UnavailableTableRow
                columns={10}
                message="Commission report API is not available"
              />
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
