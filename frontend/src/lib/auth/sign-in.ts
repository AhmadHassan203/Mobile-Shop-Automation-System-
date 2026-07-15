import type { QueryClient } from "@tanstack/react-query";
import { login, type CurrentAuth, type LoginInput } from "@/lib/api/auth";
import { queryKeys } from "@/lib/query/keys";

export type LoginRequest = (input: LoginInput) => Promise<CurrentAuth>;

/**
 * Authenticate without routing the password through TanStack MutationCache.
 * Only the validated server response is written to QueryCache.
 */
export async function signInAndCacheCurrentAuth(
  queryClient: QueryClient,
  credentials: LoginInput,
  request: LoginRequest = login,
): Promise<CurrentAuth> {
  const currentAuth = await request(credentials);
  queryClient.setQueryData(queryKeys.currentAuth, currentAuth);
  return currentAuth;
}
