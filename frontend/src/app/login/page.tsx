import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import {
  ActivityIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Secure sign-in to MobileShop OS.",
};

function LoginFormFallback() {
  return (
    <div
      aria-live="polite"
      className="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center"
      role="status"
    >
      <span className="size-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />
      <p className="mt-4 text-sm font-semibold text-ink">
        Preparing secure sign-in
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen overflow-hidden bg-app lg:grid-cols-[minmax(22rem,0.85fr)_minmax(30rem,1.15fr)]">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <section className="relative hidden overflow-hidden bg-sidebar px-10 py-12 text-sidebar-ink lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div
          aria-hidden="true"
          className="absolute -left-24 -top-24 size-80 rounded-full bg-accent/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -right-24 size-96 rounded-full bg-[#7b8dfb]/15 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-[0.6875rem] bg-gradient-to-br from-accent to-[#7b8dfb] text-lg font-extrabold text-white shadow-overlay">
            M
          </div>
          <div>
            <p className="text-base font-bold leading-tight text-white">
              MobileShop OS
            </p>
            <p className="mt-0.5 text-xs text-sidebar-muted">
              Retail operations workspace
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#aebafa]">
            Protected workspace
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.025em] text-white xl:text-4xl">
            Fast at the counter. Traceable behind every number.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-sidebar-ink">
            Secure sessions protect shop access. Operational routes will use the
            server-provided roles and permissions as those workflows are added.
          </p>

          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-white/10 text-[#b9c4fb]">
                <ShieldCheckIcon className="size-4" />
              </span>
              Server-verified identity and branch eligibility
            </li>
            <li className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-white/10 text-[#b9c4fb]">
                <CheckCircleIcon className="size-4" />
              </span>
              Secure HTTP-only session cookies
            </li>
            <li className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-white/10 text-[#b9c4fb]">
                <ActivityIcon className="size-4" />
              </span>
              Server-provided organization context
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-muted">
          Credentials are submitted only to the configured authentication API.
        </p>
      </section>

      <section className="flex min-w-0 items-center justify-center px-4 py-16 sm:px-8 lg:py-12">
        <div className="w-full max-w-[29rem]">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="grid size-9 place-items-center rounded-[0.5625rem] bg-gradient-to-br from-accent to-[#7b8dfb] font-extrabold text-white">
              M
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-ink">
                MobileShop OS
              </p>
              <p className="text-[0.6875rem] text-ink-muted">
                Secure shop access
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <Suspense fallback={<LoginFormFallback />}>
              <LoginForm />
            </Suspense>
          </div>

          <p className="mt-5 text-center text-xs text-ink-muted">
            Need access? Contact your shop owner or administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
