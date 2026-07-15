import {
  CreateProductInputSchema,
  ERROR_CODES,
  ProductListQuerySchema,
  UpdateProductInputSchema,
  type CreateProductData,
  type UpdateProductData,
} from "@mobileshop/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { CatalogService, type CatalogActorContext } from "./catalog.service";

const IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  model: "10000000-0000-4000-8000-000000000002",
  brand: "10000000-0000-4000-8000-000000000003",
  category: "10000000-0000-4000-8000-000000000004",
  product: "10000000-0000-4000-8000-000000000005",
  branch: "10000000-0000-4000-8000-000000000006",
  user: "10000000-0000-4000-8000-000000000007",
  parentCategory: "10000000-0000-4000-8000-000000000008",
  childCategory: "10000000-0000-4000-8000-000000000009",
  alias: "10000000-0000-4000-8000-00000000000a",
  addedAlias: "10000000-0000-4000-8000-00000000000b",
  primaryBarcode: "10000000-0000-4000-8000-00000000000c",
  secondBarcode: "10000000-0000-4000-8000-00000000000d",
  addedBarcode: "10000000-0000-4000-8000-00000000000e",
  otherOrganization: "20000000-0000-4000-8000-000000000001",
  missing: "30000000-0000-4000-8000-000000000001",
});

/**
 * Values the catalog contracts exist to keep out of catalog requests, responses
 * and audit snapshots alike.
 */
const FORBIDDEN_FIELDS = Object.freeze([
  "organizationId",
  "defaultPriceMinor",
  "minPriceMinor",
  "reorderPoint",
  "casePackSize",
  "cost",
  "price",
  "stock",
  "imei",
]);

function expectNoForbiddenFields(value: unknown): void {
  for (const field of FORBIDDEN_FIELDS) {
    expect(value).not.toHaveProperty(field);
  }
}

const CONTEXT: CatalogActorContext = {
  organizationId: IDS.organization,
  branchId: IDS.branch,
  actorUserId: IDS.user,
  metadata: {
    requestId: "request-catalog-test",
    ipAddress: "127.0.0.1",
    userAgent: "catalog-test",
  },
};

const PRODUCT_RECORD = {
  id: IDS.product,
  sku: "PHONE-001",
  name: "Generic smartphone 8/256",
  trackingType: "serialized" as const,
  condition: "new" as const,
  ptaStatus: "pta_approved" as const,
  ram: "8 GB",
  storage: "256 GB",
  color: "Black",
  region: null,
  warrantyType: "none" as const,
  warrantyMonths: null,
  isActive: true,
  version: 1,
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z"),
  productModel: {
    id: IDS.model,
    name: "Generic smartphone",
    brand: { id: IDS.brand, name: "Unbranded" },
    category: { id: IDS.category, name: "Smartphones" },
  },
};

/** The stored state every update test diffs against. */
const PRODUCT_DETAIL_RECORD = {
  ...PRODUCT_RECORD,
  aliases: [{ id: IDS.alias, alias: "Generic 8/256" }],
  barcodes: [
    { id: IDS.primaryBarcode, barcode: "0123456789012", isPrimary: true },
    { id: IDS.secondBarcode, barcode: "0123456789029", isPrimary: false },
  ],
};

/** The state after UPDATE_PRODUCT_INPUT is applied to PRODUCT_DETAIL_RECORD. */
const UPDATED_PRODUCT_DETAIL_RECORD = {
  ...PRODUCT_RECORD,
  name: "Generic smartphone 8/256 Pro",
  version: 2,
  aliases: [{ id: IDS.addedAlias, alias: "Generic 8/256 Pro" }],
  barcodes: [
    { id: IDS.secondBarcode, barcode: "0123456789029", isPrimary: true },
    { id: IDS.addedBarcode, barcode: "9999999999994", isPrimary: false },
  ],
};

const PRODUCT_INPUT: CreateProductData = CreateProductInputSchema.parse({
  productModelId: IDS.model,
  sku: "phone 001",
  name: "Generic smartphone 8/256",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  ram: "8 GB",
  storage: "256 GB",
  color: "Black",
  aliases: ["Generic 8/256"],
  barcodes: ["0123456789012", "0123456789029"],
});

/**
 * Replace semantics: the whole editable identity is sent every time. Here the
 * sole alias is swapped, the primary barcode is dropped and a new one appended,
 * so one payload exercises retire, keep, add and re-election at once.
 */
