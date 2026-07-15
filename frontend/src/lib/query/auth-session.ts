import type { Query, QueryClient, QueryFilters } from "@tanstack/react-query";
import { logout } from "@/lib/api/auth";
import { scheduleSessionExpiry } from "@/lib/auth/session-expiry";

export type LogoutRequest = () => Promise<null>;

export function purgeAuthDependentQueries(queryClient: QueryClient): void {
  const filters = {
    predicate: (query: Query) =>
      query.queryKey[0] === "auth" || query.meta?.authDependent === true,
  } satisfies QueryFilters;

  // Cancellation starts synchronously; removal then prevents a late response
  // from restoring private data after logout or absolute session expiry.
  void queryClient.cancelQueries(filters, { silent: true });
  queryClient.removeQueries(filters);
}

export function scheduleAuthSessionExpiry(
  queryClient: QueryClient,
  expiresAt: string,
  onExpired: () => void,
): () => void {
  return scheduleSessionExpiry(expiresAt, () => {
    purgeAuthDependentQueries(queryClient);
    onExpired();
  });
}

/**
 * Revoke server state before touching the local cache. If the request fails,
 * callers must continue treating the browser session as potentially active.
 */
export async function logoutAndClearCurrentAuth(
  queryClient: QueryClient,
  request: LogoutRequest = logout,
): Promise<void> {
  await request();
  purgeAuthDependentQueries(queryClient);
}
