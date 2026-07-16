import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CreateReturnDraftInput,
  ExchangeReturnInput,
  PostReturnInput,
} from "@mobileshop/shared";
import {
  createReturn,
  exchangeReturn,
  getReturn,
  getReturnEligibility,
  getReturns,
  postReturn,
  type ReturnEligibilityParameters,
  type ReturnListParameters,
} from "@/lib/api/returns";
import { queryKeys } from "./keys";

const listDefaults = {
  placeholderData: keepPreviousData,
  staleTime: 10_000,
  meta: { authDependent: true },
} as const;

export function returnsQueryOptions(
  parameters: ReturnListParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.returns(parameters),
    queryFn: ({ signal }) => getReturns(parameters, signal),
    enabled,
    ...listDefaults,
  });
}

export function returnQueryOptions(id: string, enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.return(id),
    queryFn: ({ signal }) => getReturn(id, signal),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

export function returnEligibilityQueryOptions(
  query: ReturnEligibilityParameters,
  enabled: boolean,
) {
  return queryOptions({
    queryKey: queryKeys.returnEligibility(query),
    queryFn: ({ signal }) => getReturnEligibility(query, signal),
    enabled,
    staleTime: 10_000,
    meta: { authDependent: true },
  });
}

/**
 * Persist a return draft and refresh every returns list plus the new record.
 * Nothing is optimistically inserted — the queue re-reads the server page.
 */
export function useCreateReturnMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReturnDraftInput) => createReturn(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.returnsRoot });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.return(created.id),
      });
    },
  });
}

/** Post a return under an idempotency key, invalidating the queue and detail. */
export function usePostReturnMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      idempotencyKey,
    }: {
      readonly id: string;
      readonly input: PostReturnInput;
      readonly idempotencyKey: string;
    }) => postReturn(id, input, idempotencyKey),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.returnsRoot });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.return(result.return.id),
      });
    },
  });
}

/**
 * Request an exchange. The backend answers with a CONFLICT while safe exchange
 * posting is deferred, so this only ever surfaces that reason; the affected
 * record is still invalidated so an eventual success re-reads server truth.
 */
export function useExchangeReturnMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      readonly id: string;
      readonly input: ExchangeReturnInput;
    }) => exchangeReturn(id, input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.returnsRoot });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.return(result.id),
      });
    },
  });
}
