import {
  CurrentAuthSchema,
  ERROR_CODES,
  LoginInputSchema,
  type CurrentAuth,
  type LoginInput,
} from "@mobileshop/shared";
import { z } from "zod";
import { ApiError, type ApiClient } from "./client";
import { apiClient } from "./health";

/** Lower-case aliases preserve the frontend's local naming convention. */
export const loginInputSchema = LoginInputSchema;
export const currentAuthSchema = CurrentAuthSchema;
export type {
  CurrentAuth,
  LoginCredentials,
  LoginInput,
} from "@mobileshop/shared";

export async function login(
  input: LoginInput,
  client: ApiClient = apiClient,
): Promise<CurrentAuth> {
  const credentials = loginInputSchema.parse(input);
  return client.request("/auth/login", {
    method: "POST",
    schema: currentAuthSchema,
    json: credentials,
  });
}

export function getCurrentAuth(
  signal?: AbortSignal,
  client: ApiClient = apiClient,
): Promise<CurrentAuth> {
  return client.request("/auth/me", {
    method: "GET",
    schema: currentAuthSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function logout(client: ApiClient = apiClient): Promise<null> {
  return client.request("/auth/logout", {
    method: "POST",
    schema: z.null(),
  });
}

const ENDED_SESSION_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.AUTH_REQUIRED,
  ERROR_CODES.AUTH_SESSION_EXPIRED,
  ERROR_CODES.AUTH_SESSION_INVALID,
]);

export function isEndedSessionError(error: unknown): error is ApiError {
  return error instanceof ApiError && ENDED_SESSION_CODES.has(error.code);
}

export function isExpiredSessionError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.code === ERROR_CODES.AUTH_SESSION_EXPIRED ||
      error.code === ERROR_CODES.AUTH_SESSION_INVALID)
  );
}

export function isWorkspaceAccessEndedError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.status === 401 ||
      error.code === ERROR_CODES.AUTH_USER_INACTIVE ||
      error.code === ERROR_CODES.FORBIDDEN_SCOPE)
  );
}

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Sign-in could not be completed. Try again.";
  }

  if (
    error.code === ERROR_CODES.AUTH_INVALID_CREDENTIALS ||
    error.code === ERROR_CODES.AUTH_USER_INACTIVE
  ) {
    // Do not reveal whether an account exists, is inactive, or has a wrong password.
    return "Email or password is incorrect.";
  }

  if (
    error.code === ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS ||
    error.code === ERROR_CODES.RATE_LIMITED ||
    error.status === 429
  ) {
    return "Too many sign-in attempts. Wait a moment before trying again.";
  }

  if (error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT") {
    return "The sign-in service could not be reached. Check the API connection and try again.";
  }

  if (error.code === "INVALID_RESPONSE") {
    return "The server returned an unexpected sign-in response. No session was accepted.";
  }

  return "Sign-in could not be completed. Try again.";
}

export function logoutErrorMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    (error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT")
  ) {
    return "The server could not be reached. Your session may still be active.";
  }
  return "Sign-out could not be confirmed. Your session may still be active.";
}
