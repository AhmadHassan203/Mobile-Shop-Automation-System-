import { describe, expect, it } from "vitest";
import {
  CancelPurchaseOrderInputSchema,
  CreateGoodsReceiptInputSchema,
  CreatePurchaseOrderInputSchema,
  CreateSupplierInputSchema,
  GoodsReceiptLineSchema,
  GoodsReceiptSummarySchema,
  NonnegativeMoneyMinorSchema,
  PurchaseOrderLineSchema,
  PurchaseOrderListQuerySchema,
  PurchaseOrderSummarySchema,
  SupplierListQuerySchema,
  UpdateSupplierInputSchema,
} from "./purchasing";

const SUPPLIER_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const PRODUCT_ID_2 = "20000000-0000-4000-8000-000000000002";
const ORDER_ID = "30000000-0000-4000-8000-000000000001";
const ORDER_LINE_ID = "40000000-0000-4000-8000-000000000001";
const ORDER_LINE_ID_2 = "40000000-0000-4000-8000-000000000002";
const LOCATION_ID = "50000000-0000-4000-8000-000000000001";
const LOCATION_ID_2 = "50000000-0000-4000-8000-000000000002";

function supplierInput() {
  return {
    code: " tech source ",
    name: "  Tech   Source International  ",
    contacts: [
      {
        name: " Rana Waqas ",
        phone: "0321-4455667",
        email: null,
        isPrimary: true,
      },
    ],
    paymentTermsDays: 30,
    leadTimeDays: 5,
    addressLine: null,
    city: " Lahore ",
    notes: null,
  };
}

function purchaseOrderInput() {
  return {
    supplierId: SUPPLIER_ID,
    expectedOn: "2026-07-25",
    notes: " Restock ",
    lines: [
      {
        productVariantId: PRODUCT_ID,
        quantity: 2,
        unitCostMinor: 45_200_000,
        notes: null,
      },
    ],
  };
}

function serializedReceiptInput() {
  return {
    purchaseOrderId: ORDER_ID,
    supplierInvoiceReference: " INV-44 ",
    invoiceDueOn: "2026-08-15",
    notes: null,
    landedCosts: [
      {
        kind: "freight" as const,
        amountMinor: 10_000,
        reference: null,
        notes: null,
      },
    ],
    lines: [
      {
        purchaseOrderLineId: ORDER_LINE_ID,
        trackingType: "serialized" as const,
        stockLocationId: LOCATION_ID,
        unitCostMinor: 45_200_000,
        units: [
          {
            imei1: "356938-035643809",
            imei2: "490154203237518",
            serialNumber: " f2l-xpq9-abc ",
            initialState: "available" as const,
          },
        ],
      },
    ],
  };
}

describe("supplier contracts", () => {
  it("normalizes supplier identity and contact text", () => {
    const parsed = CreateSupplierInputSchema.parse(supplierInput());

    expect(parsed.code).toBe("TECH-SOURCE");
    expect(parsed.name).toBe("Tech Source International");
    expect(parsed.contacts[0]?.name).toBe("Rana Waqas");
    expect(parsed.city).toBe("Lahore");
  });

  it("refuses a contact with no way to contact them", () => {
    const input = supplierInput();
    input.contacts = [
      {
        name: "Rana",
        phone: null as unknown as string,
        email: null,
        isPrimary: true,
      },
    ];

    expect(CreateSupplierInputSchema.safeParse(input).success).toBe(false);
  });

  it("refuses more than one primary contact", () => {
    const input = supplierInput();
    input.contacts.push({
      name: "Accounts",
      phone: "0300-0000000",
      email: null,
      isPrimary: true,
    });

    const result = CreateSupplierInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "contacts"),
      ).toBe(true);
    }
  });

  it("requires an optimistic version on replacement updates", () => {
    expect(UpdateSupplierInputSchema.safeParse(supplierInput()).success).toBe(
      false,
    );
    expect(
      UpdateSupplierInputSchema.safeParse({ ...supplierInput(), version: 1 })
        .success,
    ).toBe(true);
  });

  it("does not admit tenant or reliability fields from a caller", () => {
    expect(
      CreateSupplierInputSchema.safeParse({
        ...supplierInput(),
        organizationId: SUPPLIER_ID,
      }).success,
    ).toBe(false);
    expect(
      CreateSupplierInputSchema.safeParse({
        ...supplierInput(),
        onTimeRateBasisPoints: 10_000,
      }).success,
    ).toBe(false);
  });

  it("coerces bounded list paging and booleans", () => {
    expect(
      SupplierListQuerySchema.parse({ page: "2", pageSize: "25", active: "0" }),
    ).toEqual({ page: 2, pageSize: 25, active: false });
  });
});

