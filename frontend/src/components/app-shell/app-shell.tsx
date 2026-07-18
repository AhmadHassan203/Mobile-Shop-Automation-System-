"use client";

import { PERMISSIONS } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { SessionStatus } from "@/components/auth/session-status";
import {
  ActivityIcon,
  BellIcon,
  BoxIcon,
  CalendarCheckIcon,
  CartIcon,
  ChartIcon,
  CloseIcon,
  DashboardIcon,
  FinanceIcon,
  LayersIcon,
  LightbulbIcon,
  MenuIcon,
  MessageIcon,
  PhoneCheckIcon,
  ReturnIcon,
  SearchIcon,
  SettingsIcon,
  TasksIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  WrenchIcon,
} from "@/components/ui/icons";
import { ApiStatusPill } from "@/components/system-status/api-status-pill";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { BusinessClock } from "./business-clock";
import { ThemeToggle } from "./theme-toggle";

export interface AppShellProps {
  readonly children: ReactNode;
}

type ModuleStatus = "ready" | "building" | "planned";

interface ModuleNavigationItem {
  readonly label: string;
  readonly href?: string;
  readonly icon: ComponentType<{ readonly className?: string }>;
  readonly status: ModuleStatus;
  readonly permissions?: readonly string[];
  /**
   * Temporarily hidden for the MVP release; the entry (and its route/backend)
   * is retained for future activation — flip this off to restore it.
   */
  readonly hidden?: boolean;
}

interface ModuleNavigationGroup {
  readonly label: string;
  readonly items: readonly ModuleNavigationItem[];
}

