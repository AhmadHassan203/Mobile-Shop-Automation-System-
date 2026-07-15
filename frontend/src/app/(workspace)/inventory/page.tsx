import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ProductCatalogPage,
  ProductCatalogRouteFallback,
} from "@/components/catalog/product-catalog-page";

export const metadata: Metadata = {
  title: "Product catalog | MobileShop OS",
  description: "Search and create sellable product definitions.",
};

export default function InventoryPage() {
  return (
    <Suspense fallback={<ProductCatalogRouteFallback />}>
      <ProductCatalogPage />
    </Suspense>
  );
}
