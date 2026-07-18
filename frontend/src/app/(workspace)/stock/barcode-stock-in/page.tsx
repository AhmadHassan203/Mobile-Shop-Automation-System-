import { redirect } from "next/navigation";

/**
 * Barcode scanning now lives inside Product Catalog (scan to find or create a
 * product), so the standalone Barcode Stock In module is gone. This route only
 * redirects old bookmarks to the catalog.
 */
export default function BarcodeStockInRedirect(): never {
  redirect("/inventory");
}
