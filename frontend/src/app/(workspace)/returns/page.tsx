import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  ServiceRouteFallback,
  ServiceWorkspace,
} from "@/components/service/service-workspace";

export const metadata: Metadata = {
  title: "Returns & Warranty | MobileShop OS",
  description: "Controlled returns, inspection, warranty, and stock outcomes.",
};

export default function ReturnsPage(): JSX.Element {
  return (
    <Suspense fallback={<ServiceRouteFallback />}>
      <ServiceWorkspace moduleId="returns" />
    </Suspense>
  );
}
