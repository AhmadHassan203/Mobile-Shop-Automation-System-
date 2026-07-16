import { Injectable } from "@nestjs/common";
import { Prisma } from "@mobileshop/database";
import {
  canonicalizeCatalogAlias,
  DomainError,
  ERROR_CODES,
  normalizeSerial,
  PosSellablePageSchema,
  PRICING_CONTRACT_LIMITS,
  VariantDefaultPriceResponseSchema,
  type PosQuantityLocationChoice,
  type PosSellableItem,
  type PosSellableLookupQuery,
  type PosSellablePage,
  type PosSerializedUnitChoice,
  type SetVariantDefaultPriceInput,
  type VariantDefaultPriceResponse,
} from "@mobileshop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";

export interface PricingActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly currency: string;
  readonly actorUserId: string;
  readonly metadata: AuthRequestMetadata;
  /** Null means every active location in the authenticated branch is readable. */
  readonly allowedLocationIds: readonly string[] | null;
}

const variantDefaultPriceSelect = {
  id: true,
  defaultPriceMinor: true,
  minPriceMinor: true,
  version: true,
  updatedAt: true,
} satisfies Prisma.ProductVariantSelect;

type VariantDefaultPriceRecord = Prisma.ProductVariantGetPayload<{
  select: typeof variantDefaultPriceSelect;
}>;

interface PricedVariantRow {
  readonly productVariantId: string;
  readonly sku: string;
  readonly name: string;
  readonly brandName: string;
  readonly modelName: string;
  readonly categoryName: string;
  readonly trackingType: "quantity" | "serialized";
  readonly condition: PosSellableItem["condition"];
  readonly ptaStatus: PosSellableItem["ptaStatus"];
  readonly productVersion: number;
  readonly unitPriceMinor: bigint;
  readonly minimumUnitPriceMinor: bigint;
  readonly priceSource: "price_rule" | "variant_default";
  readonly priceSourceId: string | null;
  readonly priceVersion: number;
  readonly priceEffectiveAt: Date;
  readonly hasSaleableStock: boolean;
}

interface QuantityChoiceRow {
  readonly productVariantId: string;
  readonly stockLocationId: string;
  readonly locationCode: string;
  readonly locationName: string;
  readonly availableQuantity: number;
  readonly stockVersion: number;
}

interface SerializedChoiceRow {
  readonly productVariantId: string;
  readonly serializedUnitId: string;
  readonly unitVersion: number;
  readonly stockLocationId: string;
  readonly locationCode: string;
  readonly locationName: string;
  readonly condition: PosSerializedUnitChoice["condition"];
  readonly ptaStatus: PosSerializedUnitChoice["ptaStatus"];
  readonly identifiers: PosSerializedUnitChoice["identifiers"];
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function safeInteger(
  value: bigint | number,
  label: string,
  minimum = 0,
): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < minimum) {
    throw new Error(`${label} is outside the public safe-integer range.`);
  }
  return converted;
}

function isoDate(value: Date, label: string): string {
  if (!Number.isFinite(value.getTime()))
    throw new Error(`${label} is invalid.`);
  return value.toISOString();
}

function pricingResponse(value: unknown): PosSellablePage {
  const parsed = PosSellablePageSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error("Pricing response violated its public contract", {
    cause: parsed.error,
  });
}

function variantDefaultPriceResponse(
  value: unknown,
): VariantDefaultPriceResponse {
  const parsed = VariantDefaultPriceResponseSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error("Pricing response violated its public contract", {
    cause: parsed.error,
  });
}

