import {
  CreateProductInputSchema,
  ERROR_CODES,
  ProductListQuerySchema,
  type CreateProductData,
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
});

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
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z"),
  productModel: {
    id: IDS.model,
    name: "Generic smartphone",
    brand: { id: IDS.brand, name: "Unbranded" },
    category: { id: IDS.category, name: "Smartphones" },
  },
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
