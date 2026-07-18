import type { Metadata } from "next";
import { Suspense } from "react";
import {
  SalesRecordsPage,
  SalesRecordsRouteFallback,
} from "@/components/sales/sales-records-page";

export const metadata: Metadata = {
  title: "Sale records | MobileShop OS",
  description:
    "Browse every posted invoice and unposted sale draft from the immutable sales ledger.",
};

export default function SalesRecordsRoute() {
  return (
    <Suspense fallback={<SalesRecordsRouteFallback />}>
      <SalesRecordsPage />
    </Suspense>
  );
}
