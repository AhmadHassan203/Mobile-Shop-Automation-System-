"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangleIcon, RefreshIcon } from "@/components/ui/icons";
import {
  isExpiredSessionError,
  isWorkspaceAccessEndedError,
} from "@/lib/api/auth";
import { buildLoginRedirect } from "@/lib/auth/navigation";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import {
  purgeAuthDependentQueries,
  scheduleAuthSessionExpiry,
} from "@/lib/query/auth-session";

export interface ProtectedWorkspaceProps {
  readonly children: ReactNode;
}

function SessionLoading({ redirecting = false }: { redirecting?: boolean }) {
  return (
    <main
      aria-live="polite"
      className="grid min-h-screen place-items-center bg-app p-4"
      role="status"
    >
      <div className="text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-[0.6875rem] bg-gradient-to-br from-accent to-[#7b8dfb] text-lg font-extrabold text-white shadow-card">
          M
        </div>
        <span className="mx-auto mt-5 block size-7 animate-spin rounded-full border-[3px] border-line border-t-accent" />
        <p className="mt-3 text-sm font-semibold text-ink">
          {redirecting
            ? "Returning to secure sign-in"
            : "Verifying workspace access"}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {redirecting
            ? "The previous session can no longer access this workspace."
            : "Checking the active server session and branch eligibility."}
        </p>
      </div>
    </main>
  );
}

export function ProtectedWorkspace({ children }: ProtectedWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const auth = useQuery(currentAuthQueryOptions);
  const expiresAt = auth.data?.session.expiresAt;
  const [locallyExpiredSession, setLocallyExpiredSession] = useState<
    string | null
  >(null);
  const apiAccessEnded = isWorkspaceAccessEndedError(auth.error);
  const sessionExpiredLocally =
    expiresAt !== undefined && locallyExpiredSession === expiresAt;
  const accessEnded = apiAccessEnded || sessionExpiredLocally;
  const redirectTarget = buildLoginRedirect(
    pathname,
    isExpiredSessionError(auth.error) || sessionExpiredLocally
      ? "session-expired"
      : undefined,
  );

  useEffect(() => {
    if (!apiAccessEnded) return;
    purgeAuthDependentQueries(queryClient);
    router.replace(redirectTarget);
  }, [apiAccessEnded, queryClient, redirectTarget, router]);

  useEffect(() => {
    if (expiresAt === undefined) return;

    return scheduleAuthSessionExpiry(queryClient, expiresAt, () => {
      setLocallyExpiredSession(expiresAt);
      router.replace(buildLoginRedirect(pathname, "session-expired"));
    });
  }, [expiresAt, pathname, queryClient, router]);

  if (auth.isPending) return <SessionLoading />;
  if (accessEnded) return <SessionLoading redirecting />;

  if (auth.data === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-app p-4">
        <section
          className="w-full max-w-lg rounded-card border border-negative/25 bg-surface p-5 shadow-card"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
              <AlertTriangleIcon className="size-5" />
            </span>
            <div>
              <h1 className="text-base font-semibold text-ink">
                Workspace access could not be verified
              </h1>
              <p className="mt-1 text-[0.8125rem] text-ink-subtle">
                The authentication API did not confirm an active session. No
                protected workspace data has been rendered.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-control bg-accent px-3.5 py-2 text-[0.8125rem] font-semibold text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
                  disabled={auth.isFetching}
                  onClick={() => {
                    void auth.refetch();
                  }}
                  type="button"
                >
                  <RefreshIcon
                    className={`size-4 ${auth.isFetching ? "animate-spin" : ""}`}
                  />
                  {auth.isFetching ? "Checking…" : "Retry access check"}
                </button>
                <Link
                  className="inline-flex min-h-9 items-center rounded-control border border-line bg-surface px-3.5 py-2 text-[0.8125rem] font-semibold text-ink-subtle no-underline hover:bg-surface-subtle"
                  href={buildLoginRedirect(pathname)}
                >
                  Go to sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return children;
}
