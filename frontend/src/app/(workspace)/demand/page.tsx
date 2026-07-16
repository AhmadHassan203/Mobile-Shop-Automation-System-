import type { Metadata } from "next";
import { Suspense } from "react";
import { DemandWorkspace } from "@/components/demand/demand-workspace";

export const metadata: Metadata = {
  title: "Customer demand | MobileShop OS",
  description: "Capture missed sales, qualified demand, follow-ups and conversion outcomes.",
};

function DemandRouteFallback() {
  return (
    <div aria-label="Loading customer demand workspace" className="space-y-4" role="status">
      <span className="sr-only">Loading customer demand workspace</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-80 animate-pulse rounded-card bg-line-subtle" />
    </div>
  );
}

export default function DemandPage() {
  return (
    <Suspense fallback={<DemandRouteFallback />}>
      <DemandWorkspace />
    </Suspense>
  );
}
