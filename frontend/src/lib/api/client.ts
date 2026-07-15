import { REQUEST_ID_HEADER } from "@mobileshop/shared";
import { z } from "zod";

const apiErrorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
});

export interface ApiErrorOptions {
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly requestId?: string | undefined;
  readonly details?: Readonly<Record<string, readonly string[]>> | undefined;
  readonly cause?: unknown | undefined;
}

/** A safe client-side representation of both transport and backend errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly details: Readonly<Record<string, readonly string[]>> | undefined;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "UNKNOWN_ERROR";
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export interface ApiRequest<TResponse> extends Omit<RequestInit, "body"> {
  readonly schema: z.ZodType<TResponse>;
  readonly json?: unknown;
  readonly timeoutMs?: number;
}

export interface ApiClientOptions {
  readonly fetcher?: typeof fetch;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(baseUrl: string, options: ApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async request<TResponse>(
    path: string,
    options: ApiRequest<TResponse>,
  ): Promise<TResponse> {
    const { schema, json, timeoutMs = 10_000, ...requestInit } = options;
    const controller = new AbortController();
    let timedOut = false;

    const abortFromCaller = (): void => {
      controller.abort(requestInit.signal?.reason);
    };
    if (requestInit.signal?.aborted === true) {
      abortFromCaller();
    } else {
      requestInit.signal?.addEventListener("abort", abortFromCaller, {
        once: true,
      });
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const headers = new Headers(requestInit.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (json !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const fetchInit: RequestInit = {
      ...requestInit,
      credentials: requestInit.credentials ?? "include",
      headers,
      signal: controller.signal,
    };
    if (json !== undefined) fetchInit.body = JSON.stringify(json);

    let response: Response;
    try {
      response = await this.fetcher(this.urlFor(path), fetchInit);
    } catch (cause) {
      if (timedOut) {
        throw new ApiError("The API did not respond in time.", {
          code: "REQUEST_TIMEOUT",
          cause,
        });
      }
      if (controller.signal.aborted) {
        throw new ApiError("The API request was cancelled.", {
          code: "REQUEST_ABORTED",
          cause,
        });
      }
      throw new ApiError("The API could not be reached.", {
        code: "NETWORK_ERROR",
        cause,
      });
    } finally {
      clearTimeout(timeout);
      requestInit.signal?.removeEventListener("abort", abortFromCaller);
    }

    const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
    const payload = await this.readPayload(response);

    if (!response.ok) {
      const structured = apiErrorBodySchema.safeParse(payload);
      if (structured.success) {
        throw new ApiError(structured.data.message, {
          status: response.status,
          code: structured.data.code,
          requestId: structured.data.requestId ?? requestId,
          details: structured.data.details,
        });
      }
      throw new ApiError(`The API returned HTTP ${response.status}.`, {
        status: response.status,
        code: "HTTP_ERROR",
        ...(requestId === undefined ? {} : { requestId }),
      });
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError("The API returned an unexpected response.", {
        status: response.status,
        code: "INVALID_RESPONSE",
        ...(requestId === undefined ? {} : { requestId }),
        cause: parsed.error,
      });
    }

    return parsed.data;
  }

  private urlFor(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\//, "")}`;
  }

  private async readPayload(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) return null;

    try {
      return JSON.parse(text) as unknown;
    } catch (cause) {
      throw new ApiError(
        "The API returned a response that was not valid JSON.",
        {
          status: response.status,
          code: "INVALID_RESPONSE",
          requestId: response.headers.get(REQUEST_ID_HEADER) ?? undefined,
          cause,
        },
      );
    }
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("An unexpected client error occurred.", { cause: error });
}
