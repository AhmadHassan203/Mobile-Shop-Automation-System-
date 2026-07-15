import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { getCurrentAuth, isEndedSessionError } from "@/lib/api/auth";
import { queryKeys } from "./keys";

export const currentAuthQueryOptions = queryOptions({
  queryKey: queryKeys.currentAuth,
  queryFn: ({ signal }) => getCurrentAuth(signal),
  staleTime: 30_000,
  refetchInterval: 60_000,
  refetchOnWindowFocus: "always",
  meta: { authDependent: true },
  retry: (failureCount, error) => {
    if (isEndedSessionError(error)) return false;
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500
    ) {
      return false;
    }
    return failureCount < 1;
  },
});
