"use client";

import { formatMoney, PAGINATION, toMinor } from "@mobileshop/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { JSX } from "react";
import { CatalogDrawer } from "./catalog-drawer";
import {
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogTableSkeleton,
} from "./catalog-states";
import { ProductPricingForm } from "./product-pricing-form";
import { ShieldCheckIcon } from "@/components/ui/icons";
import type { CatalogProductDetail } from "@/lib/api/catalog";
import { toApiError, type ApiError } from "@/lib/api/client";
import type { PosLookupPage, PosLookupParameters } from "@/lib/api/pricing";
import { catalogProductDetailQueryOptions } from "@/lib/query/catalog-query";
import { queryKeys } from "@/lib/query/keys";
import { posLookupQueryOptions } from "@/lib/query/pos-query";

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export interface CatalogReadErrorCopy {
  readonly title: string;
  readonly description: string;
}

/**
 * Read-failure copy for every catalog GET.
 *
 * A transport failure and a rejected request are different facts and are told
 * apart deliberately: an owner who is offline must not be told their data is
 * broken, and vice versa. No branch implies cached or partial data is on screen,
 * because none is ever rendered in place of a failed read.
 */
export function catalogReadErrorCopy(error: ApiError): CatalogReadErrorCopy {
  if (error.code === "NETWORK_ERROR") {
    return {
      title: "The catalog API could not be reached",
      description:
        "You appear to be offline, or the API is not reachable from this device. Nothing is shown in place of the real records — reconnect and retry.",
    };
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return {
      title: "The catalog API did not respond in time",
      description:
        "The request timed out before the API answered. No cached or placeholder records are shown — retry when the connection is stable.",
    };
  }
  if (error.code === "FORBIDDEN_PERMISSION" || error.status === 403) {
    return {
      title: "Catalog access was refused",
      description:
        "The server rejected this read for the current permission set. Ask an owner to review your catalog permissions.",
    };
  }
  if (error.code === "NOT_FOUND" || error.status === 404) {
    return {
      title: "This product no longer exists",
      description:
        "The API found no such product for your organization. It may have been removed from your access, or the link is stale.",
    };
  }
  if (error.code === "INVALID_RESPONSE") {
    return {
      title: "The catalog API returned an unexpected response",
      description:
        "The response did not match the agreed contract, so it was rejected rather than displayed. Nothing here is guessed or filled in.",
    };
  }
  return {
    title: "Catalog could not be loaded",
    description:
      "The API did not return a valid catalog page. No fallback or mock records are shown.",
  };
}

export interface ProductIdentityRow {
  readonly label: string;
  readonly value: string;
}

/** A catalog attribute the shop genuinely never filled in — not a hidden value. */
const NOT_RECORDED = "Not recorded";

function warrantyText(product: CatalogProductDetail): string {
  if (product.warrantyType === "none") return "No warranty";
  const type = titleCase(product.warrantyType);
  return product.warrantyMonths === null
    ? type
    : `${type} · ${product.warrantyMonths} months`;
}

/**
 * Every row this drawer is allowed to show.
 *
 * The list is exhaustive on purpose: it is catalog identity and nothing else.
 * Stock, IMEIs, supplier cost, selling price, sales history and demand are not
 * omitted for layout reasons — they are not catalog data, they do not exist in
 * this system yet, and inventing a row for them would be a lie.
 */
export function productIdentityRows(
  product: CatalogProductDetail,
): readonly ProductIdentityRow[] {
  return [
    { label: "Brand", value: product.productModel.brand.name },
    { label: "Model", value: product.productModel.name },
    { label: "Category", value: product.productModel.category.name },
    { label: "Internal SKU", value: product.sku },
    { label: "Variant name", value: product.name },
    { label: "Tracking", value: titleCase(product.trackingType) },
    { label: "Condition", value: titleCase(product.condition) },
    { label: "PTA status", value: titleCase(product.ptaStatus) },
    { label: "RAM", value: product.ram ?? NOT_RECORDED },
    { label: "Storage", value: product.storage ?? NOT_RECORDED },
    { label: "Color", value: product.color ?? NOT_RECORDED },
    { label: "Region", value: product.region ?? NOT_RECORDED },
    { label: "Warranty", value: warrantyText(product) },
    { label: "Status", value: product.isActive ? "Active" : "Inactive" },
  ];
}