export const MODULE_NAVIGATION: readonly ModuleNavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: DashboardIcon,
        status: "ready",
      },
    ],
  },
  {
    label: "Sell",
    items: [
      {
        label: "Sell (POS)",
        href: "/sell",
        icon: CartIcon,
        status: "ready",
        permissions: [PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_CREATE],
      },
      {
        label: "Sale records",
        href: "/sales",
        icon: ChartIcon,
        status: "ready",
        permissions: [PERMISSIONS.SALES_VIEW],
      },
      {
        label: "Demand",
        href: "/demand",
        icon: MessageIcon,
        status: "ready",
        permissions: [PERMISSIONS.DEMAND_VIEW, PERMISSIONS.DEMAND_CREATE],
      },
      {
        // Temporarily hidden for MVP release; feature retained for future activation.
        label: "Customers",
        href: "/customers",
        icon: UsersIcon,
        status: "ready",
        permissions: [PERMISSIONS.CUSTOMERS_VIEW],
        hidden: true,
      },
    ],
  },
  {
    label: "Stock",
    items: [
      // STOCK is deliberately three entries: Product Catalog (identity + barcode),
      // Purchasing (all receiving + supplier + goods-receipt workflows as tabs),
      // and Stocks (current balances/movements/locations). Every stock-in flow
      // now lives inside Purchasing → Add Stock or Product Catalog.
      {
        label: "Product catalog",
        href: "/inventory",
        icon: BoxIcon,
        status: "ready",
        permissions: [PERMISSIONS.CATALOG_VIEW],
      },
      {
        label: "Purchasing",
        href: "/purchases",
        icon: CartIcon,
        status: "ready",
        permissions: [PERMISSIONS.PURCHASES_VIEW],
      },
      {
        label: "Stocks",
        href: "/stock",
        icon: LayersIcon,
        status: "ready",
        permissions: [PERMISSIONS.INVENTORY_VIEW],
      },
      // Temporarily hidden for MVP release; consolidated into Purchasing → Add
      // Stock (Quick/Bulk stock-in) and Product Catalog (barcode). Routes now
      // redirect; the components/backends are retained for future activation.
      {
        label: "Quick Stock In",
        href: "/stock/quick-stock-in",
        icon: LayersIcon,
        status: "ready",
        permissions: [PERMISSIONS.PURCHASES_RECEIVE],
        hidden: true,
      },
      {
        label: "Bulk Stock In",
        href: "/stock/bulk-stock-in",
        icon: BoxIcon,
        status: "ready",
        permissions: [PERMISSIONS.PURCHASES_RECEIVE],
        hidden: true,
      },
      {
        label: "Barcode Stock In",
        href: "/stock/barcode-stock-in",
        icon: PhoneCheckIcon,
        status: "ready",
        permissions: [PERMISSIONS.PURCHASES_RECEIVE],
        hidden: true,
      },
      {
        // Consolidated into Purchasing → Suppliers tab. Retained for future activation.
        label: "Suppliers",
        href: "/purchases?tab=suppliers",
        icon: TruckIcon,
        status: "ready",
        permissions: [PERMISSIONS.SUPPLIERS_VIEW],
        hidden: true,
      },
      {
        // Consolidated into Purchasing → Receipts tab. Retained for future activation.
        label: "Goods receipts",
        href: "/purchases?tab=receipts",
        icon: TruckIcon,
        status: "ready",
        permissions: [PERMISSIONS.PURCHASES_VIEW],
        hidden: true,
      },
    ],
  },
  {
    label: "Service",
    items: [
      {
        label: "Returns / warranty",
        href: "/returns",
        icon: ReturnIcon,
        status: "ready",
        permissions: [PERMISSIONS.RETURNS_VIEW],
      },
      {
        // Temporarily hidden for MVP release; retained for possible future activation.
        label: "Repairs",
        href: "/repairs",
        icon: WrenchIcon,
        status: "building",
        hidden: true,
      },
      {
        // Temporarily hidden for MVP release; retained for possible future activation.
        label: "Used intake",
        href: "/used-intake",
        icon: PhoneCheckIcon,
        status: "building",
        hidden: true,
      },
    ],
  },
  {
    label: "Money",
    items: [
      {
        label: "Finance",
        href: "/finance",
        icon: FinanceIcon,
        status: "ready",
        permissions: [
          PERMISSIONS.LEDGER_VIEW,
          PERMISSIONS.EXPENSES_VIEW,
          PERMISSIONS.RECEIVABLES_VIEW,
          PERMISSIONS.PAYABLES_VIEW,
        ],
      },
      {
        label: "Daily closing",
        href: "/closing",
        icon: CalendarCheckIcon,
        status: "ready",
        permissions: [PERMISSIONS.CASH_SESSIONS_VIEW],
      },
    ],
  },
  {
    label: "Digital services",
    items: [
      {
        label: "New transaction",
        href: "/digital/new",
        icon: WalletIcon,
        status: "ready",
        permissions: [PERMISSIONS.EXTERNAL_SERVICES_VIEW],
      },
      {
        label: "Transaction history",
        href: "/digital/history",
        icon: ChartIcon,
        status: "ready",
        permissions: [PERMISSIONS.EXTERNAL_SERVICES_VIEW],
      },
      {
        label: "Service balances",
        href: "/digital/balances",
        icon: FinanceIcon,
        status: "ready",
        permissions: [PERMISSIONS.EXTERNAL_SERVICES_VIEW],
      },
      {
        // Temporarily hidden for MVP release; feature retained for future activation.
        label: "Commission report",
        href: "/digital/commission",
        icon: ChartIcon,
        status: "ready",
        permissions: [PERMISSIONS.EXTERNAL_SERVICES_VIEW],
        hidden: true,
      },
      {
        // Temporarily hidden for MVP release; retained for possible future activation.
        label: "Reconciliation",
        href: "/digital/reconciliation",
        icon: CalendarCheckIcon,
        status: "building",
        permissions: [PERMISSIONS.EXTERNAL_SERVICES_VIEW],
        hidden: true,
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        label: "Reorder intelligence",
        href: "/intelligence",
        icon: LightbulbIcon,
        status: "ready",
        permissions: [PERMISSIONS.RECOMMENDATIONS_VIEW],
      },
      {
        label: "Reports",
        href: "/reports",
        icon: ChartIcon,
        status: "ready",
        permissions: [PERMISSIONS.REPORTS_VIEW],
      },
      {
        // Temporarily hidden for MVP release; feature retained for future activation.
        label: "Tasks",
        href: "/tasks",
        icon: TasksIcon,
        status: "building",
        hidden: true,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        // Temporarily hidden for MVP release; retained for possible future activation.
        label: "Settings",
        href: "/settings",
        icon: SettingsIcon,
        status: "building",
        permissions: [PERMISSIONS.SETTINGS_VIEW],
        hidden: true,
      },
      {
        // Temporarily hidden for MVP release; feature retained for future activation.
        label: "System status",
        href: "/status",
        icon: ActivityIcon,
        status: "ready",
        hidden: true,
      },
    ],
  },
] as const;

