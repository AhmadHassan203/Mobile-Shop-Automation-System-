import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  DigitalBalancesPage,
  DigitalBalancesRouteFallback,
} from "@/components/digital/balances-page";

export const metadata: Metadata = {
  title: "Digital service balances | MobileShop OS",
  description:
    "Review opening balances, settled movements, current float and pending exposure.",
};

export default function DigitalBalancesRoute(): JSX.Element {
  return (
    <Suspense fallback={<DigitalBalancesRouteFallback />}>
      <DigitalBalancesPage />
    </Suspense>
  );
}
