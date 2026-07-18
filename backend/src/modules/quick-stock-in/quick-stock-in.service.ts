import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@mobileshop/database";
import {
  CreateGoodsReceiptInputSchema,
  CreateProductInputSchema,
  CreateProductModelInputSchema,
  CreatePurchaseOrderInputSchema,
  CreateSupplierInputSchema,
  DomainError,
  ERROR_CODES,
  PERMISSIONS,
  PurchaseOrderTransitionInputSchema,
  QuickStockInResultSchema,
  SetVariantDefaultPriceInputSchema,
  canonicalizeCatalogAlias,
  hasPermission,
  normalizeCatalogSku,
  normalizeSupplierCode,
  resolveQuickStockInAmounts,
  type PermissionKey,
  type QuickStockInData,
  type QuickStockInResult,
} from "@mobileshop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "../auth/request-metadata";
import {
  CatalogService,
  type CatalogActorContext,
} from "../catalog/catalog.service";
import {
  PricingService,
  type PricingActorContext,
} from "../pricing/pricing.service";
import {
  PurchasingService,
  type PurchasingActorContext,
} from "../purchasing/purchasing.service";

/**
 * Everything Quick Stock In needs from the authenticated session. `permissions`
 * is carried so the service can enforce the CONDITIONAL grants that a static
 * controller decorator cannot express (creating a new product or supplier, or
 * converting a never-transacted serialized variant).
 */
export interface QuickStockInActorContext {
  readonly organizationId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly currency: string;
  readonly allowedLocationIds: readonly string[] | null;
  readonly permissions: ReadonlySet<PermissionKey>;
  readonly metadata: AuthRequestMetadata;
}

interface ResolvedSupplier {
  readonly id: string;
  readonly name: string;
  readonly wasCreated: boolean;
}

interface ResolvedVariant {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly version: number;
  readonly wasCreated: boolean;
}

function notFound(label: string): DomainError {
  return new DomainError(ERROR_CODES.NOT_FOUND, `${label} was not found.`);
}

function validationError(field: string, message: string): DomainError {
  return new DomainError(ERROR_CODES.VALIDATION_FAILED, message, {
    details: { [field]: [message] },
  });
}

function forbidden(permission: PermissionKey): DomainError {
  return new DomainError(
    ERROR_CODES.FORBIDDEN_PERMISSION,
    `You do not have the '${permission}' permission required for this action.`,
  );
}

/** Assert-and-narrow a BigInt money column to a safe JS integer. */
function minorToNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) {
    throw new Error(`${label} is outside the safe money range.`);
  }
  return Number(value);
}

/** Deterministic, key-sorted JSON so a replayed request hashes identically. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function quickStockInRequestHash(input: QuickStockInData): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

/**
 * Quick Stock In — the one-action stock-entry orchestrator.
 *
 * It composes the transaction-aware domain methods of Catalog, Purchasing and
 * Pricing inside a SINGLE Prisma transaction, so the whole chain (reuse/create
 * product + supplier, purchase order, approval, goods receipt, stock batch,
 * `purchase_receive` movement, supplier payable, payment split and selling
 * price) commits or rolls back atomically. It never writes stock quantities
 * directly — stock only ever moves through the shared goods-receipt posting.
 *
 * Payment is recorded on the mandatory supplier payable (schema-safe): the
 * unpaid remainder becomes `outstandingMinor`; a fully-paid purchase leaves a
 * settled payable (outstanding 0, status `paid`). No separate ledger system is
 * introduced.
 */
