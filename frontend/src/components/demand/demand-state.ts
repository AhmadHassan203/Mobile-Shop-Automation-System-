import {
  CreateDemandRequestInputSchema,
  DEMAND_CONTRACT_LIMITS,
  LIMITS,
  PakistanMobileInputSchema,
  PERMISSIONS,
  fromMajor,
  type CreateDemandRequestData,
  type DemandChannel,
  type DemandListView,
  type DemandUrgency,
  type ProductSummary,
} from "@mobileshop/shared";
import type { DemandCaptureProduct } from "@/lib/api/demand";

export const DEMAND_FILTERS = [
  { id: "all", label: "All" },
  { id: "unavailable", label: "Unavailable" },
  { id: "reserved", label: "Reserved" },
  { id: "quotation", label: "Quotation sent" },
  { id: "price", label: "Price too high" },
] as const;

export type DemandFilter = (typeof DEMAND_FILTERS)[number]["id"];

export interface DemandCapabilities {
  readonly canView: boolean;
  readonly canCreate: boolean;
  readonly canManage: boolean;
  readonly canViewCustomers: boolean;
  readonly canViewCatalog: boolean;
  readonly canViewInventory: boolean;
  readonly canViewPricing: boolean;
}

export type DemandPtaPreference = "pta_only" | "non_pta_ok" | "no_preference";

export interface DemandDraft {
  readonly productVariantId: string;
  readonly customerName: string;
  readonly requestText: string;
  readonly variantDetails: string;
  readonly quantity: string;
  readonly budget: string;
  readonly ptaPreference: DemandPtaPreference;
  readonly urgency: DemandUrgency;
  readonly channel: DemandChannel;
  readonly phone: string;
  readonly followUp: string;
  readonly note: string;
  readonly consentToContact: boolean;
  readonly tradeInInterest: boolean;
}

export type DemandDraftErrors = Readonly<
  Partial<Record<keyof DemandDraft, string>>
>;

export function demandCapabilities(
  permissions: readonly string[] | undefined,
): DemandCapabilities {
  const granted = new Set(permissions ?? []);
  return {
    canView: granted.has(PERMISSIONS.DEMAND_VIEW),
    canCreate: granted.has(PERMISSIONS.DEMAND_CREATE),
    canManage: granted.has(PERMISSIONS.DEMAND_MANAGE),
    canViewCustomers: granted.has(PERMISSIONS.CUSTOMERS_VIEW),
    canViewCatalog: granted.has(PERMISSIONS.CATALOG_VIEW),
    canViewInventory: granted.has(PERMISSIONS.INVENTORY_VIEW),
    canViewPricing: granted.has(PERMISSIONS.PRICING_VIEW),
  };
}

export function demandFilterFrom(searchParams: URLSearchParams): DemandFilter {
  const value = searchParams.get("filter");
  return DEMAND_FILTERS.some((filter) => filter.id === value)
    ? (value as DemandFilter)
    : "all";
}

export function demandListQuery(
  searchParams: URLSearchParams,
  filter: DemandFilter,
): string {
  const next = new URLSearchParams(searchParams.toString());
  if (filter === "all") next.delete("filter");
  else next.set("filter", filter);
  next.delete("page");
  return next.toString();
}

export function demandViewForFilter(filter: DemandFilter): DemandListView {
  if (filter === "quotation") return "quotation_sent";
  if (filter === "price") return "price_too_high";
  return filter;
}

export function demandOutcomeCategory(outcome: string): DemandFilter | "other" {
  const normalized = outcome.trim().toLowerCase().replaceAll("_", " ");
  if (normalized.startsWith("unavailable")) return "unavailable";
  if (
    normalized.startsWith("reserved") ||
    normalized.startsWith("sold immediately")
  ) {
    return "reserved";
  }
  if (normalized.startsWith("quotation")) return "quotation";
  if (normalized.startsWith("price too high")) return "price";
  return "other";
}

export function validateDemandDraft(draft: DemandDraft): DemandDraftErrors {
  const errors: Partial<Record<keyof DemandDraft, string>> = {};
  if (draft.customerName.normalize("NFKC").trim().length > 200) {
    errors.customerName = "Customer name must be 200 characters or less.";
  }
  const request = draft.requestText.normalize("NFKC").trim();
  if (draft.productVariantId.length === 0 && request.length < 3) {
    errors.requestText = "Match a catalog product or describe the request.";
  } else if (request.length > DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH) {
    errors.requestText = `Request must be ${DEMAND_CONTRACT_LIMITS.RAW_REQUEST_LENGTH} characters or less.`;
  }
  if (
    draft.variantDetails.trim().length > DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH
  ) {
    errors.variantDetails = `Variant details must be ${DEMAND_CONTRACT_LIMITS.ATTRIBUTE_LENGTH} characters or less.`;
  }
  const quantity = Number(draft.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
    errors.quantity = "Quantity must be a whole number from 1 to 100,000.";
  }
  try {
    parseDemandBudget(draft.budget);
  } catch {
    errors.budget = "Enter one budget or a range, for example 40000–46000.";
  }
  if (
    draft.phone.trim().length > 0 &&
    !PakistanMobileInputSchema.safeParse(draft.phone).success
  ) {
    errors.phone = "Enter a valid Pakistani mobile number or leave it blank.";
  }
  if (draft.consentToContact && draft.phone.trim().length === 0) {
    errors.phone = "Enter a phone number before recording contact consent.";
  }
  if (
    draft.followUp.length > 0 &&
    !/^\d{4}-\d{2}-\d{2}$/u.test(draft.followUp)
  ) {
    errors.followUp = "Choose a valid follow-up date.";
  } else if (
    draft.followUp.length > 0 &&
    (draft.phone.trim().length === 0 || !draft.consentToContact)
  ) {
    errors.followUp = "A follow-up requires a phone number and consent.";
  }
  if (draft.note.trim().length > LIMITS.MAX_NOTE_LENGTH) {
    errors.note = `Note must be ${LIMITS.MAX_NOTE_LENGTH} characters or less.`;
  }
  return errors;
}

