import { redirect } from "next/navigation";

/**
 * Quick Stock In is consolidated into Purchasing → Add Stock (the default tab).
 * This route is retained only to redirect old bookmarks; it no longer renders a
 * separate module.
 */
export default function QuickStockInRedirect(): never {
  redirect("/purchases");
}
