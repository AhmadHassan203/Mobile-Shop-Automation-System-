import {
  BrandPageSchema,
  CategoryPageSchema,
  CreateProductInputSchema,
  ProductModelPageSchema,
  ProductSummaryPageSchema,
  ProductSummarySchema,
  type BrandPage,
  type CategoryPage,
  type CreateProductInput,
  type ProductListQuery,
  type ProductModelPage,
  type ProductSummary,
  type ProductSummaryPage,
} from "@mobileshop/shared";
import type { z } from "zod";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const catalogProductSchema = ProductSummarySchema;
export const catalogProductListSchema = ProductSummaryPageSchema;
export const categoryListSchema = CategoryPageSchema;
export const brandListSchema = BrandPageSchema;
export const productModelListSchema = ProductModelPageSchema;
export const createCatalogProductSchema = CreateProductInputSchema;

export type CatalogProduct = ProductSummary;
export type CatalogProductList = ProductSummaryPage;
export type CategoryList = CategoryPage;
export type BrandList = BrandPage;
export type ProductModelList = ProductModelPage;
export type CreateCatalogProductInput = CreateProductInput;
export type ProductListParameters = ProductListQuery;

export interface CatalogReferences {
  readonly categories: CategoryList["items"];
  readonly brands: BrandList["items"];
  readonly productModels: ProductModelList["items"];
}

function productListQuery(parameters: ProductListParameters): string {
  const query = new URLSearchParams({
    page: String(parameters.page),
    pageSize: String(parameters.pageSize),
  });

  if (parameters.q !== undefined && parameters.q.length > 0) {
    query.set("q", parameters.q);
  }
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
  if (parameters.active !== undefined) {
    query.set("active", String(parameters.active));
  }

  return query.toString();
}

export function getCatalogProducts(
  parameters: ProductListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CatalogProductList> {
  return client.request(`/products?${productListQuery(parameters)}`, {
    method: "GET",
    schema: catalogProductListSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

function getReferenceList<TResponse>(
  path: string,
  schema: z.ZodType<TResponse>,
  signal: AbortSignal | undefined,
  client: ApiClient,
): Promise<TResponse> {
  return client.request(`${path}?page=1&pageSize=100&active=true`, {
    method: "GET",
    schema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export async function getCatalogReferences(
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CatalogReferences> {
  const [categories, brands, productModels] = await Promise.all([
    getReferenceList("/catalog/categories", categoryListSchema, signal, client),
    getReferenceList("/catalog/brands", brandListSchema, signal, client),
    getReferenceList(
      "/catalog/product-models",
      productModelListSchema,
      signal,
      client,
    ),
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
  return client.request("/products", {
    method: "POST",
    schema: catalogProductSchema,
    json: product,
  });
}
