import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  DigitalHistoryPage,
  DigitalHistoryRouteFallback,
} from "@/components/digital/history-page";

export const metadata: Metadata = {
  title: "Digital transaction history | MobileShop OS",
  description:
    "Review manual external-service transactions and controlled status actions.",
};

export default function DigitalHistoryRoute(): JSX.Element {
  return (
    <Suspense fallback={<DigitalHistoryRouteFallback />}>
      <DigitalHistoryPage />
    </Suspense>
  );
}
