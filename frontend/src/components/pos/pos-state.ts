import {
  PERMISSIONS,
  fromMajor,
  type CreateSaleDraftInput,
  type PaymentMethod,
  type PosQuantityLocationChoice,
  type PosSellableItem,
  type PosSerializedUnitChoice,
  type SalePaymentLegInput,
} from "@mobileshop/shared";

export interface PosCapabilities {
  readonly canViewCatalog: boolean;
  readonly canManagePricing: boolean;
  readonly canCreateSale: boolean;
  readonly canPostSale: boolean;
  readonly canViewPricing: boolean;
  readonly canCollectPayment: boolean;
  readonly canViewProfit: boolean;
  readonly canDiscount: boolean;
  readonly canViewCustomers: boolean;
  readonly canManageCustomers: boolean;
  readonly canRecordDemand: boolean;
}

export function posCapabilities(
  permissions: readonly string[] | undefined,
): PosCapabilities {
  const granted = new Set(permissions ?? []);
  return {
    canViewCatalog: granted.has(PERMISSIONS.CATALOG_VIEW),
    canManagePricing: granted.has(PERMISSIONS.PRICING_MANAGE),
    canCreateSale: granted.has(PERMISSIONS.SALES_CREATE),
    canPostSale: granted.has(PERMISSIONS.SALES_POST),
    canViewPricing: granted.has(PERMISSIONS.PRICING_VIEW),
    canCollectPayment: granted.has(PERMISSIONS.PAYMENTS_COLLECT),
    canViewProfit: granted.has(PERMISSIONS.SALES_VIEW_PROFIT),
    canDiscount: granted.has(PERMISSIONS.SALES_DISCOUNT),
    canViewCustomers: granted.has(PERMISSIONS.CUSTOMERS_VIEW),
    canManageCustomers: granted.has(PERMISSIONS.CUSTOMERS_MANAGE),
    canRecordDemand: granted.has(PERMISSIONS.DEMAND_CREATE),
  };
}

interface CartLineBase {
  readonly key: string;
  readonly productVariantId: string;
  readonly sku: string;
  readonly name: string;
  readonly brandName: string;
  readonly modelName: string;
  readonly currency: string;
  readonly unitPriceMinor: number;
  readonly priceSource: "price_rule" | "variant_default";
  readonly priceSourceId: string | null;
  readonly priceVersion: number;
}

export interface QuantityCartLine extends CartLineBase {
  readonly trackingType: "quantity";
  readonly location: PosQuantityLocationChoice["location"];
  readonly quantity: number;
  readonly availableSnapshot: number;
  readonly stockVersion: number;
}

export interface SerializedCartLine extends CartLineBase {
  readonly trackingType: "serialized";
  readonly location: PosSerializedUnitChoice["location"];
  readonly quantity: 1;
  readonly serializedUnitId: string;
  readonly serializedUnitVersion: number;
  readonly identifiers: PosSerializedUnitChoice["identifiers"];
}

export type PosCartLine = QuantityCartLine | SerializedCartLine;

function commonLine(item: PosSellableItem): Omit<CartLineBase, "key"> {
  return {
    productVariantId: item.productVariantId,
    sku: item.sku,
    name: item.name,
    brandName: item.brandName,
    modelName: item.modelName,
    currency: item.effectivePrice.currency,
    unitPriceMinor: item.effectivePrice.unitPriceMinor,
    priceSource: item.effectivePrice.source,
    priceSourceId: item.effectivePrice.sourceId,
    priceVersion: item.effectivePrice.version,
  };
}

export function posAvailableCount(item: PosSellableItem): number {
  if (item.stock.availability === "out_of_stock") return 0;
  if (item.trackingType === "quantity") {
    return item.stock.locationChoices.reduce(
      (total, choice) => total + choice.availableQuantity,
      0,
    );
  }
  return item.stock.serializedUnitChoices.length;
}

/** Adds only a server-returned location or serialized-unit choice. */
export function addCartSelection(
  lines: readonly PosCartLine[],
  item: PosSellableItem,
  selectionId: string,
): readonly PosCartLine[] {
  if (item.stock.availability === "out_of_stock") return lines;
  const common = commonLine(item);
  if (item.trackingType === "serialized") {
    const choice = item.stock.serializedUnitChoices.find(
      (candidate) => candidate.serializedUnitId === selectionId,
    );
    if (choice === undefined) return lines;
    const key = `S:${choice.serializedUnitId}`;
    if (lines.some((line) => line.key === key)) return lines;
    return [
      ...lines,
      {
        ...common,
        key,
        trackingType: "serialized",
        location: choice.location,
        quantity: 1,
        serializedUnitId: choice.serializedUnitId,
        serializedUnitVersion: choice.unitVersion,
        identifiers: choice.identifiers,
      },
    ];
  }

  const choice = item.stock.locationChoices.find(
    (candidate) => candidate.location.id === selectionId,
  );
  if (choice === undefined) return lines;
  const key = `Q:${item.productVariantId}:${choice.location.id}`;
  const existing = lines.find((line) => line.key === key);
  if (existing?.trackingType === "quantity") {
    if (existing.quantity >= choice.availableQuantity) return lines;
    return lines.map((line) =>
      line.key === key && line.trackingType === "quantity"
        ? {
            ...line,
            quantity: line.quantity + 1,
            availableSnapshot: choice.availableQuantity,
            stockVersion: choice.stockVersion,
          }
        : line,
    );
  }
  return [
    ...lines,
    {
      ...common,
      key,
      trackingType: "quantity",
      location: choice.location,
      quantity: 1,
      availableSnapshot: choice.availableQuantity,
      stockVersion: choice.stockVersion,
    },
  ];
}