function notFound(label: string): DomainError {
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

/** Audit only public price evidence; product cost is never selected or stored. */
function defaultPriceSnapshot(
  record: VariantDefaultPriceRecord,
): Prisma.InputJsonObject {
  return {
    unitPriceMinor:
      record.defaultPriceMinor === null
        ? null
        : safeInteger(record.defaultPriceMinor, "default unit price"),
    minimumUnitPriceMinor:
      record.minPriceMinor === null
        ? null
        : safeInteger(record.minPriceMinor, "minimum unit price"),
    productVersion: safeInteger(record.version, "product version", 1),
  };
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set the organization fallback price with the same product-version lock used
   * by catalog edits. The audit entry commits atomically with the price change.
   */
  async setVariantDefaultPrice(
    context: PricingActorContext,
    productVariantId: string,
    input: SetVariantDefaultPriceInput,
  ): Promise<VariantDefaultPriceResponse> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await tx.productVariant.findFirst({
        where: {
          id: productVariantId,
          organizationId: context.organizationId,
        },
        select: variantDefaultPriceSelect,
      });
      if (current === null) throw notFound("product");

      const update = await tx.productVariant.updateMany({
        where: {
          id: productVariantId,
          organizationId: context.organizationId,
          version: input.productVersion,
        },
        data: {
          defaultPriceMinor: BigInt(input.unitPriceMinor),
          minPriceMinor: BigInt(input.minimumUnitPriceMinor),
          version: { increment: 1 },
        },
      });
      if (update.count === 0) throw optimisticLockError("product");

      const updated = await tx.productVariant.findFirst({
        where: {
          id: productVariantId,
          organizationId: context.organizationId,
        },
        select: variantDefaultPriceSelect,
      });
      if (updated === null) throw notFound("product");
      if (
        updated.defaultPriceMinor === null ||
        updated.minPriceMinor === null
      ) {
        throw new Error("The saved default price could not be read back.");
      }

      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          actorUserId: context.actorUserId,
          action: "pricing.variant_default_price_set",
          entityType: "product_variant",
          entityId: productVariantId,
          beforeSnapshot: defaultPriceSnapshot(current),
          afterSnapshot: defaultPriceSnapshot(updated),
          requestId: context.metadata.requestId,
          ipAddress: context.metadata.ipAddress,
          userAgent: context.metadata.userAgent,
        },
      });

      return variantDefaultPriceResponse({
        productVariantId,
        effectivePrice: {
          currency: context.currency,
          unitPriceMinor: safeInteger(
            updated.defaultPriceMinor,
            "default unit price",
          ),
          minimumUnitPriceMinor: safeInteger(
            updated.minPriceMinor,
            "minimum unit price",
          ),
          source: "variant_default",
          sourceId: null,
          version: safeInteger(updated.version, "product version", 1),
          effectiveAt: isoDate(updated.updatedAt, "default price update date"),
        },
      });
    });
  }

  /**
   * The POS read model intentionally begins with priced active variants, not
   * inventory rows. That preserves a priced catalog row when its scoped stock
   * is empty, allowing the caller to render the prototype's explicit OOS state.
   */
  async posLookup(
    context: PricingActorContext,
    query: PosSellableLookupQuery,
  ): Promise<PosSellablePage> {
    await this.assertReadableLocation(context, query.locationId);

    const now = new Date();
    const source = this.pricedVariantSource(context, query, now);
    const offset = (query.page - 1) * query.pageSize;
    const [totals, rows] = await this.prisma.client.$transaction([
      this.prisma.client.$queryRaw<readonly { readonly total: number }[]>(
        Prisma.sql`${source} SELECT COUNT(*)::int AS "total" FROM priced_variants`,
      ),
      this.prisma.client.$queryRaw<readonly PricedVariantRow[]>(Prisma.sql`
        ${source}
        SELECT product_variant_id AS "productVariantId",
               sku,
               name,
               brand_name AS "brandName",
               model_name AS "modelName",
               category_name AS "categoryName",
               tracking_type AS "trackingType",
               condition,
               pta_status AS "ptaStatus",
               product_version AS "productVersion",
               unit_price_minor AS "unitPriceMinor",
               minimum_unit_price_minor AS "minimumUnitPriceMinor",
               price_source AS "priceSource",
               price_source_id AS "priceSourceId",
               price_version AS "priceVersion",
               price_effective_at AS "priceEffectiveAt",
               has_saleable_stock AS "hasSaleableStock"
          FROM priced_variants
         ORDER BY has_saleable_stock DESC, sku ASC, product_variant_id ASC
         LIMIT ${query.pageSize} OFFSET ${offset}`),
    ]);

    const quantityIds = rows
      .filter((row) => row.trackingType === "quantity")
      .map((row) => row.productVariantId);
    const serializedIds = rows
      .filter((row) => row.trackingType === "serialized")
      .map((row) => row.productVariantId);
    const [quantityRows, serializedRows] = await Promise.all([
      this.quantityChoices(context, quantityIds, query.locationId),
      this.serializedChoices(context, serializedIds, query.locationId),
    ]);

    const quantityByVariant = new Map<string, PosQuantityLocationChoice[]>();
    for (const row of quantityRows) {
      const choices = quantityByVariant.get(row.productVariantId) ?? [];
      choices.push({
        location: {
          id: row.stockLocationId,
          code: row.locationCode,
          name: row.locationName,
        },
        availableQuantity: safeInteger(
          row.availableQuantity,
          "available quantity",
          1,
        ),
        stockVersion: safeInteger(row.stockVersion, "stock version", 1),
      });
      quantityByVariant.set(row.productVariantId, choices);
    }

    const serializedByVariant = new Map<string, PosSerializedUnitChoice[]>();
    for (const row of serializedRows) {
      const choices = serializedByVariant.get(row.productVariantId) ?? [];
      choices.push({
        serializedUnitId: row.serializedUnitId,
        unitVersion: safeInteger(row.unitVersion, "unit version", 1),
        location: {
          id: row.stockLocationId,
          code: row.locationCode,
          name: row.locationName,
        },
        condition: row.condition,
        ptaStatus: row.ptaStatus,
        // Every value comes from device_identifiers. There is deliberately no
        // fallback that could turn a SKU, barcode, or placeholder into an IMEI.
        identifiers: row.identifiers,
      });
      serializedByVariant.set(row.productVariantId, choices);
    }

    const items: PosSellableItem[] = rows.map((row) => {
      const identity = {
        productVariantId: row.productVariantId,
        sku: row.sku,
        name: row.name,
        brandName: row.brandName,
        modelName: row.modelName,
        categoryName: row.categoryName,
        condition: row.condition,
        ptaStatus: row.ptaStatus,
        productVersion: safeInteger(row.productVersion, "product version", 1),
        effectivePrice: {
          currency: context.currency,
          unitPriceMinor: safeInteger(row.unitPriceMinor, "unit price"),
          minimumUnitPriceMinor: safeInteger(
            row.minimumUnitPriceMinor,
            "minimum unit price",
          ),
          source: row.priceSource,
          sourceId: row.priceSourceId,
          version: safeInteger(row.priceVersion, "price version", 1),
          effectiveAt: isoDate(row.priceEffectiveAt, "effective price date"),
        },
      } as const;

      if (row.trackingType === "quantity") {
        const choices = quantityByVariant.get(row.productVariantId) ?? [];
        return {
          ...identity,
          trackingType: "quantity",
          stock:
            choices.length === 0
              ? { availability: "out_of_stock" }
              : { availability: "saleable", locationChoices: choices },
        };
      }

      const choices = serializedByVariant.get(row.productVariantId) ?? [];
      return {
        ...identity,
        trackingType: "serialized",
        stock:
          choices.length === 0
            ? { availability: "out_of_stock" }
            : { availability: "saleable", serializedUnitChoices: choices },
      };
    });

    return pricingResponse({
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: totals[0]?.total ?? 0,
      totalPages: Math.ceil((totals[0]?.total ?? 0) / query.pageSize),
    });
  }

  /**
   * Resolve a rule at the request instant. A current-branch entry wins over an
   * organization default; within one scope the newest effective immutable row
   * wins. With no active entry, the variant's own default remains authoritative.
   */
  private pricedVariantSource(
    context: PricingActorContext,
    query: PosSellableLookupQuery,
    now: Date,
  ): Prisma.Sql {
    const filters: Prisma.Sql[] = [];
    if (query.trackingType !== undefined) {
      filters.push(Prisma.sql`v.tracking_type::text = ${query.trackingType}`);
    }
    if (query.q !== undefined) {
      const displayLike = `%${escapeLikePattern(query.q)}%`;
      const aliasLike = `%${escapeLikePattern(
        canonicalizeCatalogAlias(query.q),
      )}%`;
      const normalizedIdentifier = normalizeSerial(query.q);
      const identifierLocationScope = this.locationScope(
        Prisma.sql`search_unit.stock_location_id`,
        context,
        query.locationId,
      );
      filters.push(Prisma.sql`(
           v.sku ILIKE ${displayLike}
        OR v.name ILIKE ${displayLike}
        OR model.name ILIKE ${displayLike}
        OR brand.name ILIKE ${displayLike}
        OR category.name ILIKE ${displayLike}
        OR EXISTS (
             SELECT 1
               FROM product_aliases alias
              WHERE alias.organization_id = ${context.organizationId}::uuid
                AND alias.product_variant_id = v.id
                AND alias.is_active = TRUE
                AND alias.normalized_alias ILIKE ${aliasLike}
           )
        OR EXISTS (
             SELECT 1
               FROM product_barcodes barcode
              WHERE barcode.organization_id = ${context.organizationId}::uuid
                AND barcode.product_variant_id = v.id
                AND barcode.is_active = TRUE
                AND barcode.barcode ILIKE ${displayLike}
           )
        ${
          normalizedIdentifier === null
            ? Prisma.empty
            : Prisma.sql`OR EXISTS (
                 SELECT 1
                   FROM serialized_units search_unit
                   JOIN stock_locations search_location
                     ON search_location.id = search_unit.stock_location_id
                    AND search_location.organization_id = ${context.organizationId}::uuid
                    AND search_location.branch_id = ${context.branchId}::uuid
                    AND search_location.is_active = TRUE
                   JOIN device_identifiers search_identifier
                     ON search_identifier.serialized_unit_id = search_unit.id
                    AND search_identifier.organization_id = ${context.organizationId}::uuid
                  WHERE search_unit.organization_id = ${context.organizationId}::uuid
                    AND search_unit.branch_id = ${context.branchId}::uuid
                    AND search_unit.product_variant_id = v.id
                    AND search_unit.state::text = 'available'
                    AND ${identifierLocationScope}
                    AND search_identifier.normalized_value ILIKE ${`%${escapeLikePattern(normalizedIdentifier)}%`}
               )`
        }
      )`);
    }

    const quantityLocationScope = this.locationScope(
      Prisma.sql`saleable_batch.stock_location_id`,
      context,
      query.locationId,
    );
    const serializedLocationScope = this.locationScope(
      Prisma.sql`saleable_unit.stock_location_id`,
      context,
      query.locationId,
    );

    return Prisma.sql`
      WITH priced_variants AS (
        SELECT v.id AS product_variant_id,
               v.sku,
               v.name,
               brand.name AS brand_name,
               model.name AS model_name,
               category.name AS category_name,
               v.tracking_type::text AS tracking_type,
               v.condition::text AS condition,
               v.pta_status::text AS pta_status,
               v.version AS product_version,
               COALESCE(rule.price_minor, v.default_price_minor)::bigint
                 AS unit_price_minor,
               COALESCE(rule.min_price_minor, v.min_price_minor, 0)::bigint
                 AS minimum_unit_price_minor,
               CASE WHEN rule.id IS NULL THEN 'variant_default'
                    ELSE 'price_rule' END AS price_source,
               rule.id AS price_source_id,
               CASE WHEN rule.id IS NULL THEN v.version ELSE 1 END
                 AS price_version,
               COALESCE(rule.effective_from, v.updated_at)
                 AS price_effective_at,
               CASE v.tracking_type::text
                 WHEN 'quantity' THEN EXISTS (
                   SELECT 1
                     FROM stock_batches saleable_batch
                     JOIN stock_locations saleable_location
                       ON saleable_location.id = saleable_batch.stock_location_id
                      AND saleable_location.organization_id = ${context.organizationId}::uuid
                      AND saleable_location.branch_id = ${context.branchId}::uuid
                      AND saleable_location.is_active = TRUE
                    WHERE saleable_batch.organization_id = ${context.organizationId}::uuid
                      AND saleable_batch.branch_id = ${context.branchId}::uuid
                      AND saleable_batch.product_variant_id = v.id
                      AND saleable_batch.quantity_on_hand
                            - saleable_batch.quantity_reserved > 0
                      AND ${quantityLocationScope}
                 )
                 ELSE EXISTS (
                   SELECT 1
                     FROM serialized_units saleable_unit
                     JOIN stock_locations saleable_location
                       ON saleable_location.id = saleable_unit.stock_location_id
                      AND saleable_location.organization_id = ${context.organizationId}::uuid
                      AND saleable_location.branch_id = ${context.branchId}::uuid
                      AND saleable_location.is_active = TRUE
                    WHERE saleable_unit.organization_id = ${context.organizationId}::uuid
                      AND saleable_unit.branch_id = ${context.branchId}::uuid
                      AND saleable_unit.product_variant_id = v.id
                      AND saleable_unit.state::text = 'available'
                      AND ${serializedLocationScope}
                      AND EXISTS (
                        SELECT 1
                          FROM device_identifiers saleable_identifier
                         WHERE saleable_identifier.organization_id = ${context.organizationId}::uuid
                           AND saleable_identifier.serialized_unit_id = saleable_unit.id
                      )
                 )
               END AS has_saleable_stock
          FROM product_variants v
          JOIN product_models model
            ON model.id = v.product_model_id
           AND model.organization_id = ${context.organizationId}::uuid
           AND model.is_active = TRUE
          JOIN brands brand
            ON brand.id = model.brand_id
           AND brand.organization_id = ${context.organizationId}::uuid
           AND brand.is_active = TRUE
          JOIN categories category
            ON category.id = model.category_id
           AND category.organization_id = ${context.organizationId}::uuid
           AND category.is_active = TRUE
          LEFT JOIN LATERAL (
            SELECT entry.id,
                   entry.price_minor,
                   entry.min_price_minor,
                   entry.effective_from
              FROM price_entries entry
              JOIN price_lists list
                ON list.id = entry.price_list_id
               AND list.organization_id = ${context.organizationId}::uuid
               AND list.is_active = TRUE
               AND list.effective_from <= ${now}
               AND (list.effective_to IS NULL OR list.effective_to > ${now})
             WHERE entry.organization_id = ${context.organizationId}::uuid
               AND entry.product_variant_id = v.id
               AND (entry.branch_id = ${context.branchId}::uuid
                    OR entry.branch_id IS NULL)
               AND entry.effective_from <= ${now}
               AND (entry.effective_to IS NULL OR entry.effective_to > ${now})
             ORDER BY CASE WHEN entry.branch_id = ${context.branchId}::uuid
                           THEN 0 ELSE 1 END ASC,
                      entry.effective_from DESC,
                      entry.id DESC
             LIMIT 1
          ) rule ON TRUE
         WHERE v.organization_id = ${context.organizationId}::uuid
           AND v.is_active = TRUE
           AND (rule.id IS NOT NULL OR v.default_price_minor IS NOT NULL)
           AND ${filters.length === 0 ? Prisma.sql`TRUE` : Prisma.join(filters, " AND ")}
      )`;
  }

  private async quantityChoices(
    context: PricingActorContext,
    productVariantIds: readonly string[],
    requestedLocationId: string | undefined,
  ): Promise<readonly QuantityChoiceRow[]> {
    if (productVariantIds.length === 0) return [];
    const scope = this.locationScope(
      Prisma.sql`batch.stock_location_id`,
      context,
      requestedLocationId,
    );
    return this.prisma.client.$queryRaw<readonly QuantityChoiceRow[]>(
      Prisma.sql`
        WITH ranked_batches AS (
          SELECT batch.product_variant_id,
                 batch.stock_location_id,
                 location.code AS location_code,
                 location.name AS location_name,
                 (batch.quantity_on_hand - batch.quantity_reserved)::int
                   AS available_quantity,
                 batch.version AS stock_version,
                 ROW_NUMBER() OVER (
                   PARTITION BY batch.product_variant_id
                   ORDER BY location.name ASC, location.id ASC
                 ) AS choice_rank
            FROM stock_batches batch
            JOIN stock_locations location
              ON location.id = batch.stock_location_id
             AND location.organization_id = ${context.organizationId}::uuid
             AND location.branch_id = ${context.branchId}::uuid
             AND location.is_active = TRUE
           WHERE batch.organization_id = ${context.organizationId}::uuid
             AND batch.branch_id = ${context.branchId}::uuid
             AND batch.product_variant_id IN (${Prisma.join(
               productVariantIds.map((id) => Prisma.sql`${id}::uuid`),
             )})
             AND batch.quantity_on_hand - batch.quantity_reserved > 0
             AND ${scope}
        )
        SELECT product_variant_id AS "productVariantId",
               stock_location_id AS "stockLocationId",
               location_code AS "locationCode",
               location_name AS "locationName",
               available_quantity AS "availableQuantity",
               stock_version AS "stockVersion"
          FROM ranked_batches
         WHERE choice_rank <= ${PRICING_CONTRACT_LIMITS.MAX_LOCATION_CHOICES}
         ORDER BY product_variant_id ASC, choice_rank ASC`,
    );
  }

  private async serializedChoices(
    context: PricingActorContext,
    productVariantIds: readonly string[],
    requestedLocationId: string | undefined,
  ): Promise<readonly SerializedChoiceRow[]> {
    if (productVariantIds.length === 0) return [];
    const scope = this.locationScope(
      Prisma.sql`unit.stock_location_id`,
      context,
      requestedLocationId,
    );
    return this.prisma.client.$queryRaw<readonly SerializedChoiceRow[]>(
      Prisma.sql`
        WITH ranked_units AS (
          SELECT unit.id,
                 unit.product_variant_id,
                 unit.stock_location_id,
                 unit.version,
                 unit.condition::text AS condition,
                 unit.pta_status::text AS pta_status,
                 location.code AS location_code,
                 location.name AS location_name,
                 ROW_NUMBER() OVER (
                   PARTITION BY unit.product_variant_id
                   ORDER BY unit.received_at ASC NULLS LAST, unit.id ASC
                 ) AS choice_rank
            FROM serialized_units unit
            JOIN stock_locations location
              ON location.id = unit.stock_location_id
             AND location.organization_id = ${context.organizationId}::uuid
             AND location.branch_id = ${context.branchId}::uuid
             AND location.is_active = TRUE
           WHERE unit.organization_id = ${context.organizationId}::uuid
             AND unit.branch_id = ${context.branchId}::uuid
             AND unit.product_variant_id IN (${Prisma.join(
               productVariantIds.map((id) => Prisma.sql`${id}::uuid`),
             )})
             AND unit.state::text = 'available'
             AND ${scope}
             AND EXISTS (
               SELECT 1
                 FROM device_identifiers present_identifier
                WHERE present_identifier.organization_id = ${context.organizationId}::uuid
                  AND present_identifier.serialized_unit_id = unit.id
             )
        )
        SELECT unit.product_variant_id AS "productVariantId",
               unit.id AS "serializedUnitId",
               unit.version AS "unitVersion",
               unit.stock_location_id AS "stockLocationId",
               unit.location_code AS "locationCode",
               unit.location_name AS "locationName",
               unit.condition,
               unit.pta_status AS "ptaStatus",
               JSONB_AGG(
                 JSONB_BUILD_OBJECT(
                   'type', identifier.identifier_type::text,
                   'value', identifier.normalized_value
                 ) ORDER BY identifier.position ASC, identifier.id ASC
               ) AS identifiers
          FROM ranked_units unit
          JOIN device_identifiers identifier
            ON identifier.serialized_unit_id = unit.id
           AND identifier.organization_id = ${context.organizationId}::uuid
         WHERE unit.choice_rank <= ${PRICING_CONTRACT_LIMITS.MAX_SERIALIZED_CHOICES}
         GROUP BY unit.product_variant_id,
                  unit.id,
                  unit.version,
                  unit.stock_location_id,
                  unit.location_code,
                  unit.location_name,
                  unit.condition,
                  unit.pta_status,
                  unit.choice_rank
         ORDER BY unit.product_variant_id ASC, unit.choice_rank ASC`,
    );
  }

  private async assertReadableLocation(
    context: PricingActorContext,
    locationId: string | undefined,
  ): Promise<void> {
    if (locationId === undefined) return;
    if (
      context.allowedLocationIds !== null &&
      !context.allowedLocationIds.includes(locationId)
    ) {
      throw notFound("stock location");
    }

    const location = await this.prisma.client.stockLocation.findFirst({
      where: {
        id:
          context.allowedLocationIds === null
            ? locationId
            : {
                equals: locationId,
                in: [...context.allowedLocationIds],
              },
        organizationId: context.organizationId,
        branchId: context.branchId,
        isActive: true,
      },
      select: { id: true },
    });
    if (location === null) throw notFound("stock location");
  }

  private locationScope(
    column: Prisma.Sql,
    context: PricingActorContext,
    requestedLocationId: string | undefined,
  ): Prisma.Sql {
    const allowed = context.allowedLocationIds;
    const allowedScope =
      allowed === null
        ? Prisma.sql`TRUE`
        : allowed.length === 0
          ? Prisma.sql`FALSE`
          : Prisma.sql`${column} IN (${Prisma.join(
              allowed.map((id) => Prisma.sql`${id}::uuid`),
            )})`;
    return requestedLocationId === undefined
      ? allowedScope
      : Prisma.sql`${allowedScope} AND ${column} = ${requestedLocationId}::uuid`;
  }
}
