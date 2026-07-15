import { PAGINATION, PERMISSIONS } from "@mobileshop/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as CatalogApi from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";
import { catalogCategoriesQueryOptions } from "@/lib/query/catalog-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * The frontend test harness runs in a node environment with no DOM, so these
 * specs split the surface in two: the tab's decisions (URL namespacing,
 * permission gating, which transition carries which version) are exercised
 * directly as pure functions, and the rendered output is asserted through
 * server rendering with a pre-seeded query cache. Neither needs a browser.
 */

const navigation = vi.hoisted(() => ({
  pathname: "/inventory",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

const catalogApi = vi.hoisted(() => ({
  getCatalogCategories: vi.fn(),
  getCatalogBrands: vi.fn(),
  getCatalogProductModels: vi.fn(),
  getCatalogReferences: vi.fn(),
}));

vi.mock("@/lib/api/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogApi>()),
  ...catalogApi,
}));

const { BrandsTab } = await import("./brands-tab");
const { CategoriesTab } = await import("./categories-tab");
const { CategoryFormDrawer } = await import("./category-form-drawer");
const {
  BRAND_PARAMETER_NAMES,
  CATEGORY_PARAMETER_NAMES,
  PRODUCT_MODEL_PARAMETER_NAMES,
  applyParameterUpdates,
  brandListParametersFrom,
  categoryListParametersFrom,
  clearFilterUpdates,
  fieldMessages,
  hasReferenceFilters,
  mergeFieldMessages,
  productModelListParametersFrom,
  referenceCapabilities,
  referenceErrorMessage,
  runReferenceTransition,
} = await import("./reference-tab-state");

const SMARTPHONES_ID = "44444444-4444-4444-8444-444444444444";
const ANDROID_ID = "88888888-8888-4888-8888-888888888888";
const BRAND_ID = "33333333-3333-4333-8333-333333333333";

const smartphones = {
  id: SMARTPHONES_ID,
  name: "Smartphones",
  parentCategoryId: null,
  isActive: true,
  version: 3,
} as const;

const androidPhones = {
  id: ANDROID_ID,
  name: "Android phones",
  parentCategoryId: SMARTPHONES_ID,
  isActive: false,
  version: 7,
} as const;

const samsung = {
  id: BRAND_ID,
  name: "Samsung",
  isActive: true,
  version: 2,
} as const;

function categoryPage(items: readonly object[]): object {
  return {
    items,
    page: 1,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    total: items.length,
    totalPages: 1,
  };
}

const ALL_CATALOG_PERMISSIONS = [
  PERMISSIONS.CATALOG_VIEW,
  PERMISSIONS.CATALOG_CREATE,
  PERMISSIONS.CATALOG_UPDATE,
  PERMISSIONS.CATALOG_DEACTIVATE,
];

interface RenderOptions {
  readonly permissions: readonly string[];
  readonly categories?: readonly object[];
  readonly brands?: readonly object[];
}

function render(
  component: FunctionComponent,
  {
    permissions,
    categories = [smartphones],
    brands = [samsung],
  }: RenderOptions,
): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKeys.currentAuth, { permissions });
  client.setQueryData(queryKeys.catalogReferences, {
    categories: [smartphones],
    brands: [samsung],
    productModels: [],
  });
  client.setQueryData(
    queryKeys.catalogCategories(
      categoryListParametersFrom(navigation.searchParams),
    ),
    categoryPage(categories),
  );
  client.setQueryData(
    queryKeys.catalogBrands(brandListParametersFrom(navigation.searchParams)),
    categoryPage(brands),
  );
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(component)),
  );
}

beforeEach(() => {
  navigation.searchParams = new URLSearchParams();
});

