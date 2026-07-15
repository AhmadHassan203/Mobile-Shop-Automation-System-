import { Injectable } from "@nestjs/common";
import { Prisma, type StockLocation } from "@mobileshop/database";
import {
  BulkImeiValidationResultSchema,
  DomainError,
  ERROR_CODES,
  evaluateBulkImeiRequest,
  InventoryMovementPageSchema,
  isTransitionAllowed,
  normalizeSerial,
  ON_HAND_STOCK_STATES,
  SerializedUnitDetailSchema,
  SerializedUnitSummaryPageSchema,
  StockBalancePageSchema,
  StockBalanceSchema,
  StockLocationPageSchema,
  StockLocationReferenceSchema,
  validateImei,
  type AdjustStockData,
  type BulkImeiValidationData,
  type BulkImeiValidationResult,
  type BulkImeiValidationRow,
  type CreateStockLocationData,
  type InventoryMovementListQuery,
  type InventoryMovementPage,
  type InventoryVersionData,
  type ReleaseStockData,
  type ReserveStockData,
  type SerializedStockState,
  type SerializedUnitDetail,
  type SerializedUnitListQuery,
  type SerializedUnitSummaryPage,
  type StockBalance,
  type StockBalanceListQuery,
  type StockBalancePage,
  type StockLocationListQuery,
  type StockLocationPage,
  type StockLocationReference,
  type TransferSerializedUnitData,
  type TransferStockData,
  type TransitionSerializedUnitData,
  type UpdateStockLocationData,
} from "@mobileshop/shared";
import type { ZodType } from "zod";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface InventoryActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly metadata: AuthRequestMetadata;
}

/**
 * The one rule that shapes this whole module:
 *
 * `/inventory/{adjustments,reservations,transfers}` move a COUNTER, so they
 * serve quantity-tracked variants only. A serialized variant's count is derived
 * from the unit rows themselves, so moving its counter without moving a unit
 * would invent stock — that is exactly what INVENTORY_DIRECT_EDIT_BLOCKED
 * exists to refuse. Serialized stock is always addressed by unit id under
 * `/serialized-units/:id/*`, where a real row lock can name the handset.
 */
const SERIALIZED_COUNTER_HINT =
  "Serialized stock is counted from its units. Move the unit itself instead of its quantity.";

/** The only state that counts as reserved for a serialized unit. */
const RESERVED_STATE: SerializedStockState = "reserved";

const stockLocationReferenceSelect = {
  id: true,
  name: true,
  code: true,
  kind: true,
  isActive: true,
  version: true,
} satisfies Prisma.StockLocationSelect;

/**
 * Cost is absent by construction: `actual_cost_minor` and `landed_cost_minor`
 * exist on the row but are never selected, so no inventory response — and no
 * audit snapshot built from one — can carry them.
 */
const serializedUnitSummarySelect = {
  id: true,
  state: true,
  condition: true,
  ptaStatus: true,
  receivedAt: true,
  version: true,
  productVariant: { select: { id: true, sku: true, name: true } },
  stockLocation: { select: { id: true, name: true, code: true } },
  identifiers: {
    select: { identifierType: true, normalizedValue: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.SerializedUnitSelect;

const serializedUnitDetailSelect = {
  ...serializedUnitSummarySelect,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SerializedUnitSelect;

/** `actorUserId` is stored but deliberately unselected: the contract has no field for it. */
const movementSelect = {
  id: true,
  stockLocationId: true,
  serializedUnitId: true,
  stockBatchId: true,
  movementType: true,
  quantity: true,
  fromState: true,
  toState: true,
  referenceType: true,
  referenceId: true,
  reason: true,
  occurredAt: true,
  productVariant: { select: { id: true, sku: true, name: true } },
} satisfies Prisma.InventoryMovementSelect;

type SerializedUnitSummaryRecord = Prisma.SerializedUnitGetPayload<{
  select: typeof serializedUnitSummarySelect;
}>;

type SerializedUnitDetailRecord = Prisma.SerializedUnitGetPayload<{
  select: typeof serializedUnitDetailSelect;
}>;

type MovementRecord = Prisma.InventoryMovementGetPayload<{
  select: typeof movementSelect;
}>;

/** A `SELECT ... FOR UPDATE` projection of a stock batch. */
interface LockedBatch {
  readonly id: string;
  readonly stockLocationId: string;
  readonly quantityOnHand: number;
  readonly quantityReserved: number;
  readonly version: number;
}

/** A `SELECT ... FOR UPDATE` projection of a serialized unit. */
interface LockedUnit {
  readonly id: string;
  readonly productVariantId: string;
  readonly stockLocationId: string;
  readonly state: SerializedStockState;
  readonly version: number;
}

interface StockBalanceRow {
  readonly variantId: string;
  readonly sku: string;
  readonly variantName: string;
  readonly trackingType: "serialized" | "quantity";
  readonly locationId: string;
  readonly locationName: string;
  readonly onHand: number;
  readonly reserved: number;
}

interface VariantRow {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly trackingType: "serialized" | "quantity";
}

function pageEnvelope<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
  total: number,
) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

function validationError(
  field: string,
  message: string,
  cause?: unknown,
): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
    ...(cause === undefined ? {} : { cause }),
  });
}

/**
 * A row that is absent, that belongs to another organization, or that sits in
 * another branch is reported identically: confirming that an id exists elsewhere
 * would leak the tenant boundary this module is built to hold.
 */
function notFoundError(label: string): DomainError {
  return new DomainError(
    ERROR_CODES.NOT_FOUND,
    `This ${label} no longer exists.`,
  );
}

function optimisticLockError(label: string): DomainError {
  return new DomainError(
    ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
    `This ${label} was changed by someone else. Reload it and reapply your edit.`,
  );
}

function directEditBlockedError(message: string): DomainError {
  return new DomainError(ERROR_CODES.INVENTORY_DIRECT_EDIT_BLOCKED, message);
}

function insufficientStockError(message: string): DomainError {
  return new DomainError(ERROR_CODES.INVENTORY_INSUFFICIENT_STOCK, message, {
    details: { quantity: [message] },
  });
}

/** `%` and `_` are wildcards in ILIKE; a search term must match itself only. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

/**
 * An optional free-text reason is stored as NULL rather than "". The response
 * contract types `reason` as a non-empty string or null, so an empty string
 * persisted here would later fail the response contract as an opaque 500.
 */
function optionalReason(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function inventoryResponse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  // Request validation is completed in the controller pipes. A failure here
  // means persisted/server data violated our public response contract and must
  // be treated as an internal fault, never blamed on the caller as a 422.
  throw new Error("Inventory response validation failed", {
    cause: result.error,
  });
}

function stockLocationSnapshot(
  location: Pick<StockLocation, "name" | "code" | "kind" | "isActive">,
): Prisma.InputJsonObject {
  return {
    name: location.name,
    code: location.code,
    locationType: location.kind,
    isActive: location.isActive,
  };
}

