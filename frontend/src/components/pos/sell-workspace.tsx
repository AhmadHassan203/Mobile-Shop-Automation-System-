"use client";

import {
  LIMITS,
  PAGINATION,
  PERMISSIONS,
  toMajorString,
  toMinor,
  type CreateSaleDraftInput,
  type CustomerSummary,
  type PostSaleResponse,
  type ProductSummary,
  type SaleDetail,
  type SalePaymentLegInput,
  type SaleReview,
} from "@mobileshop/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import { SearchIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { createCustomer } from "@/lib/api/customers";
import {
  createSaleDraft,
  holdSale,
  postSale,
  replaceSaleDraft,
  reviewSale,
} from "@/lib/api/sales";
import { toApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { catalogProductsQueryOptions } from "@/lib/query/catalog-query";
import { customersQueryOptions } from "@/lib/query/customers-query";
import { queryKeys } from "@/lib/query/keys";
import { posLookupQueryOptions } from "@/lib/query/pos-query";
import {
  CartPanel,
  CustomerCard,
  formatPosMoney,
  Overlay,
  PaymentPanel,
  PosError,
  ProductResults,
  ProfitPreview,
  ReceiptContent,
  ReviewContent,
  type PaymentEditorValue,
} from "./pos-components";
import {
  POS_PAYMENT_OPTIONS,
  addCartSelection,
  buildSaleDraftInput,
  cartStalenessReasons,
  cartTotals,
  parsePkrMajorInput,
  paymentLegs,
  paymentTotal,
  posCapabilities,
  setCartQuantity,
  type PosCartLine,
} from "./pos-state";

const LOOKUP_PAGE_SIZE = PAGINATION.MAX_PAGE_SIZE;
const CUSTOMER_PAGE_SIZE = 25;
type PosOverlay = "customer" | "review" | "receipt" | null;
type PaymentMethod = (typeof POS_PAYMENT_OPTIONS)[number]["method"];
type PaymentValues = Record<PaymentMethod, PaymentEditorValue>;

const EMPTY_PAYMENTS: PaymentValues = {
  cash: { amount: "", reference: "" },
  bank_transfer: { amount: "", reference: "" },
  card: { amount: "", reference: "" },
  digital_wallet: { amount: "", reference: "" },
};

function CounterSkeleton(): JSX.Element {
  return (
    <div className="space-y-4" role="status">
      <span className="sr-only">Loading point of sale</span>
      <div className="h-28 animate-pulse rounded-card bg-line-subtle" />
      <div className="grid gap-4 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-[340px_minmax(0,1fr)_344px]">
        <div className="h-[34rem] animate-pulse rounded-card bg-line-subtle" />
        <div className="h-[34rem] animate-pulse rounded-card bg-line-subtle" />
        <div className="h-[34rem] animate-pulse rounded-card bg-line-subtle min-[821px]:col-span-2 min-[1201px]:col-span-1" />
      </div>
    </div>
  );
}

export function SellRouteFallback(): JSX.Element {
  return <CounterSkeleton />;
}

function PermissionGate({ missing }: { readonly missing: readonly string[] }) {
  return (
    <section
      className="rounded-card border border-warning/30 bg-surface p-6 shadow-card"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
          <ShieldCheckIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-bold text-ink">Sell access required</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-subtle">
            The counter requires sale creation and server pricing access. No
            product, customer, or sale request was sent without those
            permissions.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {missing.map((permission) => (
              <code
                className="rounded-full bg-warning-soft px-2.5 py-1 text-xs text-warning"
                key={permission}
              >
                {permission}
              </code>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OperationNotice({ text }: { readonly text: string }) {
  return (
    <div
      className="rounded-control border border-info/25 bg-info-soft px-4 py-3 text-xs text-info"
      role="status"
    >
      {text}
    </div>
  );
}

function prepareDraft(
  lines: readonly PosCartLine[],
  customer: CustomerSummary | null,
  discountText: string,
  discountReason: string,
): {
  readonly input: CreateSaleDraftInput | null;
  readonly error: string | null;
} {
  if (lines.length === 0)
    return { input: null, error: "Add at least one priced stock selection." };
  const discountMinor = parsePkrMajorInput(discountText);
  if (discountMinor === null)
    return { input: null, error: "Enter a valid discount in rupees." };
  const totals = cartTotals(lines, discountMinor);
  if (totals === null)
    return {
      input: null,
      error: "The discount cannot exceed the cart subtotal.",
    };
  const reason = discountReason.trim() || null;
  if (discountMinor > 0 && reason === null) {
    return {
      input: null,
      error: "Enter a reason for the requested sale discount.",
    };
  }
  return {
    input: buildSaleDraftInput(
      lines,
      customer?.id ?? null,
      discountMinor,
      reason,
    ),
    error: null,
  };
}

interface DraftCommand {
  readonly input: CreateSaleDraftInput;
  readonly existing: SaleDetail | null;
}

async function saveDraft(command: DraftCommand): Promise<SaleDetail> {
  if (command.existing === null) return createSaleDraft(command.input);
  return replaceSaleDraft(command.existing.id, {
    ...command.input,
    version: command.existing.version,
  });
}

export function SellWorkspace(): JSX.Element {
  const queryClient = useQueryClient();
  const auth = useQuery(currentAuthQueryOptions);
  const permissions = auth.data?.permissions;
  const capabilities = useMemo(
    () => posCapabilities(permissions),
    [permissions],
  );
  const requiredAccess =
    capabilities.canCreateSale && capabilities.canViewPricing;

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [cart, setCart] = useState<readonly PosCartLine[]>([]);
  const [choices, setChoices] = useState<Readonly<Record<string, string>>>({});
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSummary | null>(null);
  const [discountText, setDiscountText] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [payments, setPayments] = useState<PaymentValues>(EMPTY_PAYMENTS);
  const [overlay, setOverlay] = useState<PosOverlay>(null);
  const [draft, setDraft] = useState<SaleDetail | null>(null);
  const [review, setReview] = useState<SaleReview | null>(null);
  const [posted, setPosted] = useState<PostSaleResponse | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerConsent, setCustomerConsent] = useState<
    "pending" | "granted" | "declined"
  >("pending");

  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchDraft.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const productParameters = useMemo(
    () => ({
      page: 1,
      pageSize: LOOKUP_PAGE_SIZE,
      active: true,
      ...(search.length === 0 ? {} : { q: search }),
    }),
    [search],
  );
  const pricingParameters = useMemo(
    () => ({
      page: 1,
      pageSize: LOOKUP_PAGE_SIZE,
      ...(search.length === 0 ? {} : { q: search }),
    }),
    [search],
  );

  const pricing = useQuery(
    posLookupQueryOptions(pricingParameters, requiredAccess),
  );
  const catalog = useQuery({
    ...catalogProductsQueryOptions(productParameters),
    enabled: requiredAccess && capabilities.canViewCatalog,
  });
  const customerParameters = useMemo(
    () => ({
      page: 1,
      pageSize: CUSTOMER_PAGE_SIZE,
      active: true,
      sort: "name" as const,
      direction: "asc" as const,
      ...(customerSearch.trim().length === 0
        ? {}
        : { q: customerSearch.trim() }),
    }),
    [customerSearch],
  );
  const customers = useQuery(
    customersQueryOptions(
      customerParameters,
      overlay === "customer" && capabilities.canViewCustomers,
    ),
  );

  const pricedIds = useMemo(
    () =>
      new Set((pricing.data?.items ?? []).map((item) => item.productVariantId)),
    [pricing.data?.items],
  );
  const unpricedItems = useMemo<readonly ProductSummary[]>(
    () =>
      catalog.isPlaceholderData
        ? []
        : (catalog.data?.items ?? []).filter((item) => !pricedIds.has(item.id)),
    [catalog.data?.items, catalog.isPlaceholderData, pricedIds],
  );

  const discountMinor = parsePkrMajorInput(discountText);
  const localTotals =
    discountMinor === null ? null : cartTotals(cart, discountMinor);
  const paymentDrafts = useMemo(
    () =>
      POS_PAYMENT_OPTIONS.map((option) => ({
        method: option.method,
        amountMinor: parsePkrMajorInput(payments[option.method].amount) ?? -1,
        reference: payments[option.method].reference.trim() || null,
      })),
    [payments],
  );
  const legs = useMemo(() => paymentLegs(paymentDrafts), [paymentDrafts]);
  const allocatedMinor = legs === null ? null : paymentTotal(legs);
  const allPricingRowsLoaded =
    pricing.data !== undefined &&
    search.length === 0 &&
    pricing.data.items.length === pricing.data.total;
  const staleReasons = useMemo(
    () =>
      allPricingRowsLoaded
        ? cartStalenessReasons(cart, pricing.data?.items ?? [])
        : [],
    [allPricingRowsLoaded, cart, pricing.data?.items],
  );
  const prepared = prepareDraft(
    cart,
    selectedCustomer,
    discountText,
    discountReason,
  );

  const customerMutation = useMutation({
    mutationFn: () =>
      createCustomer({
        name: customerName,
        phone: customerPhone,
        email: null,
        marketingConsent: customerConsent,
        addressLine: null,
        notes: null,
      }),
    onSuccess: (saved) => {
      setSelectedCustomer(saved);
      setOverlay(null);
      setQuickAddOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setNotice(`${saved.name} was created and selected.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersRoot });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (command: DraftCommand) => {
      const saved = await saveDraft(command);
      const checked = await reviewSale(saved.id, { version: saved.version });
      return { saved, checked };
    },
    onSuccess: ({ saved, checked }) => {
      setDraft(saved);
      setReview(checked);
      setIdempotencyKey(globalThis.crypto.randomUUID());
      setOverlay("review");
      setNotice(null);
    },
  });

  const holdMutation = useMutation({
    mutationFn: async (command: DraftCommand) => {
      const saved = await saveDraft(command);
      return holdSale(saved.id, { version: saved.version, note: null });
    },
    onSuccess: (held) => {
      setCart([]);
      setDraft(null);
      setReview(null);
      setIdempotencyKey(null);
      setDiscountText("");
      setDiscountReason("");
      setPayments(EMPTY_PAYMENTS);
      setSelectedCustomer(null);
      setNotice(`Sale ${held.id} is held on the server.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.salesRoot });
    },
  });

  const postMutation = useMutation({
    mutationFn: ({
      checked,
      allocation,
      key,
    }: {
      readonly checked: SaleReview;
      readonly allocation: readonly SalePaymentLegInput[];
      readonly key: string;
    }) =>
      postSale(
        checked.saleId,
        { version: checked.version, payments: [...allocation] },
        key,
      ),
    onSuccess: (result) => {
      setPosted(result);
      setOverlay("receipt");
      setCart([]);
      setDraft(null);
      setReview(null);
      setDiscountText("");
      setDiscountReason("");
      setPayments(EMPTY_PAYMENTS);
      setSelectedCustomer(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.posLookupRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.salesRoot }),
      ]);
    },
  });

  const resetReview = useCallback(() => {
    setReview(null);
    setIdempotencyKey(null);
    setPosted(null);
  }, []);

  const changeCart = useCallback(
    (next: readonly PosCartLine[]) => {
      setCart(next);
      resetReview();
    },
    [resetReview],
  );

  const reviewBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (prepared.error !== null) blockers.push(prepared.error);
    if (!capabilities.canPostSale)
      blockers.push(`Missing ${PERMISSIONS.SALES_POST}.`);
    if (!capabilities.canCollectPayment)
      blockers.push(`Missing ${PERMISSIONS.PAYMENTS_COLLECT}.`);
    if ((discountMinor ?? 0) > 0 && !capabilities.canDiscount)
      blockers.push(`Missing ${PERMISSIONS.SALES_DISCOUNT}.`);
    if (legs === null)
      blockers.push(
        "Complete each non-cash payment reference and enter valid amounts.",
      );
    if (localTotals !== null && allocatedMinor !== localTotals.totalMinor) {
      blockers.push("Payment allocation must equal the current cart total.");
    }
    blockers.push(...staleReasons);
    return [...new Set(blockers)];
  }, [
    allocatedMinor,
    capabilities,
    discountMinor,
    legs,
    localTotals,
    prepared.error,
    staleReasons,
  ]);

  const beginReview = useCallback(() => {
    if (prepared.input === null || reviewBlockers.length > 0) {
      setNotice(
        reviewBlockers[0] ??
          prepared.error ??
          "The sale is not ready for review.",
      );
      return;
    }
    reviewMutation.mutate({ input: prepared.input, existing: draft });
  }, [draft, prepared.error, prepared.input, reviewBlockers, reviewMutation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "F2") {
        event.preventDefault();
        if (capabilities.canViewCustomers) setOverlay("customer");
      } else if (event.key === "F4") {
        event.preventDefault();
        discountRef.current?.focus();
      } else if (event.key === "F8") {
        event.preventDefault();
        paymentRef.current?.focus();
      } else if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        beginReview();
      } else if (event.key === "Escape") {
        setOverlay(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginReview, capabilities.canViewCustomers]);

  if (auth.isPending) return <CounterSkeleton />;
  if (auth.error !== null) {
    return (
      <PosError
        error={toApiError(auth.error)}
        retry={() => void auth.refetch()}
        title="Session could not be loaded"
      />
    );
  }
  const missing: string[] = [];
  if (!capabilities.canCreateSale) missing.push(PERMISSIONS.SALES_CREATE);
  if (!capabilities.canViewPricing) missing.push(PERMISSIONS.PRICING_VIEW);
  if (missing.length > 0) return <PermissionGate missing={missing} />;

  const pricingError =
    pricing.error === null ? null : toApiError(pricing.error);
  const catalogError =
    catalog.error === null ? null : toApiError(catalog.error);
  const serverPaymentMatches =
    review !== null &&
    legs !== null &&
    paymentTotal(legs) === review.totals.totalMinor;
  const canConfirmPost =
    review !== null &&
    review.canPost &&
    capabilities.canPostSale &&
    capabilities.canCollectPayment &&
    legs !== null &&
    serverPaymentMatches &&
    idempotencyKey !== null &&
    !postMutation.isPending;

  const submitQuickCustomer = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    customerMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">
              Sell — Point of Sale
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Counter-speed checkout: search or scan, add to cart, take payment,
              print the receipt — all on one screen.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-positive-soft px-2.5 py-1 text-[0.6875rem] font-bold text-positive">
              Live pricing
            </span>
            <span className="rounded-full bg-info-soft px-2.5 py-1 text-[0.6875rem] font-bold text-info">
              Branch {auth.data.branch.code}
            </span>
            {capabilities.canRecordDemand ? (
              <Link
                className="min-h-9 rounded-control border border-line px-3 py-2 text-xs font-bold text-ink-subtle"
                href="/demand"
              >
                Record demand
              </Link>
            ) : null}
            <button
              className="min-h-9 rounded-control border border-line px-3 text-xs font-bold text-ink-subtle disabled:opacity-45"
              disabled={prepared.input === null || holdMutation.isPending}
              onClick={() =>
                prepared.input === null
                  ? setNotice(prepared.error)
                  : holdMutation.mutate({
                      input: prepared.input,
                      existing: draft,
                    })
              }
              type="button"
            >
              {holdMutation.isPending ? "Holding…" : "Hold sale"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[0.6875rem] text-ink-muted">
          {[
            ["/", "Search"],
            ["F2", "Customer"],
            ["F4", "Discount"],
            ["F8", "Payment"],
            ["Ctrl+Enter", "Review & post"],
          ].map(([key, label]) => (
            <span
              className="rounded-full border border-line px-2 py-1"
              key={key}
            >
              <kbd className="font-mono font-bold">{key}</kbd> {label}
            </span>
          ))}
        </div>
      </section>

      {notice === null ? null : <OperationNotice text={notice} />}
      {reviewMutation.error === null ? null : (
        <PosError
          error={toApiError(reviewMutation.error)}
          retry={beginReview}
          title="Sale review failed"
        />
      )}
      {holdMutation.error === null ? null : (
        <PosError
          error={toApiError(holdMutation.error)}
          retry={() =>
            prepared.input === null
              ? setNotice(prepared.error)
              : holdMutation.mutate({ input: prepared.input, existing: draft })
          }
          title="Sale could not be held"
        />
      )}

      <div className="grid gap-4 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-[340px_minmax(0,1fr)_344px]">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <header className="border-b border-line-subtle px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[0.9375rem] font-bold text-ink">Products</h2>
              <span className="text-[0.6875rem] text-ink-muted">
                {catalog.data !== undefined
                  ? `${(pricing.data?.items.length ?? 0) + unpricedItems.length} of ${catalog.data.total} items`
                  : pricing.data === undefined
                    ? "Loading prices"
                    : `${pricing.data.items.length} of ${pricing.data.total} priced items`}
              </span>
            </div>
            <label className="relative mt-3 block">
              <span className="sr-only">
                Search product, brand, SKU or IMEI
              </span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                className="min-h-10 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm"
                maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search product, brand, SKU or IMEI"
                ref={searchRef}
                value={searchDraft}
              />
            </label>
          </header>
          {pricingError === null ? null : (
            <div className="p-4">
              <PosError
                error={pricingError}
                retry={() => void pricing.refetch()}
                title="Pricing lookup failed"
              />
            </div>
          )}
          {catalogError === null || catalog.data !== undefined ? null : (
            <div className="px-4 pt-4">
              <PosError
                error={catalogError}
                retry={() => void catalog.refetch()}
                title="Catalog fallback failed"
              />
            </div>
          )}
          {pricing.isPending && catalog.data === undefined ? (
            <div className="space-y-2 p-4" role="status">
              <span className="sr-only">Loading priced products</span>
              {[1, 2, 3, 4].map((row) => (
                <div
                  className="h-24 animate-pulse rounded-control bg-line-subtle"
                  key={row}
                />
              ))}
            </div>
          ) : (
            <ProductResults
              canManagePricing={capabilities.canManagePricing}
              canRecordDemand={capabilities.canRecordDemand}
              items={pricing.data?.items ?? []}
              onAdd={(item, choiceId) => {
                changeCart(addCartSelection(cart, item, choiceId));
                setNotice(null);
              }}
              onChoice={(productVariantId, choiceId) =>
                setChoices((current) => ({
                  ...current,
                  [productVariantId]: choiceId,
                }))
              }
              pricingAvailable={pricing.data !== undefined}
              selectedChoices={choices}
              unpricedItems={unpricedItems}
            />
          )}
          {pricing.isFetching && pricing.data !== undefined ? (
            <p className="border-t border-line-subtle px-4 py-2 text-[0.6875rem] text-info">
              Refreshing authoritative price and stock snapshot…
            </p>
          ) : null}
        </section>

        <CartPanel
          canDiscount={capabilities.canDiscount}
          discountReason={discountReason}
          discountRef={discountRef}
          discountText={discountText}
          lines={cart}
          onClear={() => changeCart([])}
          onDiscountReason={(value) => {
            setDiscountReason(value);
            resetReview();
          }}
          onDiscountText={(value) => {
            setDiscountText(value);
            resetReview();
          }}
          onQuantity={(key, quantity) =>
            changeCart(setCartQuantity(cart, key, quantity))
          }
        />

        <aside className="space-y-4 min-[821px]:col-span-2 min-[1201px]:col-span-1">
          <CustomerCard
            customer={selectedCustomer}
            onChange={() =>
              capabilities.canViewCustomers
                ? setOverlay("customer")
                : setNotice(`Missing ${PERMISSIONS.CUSTOMERS_VIEW}.`)
            }
          />
          <div className="grid gap-4 min-[821px]:grid-cols-2 min-[1201px]:grid-cols-1">
            <div className="space-y-4">
              <PaymentPanel
                currency={auth.data.organization.currency}
                editorDisabled={
                  cart.length === 0 || !capabilities.canCollectPayment
                }
                onChange={(method, value) => {
                  setPayments((current) => ({
                    ...current,
                    [method as PaymentMethod]: value,
                  }));
                  resetReview();
                }}
                onFillCash={() => {
                  if (localTotals === null) return;
                  setPayments({
                    ...EMPTY_PAYMENTS,
                    cash: {
                      amount: toMajorString(
                        toMinor(localTotals.totalMinor, "cart total"),
                        auth.data.organization.currency,
                      ),
                      reference: "",
                    },
                  });
                  resetReview();
                }}
                onReview={beginReview}
                paymentRef={paymentRef}
                reviewDisabled={
                  reviewBlockers.length > 0 || reviewMutation.isPending
                }
                totals={localTotals}
                values={payments}
              />
              {reviewBlockers.length === 0 ? null : (
                <div className="rounded-control border border-warning/25 bg-warning-soft p-3 text-xs text-warning">
                  <p className="font-bold">Before review</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {reviewBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!allPricingRowsLoaded && cart.length > 0 ? (
                <p className="rounded-control border border-info/25 bg-info-soft p-3 text-xs leading-5 text-info">
                  The visible lookup is filtered or paged. The server review
                  will revalidate every selected price and stock version.
                </p>
              ) : null}
            </div>
            {capabilities.canViewProfit ? (
              <ProfitPreview review={review} />
            ) : null}
          </div>
        </aside>
      </div>

      {overlay === "customer" ? (
        <Overlay onClose={() => setOverlay(null)} title="Select customer">
          <div className="space-y-4">
            <button
              className="w-full rounded-control border border-line p-3 text-left text-sm font-bold hover:bg-surface-subtle"
              onClick={() => {
                setSelectedCustomer(null);
                setOverlay(null);
                resetReview();
              }}
              type="button"
            >
              Walk-in{" "}
              <span className="ml-1 font-normal text-ink-muted">
                — anonymous sale
              </span>
            </button>
            <input
              className="min-h-10 w-full rounded-control border border-line px-3 text-sm"
              maxLength={LIMITS.MAX_SEARCH_TERM_LENGTH}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Search name or Pakistani mobile"
              value={customerSearch}
            />
            {customers.isPending ? (
              <p className="py-6 text-center text-sm text-ink-muted">
                Loading customers…
              </p>
            ) : null}
            {customers.error === null ? null : (
              <PosError
                error={toApiError(customers.error)}
                retry={() => void customers.refetch()}
                title="Customers could not be loaded"
              />
            )}
            <div className="max-h-64 divide-y divide-line-subtle overflow-y-auto rounded-control border border-line">
              {(customers.data?.items ?? []).map((entry) => (
                <button
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-surface-subtle"
                  key={entry.id}
                  onClick={() => {
                    setSelectedCustomer(entry);
                    setOverlay(null);
                    resetReview();
                  }}
                  type="button"
                >
                  <span>
                    <strong className="block text-sm text-ink">
                      {entry.name}
                    </strong>
                    <span className="font-mono text-xs text-ink-muted">
                      {entry.phone}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] text-ink-muted">
                      {entry.purchaseCount} purchases ·{" "}
                      {formatPosMoney(
                        entry.lifetimeSpendMinor,
                        auth.data.organization.currency,
                      )}{" "}
                      spent
                    </span>
                  </span>
                  {entry.receivableBalanceMinor > 0 ? (
                    <span className="rounded-full bg-warning-soft px-2 py-1 text-[0.6875rem] font-bold text-warning">
                      Owes{" "}
                      {formatPosMoney(
                        entry.receivableBalanceMinor,
                        auth.data.organization.currency,
                      )}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {customers.data?.items.length === 0 ? (
              <p className="text-center text-xs text-ink-muted">
                No active customer matched.
              </p>
            ) : null}
            {capabilities.canManageCustomers ? (
              <div className="border-t border-line pt-4">
                <button
                  className="text-xs font-bold text-accent"
                  onClick={() => setQuickAddOpen((open) => !open)}
                  type="button"
                >
                  {quickAddOpen ? "Close quick add" : "+ Quick-add customer"}
                </button>
                {quickAddOpen ? (
                  <form
                    className="mt-3 grid gap-3"
                    onSubmit={submitQuickCustomer}
                  >
                    <label className="text-xs font-bold text-ink-subtle">
                      Full name
                      <input
                        className="mt-1 min-h-10 w-full rounded-control border border-line px-3 text-sm font-normal"
                        onChange={(event) =>
                          setCustomerName(event.target.value)
                        }
                        required
                        value={customerName}
                      />
                    </label>
                    <label className="text-xs font-bold text-ink-subtle">
                      Pakistani mobile
                      <input
                        className="mt-1 min-h-10 w-full rounded-control border border-line px-3 font-mono text-sm font-normal"
                        onChange={(event) =>
                          setCustomerPhone(event.target.value)
                        }
                        placeholder="0300 1234567"
                        required
                        value={customerPhone}
                      />
                    </label>
                    <label className="text-xs font-bold text-ink-subtle">
                      Marketing consent
                      <select
                        className="mt-1 min-h-10 w-full rounded-control border border-line px-3 text-sm font-normal"
                        onChange={(event) =>
                          setCustomerConsent(
                            event.target.value as typeof customerConsent,
                          )
                        }
                        value={customerConsent}
                      >
                        <option value="pending">Pending</option>
                        <option value="granted">Granted</option>
                        <option value="declined">Declined</option>
                      </select>
                    </label>
                    {customerMutation.error === null ? null : (
                      <PosError
                        error={toApiError(customerMutation.error)}
                        retry={() => customerMutation.mutate()}
                        title="Customer could not be created"
                      />
                    )}
                    <button
                      className="min-h-10 rounded-control bg-accent px-4 text-sm font-bold text-white disabled:opacity-45"
                      disabled={customerMutation.isPending}
                      type="submit"
                    >
                      {customerMutation.isPending
                        ? "Creating…"
                        : "Create and select"}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        </Overlay>
      ) : null}

      {overlay === "review" && review !== null ? (
        <Overlay
          footer={
            <>
              <button
                className="min-h-9 rounded-control border border-line px-3 text-xs font-bold"
                onClick={() => setOverlay(null)}
                type="button"
              >
                Back to sale
              </button>
              <button
                className="min-h-9 rounded-control bg-accent px-4 text-xs font-bold text-white disabled:opacity-45"
                disabled={!canConfirmPost}
                onClick={() => {
                  if (legs !== null && idempotencyKey !== null)
                    postMutation.mutate({
                      checked: review,
                      allocation: legs,
                      key: idempotencyKey,
                    });
                }}
                type="button"
              >
                {postMutation.isPending ? "Posting…" : "Confirm & post"}
              </button>
            </>
          }
          onClose={() => setOverlay(null)}
          title="Review & post sale"
        >
          <ReviewContent review={review} />
          {!serverPaymentMatches ? (
            <p className="mt-4 rounded-control border border-negative/25 bg-negative-soft p-3 text-xs text-negative">
              Payment allocation does not equal the server-reviewed total.
              Return to the sale and update payment legs.
            </p>
          ) : null}
          {postMutation.error === null ? null : (
            <div className="mt-4">
              <PosError
                error={toApiError(postMutation.error)}
                retry={() => {
                  if (legs !== null && idempotencyKey !== null)
                    postMutation.mutate({
                      checked: review,
                      allocation: legs,
                      key: idempotencyKey,
                    });
                }}
                title="Sale was not confirmed"
              />
            </div>
          )}
          <p className="mt-3 text-[0.6875rem] leading-5 text-ink-muted">
            Retry uses the same idempotency key, so an uncertain network
            response cannot create a duplicate sale.
          </p>
        </Overlay>
      ) : null}

      {overlay === "receipt" && posted !== null ? (
        <Overlay
          footer={
            <>
              <button
                className="min-h-9 rounded-control border border-line px-3 text-xs font-bold"
                onClick={() => window.print()}
                type="button"
              >
                Print
              </button>
              <button
                className="min-h-9 rounded-control bg-accent px-4 text-xs font-bold text-white"
                onClick={() => {
                  setOverlay(null);
                  setPosted(null);
                  setIdempotencyKey(null);
                  setNotice(
                    `Sale ${posted.receipt.invoiceNumber} posted successfully.`,
                  );
                }}
                type="button"
              >
                Done
              </button>
            </>
          }
          onClose={() => setOverlay(null)}
          title="Receipt ready"
        >
          {posted.idempotencyReplay ? (
            <p className="mb-3 rounded-control border border-info/25 bg-info-soft p-3 text-xs text-info">
              This is the existing receipt returned by an idempotent retry; no
              duplicate sale was created.
            </p>
          ) : null}
          <ReceiptContent receipt={posted.receipt} />
        </Overlay>
      ) : null}
    </div>
  );
}
