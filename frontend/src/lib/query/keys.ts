export const queryKeys = Object.freeze({
  health: ["system", "health"] as const,
  currentAuth: ["auth", "current"] as const,
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
});
