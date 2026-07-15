"use client";

import { PERMISSIONS } from "@mobileshop/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SessionStatus } from "@/components/auth/session-status";
import {
  ActivityIcon,
  BoxIcon,
  CloseIcon,
  MenuIcon,
} from "@/components/ui/icons";
import { ApiStatusPill } from "@/components/system-status/api-status-pill";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { BusinessClock } from "./business-clock";
import { ThemeToggle } from "./theme-toggle";

export interface AppShellProps {
  readonly children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const auth = useQuery(currentAuthQueryOptions);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const canViewCatalog =
    auth.data?.permissions.includes(PERMISSIONS.CATALOG_VIEW) === true;

  const navClass = (active: boolean): string =>
    `flex items-center gap-2.5 rounded-control px-3 py-2 text-[0.84375rem] font-semibold no-underline transition-colors ${
      active
        ? "bg-accent text-white"
        : "text-sidebar-ink hover:bg-sidebar-hover hover:text-white"
    }`;

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
          className={`fixed inset-y-0 left-0 z-50 flex w-[15.25rem] shrink-0 flex-col overflow-y-auto bg-sidebar text-sidebar-ink shadow-overlay transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${
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
                Production workspace
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

          <nav className="px-2.5 py-1" aria-label="System">
            <p className="px-2.5 pb-1 pt-2 text-[0.65625rem] font-bold uppercase tracking-[0.09em] text-sidebar-muted">
              System
            </p>
            <Link
              aria-current={pathname === "/" ? "page" : undefined}
              className={navClass(pathname === "/")}
              href="/"
              onClick={() => setNavigationOpen(false)}
            >
              <ActivityIcon className="size-[1.125rem] shrink-0" />
              System status
            </Link>
          </nav>

          {canViewCatalog ? (
            <nav className="px-2.5 py-1" aria-label="Stock">
              <p className="px-2.5 pb-1 pt-3 text-[0.65625rem] font-bold uppercase tracking-[0.09em] text-sidebar-muted">
                Stock
              </p>
              <Link
                aria-current={
                  pathname === "/inventory" ||
                  pathname.startsWith("/inventory/")
                    ? "page"
                    : undefined
                }
                className={navClass(
                  pathname === "/inventory" ||
                    pathname.startsWith("/inventory/"),
                )}
                href="/inventory"
                onClick={() => setNavigationOpen(false)}
              >
                <BoxIcon className="size-[1.125rem] shrink-0" />
                Product catalog
              </Link>
            </nav>
          ) : null}

          <div className="mt-auto border-t border-white/10 px-[1.125rem] py-4 text-[0.6875rem] leading-relaxed text-sidebar-muted">
            Navigation is limited to workflows backed by real APIs and your
            server-provided permissions.
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
            <div className="ml-auto flex items-center gap-2.5">
              <div className="hidden sm:block">
                <ApiStatusPill />
              </div>
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
