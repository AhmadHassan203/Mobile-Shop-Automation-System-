import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { AuthRequestMetadata } from "./request-metadata";

@Injectable()
export class LoginAttemptRecorder {
  constructor(private readonly prisma: PrismaService) {}

  /** Rate-limited requests never reach AuthService, so the guard records them here. */
  async recordRateLimited(
    submittedEmail: string,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    await this.prisma.client.loginAttempt.create({
      data: {
        email: submittedEmail,
        succeeded: false,
        failureReason: "rate_limited",
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        requestId: metadata.requestId,
      },
    });
  }

  async recordInvalidRequest(
    submittedEmail: string,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    await this.prisma.client.loginAttempt.create({
      data: {
        email: submittedEmail,
        succeeded: false,
        failureReason: "invalid_request",
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        requestId: metadata.requestId,
      },
    });
  }
}
