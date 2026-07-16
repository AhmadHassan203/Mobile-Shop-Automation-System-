import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  ServiceRouteFallback,
  ServiceWorkspace,
} from "@/components/service/service-workspace";

export const metadata: Metadata = {
  title: "Repairs | MobileShop OS",
  description: "Workshop intake, parts, repair, quality control, and pickup.",
};

export default function RepairsPage(): JSX.Element {
  return (
    <Suspense fallback={<ServiceRouteFallback />}>
      <ServiceWorkspace moduleId="repairs" />
    </Suspense>
  );
}
