import {
  BrandPageSchema,
  BrandReferenceSchema,
  CatalogVersionInputSchema,
  CategoryPageSchema,
  CategoryReferenceSchema,
  CreateBrandInputSchema,
  CreateCategoryInputSchema,
  CreateProductInputSchema,
  CreateProductModelInputSchema,
  ProductDetailSchema,
  ProductModelPageSchema,
  ProductModelReferenceSchema,
  ProductSummaryPageSchema,
  ProductSummarySchema,
  UpdateBrandInputSchema,
  UpdateCategoryInputSchema,
  UpdateProductInputSchema,
  UpdateProductModelInputSchema,
  type BrandListQuery,
  type BrandPage,
  type BrandReference,
  type CategoryListQuery,
  type CategoryPage,
  type CategoryReference,
  type CreateBrandInput,
  type CreateCategoryInput,
  type CreateProductInput,
  type CreateProductModelInput,
  type ProductDetail,
  type ProductListQuery,
  type ProductModelListQuery,
  type ProductModelPage,
  type ProductModelReference,
  type ProductSummary,
  type ProductSummaryPage,
  type UpdateBrandInput,
  type UpdateCategoryInput,
  type UpdateProductInput,
  type UpdateProductModelInput,
} from "@mobileshop/shared";
import type { z } from "zod";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const catalogProductSchema = ProductSummarySchema;
export const catalogProductDetailSchema = ProductDetailSchema;
export const catalogProductListSchema = ProductSummaryPageSchema;
export const categoryListSchema = CategoryPageSchema;
export const brandListSchema = BrandPageSchema;
export const productModelListSchema = ProductModelPageSchema;
export const catalogCategorySchema = CategoryReferenceSchema;
export const catalogBrandSchema = BrandReferenceSchema;
export const catalogProductModelSchema = ProductModelReferenceSchema;

export const createCatalogProductSchema = CreateProductInputSchema;
export const updateCatalogProductSchema = UpdateProductInputSchema;
export const createCatalogCategorySchema = CreateCategoryInputSchema;
export const updateCatalogCategorySchema = UpdateCategoryInputSchema;
export const createCatalogBrandSchema = CreateBrandInputSchema;
export const updateCatalogBrandSchema = UpdateBrandInputSchema;
export const createCatalogProductModelSchema = CreateProductModelInputSchema;
export const updateCatalogProductModelSchema = UpdateProductModelInputSchema;
export const catalogVersionSchema = CatalogVersionInputSchema;

export type CatalogProduct = ProductSummary;
export type CatalogProductDetail = ProductDetail;
export type CatalogProductList = ProductSummaryPage;
export type CategoryList = CategoryPage;
export type BrandList = BrandPage;
export type ProductModelList = ProductModelPage;
export type CatalogCategory = CategoryReference;
export type CatalogBrand = BrandReference;
export type CatalogProductModel = ProductModelReference;

export type CreateCatalogProductInput = CreateProductInput;
export type UpdateCatalogProductInput = UpdateProductInput;
export type CreateCatalogCategoryInput = CreateCategoryInput;
export type UpdateCatalogCategoryInput = UpdateCategoryInput;
export type CreateCatalogBrandInput = CreateBrandInput;
export type UpdateCatalogBrandInput = UpdateBrandInput;
export type CreateCatalogProductModelInput = CreateProductModelInput;
export type UpdateCatalogProductModelInput = UpdateProductModelInput;

export type ProductListParameters = ProductListQuery;
export type CategoryListParameters = CategoryListQuery;
export type BrandListParameters = BrandListQuery;
export type ProductModelListParameters = ProductModelListQuery;

export interface CatalogReferences {
  readonly categories: CategoryList["items"];
  readonly brands: BrandList["items"];
  readonly productModels: ProductModelList["items"];
}

interface BaseListParameters {
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string | undefined;
  readonly active?: boolean | undefined;
}

/** Server-side paging, search and status filtering shared by every catalog list. */
function baseListQuery(parameters: BaseListParameters): URLSearchParams {
  const query = new URLSearchParams({
    page: String(parameters.page),
    pageSize: String(parameters.pageSize),
  });

  if (parameters.q !== undefined && parameters.q.length > 0) {
    query.set("q", parameters.q);
  }
  if (parameters.active !== undefined) {
    query.set("active", String(parameters.active));
  }

  return query;
}

