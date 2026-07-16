import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  DigitalReconciliationPage,
  DigitalReconciliationRouteFallback,
} from "@/components/digital/reconciliation-page";

export const metadata: Metadata = {
  title: "Digital reconciliation | MobileShop OS",
  description:
    "Compare counted cash and provider balances against authoritative Digital Services records.",
};

export default function DigitalReconciliationRoute(): JSX.Element {
  return (
    <Suspense fallback={<DigitalReconciliationRouteFallback />}>
      <DigitalReconciliationPage />
    </Suspense>
  );
}