const UPDATE_PRODUCT_INPUT: UpdateProductData = UpdateProductInputSchema.parse({
  productModelId: IDS.model,
  sku: "phone 001",
  name: "Generic smartphone 8/256 Pro",
  trackingType: "serialized",
  condition: "new",
  ptaStatus: "pta_approved",
  ram: "8 GB",
  storage: "256 GB",
  color: "Black",
  aliases: ["Generic 8/256 Pro"],
  barcodes: ["0123456789029", "9999999999994"],
  version: 1,
});

const CATEGORY_ROW = {
  // Widened: fixtures override the id to stand in for a parent/other-tenant row.
  id: IDS.category as string,
  organizationId: IDS.organization as string,
  parentCategoryId: null as string | null,
  name: "Smartphones",
  slug: "smartphones",
  isActive: true,
  version: 1,
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z"),
};

const BRAND_ROW = {
  id: IDS.brand,
  organizationId: IDS.organization,
  name: "Unbranded",
  slug: "unbranded",
  isActive: true,
  version: 1,
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z"),
};

const MODEL_ROW = {
  id: IDS.model,
  name: "Generic smartphone",
  brandId: IDS.brand,
  categoryId: IDS.category,
  isActive: true,
  version: 1,
  brand: { name: "Unbranded" },
  category: { name: "Smartphones" },
};

type CategoryRow = typeof CATEGORY_ROW;

/**
 * A findFirst that honours the filters the service is required to send. A query
 * that forgot `organizationId` or `isActive` would match rows it must not see,
 * so the fake enforces the tenant boundary rather than assuming it.
 */
function categoryFindFirst(rows: readonly CategoryRow[]) {
  return vi.fn(
    (args: {
      readonly where: {
        readonly id: string;
        readonly organizationId?: string;
        readonly isActive?: boolean;
      };
    }): Promise<CategoryRow | null> => {
      const row = rows.find((candidate) => candidate.id === args.where.id);
      if (row === undefined) return Promise.resolve(null);
      if (row.organizationId !== args.where.organizationId) {
        return Promise.resolve(null);
      }
      if (args.where.isActive === true && !row.isActive) {
        return Promise.resolve(null);
      }
      return Promise.resolve(row);
    },
  );
}

function serviceFor(client: object): CatalogService {
  return new CatalogService({ client } as unknown as PrismaService);
}

function interactiveClient(transactionClient: object) {
  return {
    $transaction: vi.fn(
      async (operation: (client: object) => Promise<unknown>) =>
        operation(transactionClient),
    ),
  };
}