const STATUS_LABELS: Readonly<Record<ModuleStatus, string>> = {
  ready: "Ready",
  building: "Building",
  planned: "Planned",
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const auth = useQuery(currentAuthQueryOptions);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const grantedPermissions = auth.data?.permissions ?? [];

  const navClass = (active: boolean): string =>
    `flex min-w-0 items-center gap-2.5 rounded-control px-3 py-2 text-[0.8125rem] font-semibold no-underline transition-colors ${
      active
        ? "bg-accent text-white"
        : "text-sidebar-ink hover:bg-sidebar-hover hover:text-white"
    }`;

  const isVisible = (item: ModuleNavigationItem): boolean => {
    // Temporarily hidden for MVP release; feature retained for future activation.
    if (item.hidden === true) return false;
    return (
      item.permissions === undefined ||
      item.permissions.some((permission) =>
        grantedPermissions.includes(permission),
      )
    );
  };

  const isActive = (item: ModuleNavigationItem): boolean => {
    if (item.href === undefined) return false;
    // Purchasing is now a single consolidated entry whose tabs live in the query
    // string, so it highlights for any /purchases tab rather than one specific tab.
    const [route] = item.href.split("?");
    if (route === undefined) return false;
    return pathname === route || pathname.startsWith(`${route}/`);
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setNavigationOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <>
      <a
        className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-control bg-accent px-4 py-2 font-semibold text-white shadow-overlay transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>

      <div className="flex min-h-screen">
        {navigationOpen ? (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/45 lg:hidden"
            onClick={() => setNavigationOpen(false)}
            type="button"
          />
        ) : null}

        <aside
          aria-label="Primary navigation"
          className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-ink shadow-overlay transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${
            navigationOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          id="primary-navigation"
        >
          <div className="flex items-center gap-2.5 px-[1.125rem] py-4">
            <div className="grid size-[2.125rem] shrink-0 place-items-center rounded-[0.5625rem] bg-gradient-to-br from-accent to-[#7b8dfb] font-extrabold text-white">
              M
            </div>
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-bold leading-tight text-white">
                MobileShop OS
              </p>
              <p className="truncate text-[0.6875rem] text-sidebar-muted">
                {auth.data?.organization.name ?? "Loading shop…"}
              </p>
            </div>
            <button
              aria-label="Close navigation"
              className="ml-auto grid size-9 place-items-center rounded-control text-sidebar-ink hover:bg-sidebar-hover hover:text-white lg:hidden"
              onClick={() => setNavigationOpen(false)}
              type="button"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>

          {MODULE_NAVIGATION.map((group) => {
            const visibleItems = group.items.filter(isVisible);
            if (visibleItems.length === 0) return null;
            return (
              <nav
                aria-label={group.label}
                className="px-2.5 py-1"
                key={group.label}
              >
                <p className="px-2.5 pb-1 pt-3 text-[0.65625rem] font-bold uppercase tracking-[0.09em] text-sidebar-muted">
                  {group.label}
                </p>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item);
                  const statusClass =
                    item.status === "ready"
                      ? "bg-positive/20 text-[#8ce6b5]"
                      : item.status === "building"
                        ? "bg-warning/20 text-[#ffd187]"
                        : "bg-white/8 text-sidebar-muted";
                  const content = (
                    <>
                      <Icon className="size-[1.125rem] shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide ${statusClass}`}
                      >
                        {STATUS_LABELS[item.status]}
                      </span>
                    </>
                  );

                  return item.href === undefined ? (
                    <div
                      aria-disabled="true"
                      className="flex min-w-0 cursor-default items-center gap-2.5 rounded-control px-3 py-2 text-[0.8125rem] font-semibold text-sidebar-muted"
                      key={item.label}
                      title={`${item.label} is on the frontend build roadmap`}
                    >
                      {content}
                    </div>
                  ) : (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={navClass(active)}
                      href={item.href}
                      key={item.label}
                      onClick={() => setNavigationOpen(false)}
                    >
                      {content}
                    </Link>
                  );
                })}
              </nav>
            );
          })}

          <div className="mt-auto border-t border-white/10 px-[1.125rem] py-4 text-[0.6875rem] leading-relaxed text-sidebar-muted">
            Ready items open real API-backed workflows. Building items are being
            completed now; Planned items are next in the frontend queue.
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
            <button
              aria-controls="primary-navigation"
              aria-expanded={navigationOpen}
              aria-label="Open navigation"
              className="grid size-9 shrink-0 place-items-center rounded-control border border-line bg-surface text-ink-subtle hover:bg-surface-subtle lg:hidden"
              onClick={() => setNavigationOpen(true)}
              type="button"
            >
              <MenuIcon className="size-5" />
            </button>
            <BusinessClock />
            <form
              action="/inventory"
              className="relative hidden min-w-0 max-w-[28.75rem] flex-1 xl:block"
              method="get"
              role="search"
            >
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                aria-label="Search product catalog"
                className="h-9 w-full rounded-control border border-line bg-surface-subtle pl-9 pr-3 text-[0.8125rem] text-ink outline-none transition focus:border-accent focus:bg-surface"
                name="q"
                placeholder="Search products, IMEI, customers, invoices…"
                title="Product search is live; IMEI, customer and invoice search will join this command as their modules are completed."
                type="search"
              />
            </form>
            <div className="ml-auto flex items-center gap-2.5">
              {grantedPermissions.includes(PERMISSIONS.CASH_SESSIONS_VIEW) ? (
                <Link
                  className="hidden items-center gap-1.5 rounded-full bg-line-subtle px-2.5 py-1.5 text-xs font-semibold text-ink-muted no-underline xl:inline-flex"
                  href="/closing"
                  title="Cash-session state will appear when the Closing backend is live."
                >
                  <span className="size-1.5 rounded-full bg-ink-muted" />
                  Cash session pending
                </Link>
              ) : null}
              <div className="hidden sm:block">
                <ApiStatusPill />
              </div>
              <Link
                aria-label="Open tasks and notifications"
                className="hidden size-9 place-items-center rounded-control border border-line bg-surface text-ink-muted no-underline transition-colors hover:bg-surface-subtle hover:text-ink sm:grid"
                href="/tasks"
                title="Tasks and notifications"
              >
                <BellIcon className="size-4" />
              </Link>
              <SessionStatus />
              <ThemeToggle />
            </div>
          </header>

          <main
            className="mx-auto w-full max-w-[85rem] flex-1 px-4 py-5 sm:px-6 sm:py-[1.375rem]"
            id="main-content"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
