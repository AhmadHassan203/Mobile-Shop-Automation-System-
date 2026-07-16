"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useRef,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  CatalogForbiddenState,
  CatalogTableSkeleton,
} from "@/components/catalog/catalog-states";
import { LayersIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { PurchaseOrdersTab } from "./purchase-orders-tab";
import {
  PURCHASING_TABS,
  nextPurchasingTabIndex,
  purchasingCapabilities,
  purchasingTabFrom,
  purchasingTabQuery,
  type PurchasingTabId,
} from "./purchasing-state";
import { ReceiptsTab } from "./receipts-tab";
import { SuppliersTab } from "./suppliers-tab";

export function PurchasingRouteFallback(): JSX.Element {
  return (
    <div
      aria-label="Loading purchasing workspace"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading purchasing workspace</span>
      <div className="h-24 animate-pulse rounded-card bg-line-subtle" />
      <div className="h-12 animate-pulse rounded-card bg-line-subtle" />
      <CatalogTableSkeleton rows={7} />
    </div>
  );
}

export function PurchasingWorkspace(): JSX.Element {
  const auth = useQuery(currentAuthQueryOptions);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (auth.data === undefined) return <PurchasingRouteFallback />;

  const capabilities = purchasingCapabilities(auth.data.permissions);
  const allowedTabs = PURCHASING_TABS.filter((tab) =>
    tab.id === "suppliers"
      ? capabilities.canViewSuppliers
      : capabilities.canViewPurchases,
  );
  const requestedTab = purchasingTabFrom(
    new URLSearchParams(searchParams.toString()),
  );
  const activeTab =
    allowedTabs.find((tab) => tab.id === requestedTab)?.id ??
    allowedTabs[0]?.id;

  if (activeTab === undefined) {
    return (
      <div className="space-y-4">
        <WorkspaceHeader />
        <CatalogForbiddenState
          description="Your session has neither purchases.view nor suppliers.view. No purchasing request was sent. Ask an administrator for the workflow permission you need."
          title="Purchasing access required"
        />
      </div>
    );
  }

  const selectTab = (tab: PurchasingTabId): void => {
    const query = purchasingTabQuery(
      new URLSearchParams(searchParams.toString()),
      tab,
    );
    router.replace(query.length === 0 ? pathname : `${pathname}?${query}`);
  };

  const onTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    current: number,
  ): void => {
    const next = nextPurchasingTabIndex(current, event.key, allowedTabs.length);
    if (next === null) return;
    event.preventDefault();
    const tab = allowedTabs[next];
    if (tab === undefined) return;
    selectTab(tab.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-4">
      <WorkspaceHeader />

      <div className="overflow-x-auto rounded-card border border-line bg-surface px-2 shadow-card">
        <div
          aria-label="Purchasing areas"
          className="flex min-w-max gap-1"
          role="tablist"
        >
          {allowedTabs.map((tab, index) => {
            const selected = tab.id === activeTab;
            return (
              <button
                aria-controls={`purchasing-panel-${tab.id}`}
                aria-selected={selected}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  selected
                    ? "border-accent text-accent"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
                id={`purchasing-tab-${tab.id}`}
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <section
        aria-labelledby={`purchasing-tab-${activeTab}`}
        id={`purchasing-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === "orders" ? (
          <PurchaseOrdersTab canViewSuppliers={capabilities.canViewSuppliers} />
        ) : activeTab === "suppliers" ? (
          <SuppliersTab />
        ) : (
          <ReceiptsTab canViewSuppliers={capabilities.canViewSuppliers} />
        )}
      </section>
    </div>
  );
}

function WorkspaceHeader(): JSX.Element {
  return (
    <header className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
            <LayersIcon className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.09em] text-accent">
              Purchasing · Procurement control
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
              Purchasing workspace
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Manage suppliers and purchase lifecycles, then post physical
              receipts into stock, landed valuation, and supplier payables as
              one reconciled transaction.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1.5 text-xs font-bold text-positive">
          <ShieldCheckIcon className="size-4" /> API-backed · permission scoped
        </span>
      </div>
      <div className="mt-4 grid gap-3 border-t border-line pt-4 text-xs text-ink-muted sm:grid-cols-3">
        <p>
          <strong className="block text-ink">Draft first</strong>
          Creating an order changes neither stock nor payables.
        </p>
        <p>
          <strong className="block text-ink">Physical receipt</strong>
          Only remaining quantities can be received into active locations.
        </p>
        <p>
          <strong className="block text-ink">Exact reconciliation</strong>
          Product cost becomes payable; landed cost capitalizes into inventory.
        </p>
      </div>
    </header>
  );
}
