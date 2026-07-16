import { queryOptions } from "@tanstack/react-query";
import { getDashboard } from "@/lib/api/dashboard";
import { queryKeys } from "./keys";

export const dashboardQueryOptions = queryOptions({
  queryKey: queryKeys.dashboard,
  queryFn: ({ signal }) => getDashboard(signal),
  staleTime: 30_000,
  meta: { authDependent: true },
});
