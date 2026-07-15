import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  DomainError,
  ERROR_CODES,
  API_VERSION,
  LoginInputSchema,
  type CurrentAuth,
  type LoginCredentials,
} from "@mobileshop/shared";
import type { CookieOptions, Request, Response } from "express";
import { Public } from "../../common/auth/public.decorator";
import { AppConfig } from "../../config/app-config.module";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { AuthService } from "./auth.service";
import { LoginAttemptRecorder } from "./login-attempt-recorder.service";
import {
  authRequestMetadata,
  submittedEmailFromBody,
} from "./request-metadata";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
    private readonly attempts: LoginAttemptRecorder,
  ) {}

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post("login")
  @Header("Cache-Control", "no-store")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate and create an opaque server session" })
  @ApiOkResponse({
    description: "Current user context; session is in an HTTP-only cookie.",
  })
  async login(
    @Body() input: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentAuth> {
    const parsed = LoginInputSchema.safeParse(input);
    if (!parsed.success) {
      await this.attempts.recordInvalidRequest(
        submittedEmailFromBody(input),
        authRequestMetadata(request),
      );
      throw parsed.error;
    }
    const credentials: LoginCredentials = parsed.data;
    const result = await this.auth.login(
      credentials,
      authRequestMetadata(request),
    );
    response.cookie(
      this.config.get("SESSION_COOKIE_NAME"),
      result.sessionToken,
      this.cookieOptions({ maxAge: this.config.sessionTtlMs }),
    );
    return result.current;
  }

  @Post("logout")
  @Header("Cache-Control", "no-store")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current server session" })
  @ApiNoContentResponse({ description: "Session revoked and cookie cleared." })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (request.auth === undefined) {
      throw new DomainError(
        ERROR_CODES.AUTH_REQUIRED,
        "Authentication is required",
      );
    }

    await this.auth.logout(request.auth, authRequestMetadata(request));
    response.clearCookie(
      this.config.get("SESSION_COOKIE_NAME"),
      this.cookieOptions(),
    );
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Return the current user, grants and effective scope",
  })
  @ApiOkResponse({ description: "Current authenticated user context." })
  me(@Req() request: Request): CurrentAuth {
    if (request.auth === undefined) {
      throw new DomainError(
        ERROR_CODES.AUTH_REQUIRED,
        "Authentication is required",
      );
    }
    return request.auth.current;
  }

  private cookieOptions(
    extra: Pick<CookieOptions, "maxAge"> = {},
  ): CookieOptions {
    const apiPrefix = this.config
      .get("API_GLOBAL_PREFIX")
      .replace(/^\/+|\/+$/gu, "");
    return {
      httpOnly: true,
      secure: this.config.get("SESSION_COOKIE_SECURE"),
      sameSite: this.config.get("SESSION_COOKIE_SAMESITE"),
      signed: true,
      // Cookies are not port-scoped. Restricting the path keeps the API session
      // off ordinary frontend/static requests on the same host.
      path: `/${apiPrefix}/${API_VERSION}`,
      ...extra,
    };
  }
}
