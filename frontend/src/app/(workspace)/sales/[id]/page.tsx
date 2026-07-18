import type { Metadata } from "next";
import { SaleDetailPage } from "@/components/sales/sale-detail-page";

export const metadata: Metadata = {
  title: "Sale record | MobileShop OS",
  description:
    "Open one exact sale from the immutable ledger with its line items and settlement.",
};

interface SaleDetailRouteProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function SaleDetailRoute({
  params,
}: SaleDetailRouteProps) {
  const { id } = await params;
  return <SaleDetailPage id={id} />;
}
