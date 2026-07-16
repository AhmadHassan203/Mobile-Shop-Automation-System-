import {
  PERMISSIONS,
  type ProductSummary,
  type StockBalance,
} from "@mobileshop/shared";

export interface PosCapabilities {
  readonly canViewCatalog: boolean;
  readonly canViewInventory: boolean;
  readonly canCreateSale: boolean;
  readonly canPostSale: boolean;
  readonly canViewPricing: boolean;
  readonly canCollectPayment: boolean;
  readonly canViewProfit: boolean;
  readonly canDiscount: boolean;
  readonly canViewCustomers: boolean;
  readonly canManageCustomers: boolean;
}

export function posCapabilities(
  permissions: readonly string[] | undefined,
): PosCapabilities {
  const granted = new Set(permissions ?? []);
  return {
    canViewCatalog: granted.has(PERMISSIONS.CATALOG_VIEW),
    canViewInventory: granted.has(PERMISSIONS.INVENTORY_VIEW),
    canCreateSale: granted.has(PERMISSIONS.SALES_CREATE),
    canPostSale: granted.has(PERMISSIONS.SALES_POST),
    canViewPricing: granted.has(PERMISSIONS.PRICING_VIEW),
    canCollectPayment: granted.has(PERMISSIONS.PAYMENTS_COLLECT),
    canViewProfit: granted.has(PERMISSIONS.SALES_VIEW_PROFIT),
    canDiscount: granted.has(PERMISSIONS.SALES_DISCOUNT),
    canViewCustomers: granted.has(PERMISSIONS.CUSTOMERS_VIEW),
    canManageCustomers: granted.has(PERMISSIONS.CUSTOMERS_MANAGE),
  };
}

export interface PosServiceAvailability {
  readonly pricingRead: boolean;
  readonly customerRead: boolean;
  readonly paymentCollect: boolean;
  readonly salePost: boolean;
  readonly saleHold: boolean;
  readonly demandCreate: boolean;
  readonly receiptDelivery: boolean;
}

/**
 * These are product boundaries, not feature flags. Changing one to true must
 * happen only when a real, validated HTTP client exists for that service.
 */
export const POS_SERVICE_AVAILABILITY: PosServiceAvailability = Object.freeze({
  pricingRead: false,
  customerRead: false,
  paymentCollect: false,
  salePost: false,
  saleHold: false,
  demandCreate: false,
  receiptDelivery: false,
});

export interface PosProduct {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly brandName: string;
  readonly modelName: string;
  readonly categoryName: string;
  readonly trackingType: "serialized" | "quantity";
  readonly available: number;
  readonly onHand: number;
  readonly reserved: number;
  readonly locationNames: readonly string[];
}

interface MutableBalanceTotal {
  available: number;
  onHand: number;
  reserved: number;
  readonly locations: Set<string>;
}

/** Combines only server-returned catalog and derived stock records. */
export function buildPosProducts(
  products: readonly ProductSummary[],
  balances: readonly StockBalance[],
): readonly PosProduct[] {
  const totals = new Map<string, MutableBalanceTotal>();

  for (const balance of balances) {
    const current = totals.get(balance.productVariant.id) ?? {
      available: 0,
      onHand: 0,
      reserved: 0,
      locations: new Set<string>(),
    };
    current.available += balance.available;
    current.onHand += balance.onHand;
    current.reserved += balance.reserved;
    current.locations.add(balance.locationName);
    totals.set(balance.productVariant.id, current);
  }

  return products
    .filter((product) => product.isActive)
    .map((product) => {
      const stock = totals.get(product.id);
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        brandName: product.productModel.brand.name,
        modelName: product.productModel.name,
        categoryName: product.productModel.category.name,
        trackingType: product.trackingType,
        available: stock?.available ?? 0,
        onHand: stock?.onHand ?? 0,
        reserved: stock?.reserved ?? 0,
        locationNames: [...(stock?.locations ?? [])].sort((left, right) =>
          left.localeCompare(right),
        ),
      } satisfies PosProduct;
    })
    .sort((left, right) => {
      if ((left.available > 0) !== (right.available > 0)) {
        return left.available > 0 ? -1 : 1;
      }
      return left.sku.localeCompare(right.sku);
    });
}

