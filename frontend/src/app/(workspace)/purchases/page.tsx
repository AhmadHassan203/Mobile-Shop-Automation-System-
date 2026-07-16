import type { Metadata } from "next";
import { Suspense, type JSX } from "react";
import {
  PurchasingRouteFallback,
  PurchasingWorkspace,
} from "@/components/purchasing/purchasing-workspace";

export const metadata: Metadata = {
  title: "Purchasing | MobileShop OS",
  description: "Suppliers, purchase orders, and atomic goods receiving.",
};

export default function PurchasesPage(): JSX.Element {
  return (
    <Suspense fallback={<PurchasingRouteFallback />}>
      <PurchasingWorkspace />
    </Suspense>
  );
}
