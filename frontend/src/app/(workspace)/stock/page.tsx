import type { Metadata } from "next";
import { Suspense } from "react";
import {
  StockInventoryPage,
  StockInventoryRouteFallback,
} from "@/components/stock/stock-inventory-page";

export const metadata: Metadata = {
  title: "Stock inventory | MobileShop OS",
  description:
    "Review derived stock balances, serialized units, locations and the append-only movement ledger.",
};

export default function StockPage() {
  return (
    <Suspense fallback={<StockInventoryRouteFallback />}>
      <StockInventoryPage />
    </Suspense>
  );
}
