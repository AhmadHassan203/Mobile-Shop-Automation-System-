import { queryOptions } from "@tanstack/react-query";
import { getPosLookup, type PosLookupParameters } from "@/lib/api/pricing";
import { queryKeys } from "./keys";

export function posLookupQueryOptions(
  parameters: PosLookupParameters,
  enabled = true,
) {
  return queryOptions({
    queryKey: queryKeys.posLookup(parameters),
    queryFn: ({ signal }) => getPosLookup(parameters, signal),
    enabled,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}
