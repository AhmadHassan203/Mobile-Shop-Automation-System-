"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  LogInIcon,
  LogOutIcon,
} from "@/components/ui/icons";
import {
  isEndedSessionError,
  isExpiredSessionError,
  logout,
  logoutErrorMessage,
} from "@/lib/api/auth";
import { toApiError } from "@/lib/api/client";
import { currentAuthQueryOptions } from "@/lib/query/auth-query";
import { logoutAndClearCurrentAuth } from "@/lib/query/auth-session";

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SessionStatus() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useQuery(currentAuthQueryOptions);
  const signOut = useMutation({
    mutationFn: () => logoutAndClearCurrentAuth(queryClient, logout),
    onSuccess: () => {
      router.replace("/login?reason=signed-out");
    },
  });

  if (auth.isPending) {
    return (
      <span className="hidden h-9 w-24 animate-pulse rounded-full bg-line-subtle sm:block">
        <span className="sr-only">Checking session</span>
      </span>
    );
  }

  if (auth.error !== null && isEndedSessionError(auth.error)) {
    const expired = isExpiredSessionError(auth.error);
    return (
      <Link
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-control border px-2.5 text-xs font-semibold no-underline transition-colors sm:px-3 ${
          expired
            ? "border-warning/30 bg-warning-soft text-warning hover:border-warning/60"
            : "border-line bg-surface text-ink-subtle hover:bg-surface-subtle"
        }`}
        href={expired ? "/login?reason=session-expired" : "/login"}
      >
        {expired ? (
          <AlertTriangleIcon className="size-3.5" />
        ) : (
          <LogInIcon className="size-3.5" />
        )}
        <span>{expired ? "Session expired" : "Sign in"}</span>
      </Link>
    );
  }

  if (auth.error !== null) {
    return (
      <span
        className="hidden min-h-9 items-center gap-1.5 rounded-control bg-negative-soft px-3 text-xs font-semibold text-negative sm:inline-flex"
        role="status"
      >
        <AlertTriangleIcon className="size-3.5" /> Session unavailable
      </span>
    );
  }

  if (auth.data === undefined) return null;

  const signOutError = signOut.isError ? toApiError(signOut.error) : null;

  return (
    <div className="relative flex min-w-0 items-center gap-2">
      <div
        aria-label={`Signed in as ${auth.data.user.fullName}`}
        className="flex min-w-0 items-center gap-2"
        title={`${auth.data.organization.name} · ${auth.data.branch.name}`}
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">
          {initials(auth.data.user.fullName) || "U"}
        </div>
        <div className="hidden min-w-0 md:block">
          <p className="max-w-36 truncate text-xs font-semibold text-ink">
            {auth.data.user.fullName}
          </p>
          <p className="max-w-36 truncate text-[0.6875rem] text-ink-muted">
            {auth.data.branch.name}
          </p>
        </div>
      </div>

      <button
        aria-label={signOut.isPending ? "Signing out" : "Sign out"}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink disabled:cursor-wait disabled:opacity-60"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
        title="Sign out"
        type="button"
      >
        {signOut.isPending ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
        ) : (
          <LogOutIcon className="size-4" />
        )}
      </button>

      {signOutError === null ? null : (
        <div
          className="absolute right-0 top-11 z-50 w-72 rounded-control border border-negative/25 bg-surface p-3 text-xs text-negative shadow-overlay"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <p className="font-semibold">Could not sign out</p>
              <p className="mt-1">{logoutErrorMessage(signOutError)}</p>
              {signOutError.requestId === undefined ? null : (
                <p className="mt-2 font-mono">Ref: {signOutError.requestId}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
