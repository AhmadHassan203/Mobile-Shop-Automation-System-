import { queryOptions } from "@tanstack/react-query";
import { getHealth } from "@/lib/api/health";
import { queryKeys } from "./keys";

export const healthQueryOptions = queryOptions({
  queryKey: queryKeys.health,
  queryFn: ({ signal }) => getHealth(signal),
  staleTime: 15_000,
});
