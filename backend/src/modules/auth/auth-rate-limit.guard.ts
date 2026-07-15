import { createHash } from "node:crypto";
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { DomainError, ERROR_CODES } from "@mobileshop/shared";
import type { Request, Response } from "express";
import { AppConfig } from "../../config/app-config.module";
import { LoginAttemptRecorder } from "./login-attempt-recorder.service";
import {
  AuthRateLimitStore,
  type AuthRateLimitDecision,
} from "./auth-rate-limit.store";
import {
  authRequestMetadata,
  submittedEmailFromBody,
} from "./request-metadata";

function digestTracker(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Login-only limiter keyed independently by network address and account name.
 * The generic global limiter remains active as a separate outer safety net.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly store: AuthRateLimitStore,
    private readonly config: AppConfig,
    private readonly attempts: LoginAttemptRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader("Cache-Control", "no-store");
    const metadata = authRequestMetadata(request);
    const ipAddress = metadata.ipAddress ?? "unknown";
    const ttl = this.config.get("AUTH_RATE_LIMIT_TTL_SECONDS") * 1000;
    const limit = this.config.get("AUTH_RATE_LIMIT_MAX_ATTEMPTS");

    // IP is deliberately first. Once blocked, attacker-controlled random emails
    // never allocate or increment email trackers.
    const ipDecision = this.store.consume(
      `ip:${digestTracker(ipAddress)}`,
      limit,
      ttl,
    );
    if (ipDecision.isBlocked) {
      await this.rejectBlocked(
        ipDecision,
        response,
        metadata,
        ipDecision.becameBlocked
          ? submittedEmailFromBody(request.body)
          : undefined,
      );
    }

    const email = submittedEmailFromBody(request.body);
    const emailDecision = this.store.consume(
      `email:${digestTracker(email)}`,
      limit,
      ttl,
    );
    if (emailDecision.isBlocked) {
      await this.rejectBlocked(emailDecision, response, metadata, email);
    }

    return true;
  }

  private async rejectBlocked(
    decision: AuthRateLimitDecision,
    response: Response,
    metadata: ReturnType<typeof authRequestMetadata>,
    submittedEmail: string | undefined,
  ): Promise<never> {
    response.setHeader("Retry-After", String(decision.retryAfterSeconds));
    if (decision.becameBlocked && submittedEmail !== undefined) {
      await this.attempts.recordRateLimited(submittedEmail, metadata);
    }

    throw new DomainError(
      ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
      "Too many login attempts. Try again later",
    );
  }
}
