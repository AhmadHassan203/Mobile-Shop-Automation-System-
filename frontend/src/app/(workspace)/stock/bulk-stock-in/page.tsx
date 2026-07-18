import { redirect } from "next/navigation";

/**
 * Bulk Stock In is not part of the MVP release UI. The route redirects old
 * bookmarks to Product Catalog; the component and backend orchestration remain
 * dormant for possible future activation.
 */
export default function BulkStockInRedirect(): never {
  redirect("/inventory");
}
