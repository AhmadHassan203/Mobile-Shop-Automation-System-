import {
  DashboardSnapshotSchema,
  type DashboardSnapshot,
} from "@mobileshop/shared";
import type { ApiClient } from "./client";
import { apiClient } from "./health";

export const dashboardSnapshotSchema = DashboardSnapshotSchema;
export type DashboardData = DashboardSnapshot;

/**
 * One permission-aware read model powers the dashboard. Keeping this as one
 * request prevents the browser from independently combining domain pages with
 * different scope, freshness, and pagination boundaries.
 */
export function getDashboard(
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<DashboardData> {
  return client.request("/reports/dashboard", {
    method: "GET",
    schema: dashboardSnapshotSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
