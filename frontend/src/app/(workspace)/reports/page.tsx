import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";

export const metadata: Metadata = {
  title: "Reports | MobileShop OS",
  description:
    "Open traceable operational and financial reports with permission-aware exports and drill-downs.",
};

function ReportsFallback() {
  return (
    <div
      aria-label="Loading reports workspace"
      className="h-96 animate-pulse rounded-card bg-line-subtle"
      role="status"
    />
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsFallback />}>
      <ReportsWorkspace />
    </Suspense>
  );
}