/** Primary first, mirroring the create/edit form where the first entry is primary. */
export function orderedProductBarcodes(
  barcodes: CatalogProductDetail["barcodes"],
): CatalogProductDetail["barcodes"] {
  return [...barcodes].sort((left, right) =>
    left.isPrimary === right.isPrimary ? 0 : left.isPrimary ? -1 : 1,
  );
}

function LiveOperationsNote({
  product,
}: {
  readonly product: CatalogProductDetail;
}): JSX.Element {
  return (
    <div className="mt-6 flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-[0.8125rem] text-info">
      <ShieldCheckIcon className="mt-0.5 size-[1.125rem] shrink-0" />
      <div>
        <p className="font-semibold">Stock and pricing are live</p>
        <p className="mt-1">
          Catalog identity stays separate from operational records. Review this
          product in Stock, or manage its live default selling price below.
          Supplier cost remains outside this drawer.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 font-semibold">
          <Link
            className="underline underline-offset-2 hover:text-ink"
            href={`/stock?q=${encodeURIComponent(product.sku)}`}
          >
            Open Stock
          </Link>
          <a
            className="underline underline-offset-2 hover:text-ink"
            href="#product-pricing"
          >
            Open Pricing
          </a>
        </div>
      </div>
    </div>
  );
}