describe("CatalogService", () => {
  it("scopes product lists to the authenticated tenant and combines filters", async () => {
    const count = vi.fn().mockResolvedValue(1);
    const findMany = vi.fn().mockResolvedValue([PRODUCT_RECORD]);
    const client = {
      productVariant: { count, findMany },
      $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = serviceFor(client);
    const query = ProductListQuerySchema.parse({
      page: 1,
      pageSize: 25,
      brandId: IDS.brand,
      categoryId: IDS.category,
      q: "generic",
    });

    const result = await service.listProducts(IDS.organization, query);

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: IDS.organization,
        productModel: {
          is: { brandId: IDS.brand, categoryId: IDS.category },
        },
        OR: expect.any(Array),
      }),
    });
    const findArguments = findMany.mock.calls[0]?.[0] as {
      readonly select: Readonly<Record<string, unknown>>;
      readonly where: Readonly<Record<string, unknown>>;
    };
    expect(findArguments.where).toMatchObject({
      organizationId: IDS.organization,
    });
    expect(findArguments.select).not.toHaveProperty("defaultPriceMinor");
    expect(findArguments.select).not.toHaveProperty("minPriceMinor");
    expect(findArguments.select).not.toHaveProperty("aliases");
    expect(findArguments.select).not.toHaveProperty("barcodes");
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: IDS.product,
          sku: "PHONE-001",
          warrantyType: "none",
        }),
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    expect(result.items[0]).not.toHaveProperty("aliases");
    expect(result.items[0]).not.toHaveProperty("barcodes");
  });

  it("creates product, aliases, barcodes and safe audit in one transaction", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: IDS.model });
    const createProduct = vi.fn().mockResolvedValue(PRODUCT_RECORD);
    const createAliases = vi.fn().mockResolvedValue({ count: 1 });
    const createBarcodes = vi.fn().mockResolvedValue({ count: 2 });
    const createAudit = vi.fn().mockResolvedValue({ id: "audit-id" });
    const tx = {
      productModel: { findFirst },
      productVariant: { create: createProduct },
      productAlias: { createMany: createAliases },
      productBarcode: { createMany: createBarcodes },
      auditEvent: { create: createAudit },
    };
    const client = interactiveClient(tx);
    const service = serviceFor(client);

    const result = await service.createProduct(CONTEXT, PRODUCT_INPUT);

    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: IDS.model,
        organizationId: IDS.organization,
        isActive: true,
        brand: { is: { isActive: true } },
        category: { is: { isActive: true } },
      },
      select: { id: true },
    });
    const productData = (
      createProduct.mock.calls[0]?.[0] as {
        readonly data: Readonly<Record<string, unknown>>;
      }
    ).data;
    expect(productData).toMatchObject({
      organizationId: IDS.organization,
      sku: "PHONE-001",
      warrantyType: "none",
      warrantyMonths: null,
    });
    expect(productData).not.toHaveProperty("defaultPriceMinor");
    expect(productData).not.toHaveProperty("minPriceMinor");
    expect(productData).not.toHaveProperty("stock");
    expect(productData).not.toHaveProperty("imei");
    expect(createAliases).toHaveBeenCalledWith({
      data: [
        {
          organizationId: IDS.organization,
          productVariantId: IDS.product,
          alias: "Generic 8/256",
          normalizedAlias: "generic 8/256",
        },
      ],
    });
    expect(createBarcodes).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ barcode: "0123456789012", isPrimary: true }),
        expect.objectContaining({ barcode: "0123456789029", isPrimary: false }),
      ],
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: IDS.organization,
        actorUserId: IDS.user,
        action: "catalog.product_created",
        entityType: "product_variant",
        entityId: IDS.product,
        requestId: "request-catalog-test",
        afterSnapshot: {
          productModelId: IDS.model,
          sku: "PHONE-001",
          name: "Generic smartphone 8/256",
          trackingType: "serialized",
          condition: "new",
          ptaStatus: "pta_approved",
          ram: "8 GB",
          storage: "256 GB",
          color: "Black",
          region: null,
          warrantyType: "none",
          warrantyMonths: null,
          aliases: ["Generic 8/256"],
          barcodes: ["0123456789012", "0123456789029"],
          isActive: true,
        },
      }),
    });
    expect(result).not.toHaveProperty("aliases");
    expect(result).not.toHaveProperty("barcodes");
  });

  it("rejects a product model outside the authenticated tenant", async () => {
    const createProduct = vi.fn();
    const tx = {
      productModel: { findFirst: vi.fn().mockResolvedValue(null) },
      productVariant: { create: createProduct },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.createProduct(CONTEXT, PRODUCT_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { productModelId: expect.any(Array) },
    });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("treats an invalid persisted response as an internal service fault", async () => {
    const client = {
      brand: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: IDS.brand, name: "", isActive: true }]),
      },
      $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = serviceFor(client);

    await expect(
      service.listBrands(IDS.organization, {
        page: 1,
        pageSize: 25,
      }),
    ).rejects.toMatchObject({
      message: "Catalog response validation failed",
    });
    await expect(
      service.listBrands(IDS.organization, {
        page: 1,
        pageSize: 25,
      }),
    ).rejects.not.toHaveProperty("code", ERROR_CODES.VALIDATION_FAILED);
  });

  it("returns a 409 conflict for duplicate tenant-scoped reference data", async () => {
    const duplicate = {
      code: "P2002",
      meta: { target: ["organization_id", "slug"] },
    };
    const tx = {
      brand: { create: vi.fn().mockRejectedValue(duplicate) },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.createBrand(CONTEXT, { name: "Unbranded" }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
      status: 409,
      details: { name: expect.any(Array) },
    });
  });

  it.each([
    {
      target: ["organization_id", "sku"],
      code: ERROR_CODES.CATALOG_SKU_DUPLICATE,
    },
    {
      target: ["organization_id", "barcode"],
      code: ERROR_CODES.CATALOG_BARCODE_DUPLICATE,
    },
  ])(
    "maps duplicate $code constraints to stable domain errors",
    async ({ target, code }) => {
      const duplicate = { code: "P2002", meta: { target } };
      const tx = {
        productModel: {
          findFirst: vi.fn().mockResolvedValue({ id: IDS.model }),
        },
        productVariant: {
          create:
            code === ERROR_CODES.CATALOG_SKU_DUPLICATE
              ? vi.fn().mockRejectedValue(duplicate)
              : vi.fn().mockResolvedValue(PRODUCT_RECORD),
        },
        productAlias: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        productBarcode: {
          createMany:
            code === ERROR_CODES.CATALOG_BARCODE_DUPLICATE
              ? vi.fn().mockRejectedValue(duplicate)
              : vi.fn().mockResolvedValue({ count: 2 }),
        },
        auditEvent: { create: vi.fn() },
      };
      const service = serviceFor(interactiveClient(tx));

      await expect(
        service.createProduct(CONTEXT, PRODUCT_INPUT),
      ).rejects.toMatchObject({ code });
      expect(tx.auditEvent.create).not.toHaveBeenCalled();
    },
  );

  it("maps the Prisma 7 adapter unique-constraint shape", async () => {
    const duplicate = {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: {
            kind: "UniqueConstraintViolation",
            constraint: { fields: ["organization_id", "sku"] },
          },
        },
      },
    };
    const tx = {
      productModel: {
        findFirst: vi.fn().mockResolvedValue({ id: IDS.model }),
      },
      productVariant: { create: vi.fn().mockRejectedValue(duplicate) },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.createProduct(CONTEXT, PRODUCT_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CATALOG_SKU_DUPLICATE,
      status: 409,
    });
  });
});

