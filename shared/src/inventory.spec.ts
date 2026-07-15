import { describe, expect, it } from "vitest";
import { LIMITS } from "./constants";
import {
  ADJUSTMENT_MOVEMENT_TYPES,
  AdjustStockInputSchema,
  BulkImeiValidationInputSchema,
  BulkImeiValidationResultSchema,
  BulkImeiValidationRowSchema,
  CreateStockLocationInputSchema,
  DeviceIdentifierSchema,
  INVENTORY_CONTRACT_LIMITS,
  InventoryMovementListQuerySchema,
  InventoryMovementPageSchema,
  InventoryMovementSchema,
  InventoryVersionInputSchema,
  ReleaseStockInputSchema,
  ReserveStockInputSchema,
  SerializedUnitDetailSchema,
  SerializedUnitListQuerySchema,
  SerializedUnitSummaryPageSchema,
  SerializedUnitSummarySchema,
  StockBalanceListQuerySchema,
  StockBalancePageSchema,
  StockBalanceSchema,
  StockLocationListQuerySchema,
  StockLocationPageSchema,
  StockLocationReferenceSchema,
  TransferSerializedUnitInputSchema,
  TransferStockInputSchema,
  TransitionSerializedUnitInputSchema,
  UpdateStockLocationInputSchema,
  evaluateBulkImeiRequest,
  normalizeStockLocationCode,
} from "./inventory";

const IDS = {
  variant: "027e808b-c43f-42ac-8d58-52d3bd5e623a",
  location: "6f2c1b53-6a24-4f4b-9a26-1c2f8b6d5e40",
  otherLocation: "9d1a7c02-0c3e-4a1d-8f65-3b7a4e2c9d18",
  unit: "4bc5458f-7a6a-4681-b5b2-948dc25c06a8",
  batch: "baf8bb82-ec2e-4a33-9a52-42166fae197a",
  movement: "ac43d8e5-3553-4917-90a7-11953abf3cc5",
  reference: "a6a73cdb-abf8-4540-b50f-e07fea1213c5",
} as const;

/** Real Luhn-valid IMEIs; the bulk contract normalizes before judging them. */
const IMEIS = {
  first: "356938035643809",
  second: "490154203237518",
} as const;

const variantFixture = {
  id: IDS.variant,
  sku: "PH-SAMSUNG-A55-256-NVY",
  name: "Samsung Galaxy A55 256 GB Navy",
} as const;

const locationFixture = {
  id: IDS.location,
  name: "Main Store",
  code: "MAIN",
} as const;

const stockLocationFixture = {
  ...locationFixture,
  locationType: "store",
  isActive: true,
  version: 1,
} as const;

const serializedUnitFixture = {
  id: IDS.unit,
  productVariant: variantFixture,
  stockLocation: locationFixture,
  state: "available",
  condition: "new",
  ptaStatus: "pta_approved",
  identifiers: [{ type: "imei", value: IMEIS.first }],
  receivedAt: "2026-07-16T10:00:00.000Z",
  version: 1,
} as const;

const serializedUnitDetailFixture = {
  ...serializedUnitFixture,
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
} as const;

const batchMovementFixture = {
  id: IDS.movement,
  productVariant: variantFixture,
  stockLocationId: IDS.location,
  serializedUnitId: null,
  stockBatchId: IDS.batch,
  movementType: "adjustment_in",
  quantity: 5,
  fromState: null,
  toState: null,
  referenceType: "stock_adjustment",
  referenceId: IDS.reference,
  reason: "Stock count correction after physical count.",
  occurredAt: "2026-07-16T10:00:00.000Z",
} as const;

const serializedMovementFixture = {
  ...batchMovementFixture,
  serializedUnitId: IDS.unit,
  stockBatchId: null,
  movementType: "reserve",
  quantity: 1,
  fromState: "available",
  toState: "reserved",
} as const;

const balanceFixture = {
  productVariant: variantFixture,
  locationId: IDS.location,
  locationName: "Main Store",
  trackingType: "quantity",
  onHand: 10,
  reserved: 4,
  available: 6,
} as const;

const adjustFixture = {
  productVariantId: IDS.variant,
  stockLocationId: IDS.location,
  movementType: "adjustment_out",
  quantity: 2,
  adjustmentReason: "damage",
  reason: "Two units damaged in transit.",
} as const;