export interface ParsedDemandBudget {
  readonly minimumMinor: number | null;
  readonly maximumMinor: number | null;
}

function parseBudgetAmount(value: string): number {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/^pkr\s*/u, "")
    .replaceAll(",", "")
    .replace(/\s+/gu, "");
  const thousands = /^(\d+)k$/u.exec(normalized);
  const major = thousands === null ? normalized : `${thousands[1] ?? "0"}000`;
  const minor = fromMajor(major);
  if (minor < 0) throw new Error("Budget cannot be negative.");
  return minor;
}

/** Parses exact rupee values; `40k–46k` is shorthand for 40,000–46,000. */
export function parseDemandBudget(value: string): ParsedDemandBudget {
  const text = value.normalize("NFKC").trim();
  if (text.length === 0) return { minimumMinor: null, maximumMinor: null };
  const parts = text.split(/\s*(?:-|–|—|\bto\b)\s*/iu);
  if (parts.length > 2 || parts.some((part) => part.length === 0)) {
    throw new Error("Invalid budget range.");
  }
  const minimumMinor = parseBudgetAmount(parts[0] ?? "");
  const maximumMinor =
    parts.length === 1 ? minimumMinor : parseBudgetAmount(parts[1] ?? "");
  if (minimumMinor > maximumMinor) {
    throw new Error("Minimum budget exceeds maximum budget.");
  }
  return { minimumMinor, maximumMinor };
}

function captureAvailability(
  product: DemandCaptureProduct | null,
  checkedAt: string,
) {
  if (product === null) {
    return {
      state: "not_in_catalog" as const,
      checkedAt,
      availableQuantity: null,
      unitPriceMinor: null,
    };
  }
  if (product.availability === "saleable") {
    return {
      state: "available" as const,
      checkedAt,
      availableQuantity: product.availableQuantity,
      unitPriceMinor: product.unitPriceMinor,
    };
  }
  if (product.availability === "out_of_stock") {
    return {
      state: "unavailable" as const,
      checkedAt,
      availableQuantity: 0 as const,
      unitPriceMinor: product.unitPriceMinor,
    };
  }
  const reason =
    product.availability === "lookup_unavailable"
      ? product.reason === "permission"
        ? ("permission_denied" as const)
        : ("lookup_failed" as const)
      : ("not_checked" as const);
  return {
    state: "unknown" as const,
    reason,
    checkedAt: null,
    availableQuantity: null,
    unitPriceMinor: null,
  };
}

export function demandDraftToCreateInput(
  draft: DemandDraft,
  selectedProduct: ProductSummary | undefined,
  productAvailability: DemandCaptureProduct | null,
  now = new Date().toISOString(),
): CreateDemandRequestData {
  const matched = selectedProduct !== undefined;
  const requestedText = draft.requestText.normalize("NFKC").trim();
  const rawRequestText = matched
    ? requestedText.length > 0
      ? requestedText
      : `${selectedProduct.productModel.brand.name} ${selectedProduct.productModel.name} · ${selectedProduct.name}`
    : requestedText;
  const desiredVariant = draft.variantDetails.trim() || null;
  const preferences = matched
    ? {
        desiredBrand: selectedProduct.productModel.brand.name,
        desiredModel: selectedProduct.productModel.name,
        desiredVariant,
        desiredRam: selectedProduct.ram,
        desiredStorage: selectedProduct.storage,
        desiredColor: selectedProduct.color,
        conditionPreference: selectedProduct.condition,
      }
    : {
        desiredBrand: null,
        desiredModel: null,
        desiredVariant,
        desiredRam: null,
        desiredStorage: null,
        desiredColor: null,
        conditionPreference: null,
      };
  return CreateDemandRequestInputSchema.parse({
    item: matched
      ? {
          match: "matched",
          rawRequestText,
          productVariantId: selectedProduct.id,
          ...preferences,
        }
      : { match: "unmatched", rawRequestText, ...preferences },
    customerId: null,
    customerName: draft.customerName.trim() || null,
    customerPhone: draft.phone.trim() || null,
    consentToContact: draft.consentToContact,
    quantity: Number(draft.quantity),
    budget: parseDemandBudget(draft.budget),
    ptaPreference: draft.ptaPreference,
    urgency: draft.urgency,
    channel: draft.channel,
    tradeInInterest: draft.tradeInInterest,
    followUpOn: draft.followUp || null,
    note: draft.note.trim() || null,
    availabilitySnapshot: captureAvailability(productAvailability, now),
  });
}

export function hasDemandDraftErrors(errors: DemandDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}
