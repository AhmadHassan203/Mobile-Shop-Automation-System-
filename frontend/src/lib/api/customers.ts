import {
  CreateCustomerInputSchema,
  CustomerDetailSchema,
  CustomerListQuerySchema,
  CustomerPageSchema,
  CustomerVersionInputSchema,
  UpdateCustomerInputSchema,
  type CreateCustomerInput,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerPage,
  type UpdateCustomerInput,
} from "@mobileshop/shared";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const customerPageSchema = CustomerPageSchema;
export const customerDetailSchema = CustomerDetailSchema;
export type CustomerListParameters = CustomerListQuery;
export type CustomerList = CustomerPage;
export type CustomerRecord = CustomerDetail;

function customerListPath(parameters: CustomerListParameters): string {
  const parsed = CustomerListQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
    sort: parsed.sort,
    direction: parsed.direction,
  });
  if (parsed.q !== undefined) query.set("q", parsed.q);
  if (parsed.hasReceivable !== undefined) {
    query.set("hasReceivable", String(parsed.hasReceivable));
  }
  if (parsed.active !== undefined) query.set("active", String(parsed.active));
  return `/customers?${query.toString()}`;
}

export function getCustomers(
  parameters: CustomerListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CustomerList> {
  return client.request(customerListPath(parameters), {
    method: "GET",
    schema: customerPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function getCustomer(
  id: string,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CustomerRecord> {
  return client.request(`/customers/${encodeURIComponent(id)}`, {
    method: "GET",
    schema: customerDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function createCustomer(
  input: CreateCustomerInput,
  client: ApiClient = apiClient,
): Promise<CustomerRecord> {
  return client.request("/customers", {
    method: "POST",
    schema: customerDetailSchema,
    json: CreateCustomerInputSchema.parse(input),
  });
}

export function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  client: ApiClient = apiClient,
): Promise<CustomerRecord> {
  return client.request(`/customers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    schema: customerDetailSchema,
    json: UpdateCustomerInputSchema.parse(input),
  });
}

export function setCustomerActive(
  id: string,
  version: number,
  active: boolean,
  client: ApiClient = apiClient,
): Promise<CustomerRecord> {
  const action = active ? "activate" : "deactivate";
  return client.request(`/customers/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    schema: customerDetailSchema,
    json: CustomerVersionInputSchema.parse({ version }),
  });
}
