export const queryKeys = Object.freeze({
  health: ["system", "health"] as const,
  currentAuth: ["auth", "current"] as const,
  catalogProductsRoot: ["catalog", "products"] as const,
  catalogProducts: (parameters: object) =>
    ["catalog", "products", parameters] as const,
  catalogReferences: ["catalog", "references"] as const,
});
