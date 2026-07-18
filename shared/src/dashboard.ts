import { z } from "zod";

/**
 * Read-only command-centre contracts for the prototype-aligned Dashboard.
 *
 * A missing source is never represented by zero. Every metric and section has
 * an explicit availability discriminator, and unavailable/redacted branches
 * structurally cannot carry business values.
 */

export const DASHBOARD_MONEY_KPI_KEYS = [
  "sales_today",
  "gross_profit",
  "expenses",
  "net_operating",
  "cash_position",
  "inventory_value",
] as const;
export type DashboardMoneyKpiKey = (typeof DASHBOARD_MONEY_KPI_KEYS)[number];

export const DASHBOARD_UNAVAILABLE_REASONS = [
  "source_not_built",
  "source_not_configured",
  "incomplete_source_data",
  "temporarily_unavailable",
] as const;
export type DashboardUnavailableReason =
  (typeof DASHBOARD_UNAVAILABLE_REASONS)[number];

export const DASHBOARD_ATTENTION_SEVERITIES = [
  "negative",
  "warning",
  "info",
  "positive",
] as const;

export const DASHBOARD_LINKS = [
  "/sell",
  "/demand",
  "/customers",
  "/inventory",
  "/stock",
  "/purchases",
  "/purchases?tab=orders",
  "/purchases?tab=suppliers",
  "/purchases?tab=receipts",
  "/returns",
  "/repairs",
  "/used-intake",
  "/finance",
  "/closing",
  "/digital/new",
  "/digital/history",
  "/digital/balances",
  "/digital/commission",
  "/digital/reconciliation",
  "/intelligence",
  "/reports",
  "/tasks",
  "/settings",
] as const;

const saleDetailLinkSchema = z
  .string()
  .regex(
    /^\/sales\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

export const DashboardLinkSchema = z.union([
  z.enum(DASHBOARD_LINKS),
  saleDetailLinkSchema,
]);
export type DashboardLink = z.infer<typeof DashboardLinkSchema>;

const safeMoneyMinorSchema = z.number().int().safe();
const nonnegativeCountSchema = z.number().int().safe().nonnegative();
const shortTextSchema = z.string().trim().min(1).max(500);

export const DashboardValueCoverageSchema = z
  .object({
    valuedUnits: nonnegativeCountSchema,
    uncostedUnits: nonnegativeCountSchema,
  })
  .strict();
export type DashboardValueCoverage = z.infer<
  typeof DashboardValueCoverageSchema
>;

const availableMoneyValueSchema = z
  .object({
    availability: z.literal("available"),
    valueMinor: safeMoneyMinorSchema,
    meta: shortTextSchema,
    trendBasisPoints: z.number().int().safe().nullable().optional(),
    coverage: DashboardValueCoverageSchema.optional(),
  })
  .strict();

const partialMoneyValueSchema = z
  .object({
    availability: z.literal("partial"),
    valueMinor: safeMoneyMinorSchema,
    meta: shortTextSchema,
    message: shortTextSchema,
    coverage: DashboardValueCoverageSchema.optional(),
  })
  .strict();

const unavailableValueSchema = z
  .object({
    availability: z.literal("unavailable"),
    reason: z.enum(DASHBOARD_UNAVAILABLE_REASONS),
    message: shortTextSchema,
  })
  .strict();

const redactedValueSchema = z
  .object({
    availability: z.literal("redacted"),
    message: shortTextSchema,
  })
  .strict();

export const DashboardMoneyValueSchema = z.discriminatedUnion("availability", [
  availableMoneyValueSchema,
  partialMoneyValueSchema,
  unavailableValueSchema,
  redactedValueSchema,
]);
export type DashboardMoneyValue = z.infer<typeof DashboardMoneyValueSchema>;

export const DashboardCountValueSchema = z.discriminatedUnion("availability", [
  z
    .object({
      availability: z.literal("available"),
      value: nonnegativeCountSchema,
      meta: shortTextSchema.optional(),
    })
    .strict(),
  z
    .object({
      availability: z.literal("partial"),
      value: nonnegativeCountSchema,
      message: shortTextSchema,
    })
    .strict(),
  unavailableValueSchema,
  redactedValueSchema,
]);
export type DashboardCountValue = z.infer<typeof DashboardCountValueSchema>;

function moneyKpiSchema(
  key: DashboardMoneyKpiKey,
  label: string,
  href: (typeof DASHBOARD_LINKS)[number],
) {
  return z
    .object({
      key: z.literal(key),
      label: z.literal(label),
      href: z.literal(href),
      definition: shortTextSchema,
      value: DashboardMoneyValueSchema,
    })
    .strict();
}

export const DashboardMoneyKpisSchema = z.tuple([
  moneyKpiSchema("sales_today", "Sales today", "/finance"),
  moneyKpiSchema("gross_profit", "Gross profit", "/finance"),
  moneyKpiSchema("expenses", "Expenses", "/finance"),
  moneyKpiSchema("net_operating", "Net operating", "/finance"),
  moneyKpiSchema("cash_position", "Cash position", "/closing"),
  moneyKpiSchema("inventory_value", "Inventory value", "/stock"),
]);
export type DashboardMoneyKpis = z.infer<typeof DashboardMoneyKpisSchema>;

export const DashboardAttentionItemSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    rank: z.number().int().positive(),
    severity: z.enum(DASHBOARD_ATTENTION_SEVERITIES),
    title: shortTextSchema,
    detail: shortTextSchema,
    href: DashboardLinkSchema,
  })
  .strict();
export type DashboardAttentionItem = z.infer<
  typeof DashboardAttentionItemSchema
