import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  createCatalogProduct,
  createCatalogProductSchema,
  catalogProductSchema,
  getCatalogProducts,
  getCatalogReferences,
} from "./catalog";

const productFixture = {
  id: "11111111-1111-4111-8111-111111111111",
  productModel: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Galaxy A56",
    brand: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Samsung",
    },
    category: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Smartphones",
    },
  },
  sku: "SAM-A56-256-BLK",
  name: "256 GB Black",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  ram: "8 GB",
  storage: "256 GB",
  color: "Black",
  region: null,
  warrantyType: "official",
  warrantyMonths: 12,
  isActive: true,
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
} as const;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

describe("catalog API contracts", () => {
  it("requests a real server-filtered product page", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        items: [productFixture],
        page: 2,
        pageSize: 25,
        total: 26,
        totalPages: 2,
      }),
    );
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(
      getCatalogProducts(
        {
          page: 2,
          pageSize: 25,
          q: "Galaxy A56",
          brandId: productFixture.productModel.brand.id,
          categoryId: productFixture.productModel.category.id,
          trackingType: "serialized",
          condition: "new",
          ptaStatus: "pta_approved",
          active: true,
        },
        undefined,
        client,
      ),
    ).resolves.toMatchObject({ items: [{ sku: "SAM-A56-256-BLK" }] });

    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/api/v1/products");
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      page: "2",
      pageSize: "25",
      q: "Galaxy A56",
      brandId: productFixture.productModel.brand.id,
      categoryId: productFixture.productModel.category.id,
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      active: "true",
    });
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it("loads active category, brand, and model references from real endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = new URL(String(input)).pathname;
      const page = { page: 1, pageSize: 100, total: 1, totalPages: 1 };
      if (path.endsWith("/categories")) {
        return Promise.resolve(
          jsonResponse({
            ...page,
            items: [
              {
                id: productFixture.productModel.category.id,
                name: "Smartphones",
                parentCategoryId: null,
                isActive: true,
              },
            ],
          }),
        );
      }
      if (path.endsWith("/brands")) {
        return Promise.resolve(
          jsonResponse({
            ...page,
            items: [
              {
                id: productFixture.productModel.brand.id,
                name: "Samsung",
                isActive: true,
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          ...page,
          items: [
            {
              id: productFixture.productModel.id,
              name: "Galaxy A56",
              brandId: productFixture.productModel.brand.id,
              brandName: "Samsung",
              categoryId: productFixture.productModel.category.id,
              categoryName: "Smartphones",
              isActive: true,
            },
          ],
        }),
      );
    });
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(
      getCatalogReferences(undefined, client),
    ).resolves.toMatchObject({
      categories: [{ name: "Smartphones" }],
      brands: [{ name: "Samsung" }],
      productModels: [{ name: "Galaxy A56" }],
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [input, init] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.search).toBe("?page=1&pageSize=100&active=true");
      expect(init?.credentials).toBe("include");
    }
  });

  it("posts only the agreed product identity fields", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(productFixture));
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    await expect(
      createCatalogProduct(
        {
          productModelId: productFixture.productModel.id,
          sku: " sam a56 256 blk ",
          name: " 256 GB Black ",
          trackingType: "serialized",
          condition: "new",
          ptaStatus: "pta_approved",
          ram: "8 GB",
          storage: "256 GB",
          color: "Black",
          warrantyType: "official",
          warrantyMonths: 12,
          aliases: ["Galaxy A56 Black"],
          barcodes: ["8800000000001"],
        },
        client,
      ),
    ).resolves.toMatchObject({ id: productFixture.id });

    const init = fetcher.mock.calls[0]?.[1];
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/products",
    );
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      productModelId: productFixture.productModel.id,
      sku: "SAM-A56-256-BLK",
      name: "256 GB Black",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      ram: "8 GB",
      storage: "256 GB",
      color: "Black",
      warrantyType: "official",
      warrantyMonths: 12,
      aliases: ["Galaxy A56 Black"],
      barcodes: ["8800000000001"],
    });
    for (const forbidden of [
      "organizationId",
      "cost",
      "price",
      "stock",
      "imei",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it("rejects smuggled tenant, financial, stock, and IMEI fields before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });
    const unsafeInput = {
      productModelId: productFixture.productModel.id,
      sku: "SAM-A56",
      name: "Galaxy A56",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      organizationId: "55555555-5555-4555-8555-555555555555",
      cost: 1,
      price: 2,
      stock: 3,
      imei: "123456789012347",
    };

    expect(createCatalogProductSchema.safeParse(unsafeInput).success).toBe(
      false,
    );
    expect(() => createCatalogProduct(unsafeInput as never, client)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects response fields that cross catalog boundaries", () => {
    expect(
      catalogProductSchema.safeParse({
        ...productFixture,
        supplierCost: 100,
        sellingPrice: 120,
        stockOnHand: 1,
        aliases: ["not part of a list summary"],
        barcodes: ["not part of a list summary"],
      }).success,
    ).toBe(false);
  });
});
