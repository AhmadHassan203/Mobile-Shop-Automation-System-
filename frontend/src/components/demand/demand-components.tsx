import { formatMoney, toMinor } from "@mobileshop/shared";
import Link from "next/link";
import type { JSX } from "react";
import { AlertTriangleIcon, CheckCircleIcon } from "@/components/ui/icons";
import type { DemandCaptureProduct } from "@/lib/api/demand";

export function DemandIcon({
  className = "size-5",
}: {
  readonly className?: string;
}): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
    >
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4.2A2.5 2.5 0 0 1 4 13.5v-8Z" />
      <path d="M8 8h8M8 11.5h5" />
    </svg>
  );
}

function money(valueMinor: number, currency: string): string {
  return formatMoney(toMinor(valueMinor, "demand price"), currency);
}

export function DemandAvailabilityPanel({
  product,
  requestText,
}: {
  readonly product: DemandCaptureProduct | null;
  readonly requestText: string;
}): JSX.Element {
  if (product === null) {
    return requestText.trim().length > 0 ? (
      <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
        <strong>Not matched to the catalog.</strong> The raw request remains
        usable for future sourcing, but stock cannot be verified.
      </div>
    ) : (
      <span className="inline-flex rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-semibold text-ink-muted">
        Pick a catalog item to check stock
      </span>
    );
  }
  if (product.availability === "checking") {
    return (
      <span
        className="inline-flex rounded-full bg-info-soft px-2.5 py-1 text-xs font-semibold text-info"
        role="status"
      >
        Checking authoritative price and branch stock…
      </span>
    );
  }
  if (product.availability === "lookup_unavailable") {
    return (
      <div className="flex items-start gap-2 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          {product.reason === "permission"
            ? "Stock and pricing permission is not granted, so availability cannot be verified."
            : "Pricing and stock could not be reached. This item is not being labeled in or out of stock."}
        </p>
      </div>
    );
  }
  if (product.availability === "price_not_configured") {
    return (
      <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs leading-5 text-warning">
        <strong>Price not configured.</strong> The scoped POS lookup cannot
        prove current availability until this catalog item has a selling price.{" "}
        <Link
          className="font-bold text-accent"
          href={`/inventory?tab=products&q=${encodeURIComponent(product.sku)}`}
        >
          Open catalog / pricing →
        </Link>
      </div>
    );
  }
  if (product.availability === "out_of_stock") {
    return (
      <div className="rounded-control border border-negative/25 bg-negative-soft p-3 text-xs leading-5 text-negative">
        <strong>OUT OF STOCK</strong> —{" "}
        {money(product.unitPriceMinor, product.currency)}. Saving this request
        records qualified demand for the buying plan.
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-control border border-positive/25 bg-positive-soft p-3 text-xs leading-5 text-positive">
      <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>In stock — {product.availableQuantity} available.</strong>{" "}
        {money(product.unitPriceMinor, product.currency)} ·{" "}
        {product.locationNames.join(", ")}.{" "}
        <Link className="font-bold text-accent" href="/sell">
          Open Sell →
        </Link>
      </p>
    </div>
  );
}