>;

function collectionSectionSchema<T extends z.ZodType>(item: T) {
  return z.discriminatedUnion("availability", [
    z
      .object({
        availability: z.literal("available"),
        items: z.array(item),
      })
      .strict(),
    z
      .object({
        availability: z.literal("partial"),
        items: z.array(item),
        message: shortTextSchema,
      })
      .strict(),
    unavailableValueSchema,
    redactedValueSchema,
  ]);
}

export const DashboardAttentionSchema = collectionSectionSchema(
  DashboardAttentionItemSchema,
);
export type DashboardAttention = z.infer<typeof DashboardAttentionSchema>;

export const DashboardRecentSaleSchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z.string().trim().min(1).max(100),
    postedAt: z.iso.datetime(),
    customerName: z.string().trim().min(1).max(200),
    paymentMethod: z.string().trim().min(1).max(80),
    totalMinor: safeMoneyMinorSchema.nonnegative(),
    profit: DashboardMoneyValueSchema,
    href: saleDetailLinkSchema,
  })
  .strict();
export type DashboardRecentSale = z.infer<typeof DashboardRecentSaleSchema>;

export const DashboardRecentSalesSchema = collectionSectionSchema(
  DashboardRecentSaleSchema,
);
export type DashboardRecentSales = z.infer<typeof DashboardRecentSalesSchema>;

export const DashboardUnmetDemandItemSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(240),
    waitingQuantity: nonnegativeCountSchema.positive(),
    href: DashboardLinkSchema,
  })
  .strict();

const demandBuyingDataSchema = z
  .object({
    topUnmet: z.array(DashboardUnmetDemandItemSchema).max(4),
    recommendedBudget: DashboardMoneyValueSchema,
    selectedInvestment: DashboardMoneyValueSchema,
    expectedGrossProfit: DashboardMoneyValueSchema,
  })
  .strict();

export const DashboardDemandAndBuyingSchema = z.discriminatedUnion(
  "availability",
  [
    z
      .object({
        availability: z.literal("available"),
        data: demandBuyingDataSchema,
      })
      .strict(),
    z
      .object({
        availability: z.literal("partial"),
        data: demandBuyingDataSchema,
        message: shortTextSchema,
      })
      .strict(),
    unavailableValueSchema,
    redactedValueSchema,
  ],
);
export type DashboardDemandAndBuying = z.infer<
  typeof DashboardDemandAndBuyingSchema
>;

const digitalServicesDataSchema = z
  .object({
    sentToday: DashboardMoneyValueSchema,
    receivedToday: DashboardMoneyValueSchema,
    customerFeesToday: DashboardMoneyValueSchema,
    providerNetCommission: DashboardMoneyValueSchema,
    netEarnings: DashboardMoneyValueSchema,
    pendingTransactions: DashboardCountValueSchema,
    actionQueue: z.array(DashboardAttentionItemSchema),
  })
  .strict();

export const DashboardDigitalServicesSchema = z.discriminatedUnion(
  "availability",
  [
    z
      .object({
        availability: z.literal("available"),
        data: digitalServicesDataSchema,
      })
      .strict(),
    z
      .object({
        availability: z.literal("partial"),
        data: digitalServicesDataSchema,
        message: shortTextSchema,
      })
      .strict(),
    unavailableValueSchema,
    redactedValueSchema,
  ],
);
export type DashboardDigitalServices = z.infer<
  typeof DashboardDigitalServicesSchema
>;

export const DashboardTaskItemSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240),
    dueLabel: z.string().trim().min(1).max(80),
    priority: z.enum(["high", "medium", "low"]),
    href: DashboardLinkSchema,
  })
  .strict();

export const DashboardTodaysTasksSchema = collectionSectionSchema(
  DashboardTaskItemSchema,
);
export type DashboardTodaysTasks = z.infer<typeof DashboardTodaysTasksSchema>;

const stockSummaryDataSchema = z
  .object({
    onHandUnits: nonnegativeCountSchema,
    reservedUnits: nonnegativeCountSchema,
    availableUnits: nonnegativeCountSchema,
    outOfStockVariantCount: nonnegativeCountSchema,
  })
  .strict()
  .refine((value) => value.reservedUnits <= value.onHandUnits, {
    message: "Reserved units cannot exceed on-hand units.",
  })
  .refine(
    (value) => value.availableUnits + value.reservedUnits <= value.onHandUnits,
    {
      message:
        "Saleable and reserved units cannot exceed physically on-hand units.",
    },
  );

export const DashboardStockSummarySchema = z.discriminatedUnion(
  "availability",
  [
    z
      .object({
        availability: z.literal("available"),
        data: stockSummaryDataSchema,
      })
      .strict(),
    z
      .object({
        availability: z.literal("partial"),
        data: stockSummaryDataSchema,
        message: shortTextSchema,
      })
      .strict(),
    unavailableValueSchema,
    redactedValueSchema,
  ],
);
export type DashboardStockSummary = z.infer<typeof DashboardStockSummarySchema>;

export const DashboardSnapshotSchema = z
  .object({
    asOf: z.iso.datetime(),
    businessDate: z.iso.date(),
    moneyKpis: DashboardMoneyKpisSchema,
    attention: DashboardAttentionSchema,
    recentSales: DashboardRecentSalesSchema,
    demandAndBuying: DashboardDemandAndBuyingSchema,
    digitalServices: DashboardDigitalServicesSchema,
    todaysTasks: DashboardTodaysTasksSchema,
    stockSummary: DashboardStockSummarySchema,
  })
  .strict();
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