const reserveFixture = {
  productVariantId: IDS.variant,
  stockLocationId: IDS.location,
  quantity: 1,
} as const;

const transferFixture = {
  productVariantId: IDS.variant,
  fromStockLocationId: IDS.location,
  toStockLocationId: IDS.otherLocation,
  quantity: 3,
  reason: "Rebalancing stock towards the warehouse.",
} as const;

const transferUnitFixture = {
  toStockLocationId: IDS.otherLocation,
  reason: "Moving display unit to the warehouse.",
  version: 1,
} as const;

const transitionFixture = {
  toState: "quarantined",
  reason: "Held pending inspection after customer report.",
  version: 1,
} as const;

const updateLocationFixture = {
  name: "Main Store",
  code: "MAIN",
  locationType: "store",
  version: 1,
} as const;

/**
 * Tenant scope, branch, actor and money never cross an inventory boundary. Cost
 * is owned by the purchasing slice and lives on serialized_units in columns no
 * inventory contract may name.
 */
const FORBIDDEN_INPUT_FIELDS = [
  "organizationId",
  "organization_id",
  "branchId",
  "actorUserId",
  "costMinor",
  "priceMinor",
  "actualCostMinor",
  "landedCostMinor",
] as const;

function withExtraField<T extends object>(
  value: T,
  key: string,
  extraValue: unknown,
): T & Record<string, unknown> {
  return { ...value, [key]: extraValue };
}

function withoutField<T extends object>(value: T, key: keyof T & string): T {
  const rest = { ...value } as Record<string, unknown>;
  delete rest[key];
  return rest as T;
}

describe("inventory normalization", () => {
  it("upper-cases location codes and hyphenates whitespace", () => {
    expect(normalizeStockLocationCode("  main store ")).toBe("MAIN-STORE");
    expect(normalizeStockLocationCode("wh-01")).toBe("WH-01");
    expect(normalizeStockLocationCode("Ｍａｉｎ")).toBe("MAIN");
  });

  it("bounds the code to the width the applied column actually has", () => {
    // stock_locations.code is VARCHAR(20); the contract must never accept a
    // value the database will reject.
    expect(INVENTORY_CONTRACT_LIMITS.CODE_LENGTH).toBe(20);
    expect(
      CreateStockLocationInputSchema.safeParse({
        name: "Main Store",
        code: "C".repeat(INVENTORY_CONTRACT_LIMITS.CODE_LENGTH),
        locationType: "store",
      }).success,
    ).toBe(true);
    expect(
      CreateStockLocationInputSchema.safeParse({
        name: "Main Store",
        code: "C".repeat(INVENTORY_CONTRACT_LIMITS.CODE_LENGTH + 1),
        locationType: "store",
      }).success,
    ).toBe(false);
  });

  it("reuses the shared reason ceiling rather than inventing one", () => {
    expect(INVENTORY_CONTRACT_LIMITS.REASON_LENGTH).toBe(
      LIMITS.MAX_REASON_LENGTH,
    );
    expect(INVENTORY_CONTRACT_LIMITS.MAX_BULK_IMEI_ROWS).toBe(
      LIMITS.MAX_BULK_IMEI_ROWS,
    );
  });
});

