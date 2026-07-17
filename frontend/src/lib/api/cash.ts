import {
  CashSessionListQuerySchema,
  CashSessionPageSchema,
  CashSessionSchema,
  CloseCashSessionInputSchema,
  OpenCashSessionInputSchema,
  type CashSession,
  type CashSessionListQuery,
  type CashSessionPage,
  type CloseCashSessionInput,
  type OpenCashSessionInput,
} from "@mobileshop/shared";
import { type ApiClient, toApiError } from "./client";
import { apiClient } from "./health";

export const cashSessionSchema = CashSessionSchema;
export const cashSessionPageSchema = CashSessionPageSchema;
const currentCashSessionSchema = CashSessionSchema.nullable();

export type CashSessionListParameters = CashSessionListQuery;
export type CashSessionRecord = CashSession;
export type CashSessionList = CashSessionPage;

/**
 * The single open drawer session, or null when none is open.
 *
 * A "no open session" answer is normal, not an error: whether the API expresses
 * it as a null body or a 404, the browser sees null and offers to open one. Any
 * other failure (including an aborted request) is re-thrown unchanged.
 */
export function getCurrentCashSession(
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CashSessionRecord | null> {
  return client
    .request("/cash-sessions/current", {
      method: "GET",
      schema: currentCashSessionSchema,
      ...(signal === undefined ? {} : { signal }),
    })
    .catch((error: unknown) => {
      const apiError = toApiError(error);
      if (apiError.status === 404 || apiError.code === "NOT_FOUND") return null;
      throw apiError;
    });
}

function cashSessionListPath(parameters: CashSessionListParameters): string {
  const parsed = CashSessionListQuerySchema.parse(parameters);
  const query = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
  });
  if (parsed.status !== undefined) query.set("status", parsed.status);
  if (parsed.from !== undefined) query.set("from", parsed.from);
  if (parsed.to !== undefined) query.set("to", parsed.to);
  return `/cash-sessions?${query.toString()}`;
}

export function getCashSessions(
  parameters: CashSessionListParameters,
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CashSessionList> {
  return client.request(cashSessionListPath(parameters), {
    method: "GET",
    schema: cashSessionPageSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function openCashSession(
  input: OpenCashSessionInput,
  client: ApiClient = apiClient,
): Promise<CashSessionRecord> {
  const body = OpenCashSessionInputSchema.parse(input);
  return client.request("/cash-sessions", {
    method: "POST",
    schema: cashSessionSchema,
    json: body,
  });
}

export function closeCashSession(
  id: string,
  input: CloseCashSessionInput,
  client: ApiClient = apiClient,
): Promise<CashSessionRecord> {
  const body = CloseCashSessionInputSchema.parse(input);
  return client.request(`/cash-sessions/${encodeURIComponent(id)}/close`, {
    method: "POST",
    schema: cashSessionSchema,
    json: body,
  });
}
