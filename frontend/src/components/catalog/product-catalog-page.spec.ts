import { PAGINATION } from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "@/lib/api/client";
import type {
  CatalogProduct,
  CatalogProductDetail,
  CatalogReferences,
} from "@/lib/api/catalog";
import { updateCatalogProduct } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/query/keys";

/**
 * This repository has no DOM test harness — `frontend/vitest.config.ts` runs the
 * node environment and collects `src/**\/*.spec.ts` only. So the component
 * assertions here render to static markup with `react-dom/server`, and every
 * behaviour that needs a click is covered through the pure function that the
 * handler delegates to. Nothing below asserts on a mock of the code under test.
 */

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/inventory",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

// Owned by the reference-tabs agent: stubbed so this spec proves the shell
// routes to the right panel without testing their internals.
vi.mock("./categories-tab", async () => {
  const { createElement: h } = await import("react");
  return { CategoriesTab: () => h("div", null, "Categories panel") };
});
vi.mock("./brands-tab", async () => {
  const { createElement: h } = await import("react");
  return { BrandsTab: () => h("div", null, "Brands panel") };
});
vi.mock("./product-models-tab", async () => {
  const { createElement: h } = await import("react");
  return { ProductModelsTab: () => h("div", null, "Models panel") };
});
vi.mock("./category-form-drawer", async () => {
  const { createElement: h } = await import("react");
  return { CategoryFormDrawer: () => h("div", null, "Category form") };
});
vi.mock("./brand-form-drawer", async () => {
  const { createElement: h } = await import("react");
  return { BrandFormDrawer: () => h("div", null, "Brand form") };
});
vi.mock("./product-model-form-drawer", async () => {
  const { createElement: h } = await import("react");
  return { ProductModelFormDrawer: () => h("div", null, "Model form") };
});

const {
  CATALOG_TABS,
  ProductCatalogPage,
  catalogTabFrom,
  catalogTabQuery,
  nextCatalogTabIndex,
  parametersFrom,
  productStatusChangeMessage,
} = await import("./product-catalog-page");
const {
  ProductDetailDrawer,
  catalogReadErrorCopy,
  orderedProductBarcodes,
  productIdentityRows,
  productPriceFromLookup,
  productPricingLookupParameters,
} = await import("./product-detail-drawer");
const {
  ProductFormDrawer,
  productFieldErrors,
  productFormValuesFromDetail,
  productSubmissionMessage,
  updateProductPayload,
} = await import("./add-product-drawer");

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const MODEL_ID = "22222222-2222-4222-8222-222222222222";
const BRAND_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const ALIAS_ID = "66666666-6666-4666-8666-666666666666";
const BARCODE_ID = "77777777-7777-4777-8777-777777777777";
const SECOND_BARCODE_ID = "99999999-9999-4999-8999-999999999999";

const productSummary: CatalogProduct = {
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
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-10T10:00:00.000Z",
};

const productDetail: CatalogProductDetail = {
  ...productSummary,
  aliases: [{ id: ALIAS_ID, alias: "A56 black" }],
  // Deliberately stored non-primary first, so ordering is actually exercised.
  barcodes: [
    { id: SECOND_BARCODE_ID, barcode: "8801643000002", isPrimary: false },
    { id: BARCODE_ID, barcode: "8801643000001", isPrimary: true },
  ],
};

const references: CatalogReferences = {
  categories: [
    {
      id: CATEGORY_ID,
      name: "Smartphones",
      parentCategoryId: null,
      isActive: true,
      version: 1,
    },
  ],
  brands: [{ id: BRAND_ID, name: "Samsung", isActive: true, version: 1 }],
  productModels: [
    {
      id: MODEL_ID,
      name: "Galaxy A56",
      brandId: BRAND_ID,
      brandName: "Samsung",
      categoryId: CATEGORY_ID,
      categoryName: "Smartphones",
      isActive: true,
      version: 1,
    },
  ],
};

const productPage = {
  items: [productSummary],
  page: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
  total: 1,
  totalPages: 1,
};