describe("CatalogService optimistic locking", () => {
  it("rejects a stale category edit without writing an audit event", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      category: {
        findFirst: categoryFindFirst([{ ...CATEGORY_ROW, version: 4 }]),
        updateMany,
      },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateCategory(CONTEXT, IDS.category, {
        name: "Phones",
        parentCategoryId: null,
        version: 3,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    // The lock has to live in the WHERE clause: a read-then-write comparison
    // would let a concurrent commit slip between the two statements.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: IDS.category,
          organizationId: IDS.organization,
          version: 3,
        },
      }),
    );
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a stale brand edit", async () => {
    const tx = {
      brand: {
        findFirst: vi.fn().mockResolvedValue(BRAND_ROW),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateBrand(CONTEXT, IDS.brand, { name: "Nokia", version: 9 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a stale product model edit", async () => {
    const tx = {
      productModel: {
        findFirst: vi.fn().mockResolvedValue(MODEL_ROW),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      brand: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: IDS.brand, name: "Unbranded" }),
      },
      category: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: IDS.category, name: "Smartphones" }),
      },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateProductModel(CONTEXT, IDS.model, {
        name: "Generic smartphone II",
        brandId: IDS.brand,
        categoryId: IDS.category,
        version: 7,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a stale product edit before touching aliases or barcodes", async () => {
    const tx = {
      productVariant: {
        findFirst: vi.fn().mockResolvedValue(PRODUCT_DETAIL_RECORD),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      productModel: { findFirst: vi.fn().mockResolvedValue({ id: IDS.model }) },
      productAlias: { updateMany: vi.fn(), createMany: vi.fn() },
      productBarcode: { updateMany: vi.fn(), createMany: vi.fn() },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateProduct(CONTEXT, IDS.product, UPDATE_PRODUCT_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      status: 409,
    });
    expect(tx.productAlias.updateMany).not.toHaveBeenCalled();
    expect(tx.productBarcode.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a stale deactivate and a stale reactivate alike", async () => {
    const txFor = () => ({
      brand: {
        findFirst: vi.fn().mockResolvedValue({ ...BRAND_ROW, isActive: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditEvent: { create: vi.fn() },
    });
    const deactivate = serviceFor(interactiveClient(txFor()));
    const activate = serviceFor(interactiveClient(txFor()));

    await expect(
      deactivate.deactivateBrand(CONTEXT, IDS.brand, { version: 2 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED });
    await expect(
      activate.activateBrand(CONTEXT, IDS.brand, { version: 2 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OPTIMISTIC_LOCK_FAILED });
  });
});

describe("CatalogService tenant isolation", () => {
  it("reports another tenant's category as missing, scoped by organization", async () => {
    const findFirst = categoryFindFirst([
      { ...CATEGORY_ROW, organizationId: IDS.otherOrganization },
    ]);
    const tx = { category: { findFirst, updateMany: vi.fn() } };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateCategory(CONTEXT, IDS.category, {
        name: "Phones",
        parentCategoryId: null,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: IDS.category, organizationId: IDS.organization },
    });
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it("reports another tenant's brand as missing, scoped by organization", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = serviceFor(interactiveClient({ brand: { findFirst } }));

    await expect(
      service.updateBrand(CONTEXT, IDS.brand, { name: "Nokia", version: 1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: IDS.brand, organizationId: IDS.organization },
    });
  });

  it("reports another tenant's product model as missing, scoped by organization", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = serviceFor(
      interactiveClient({ productModel: { findFirst } }),
    );

    await expect(
      service.deactivateProductModel(CONTEXT, IDS.model, { version: 1 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: IDS.model, organizationId: IDS.organization },
      }),
    );
  });

  it("reports another tenant's product as missing on both read and write", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = {
      ...interactiveClient({ productVariant: { findFirst } }),
      productVariant: { findFirst },
    };
    const service = serviceFor(client);

    await expect(
      service.getProduct(IDS.organization, IDS.missing),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    await expect(
      service.updateProduct(CONTEXT, IDS.missing, UPDATE_PRODUCT_INPUT),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND, status: 404 });
    for (const call of findFirst.mock.calls) {
      expect((call[0] as { where: unknown }).where).toMatchObject({
        id: IDS.missing,
        organizationId: IDS.organization,
      });
    }
  });
});

describe("CatalogService category tree rules", () => {
  const move = (service: CatalogService, parentCategoryId: string | null) =>
    service.updateCategory(CONTEXT, IDS.category, {
      name: "Smartphones",
      parentCategoryId,
      version: 1,
    });

  it("rejects a category that would become its own parent", async () => {
    const tx = {
      category: {
        findFirst: categoryFindFirst([CATEGORY_ROW]),
        updateMany: vi.fn(),
      },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(move(service, IDS.category)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: { parentCategoryId: ["A category cannot be its own parent."] },
    });
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a move beneath the category's own descendant", async () => {
    // child -> category, so re-parenting category under child closes a cycle.
    const tx = {
      category: {
        findFirst: categoryFindFirst([
          CATEGORY_ROW,
          {
            ...CATEGORY_ROW,
            id: IDS.childCategory,
            name: "Flagships",
            slug: "flagships",
            parentCategoryId: IDS.category,
          },
        ]),
        updateMany: vi.fn(),
      },
    };
    const service = serviceFor(interactiveClient(tx));

    // Asserted on the message, not just the code: a cycle and a merely
    // unusable parent both fail 422 on this field, and only the text proves
    // the ancestor walk — rather than the existence check — did the rejecting.
    await expect(move(service, IDS.childCategory)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: {
        parentCategoryId: [
          "A category cannot be moved beneath one of its own subcategories.",
        ],
      },
    });
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a retired parent", async () => {
    const tx = {
      category: {
        findFirst: categoryFindFirst([
          CATEGORY_ROW,
          {
            ...CATEGORY_ROW,
            id: IDS.parentCategory,
            name: "Devices",
            slug: "devices",
            isActive: false,
          },
        ]),
        updateMany: vi.fn(),
      },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(move(service, IDS.parentCategory)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: {
        parentCategoryId: ["Select an active category from this organization."],
      },
    });
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a parent owned by another tenant", async () => {
    const tx = {
      category: {
        findFirst: categoryFindFirst([
          CATEGORY_ROW,
          {
            ...CATEGORY_ROW,
            id: IDS.parentCategory,
            name: "Devices",
            slug: "devices",
            organizationId: IDS.otherOrganization,
          },
        ]),
        updateMany: vi.fn(),
      },
    };
    const service = serviceFor(interactiveClient(tx));

    // A parent that exists but belongs elsewhere must be indistinguishable from
    // one that does not exist at all.
    await expect(move(service, IDS.parentCategory)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: {
        parentCategoryId: ["Select an active category from this organization."],
      },
    });
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it("moves a category to an active parent and recomputes its slug", async () => {
    const rows = [
      CATEGORY_ROW,
      {
        ...CATEGORY_ROW,
        id: IDS.parentCategory,
        name: "Devices",
        slug: "devices",
      },
    ];
    const findFirst = categoryFindFirst(rows);
    const tx = {
      category: {
        findFirst,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    await service.updateCategory(CONTEXT, IDS.category, {
      name: "Smart Phones",
      parentCategoryId: IDS.parentCategory,
      version: 1,
    });

    expect(tx.category.updateMany).toHaveBeenCalledWith({
      where: { id: IDS.category, organizationId: IDS.organization, version: 1 },
      data: {
        name: "Smart Phones",
        slug: "smart-phones",
        parentCategoryId: IDS.parentCategory,
        version: { increment: 1 },
      },
    });
  });
});

describe("CatalogService reactivation integrity", () => {
  it("refuses to reactivate a category beneath a retired parent", async () => {
    const tx = {
      category: {
        findFirst: categoryFindFirst([
          {
            ...CATEGORY_ROW,
            isActive: false,
            parentCategoryId: IDS.parentCategory,
          },
          {
            ...CATEGORY_ROW,
            id: IDS.parentCategory,
            name: "Devices",
            slug: "devices",
            isActive: false,
          },
        ]),
        updateMany: vi.fn(),
      },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.activateCategory(CONTEXT, IDS.category, { version: 1 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: { parentCategoryId: expect.any(Array) },
    });
    expect(tx.category.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to reactivate a product model under a retired brand", async () => {
    const tx = {
      productModel: {
        findFirst: vi.fn().mockResolvedValue({ ...MODEL_ROW, isActive: false }),
        updateMany: vi.fn(),
      },
      brand: { findFirst: vi.fn().mockResolvedValue(null) },
      category: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: IDS.category, name: "Smartphones" }),
      },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.activateProductModel(CONTEXT, IDS.model, { version: 1 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: { brandId: expect.any(Array) },
    });
    expect(tx.productModel.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to reactivate a product under a retired model", async () => {
    const tx = {
      productVariant: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...PRODUCT_DETAIL_RECORD, isActive: false }),
        updateMany: vi.fn(),
      },
      productModel: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.activateProduct(CONTEXT, IDS.product, { version: 1 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: { productModelId: expect.any(Array) },
    });
    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
  });

  it("deactivates a product without cascading and records both snapshots", async () => {
    const retired = {
      ...PRODUCT_DETAIL_RECORD,
      isActive: false,
      version: 2,
    };
    const tx = {
      productVariant: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(PRODUCT_DETAIL_RECORD)
          .mockResolvedValueOnce(retired),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      productModel: { findFirst: vi.fn() },
      productAlias: { updateMany: vi.fn(), deleteMany: vi.fn() },
      productBarcode: { updateMany: vi.fn(), deleteMany: vi.fn() },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    const result = await service.deactivateProduct(CONTEXT, IDS.product, {
      version: 1,
    });

    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: IDS.product, organizationId: IDS.organization, version: 1 },
      data: { isActive: false, version: { increment: 1 } },
    });
    // Deactivation is recorded, never cascaded into the child rows.
    expect(tx.productAlias.updateMany).not.toHaveBeenCalled();
    expect(tx.productBarcode.updateMany).not.toHaveBeenCalled();
    const audit = tx.auditEvent.create.mock.calls[0]?.[0] as {
      readonly data: {
        readonly action: string;
        readonly beforeSnapshot: object;
        readonly afterSnapshot: object;
      };
    };
    expect(audit.data.action).toBe("catalog.product_deactivated");
    expect(audit.data.beforeSnapshot).toMatchObject({ isActive: true });
    expect(audit.data.afterSnapshot).toMatchObject({ isActive: false });
    expect(result).toMatchObject({ isActive: false, version: 2 });
  });
});

describe("CatalogService product updates", () => {
  function updateTx() {
    return {
      productVariant: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(PRODUCT_DETAIL_RECORD)
          .mockResolvedValueOnce(UPDATED_PRODUCT_DETAIL_RECORD),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn(),
      },
      productModel: { findFirst: vi.fn().mockResolvedValue({ id: IDS.model }) },
      productAlias: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn(),
      },
      productBarcode: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn(),
      },
      auditEvent: { create: vi.fn() },
    };
  }

  it("locks the tracking type against any change", async () => {
    const tx = updateTx();
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateProduct(CONTEXT, IDS.product, {
        ...UPDATE_PRODUCT_INPUT,
        trackingType: "quantity",
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CATALOG_TRACKING_TYPE_LOCKED,
      status: 400,
    });
    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("accepts the unchanged tracking type and never writes it back", async () => {
    const tx = updateTx();
    const service = serviceFor(interactiveClient(tx));

    const result = await service.updateProduct(
      CONTEXT,
      IDS.product,
      UPDATE_PRODUCT_INPUT,
    );

    const written = (
      tx.productVariant.updateMany.mock.calls[0]?.[0] as {
        readonly data: Readonly<Record<string, unknown>>;
      }
    ).data;
    expect(written).toMatchObject({
      name: "Generic smartphone 8/256 Pro",
      version: { increment: 1 },
    });
    // Immutable by construction: the column is absent from the write.
    expect(written).not.toHaveProperty("trackingType");
    expectNoForbiddenFields(written);
    expect(result).toMatchObject({ trackingType: "serialized", version: 2 });
  });

  it("retires the aliases and barcodes that are gone rather than deleting them", async () => {
    const tx = updateTx();
    const service = serviceFor(interactiveClient(tx));

    await service.updateProduct(CONTEXT, IDS.product, UPDATE_PRODUCT_INPUT);

    expect(tx.productAlias.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [IDS.alias] }, organizationId: IDS.organization },
      data: { isActive: false },
    });
    expect(tx.productAlias.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: IDS.organization,
          productVariantId: IDS.product,
          alias: "Generic 8/256 Pro",
          normalizedAlias: "generic 8/256 pro",
        },
      ],
    });
    // The DB revokes DELETE on every catalog table; retiring is the only path.
    expect(tx.productAlias.deleteMany).not.toHaveBeenCalled();
    expect(tx.productBarcode.deleteMany).not.toHaveBeenCalled();
    expect(tx.productVariant.deleteMany).not.toHaveBeenCalled();
  });

  it("clears the primary flag on a retired barcode and elects the first entry", async () => {
    const tx = updateTx();
    const service = serviceFor(interactiveClient(tx));

    await service.updateProduct(CONTEXT, IDS.product, UPDATE_PRODUCT_INPUT);

    const calls = tx.productBarcode.updateMany.mock.calls.map(
      (call) => call[0] as { readonly where: object; readonly data: object },
    );
    // A retired barcode must never stay flagged primary — SQL rejects that row.
    expect(calls[0]).toEqual({
      where: {
        id: { in: [IDS.primaryBarcode] },
        organizationId: IDS.organization,
      },
      data: { isActive: false, isPrimary: false },
    });
    // Only one active barcode per variant may be primary, and that is a unique
    // index: every surviving flag is cleared before the new one is set.
    expect(calls[1]).toEqual({
      where: {
        productVariantId: IDS.product,
        organizationId: IDS.organization,
        isActive: true,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
    expect(calls.at(-1)).toEqual({
      where: {
        productVariantId: IDS.product,
        organizationId: IDS.organization,
        barcode: "0123456789029",
        isActive: true,
      },
      data: { isPrimary: true },
    });
    expect(tx.productBarcode.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: IDS.organization,
          productVariantId: IDS.product,
          barcode: "9999999999994",
          isPrimary: false,
        },
      ],
    });
  });

  it("audits the update with safe before and after snapshots", async () => {
    const tx = updateTx();
    const service = serviceFor(interactiveClient(tx));

    await service.updateProduct(CONTEXT, IDS.product, UPDATE_PRODUCT_INPUT);

    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
    const data = (
      tx.auditEvent.create.mock.calls[0]?.[0] as {
        readonly data: {
          readonly action: string;
          readonly beforeSnapshot: Record<string, unknown>;
          readonly afterSnapshot: Record<string, unknown>;
        };
      }
    ).data;
    expect(data.action).toBe("catalog.product_updated");
    expect(data.beforeSnapshot).toMatchObject({
      name: "Generic smartphone 8/256",
      aliases: ["Generic 8/256"],
      barcodes: ["0123456789012", "0123456789029"],
    });
    expect(data.afterSnapshot).toMatchObject({
      name: "Generic smartphone 8/256 Pro",
      aliases: ["Generic 8/256 Pro"],
      barcodes: ["0123456789029", "9999999999994"],
    });
    expectNoForbiddenFields(data.beforeSnapshot);
    expectNoForbiddenFields(data.afterSnapshot);
  });

  it("maps a duplicate barcode raised by an update to the same stable code", async () => {
    const tx = updateTx();
    tx.productBarcode.createMany.mockRejectedValue({
      code: "P2002",
      meta: { target: ["organization_id", "barcode"] },
    });
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateProduct(CONTEXT, IDS.product, UPDATE_PRODUCT_INPUT),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CATALOG_BARCODE_DUPLICATE,
      status: 409,
    });
  });

  it("returns the edit identity and no financial or tenant fields", async () => {
    const findFirst = vi.fn().mockResolvedValue(PRODUCT_DETAIL_RECORD);
    const service = serviceFor({ productVariant: { findFirst } });

    const result = await service.getProduct(IDS.organization, IDS.product);

    expect(result).toMatchObject({
      id: IDS.product,
      version: 1,
      aliases: [{ id: IDS.alias, alias: "Generic 8/256" }],
      barcodes: [
        { id: IDS.primaryBarcode, barcode: "0123456789012", isPrimary: true },
        { id: IDS.secondBarcode, barcode: "0123456789029", isPrimary: false },
      ],
    });
    expectNoForbiddenFields(result);
    const select = (
      findFirst.mock.calls[0]?.[0] as {
        readonly select: Readonly<Record<string, unknown>>;
      }
    ).select;
    expect(select).not.toHaveProperty("defaultPriceMinor");
    expect(select).not.toHaveProperty("minPriceMinor");
    // Retired aliases and barcodes are history, not identity.
    expect(select.aliases).toMatchObject({ where: { isActive: true } });
    expect(select.barcodes).toMatchObject({ where: { isActive: true } });
  });
});

