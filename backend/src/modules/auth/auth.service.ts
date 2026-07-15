import { Injectable } from "@nestjs/common";
import { verify as verifyArgon2 } from "argon2";
import {
  DomainError,
  ERROR_CODES,
  type CurrentAuth,
  type LoginCredentials,
} from "@mobileshop/shared";
import { PrismaService } from "../../database/prisma.service";
import { AppConfig } from "../../config/app-config.module";
import {
  AuthContextService,
  type AuthUserRecord,
} from "./auth-context.service";
import { generateSessionToken, hashSessionToken } from "./auth-crypto";
import type { AuthenticatedRequestContext } from "./auth.types";
import type { AuthRequestMetadata } from "./request-metadata";

// A valid Argon2id digest prevents unknown-account requests from returning before
// a password verification. The plaintext used to create it is public and useless.
const UNKNOWN_USER_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$zL5lXCwVw1W6DJvoCMCnsw$xAe5pQITmFBafts+7U8jHdddUexpIcc9iPD20prZSVc";

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";
const NONEXISTENT_USER_ID = "00000000-0000-4000-8000-000000000000";

export interface LoginResult {
  readonly current: CurrentAuth;
  /** Raw credential is controller-private and must only be placed in the cookie. */
  readonly sessionToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly contexts: AuthContextService,
  ) {}

  async login(
    credentials: LoginCredentials,
    metadata: AuthRequestMetadata,
  ): Promise<LoginResult> {
    const user = await this.contexts.findLoginUser(credentials.email);

    if (user === null) {
      await this.verifyPassword(
        UNKNOWN_USER_PASSWORD_HASH,
        credentials.password,
      );
      await this.recordInvalidCredentials(null, credentials.email, metadata);
      throw this.invalidCredentials();
    }

    const passwordMatches = await this.verifyPassword(
      user.passwordHash,
      credentials.password,
    );
    if (!passwordMatches) {
      await this.recordInvalidCredentials(user, user.email, metadata);
      throw this.invalidCredentials();
    }

    if (!user.isActive || !user.organization.isActive) {
      await this.recordKnownFailure(user, "inactive", metadata);
      throw new DomainError(
        ERROR_CODES.AUTH_USER_INACTIVE,
        "This account is inactive",
      );
    }

    if (user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now()) {
      await this.recordKnownFailure(user, "account_locked", metadata);
      throw new DomainError(
        ERROR_CODES.AUTH_TOO_MANY_ATTEMPTS,
        "Too many login attempts. Try again later",
      );
    }

    const branch = await this.contexts.chooseActiveBranch(user);
    if (branch === null) {
      await this.recordKnownFailure(user, "no_active_branch", metadata);
      throw new DomainError(
        ERROR_CODES.AUTH_USER_INACTIVE,
        "This account is not available for sign-in",
      );
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionTtlMs);

    const results = await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.client.session.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          branchId: branch.id,
          tokenHash,
          expiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
      this.prisma.client.loginAttempt.create({
        data: this.loginAttemptData(credentials.email, true, null, metadata),
      }),
      this.prisma.client.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          branchId: branch.id,
          actorUserId: user.id,
          action: "auth.login_succeeded",
          entityType: "user",
          entityId: user.id,
          afterSnapshot: { outcome: "succeeded" },
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
    ]);

    const session = results[1];
    return {
      current: this.contexts.toCurrentAuth(user, branch, session.expiresAt),
      sessionToken,
    };
  }

  async logout(
    context: AuthenticatedRequestContext,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    const revokedAt = new Date();
    await this.prisma.client.$transaction([
      this.prisma.client.session.updateMany({
        where: { id: context.sessionId, revokedAt: null },
        data: { revokedAt },
      }),
      this.prisma.client.auditEvent.create({
        data: {
          organizationId: context.current.organization.id,
          branchId: context.current.branch.id,
          actorUserId: context.current.user.id,
          action: "auth.logout",
          entityType: "session",
          entityId: context.sessionId,
          afterSnapshot: { outcome: "revoked" },
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
    ]);
  }

  private async recordKnownFailure(
    user: AuthUserRecord,
    reason: string,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    const operations = [
      this.prisma.client.loginAttempt.create({
        data: this.loginAttemptData(user.email, false, reason, metadata),
      }),
      this.prisma.client.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: null,
          action: "auth.login_failed",
          entityType: "user",
          entityId: user.id,
          afterSnapshot: { outcome: "failed", reason },
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
    ];

    await this.prisma.client.$transaction(operations);
  }

  /**
   * Unknown and known-wrong credentials execute the same two database operations
   * after Argon2 verification, reducing account-enumeration timing differences.
   */
  private async recordInvalidCredentials(
    user: AuthUserRecord | null,
    email: string,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    await this.prisma.client.$transaction([
      this.prisma.client.user.updateMany({
        where: { id: user?.id ?? NONEXISTENT_USER_ID },
        data: { failedLoginCount: { increment: 1 } },
      }),
      this.prisma.client.loginAttempt.create({
        data: this.loginAttemptData(
          email,
          false,
          "invalid_credentials",
          metadata,
        ),
      }),
    ]);
  }

  private loginAttemptData(
    email: string,
    succeeded: boolean,
    failureReason: string | null,
    metadata: AuthRequestMetadata,
  ) {
    return {
      email,
      succeeded,
      failureReason,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: metadata.requestId,
    };
  }

  private async verifyPassword(
    hash: string,
    password: string,
  ): Promise<boolean> {
    try {
      return await verifyArgon2(hash, password);
    } catch {
      // A corrupt legacy hash is treated exactly like a wrong password publicly.
      return false;
    }
  }

  private invalidCredentials(): DomainError {
    return new DomainError(
      ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      INVALID_CREDENTIALS_MESSAGE,
    );
  }
}
