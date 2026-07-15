import type { Request } from "express";

export interface AuthRequestMetadata {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly requestId: string;
}

function truncate(value: string | undefined, maximum: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

/** Extract only bounded metadata that is safe for the login/audit tables. */
export function authRequestMetadata(request: Request): AuthRequestMetadata {
  return {
    ipAddress: truncate(request.ip, 45),
    userAgent: truncate(request.get("user-agent"), 400),
    requestId: request.requestId.slice(0, 128),
  };
}

/** Bounded identifier for pre-validation login audit/rate-limit records. */
export function submittedEmailFromBody(body: unknown): string {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return "(invalid)";
  }

  const email: unknown = body.email;
  return typeof email === "string"
    ? email.trim().toLowerCase().slice(0, 255) || "(invalid)"
    : "(invalid)";
}