@Injectable()
export class QuickStockInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly purchasing: PurchasingService,
    private readonly pricing: PricingService,
  ) {}

  async quickStockIn(
    context: QuickStockInActorContext,
    input: QuickStockInData,
    idempotencyKey: string,
  ): Promise<QuickStockInResult> {
    // Conditional permissions a static controller decorator cannot express.
    if (
      input.product.mode === "new" &&
      !hasPermission(context.permissions, PERMISSIONS.CATALOG_CREATE)
    ) {
      throw forbidden(PERMISSIONS.CATALOG_CREATE);
    }
    if (
      input.supplier.mode === "new" &&
      !hasPermission(context.permissions, PERMISSIONS.SUPPLIERS_MANAGE)
    ) {
      throw forbidden(PERMISSIONS.SUPPLIERS_MANAGE);
    }

    const requestHash = quickStockInRequestHash(input);
    const purchasingCtx = this.purchasingContext(context);

    const result = await this.prisma.client.$transaction(async (tx) => {
      // 1. Whole-request idempotency: acquire the goods-receipt idempotency
      // lock and return the original result if this key already posted.
      const replay = await this.purchasing.findReplayGoodsReceipt(
        tx,
        purchasingCtx,
        idempotencyKey,
      );
      if (replay !== null) {
        if (replay.requestHash !== requestHash) {
          throw new DomainError(
            ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
            "This idempotency key was already used for a different quick stock-in request.",
          );
        }
        return this.buildResult(tx, context, replay.id, input, {
          productWasCreated: false,
          supplierWasCreated: false,
        });
      }

      // 2. Validate the destination location (branch + scope + active).
      const location = await this.resolveLocation(
        tx,
        context,
        input.stockLocationId,
      );

      // 3. Reuse or create the supplier and the quantity-tracked variant.
      const supplier = await this.resolveSupplier(tx, context, input.supplier);
      const variant = await this.resolveVariant(tx, context, input.product);

      // 4. Draft purchase order with the single line, then approve it so it can
      // receive. Approval is an automatic, internal step of the quick flow.
      const purchaseOrder =
        await this.purchasing.createPurchaseOrderInTransaction(
          tx,
          purchasingCtx,
          CreatePurchaseOrderInputSchema.parse({
            supplierId: supplier.id,
            notes: input.notes ?? null,
            lines: [
              {
                productVariantId: variant.id,
                quantity: input.quantity,
                unitCostMinor: input.unitCostMinor,
                notes: null,
              },
            ],
          }),
        );
      await this.purchasing.transitionPurchaseOrderInTransaction(
        tx,
        purchasingCtx,
        purchaseOrder.id,
        PurchaseOrderTransitionInputSchema.parse({
          version: purchaseOrder.version,
          reason: null,
        }),
        "approved",
      );

      // 5. Receive the quantity into stock through the shared goods-receipt
      // posting (batch + purchase_receive movement + payable + audit).
      const orderLine = purchaseOrder.lines[0];
      if (orderLine === undefined) {
        throw new Error("Quick stock-in purchase order lost its only line.");
      }
      const receipt = await this.purchasing.createGoodsReceiptInTransaction(
        tx,
        purchasingCtx,
        CreateGoodsReceiptInputSchema.parse({
          purchaseOrderId: purchaseOrder.id,
          supplierInvoiceReference: input.supplierReference ?? null,
          notes: input.notes ?? null,
          landedCosts: [],
          lines: [
            {
              purchaseOrderLineId: orderLine.id,
              trackingType: "quantity",
              stockLocationId: location.id,
              unitCostMinor: input.unitCostMinor,
              quantity: input.quantity,
            },
          ],
        }),
        idempotencyKey,
        requestHash,
      );

      // 6. Record the payment on the mandatory payable (schema-safe): set the
      // paid/outstanding split; a fully-paid purchase becomes a settled payable.
      await this.applyPayment(tx, context, receipt.id, input);

      // 7. Update the selling price through the pricing domain.
      await this.pricing.setVariantDefaultPriceInTransaction(
        tx,
        this.pricingContext(context),
        variant.id,
        SetVariantDefaultPriceInputSchema.parse({
          unitPriceMinor: input.sellingPriceMinor,
          minimumUnitPriceMinor: Math.min(
            input.unitCostMinor,
            input.sellingPriceMinor,
          ),
          productVersion: variant.version,
        }),
      );

      // 8. Orchestration audit trail (records the payment tender/provider that
      // is not otherwise persisted on a column).
      await this.writeQuickStockInAudit(tx, context, receipt.id, input, {
        supplierId: supplier.id,
        variantId: variant.id,
        supplierWasCreated: supplier.wasCreated,
        productWasCreated: variant.wasCreated,
      });

      // 9. Assemble the result from the committed-in-transaction facts.
      return this.buildResult(tx, context, receipt.id, input, {
        productWasCreated: variant.wasCreated,
        supplierWasCreated: supplier.wasCreated,
      });
    });

    // Defensive: guarantee the response honours the shared contract invariants.
    return QuickStockInResultSchema.parse(result);
  }

  // ---------------------------------------------------------------------------
  // Resolution helpers
  // ---------------------------------------------------------------------------

  private async resolveLocation(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    stockLocationId: string,
  ): Promise<{ readonly id: string; readonly name: string }> {
    if (
      context.allowedLocationIds !== null &&
      !context.allowedLocationIds.includes(stockLocationId)
    ) {
      throw notFound("stock location");
    }
    const location = await tx.stockLocation.findFirst({
      where: {
        id: stockLocationId,
        organizationId: context.organizationId,
        branchId: context.branchId,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (location === null) throw notFound("stock location");
    return location;
  }

  private async resolveSupplier(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    input: QuickStockInData["supplier"],
  ): Promise<ResolvedSupplier> {
    if (input.mode === "existing") {
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, organizationId: context.organizationId },
        select: { id: true, name: true, isActive: true },
      });
      if (supplier === null) throw notFound("supplier");
      if (!supplier.isActive) {
        throw validationError(
          "supplier",
          "This supplier is inactive. Reactivate it or choose another supplier.",
        );
      }
      return { id: supplier.id, name: supplier.name, wasCreated: false };
    }

    const created = await this.purchasing.createSupplierInTransaction(
      tx,
      this.purchasingContext(context),
      CreateSupplierInputSchema.parse({
        code: this.supplierCodeFor(input.name, input.code),
        name: input.name,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        // The shopkeeper only supplies name (+ optional phone); the phone is
        // kept as the primary contact so it is reachable in Supplier records.
        contacts: input.phone
          ? [{ name: input.name, phone: input.phone, isPrimary: true }]
          : [],
      }),
    );
    return { id: created.id, name: created.name, wasCreated: true };
  }

  private supplierCodeFor(
    name: string,
    provided: string | null | undefined,
  ): string {
    if (provided) return normalizeSupplierCode(provided);
    const derived = normalizeSupplierCode(name);
    // Fall back to a prefixed random code when the name yields an invalid code
    // (e.g. it starts with punctuation) so the supplier can still be created.
    return /^[A-Z0-9][A-Z0-9._/-]*$/.test(derived)
      ? derived
      : `SUP-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  }

  private async resolveVariant(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    input: QuickStockInData["product"],
  ): Promise<ResolvedVariant> {
    if (input.mode === "existing") {
      return this.resolveExistingVariant(tx, context, input.productVariantId);
    }
    return this.createNewVariant(tx, context, input);
  }

  private async resolveExistingVariant(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    productVariantId: string,
  ): Promise<ResolvedVariant> {
    const variant = await tx.productVariant.findFirst({
      where: { id: productVariantId, organizationId: context.organizationId },
      select: {
        id: true,
        name: true,
        sku: true,
        version: true,
        isActive: true,
        trackingType: true,
      },
    });
    if (variant === null) throw notFound("product");
    if (!variant.isActive) {
      throw validationError(
        "product",
        "This product is inactive. Reactivate it or choose another product.",
      );
    }
    if (variant.trackingType === "serialized") {
      // Quick Stock In is quantity-only. An existing serialized variant cannot
      // be received here: the database keys goods-receipt / sale / return lines
      // to the variant's tracking type with ON UPDATE CASCADE, and those posted
      // rows are immutable — so a serialized variant's tracking type can never
      // be flipped to quantity (even one that has never transacted). Its POS
      // availability is also read only from serialized units. New products are
      // created quantity-tracked, so phones can still be added without an IMEI.
      throw new DomainError(
        ERROR_CODES.VALIDATION_FAILED,
        "This product is set up for individual IMEI/serial tracking and cannot be stocked by quantity here. Add it through the advanced Purchasing goods-receipt flow, or create a new quantity-tracked product.",
        { details: { product: ["Serialized product."] } },
      );
    }
    return {
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      version: variant.version,
      wasCreated: false,
    };
  }

  private async createNewVariant(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    input: Extract<QuickStockInData["product"], { mode: "new" }>,
  ): Promise<ResolvedVariant> {
    const catalogCtx = this.catalogContext(context);
    const modelName = input.productModelName ?? input.productName;

    // Resolve-or-create the product model (never silently duplicate one).
    const canonicalName = canonicalizeCatalogAlias(modelName);
    const existingModel = await tx.productModel.findFirst({
      where: {
        organizationId: context.organizationId,
        brandId: input.brandId,
        canonicalName,
      },
      select: { id: true },
    });
    const modelId =
      existingModel?.id ??
      (
        await this.catalog.createProductModelInTransaction(
          tx,
          catalogCtx,
          CreateProductModelInputSchema.parse({
            name: modelName,
            brandId: input.brandId,
            categoryId: input.categoryId,
          }),
        )
      ).id;

    const sku = input.sku
      ? normalizeCatalogSku(input.sku)
      : `QSI-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

    const created = await this.catalog.createProductInTransaction(
      tx,
      catalogCtx,
      CreateProductInputSchema.parse({
        productModelId: modelId,
        sku,
        name: input.variantName,
        // Quick Stock In is quantity-only; new products never require an IMEI.
        trackingType: "quantity",
        condition: "new",
        ptaStatus: "not_applicable",
      }),
    );

    const variant = await tx.productVariant.findFirst({
      where: { id: created.id, organizationId: context.organizationId },
      select: { id: true, name: true, sku: true, version: true },
    });
    if (variant === null) {
      throw new Error("The created product variant could not be read back.");
    }
    return {
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      version: variant.version,
      wasCreated: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Payment
  // ---------------------------------------------------------------------------

  /**
   * Record the paid/unpaid split on the payable the goods receipt just created.
   * The receipt always creates one payable for the full amount (a DB
   * reconciliation trigger mandates it and its amount is immutable); we only
   * advance the mutable `paidMinor` / `outstandingMinor` / `status`, so the
   * unpaid remainder is the outstanding balance and a fully-paid purchase
   * becomes a settled payable.
   */
  private async applyPayment(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    goodsReceiptId: string,
    input: QuickStockInData,
  ): Promise<void> {
    if (input.payment.status === "credit") return; // open payable, nothing paid.

    const amounts = resolveQuickStockInAmounts(input);
    const payable = await tx.payable.findFirst({
      where: {
        organizationId: context.organizationId,
        goodsReceiptId,
      },
      select: { id: true, version: true },
    });
    if (payable === null) {
      throw new Error("The receipt payable could not be found for payment.");
    }
    const fullyPaid = amounts.remainingPayableMinor === 0;
    const updated = await tx.payable.updateMany({
      where: {
        id: payable.id,
        organizationId: context.organizationId,
        branchId: context.branchId,
        version: payable.version,
      },
      data: {
        paidMinor: BigInt(amounts.paidAmountMinor),
        outstandingMinor: BigInt(amounts.remainingPayableMinor),
        status: fullyPaid ? "paid" : "partially_paid",
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new DomainError(
        ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
        "This payable was changed by someone else. Reload it and try again.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Result assembly (used by both the fresh path and the idempotent replay)
  // ---------------------------------------------------------------------------

  private async buildResult(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    goodsReceiptId: string,
    input: QuickStockInData,
    flags: {
      readonly productWasCreated: boolean;
      readonly supplierWasCreated: boolean;
    },
  ): Promise<QuickStockInResult> {
    const receipt = await tx.goodsReceipt.findFirst({
      where: {
        id: goodsReceiptId,
        organizationId: context.organizationId,
        branchId: context.branchId,
      },
      select: {
        id: true,
        number: true,
        purchaseOrderId: true,
        supplierId: true,
      },
    });
    if (receipt === null) throw notFound("goods receipt");

    const [purchaseOrder, line, supplier, payable] = await Promise.all([
      tx.purchaseOrder.findFirst({
        where: {
          id: receipt.purchaseOrderId,
          organizationId: context.organizationId,
        },
        select: { number: true },
      }),
      tx.goodsReceiptLine.findFirst({
        where: {
          goodsReceiptId: receipt.id,
          organizationId: context.organizationId,
        },
        select: {
          productVariantId: true,
          quantityReceived: true,
          stockLocationId: true,
          unitCostMinor: true,
        },
      }),
      tx.supplier.findFirst({
        where: {
          id: receipt.supplierId,
          organizationId: context.organizationId,
        },
        select: { name: true },
      }),
      tx.payable.findFirst({
        where: {
          organizationId: context.organizationId,
          goodsReceiptId: receipt.id,
        },
        select: { id: true, outstandingMinor: true },
      }),
    ]);
    if (
      purchaseOrder === null ||
      line === null ||
      supplier === null ||
      payable === null
    ) {
      throw notFound("goods receipt");
    }

    const [variant, location, batch] = await Promise.all([
      tx.productVariant.findFirst({
        where: {
          id: line.productVariantId,
          organizationId: context.organizationId,
        },
        select: { name: true, sku: true, defaultPriceMinor: true },
      }),
      tx.stockLocation.findFirst({
        where: {
          id: line.stockLocationId,
          organizationId: context.organizationId,
        },
        select: { name: true },
      }),
      tx.stockBatch.findFirst({
        where: {
          organizationId: context.organizationId,
          productVariantId: line.productVariantId,
          stockLocationId: line.stockLocationId,
        },
        select: { quantityOnHand: true },
      }),
    ]);
    if (variant === null || location === null || batch === null) {
      throw notFound("stock");
    }

    const amounts = resolveQuickStockInAmounts(input);
    const paymentMethod =
      input.payment.status === "credit" ? null : input.payment.method;
    const walletProvider =
      input.payment.status !== "credit" &&
      input.payment.method === "digital_wallet"
        ? (input.payment.walletProvider ?? null)
        : null;

    return {
      product: {
        id: line.productVariantId,
        name: variant.name,
        sku: variant.sku,
        wasCreated: flags.productWasCreated,
      },
      supplier: {
        id: receipt.supplierId,
        name: supplier.name,
        wasCreated: flags.supplierWasCreated,
      },
      quantityAdded: line.quantityReceived,
      currentStockOnHand: batch.quantityOnHand,
      unitCostMinor: minorToNumber(line.unitCostMinor, "unit cost"),
      purchaseTotalMinor: amounts.purchaseTotalMinor,
      sellingPriceMinor:
        variant.defaultPriceMinor === null
          ? input.sellingPriceMinor
          : minorToNumber(variant.defaultPriceMinor, "selling price"),
      stockLocationId: line.stockLocationId,
      stockLocationName: location.name,
      purchaseOrderId: receipt.purchaseOrderId,
      purchaseOrderNumber: purchaseOrder.number,
      goodsReceiptId: receipt.id,
      goodsReceiptNumber: receipt.number,
      paymentStatus: input.payment.status,
      paymentMethod,
      walletProvider,
      paidAmountMinor: amounts.paidAmountMinor,
      remainingPayableMinor: minorToNumber(
        payable.outstandingMinor,
        "remaining payable",
      ),
      payableId: payable.id,
    };
  }

  // ---------------------------------------------------------------------------
  // Audit + context builders
  // ---------------------------------------------------------------------------

  private async writeQuickStockInAudit(
    tx: Prisma.TransactionClient,
    context: QuickStockInActorContext,
    goodsReceiptId: string,
    input: QuickStockInData,
    refs: {
      readonly supplierId: string;
      readonly variantId: string;
      readonly supplierWasCreated: boolean;
      readonly productWasCreated: boolean;
    },
  ): Promise<void> {
    const amounts = resolveQuickStockInAmounts(input);
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        branchId: context.branchId,
        actorUserId: context.actorUserId,
        action: "inventory.quick_stock_in",
        entityType: "goods_receipt",
        entityId: goodsReceiptId,
        afterSnapshot: {
          productVariantId: refs.variantId,
          productWasCreated: refs.productWasCreated,
          supplierId: refs.supplierId,
          supplierWasCreated: refs.supplierWasCreated,
          stockLocationId: input.stockLocationId,
          quantity: input.quantity,
          unitCostMinor: input.unitCostMinor,
          sellingPriceMinor: input.sellingPriceMinor,
          purchaseTotalMinor: amounts.purchaseTotalMinor,
          paidAmountMinor: amounts.paidAmountMinor,
          remainingPayableMinor: amounts.remainingPayableMinor,
          paymentStatus: input.payment.status,
          paymentMethod:
            input.payment.status === "credit" ? null : input.payment.method,
          walletProvider:
            input.payment.status !== "credit" &&
            input.payment.method === "digital_wallet"
              ? (input.payment.walletProvider ?? null)
              : null,
        },
        requestId: context.metadata.requestId,
        ipAddress: context.metadata.ipAddress,
        userAgent: context.metadata.userAgent,
      },
    });
  }

  private purchasingContext(
    context: QuickStockInActorContext,
  ): PurchasingActorContext {
    return {
      organizationId: context.organizationId,
      branchId: context.branchId,
      actorUserId: context.actorUserId,
      allowedLocationIds: context.allowedLocationIds,
      metadata: context.metadata,
    };
  }

  private catalogContext(
    context: QuickStockInActorContext,
  ): CatalogActorContext {
    return {
      organizationId: context.organizationId,
      branchId: context.branchId,
      actorUserId: context.actorUserId,
      metadata: context.metadata,
    };
  }

  private pricingContext(
    context: QuickStockInActorContext,
  ): PricingActorContext {
    return {
      organizationId: context.organizationId,
      branchId: context.branchId,
      currency: context.currency,
      actorUserId: context.actorUserId,
      metadata: context.metadata,
      allowedLocationIds: context.allowedLocationIds,
    };
  }
}
