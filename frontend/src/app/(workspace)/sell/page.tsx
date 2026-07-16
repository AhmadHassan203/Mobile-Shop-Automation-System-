import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  SellRouteFallback,
  SellWorkspace,
} from "@/components/pos/sell-workspace";

export const metadata: Metadata = {
  title: "Sell — Point of Sale | MobileShop OS",
  description:
    "Counter workflow for authoritative pricing, exact stock or IMEI selection, split payment, posting, and receipt.",
};

export default function SellPage(): JSX.Element {
  return (
    <Suspense fallback={<SellRouteFallback />}>
      <SellWorkspace />
    </Suspense>
  );
}