describe("purchase order contracts", () => {
  it("accepts exact integer-minor-unit lines and normalizes notes", () => {
    const parsed = CreatePurchaseOrderInputSchema.parse(purchaseOrderInput());
    expect(parsed.lines[0]?.unitCostMinor).toBe(45_200_000);
    expect(parsed.notes).toBe("Restock");
  });

  it("rejects negative, fractional and unsafe money", () => {
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(NonnegativeMoneyMinorSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects a safe unit price whose multiplied line or order total is unsafe", () => {
    const lineOverflow = purchaseOrderInput();
    lineOverflow.lines[0]!.quantity = 2;
    lineOverflow.lines[0]!.unitCostMinor = Number.MAX_SAFE_INTEGER;
    expect(CreatePurchaseOrderInputSchema.safeParse(lineOverflow).success).toBe(
      false,
    );

    const orderOverflow = purchaseOrderInput();
    orderOverflow.lines = [
      {
        ...orderOverflow.lines[0]!,
        productVariantId: PRODUCT_ID,
        quantity: 1,
        unitCostMinor: Number.MAX_SAFE_INTEGER,
      },
      {
        ...orderOverflow.lines[0]!,
        productVariantId: PRODUCT_ID_2,
        quantity: 1,
        unitCostMinor: 1,
      },
    ];
    expect(
      CreatePurchaseOrderInputSchema.safeParse(orderOverflow).success,
    ).toBe(false);
  });

  it("rejects an empty order", () => {
    expect(
      CreatePurchaseOrderInputSchema.safeParse({
        ...purchaseOrderInput(),
        lines: [],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate variants inside one order", () => {
    const input = purchaseOrderInput();
    input.lines.push({ ...input.lines[0]! });

    const result = CreatePurchaseOrderInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([
        "lines",
        1,
        "productVariantId",
      ]);
    }
  });

  it("allows another product as a separate line", () => {
    const input = purchaseOrderInput();
    input.lines.push({
      ...input.lines[0]!,
      productVariantId: PRODUCT_ID_2,
    });
    expect(CreatePurchaseOrderInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects caller-supplied totals, status and branch scope", () => {
    for (const key of ["totalMinor", "status", "branchId", "organizationId"]) {
      expect(
        CreatePurchaseOrderInputSchema.safeParse({
          ...purchaseOrderInput(),
          [key]: 1,
        }).success,
      ).toBe(false);
    }
  });

  it("requires a nonblank cancellation reason", () => {
    expect(
      CancelPurchaseOrderInputSchema.safeParse({ version: 2, reason: "   " })
        .success,
    ).toBe(false);
  });

  it("refuses inverted list date ranges", () => {
    expect(
      PurchaseOrderListQuerySchema.safeParse({
        from: "2026-07-20",
        to: "2026-07-19",
      }).success,
    ).toBe(false);
  });

  it("validates ordered, received and remaining quantity reconciliation", () => {
    const line = {
      id: ORDER_LINE_ID,
      productVariant: {
        id: PRODUCT_ID,
        sku: "PHONE-1",
        name: "Phone",
        trackingType: "serialized",
        condition: "new",
        ptaStatus: "pta_approved",
      },
      quantityOrdered: 2,
      quantityReceived: 1,
      quantityRemaining: 1,
      unitCostMinor: 100,
      lineTotalMinor: 200,
      notes: null,
    };
    expect(PurchaseOrderLineSchema.safeParse(line).success).toBe(true);
    expect(
      PurchaseOrderLineSchema.safeParse({ ...line, quantityRemaining: 2 })
        .success,
    ).toBe(false);
    expect(
      PurchaseOrderLineSchema.safeParse({ ...line, lineTotalMinor: 199 })
        .success,
    ).toBe(false);
  });

  it("rejects summary progress beyond ordered units", () => {
    const summary = {
      id: ORDER_ID,
      number: "PO-0001",
      supplier: {
        id: SUPPLIER_ID,
        code: "TECH",
        name: "Tech Source",
      },
      status: "partially_received",
      orderDate: "2026-07-16",
      expectedOn: null,
      totalMinor: 100,
      totalUnits: 1,
      receivedUnits: 2,
      version: 2,
      createdAt: "2026-07-16T01:00:00.000Z",
      updatedAt: "2026-07-16T01:00:00.000Z",
    };
    expect(PurchaseOrderSummarySchema.safeParse(summary).success).toBe(false);
  });
});

describe("goods receipt contracts", () => {
  it("normalizes IMEI and serial identifiers before posting", () => {
    const parsed = CreateGoodsReceiptInputSchema.parse(
      serializedReceiptInput(),
    );
    const line = parsed.lines[0];
    expect(line?.trackingType).toBe("serialized");
    if (line?.trackingType === "serialized") {
      expect(line.units[0]).toMatchObject({
        imei1: "356938035643809",
        imei2: "490154203237518",
        serialNumber: "F2LXPQ9ABC",
      });
    }
    expect(parsed.supplierInvoiceReference).toBe("INV-44");
  });

  it("rejects an identifier repeated on the same unit", () => {
    const input = serializedReceiptInput();
    input.lines[0]!.units[0]!.imei2 = "356938035643809";
    expect(CreateGoodsReceiptInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects an identifier repeated anywhere in the receipt", () => {
    const input = serializedReceiptInput();
    input.lines.push({
      ...input.lines[0]!,
      purchaseOrderLineId: ORDER_LINE_ID_2,
      stockLocationId: LOCATION_ID_2,
      units: [
        {
          imei1: "356938035643809",
          imei2: "",
          serialNumber: "OTHER-SERIAL",
          initialState: "available",
        },
      ],
    });
    expect(CreateGoodsReceiptInputSchema.safeParse(input).success).toBe(false);
  });

  it("allows a purchase line to be split across distinct locations", () => {
    const input = serializedReceiptInput();
    input.lines.push({
      ...input.lines[0]!,
      stockLocationId: LOCATION_ID_2,
      units: [
        {
          imei1: "352099001761481",
          imei2: "",
          serialNumber: "OTHER-SERIAL",
          initialState: "available",
        },
      ],
    });
    expect(CreateGoodsReceiptInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects the same order-line/location pair twice", () => {
    const input = serializedReceiptInput();
    input.lines.push({
      ...input.lines[0]!,
      units: [
        {
          imei1: "352099001761481",
          imei2: "",
          serialNumber: "OTHER-SERIAL",
          initialState: "available",
        },
      ],
    });
    expect(CreateGoodsReceiptInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts quantity receiving without any fake unit identifiers", () => {
    const input = {
      purchaseOrderId: ORDER_ID,
      supplierInvoiceReference: null,
      invoiceDueOn: null,
      notes: null,
      landedCosts: [],
      lines: [
        {
          purchaseOrderLineId: ORDER_LINE_ID,
          trackingType: "quantity",
          stockLocationId: LOCATION_ID,
          unitCostMinor: 25_000,
          quantity: 40,
        },
      ],
    };
    expect(CreateGoodsReceiptInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects receipts whose exact invoice or landed total exceeds safe JSON money", () => {
    const invoiceOverflow = serializedReceiptInput();
    invoiceOverflow.lines[0]!.unitCostMinor = Number.MAX_SAFE_INTEGER;
    invoiceOverflow.lines[0]!.units.push({
      imei1: "352099001761481",
      imei2: "",
      serialNumber: "OTHER-SERIAL",
      initialState: "available",
    });
    expect(
      CreateGoodsReceiptInputSchema.safeParse(invoiceOverflow).success,
    ).toBe(false);

    const landedOverflow = serializedReceiptInput();
    landedOverflow.lines[0]!.unitCostMinor = Number.MAX_SAFE_INTEGER;
    landedOverflow.landedCosts[0]!.amountMinor = 1;
    expect(
      CreateGoodsReceiptInputSchema.safeParse(landedOverflow).success,
    ).toBe(false);
  });

  it("rejects client totals, supplier scope and payable fields", () => {
    for (const key of [
      "actualCostTotalMinor",
      "landedCostTotalMinor",
      "payableTotalMinor",
      "supplierId",
      "organizationId",
    ]) {
      expect(
        CreateGoodsReceiptInputSchema.safeParse({
          ...serializedReceiptInput(),
          [key]: 100,
        }).success,
      ).toBe(false);
    }
  });

  it("reconciles receipt line actual and landed costs", () => {
    const line = {
      id: "60000000-0000-4000-8000-000000000001",
      purchaseOrderLineId: ORDER_LINE_ID,
      productVariant: {
        id: PRODUCT_ID,
        sku: "CASE-1",
        name: "Case",
        trackingType: "quantity",
        condition: "new",
        ptaStatus: "not_applicable",
      },
      stockLocation: {
        id: LOCATION_ID,
        code: "MAIN",
        name: "Main store",
      },
      quantityReceived: 2,
      unitCostMinor: 100,
      actualCostTotalMinor: 200,
      landedCostAllocatedMinor: 10,
      landedCostTotalMinor: 210,
      stockBatchId: "70000000-0000-4000-8000-000000000001",
      serializedUnits: [],
    };
    expect(GoodsReceiptLineSchema.safeParse(line).success).toBe(true);
    expect(
      GoodsReceiptLineSchema.safeParse({ ...line, landedCostTotalMinor: 209 })
        .success,
    ).toBe(false);
  });

  it("reconciles supplier payable to invoice cost, not capitalized landed cost", () => {
    const summary = {
      id: "80000000-0000-4000-8000-000000000001",
      number: "GRN-0001",
      purchaseOrder: { id: ORDER_ID, number: "PO-0001" },
      supplier: {
        id: SUPPLIER_ID,
        code: "TECH",
        name: "Tech Source",
      },
      supplierInvoiceReference: null,
      receivedAt: "2026-07-16T01:00:00.000Z",
      lineCount: 1,
      unitCount: 1,
      actualCostTotalMinor: 100,
      landedCostTotalMinor: 110,
      payableTotalMinor: 100,
      createdAt: "2026-07-16T01:00:00.000Z",
    };
    expect(GoodsReceiptSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      GoodsReceiptSummarySchema.safeParse({
        ...summary,
        payableTotalMinor: summary.landedCostTotalMinor,
      }).success,
    ).toBe(false);
  });
});