export interface PosCartLine {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly trackingType: "serialized" | "quantity";
  readonly quantity: number;
  readonly availableSnapshot: number;
}

export function addCartProduct(
  lines: readonly PosCartLine[],
  product: PosProduct,
): readonly PosCartLine[] {
  if (product.available <= 0) return lines;
  const current = lines.find((line) => line.productId === product.id);
  if (current === undefined) {
    return [
      ...lines,
      {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        trackingType: product.trackingType,
        quantity: 1,
        availableSnapshot: product.available,
      },
    ];
  }
  if (current.quantity >= product.available) return lines;
  return lines.map((line) =>
    line.productId === product.id
      ? {
          ...line,
          quantity: line.quantity + 1,
          availableSnapshot: product.available,
        }
      : line,
  );
}

export function setCartQuantity(
  lines: readonly PosCartLine[],
  productId: string,
  quantity: number,
): readonly PosCartLine[] {
  if (!Number.isSafeInteger(quantity)) return lines;
  if (quantity <= 0) {
    return lines.filter((line) => line.productId !== productId);
  }
  return lines.map((line) =>
    line.productId === productId
      ? {
          ...line,
          quantity: Math.min(quantity, line.availableSnapshot),
        }
      : line,
  );
}

export function cartUnitCount(lines: readonly PosCartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function checkoutBlockers(
  capabilities: PosCapabilities,
  services: PosServiceAvailability,
  lines: readonly PosCartLine[],
): readonly string[] {
  const blockers: string[] = [];
  if (lines.length === 0) blockers.push("Add at least one in-stock product.");
  if (!capabilities.canCreateSale) {
    blockers.push("The sales.create permission is required to prepare a sale.");
  }
  if (!capabilities.canViewPricing) {
    blockers.push("The pricing.view permission is required to calculate totals.");
  } else if (!services.pricingRead) {
    blockers.push("The pricing read API has not been implemented yet.");
  }
  if (!capabilities.canCollectPayment) {
    blockers.push("The payments.collect permission is required to take payment.");
  } else if (!services.paymentCollect) {
    blockers.push("The payment collection API has not been implemented yet.");
  }
  if (!capabilities.canPostSale) {
    blockers.push("The sales.post permission is required to post a sale.");
  } else if (!services.salePost) {
    blockers.push("The atomic sale-posting API has not been implemented yet.");
  }
  return blockers;
}

export type PosFlowStatus = "complete" | "current" | "upcoming" | "blocked";

export interface PosFlowStep {
  readonly id:
    | "find"
    | "select"
    | "cart"
    | "customer"
    | "payment"
    | "review"
    | "complete";
  readonly label: string;
  readonly status: PosFlowStatus;
}

export function posFlowSteps(
  sourceReady: boolean,
  lines: readonly PosCartLine[],
): readonly PosFlowStep[] {
  const hasSelection = lines.length > 0;
  return [
    {
      id: "find",
      label: "Find",
      status: sourceReady ? "complete" : "current",
    },
    {
      id: "select",
      label: "Select",
      status: hasSelection ? "complete" : sourceReady ? "current" : "upcoming",
    },
    {
      id: "cart",
      label: "Cart",
      status: hasSelection ? "complete" : "upcoming",
    },
    {
      id: "customer",
      label: "Customer",
      status: hasSelection ? "complete" : "upcoming",
    },
    { id: "payment", label: "Payment", status: "blocked" },
    { id: "review", label: "Review", status: "blocked" },
    { id: "complete", label: "Complete", status: "blocked" },
  ];
}
