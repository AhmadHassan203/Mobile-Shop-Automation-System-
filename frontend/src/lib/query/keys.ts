export const queryKeys = Object.freeze({
  health: ["system", "health"] as const,
  currentAuth: ["auth", "current"] as const,
  dashboard: ["reports", "dashboard"] as const,
  posLookupRoot: ["pricing", "pos-lookup"] as const,
  posLookup: (parameters: object) =>
    ["pricing", "pos-lookup", parameters] as const,
  customersRoot: ["customers"] as const,
  customers: (parameters: object) => ["customers", parameters] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  salesRoot: ["sales"] as const,
  sales: (parameters: object) => ["sales", parameters] as const,
  sale: (id: string) => ["sales", "detail", id] as const,
  saleReceipt: (id: string, format: string) =>
    ["sales", "receipt", id, format] as const,
  demandRoot: ["demand"] as const,
  demandRequests: (parameters: object) => ["demand", parameters] as const,
  demandRequest: (id: string) => ["demand", "detail", id] as const,
  demandConversionCapabilities: ["demand", "conversion-capabilities"] as const,
  catalogProductsRoot: ["catalog", "products"] as const,
  catalogProducts: (parameters: object) =>
    ["catalog", "products", parameters] as const,
  catalogProductDetail: (id: string) =>
    ["catalog", "products", "detail", id] as const,
  catalogReferences: ["catalog", "references"] as const,
  catalogCategoriesRoot: ["catalog", "categories"] as const,
  catalogCategories: (parameters: object) =>
    ["catalog", "categories", parameters] as const,
  catalogBrandsRoot: ["catalog", "brands"] as const,
  catalogBrands: (parameters: object) =>
    ["catalog", "brands", parameters] as const,
  catalogModelsRoot: ["catalog", "product-models"] as const,
  catalogModels: (parameters: object) =>
    ["catalog", "product-models", parameters] as const,
  inventoryBalancesRoot: ["inventory", "balances"] as const,
  inventoryBalances: (parameters: object) =>
    ["inventory", "balances", parameters] as const,
  inventoryMovementsRoot: ["inventory", "movements"] as const,
  inventoryMovements: (parameters: object) =>
    ["inventory", "movements", parameters] as const,
  inventorySerializedUnitsRoot: ["inventory", "serialized-units"] as const,
  inventorySerializedUnits: (parameters: object) =>
    ["inventory", "serialized-units", parameters] as const,
  inventorySerializedUnit: (id: string) =>
    ["inventory", "serialized-units", "detail", id] as const,
  inventoryLocationsRoot: ["inventory", "locations"] as const,
  inventoryLocations: (parameters: object) =>
    ["inventory", "locations", parameters] as const,
  purchasingSuppliersRoot: ["purchasing", "suppliers"] as const,
  purchasingSuppliers: (parameters: object) =>
    ["purchasing", "suppliers", parameters] as const,
  purchasingSupplier: (id: string) =>
    ["purchasing", "suppliers", "detail", id] as const,
  purchasingOrdersRoot: ["purchasing", "orders"] as const,
  purchasingOrders: (parameters: object) =>
    ["purchasing", "orders", parameters] as const,
  purchasingOrder: (id: string) =>
    ["purchasing", "orders", "detail", id] as const,
  purchasingReceiptsRoot: ["purchasing", "receipts"] as const,
  purchasingReceipts: (parameters: object) =>
    ["purchasing", "receipts", parameters] as const,
  purchasingReceipt: (id: string) =>
    ["purchasing", "receipts", "detail", id] as const,
  returnsRoot: ["returns"] as const,
  returns: (parameters: object) => ["returns", parameters] as const,
  return: (id: string) => ["returns", "detail", id] as const,
  returnEligibility: (query: object) =>
    ["returns", "eligibility", query] as const,
  externalRoot: ["external"] as const,
  external: (parameters: object) => ["external", parameters] as const,
  externalTransaction: (id: string) => ["external", "detail", id] as const,
  externalBalances: ["external", "balances"] as const,
  externalCommission: (period: string) =>
    ["external", "commission", period] as const,
  cashSessionsRoot: ["cash-sessions"] as const,
  cashSessions: (parameters: object) => ["cash-sessions", parameters] as const,
  currentCashSession: ["cash-sessions", "current"] as const,
  expensesRoot: ["expenses"] as const,
  expenses: (parameters: object) => ["expenses", parameters] as const,
  dashboardSummaryRoot: ["reports", "dashboard-summary"] as const,
  dashboardSummary: (query: object) =>
    ["reports", "dashboard-summary", query] as const,
  reportsSalesTrendRoot: ["reports", "sales-trend"] as const,
  reportsSalesTrend: (query: object) =>
    ["reports", "sales-trend", query] as const,
  reportsTopProductsRoot: ["reports", "top-products"] as const,
  reportsTopProducts: (query: object) =>
    ["reports", "top-products", query] as const,
  reorderSuggestionsRoot: ["reports", "reorder-suggestions"] as const,
  reorderSuggestions: (query: object) =>
    ["reports", "reorder-suggestions", query] as const,
});