describe("stock location contracts", () => {
  it("normalizes create input and takes branch from the server context", () => {
    expect(
      CreateStockLocationInputSchema.parse({
        name: "  Main   Store ",
        code: " main ",
        locationType: "store",
      }),
    ).toEqual({ name: "Main Store", code: "MAIN", locationType: "store" });

    // branchId is never accepted: the branch comes from the session.
    expect(
      CreateStockLocationInputSchema.safeParse({
        name: "Main Store",
        code: "MAIN",
        locationType: "store",
        branchId: IDS.location,
      }).success,
    ).toBe(false);
  });

  it("accepts only the applied StockLocationKind vocabulary", () => {
    for (const locationType of ["store", "warehouse", "virtual"]) {
      expect(
        CreateStockLocationInputSchema.safeParse({
          name: "Somewhere",
          code: "SW",
          locationType,
        }).success,
      ).toBe(true);
    }
    expect(
      CreateStockLocationInputSchema.safeParse({
        name: "Somewhere",
        code: "SW",
        locationType: "transit",
      }).success,
    ).toBe(false);
  });

  it("rejects blank and malformed codes", () => {
    for (const code of ["   ", "", "MAIN STORE!", "-MAIN"]) {
      expect(
        CreateStockLocationInputSchema.safeParse({
          name: "Main Store",
          code,
          locationType: "store",
        }).success,
      ).toBe(false);
    }
  });

  it("requires the whole editable identity on update (replace semantics)", () => {
    expect(UpdateStockLocationInputSchema.parse(updateLocationFixture)).toEqual(
      updateLocationFixture,
    );
    for (const field of ["name", "code", "locationType", "version"] as const) {
      expect(
        UpdateStockLocationInputSchema.safeParse(
          withoutField(updateLocationFixture, field),
        ).success,
      ).toBe(false);
    }
  });

  it("requires a positive integer version on update", () => {
    for (const version of [0, -1, 1.5, "1", null]) {
      expect(
        UpdateStockLocationInputSchema.safeParse({
          ...updateLocationFixture,
          version,
        }).success,
      ).toBe(false);
    }
  });

  it("serves a strict location reference carrying its version", () => {
    expect(StockLocationReferenceSchema.parse(stockLocationFixture)).toEqual(
      stockLocationFixture,
    );
    expect(
      StockLocationReferenceSchema.safeParse(
        withoutField(stockLocationFixture, "version"),
      ).success,
    ).toBe(false);
    expect(
      StockLocationReferenceSchema.safeParse(
        withExtraField(stockLocationFixture, "isDefault", true),
      ).success,
    ).toBe(false);
  });
});

describe("inventory version transition contract", () => {
  it("carries only the version the actor saw", () => {
    expect(InventoryVersionInputSchema.parse({ version: 42 })).toEqual({
      version: 42,
    });
    expect(InventoryVersionInputSchema.safeParse({}).success).toBe(false);
    expect(
      InventoryVersionInputSchema.safeParse({ version: 1, isActive: false })
        .success,
    ).toBe(false);
    for (const version of [0, -1, 1.5, "1", null]) {
      expect(InventoryVersionInputSchema.safeParse({ version }).success).toBe(
        false,
      );
    }
  });
});

