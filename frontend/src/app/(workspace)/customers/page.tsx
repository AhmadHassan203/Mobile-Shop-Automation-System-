import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomersWorkspace } from "@/components/customers/customers-workspace";

export const metadata: Metadata = {
  title: "Customers | MobileShop OS",
  description: "Review customer relationships, consent, purchases, demand and receivables.",
};

function CustomersRouteFallback() {
  return (
    <div aria-label="Loading customers workspace" className="space-y-4" role="status">
      <span className="sr-only">Loading customers workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<CustomersRouteFallback />}>
      <CustomersWorkspace />
    </Suspense>
  );
}
