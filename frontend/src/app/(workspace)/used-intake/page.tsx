import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  ServiceRouteFallback,
  ServiceWorkspace,
} from "@/components/service/service-workspace";

export const metadata: Metadata = {
  title: "Used Device Intake | MobileShop OS",
  description:
    "Quarantine-first second-hand device intake and verification gates.",
};

export default function UsedIntakePage(): JSX.Element {
  return (
    <Suspense fallback={<ServiceRouteFallback />}>
      <ServiceWorkspace moduleId="used-intake" />
    </Suspense>
  );
}
