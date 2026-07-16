import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  DigitalNewTransactionPage,
  DigitalNewTransactionRouteFallback,
} from "@/components/digital/new-transaction-page";

export const metadata: Metadata = {
  title: "New digital transaction | MobileShop OS",
  description:
    "Prepare a manual external-service transaction for server-backed review and recording.",
};

export default function DigitalNewPage(): JSX.Element {
  return (
    <Suspense fallback={<DigitalNewTransactionRouteFallback />}>
      <DigitalNewTransactionPage />
    </Suspense>
  );
}
