import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  SellRouteFallback,
  SellWorkspace,
} from "@/components/pos/sell-workspace";

export const metadata: Metadata = {
  title: "Sell — Point of Sale | MobileShop OS",
  description:
    "Counter workflow backed by real catalog identity and derived branch stock.",
};

export default function SellPage(): JSX.Element {
  return (
    <Suspense fallback={<SellRouteFallback />}>
      <SellWorkspace />
    </Suspense>
  );
}