describe("device identifier contract", () => {
  it("accepts normalized IMEI and serial values", () => {
    expect(
      DeviceIdentifierSchema.parse({ type: "imei", value: IMEIS.first }),
    ).toEqual({ type: "imei", value: IMEIS.first });
    expect(
      DeviceIdentifierSchema.parse({ type: "serial", value: "SNABC123" }),
    ).toEqual({ type: "serial", value: "SNABC123" });
  });

  it("refuses un-normalized values and unknown identifier types", () => {
    for (const value of ["356938-035643809", "sn-abc 123", "", "sn abc"]) {
      expect(
        DeviceIdentifierSchema.safeParse({ type: "serial", value }).success,
      ).toBe(false);
    }
    expect(
      DeviceIdentifierSchema.safeParse({ type: "meid", value: "ABC123" })
        .success,
    ).toBe(false);
    expect(
      DeviceIdentifierSchema.safeParse({
        type: "imei",
        value: "1".repeat(INVENTORY_CONTRACT_LIMITS.IDENTIFIER_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe("serialized unit responses", () => {
  it("accepts the exact summary and detail shapes", () => {
    expect(SerializedUnitSummarySchema.parse(serializedUnitFixture)).toEqual(
      serializedUnitFixture,
    );
    expect(
      SerializedUnitDetailSchema.parse(serializedUnitDetailFixture),
    ).toEqual(serializedUnitDetailFixture);
  });

  it("accepts a dual-SIM unit with an IMEI pair and a serial", () => {
    const dualSim = {
      ...serializedUnitFixture,
      identifiers: [
        { type: "imei", value: IMEIS.first },
        { type: "imei", value: IMEIS.second },
        { type: "serial", value: "SNABC123" },
      ],
    };
    expect(SerializedUnitSummarySchema.parse(dualSim)).toEqual(dualSim);
  });

  it("rejects one value repeated across a unit's identifier slots", () => {
    const result = SerializedUnitSummarySchema.safeParse({
      ...serializedUnitFixture,
      identifiers: [
        { type: "imei", value: IMEIS.first },
        { type: "serial", value: IMEIS.first },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["identifiers", 1]);
    }
  });

  it("bounds identifiers per unit and accepts a not-yet-received unit", () => {
    expect(
      SerializedUnitSummarySchema.safeParse({
        ...serializedUnitFixture,
        identifiers: Array.from(
          { length: INVENTORY_CONTRACT_LIMITS.MAX_IDENTIFIERS_PER_UNIT + 1 },
          (_, index) => ({
            type: "serial",
            value: `SN${String(index).padStart(4, "0")}`,
          }),
        ),
      }).success,
    ).toBe(false);
    expect(
      SerializedUnitSummarySchema.safeParse({
        ...serializedUnitFixture,
        receivedAt: null,
      }).success,
    ).toBe(true);
  });

  it("accepts every confirmed serialized state and rejects an invented one", () => {
    for (const state of ["pending_verification", "sold", "written_off"]) {
      expect(
        SerializedUnitSummarySchema.safeParse({
          ...serializedUnitFixture,
          state,
        }).success,
      ).toBe(true);
    }
    expect(
      SerializedUnitSummarySchema.safeParse({
        ...serializedUnitFixture,
        state: "in_transit",
      }).success,
    ).toBe(false);
  });

  it.each(["actualCostMinor", "landedCostMinor", "organizationId", "branchId"])(
    "never exposes the reserved unit field %s",
    (field) => {
      expect(
        SerializedUnitSummarySchema.safeParse(
          withExtraField(serializedUnitFixture, field, 1),
        ).success,
      ).toBe(false);
      expect(
        SerializedUnitDetailSchema.safeParse(
          withExtraField(serializedUnitDetailFixture, field, 1),
        ).success,
      ).toBe(false);
    },
  );

  it("requires a positive integer version on unit responses", () => {
    expect(
      SerializedUnitSummarySchema.safeParse(
        withoutField(serializedUnitFixture, "version"),
      ).success,
    ).toBe(false);
    for (const version of [0, -1, 1.5, "1", null]) {
      expect(
        SerializedUnitSummarySchema.safeParse({
          ...serializedUnitFixture,
          version,
        }).success,
      ).toBe(false);
    }
  });
});

describe("bulk IMEI validation", () => {
  it("caps the request at the shared bulk row limit", () => {
    const atLimit = Array.from(
      { length: INVENTORY_CONTRACT_LIMITS.MAX_BULK_IMEI_ROWS },
      (_, index) => String(index).padStart(15, "1"),
    );
    expect(
      BulkImeiValidationInputSchema.safeParse({ identifiers: atLimit }).success,
    ).toBe(true);
    expect(
      BulkImeiValidationInputSchema.safeParse({
        identifiers: [...atLimit, "356938035643809"],
      }).success,
    ).toBe(false);
    expect(
      BulkImeiValidationInputSchema.safeParse({ identifiers: [] }).success,
    ).toBe(false);
    expect(
      BulkImeiValidationInputSchema.safeParse({
        identifiers: [IMEIS.first],
        organizationId: IDS.variant,
      }).success,
    ).toBe(false);
  });

  it("normalizes each row with the same function that produces stored values", () => {
    const result = evaluateBulkImeiRequest({
      identifiers: ["356938-035643809", " 490154 203237518 "],
    });
    expect(result.rows.map((row) => row.normalized)).toEqual([
      IMEIS.first,
      IMEIS.second,
    ]);
    expect(result).toMatchObject({
      validCount: 2,
      invalidCount: 0,
      duplicateCount: 0,
    });
  });

  it("reports duplicates within the request against their first occurrence", () => {
    const result = evaluateBulkImeiRequest({
      identifiers: [IMEIS.first, "356938-035643809", IMEIS.second],
    });
    expect(result.rows.map((row) => row.status)).toEqual([
      "valid",
      "duplicate_in_request",
      "valid",
    ]);
    expect(result.rows[1]?.duplicateOfIndex).toBe(0);
    expect(result).toMatchObject({ validCount: 2, duplicateCount: 1 });
    expect(BulkImeiValidationResultSchema.parse(result)).toEqual(result);
  });

  it("marks rows with nothing usable as invalid rather than dropping them", () => {
    const result = evaluateBulkImeiRequest({
      identifiers: ["", "   ", "abc", IMEIS.first],
    });
    expect(result.rows.map((row) => row.status)).toEqual([
      "invalid",
      "invalid",
      "invalid",
      "valid",
    ]);
    expect(result.rows[0]?.code).toBe("EMPTY");
    // Row indexes survive so the UI can point at the offending spreadsheet row.
    expect(result.rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    expect(result).toMatchObject({ validCount: 1, invalidCount: 3 });
    expect(BulkImeiValidationResultSchema.parse(result)).toEqual(result);
  });

  it("produces a result that always satisfies its own response contract", () => {
    const result = evaluateBulkImeiRequest({
      identifiers: [IMEIS.first, IMEIS.first, "", "490154203237518"],
    });
    expect(BulkImeiValidationResultSchema.safeParse(result).success).toBe(true);
  });

  it("rejects rows whose verdict contradicts itself", () => {
    const valid = {
      index: 1,
      normalized: IMEIS.first,
      status: "valid",
      code: null,
      duplicateOfIndex: null,
    } as const;
    expect(BulkImeiValidationRowSchema.parse(valid)).toEqual(valid);

    // valid rows carry a value and no failure code
    expect(
      BulkImeiValidationRowSchema.safeParse({ ...valid, normalized: null })
        .success,
    ).toBe(false);
    expect(
      BulkImeiValidationRowSchema.safeParse({ ...valid, code: "BAD_LENGTH" })
        .success,
    ).toBe(false);
    // invalid rows must say why
    expect(
      BulkImeiValidationRowSchema.safeParse({ ...valid, status: "invalid" })
        .success,
    ).toBe(false);
    // duplicates must point at an earlier row
    expect(
      BulkImeiValidationRowSchema.safeParse({
        ...valid,
        status: "duplicate_in_request",
      }).success,
    ).toBe(false);
    expect(
      BulkImeiValidationRowSchema.safeParse({
        ...valid,
        status: "duplicate_in_request",
        duplicateOfIndex: 1,
      }).success,
    ).toBe(false);
    expect(
      BulkImeiValidationRowSchema.safeParse({ ...valid, duplicateOfIndex: 0 })
        .success,
    ).toBe(false);
    expect(
      BulkImeiValidationRowSchema.safeParse({ ...valid, code: "NOT_A_CODE" })
        .success,
    ).toBe(false);
  });

  it("rejects counts that disagree with the rows they summarize", () => {
    const result = evaluateBulkImeiRequest({ identifiers: [IMEIS.first] });
    expect(
      BulkImeiValidationResultSchema.safeParse({ ...result, validCount: 2 })
        .success,
    ).toBe(false);
    expect(
      BulkImeiValidationResultSchema.safeParse({ ...result, invalidCount: 1 })
        .success,
    ).toBe(false);
    expect(
      BulkImeiValidationResultSchema.safeParse({ ...result, duplicateCount: 1 })
        .success,
    ).toBe(false);
  });
});

describe("inventory movement responses", () => {
  it("accepts a batch movement and a serialized movement", () => {
    expect(InventoryMovementSchema.parse(batchMovementFixture)).toEqual(
      batchMovementFixture,
    );
    expect(InventoryMovementSchema.parse(serializedMovementFixture)).toEqual(
      serializedMovementFixture,
    );
  });

  it("requires exactly one of a serialized unit or a stock batch", () => {
    expect(
      InventoryMovementSchema.safeParse({
        ...batchMovementFixture,
        serializedUnitId: IDS.unit,
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementSchema.safeParse({
        ...batchMovementFixture,
        stockBatchId: null,
      }).success,
    ).toBe(false);
  });

  it("pins a serialized movement to a quantity of exactly one", () => {
    expect(
      InventoryMovementSchema.safeParse({
        ...serializedMovementFixture,
        quantity: 2,
      }).success,
    ).toBe(false);
  });

  it("carries direction in movementType, never a negative quantity", () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(
        InventoryMovementSchema.safeParse({
          ...batchMovementFixture,
          quantity,
        }).success,
      ).toBe(false);
    }
    expect(
      InventoryMovementSchema.safeParse({
        ...batchMovementFixture,
        movementType: "shrinkage",
      }).success,
    ).toBe(false);
  });

  it("lets only a serialized movement carry lifecycle states", () => {
    expect(
      InventoryMovementSchema.safeParse({
        ...batchMovementFixture,
        fromState: "available",
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementSchema.safeParse({
        ...batchMovementFixture,
        toState: "reserved",
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementSchema.safeParse({
        ...serializedMovementFixture,
        fromState: null,
        toState: null,
      }).success,
    ).toBe(true);
  });

  it.each(FORBIDDEN_INPUT_FIELDS)(
    "never exposes the leaked movement field %s",
    (field) => {
      expect(
        InventoryMovementSchema.safeParse(
          withExtraField(batchMovementFixture, field, 1),
        ).success,
      ).toBe(false);
    },
  );
});

describe("stock balance read model", () => {
  it("accepts a consistent derived balance", () => {
    expect(StockBalanceSchema.parse(balanceFixture)).toEqual(balanceFixture);
    expect(
      StockBalanceSchema.parse({
        ...balanceFixture,
        onHand: 0,
        reserved: 0,
        available: 0,
      }).available,
    ).toBe(0);
  });

  it("rejects arithmetic that does not reconcile", () => {
    const result = StockBalanceSchema.safeParse({
      ...balanceFixture,
      available: 7,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["available"]);
    }
  });

  it("blocks reserved above on-hand, matching the database CHECK", () => {
    const result = StockBalanceSchema.safeParse({
      ...balanceFixture,
      onHand: 2,
      reserved: 5,
      available: -3,
    });
    expect(result.success).toBe(false);
  });

  it("refuses negative stock in every column (13_ §23)", () => {
    for (const field of ["onHand", "reserved", "available"] as const) {
      expect(
        StockBalanceSchema.safeParse({ ...balanceFixture, [field]: -1 })
          .success,
      ).toBe(false);
    }
  });

  it("requires whole units, never fractions", () => {
    expect(
      StockBalanceSchema.safeParse({
        ...balanceFixture,
        onHand: 10.5,
        reserved: 4,
        available: 6.5,
      }).success,
    ).toBe(false);
  });

  it.each(["costMinor", "valuationMinor", "organizationId"])(
    "never exposes the leaked balance field %s",
    (field) => {
      expect(
        StockBalanceSchema.safeParse(withExtraField(balanceFixture, field, 1))
          .success,
      ).toBe(false);
    },
  );
});

describe("inventory mutation inputs", () => {
  it("normalizes an adjustment and demands both reason forms", () => {
    expect(
      AdjustStockInputSchema.parse({
        ...adjustFixture,
        reason: "  Two units   damaged in transit. ",
      }),
    ).toEqual(adjustFixture);

    expect(
      AdjustStockInputSchema.safeParse(withoutField(adjustFixture, "reason"))
        .success,
    ).toBe(false);
    expect(
      AdjustStockInputSchema.safeParse(
        withoutField(adjustFixture, "adjustmentReason"),
      ).success,
    ).toBe(false);
    // Whitespace is not an explanation (13_ §10).
    expect(
      AdjustStockInputSchema.safeParse({ ...adjustFixture, reason: "   " })
        .success,
    ).toBe(false);
    expect(
      AdjustStockInputSchema.safeParse({
        ...adjustFixture,
        reason: "r".repeat(INVENTORY_CONTRACT_LIMITS.REASON_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      AdjustStockInputSchema.safeParse({
        ...adjustFixture,
        adjustmentReason: "felt_like_it",
      }).success,
    ).toBe(false);
  });

  it("confines adjustments to the two adjustment directions", () => {
    expect(ADJUSTMENT_MOVEMENT_TYPES).toEqual([
      "adjustment_in",
      "adjustment_out",
    ]);
    for (const movementType of ADJUSTMENT_MOVEMENT_TYPES) {
      expect(
        AdjustStockInputSchema.safeParse({ ...adjustFixture, movementType })
          .success,
      ).toBe(true);
    }
    // A sale or a receipt must never be posted through the adjustment endpoint.
    for (const movementType of ["sale", "purchase_receive", "transfer_out"]) {
      expect(
        AdjustStockInputSchema.safeParse({ ...adjustFixture, movementType })
          .success,
      ).toBe(false);
    }
  });

  it("requires a positive whole quantity within the ledger bound", () => {
    for (const quantity of [0, -1, 1.5, "2", null]) {
      expect(
        AdjustStockInputSchema.safeParse({ ...adjustFixture, quantity })
          .success,
      ).toBe(false);
    }
    expect(
      AdjustStockInputSchema.safeParse({
        ...adjustFixture,
        quantity: INVENTORY_CONTRACT_LIMITS.MAX_MOVEMENT_QUANTITY,
      }).success,
    ).toBe(true);
    expect(
      AdjustStockInputSchema.safeParse({
        ...adjustFixture,
        quantity: INVENTORY_CONTRACT_LIMITS.MAX_MOVEMENT_QUANTITY + 1,
      }).success,
    ).toBe(false);
  });

  it("keeps reserve and release symmetric with an optional reason", () => {
    for (const schema of [ReserveStockInputSchema, ReleaseStockInputSchema]) {
      expect(schema.parse(reserveFixture)).toMatchObject(reserveFixture);
      expect(
        schema.parse({ ...reserveFixture, reason: "  Held for  customer. " })
          .reason,
      ).toBe("Held for customer.");
      expect(schema.safeParse({ ...reserveFixture, quantity: 0 }).success).toBe(
        false,
      );
      expect(
        schema.safeParse({ ...reserveFixture, stockLocationId: "not-a-uuid" })
          .success,
      ).toBe(false);
    }
  });

  it("demands a reason on a transfer and refuses a no-op move", () => {
    expect(TransferStockInputSchema.parse(transferFixture)).toEqual(
      transferFixture,
    );
    expect(
      TransferStockInputSchema.safeParse(
        withoutField(transferFixture, "reason"),
      ).success,
    ).toBe(false);

    const noop = TransferStockInputSchema.safeParse({
      ...transferFixture,
      toStockLocationId: transferFixture.fromStockLocationId,
    });
    expect(noop.success).toBe(false);
    if (!noop.success) {
      expect(noop.error.issues[0]?.path).toEqual(["toStockLocationId"]);
    }
  });

  it("moves a serialized unit by destination, reason and version only", () => {
    expect(
      TransferSerializedUnitInputSchema.parse(transferUnitFixture),
    ).toEqual(transferUnitFixture);
    for (const field of ["toStockLocationId", "reason", "version"] as const) {
      expect(
        TransferSerializedUnitInputSchema.safeParse(
          withoutField(transferUnitFixture, field),
        ).success,
      ).toBe(false);
    }
    // The unit is named by the path, never by the body.
    expect(
      TransferSerializedUnitInputSchema.safeParse(
        withExtraField(transferUnitFixture, "serializedUnitId", IDS.unit),
      ).success,
    ).toBe(false);
  });

  it("takes a target state, a reason and a version on a transition", () => {
    expect(
      TransitionSerializedUnitInputSchema.parse(transitionFixture),
    ).toEqual(transitionFixture);
    for (const field of ["toState", "reason", "version"] as const) {
      expect(
        TransitionSerializedUnitInputSchema.safeParse(
          withoutField(transitionFixture, field),
        ).success,
      ).toBe(false);
    }
    expect(
      TransitionSerializedUnitInputSchema.safeParse({
        ...transitionFixture,
        toState: "teleported",
      }).success,
    ).toBe(false);
  });

  it("never lets a client assert the state a unit is moving from", () => {
    // The stored state is authoritative; the server checks isTransitionAllowed.
    expect(
      TransitionSerializedUnitInputSchema.safeParse(
        withExtraField(transitionFixture, "fromState", "available"),
      ).success,
    ).toBe(false);
  });
});

describe("inventory input boundaries reject tenant and financial smuggling", () => {
  const boundaries = [
    [
      "InventoryVersionInputSchema",
      InventoryVersionInputSchema,
      { version: 1 },
    ],
    [
      "CreateStockLocationInputSchema",
      CreateStockLocationInputSchema,
      { name: "Main Store", code: "MAIN", locationType: "store" },
    ],
    [
      "UpdateStockLocationInputSchema",
      UpdateStockLocationInputSchema,
      updateLocationFixture,
    ],
    ["AdjustStockInputSchema", AdjustStockInputSchema, adjustFixture],
    ["ReserveStockInputSchema", ReserveStockInputSchema, reserveFixture],
    ["ReleaseStockInputSchema", ReleaseStockInputSchema, reserveFixture],
    ["TransferStockInputSchema", TransferStockInputSchema, transferFixture],
    [
      "TransferSerializedUnitInputSchema",
      TransferSerializedUnitInputSchema,
      transferUnitFixture,
    ],
    [
      "TransitionSerializedUnitInputSchema",
      TransitionSerializedUnitInputSchema,
      transitionFixture,
    ],
    [
      "BulkImeiValidationInputSchema",
      BulkImeiValidationInputSchema,
      { identifiers: [IMEIS.first] },
    ],
  ] as const;

  const cases = boundaries.flatMap(([label, schema, fixture]) =>
    FORBIDDEN_INPUT_FIELDS.map(
      (field) => [label, field, schema, fixture] as const,
    ),
  );

  it.each(cases)("%s rejects %s", (_label, field, schema, fixture) => {
    expect(
      schema.safeParse(
        withExtraField(fixture, field, "must-not-cross-this-boundary"),
      ).success,
    ).toBe(false);
    expect(schema.safeParse(withExtraField(fixture, field, 1)).success).toBe(
      false,
    );
  });
});

describe("inventory list queries", () => {
  it("applies bounded pagination defaults across every surface", () => {
    for (const schema of [
      StockLocationListQuerySchema,
      SerializedUnitListQuerySchema,
      InventoryMovementListQuerySchema,
      StockBalanceListQuerySchema,
    ]) {
      expect(schema.parse({})).toEqual({ page: 1, pageSize: 25 });
      expect(schema.safeParse({ pageSize: "101" }).success).toBe(false);
      expect(schema.safeParse({ page: "0" }).success).toBe(false);
      expect(schema.safeParse({ organizationId: IDS.variant }).success).toBe(
        false,
      );
    }
  });

  it("normalizes search and safely parses boolean query values", () => {
    expect(
      StockLocationListQuerySchema.parse({ q: "  main   store ", active: "1" }),
    ).toEqual({ page: 1, pageSize: 25, q: "main store", active: true });
    expect(StockLocationListQuerySchema.parse({ q: "   " })).toEqual({
      page: 1,
      pageSize: 25,
    });
    expect(
      StockLocationListQuerySchema.safeParse({ active: "yes" }).success,
    ).toBe(false);
  });

  it("accepts only the confirmed filters on each surface", () => {
    expect(
      SerializedUnitListQuerySchema.parse({
        productVariantId: IDS.variant,
        stockLocationId: IDS.location,
        state: "available",
        condition: "new",
        ptaStatus: "non_pta",
      }),
    ).toMatchObject({ state: "available", ptaStatus: "non_pta" });
    expect(
      SerializedUnitListQuerySchema.safeParse({ state: "in_transit" }).success,
    ).toBe(false);

    expect(
      InventoryMovementListQuerySchema.parse({ movementType: "sale" }),
    ).toMatchObject({ movementType: "sale" });
    expect(
      InventoryMovementListQuerySchema.safeParse({ movementType: "shrinkage" })
        .success,
    ).toBe(false);

    expect(
      StockBalanceListQuerySchema.parse({ trackingType: "serialized" }),
    ).toMatchObject({ trackingType: "serialized" });
    expect(
      StockBalanceListQuerySchema.safeParse({ trackingType: "imei" }).success,
    ).toBe(false);
    expect(
      StockLocationListQuerySchema.safeParse({ locationType: "transit" })
        .success,
    ).toBe(false);
    expect(
      StockLocationListQuerySchema.safeParse({ state: "available" }).success,
    ).toBe(false);
  });
});

describe("inventory page envelopes", () => {
  const envelopes = [
    ["StockLocationPageSchema", StockLocationPageSchema, stockLocationFixture],
    [
      "SerializedUnitSummaryPageSchema",
      SerializedUnitSummaryPageSchema,
      serializedUnitFixture,
    ],
    [
      "InventoryMovementPageSchema",
      InventoryMovementPageSchema,
      batchMovementFixture,
    ],
    ["StockBalancePageSchema", StockBalancePageSchema, balanceFixture],
  ] as const;

  it.each(envelopes)(
    "%s carries the confirmed flat envelope",
    (_label, schema, item) => {
      expect(
        schema.parse({
          items: [item],
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
        }).items,
      ).toEqual([item]);
    },
  );

  it.each(envelopes)("%s accepts an empty page", (_label, schema) => {
    expect(
      schema.parse({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      }),
    ).toEqual({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 });
  });

  it.each(envelopes)(
    "%s rejects inconsistent totals, oversized pages and extras",
    (_label, schema) => {
      expect(
        schema.safeParse({
          items: [],
          page: 1,
          pageSize: 25,
          total: 26,
          totalPages: 1,
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          items: [],
          page: 1,
          pageSize: 101,
          total: 0,
          totalPages: 0,
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          items: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 0,
          valuationMinor: 0,
        }).success,
      ).toBe(false);
    },
  );
});