function ProductIdentity({
  product,
}: {
  readonly product: CatalogProductDetail;
}): JSX.Element {
  const barcodes = orderedProductBarcodes(product.barcodes);

  return (
    <div>
      <dl className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        {productIdentityRows(product).map((row) => (
          <div key={row.label}>
            <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-ink-muted">
              {row.label}
            </dt>
            <dd
              className={`mt-0.5 text-sm text-ink ${
                row.label === "Internal SKU" ? "font-mono font-semibold" : ""
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 border-t border-line-subtle pt-5">
        <h3 className="text-sm font-semibold text-ink">
          Aliases ({product.aliases.length})
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          Alternate spellings counter staff can search by.
        </p>
        {product.aliases.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No aliases recorded.</p>
        ) : (
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {product.aliases.map((alias) => (
              <li
                className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-ink-subtle"
                key={alias.id}
              >
                {alias.alias}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-line-subtle pt-5">
        <h3 className="text-sm font-semibold text-ink">
          Barcodes ({barcodes.length})
        </h3>
        {barcodes.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No barcode recorded. This product is still searchable by SKU, model,
            brand, category and alias.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {barcodes.map((barcode) => (
              <li className="flex items-center gap-2" key={barcode.id}>
                <span className="font-mono text-sm text-ink">
                  {barcode.barcode}
                </span>
                {barcode.isPrimary ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-ink">
                    Primary
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <LiveOperationsNote product={product} />
    </div>
  );
}

/** Lookup is fuzzy by SKU, but only the requested immutable id may be shown. */
export function productPriceFromLookup(
  page: PosLookupPage | undefined,
  productVariantId: string,
) {
  return (
    page?.items.find((item) => item.productVariantId === productVariantId)
      ?.effectivePrice ?? null
  );
}

export function productPricingLookupParameters(
  product: CatalogProductDetail,
): PosLookupParameters {
  return {
    page: 1,
    pageSize: PAGINATION.MAX_PAGE_SIZE,
    q: product.sku,
  };
}

function ProductPricing({
  product,
  canView,
  canManage,
}: {
  readonly product: CatalogProductDetail;
  readonly canView: boolean;
  readonly canManage: boolean;
}): JSX.Element {
  const queryClient = useQueryClient();
  const lookup = useQuery(
    posLookupQueryOptions(productPricingLookupParameters(product), canView),
  );
  const effectivePrice = productPriceFromLookup(lookup.data, product.id);
  const lookupError = lookup.error === null ? null : toApiError(lookup.error);

  const invalidatePricingAndCatalog = (): void => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.posLookupRoot,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.catalogProductsRoot,
    });
  };

  return (
    <section
      className="mt-6 border-t border-line-subtle pt-5"
      id="product-pricing"
    >
      <h3 className="text-sm font-semibold text-ink">Pricing</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Authoritative selling price for this product and current branch.
      </p>

      {!canView ? (
        <p className="mt-3 rounded-control bg-surface-subtle px-3 py-2.5 text-xs text-ink-muted">
          Viewing the current price requires the pricing.view permission. No
          pricing request was sent.
        </p>
      ) : lookup.isPending ? (
        <div
          className="mt-3 h-16 animate-pulse rounded-control bg-line-subtle"
          role="status"
        >
          <span className="sr-only">Loading current price</span>
        </div>
      ) : lookupError !== null ? (
        <div
          className="mt-3 rounded-control border border-negative/20 bg-negative-soft p-3 text-xs text-negative"
          role="alert"
        >
          <p className="font-semibold">Current price could not be loaded.</p>
          <p className="mt-1">{lookupError.message}</p>
          <button
            className="mt-2 font-semibold underline underline-offset-2"
            onClick={() => {
              void lookup.refetch();
            }}
            type="button"
          >
            Retry pricing
          </button>
        </div>
      ) : effectivePrice === null ? (
        <div className="mt-3 rounded-control border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
          <p className="font-semibold">Not configured</p>
          <p className="mt-1">
            No active rule or default selling price was returned for this exact
            product.
          </p>
        </div>
      ) : (
        <dl className="mt-3 grid gap-3 rounded-control border border-line-subtle bg-surface-subtle p-3 sm:grid-cols-3">
          <div>
            <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
              Effective price
            </dt>
            <dd className="mt-0.5 text-sm font-bold text-ink">
              {formatMoney(
                toMinor(effectivePrice.unitPriceMinor, "effective price"),
                effectivePrice.currency,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
              Minimum price
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-subtle">
              {formatMoney(
                toMinor(effectivePrice.minimumUnitPriceMinor, "minimum price"),
                effectivePrice.currency,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
              Source
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-subtle">
              {effectivePrice.source === "price_rule"
                ? "Active price rule"
                : "Product default"}
            </dd>
          </div>
        </dl>
      )}

      <ProductPricingForm
        canManage={canManage}
        effectivePrice={effectivePrice}
        key={`${product.id}:${product.version}:${effectivePrice?.source ?? "none"}:${effectivePrice?.version ?? 0}`}
        onSaved={invalidatePricingAndCatalog}
        productVariantId={product.id}
        productVersion={product.version}
      />
    </section>
  );
}

export interface ProductDetailDrawerProps {
  readonly productId: string;
  readonly canView: boolean;
  readonly canUpdate: boolean;
  readonly canViewPricing: boolean;
  readonly canManagePricing: boolean;
  readonly onClose: () => void;
  readonly onEdit: (productId: string) => void;
}

/**
 * Read-only catalog identity for one product.
 *
 * The `catalog.view` gate is checked before the query is enabled, so a caller
 * without the permission never causes a request — the forbidden panel is the
 * whole behaviour, not a cosmetic overlay on a fetch that happened anyway.
 */
export function ProductDetailDrawer({
  productId,
  canView,
  canUpdate,
  canViewPricing,
  canManagePricing,
  onClose,
  onEdit,
}: ProductDetailDrawerProps): JSX.Element {
  const detail = useQuery(catalogProductDetailQueryOptions(productId, canView));
  const product = detail.data;

  const footer =
    product === undefined ? undefined : (
      <>
        <button
          className="inline-flex min-h-10 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-subtle hover:bg-surface-subtle"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
        {canUpdate ? (
          <button
            aria-haspopup="dialog"
            className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
            onClick={() => onEdit(product.id)}
            type="button"
          >
            Edit product
          </button>
        ) : null}
      </>
    );

  return (
    <CatalogDrawer
      description="Catalog identity with live selling-price configuration. Physical stock remains in Stock inventory."
      onClose={onClose}
      title="Product details"
      titleId="product-detail-title"
      {...(footer === undefined ? {} : { footer })}
    >
      {!canView ? (
        <CatalogForbiddenState
          description="Viewing a product requires the server-provided catalog.view permission. No product request was sent."
          title="Catalog access required"
        />
      ) : detail.isPending ? (
        <CatalogTableSkeleton rows={5} />
      ) : product === undefined ? (
        <CatalogErrorState
          {...catalogReadErrorCopy(toApiError(detail.error))}
          {...(toApiError(detail.error).requestId === undefined
            ? {}
            : { requestId: toApiError(detail.error).requestId as string })}
          onRetry={() => {
            void detail.refetch();
          }}
        />
      ) : (
        <>
          <ProductIdentity product={product} />
          <ProductPricing
            canManage={canManagePricing}
            canView={canViewPricing}
            product={product}
          />
        </>
      )}
    </CatalogDrawer>
  );
}