function batchSnapshot(
  batch: Pick<LockedBatch, "quantityOnHand" | "quantityReserved">,
): Prisma.InputJsonObject {
  return {
    quantityOnHand: batch.quantityOnHand,
    quantityReserved: batch.quantityReserved,
  };
}

/**
 * The audit snapshot of a serialized unit. Identifiers are included on purpose:
 * the whole point of auditing a handset is being able to say WHICH handset, and
 * the IMEI is already the unit's public identity. Cost never reaches it — the
 * select it is built from does not read the cost columns at all.
 */
function serializedUnitSnapshot(
  unit: SerializedUnitSummaryRecord,
): Prisma.InputJsonObject {
  return {
    productVariantId: unit.productVariant.id,
    stockLocationId: unit.stockLocation.id,
    state: unit.state,
    condition: unit.condition,
    ptaStatus: unit.ptaStatus,
    identifiers: unit.identifiers.map(
      (identifier) => identifier.normalizedValue,
    ),
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // Stock locations
  // ===========================================================================

  async listStockLocations(
    organizationId: string,
    query: StockLocationListQuery,
  ): Promise<StockLocationPage> {
    const where: Prisma.StockLocationWhereInput = {
      organizationId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.locationType === undefined ? {} : { kind: query.locationType }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { code: { contains: query.q, mode: "insensitive" } },
            ],
          }),
    };
    const [total, records] = await this.prisma.client.$transaction([
      this.prisma.client.stockLocation.count({ where }),
      this.prisma.client.stockLocation.findMany({
        where,
        select: stockLocationReferenceSelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return inventoryResponse(
      StockLocationPageSchema,
      pageEnvelope(
        records.map((record) => this.toStockLocationReference(record)),
        query.page,
        query.pageSize,
        total,
      ),
    );
  }

  async createStockLocation(
    context: InventoryActorContext,
    input: CreateStockLocationData,
  ): Promise<StockLocationReference> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        // The branch comes from the session, exactly like the organization: a
        // client that could name its own branch could create a location inside
        // a branch it cannot see.
        const location = await tx.stockLocation.create({
          data: {
            organizationId: context.organizationId,
            branchId: context.branchId,
            name: input.name,
            code: input.code,
            kind: input.locationType,
          },
          select: stockLocationReferenceSelect,
        });
        await this.writeAudit(tx, context, {
          action: "inventory.location_created",
          entityType: "stock_location",
          entityId: location.id,
          after: stockLocationSnapshot(location),
        });
        return this.toStockLocationReference(location);
      });
    } catch (error) {
      this.rethrowLocationDuplicate(error);
    }
  }

  async updateStockLocation(
    context: InventoryActorContext,
    id: string,
    input: UpdateStockLocationData,
  ): Promise<StockLocationReference> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const current = await this.loadStockLocation(
          tx,
          context.organizationId,
          id,
        );

        this.assertVersionMatched(
          await tx.stockLocation.updateMany({
            where: {
              id,
              organizationId: context.organizationId,
              version: input.version,
            },
            data: {
              name: input.name,
              code: input.code,
              kind: input.locationType,
              version: { increment: 1 },
            },
          }),
          "stock location",
        );

        const location = await this.loadStockLocation(
          tx,
          context.organizationId,
          id,
        );
        await this.writeAudit(tx, context, {
          action: "inventory.location_updated",
          entityType: "stock_location",
          entityId: id,
          before: stockLocationSnapshot(current),
          after: stockLocationSnapshot(location),
        });
        return this.toStockLocationReference(location);
      });
    } catch (error) {
      this.rethrowLocationDuplicate(error);
    }
  }

  async deactivateStockLocation(
    context: InventoryActorContext,
    id: string,
    input: InventoryVersionData,
  ): Promise<StockLocationReference> {
    return this.setStockLocationActive(context, id, input, false);
  }

  async activateStockLocation(
    context: InventoryActorContext,
    id: string,
    input: InventoryVersionData,
  ): Promise<StockLocationReference> {
    return this.setStockLocationActive(context, id, input, true);
  }

  private async setStockLocationActive(
    context: InventoryActorContext,
    id: string,
    input: InventoryVersionData,
    isActive: boolean,
  ): Promise<StockLocationReference> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.loadStockLocation(
        tx,
        context.organizationId,
        id,
      );

      this.assertVersionMatched(
        await tx.stockLocation.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { isActive, version: { increment: 1 } },
        }),
        "stock location",
      );

      const location = await this.loadStockLocation(
        tx,
        context.organizationId,
        id,
      );
      await this.writeAudit(tx, context, {
        action: isActive
          ? "inventory.location_reactivated"
          : "inventory.location_deactivated",
        entityType: "stock_location",
        entityId: id,
        before: stockLocationSnapshot(current),
        after: stockLocationSnapshot(location),
      });
      return this.toStockLocationReference(location);
    });
  }

  private async loadStockLocation(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<
    Prisma.StockLocationGetPayload<{
      select: typeof stockLocationReferenceSelect;
    }>
  > {
    const location = await tx.stockLocation.findFirst({
      where: { id, organizationId },
      select: stockLocationReferenceSelect,
    });
    if (location === null) throw notFoundError("stock location");
    return location;
  }

  // ===========================================================================
  // Derived read models
  // ===========================================================================

  /**
   * Stock balances, DERIVED on every read.
   *
   * There is no stored rollup: quantity stock is read straight off its batch
   * row and serialized stock is counted from the unit rows, so a balance cannot
   * drift out of agreement with the stock it describes. The UNION is done in
   * SQL because one page has to be ordered and counted across both sources.
   */
  async listStockBalances(
    organizationId: string,
    query: StockBalanceListQuery,
  ): Promise<StockBalancePage> {
    const pairs = this.stockBalancePairs(organizationId);
    const source = this.stockBalanceSource(organizationId, query);
    const offset = (query.page - 1) * query.pageSize;

    const [totals, rows] = await this.prisma.client.$transaction([
      this.prisma.client.$queryRaw<readonly { readonly total: number }[]>(
        Prisma.sql`${pairs} SELECT COUNT(*)::int AS "total" ${source}`,
      ),
      this.prisma.client.$queryRaw<readonly StockBalanceRow[]>(
        Prisma.sql`${pairs}
          SELECT p.variant_id AS "variantId",
                 v.sku AS "sku",
                 v.name AS "variantName",
                 v.tracking_type::text AS "trackingType",
                 p.location_id AS "locationId",
                 l.name AS "locationName",
                 p.on_hand AS "onHand",
                 p.reserved AS "reserved"
          ${source}
          ORDER BY v.sku ASC, l.name ASC, p.variant_id ASC, p.location_id ASC
          LIMIT ${query.pageSize} OFFSET ${offset}`,
      ),
    ]);

    return inventoryResponse(
      StockBalancePageSchema,
      pageEnvelope(
        rows.map((row) => ({
          productVariant: {
            id: row.variantId,
            sku: row.sku,
            name: row.variantName,
          },
          locationId: row.locationId,
          locationName: row.locationName,
          trackingType: row.trackingType,
          onHand: row.onHand,
          reserved: row.reserved,
          available: row.onHand - row.reserved,
        })),
        query.page,
        query.pageSize,
        totals[0]?.total ?? 0,
      ),
    );
  }

  /**
   * The (variant, location) pairs that hold stock, with their on-hand and
   * reserved counts. Quantity stock contributes its batch row; serialized stock
   * contributes a count of its units, where `reserved` is a subset of `on hand`
   * — which is what keeps `reserved <= onHand` true for both sources.
   */
  private stockBalancePairs(organizationId: string): Prisma.Sql {
    return Prisma.sql`
      WITH pairs AS (
        SELECT b.product_variant_id AS variant_id,
               b.stock_location_id AS location_id,
               b.quantity_on_hand AS on_hand,
               b.quantity_reserved AS reserved
          FROM stock_batches b
         WHERE b.organization_id = ${organizationId}::uuid
        UNION ALL
        SELECT u.product_variant_id,
               u.stock_location_id,
               COUNT(*) FILTER (
                 WHERE u.state::text IN (${Prisma.join([...ON_HAND_STOCK_STATES])})
               )::int,
               COUNT(*) FILTER (WHERE u.state::text = ${RESERVED_STATE})::int
          FROM serialized_units u
         WHERE u.organization_id = ${organizationId}::uuid
         GROUP BY u.product_variant_id, u.stock_location_id
      )`;
  }

  private stockBalanceSource(
    organizationId: string,
    query: StockBalanceListQuery,
  ): Prisma.Sql {
    const filters: Prisma.Sql[] = [];
    if (query.productVariantId !== undefined) {
      filters.push(Prisma.sql`p.variant_id = ${query.productVariantId}::uuid`);
    }
    if (query.stockLocationId !== undefined) {
      filters.push(Prisma.sql`p.location_id = ${query.stockLocationId}::uuid`);
    }
    if (query.trackingType !== undefined) {
      filters.push(Prisma.sql`v.tracking_type::text = ${query.trackingType}`);
    }
    if (query.active !== undefined) {
      filters.push(Prisma.sql`v.is_active = ${query.active}`);
    }
    if (query.q !== undefined) {
      const like = `%${escapeLikePattern(query.q)}%`;
      filters.push(
        Prisma.sql`(v.sku ILIKE ${like} OR v.name ILIKE ${like} OR l.name ILIKE ${like})`,
      );
    }

    // The tenant predicate is repeated on both joins rather than trusted from
    // the CTE: it is the boundary, so it is stated everywhere it can be stated.
    return Prisma.sql`
      FROM pairs p
      JOIN product_variants v
        ON v.id = p.variant_id AND v.organization_id = ${organizationId}::uuid
      JOIN stock_locations l
        ON l.id = p.location_id AND l.organization_id = ${organizationId}::uuid
      WHERE ${filters.length === 0 ? Prisma.sql`TRUE` : Prisma.join(filters, " AND ")}`;
  }

  async listMovements(
    organizationId: string,
    query: InventoryMovementListQuery,
  ): Promise<InventoryMovementPage> {
    return this.movementPage(organizationId, query, {});
  }

  async listSerializedUnitMovements(
    organizationId: string,
    serializedUnitId: string,
    query: InventoryMovementListQuery,
  ): Promise<InventoryMovementPage> {
    // The unit is resolved first so that another tenant's id reports NOT_FOUND
    // rather than an empty page, which would confirm the id exists.
    const unit = await this.prisma.client.serializedUnit.findFirst({
      where: { id: serializedUnitId, organizationId },
      select: { id: true },
    });
    if (unit === null) throw notFoundError("serialized unit");

    // The path owns the unit; a query string cannot widen the result past it.
    return this.movementPage(organizationId, query, { serializedUnitId });
  }

  private async movementPage(
    organizationId: string,
    query: InventoryMovementListQuery,
    pinned: { readonly serializedUnitId?: string },
  ): Promise<InventoryMovementPage> {
    const serializedUnitId = pinned.serializedUnitId ?? query.serializedUnitId;
    const where: Prisma.InventoryMovementWhereInput = {
      organizationId,
      ...(query.productVariantId === undefined
        ? {}
        : { productVariantId: query.productVariantId }),
      ...(query.stockLocationId === undefined
        ? {}
        : { stockLocationId: query.stockLocationId }),
      ...(serializedUnitId === undefined ? {} : { serializedUnitId }),
      ...(query.movementType === undefined
        ? {}
        : { movementType: query.movementType }),
      ...(query.active === undefined
        ? {}
        : { productVariant: { is: { isActive: query.active } } }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { reason: { contains: query.q, mode: "insensitive" } },
              {
                productVariant: {
                  is: { sku: { contains: query.q, mode: "insensitive" } },
                },
              },
              {
                productVariant: {
                  is: { name: { contains: query.q, mode: "insensitive" } },
                },
              },
            ],
          }),
    };
    const [total, records] = await this.prisma.client.$transaction([
      this.prisma.client.inventoryMovement.count({ where }),
      this.prisma.client.inventoryMovement.findMany({
        where,
        select: movementSelect,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return inventoryResponse(
      InventoryMovementPageSchema,
      pageEnvelope(
        records.map((record) => this.toMovement(record)),
        query.page,
        query.pageSize,
        total,
      ),
    );
  }

  // ===========================================================================
  // Serialized units
  // ===========================================================================

  async listSerializedUnits(
    organizationId: string,
    query: SerializedUnitListQuery,
  ): Promise<SerializedUnitSummaryPage> {
    const where: Prisma.SerializedUnitWhereInput = {
      organizationId,
      ...(query.productVariantId === undefined
        ? {}
        : { productVariantId: query.productVariantId }),
      ...(query.stockLocationId === undefined
        ? {}
        : { stockLocationId: query.stockLocationId }),
      ...(query.state === undefined ? {} : { state: query.state }),
      ...(query.condition === undefined ? {} : { condition: query.condition }),
      ...(query.ptaStatus === undefined ? {} : { ptaStatus: query.ptaStatus }),
      ...(query.active === undefined
        ? {}
        : { productVariant: { is: { isActive: query.active } } }),
      ...(query.q === undefined
        ? {}
        : { OR: this.serializedUnitSearch(query.q) }),
    };
    const [total, records] = await this.prisma.client.$transaction([
      this.prisma.client.serializedUnit.count({ where }),
      this.prisma.client.serializedUnit.findMany({
        where,
        select: serializedUnitSummarySelect,
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return inventoryResponse(
      SerializedUnitSummaryPageSchema,
      pageEnvelope(
        records.map((record) => this.serializedUnitValue(record)),
        query.page,
        query.pageSize,
        total,
      ),
    );
  }

  /**
   * Identifiers are stored normalized, so the search term is normalized the
   * same way before it is compared: a staff member pasting "356938-035643809"
   * must find the handset stored as "356938035643809".
   */
  private serializedUnitSearch(
    term: string,
  ): Prisma.SerializedUnitWhereInput[] {
    const normalized = normalizeSerial(term);
    return [
      ...(normalized === null
        ? []
        : [
            {
              identifiers: {
                some: { normalizedValue: { contains: normalized } },
              },
            },
          ]),
      {
        productVariant: {
          is: { sku: { contains: term, mode: "insensitive" } },
        },
      },
      {
        productVariant: {
          is: { name: { contains: term, mode: "insensitive" } },
        },
      },
    ];
  }

  async getSerializedUnit(
    organizationId: string,
    id: string,
  ): Promise<SerializedUnitDetail> {
    const unit = await this.prisma.client.serializedUnit.findFirst({
      where: { id, organizationId },
      select: serializedUnitDetailSelect,
    });
    if (unit === null) throw notFoundError("serialized unit");
    return this.toSerializedUnitDetail(unit);
  }

  /**
   * Pre-save bulk IMEI validation (13_ §10). Read-only: it writes nothing and
   * touches no table.
   *
   * `evaluateBulkImeiRequest` owns normalization and duplicate-within-request,
   * so the browser preview and this endpoint agree on those verdicts by
   * construction. Rows it accepts are then held to the full IMEI rules —
   * length, alphabet, repeated-digit placeholders and the Luhn check digit —
   * which is what makes this a validation endpoint rather than a formatter.
   * Every code it can emit is already in the response contract's vocabulary.
   */
  validateBulkImei(input: BulkImeiValidationData): BulkImeiValidationResult {
    const rows: BulkImeiValidationRow[] = evaluateBulkImeiRequest(
      input,
    ).rows.map((row) => {
      if (row.status !== "valid") return row;

      const verdict = validateImei(input.identifiers[row.index]);
      if (verdict.valid || verdict.code === undefined) return row;
      return { ...row, status: "invalid", code: verdict.code };
    });

    const counted = (status: BulkImeiValidationRow["status"]): number =>
      rows.filter((row) => row.status === status).length;

    return inventoryResponse(BulkImeiValidationResultSchema, {
      rows,
      validCount: counted("valid"),
      invalidCount: counted("invalid"),
      duplicateCount: counted("duplicate_in_request"),
    });
  }

  // ===========================================================================
  // Quantity-tracked mutations
  // ===========================================================================

  /**
   * Manual stock correction (13_ §10).
   *
   * One transaction writes the batch quantity, exactly one movement and exactly
   * one audit event. The quantity only ever moves through that movement — there
   * is no path in this module that edits the counter on its own.
   */
  async adjustStock(
    context: InventoryActorContext,
    input: AdjustStockData,
  ): Promise<StockBalance> {
    // The contract already requires a reason; this is the backstop that makes
    // INVENTORY_ADJUSTMENT_REASON_REQUIRED true of the service, not merely of
    // the pipe in front of it.
    const reason = optionalReason(input.reason);
    if (reason === null) {
      throw new DomainError(
        ERROR_CODES.INVENTORY_ADJUSTMENT_REASON_REQUIRED,
        "Enter a reason for this stock adjustment.",
        { details: { reason: ["Enter a reason for this stock adjustment."] } },
      );
    }

    return this.runQuantityMutation(async (tx) => {
      const variant = await this.loadQuantityVariant(
        tx,
        context.organizationId,
        input.productVariantId,
        `${SERIALIZED_COUNTER_HINT} Adjust it with a state transition on the unit.`,
      );
      const location = await this.resolveWritableLocation(
        tx,
        context,
        input.stockLocationId,
        "stockLocationId",
      );

      const delta =
        input.movementType === "adjustment_in"
          ? input.quantity
          : -input.quantity;
      const batch = await this.lockOrCreateBatch(
        tx,
        context,
        variant.id,
        location.id,
        delta > 0,
      );
      if (batch === null) {
        throw insufficientStockError(
          "There is no stock at this location to reduce.",
        );
      }

      const quantityOnHand = batch.quantityOnHand + delta;
      // The CHECK constraints are the backstop; the API owes the caller a clean
      // 4xx rather than a raw constraint violation surfacing as a 500.
      if (quantityOnHand < 0) {
        throw insufficientStockError(
          `Only ${batch.quantityOnHand} in stock at this location.`,
        );
      }
      if (quantityOnHand < batch.quantityReserved) {
        throw insufficientStockError(
          `${batch.quantityReserved} of these are reserved. Release the reservation first.`,
        );
      }

      this.assertVersionMatched(
        await tx.stockBatch.updateMany({
          where: {
            id: batch.id,
            organizationId: context.organizationId,
            version: batch.version,
          },
          data: { quantityOnHand, version: { increment: 1 } },
        }),
        "stock level",
      );

      await this.writeMovement(tx, context, {
        productVariantId: variant.id,
        stockLocationId: location.id,
        stockBatchId: batch.id,
        movementType: input.movementType,
        quantity: input.quantity,
        // An adjustment has no source document. Its reference is the controlled
        // reason category, which is what corrections are reported by; the typed
        // reason next to it is what makes the correction explainable.
        referenceType: input.adjustmentReason,
        reason,
      });
      await this.writeAudit(tx, context, {
        action: "inventory.stock_adjusted",
        entityType: "stock_batch",
        entityId: batch.id,
        before: batchSnapshot(batch),
        after: batchSnapshot({
          quantityOnHand,
          quantityReserved: batch.quantityReserved,
        }),
      });

      return this.balanceFor(tx, context.organizationId, variant, location.id);
    });
  }

  async reserveStock(
    context: InventoryActorContext,
    input: ReserveStockData,
  ): Promise<StockBalance> {
    return this.runQuantityMutation(async (tx) => {
      const variant = await this.loadQuantityVariant(
        tx,
        context.organizationId,
        input.productVariantId,
        `${SERIALIZED_COUNTER_HINT} Reserve a handset by transitioning that unit to reserved.`,
      );
      const location = await this.resolveWritableLocation(
        tx,
        context,
        input.stockLocationId,
        "stockLocationId",
      );

      const batch = await this.lockBatch(
        tx,
        context.organizationId,
        variant.id,
        location.id,
      );
      if (batch === null) {
        throw insufficientStockError("There is no stock at this location.");
      }

      const available = batch.quantityOnHand - batch.quantityReserved;
      if (available < input.quantity) {
        throw insufficientStockError(
          `Only ${available} of these are available to reserve.`,
        );
      }

      const quantityReserved = batch.quantityReserved + input.quantity;
      this.assertVersionMatched(
        await tx.stockBatch.updateMany({
          where: {
            id: batch.id,
            organizationId: context.organizationId,
            version: batch.version,
          },
          data: { quantityReserved, version: { increment: 1 } },
        }),
        "stock level",
      );

      await this.writeMovement(tx, context, {
        productVariantId: variant.id,
        stockLocationId: location.id,
        stockBatchId: batch.id,
        movementType: "reserve",
        quantity: input.quantity,
        reason: optionalReason(input.reason),
      });
      await this.writeAudit(tx, context, {
        action: "inventory.stock_reserved",
        entityType: "stock_batch",
        entityId: batch.id,
        before: batchSnapshot(batch),
        after: batchSnapshot({
          quantityOnHand: batch.quantityOnHand,
          quantityReserved,
        }),
      });

      return this.balanceFor(tx, context.organizationId, variant, location.id);
    });
  }

  /**
   * Release a reservation. A reservation is not a stored entity, so the path id
   * names the product whose reservation is being released and the body says
   * where and how much; a body that disagrees with the path is refused rather
   * than silently preferred.
   */
  async releaseStock(
    context: InventoryActorContext,
    productVariantId: string,
    input: ReleaseStockData,
  ): Promise<StockBalance> {
    if (input.productVariantId !== productVariantId) {
      throw validationError(
        "productVariantId",
        "The product in the body must match the one in the path.",
      );
    }

    return this.runQuantityMutation(async (tx) => {
      const variant = await this.loadQuantityVariant(
        tx,
        context.organizationId,
        productVariantId,
        `${SERIALIZED_COUNTER_HINT} Release a handset by transitioning that unit back to available.`,
      );
      const location = await this.resolveWritableLocation(
        tx,
        context,
        input.stockLocationId,
        "stockLocationId",
      );

      const batch = await this.lockBatch(
        tx,
        context.organizationId,
        variant.id,
        location.id,
      );
      if (batch === null) {
        throw insufficientStockError("There is no stock at this location.");
      }
      if (batch.quantityReserved < input.quantity) {
        throw insufficientStockError(
          `Only ${batch.quantityReserved} of these are reserved.`,
        );
      }

      const quantityReserved = batch.quantityReserved - input.quantity;
      this.assertVersionMatched(
        await tx.stockBatch.updateMany({
          where: {
            id: batch.id,
            organizationId: context.organizationId,
            version: batch.version,
          },
          data: { quantityReserved, version: { increment: 1 } },
        }),
        "stock level",
      );

      await this.writeMovement(tx, context, {
        productVariantId: variant.id,
        stockLocationId: location.id,
        stockBatchId: batch.id,
        movementType: "release",
        quantity: input.quantity,
        reason: optionalReason(input.reason),
      });
      await this.writeAudit(tx, context, {
        action: "inventory.stock_released",
        entityType: "stock_batch",
        entityId: batch.id,
        before: batchSnapshot(batch),
        after: batchSnapshot({
          quantityOnHand: batch.quantityOnHand,
          quantityReserved,
        }),
      });

      return this.balanceFor(tx, context.organizationId, variant, location.id);
    });
  }

  /**
   * Move quantity stock between two locations.
   *
   * Both sides move in ONE transaction and produce BOTH ledger rows: a
   * transfer_out at the source and a transfer_in at the destination. Stock is
   * never in flight across a commit boundary, so it can never be counted twice
   * or vanish between them.
   */
  async transferStock(
    context: InventoryActorContext,
    input: TransferStockData,
  ): Promise<StockBalancePage> {
    return this.runQuantityMutation(async (tx) => {
      const variant = await this.loadQuantityVariant(
        tx,
        context.organizationId,
        input.productVariantId,
        `${SERIALIZED_COUNTER_HINT} Transfer a handset by its unit id.`,
      );
      const [from, to] = await Promise.all([
        this.resolveWritableLocation(
          tx,
          context,
          input.fromStockLocationId,
          "fromStockLocationId",
        ),
        this.resolveWritableLocation(
          tx,
          context,
          input.toStockLocationId,
          "toStockLocationId",
        ),
      ]);

      const locked = await this.lockBatchesForTransfer(
        tx,
        context.organizationId,
        variant.id,
        from.id,
        to.id,
      );
      const source = locked.find((batch) => batch.stockLocationId === from.id);
      if (source === undefined) {
        throw insufficientStockError(
          "There is no stock at the source location.",
        );
      }

      // Reserved stock is spoken for where it stands; moving it would break the
      // reservation without telling whoever holds it.
      const available = source.quantityOnHand - source.quantityReserved;
      if (available < input.quantity) {
        throw insufficientStockError(
          `Only ${available} of these are available to transfer.`,
        );
      }

      const destination =
        locked.find((batch) => batch.stockLocationId === to.id) ??
        (await this.createBatch(tx, context, variant.id, to.id));

      const sourceOnHand = source.quantityOnHand - input.quantity;
      const destinationOnHand = destination.quantityOnHand + input.quantity;
      this.assertVersionMatched(
        await tx.stockBatch.updateMany({
          where: {
            id: source.id,
            organizationId: context.organizationId,
            version: source.version,
          },
          data: { quantityOnHand: sourceOnHand, version: { increment: 1 } },
        }),
        "stock level",
      );
      this.assertVersionMatched(
        await tx.stockBatch.updateMany({
          where: {
            id: destination.id,
            organizationId: context.organizationId,
            version: destination.version,
          },
          data: {
            quantityOnHand: destinationOnHand,
            version: { increment: 1 },
          },
        }),
        "stock level",
      );

      const reason = optionalReason(input.reason);
      await this.writeMovement(tx, context, {
        productVariantId: variant.id,
        stockLocationId: from.id,
        stockBatchId: source.id,
        movementType: "transfer_out",
        quantity: input.quantity,
        reason,
      });
      await this.writeMovement(tx, context, {
        productVariantId: variant.id,
        stockLocationId: to.id,
        stockBatchId: destination.id,
        movementType: "transfer_in",
        quantity: input.quantity,
        reason,
      });
      await this.writeAudit(tx, context, {
        action: "inventory.stock_transferred",
        entityType: "stock_batch",
        entityId: source.id,
        before: {
          from: batchSnapshot(source),
          to: batchSnapshot(destination),
        },
        after: {
          from: batchSnapshot({
            quantityOnHand: sourceOnHand,
            quantityReserved: source.quantityReserved,
          }),
          to: batchSnapshot({
            quantityOnHand: destinationOnHand,
            quantityReserved: destination.quantityReserved,
          }),
        },
      });

      const balances = [
        await this.balanceFor(tx, context.organizationId, variant, from.id),
        await this.balanceFor(tx, context.organizationId, variant, to.id),
      ];
      return inventoryResponse(
        StockBalancePageSchema,
        pageEnvelope(balances, 1, balances.length, balances.length),
      );
    });
  }

  // ===========================================================================
  // Serialized mutations
  // ===========================================================================

  /**
   * Move one serialized unit's lifecycle state.
   *
   * The stored state is authoritative — the caller never asserts a `fromState`,
   * so it cannot describe a lifecycle that never happened. The row is locked
   * FOR UPDATE first (13_ §22) so two staff members cannot take the same
   * handset, and only then is the transition judged.
   */
  async transitionSerializedUnit(
    context: InventoryActorContext,
    id: string,
    input: TransitionSerializedUnitData,
  ): Promise<SerializedUnitDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const locked = await this.lockSerializedUnit(tx, context, id);
      this.assertTransitionAllowed(locked.state, input.toState);

      const current = await this.loadSerializedUnit(
        tx,
        context.organizationId,
        id,
      );
      this.assertVersionMatched(
        await tx.serializedUnit.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: { state: input.toState, version: { increment: 1 } },
        }),
        "serialized unit",
      );

      const movementType = this.movementTypeForTransition(
        locked.state,
        input.toState,
      );
      if (movementType !== null) {
        await this.writeMovement(tx, context, {
          productVariantId: locked.productVariantId,
          stockLocationId: locked.stockLocationId,
          serializedUnitId: id,
          movementType,
          quantity: 1,
          fromState: locked.state,
          toState: input.toState,
          reason: optionalReason(input.reason),
        });
      }

      const unit = await this.loadSerializedUnit(
        tx,
        context.organizationId,
        id,
      );
      await this.writeAudit(tx, context, {
        action: "inventory.unit_transitioned",
        entityType: "serialized_unit",
        entityId: id,
        before: serializedUnitSnapshot(current),
        after: serializedUnitSnapshot(unit),
      });
      return this.toSerializedUnitDetail(unit);
    });
  }

  /**
   * Refuse a transition the lifecycle does not allow.
   *
   * The two specific codes come first because they are the ones a salesperson
   * can act on: "someone already sold it" and "it is not on the shelf" are
   * different problems with different answers. Everything else is reported as
   * the generic refusal, including the rule that a sold unit may only move to
   * returned_inspection — a returned phone cannot skip inspection (05_RULES §3).
   */
  private assertTransitionAllowed(
    from: SerializedStockState,
    to: SerializedStockState,
  ): void {
    if (to === "sold") {
      // Stock is sold by the sales workflow, which owns the money side of it.
      // Letting inventory post a sale would produce stock movement with no sale.
      throw directEditBlockedError(
        "A unit is marked sold by completing a sale, not by an inventory transition.",
      );
    }
    if (to === RESERVED_STATE) {
      if (from === "sold") {
        throw new DomainError(
          ERROR_CODES.INVENTORY_UNIT_ALREADY_SOLD,
          "This unit has already been sold.",
        );
      }
      if (from !== "available") {
        throw new DomainError(
          ERROR_CODES.INVENTORY_UNIT_NOT_AVAILABLE,
          "This unit is not available to reserve.",
        );
      }
    }
    if (!isTransitionAllowed(from, to)) {
      throw new DomainError(
        ERROR_CODES.INVENTORY_INVALID_STATE_TRANSITION,
        `A unit cannot move from ${from} to ${to}.`,
        { details: { toState: [`A unit cannot move from ${from} to ${to}.`] } },
      );
    }
  }

  /**
   * The ledger row a lifecycle transition produces, or null when it produces
   * none.
   *
   * A movement's direction is published as MOVEMENT_ON_HAND_SIGN, so the type
   * chosen here has to be true of the on-hand change the transition actually
   * makes — a later slice replays this ledger. `reserve`/`release` are the two
   * types that move nothing on hand, and they are exactly the two transitions
   * that move a unit between available and reserved. Every other transition is
   * judged by whether the unit entered or left ON_HAND_STOCK_STATES: crossing
   * that line is an adjustment in or out, and a move that stays on the same
   * side of it (available -> quarantined, say) changes no quantity at all, so
   * it writes no ledger row and is recorded by the audit event alone.
   */
  private movementTypeForTransition(
    from: SerializedStockState,
    to: SerializedStockState,
  ): "reserve" | "release" | "adjustment_in" | "adjustment_out" | null {
    if (from === "available" && to === RESERVED_STATE) return "reserve";
    if (from === RESERVED_STATE && to === "available") return "release";

    const wasOnHand = ON_HAND_STOCK_STATES.includes(from);
    const isOnHand = ON_HAND_STOCK_STATES.includes(to);
    if (wasOnHand === isOnHand) return null;
    return isOnHand ? "adjustment_in" : "adjustment_out";
  }

  /**
   * Move one serialized unit to another location. State does not change, so the
   * two ledger rows are a plain transfer_out and transfer_in — the only pair
   * whose published signs describe exactly this.
   */
  async transferSerializedUnit(
    context: InventoryActorContext,
    id: string,
    input: TransferSerializedUnitData,
  ): Promise<SerializedUnitDetail> {
    return this.prisma.client.$transaction(async (tx) => {
      const locked = await this.lockSerializedUnit(tx, context, id);
      if (locked.stockLocationId === input.toStockLocationId) {
        throw validationError(
          "toStockLocationId",
          "Choose a destination different from the unit's current location.",
        );
      }
      if (locked.state === "sold") {
        throw new DomainError(
          ERROR_CODES.INVENTORY_UNIT_ALREADY_SOLD,
          "This unit has already been sold.",
        );
      }
      if (!ON_HAND_STOCK_STATES.includes(locked.state)) {
        throw new DomainError(
          ERROR_CODES.INVENTORY_UNIT_NOT_AVAILABLE,
          "This unit is not in stock, so it cannot be moved.",
        );
      }

      const destination = await this.resolveWritableLocation(
        tx,
        context,
        input.toStockLocationId,
        "toStockLocationId",
      );
      const current = await this.loadSerializedUnit(
        tx,
        context.organizationId,
        id,
      );

      this.assertVersionMatched(
        await tx.serializedUnit.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            version: input.version,
          },
          data: {
            stockLocationId: destination.id,
            version: { increment: 1 },
          },
        }),
        "serialized unit",
      );

      const reason = optionalReason(input.reason);
      await this.writeMovement(tx, context, {
        productVariantId: locked.productVariantId,
        stockLocationId: locked.stockLocationId,
        serializedUnitId: id,
        movementType: "transfer_out",
        quantity: 1,
        fromState: locked.state,
        toState: locked.state,
        reason,
      });
      await this.writeMovement(tx, context, {
        productVariantId: locked.productVariantId,
        stockLocationId: destination.id,
        serializedUnitId: id,
        movementType: "transfer_in",
        quantity: 1,
        fromState: locked.state,
        toState: locked.state,
        reason,
      });

      const unit = await this.loadSerializedUnit(
        tx,
        context.organizationId,
        id,
      );
      await this.writeAudit(tx, context, {
        action: "inventory.unit_transferred",
        entityType: "serialized_unit",
        entityId: id,
        before: serializedUnitSnapshot(current),
        after: serializedUnitSnapshot(unit),
      });
      return this.toSerializedUnitDetail(unit);
    });
  }

  // ===========================================================================
  // Shared write plumbing
  // ===========================================================================

  /**
   * Every quantity mutation runs inside one transaction and reports a database
   * stock fault as the same stable code the API's own checks produce.
   */
  private async runQuantityMutation<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.client.$transaction(operation);
    } catch (error) {
      this.rethrowStockConstraint(error);
    }
  }

  /**
   * Resolve a variant that this module is allowed to move a counter for.
   *
   * A serialized variant is refused here rather than deeper down: its count is
   * a consequence of its unit rows, so a quantity written against it would be a
   * number with no handset behind it.
   */
  private async loadQuantityVariant(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productVariantId: string,
    hint: string,
  ): Promise<VariantRow> {
    const variant = await tx.productVariant.findFirst({
      where: { id: productVariantId, organizationId },
      select: { id: true, sku: true, name: true, trackingType: true },
    });
    if (variant === null) throw notFoundError("product");
    if (variant.trackingType === "serialized")
      throw directEditBlockedError(hint);
    return variant;
  }

  /**
   * A location a write may target: in this tenant AND in the session's branch.
   *
   * Scoping the write to the session branch is what keeps a unit's branch in
   * agreement with its location's branch, which the composite foreign key
   * enforces in SQL. A location in another branch reports the same 422 as one
   * that does not exist.
   */
  private async resolveWritableLocation(
    tx: Prisma.TransactionClient,
    context: InventoryActorContext,
    stockLocationId: string,
    field: string,
  ): Promise<{ readonly id: string }> {
    const location = await tx.stockLocation.findFirst({
      where: {
        id: stockLocationId,
        organizationId: context.organizationId,
        branchId: context.branchId,
        isActive: true,
      },
      select: { id: true },
    });
    if (location === null) {
      throw validationError(
        field,
        "Select an active stock location from this branch.",
      );
    }
    return location;
  }

  /**
   * Take a real row lock on the batch (13_ §22).
   *
   * The lock is what makes read-check-write safe: without it two transactions
   * both read "5 available", both subtract 3, and the second silently pushes
   * the row negative for the CHECK constraint to catch as a 500.
   */
  private async lockBatch(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productVariantId: string,
    stockLocationId: string,
  ): Promise<LockedBatch | null> {
    const rows = await tx.$queryRaw<readonly LockedBatch[]>`
      SELECT id,
             stock_location_id AS "stockLocationId",
             quantity_on_hand AS "quantityOnHand",
             quantity_reserved AS "quantityReserved",
             version
        FROM stock_batches
       WHERE organization_id = ${organizationId}::uuid
         AND product_variant_id = ${productVariantId}::uuid
         AND stock_location_id = ${stockLocationId}::uuid
       FOR UPDATE`;
    return rows[0] ?? null;
  }

  private async lockOrCreateBatch(
    tx: Prisma.TransactionClient,
    context: InventoryActorContext,
    productVariantId: string,
    stockLocationId: string,
    createWhenMissing: boolean,
  ): Promise<LockedBatch | null> {
    const batch = await this.lockBatch(
      tx,
      context.organizationId,
      productVariantId,
      stockLocationId,
    );
    if (batch !== null || !createWhenMissing) return batch;
    return this.createBatch(tx, context, productVariantId, stockLocationId);
  }

  /** A brand new batch starts empty; the movement is what puts stock in it. */
  private async createBatch(
    tx: Prisma.TransactionClient,
    context: InventoryActorContext,
    productVariantId: string,
    stockLocationId: string,
  ): Promise<LockedBatch> {
    const created = await tx.stockBatch.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        productVariantId,
        stockLocationId,
      },
      select: {
        id: true,
        stockLocationId: true,
        quantityOnHand: true,
        quantityReserved: true,
        version: true,
      },
    });
    return created;
  }

  /**
   * Lock both sides of a transfer in one statement, ordered by location id.
   *
   * The order is the point: two transfers running in opposite directions over
   * the same pair of locations would otherwise each hold the row the other
   * wants and deadlock. Ordering by a value both agree on makes that impossible.
   */
  private async lockBatchesForTransfer(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productVariantId: string,
    fromStockLocationId: string,
    toStockLocationId: string,
  ): Promise<readonly LockedBatch[]> {
    return tx.$queryRaw<readonly LockedBatch[]>`
      SELECT id,
             stock_location_id AS "stockLocationId",
             quantity_on_hand AS "quantityOnHand",
             quantity_reserved AS "quantityReserved",
             version
        FROM stock_batches
       WHERE organization_id = ${organizationId}::uuid
         AND product_variant_id = ${productVariantId}::uuid
         AND stock_location_id IN (${fromStockLocationId}::uuid, ${toStockLocationId}::uuid)
       ORDER BY stock_location_id ASC
       FOR UPDATE`;
  }

  /**
   * Take a real row lock on one named handset (13_ §22), then let the caller
   * re-check the state it just locked. Naming the unit is what makes the check
   * meaningful: two staff members racing for the same IMEI serialize here, and
   * the loser is told the unit is gone rather than overwriting the winner.
   */
  private async lockSerializedUnit(
    tx: Prisma.TransactionClient,
    context: InventoryActorContext,
    id: string,
  ): Promise<LockedUnit> {
    const rows = await tx.$queryRaw<readonly LockedUnit[]>`
      SELECT id,
             product_variant_id AS "productVariantId",
             stock_location_id AS "stockLocationId",
             state::text AS "state",
             version
        FROM serialized_units
       WHERE id = ${id}::uuid
         AND organization_id = ${context.organizationId}::uuid
         AND branch_id = ${context.branchId}::uuid
       FOR UPDATE`;
    const unit = rows[0];
    if (unit === undefined) throw notFoundError("serialized unit");
    return unit;
  }

  private async loadSerializedUnit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<SerializedUnitDetailRecord> {
    const unit = await tx.serializedUnit.findFirst({
      where: { id, organizationId },
      select: serializedUnitDetailSelect,
    });
    if (unit === null) throw notFoundError("serialized unit");
    return unit;
  }

  /**
   * The balance after a write, derived exactly the way the list derives it: off
   * the batch row for quantity stock, off the unit rows for serialized stock.
   */
  private async balanceFor(
    tx: Prisma.TransactionClient,
    organizationId: string,
    variant: VariantRow,
    stockLocationId: string,
  ): Promise<StockBalance> {
    const location = await tx.stockLocation.findFirst({
      where: { id: stockLocationId, organizationId },
      select: { id: true, name: true },
    });
    if (location === null) throw notFoundError("stock location");

    const counts = await this.countStock(
      tx,
      organizationId,
      variant,
      stockLocationId,
    );

    return inventoryResponse(StockBalanceSchema, {
      productVariant: { id: variant.id, sku: variant.sku, name: variant.name },
      locationId: location.id,
      locationName: location.name,
      trackingType: variant.trackingType,
      onHand: counts.onHand,
      reserved: counts.reserved,
      available: counts.onHand - counts.reserved,
    });
  }

  /**
   * The same two numbers the balance list derives, for one variant at one
   * location. Serialized stock is counted from its unit rows — `reserved` is a
   * subset of the on-hand states, which is what keeps `reserved <= onHand` true
   * — and quantity stock is read straight off its batch row.
   */
  private async countStock(
    tx: Prisma.TransactionClient,
    organizationId: string,
    variant: VariantRow,
    stockLocationId: string,
  ): Promise<{ readonly onHand: number; readonly reserved: number }> {
    if (variant.trackingType === "serialized") {
      const [onHand, reserved] = await Promise.all([
        tx.serializedUnit.count({
          where: {
            organizationId,
            productVariantId: variant.id,
            stockLocationId,
            state: { in: [...ON_HAND_STOCK_STATES] },
          },
        }),
        tx.serializedUnit.count({
          where: {
            organizationId,
            productVariantId: variant.id,
            stockLocationId,
            state: RESERVED_STATE,
          },
        }),
      ]);
      return { onHand, reserved };
    }

    const batch = await tx.stockBatch.findFirst({
      where: { organizationId, productVariantId: variant.id, stockLocationId },
      select: { quantityOnHand: true, quantityReserved: true },
    });
    return {
      onHand: batch?.quantityOnHand ?? 0,
      reserved: batch?.quantityReserved ?? 0,
    };
  }

  /**
   * Append one ledger row. The table revokes UPDATE and DELETE, so this is the
   * only thing that can ever happen to a movement: a correction is a new,
   * compensating movement, never an edit of the old one.
   */
  private async writeMovement(
    tx: Prisma.TransactionClient,
    context: InventoryActorContext,
    movement: {
      readonly productVariantId: string;
      readonly stockLocationId: string;
      readonly serializedUnitId?: string;
      readonly stockBatchId?: string;
      readonly movementType: Prisma.InventoryMovementCreateInput["movementType"];
      readonly quantity: number;
      readonly fromState?: SerializedStockState;
      readonly toState?: SerializedStockState;
      readonly referenceType?: string;
      readonly reason: string | null;
    },
  ): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        productVariantId: movement.productVariantId,
        stockLocationId: movement.stockLocationId,
        serializedUnitId: movement.serializedUnitId ?? null,
        stockBatchId: movement.stockBatchId ?? null,
        movementType: movement.movementType,
        quantity: movement.quantity,
        fromState: movement.fromState ?? null,
        toState: movement.toState ?? null,
        referenceType: movement.referenceType ?? null,
        reason: movement.reason,
        actorUserId: context.actorUserId,
      },
    });
  }

  /** A create simply has no before-state; every other mutation carries one. */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    context: InventoryActorContext,
    event: {
      readonly action: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly before?: Prisma.InputJsonObject;
      readonly after: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        ...(event.before === undefined ? {} : { beforeSnapshot: event.before }),
        afterSnapshot: event.after,
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }

  /**
   * The optimistic lock. The guard belongs in the WHERE clause of the write
   * itself: a read-then-write comparison would leave a window in which another
   * transaction commits between the two statements and is silently overwritten.
   */
  private assertVersionMatched(
    result: { readonly count: number },
    label: string,
  ): void {
    if (result.count === 0) throw optimisticLockError(label);
  }

  // ===========================================================================
  // Response mapping
  // ===========================================================================

  private toStockLocationReference(
    location: Prisma.StockLocationGetPayload<{
      select: typeof stockLocationReferenceSelect;
    }>,
  ): StockLocationReference {
    return inventoryResponse(StockLocationReferenceSchema, {
      id: location.id,
      name: location.name,
      code: location.code,
      locationType: location.kind,
      isActive: location.isActive,
      version: location.version,
    });
  }

  private serializedUnitValue(unit: SerializedUnitSummaryRecord) {
    return {
      id: unit.id,
      productVariant: unit.productVariant,
      stockLocation: unit.stockLocation,
      state: unit.state,
      condition: unit.condition,
      ptaStatus: unit.ptaStatus,
      identifiers: unit.identifiers.map((identifier) => ({
        type: identifier.identifierType,
        value: identifier.normalizedValue,
      })),
      receivedAt: unit.receivedAt?.toISOString() ?? null,
      version: unit.version,
    };
  }

  private toSerializedUnitDetail(
    unit: SerializedUnitDetailRecord,
  ): SerializedUnitDetail {
    return inventoryResponse(SerializedUnitDetailSchema, {
      ...this.serializedUnitValue(unit),
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    });
  }

  private toMovement(movement: MovementRecord) {
    return {
      id: movement.id,
      productVariant: movement.productVariant,
      stockLocationId: movement.stockLocationId,
      serializedUnitId: movement.serializedUnitId,
      stockBatchId: movement.stockBatchId,
      movementType: movement.movementType,
      quantity: movement.quantity,
      fromState: movement.fromState,
      toState: movement.toState,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      reason: movement.reason,
      occurredAt: movement.occurredAt.toISOString(),
    };
  }

  // ===========================================================================
  // Database faults mapped to stable codes
  // ===========================================================================

  private rethrowLocationDuplicate(error: unknown): never {
    if (this.isPrismaError(error, "P2002")) {
      const message = "A stock location with this code already exists.";
      throw new DomainError(ERROR_CODES.CONFLICT, message, {
        details: { code: [message] },
        cause: error,
      });
    }
    this.rethrowUnexpected(error);
  }

  /**
   * The database is the final backstop for stock invariants, and it is allowed
   * to win a race the API checked first — two transactions can each see enough
   * stock and only the CHECK sees the total. Report that as the same stable
   * code the API's own check produces rather than letting a raw 23514 out as a
   * 500. Matched on the constraint names 0007 creates, because a broad match on
   * the SQLSTATE would misreport every unrelated CHECK as a stock problem.
   */
  private rethrowStockConstraint(error: unknown): never {
    const failure = error as {
      readonly message?: unknown;
      readonly meta?: unknown;
    };
    const message = typeof failure?.message === "string" ? failure.message : "";
    const text = `${message} ${JSON.stringify(failure?.meta ?? {})}`;

    if (
      text.includes("stock_batches_quantity_on_hand_non_negative") ||
      text.includes("stock_batches_quantity_reserved_valid")
    ) {
      throw new DomainError(
        ERROR_CODES.INVENTORY_NEGATIVE_STOCK_BLOCKED,
        "That would take this stock below zero. Reload the stock level and try again.",
        { cause: error },
      );
    }
    if (this.isPrismaError(error, "P2002")) {
      throw new DomainError(
        ERROR_CODES.CONFLICT,
        "This stock was changed by someone else at the same time. Try again.",
        { cause: error },
      );
    }
    this.rethrowUnexpected(error);
  }

  private rethrowUnexpected(error: unknown): never {
    if (error instanceof Error) throw error;
    throw new Error("Inventory database operation failed", { cause: error });
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is { readonly code: string; readonly meta?: unknown } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    );
  }
}
