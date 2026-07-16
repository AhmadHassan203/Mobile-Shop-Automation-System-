import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  DigitalCommissionPage,
  DigitalCommissionRouteFallback,
} from "@/components/digital/commission-page";

export const metadata: Metadata = {
  title: "Digital commission report | MobileShop OS",
  description:
    "Keep digital-service principal separate from fee, commission, tax and direct-charge earnings.",
};

export default function DigitalCommissionRoute(): JSX.Element {
  return (
    <Suspense fallback={<DigitalCommissionRouteFallback />}>
      <DigitalCommissionPage />
    </Suspense>
  );
}