function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function seedAuth(client: QueryClient, permissions: readonly string[]): void {
  client.setQueryData(queryKeys.currentAuth, { permissions });
}

function seedProducts(client: QueryClient): void {
  client.setQueryData(
    queryKeys.catalogProducts(parametersFrom(new URLSearchParams(""))),
    productPage,
  );
  client.setQueryData(queryKeys.catalogReferences, references);
}

function render(client: QueryClient, node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, node),
  );
}

beforeEach(() => {
  navigation.search = "";
  navigation.replace.mockReset();
});

describe("catalog workspace tab routing", () => {
  it("defaults to the products tab when ?tab is absent or unknown", () => {
    expect(catalogTabFrom(new URLSearchParams(""))).toBe("products");
    expect(catalogTabFrom(new URLSearchParams("tab=nonsense"))).toBe(
      "products",
    );
    expect(catalogTabFrom(new URLSearchParams("tab=brands"))).toBe("brands");
  });

  it("writes ?tab while preserving every other parameter", () => {
    const query = catalogTabQuery(
      new URLSearchParams("q=galaxy&page=3"),
      "categories",
    );
    const next = new URLSearchParams(query);

    expect(next.get("tab")).toBe("categories");
    expect(next.get("q")).toBe("galaxy");
    expect(next.get("page")).toBe("3");
  });

  it("drops ?tab for the default tab rather than writing a redundant value", () => {
    const query = catalogTabQuery(
      new URLSearchParams("tab=brands&q=galaxy"),
      "products",
    );

    expect(new URLSearchParams(query).has("tab")).toBe(false);
    expect(new URLSearchParams(query).get("q")).toBe("galaxy");
  });

  it("moves focus across the tablist with arrow, Home and End keys", () => {
    const length = CATALOG_TABS.length;

    expect(nextCatalogTabIndex(0, "ArrowRight", length)).toBe(1);
    expect(nextCatalogTabIndex(length - 1, "ArrowRight", length)).toBe(0);
    expect(nextCatalogTabIndex(0, "ArrowLeft", length)).toBe(length - 1);
    expect(nextCatalogTabIndex(2, "Home", length)).toBe(0);
    expect(nextCatalogTabIndex(0, "End", length)).toBe(length - 1);
    expect(nextCatalogTabIndex(0, "a", length)).toBeNull();
  });

  it("renders the products panel and an accessible tablist by default", () => {
    const client = newQueryClient();
    seedAuth(client, ["catalog.view"]);
    seedProducts(client);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="catalog-tab-products"');
    expect(html).toContain('aria-controls="catalog-panel-products"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Catalog variants");
    expect(html).not.toContain("Categories panel");
  });

  it("renders the panel named by ?tab instead of the products panel", () => {
    navigation.search = "tab=categories";
    const client = newQueryClient();
    seedAuth(client, ["catalog.view"]);
    seedProducts(client);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain("Categories panel");
    expect(html).not.toContain("Catalog variants");
    expect(html).toContain('id="catalog-panel-categories"');
  });

  it("keeps the verified header and catalog-vs-stock explainer on every tab", () => {
    navigation.search = "tab=brands";
    const client = newQueryClient();
    seedAuth(client, ["catalog.view"]);
    seedProducts(client);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain("Catalog · Product identity");
    expect(html).toContain("Product catalog");
    expect(html).toContain("A catalog product is not physical inventory.");
    expect(html).toContain("Brands panel");
  });
});

describe("products tab", () => {
  it("renders rows from the API response", () => {
    const client = newQueryClient();
    seedAuth(client, ["catalog.view"]);
    seedProducts(client);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain("SAM-A56-256-BLK");
    expect(html).toContain("Samsung Galaxy A56");
    expect(html).toContain("256 GB Black");
  });

  it("offers view, edit and deactivate to a fully permitted user and never a delete", () => {
    const client = newQueryClient();
    seedAuth(client, [
      "catalog.view",
      "catalog.create",
      "catalog.update",
      "catalog.deactivate",
    ]);
    seedProducts(client);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain(">Edit</button>");
    expect(html).toContain(">Deactivate</button>");
    expect(html).toContain("Add product");
    expect(html).not.toMatch(/>\s*Delete\s*</);
  });

  it("hides edit, deactivate and create from a view-only user", () => {
    const client = newQueryClient();
    seedAuth(client, ["catalog.view"]);
    seedProducts(client);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain("View");
    expect(html).not.toContain(">Edit</button>");
    expect(html).not.toContain(">Deactivate</button>");
    expect(html).not.toContain("Add product");
  });

  it("treats reactivation as an update, not a deactivate grant", () => {
    const client = newQueryClient();
    seedAuth(client, ["catalog.view", "catalog.update"]);
    client.setQueryData(
      queryKeys.catalogProducts(parametersFrom(new URLSearchParams(""))),
      { ...productPage, items: [{ ...productSummary, isActive: false }] },
    );
    client.setQueryData(queryKeys.catalogReferences, references);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain(">Reactivate</button>");
  });

  it("renders the forbidden panel and registers no catalog query without catalog.view", () => {
    const client = newQueryClient();
    seedAuth(client, ["sales.view"]);

    const html = render(client, createElement(ProductCatalogPage));

    expect(html).toContain("Catalog access required");
    expect(html).toContain("No catalog request was sent.");
    expect(html).not.toContain("Catalog variants");
    // The products query is never even constructed, so nothing can fetch it.
    const catalogQueries = client
      .getQueryCache()
      .getAll()
      .filter((query) => query.queryKey[0] === "catalog");
    expect(catalogQueries).toHaveLength(0);
  });

  it("reports a failed deactivate honestly and never as a success", () => {
    const conflict = new ApiError("Version mismatch.", {
      code: "OPTIMISTIC_LOCK_FAILED",
      status: 409,
    });

    const message = productStatusChangeMessage(conflict, true);

    expect(message).toContain("was not deactivated");
    expect(message).toContain("Refresh the catalog");
  });

  it("distinguishes an offline failure from a rejected read", () => {
    const offline = catalogReadErrorCopy(
      new ApiError("The API could not be reached.", { code: "NETWORK_ERROR" }),
    );
    const rejected = catalogReadErrorCopy(
      new ApiError("Nope.", { code: "HTTP_ERROR", status: 500 }),
    );

    expect(offline.title).toContain("could not be reached");
    expect(offline.description).toContain("offline");
    expect(rejected.title).toBe("Catalog could not be loaded");
    expect(rejected.description).toContain("No fallback or mock records");
  });
});

describe("product detail drawer", () => {
  it("shows only catalog identity — never stock, IMEI, cost or price", () => {
    const rows = productIdentityRows(productDetail);

    expect(rows.map((row) => row.label)).toEqual([
      "Brand",
      "Model",
      "Category",
      "Internal SKU",
      "Variant name",
      "Tracking",
      "Condition",
      "PTA status",
      "RAM",
      "Storage",
      "Color",
      "Region",
      "Warranty",
      "Status",
    ]);

    const banned =
      /stock|imei|\bcost\b|\bprice\b|profit|margin|demand|reorder/i;
    for (const row of rows) {
      expect(row.label).not.toMatch(banned);
      expect(row.value).not.toMatch(banned);
    }
  });

  it("says an unrecorded attribute is unrecorded rather than inventing a value", () => {
    const rows = productIdentityRows(productDetail);
    const region = rows.find((row) => row.label === "Region");

    expect(region?.value).toBe("Not recorded");
  });

  it("fetches the product and renders its identity, aliases and primary barcode", () => {
    const client = newQueryClient();
    client.setQueryData(
      queryKeys.catalogProductDetail(PRODUCT_ID),
      productDetail,
    );

    const html = render(
      client,
      createElement(ProductDetailDrawer, {
        canManagePricing: false,
        canUpdate: true,
        canView: true,
        canViewPricing: false,
        onClose: vi.fn(),
        onEdit: vi.fn(),
        productId: PRODUCT_ID,
      }),
    );

    expect(html).toContain("SAM-A56-256-BLK");
    expect(html).toContain("Galaxy A56");
    expect(html).toContain("Official · 12 months");
    expect(html).toContain("A56 black");
    expect(html).toContain("8801643000001");
    expect(html).toContain("Primary");
    expect(html).toContain("Edit product");
  });

  it("links to live Stock and shows the exact product's authoritative price", () => {
    const client = newQueryClient();
    client.setQueryData(
      queryKeys.catalogProductDetail(PRODUCT_ID),
      productDetail,
    );
    const pricePage = {
      items: [
        {
          productVariantId: PRODUCT_ID,
          sku: productDetail.sku,
          name: productDetail.name,
          brandName: productDetail.productModel.brand.name,
          modelName: productDetail.productModel.name,
          categoryName: productDetail.productModel.category.name,
          trackingType: "serialized" as const,
          condition: "new" as const,
          ptaStatus: "pta_approved" as const,
          productVersion: productDetail.version,
          effectivePrice: {
            currency: "PKR",
            unitPriceMinor: 12_500_000,
            minimumUnitPriceMinor: 12_000_000,
            source: "variant_default" as const,
            sourceId: null,
            version: productDetail.version,
            effectiveAt: "2026-07-16T10:00:00.000Z",
          },
          stock: { availability: "out_of_stock" as const },
        },
      ],
      page: 1,
      pageSize: PAGINATION.MAX_PAGE_SIZE,
      total: 1,
      totalPages: 1,
    };
    client.setQueryData(
      queryKeys.posLookup(productPricingLookupParameters(productDetail)),
      pricePage,
    );

    const html = render(
      client,
      createElement(ProductDetailDrawer, {
        canManagePricing: false,
        canUpdate: false,
        canView: true,
        canViewPricing: true,
        onClose: vi.fn(),
        onEdit: vi.fn(),
        productId: PRODUCT_ID,
      }),
    );

    expect(html).toContain("Stock and pricing are live");
    expect(html).toContain(`/stock?q=${productDetail.sku}`);
    expect(html).toContain("PKR 125,000.00");
    expect(html).toContain("Product default");
    expect(html).toContain("pricing.manage");
    expect(html).not.toContain("have not been built yet");
    expect(html).not.toContain("Edit product");

    expect(productPriceFromLookup(pricePage, PRODUCT_ID)).toEqual(
      pricePage.items[0]?.effectivePrice,
    );
  });

  it("orders barcodes primary-first regardless of stored order", () => {
    const ordered = orderedProductBarcodes(productDetail.barcodes);

    expect(ordered[0]?.isPrimary).toBe(true);
    expect(ordered[0]?.barcode).toBe("8801643000001");
  });

  it("issues no detail request without catalog.view", () => {
    const client = newQueryClient();

    const html = render(
      client,
      createElement(ProductDetailDrawer, {
        canManagePricing: false,
        canUpdate: false,
        canView: false,
        canViewPricing: false,
        onClose: vi.fn(),
        onEdit: vi.fn(),
        productId: PRODUCT_ID,
      }),
    );

    expect(html).toContain("Catalog access required");
    expect(html).toContain("No product request was sent.");
    expect(
      client.getQueryData(queryKeys.catalogProductDetail(PRODUCT_ID)),
    ).toBeUndefined();
  });
});

describe("product edit form", () => {
  it("prefills every stored identity field, primary barcode first", () => {
    const values = productFormValuesFromDetail(productDetail);

    expect(values).toMatchObject({
      productModelId: MODEL_ID,
      sku: "SAM-A56-256-BLK",
      name: "256 GB Black",
      trackingType: "serialized",
      condition: "new",
      ptaStatus: "pta_approved",
      ram: "8 GB",
      storage: "256 GB",
      color: "Black",
      region: "",
      warrantyType: "official",
      warrantyMonths: "12",
    });
    expect(values.aliases).toEqual([{ value: "A56 black" }]);
    expect(values.barcodes).toEqual([
      { value: "8801643000001" },
      { value: "8801643000002" },
    ]);
  });

  it("renders tracking type read-only with honest copy in edit mode", () => {
    const client = newQueryClient();
    client.setQueryData(
      queryKeys.catalogProductDetail(PRODUCT_ID),
      productDetail,
    );

    const html = render(
      client,
      createElement(ProductFormDrawer, {
        canCreateReferences: true,
        mode: "edit",
        onClose: vi.fn(),
        onSaved: vi.fn(),
        productId: PRODUCT_ID,
        references,
      }),
    );

    expect(html).toContain(
      "Tracking type cannot change after a product is created.",
    );
    // The stored value is still rendered and still submitted — it is presented
    // as a read-only control rather than a select the owner can change.
    expect(html).toMatch(/<input[^>]*readonly[^>]*value="Serialized"/i);
    expect(html).not.toMatch(/<select[^>]*name="trackingType"/);
    expect(html).toContain("Save product");
  });

  it("offers a tracking select when creating, because nothing is locked yet", () => {
    const client = newQueryClient();

    const html = render(
      client,
      createElement(ProductFormDrawer, {
        canCreateReferences: true,
        mode: "create",
        onClose: vi.fn(),
        onSaved: vi.fn(),
        references,
      }),
    );

    expect(html).toContain("Create product");
    expect(html).not.toContain("Tracking type cannot change");
    expect(html).toMatch(/<select[^>]*name="trackingType"/);
    expect(html).toContain("Add new");
  });

  it("hides inline reference creation without catalog.create", () => {
    const client = newQueryClient();

    const html = render(
      client,
      createElement(ProductFormDrawer, {
        canCreateReferences: false,
        mode: "create",
        onClose: vi.fn(),
        onSaved: vi.fn(),
        references,
      }),
    );

    expect(html).not.toContain("Add new");
  });

  it("PATCHes the prefilled identity with the version it was opened at", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...productDetail, version: 4 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const apiClient = new ApiClient("https://api.test", { fetcher });
    const values = productFormValuesFromDetail(productDetail);

    await updateCatalogProduct(
      PRODUCT_ID,
      updateProductPayload(values, productDetail.version),
      apiClient,
    );

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(url).toBe(`https://api.test/products/${PRODUCT_ID}`);
    expect(init.method).toBe("PATCH");
    expect(body.version).toBe(3);
    expect(body.trackingType).toBe("serialized");
    expect(body.sku).toBe("SAM-A56-256-BLK");
    expect(body.barcodes).toEqual(["8801643000001", "8801643000002"]);
    // The contract has no room for these, and the form must never invent them.
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("cost");
  });

  it("renders a 409 conflict as an honest reload instruction, not a failure to retry blindly", () => {
    const conflict = new ApiError("Version mismatch.", {
      code: "OPTIMISTIC_LOCK_FAILED",
      status: 409,
    });

    const message = productSubmissionMessage(conflict, "edit");

    expect(message).toContain("changed this product since you opened it");
    expect(message).toContain("Nothing was saved");
  });

  it("attaches duplicate-value conflicts to the field that caused them", () => {
    expect(
      productFieldErrors(
        new ApiError("SKU already exists.", {
          code: "CATALOG_SKU_DUPLICATE",
          status: 409,
        }),
      ),
    ).toEqual({ sku: ["SKU already exists."] });

    expect(
      productFieldErrors(
        new ApiError("Barcode already exists.", {
          code: "CATALOG_BARCODE_DUPLICATE",
          status: 409,
        }),
      ),
    ).toEqual({ barcodes: ["Barcode already exists."] });
  });

  it("passes 422 field details through untouched", () => {
    const validation = new ApiError("Validation failed.", {
      code: "VALIDATION_FAILED",
      status: 422,
      details: { aliases: ["Alias duplicates item 1."] },
    });

    expect(productFieldErrors(validation)).toEqual({
      aliases: ["Alias duplicates item 1."],
    });
  });

  it("never claims a save happened when the API is unreachable", () => {
    const offline = new ApiError("The API could not be reached.", {
      code: "NETWORK_ERROR",
    });

    expect(productSubmissionMessage(offline, "create")).toContain(
      "nothing was created",
    );
    expect(productSubmissionMessage(offline, "edit")).toContain(
      "nothing was saved",
    );
  });
});