describe("CatalogService reference updates", () => {
  it("returns the new version and audits a brand rename", async () => {
    const renamed = { ...BRAND_ROW, name: "Nokia", slug: "nokia", version: 2 };
    const tx = {
      brand: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(BRAND_ROW)
          .mockResolvedValueOnce(renamed),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    const result = await service.updateBrand(CONTEXT, IDS.brand, {
      name: "Nokia",
      version: 1,
    });

    expect(tx.brand.updateMany).toHaveBeenCalledWith({
      where: { id: IDS.brand, organizationId: IDS.organization, version: 1 },
      data: { name: "Nokia", slug: "nokia", version: { increment: 1 } },
    });
    expect(result).toEqual({
      id: IDS.brand,
      name: "Nokia",
      isActive: true,
      version: 2,
    });
    const data = (
      tx.auditEvent.create.mock.calls[0]?.[0] as {
        readonly data: {
          readonly action: string;
          readonly beforeSnapshot: Record<string, unknown>;
          readonly afterSnapshot: Record<string, unknown>;
        };
      }
    ).data;
    expect(data.action).toBe("catalog.brand_updated");
    expect(data.beforeSnapshot).toEqual({ name: "Unbranded", isActive: true });
    expect(data.afterSnapshot).toEqual({ name: "Nokia", isActive: true });
    expectNoForbiddenFields(data.beforeSnapshot);
  });

  it("maps a duplicate name raised by an update to a 409 on the name", async () => {
    const tx = {
      brand: {
        findFirst: vi.fn().mockResolvedValue(BRAND_ROW),
        updateMany: vi.fn().mockRejectedValue({
          code: "P2002",
          meta: { target: ["organization_id", "slug"] },
        }),
      },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateBrand(CONTEXT, IDS.brand, { name: "Nokia", version: 1 }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
      status: 409,
      details: { name: expect.any(Array) },
    });
  });

  it("recomputes the canonical name and audits a product model edit", async () => {
    const moved = {
      ...MODEL_ROW,
      name: "Generic Smartphone II",
      version: 2,
    };
    const tx = {
      productModel: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(MODEL_ROW)
          .mockResolvedValueOnce(moved),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      brand: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: IDS.brand, name: "Unbranded" }),
      },
      category: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: IDS.category, name: "Smartphones" }),
      },
      auditEvent: { create: vi.fn() },
    };
    const service = serviceFor(interactiveClient(tx));

    const result = await service.updateProductModel(CONTEXT, IDS.model, {
      name: "Generic Smartphone II",
      brandId: IDS.brand,
      categoryId: IDS.category,
      version: 1,
    });

    expect(tx.productModel.updateMany).toHaveBeenCalledWith({
      where: { id: IDS.model, organizationId: IDS.organization, version: 1 },
      data: {
        name: "Generic Smartphone II",
        canonicalName: "generic smartphone ii",
        brandId: IDS.brand,
        categoryId: IDS.category,
        version: { increment: 1 },
      },
    });
    expect(result).toEqual({
      id: IDS.model,
      name: "Generic Smartphone II",
      brandId: IDS.brand,
      brandName: "Unbranded",
      categoryId: IDS.category,
      categoryName: "Smartphones",
      isActive: true,
      version: 2,
    });
    expectNoForbiddenFields(result);
  });

  it("rejects a product model moved under another tenant's category", async () => {
    const tx = {
      productModel: {
        findFirst: vi.fn().mockResolvedValue(MODEL_ROW),
        updateMany: vi.fn(),
      },
      brand: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: IDS.brand, name: "Unbranded" }),
      },
      category: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = serviceFor(interactiveClient(tx));

    await expect(
      service.updateProductModel(CONTEXT, IDS.model, {
        name: "Generic smartphone",
        brandId: IDS.brand,
        categoryId: IDS.category,
        version: 1,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 422,
      details: { categoryId: expect.any(Array) },
    });
    expect(tx.category.findFirst).toHaveBeenCalledWith({
      where: {
        id: IDS.category,
        organizationId: IDS.organization,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    expect(tx.productModel.updateMany).not.toHaveBeenCalled();
  });

  it("carries version through every reference list response", async () => {
    // Shaped as the select returns it: the strict response contract rejects the
    // slug and timestamps a full row would carry.
    const listed = {
      id: IDS.category,
      name: "Smartphones",
      parentCategoryId: null,
      isActive: true,
      version: 1,
    };
    const client = {
      category: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([listed]),
      },
      $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = serviceFor(client);

    const result = await service.listCategories(IDS.organization, {
      page: 1,
      pageSize: 25,
    });

    expect(result.items[0]).toMatchObject({ id: IDS.category, version: 1 });
    expectNoForbiddenFields(result.items[0]);
    const select = (
      client.category.findMany.mock.calls[0]?.[0] as {
        readonly select: Readonly<Record<string, unknown>>;
      }
    ).select;
    expect(select).toHaveProperty("version", true);
  });
});
