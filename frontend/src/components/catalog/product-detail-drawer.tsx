"use client";

import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { CatalogDrawer } from "./catalog-drawer";
import {
  CatalogErrorState,
  CatalogForbiddenState,
  CatalogTableSkeleton,
} from "./catalog-states";
import { ShieldCheckIcon } from "@/components/ui/icons";
import type { CatalogProductDetail } from "@/lib/api/catalog";
import { toApiError, type ApiError } from "@/lib/api/client";
import { catalogProductDetailQueryOptions } from "@/lib/query/catalog-query";

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

function UnavailableModulesNote(): JSX.Element {
  return (
    <div className="mt-6 flex items-start gap-2.5 rounded-card border border-info/20 bg-info-soft px-4 py-3 text-[0.8125rem] text-info">
      <ShieldCheckIcon className="mt-0.5 size-[1.125rem] shrink-0" />
      <div>
        <p className="font-semibold">Inventory and pricing are unavailable</p>
        <p className="mt-1">
          Stock on hand, IMEI and serial records, supplier cost, selling price,
          sales history and demand are deliberately absent from this drawer.
          Those modules have not been built yet, so this system holds no such
          values for this product. Nothing is estimated or shown in their place.
        </p>
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

      <UnavailableModulesNote />
    </div>
  );
}

export interface ProductDetailDrawerProps {
  readonly productId: string;
  readonly canView: boolean;
  readonly canUpdate: boolean;
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
      description="Catalog identity for this variant. This drawer holds no stock, IMEI, cost or price data."
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
        <ProductIdentity product={product} />
      )}
    </CatalogDrawer>
  );
}