describe("namespaced list parameters", () => {
  it("reads each tab from its own prefix so the tabs cannot collide", () => {
    const searchParams = new URLSearchParams(
      "cq=phones&cactive=false&cpage=2&bq=sam&bactive=true&bpage=3&mq=galaxy&mpage=4&mbrandId=brand-1&mcategoryId=cat-1",
    );

    expect(categoryListParametersFrom(searchParams)).toStrictEqual({
      page: 2,
      pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
      q: "phones",
      active: false,
    });
    expect(brandListParametersFrom(searchParams)).toStrictEqual({
      page: 3,
      pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
      q: "sam",
      active: true,
    });
    expect(productModelListParametersFrom(searchParams)).toStrictEqual({
      page: 4,
      pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
      q: "galaxy",
      brandId: "brand-1",
      categoryId: "cat-1",
    });
  });

  it("ignores the product tab's un-prefixed parameters", () => {
    const searchParams = new URLSearchParams("q=iphone&page=9&active=true");

    expect(categoryListParametersFrom(searchParams)).toStrictEqual({
      page: 1,
      pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    });
  });

  it("falls back to page one rather than trusting a hand-edited page", () => {
    for (const value of ["0", "-3", "abc", "1.5", ""]) {
      const searchParams = new URLSearchParams(`cpage=${value}`);
      expect(categoryListParametersFrom(searchParams).page).toBe(1);
    }
  });

  it("treats a blank search as no search at all", () => {
    const searchParams = new URLSearchParams("cq=%20%20");
    expect(categoryListParametersFrom(searchParams).q).toBeUndefined();
  });

  it("reports when a tab is filtered", () => {
    expect(hasReferenceFilters({ q: "a" })).toBe(true);
    expect(hasReferenceFilters({ active: false })).toBe(true);
    expect(hasReferenceFilters({ brandId: "b" })).toBe(true);
    expect(hasReferenceFilters({})).toBe(false);
  });
});

describe("namespaced parameter updates", () => {
  it("writes its own key and leaves every sibling tab's state intact", () => {
    const current = new URLSearchParams("tab=products&q=iphone&page=4&cpage=3");

    const next = applyParameterUpdates(
      current,
      { [CATEGORY_PARAMETER_NAMES.q]: "samsung" },
      CATEGORY_PARAMETER_NAMES.page,
      true,
    );

    expect(next).toBe("tab=products&q=iphone&page=4&cq=samsung");
  });

  it("resets only its own page when a filter changes", () => {
    const current = new URLSearchParams("cpage=2&bpage=5&page=8");

    const next = applyParameterUpdates(
      current,
      { [BRAND_PARAMETER_NAMES.active]: "true" },
      BRAND_PARAMETER_NAMES.page,
      true,
    );

    expect(next).toBe("cpage=2&page=8&bactive=true");
  });

  it("keeps the page when paging rather than filtering", () => {
    const next = applyParameterUpdates(
      new URLSearchParams("cq=a&cpage=2"),
      { [CATEGORY_PARAMETER_NAMES.page]: "3" },
      CATEGORY_PARAMETER_NAMES.page,
      false,
    );

    expect(next).toBe("cq=a&cpage=3");
  });

  it("drops a key when its value is cleared", () => {
    const next = applyParameterUpdates(
      new URLSearchParams("cq=a&cactive=true"),
      { [CATEGORY_PARAMETER_NAMES.active]: undefined },
      CATEGORY_PARAMETER_NAMES.page,
      true,
    );

    expect(next).toBe("cq=a");
  });

  it("clears its own filters only, never another tab's", () => {
    const next = applyParameterUpdates(
      new URLSearchParams(
        "tab=models&mq=a&mactive=true&mbrandId=b&cq=keep&q=keep",
      ),
      clearFilterUpdates(PRODUCT_MODEL_PARAMETER_NAMES),
      PRODUCT_MODEL_PARAMETER_NAMES.page,
      true,
    );

    expect(next).toBe("tab=models&cq=keep&q=keep");
  });
});

describe("permission gating", () => {
  it("mirrors the server's catalog grants", () => {
    expect(referenceCapabilities(ALL_CATALOG_PERMISSIONS)).toStrictEqual({
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDeactivate: true,
    });
  });

  it("grants nothing while the permission set is still unknown", () => {
    expect(referenceCapabilities(undefined)).toStrictEqual({
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDeactivate: false,
    });
  });

  it("never enables the list request without catalog.view", () => {
    const capabilities = referenceCapabilities([PERMISSIONS.CATALOG_CREATE]);

    expect(capabilities.canView).toBe(false);
    expect(
      catalogCategoriesQueryOptions(
        { page: 1, pageSize: PAGINATION.DEFAULT_PAGE_SIZE },
        capabilities.canView,
      ).enabled,
    ).toBe(false);
  });
});

