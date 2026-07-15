import {
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DomainError, ERROR_CODES } from "@mobileshop/shared";
import type { Request, Response } from "express";
import { AppConfig } from "../../config/app-config.module";
import { IS_PUBLIC_ROUTE } from "../../common/auth/public.decorator";
import { PrismaService } from "../../database/prisma.service";
import { AuthContextService } from "./auth-context.service";
import { hashSessionToken, isSessionToken } from "./auth-crypto";

const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

function valueFromCookieBag(bag: unknown, name: string): unknown {
  if (typeof bag !== "object" || bag === null) return undefined;
  return (bag as Readonly<Record<string, unknown>>)[name];
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly contexts: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    http.getResponse<Response>().setHeader("Cache-Control", "no-store");
    const cookieName = this.config.get("SESSION_COOKIE_NAME");
    const signedValue = valueFromCookieBag(request.signedCookies, cookieName);
    const unsignedValue = valueFromCookieBag(request.cookies, cookieName);

    if (signedValue === undefined && unsignedValue === undefined) {
      throw new DomainError(
        ERROR_CODES.AUTH_REQUIRED,
        "Authentication is required",
      );
    }
    if (typeof signedValue !== "string" || !isSessionToken(signedValue)) {
      throw new DomainError(
        ERROR_CODES.AUTH_SESSION_INVALID,
        "The session is invalid",
      );
    }

    const session = await this.contexts.findSession(
      hashSessionToken(signedValue),
    );
    if (session === null || session.revokedAt !== null) {
      throw new DomainError(
        ERROR_CODES.AUTH_SESSION_INVALID,
        "The session is invalid",
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.client.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new DomainError(
        ERROR_CODES.AUTH_SESSION_EXPIRED,
        "Your session has expired",
      );
    }

    if (!session.user.isActive || !session.user.organization.isActive) {
      throw new DomainError(
        ERROR_CODES.AUTH_USER_INACTIVE,
        "This account is inactive",
      );
    }

    if (!session.branch.isActive || !this.contexts.branchIsAllowed(session)) {
      throw new DomainError(
        ERROR_CODES.AUTH_SESSION_INVALID,
        "The session scope is no longer valid",
      );
    }

    request.auth = {
      sessionId: session.id,
      current: this.contexts.toCurrentAuth(
        session.user,
        session.branch,
        session.expiresAt,
      ),
    };

    if (
      Date.now() - session.lastSeenAt.getTime() >=
      LAST_SEEN_WRITE_INTERVAL_MS
    ) {
      try {
        await this.prisma.client.session.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
            lastSeenAt: session.lastSeenAt,
          },
          data: { lastSeenAt: new Date() },
        });
      } catch {
        // Session validity came from the successful read. Metadata refresh is
        // best-effort and must not turn a transient write issue into auth failure.
        this.logger.warn("Session last-seen metadata refresh failed");
      }
    }

    return true;
  }
}
