import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { DomainError, ERROR_CODES } from "@mobileshop/shared";
import type { Request, Response } from "express";
import { AppConfig } from "../../config/app-config.module";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.origin === "null" ? null : parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Cookie-authenticated unsafe methods need an Origin check in addition to CORS:
 * a forged HTML form does not need permission to read the response.
 */
@Injectable()
export class AuthOriginGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(config: AppConfig) {
    this.allowedOrigins = new Set(
      config.corsOrigins
        .map(normalizeOrigin)
        .filter((origin): origin is string => origin !== null),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Applies Cache-Control to successes and guard/validation failures alike.
    response.setHeader("Cache-Control", "no-store");

    if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) return true;

    const origin = request.get("origin");
    if (origin === undefined) return true; // CLI/native clients do not send Origin.

    const normalized = normalizeOrigin(origin);
    if (normalized !== null && this.allowedOrigins.has(normalized)) return true;

    throw new DomainError(
      ERROR_CODES.FORBIDDEN_PERMISSION,
      "Request origin is not allowed",
    );
  }
}