describe("row transitions", () => {
  const api = { activate: vi.fn(), deactivate: vi.fn() };

  beforeEach(() => {
    api.activate.mockReset().mockResolvedValue(smartphones);
    api.deactivate.mockReset().mockResolvedValue(smartphones);
  });

  it("deactivates with the version the row was rendered with", async () => {
    await runReferenceTransition(
      smartphones,
      referenceCapabilities(ALL_CATALOG_PERMISSIONS),
      api,
    );

    expect(api.deactivate).toHaveBeenCalledWith(SMARTPHONES_ID, 3);
    expect(api.activate).not.toHaveBeenCalled();
  });

  it("reactivates on catalog.update alone, since deactivate is one-directional", async () => {
    await runReferenceTransition(
      androidPhones,
      referenceCapabilities([
        PERMISSIONS.CATALOG_VIEW,
        PERMISSIONS.CATALOG_UPDATE,
      ]),
      api,
    );

    expect(api.activate).toHaveBeenCalledWith(ANDROID_ID, 7);
    expect(api.deactivate).not.toHaveBeenCalled();
  });

  it("sends no request when the deactivate grant is missing", async () => {
    const result = await runReferenceTransition(
      smartphones,
      referenceCapabilities([
        PERMISSIONS.CATALOG_VIEW,
        PERMISSIONS.CATALOG_UPDATE,
      ]),
      api,
    );

    expect(result).toBeNull();
    expect(api.deactivate).not.toHaveBeenCalled();
    expect(api.activate).not.toHaveBeenCalled();
  });

  it("sends no reactivate request without catalog.update", async () => {
    const result = await runReferenceTransition(
      androidPhones,
      referenceCapabilities([
        PERMISSIONS.CATALOG_VIEW,
        PERMISSIONS.CATALOG_DEACTIVATE,
      ]),
      api,
    );

    expect(result).toBeNull();
    expect(api.activate).not.toHaveBeenCalled();
  });

  it("surfaces a rejected transition instead of swallowing it", async () => {
    const conflict = new ApiError("stale", {
      code: "OPTIMISTIC_LOCK_FAILED",
      status: 409,
    });
    api.deactivate.mockRejectedValue(conflict);

    await expect(
      runReferenceTransition(
        smartphones,
        referenceCapabilities(ALL_CATALOG_PERMISSIONS),
        api,
      ),
    ).rejects.toBe(conflict);
  });
});

describe("error messages", () => {
  it("admits a lost optimistic lock saved nothing", () => {
    const message = referenceErrorMessage(
      new ApiError("stale", { code: "OPTIMISTIC_LOCK_FAILED", status: 409 }),
      "category",
    );

    expect(message).toContain("changed since you opened it");
    expect(message).toContain("Nothing was saved");
  });

  it("names a duplicate as a conflict on the name", () => {
    expect(
      referenceErrorMessage(
        new ApiError("duplicate", {
          code: "CONFLICT",
          status: 409,
          details: { name: ["Already used."] },
        }),
        "brand",
      ),
    ).toBe("Another brand in this organization already uses that name.");
  });

  it("reports a forbidden change honestly", () => {
    expect(
      referenceErrorMessage(
        new ApiError("nope", { code: "FORBIDDEN_PERMISSION", status: 403 }),
        "productModel",
      ),
    ).toContain("permissions do not allow");
  });

  it("never implies a write happened when the API is unreachable", () => {
    expect(
      referenceErrorMessage(
        new ApiError("down", { code: "NETWORK_ERROR" }),
        "category",
      ),
    ).toContain("Nothing was saved");
  });

  it("labels each entity in its own words", () => {
    const notFound = new ApiError("gone", { code: "NOT_FOUND", status: 404 });

    expect(referenceErrorMessage(notFound, "productModel")).toContain(
      "This product model no longer exists",
    );
    expect(referenceErrorMessage(notFound, "brand")).toContain(
      "This brand no longer exists",
    );
  });

  it("pulls out the server's field-level report", () => {
    const invalid = new ApiError("invalid", {
      code: "VALIDATION_FAILED",
      status: 422,
      details: { parentCategoryId: ["Parent must be active."] },
    });

    expect(fieldMessages(invalid, "parentCategoryId")).toStrictEqual([
      "Parent must be active.",
    ]);
    expect(fieldMessages(invalid, "name")).toBeUndefined();
    expect(fieldMessages(null, "name")).toBeUndefined();
  });

  it("prefers the field's own validation over the server's", () => {
    expect(
      mergeFieldMessages("Enter a name.", ["Already used."]),
    ).toStrictEqual(["Enter a name."]);
    expect(mergeFieldMessages(undefined, ["Already used."])).toStrictEqual([
      "Already used.",
    ]);
    expect(mergeFieldMessages(undefined, undefined)).toBeUndefined();
  });
});