function productListQuery(parameters: ProductListParameters): string {
  const query = baseListQuery(parameters);

  if (parameters.brandId !== undefined) {
    query.set("brandId", parameters.brandId);
  }
  if (parameters.categoryId !== undefined) {
    query.set("categoryId", parameters.categoryId);
  }
  if (parameters.trackingType !== undefined) {
    query.set("trackingType", parameters.trackingType);
  }
  if (parameters.condition !== undefined) {
    query.set("condition", parameters.condition);
  }
  if (parameters.ptaStatus !== undefined) {
    query.set("ptaStatus", parameters.ptaStatus);
  }

  return query.toString();
}

function productModelListQuery(parameters: ProductModelListParameters): string {
  const query = baseListQuery(parameters);

  if (parameters.brandId !== undefined) {
    query.set("brandId", parameters.brandId);
  }
  if (parameters.categoryId !== undefined) {
    query.set("categoryId", parameters.categoryId);
  }

  return query.toString();
}

function getJson<TResponse>(
  path: string,
  schema: z.ZodType<TResponse>,
  signal: AbortSignal | undefined,
  client: ApiClient,
): Promise<TResponse> {
  return client.request(path, {
    method: "GET",
    schema,
    ...(signal === undefined ? {} : { signal }),
  });
}

function sendJson<TResponse>(
  path: string,
  method: "POST" | "PATCH",
  json: unknown,
  schema: z.ZodType<TResponse>,
  client: ApiClient,
): Promise<TResponse> {
  return client.request(path, { method, schema, json });
}

/**
 * Deactivate and reactivate share one body shape: the version the editor saw.
 * Parsing here means a stale or malformed token never reaches the network.
 */
function sendTransition<TResponse>(
  path: string,
  version: number,
  schema: z.ZodType<TResponse>,
  client: ApiClient,
): Promise<TResponse> {
  const body = catalogVersionSchema.parse({ version });
  return sendJson(path, "POST", body, schema, client);
}

function resourcePath(collection: string, id: string): string {
  return `${collection}/${encodeURIComponent(id)}`;
}

const CATEGORIES = "/catalog/categories";
const BRANDS = "/catalog/brands";
const PRODUCT_MODELS = "/catalog/product-models";
const PRODUCTS = "/products";

