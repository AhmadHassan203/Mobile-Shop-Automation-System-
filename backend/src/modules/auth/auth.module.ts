import { Module } from "@nestjs/common";
import { AuthContextService } from "./auth-context.service";
import { AuthController } from "./auth.controller";
import { AuthOriginGuard } from "./auth-origin.guard";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { AuthRateLimitStore } from "./auth-rate-limit.store";
import { AuthService } from "./auth.service";
import { LoginAttemptRecorder } from "./login-attempt-recorder.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthContextService,
    AuthOriginGuard,
    AuthRateLimitGuard,
    AuthRateLimitStore,
    LoginAttemptRecorder,
  ],
  exports: [AuthContextService],
})
export class AuthModule {}