describe("categories tab rendering", () => {
  it("renders the rows the API returned", () => {
    const html = render(CategoriesTab, {
      permissions: ALL_CATALOG_PERMISSIONS,
      categories: [smartphones, androidPhones],
    });

    expect(html).toContain("Smartphones");
    expect(html).toContain("Android phones");
    // The child resolves its parent by name, and reports its real status.
    expect(html).toContain("Top level");
    expect(html).toContain("Active");
    expect(html).toContain("Inactive");
  });

  it("offers edit and deactivate to a full catalog editor", () => {
    const html = render(CategoriesTab, {
      permissions: ALL_CATALOG_PERMISSIONS,
    });

    expect(html).toContain("New category");
    expect(html).toContain("Edit Smartphones");
    expect(html).toContain("Deactivate Smartphones");
  });

  it("hides every mutating action from a view-only user", () => {
    const html = render(CategoriesTab, {
      permissions: [PERMISSIONS.CATALOG_VIEW],
      categories: [smartphones, androidPhones],
    });

    expect(html).toContain("Smartphones");
    expect(html).not.toContain("New category");
    expect(html).not.toContain("Edit Smartphones");
    expect(html).not.toContain("Deactivate Smartphones");
    expect(html).not.toContain("Reactivate Android phones");
    expect(html).toContain("View only");
  });

  it("offers reactivate but not deactivate on catalog.update alone", () => {
    const html = render(CategoriesTab, {
      permissions: [PERMISSIONS.CATALOG_VIEW, PERMISSIONS.CATALOG_UPDATE],
      categories: [smartphones, androidPhones],
    });

    expect(html).toContain("Reactivate Android phones");
    expect(html).not.toContain("Deactivate Smartphones");
  });

  it("never offers a delete action, since catalog records are only retired", () => {
    const html = render(CategoriesTab, {
      permissions: ALL_CATALOG_PERMISSIONS,
      categories: [smartphones, androidPhones],
    });

    expect(html).not.toContain("Delete");
    expect(html).not.toContain("Remove");
  });

  it("shows the forbidden state and issues no request without catalog.view", () => {
    const html = render(CategoriesTab, { permissions: [] });

    expect(html).toContain("Catalog access required");
    expect(html).toContain("No category request was sent");
    expect(html).not.toContain("Smartphones");
    expect(catalogApi.getCatalogCategories).not.toHaveBeenCalled();
    expect(catalogApi.getCatalogReferences).not.toHaveBeenCalled();
  });

  it("reports an empty catalog without inventing rows", () => {
    const html = render(CategoriesTab, {
      permissions: ALL_CATALOG_PERMISSIONS,
      categories: [],
    });

    expect(html).toContain("No categories yet");
  });
});

describe("brands tab rendering", () => {
  it("renders rows and gates actions on permissions", () => {
    const editor = render(BrandsTab, { permissions: ALL_CATALOG_PERMISSIONS });
    expect(editor).toContain("Samsung");
    expect(editor).toContain("New brand");
    expect(editor).toContain("Edit Samsung");

    const viewer = render(BrandsTab, {
      permissions: [PERMISSIONS.CATALOG_VIEW],
    });
    expect(viewer).toContain("Samsung");
    expect(viewer).not.toContain("New brand");
    expect(viewer).not.toContain("Edit Samsung");
  });

  it("shows the forbidden state without catalog.view", () => {
    const html = render(BrandsTab, { permissions: [] });

    expect(html).toContain("Catalog access required");
    expect(catalogApi.getCatalogBrands).not.toHaveBeenCalled();
  });
});

describe("category form drawer", () => {
  function renderDrawer(category?: typeof smartphones): string {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(queryKeys.catalogReferences, {
      categories: [smartphones, { ...androidPhones, isActive: true }],
      brands: [samsung],
      productModels: [],
    });
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(CategoryFormDrawer, {
          mode: category === undefined ? "create" : "edit",
          ...(category === undefined ? {} : { category }),
          onClose: () => undefined,
          onSaved: () => undefined,
        }),
      ),
    );
  }

  it("offers a top-level option and every active category when creating", () => {
    const html = renderDrawer();

    expect(html).toContain("No parent (top level)");
    expect(html).toContain(`<option value="${SMARTPHONES_ID}">`);
    expect(html).toContain(`<option value="${ANDROID_ID}">`);
  });

  it("never offers the edited category as its own parent", () => {
    const html = renderDrawer(smartphones);

    expect(html).toContain("No parent (top level)");
    expect(html).not.toContain(`<option value="${SMARTPHONES_ID}">`);
    expect(html).toContain(`<option value="${ANDROID_ID}">`);
  });
});