export function getCatalogProducts(
  parameters: ProductListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CatalogProductList> {
  return getJson(
    `${PRODUCTS}?${productListQuery(parameters)}`,
    catalogProductListSchema,
    signal,
    client,
  );
}

export function getCatalogProduct(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CatalogProductDetail> {
  return getJson(
    resourcePath(PRODUCTS, id),
    catalogProductDetailSchema,
    signal,
    client,
  );
}

export function getCatalogCategories(
  parameters: CategoryListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CategoryList> {
  return getJson(
    `${CATEGORIES}?${baseListQuery(parameters).toString()}`,
    categoryListSchema,
    signal,
    client,
  );
}

export function getCatalogBrands(
  parameters: BrandListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<BrandList> {
  return getJson(
    `${BRANDS}?${baseListQuery(parameters).toString()}`,
    brandListSchema,
    signal,
    client,
  );
}

export function getCatalogProductModels(
  parameters: ProductModelListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<ProductModelList> {
  return getJson(
    `${PRODUCT_MODELS}?${productModelListQuery(parameters)}`,
    productModelListSchema,
    signal,
    client,
  );
}

function getReferenceList<TResponse>(
  path: string,
  schema: z.ZodType<TResponse>,
  signal: AbortSignal | undefined,
  client: ApiClient,
): Promise<TResponse> {
  return getJson(
    `${path}?page=1&pageSize=100&active=true`,
    schema,
    signal,
    client,
  );
}

export async function getCatalogReferences(
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CatalogReferences> {
  const [categories, brands, productModels] = await Promise.all([
    getReferenceList(CATEGORIES, categoryListSchema, signal, client),
    getReferenceList(BRANDS, brandListSchema, signal, client),
    getReferenceList(PRODUCT_MODELS, productModelListSchema, signal, client),
  ]);

  return {
    categories: categories.items,
    brands: brands.items,
    productModels: productModels.items,
  };
}

export function createCatalogProduct(
  input: CreateCatalogProductInput,
  client: ApiClient = apiClient,
): Promise<CatalogProduct> {
  const product = createCatalogProductSchema.parse(input);
  return sendJson(PRODUCTS, "POST", product, catalogProductSchema, client);
}

export function updateCatalogProduct(
  id: string,
  input: UpdateCatalogProductInput,
  client: ApiClient = apiClient,
): Promise<CatalogProductDetail> {
  const product = updateCatalogProductSchema.parse(input);
  return sendJson(
    resourcePath(PRODUCTS, id),
    "PATCH",
    product,
    catalogProductDetailSchema,
    client,
  );
}

export function deactivateCatalogProduct(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogProductDetail> {
  return sendTransition(
    `${resourcePath(PRODUCTS, id)}/deactivate`,
    version,
    catalogProductDetailSchema,
    client,
  );
}

export function activateCatalogProduct(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogProductDetail> {
  return sendTransition(
    `${resourcePath(PRODUCTS, id)}/activate`,
    version,
    catalogProductDetailSchema,
    client,
  );
}

export function createCatalogCategory(
  input: CreateCatalogCategoryInput,
  client: ApiClient = apiClient,
): Promise<CatalogCategory> {
  const category = createCatalogCategorySchema.parse(input);
  return sendJson(CATEGORIES, "POST", category, catalogCategorySchema, client);
}

export function updateCatalogCategory(
  id: string,
  input: UpdateCatalogCategoryInput,
  client: ApiClient = apiClient,
): Promise<CatalogCategory> {
  const category = updateCatalogCategorySchema.parse(input);
  return sendJson(
    resourcePath(CATEGORIES, id),
    "PATCH",
    category,
    catalogCategorySchema,
    client,
  );
}

export function deactivateCatalogCategory(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogCategory> {
  return sendTransition(
    `${resourcePath(CATEGORIES, id)}/deactivate`,
    version,
    catalogCategorySchema,
    client,
  );
}

export function activateCatalogCategory(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogCategory> {
  return sendTransition(
    `${resourcePath(CATEGORIES, id)}/activate`,
    version,
    catalogCategorySchema,
    client,
  );
}

export function createCatalogBrand(
  input: CreateCatalogBrandInput,
  client: ApiClient = apiClient,
): Promise<CatalogBrand> {
  const brand = createCatalogBrandSchema.parse(input);
  return sendJson(BRANDS, "POST", brand, catalogBrandSchema, client);
}

export function updateCatalogBrand(
  id: string,
  input: UpdateCatalogBrandInput,
  client: ApiClient = apiClient,
): Promise<CatalogBrand> {
  const brand = updateCatalogBrandSchema.parse(input);
  return sendJson(
    resourcePath(BRANDS, id),
    "PATCH",
    brand,
    catalogBrandSchema,
    client,
  );
}

export function deactivateCatalogBrand(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogBrand> {
  return sendTransition(
    `${resourcePath(BRANDS, id)}/deactivate`,
    version,
    catalogBrandSchema,
    client,
  );
}

export function activateCatalogBrand(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogBrand> {
  return sendTransition(
    `${resourcePath(BRANDS, id)}/activate`,
    version,
    catalogBrandSchema,
    client,
  );
}

export function createCatalogProductModel(
  input: CreateCatalogProductModelInput,
  client: ApiClient = apiClient,
): Promise<CatalogProductModel> {
  const model = createCatalogProductModelSchema.parse(input);
  return sendJson(
    PRODUCT_MODELS,
    "POST",
    model,
    catalogProductModelSchema,
    client,
  );
}

export function updateCatalogProductModel(
  id: string,
  input: UpdateCatalogProductModelInput,
  client: ApiClient = apiClient,
): Promise<CatalogProductModel> {
  const model = updateCatalogProductModelSchema.parse(input);
  return sendJson(
    resourcePath(PRODUCT_MODELS, id),
    "PATCH",
    model,
    catalogProductModelSchema,
    client,
  );
}

export function deactivateCatalogProductModel(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogProductModel> {
  return sendTransition(
    `${resourcePath(PRODUCT_MODELS, id)}/deactivate`,
    version,
    catalogProductModelSchema,
    client,
  );
}

export function activateCatalogProductModel(
  id: string,
  version: number,
  client: ApiClient = apiClient,
): Promise<CatalogProductModel> {
  return sendTransition(
    `${resourcePath(PRODUCT_MODELS, id)}/activate`,
    version,
    catalogProductModelSchema,
    client,
  );
}