export function setCartQuantity(
  lines: readonly PosCartLine[],
  key: string,
  quantity: number,
): readonly PosCartLine[] {
  if (!Number.isSafeInteger(quantity)) return lines;
  if (quantity <= 0) return lines.filter((line) => line.key !== key);
  return lines.map((line) => {
    if (line.key !== key || line.trackingType === "serialized") return line;
    return { ...line, quantity: Math.min(quantity, line.availableSnapshot) };
  });
}

export function cartUnitCount(lines: readonly PosCartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export interface PosCartTotals {
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
}

export function cartTotals(
  lines: readonly PosCartLine[],
  discountMinor: number,
): PosCartTotals | null {
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0) return null;
  const subtotal = lines.reduce(
    (sum, line) => sum + BigInt(line.unitPriceMinor) * BigInt(line.quantity),
    0n,
  );
  if (subtotal > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const subtotalMinor = Number(subtotal);
  if (discountMinor > subtotalMinor) return null;
  return {
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
  };
}

export function parsePkrMajorInput(value: string): number | null {
  const normalized = value.trim();
  if (normalized.length === 0) return 0;
  try {
    return fromMajor(normalized, "PKR") as number;
  } catch {
    return null;
  }
}

export function buildSaleDraftInput(
  lines: readonly PosCartLine[],
  customerId: string | null,
  discountMinor: number,
  discountReason: string | null,
): CreateSaleDraftInput {
  return {
    customerId,
    note: null,
    requestedDiscountMinor: discountMinor,
    discountReason,
    lines: lines.map((line) =>
      line.trackingType === "serialized"
        ? {
            trackingType: "serialized",
            productVariantId: line.productVariantId,
            priceSource: line.priceSource,
            priceSourceId: line.priceSourceId,
            priceVersion: line.priceVersion,
            serializedUnitId: line.serializedUnitId,
            serializedUnitVersion: line.serializedUnitVersion,
            locationId: line.location.id,
          }
        : {
            trackingType: "quantity",
            productVariantId: line.productVariantId,
            priceSource: line.priceSource,
            priceSourceId: line.priceSourceId,
            priceVersion: line.priceVersion,
            locationId: line.location.id,
            quantity: line.quantity,
            stockVersion: line.stockVersion,
          },
    ),
  };
}

export const POS_PAYMENT_OPTIONS = [
  { label: "Cash", method: "cash", needsReference: false },
  { label: "Bank", method: "bank_transfer", needsReference: true },
  { label: "Card", method: "card", needsReference: true },
  { label: "JazzCash", method: "digital_wallet", needsReference: true },
] as const satisfies readonly {
  readonly label: string;
  readonly method: PaymentMethod;
  readonly needsReference: boolean;
}[];

export interface PosPaymentDraft {
  readonly method: (typeof POS_PAYMENT_OPTIONS)[number]["method"];
  readonly amountMinor: number;
  readonly reference: string | null;
}

export function paymentLegs(
  drafts: readonly PosPaymentDraft[],
): readonly SalePaymentLegInput[] | null {
  const legs: SalePaymentLegInput[] = [];
  for (const draft of drafts) {
    if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor < 0) {
      return null;
    }
    if (draft.amountMinor === 0) continue;
    const option = POS_PAYMENT_OPTIONS.find(
      (candidate) => candidate.method === draft.method,
    );
    if (option === undefined) return null;
    const reference = draft.reference?.trim() || null;
    if (option.needsReference !== (reference !== null)) return null;
    legs.push({
      method: draft.method,
      amountMinor: draft.amountMinor,
      reference,
    });
  }
  return legs;
}

export function paymentTotal(
  legs: readonly SalePaymentLegInput[],
): number | null {
  const total = legs.reduce((sum, leg) => sum + BigInt(leg.amountMinor), 0n);
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(total);
}

/** Cart snapshots are blocked when the latest lookup no longer matches. */
export function cartStalenessReasons(
  lines: readonly PosCartLine[],
  items: readonly PosSellableItem[],
): readonly string[] {
  const reasons: string[] = [];
  for (const line of lines) {
    const item = items.find(
      (candidate) => candidate.productVariantId === line.productVariantId,
    );
    if (item === undefined) {
      reasons.push(`${line.sku}: product is no longer in the current lookup.`);
      continue;
    }
    if (
      item.effectivePrice.source !== line.priceSource ||
      item.effectivePrice.sourceId !== line.priceSourceId ||
      item.effectivePrice.version !== line.priceVersion ||
      item.effectivePrice.unitPriceMinor !== line.unitPriceMinor
    ) {
      reasons.push(`${line.sku}: authoritative price changed.`);
      continue;
    }
    if (item.stock.availability === "out_of_stock") {
      reasons.push(`${line.sku}: selected stock is no longer available.`);
      continue;
    }
    if (line.trackingType === "serialized") {
      if (item.trackingType !== "serialized") {
        reasons.push(`${line.sku}: tracking type changed.`);
        continue;
      }
      const choice = item.stock.serializedUnitChoices.find(
        (candidate) => candidate.serializedUnitId === line.serializedUnitId,
      );
      if (
        choice === undefined ||
        choice.unitVersion !== line.serializedUnitVersion ||
        choice.location.id !== line.location.id
      ) {
        reasons.push(`${line.sku}: selected IMEI/unit changed or was taken.`);
      }
      continue;
    }
    if (item.trackingType !== "quantity") {
      reasons.push(`${line.sku}: tracking type changed.`);
      continue;
    }
    const choice = item.stock.locationChoices.find(
      (candidate) => candidate.location.id === line.location.id,
    );
    if (
      choice === undefined ||
      choice.stockVersion !== line.stockVersion ||
      choice.availableQuantity < line.quantity
    ) {
      reasons.push(`${line.sku}: location stock changed.`);
    }
  }
  return reasons;
}
