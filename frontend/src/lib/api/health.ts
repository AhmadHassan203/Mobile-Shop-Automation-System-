import { z } from "zod";
import { ApiClient } from "./client";
import { getApiBaseUrl } from "@/lib/env";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  name: z.string().min(1),
  apiVersion: z.string().regex(/^v\d+$/),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiClient = new ApiClient(getApiBaseUrl());

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiClient.request("/health", {
    method: "GET",
    schema: healthResponseSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
