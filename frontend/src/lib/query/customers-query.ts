import { queryOptions } from "@tanstack/react-query";
import {
  getCustomer,
  getCustomers,
  type CustomerListParameters,
} from "@/lib/api/customers";
import { queryKeys } from "./keys";

export function customersQueryOptions(
  parameters: CustomerListParameters,
  enabled = true,
) {
  return queryOptions({
    queryKey: queryKeys.customers(parameters),
    queryFn: ({ signal }) => getCustomers(parameters, signal),
    enabled,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}

export function customerQueryOptions(id: string, enabled = true) {
  return queryOptions({
    queryKey: queryKeys.customer(id),
    queryFn: ({ signal }) => getCustomer(id, signal),
    enabled,
    staleTime: 15_000,
    meta: { authDependent: true },
  });
}
