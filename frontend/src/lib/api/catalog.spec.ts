import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  activateCatalogBrand,
  activateCatalogCategory,
  activateCatalogProduct,
  activateCatalogProductModel,
  catalogProductDetailSchema,
  catalogProductSchema,
  createCatalogBrand,
  createCatalogCategory,
  createCatalogProduct,
  createCatalogProductModel,
  createCatalogProductSchema,
  deactivateCatalogBrand,
  deactivateCatalogCategory,
  deactivateCatalogProduct,
  deactivateCatalogProductModel,
  getCatalogBrands,
  getCatalogCategories,
  getCatalogProduct,
  getCatalogProductModels,
  getCatalogProducts,
  getCatalogReferences,
  updateCatalogBrand,
  updateCatalogCategory,
  updateCatalogProduct,
  updateCatalogProductModel,
  type UpdateCatalogProductInput,
} from "./catalog";

const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const PARENT_CATEGORY_ID = "88888888-8888-4888-8888-888888888888";
const BRAND_ID = "33333333-3333-4333-8333-333333333333";
const MODEL_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const ALIAS_ID = "66666666-6666-4666-8666-666666666666";
const BARCODE_ID = "77777777-7777-4777-8777-777777777777";

const productFixture = {
  id: PRODUCT_ID,
  productModel: {
    id: MODEL_ID,
    name: "Galaxy A56",
    brand: { id: BRAND_ID, name: "Samsung" },
    category: { id: CATEGORY_ID, name: "Smartphones" },
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
  version: 3,
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
} as const;

const productDetailFixture = {
  ...productFixture,
  aliases: [{ id: ALIAS_ID, alias: "Galaxy A56 Black" }],
  barcodes: [{ id: BARCODE_ID, barcode: "8800000000001", isPrimary: true }],
} as const;

const categoryFixture = {
  id: CATEGORY_ID,
  name: "Smartphones",
  parentCategoryId: null,
  isActive: true,
  version: 2,
} as const;

const brandFixture = {
  id: BRAND_ID,
  name: "Samsung",
  isActive: true,
  version: 2,
} as const;

const modelFixture = {
  id: MODEL_ID,
  name: "Galaxy A56",
  brandId: BRAND_ID,
  brandName: "Samsung",
  categoryId: CATEGORY_ID,
  categoryName: "Smartphones",
  isActive: true,
  version: 2,
} as const;

const updateProductInput: UpdateCatalogProductInput = {
  productModelId: MODEL_ID,
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
  version: 3,
};

/** Builds the "the server forgot the concurrency token" case. */
function withoutVersion(record: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  delete copy.version;
  return copy;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function pageOf(items: readonly unknown[]): unknown {
  return { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 };
}

function clientReturning(body: unknown): {
  client: ApiClient;
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
} {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
  return {
    client: new ApiClient("http://localhost:4000/api/v1", { fetcher }),
    fetcher,
  };
}

function requestOf(fetcher: ReturnType<typeof vi.fn<typeof fetch>>): {
  url: URL;
  method: string | undefined;
  body: Record<string, unknown>;
} {
  const init = fetcher.mock.calls[0]?.[1];
  return {
    url: new URL(String(fetcher.mock.calls[0]?.[0])),
    method: init?.method,
    body:
      init?.body === undefined || init.body === null
        ? {}
        : (JSON.parse(String(init.body)) as Record<string, unknown>),
  };
}

describe("catalog API contracts", () => {
  it("requests a real server-filtered product page", async () => {
    const { client, fetcher } = clientReturning({
      items: [productFixture],
      page: 2,
      pageSize: 25,
      total: 26,
      totalPages: 2,
    });

    await expect(
      getCatalogProducts(
        {
          page: 2,
          pageSize: 25,
          q: "Galaxy A56",
          brandId: BRAND_ID,
          categoryId: CATEGORY_ID,
          trackingType: "serialized",
          condition: "new",
          ptaStatus: "pta_approved",
          active: true,
        },
        undefined,
        client,
      ),
    ).resolves.toMatchObject({ items: [{ sku: "SAM-A56-256-BLK" }] });

    const { url } = requestOf(fetcher);
    expect(url.pathname).toBe("/api/v1/products");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "25",
      q: "Galaxy A56",
      brandId: BRAND_ID,
      categoryId: CATEGORY_ID,
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
      if (path.endsWith("/categories")) {
        return Promise.resolve(jsonResponse(pageOf([categoryFixture])));
      }
      if (path.endsWith("/brands")) {
        return Promise.resolve(jsonResponse(pageOf([brandFixture])));
      }
      return Promise.resolve(jsonResponse(pageOf([modelFixture])));
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
      expect(new URL(String(input)).search).toBe(
        "?page=1&pageSize=100&active=true",
      );
      expect(init?.credentials).toBe("include");
    }
  });

  it("posts only the agreed product identity fields", async () => {
    const { client, fetcher } = clientReturning(productFixture);

    await expect(
      createCatalogProduct(
        {
          productModelId: MODEL_ID,
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
    ).resolves.toMatchObject({ id: PRODUCT_ID });

    const { url, method, body } = requestOf(fetcher);
    expect(url.href).toBe("http://localhost:4000/api/v1/products");
    expect(method).toBe("POST");
    expect(body).toEqual({
      productModelId: MODEL_ID,
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
      productModelId: MODEL_ID,
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

describe("catalog reference lists", () => {
  it("sends every provided category filter", async () => {
    const { client, fetcher } = clientReturning(pageOf([categoryFixture]));

    await expect(
      getCatalogCategories(
        { page: 3, pageSize: 25, q: "Phones", active: false },
        undefined,
        client,
      ),
    ).resolves.toMatchObject({ items: [{ name: "Smartphones" }] });

    const { url } = requestOf(fetcher);
    expect(url.pathname).toBe("/api/v1/catalog/categories");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "3",
      pageSize: "25",
      q: "Phones",
      active: "false",
    });
  });

  it("omits undefined category filters from the query string", async () => {
    const { client, fetcher } = clientReturning(pageOf([categoryFixture]));

    await getCatalogCategories({ page: 1, pageSize: 25 }, undefined, client);

    const { url } = requestOf(fetcher);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "1",
      pageSize: "25",
    });
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("active")).toBe(false);
  });

  it("sends every provided brand filter", async () => {
    const { client, fetcher } = clientReturning(pageOf([brandFixture]));

    await expect(
      getCatalogBrands(
        { page: 2, pageSize: 50, q: "Sam", active: true },
        undefined,
        client,
      ),
    ).resolves.toMatchObject({ items: [{ name: "Samsung" }] });

    const { url } = requestOf(fetcher);
    expect(url.pathname).toBe("/api/v1/catalog/brands");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "50",
      q: "Sam",
      active: "true",
    });
  });

  it("sends brand and category filters for product models", async () => {
    const { client, fetcher } = clientReturning(pageOf([modelFixture]));

    await expect(
      getCatalogProductModels(
        {
          page: 1,
          pageSize: 25,
          q: "A56",
          active: true,
          brandId: BRAND_ID,
          categoryId: CATEGORY_ID,
        },
        undefined,
        client,
      ),
    ).resolves.toMatchObject({ items: [{ name: "Galaxy A56" }] });

    const { url } = requestOf(fetcher);
    expect(url.pathname).toBe("/api/v1/catalog/product-models");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "1",
      pageSize: "25",
      q: "A56",
      active: "true",
      brandId: BRAND_ID,
      categoryId: CATEGORY_ID,
    });
  });

  it("omits undefined product model filters from the query string", async () => {
    const { client, fetcher } = clientReturning(pageOf([modelFixture]));

    await getCatalogProductModels({ page: 1, pageSize: 25 }, undefined, client);

    expect(Object.fromEntries(requestOf(fetcher).url.searchParams)).toEqual({
      page: "1",
      pageSize: "25",
    });
  });

  it("passes the caller's abort signal through to fetch", async () => {
    const { client, fetcher } = clientReturning(pageOf([brandFixture]));
    const controller = new AbortController();

    await getCatalogBrands(
      { page: 1, pageSize: 25 },
      controller.signal,
      client,
    );

    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects a reference list that leaks the tenant", async () => {
    const { client } = clientReturning(
      pageOf([{ ...categoryFixture, organizationId: CATEGORY_ID }]),
    );

    await expect(
      getCatalogCategories({ page: 1, pageSize: 25 }, undefined, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects a reference list whose rows have no version to edit against", async () => {
    const { client } = clientReturning(
      pageOf([withoutVersion(categoryFixture)]),
    );

    await expect(
      getCatalogCategories({ page: 1, pageSize: 25 }, undefined, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("catalog product detail", () => {
  it("reads one product with its aliases and barcodes", async () => {
    const { client, fetcher } = clientReturning(productDetailFixture);

    await expect(
      getCatalogProduct(PRODUCT_ID, undefined, client),
    ).resolves.toMatchObject({
      id: PRODUCT_ID,
      version: 3,
      aliases: [{ alias: "Galaxy A56 Black" }],
      barcodes: [{ barcode: "8800000000001", isPrimary: true }],
    });

    const { url, method } = requestOf(fetcher);
    expect(url.pathname).toBe(`/api/v1/products/${PRODUCT_ID}`);
    expect(method).toBe("GET");
  });

  it("rejects a detail response carrying price or tenant fields", async () => {
    const { client } = clientReturning({
      ...productDetailFixture,
      priceMinor: 12_000,
      organizationId: "55555555-5555-4555-8555-555555555555",
    });

    await expect(
      getCatalogProduct(PRODUCT_ID, undefined, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects a detail response with more than one primary barcode", () => {
    expect(
      catalogProductDetailSchema.safeParse({
        ...productDetailFixture,
        barcodes: [
          { id: BARCODE_ID, barcode: "8800000000001", isPrimary: true },
          { id: ALIAS_ID, barcode: "8800000000002", isPrimary: true },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("catalog category mutations", () => {
  it("creates a category", async () => {
    const { client, fetcher } = clientReturning(categoryFixture);

    await expect(
      createCatalogCategory({ name: "  Smartphones  " }, client),
    ).resolves.toMatchObject({ id: CATEGORY_ID });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe("/api/v1/catalog/categories");
    expect(method).toBe("POST");
    expect(body).toEqual({ name: "Smartphones" });
  });

  it("updates a category with its version and explicit parent", async () => {
    const { client, fetcher } = clientReturning({
      ...categoryFixture,
      parentCategoryId: PARENT_CATEGORY_ID,
      version: 3,
    });

    await expect(
      updateCatalogCategory(
        CATEGORY_ID,
        {
          name: "Smartphones",
          parentCategoryId: PARENT_CATEGORY_ID,
          version: 2,
        },
        client,
      ),
    ).resolves.toMatchObject({ version: 3 });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(`/api/v1/catalog/categories/${CATEGORY_ID}`);
    expect(method).toBe("PATCH");
    expect(body).toEqual({
      name: "Smartphones",
      parentCategoryId: PARENT_CATEGORY_ID,
      version: 2,
    });
  });

  it("sends an explicit null parent when moving a category to the root", async () => {
    const { client, fetcher } = clientReturning(categoryFixture);

    await updateCatalogCategory(
      CATEGORY_ID,
      { name: "Smartphones", parentCategoryId: null, version: 1 },
      client,
    );

    expect(requestOf(fetcher).body).toEqual({
      name: "Smartphones",
      parentCategoryId: null,
      version: 1,
    });
  });

  it("refuses to update a category without a version", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    expect(() =>
      updateCatalogCategory(
        CATEGORY_ID,
        { name: "Smartphones", parentCategoryId: null } as never,
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("deactivates a category with the version the editor saw", async () => {
    const { client, fetcher } = clientReturning({
      ...categoryFixture,
      isActive: false,
      version: 3,
    });

    await expect(
      deactivateCatalogCategory(CATEGORY_ID, 2, client),
    ).resolves.toMatchObject({ isActive: false, version: 3 });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(
      `/api/v1/catalog/categories/${CATEGORY_ID}/deactivate`,
    );
    expect(method).toBe("POST");
    expect(body).toEqual({ version: 2 });
  });

  it("reactivates a category with the version the editor saw", async () => {
    const { client, fetcher } = clientReturning({
      ...categoryFixture,
      version: 3,
    });

    await expect(
      activateCatalogCategory(CATEGORY_ID, 2, client),
    ).resolves.toMatchObject({ isActive: true });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(
      `/api/v1/catalog/categories/${CATEGORY_ID}/activate`,
    );
    expect(method).toBe("POST");
    expect(body).toEqual({ version: 2 });
  });

  it("refuses a non-positive version before fetch", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    expect(() => deactivateCatalogCategory(CATEGORY_ID, 0, client)).toThrow();
    expect(() => activateCatalogCategory(CATEGORY_ID, -1, client)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("catalog brand mutations", () => {
  it("creates a brand", async () => {
    const { client, fetcher } = clientReturning(brandFixture);

    await expect(
      createCatalogBrand({ name: "  Samsung  " }, client),
    ).resolves.toMatchObject({ id: BRAND_ID });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe("/api/v1/catalog/brands");
    expect(method).toBe("POST");
    expect(body).toEqual({ name: "Samsung" });
  });

  it("updates a brand with its version", async () => {
    const { client, fetcher } = clientReturning({
      ...brandFixture,
      name: "Samsung Electronics",
      version: 3,
    });

    await expect(
      updateCatalogBrand(
        BRAND_ID,
        { name: "Samsung Electronics", version: 2 },
        client,
      ),
    ).resolves.toMatchObject({ version: 3 });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(`/api/v1/catalog/brands/${BRAND_ID}`);
    expect(method).toBe("PATCH");
    expect(body).toEqual({ name: "Samsung Electronics", version: 2 });
  });

  it("deactivates and reactivates a brand by version", async () => {
    const deactivated = clientReturning({ ...brandFixture, isActive: false });
    await deactivateCatalogBrand(BRAND_ID, 2, deactivated.client);
    const deactivateRequest = requestOf(deactivated.fetcher);
    expect(deactivateRequest.url.pathname).toBe(
      `/api/v1/catalog/brands/${BRAND_ID}/deactivate`,
    );
    expect(deactivateRequest.method).toBe("POST");
    expect(deactivateRequest.body).toEqual({ version: 2 });

    const activated = clientReturning(brandFixture);
    await activateCatalogBrand(BRAND_ID, 2, activated.client);
    const activateRequest = requestOf(activated.fetcher);
    expect(activateRequest.url.pathname).toBe(
      `/api/v1/catalog/brands/${BRAND_ID}/activate`,
    );
    expect(activateRequest.body).toEqual({ version: 2 });
  });

  it("refuses a blank brand name before fetch", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    expect(() => createCatalogBrand({ name: "   " }, client)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("catalog product model mutations", () => {
  it("creates a product model", async () => {
    const { client, fetcher } = clientReturning(modelFixture);

    await expect(
      createCatalogProductModel(
        { name: "Galaxy A56", brandId: BRAND_ID, categoryId: CATEGORY_ID },
        client,
      ),
    ).resolves.toMatchObject({ id: MODEL_ID });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe("/api/v1/catalog/product-models");
    expect(method).toBe("POST");
    expect(body).toEqual({
      name: "Galaxy A56",
      brandId: BRAND_ID,
      categoryId: CATEGORY_ID,
    });
  });

  it("updates a product model with its version", async () => {
    const { client, fetcher } = clientReturning({
      ...modelFixture,
      version: 3,
    });

    await expect(
      updateCatalogProductModel(
        MODEL_ID,
        {
          name: "Galaxy A56 5G",
          brandId: BRAND_ID,
          categoryId: CATEGORY_ID,
          version: 2,
        },
        client,
      ),
    ).resolves.toMatchObject({ version: 3 });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(`/api/v1/catalog/product-models/${MODEL_ID}`);
    expect(method).toBe("PATCH");
    expect(body).toEqual({
      name: "Galaxy A56 5G",
      brandId: BRAND_ID,
      categoryId: CATEGORY_ID,
      version: 2,
    });
  });

  it("deactivates and reactivates a product model by version", async () => {
    const deactivated = clientReturning({ ...modelFixture, isActive: false });
    await deactivateCatalogProductModel(MODEL_ID, 2, deactivated.client);
    expect(requestOf(deactivated.fetcher).url.pathname).toBe(
      `/api/v1/catalog/product-models/${MODEL_ID}/deactivate`,
    );
    expect(requestOf(deactivated.fetcher).body).toEqual({ version: 2 });

    const activated = clientReturning(modelFixture);
    await activateCatalogProductModel(MODEL_ID, 2, activated.client);
    expect(requestOf(activated.fetcher).url.pathname).toBe(
      `/api/v1/catalog/product-models/${MODEL_ID}/activate`,
    );
    expect(requestOf(activated.fetcher).body).toEqual({ version: 2 });
  });

  it("refuses a model with a non-uuid brand before fetch", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    expect(() =>
      createCatalogProductModel(
        { name: "Galaxy A56", brandId: "not-a-uuid", categoryId: CATEGORY_ID },
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("catalog product mutations", () => {
  it("updates a product with the whole identity and its version", async () => {
    const { client, fetcher } = clientReturning({
      ...productDetailFixture,
      version: 4,
    });

    await expect(
      updateCatalogProduct(PRODUCT_ID, updateProductInput, client),
    ).resolves.toMatchObject({ version: 4, aliases: [{ id: ALIAS_ID }] });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(`/api/v1/products/${PRODUCT_ID}`);
    expect(method).toBe("PATCH");
    expect(body).toEqual({
      productModelId: MODEL_ID,
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
      version: 3,
    });
  });

  it("normalizes the SKU and sends the desired end-state lists", async () => {
    const { client, fetcher } = clientReturning(productDetailFixture);

    await updateCatalogProduct(
      PRODUCT_ID,
      {
        ...updateProductInput,
        sku: " sam a56 256 blk ",
        aliases: [" Galaxy A56 Black ", "A56 Kala"],
        barcodes: [" 8800000000009 "],
      },
      client,
    );

    const { body } = requestOf(fetcher);
    expect(body).toMatchObject({
      sku: "SAM-A56-256-BLK",
      aliases: ["Galaxy A56 Black", "A56 Kala"],
      barcodes: ["8800000000009"],
      version: 3,
    });
  });

  it("refuses a product update that smuggles price, stock, or a tenant", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    expect(() =>
      updateCatalogProduct(
        PRODUCT_ID,
        {
          ...updateProductInput,
          priceMinor: 12_000,
          stockOnHand: 4,
          organizationId: "55555555-5555-4555-8555-555555555555",
        } as never,
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a product update without a version", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });
    expect(() =>
      updateCatalogProduct(
        PRODUCT_ID,
        withoutVersion(updateProductInput) as never,
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses duplicate aliases before fetch", () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ApiClient("http://localhost:4000/api/v1", { fetcher });

    expect(() =>
      updateCatalogProduct(
        PRODUCT_ID,
        {
          ...updateProductInput,
          aliases: ["Galaxy A56 Black", "galaxy a56 black"],
        },
        client,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("deactivates a product with the version the editor saw", async () => {
    const { client, fetcher } = clientReturning({
      ...productDetailFixture,
      isActive: false,
      version: 4,
    });

    await expect(
      deactivateCatalogProduct(PRODUCT_ID, 3, client),
    ).resolves.toMatchObject({ isActive: false, version: 4 });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(`/api/v1/products/${PRODUCT_ID}/deactivate`);
    expect(method).toBe("POST");
    expect(body).toEqual({ version: 3 });
  });

  it("reactivates a product with the version the editor saw", async () => {
    const { client, fetcher } = clientReturning({
      ...productDetailFixture,
      version: 4,
    });

    await expect(
      activateCatalogProduct(PRODUCT_ID, 3, client),
    ).resolves.toMatchObject({ isActive: true, version: 4 });

    const { url, method, body } = requestOf(fetcher);
    expect(url.pathname).toBe(`/api/v1/products/${PRODUCT_ID}/activate`);
    expect(method).toBe("POST");
    expect(body).toEqual({ version: 3 });
  });

  it("rejects a mutation response that leaks cost or stock", async () => {
    const { client } = clientReturning({
      ...productDetailFixture,
      supplierCost: 100,
      stockOnHand: 2,
    });

    await expect(
      updateCatalogProduct(PRODUCT_ID, updateProductInput, client),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
