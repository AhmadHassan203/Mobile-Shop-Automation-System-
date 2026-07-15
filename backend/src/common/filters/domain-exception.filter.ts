import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { type ApiErrorBody, DomainError, ERROR_CODES, type ErrorCode } from '@mobileshop/shared';

/**
 * Translates every thrown error into the stable `ApiErrorBody` contract.
 *
 * Two rules govern this file (13_ §27, 05_RULES.md §9):
 *  1. Clients always receive a stable machine code plus a human message.
 *  2. Normal users never receive stack traces, secrets, tokens, database
 *     credentials or restricted personal information.
 *
 * Anything unrecognised becomes an opaque INTERNAL_ERROR to the caller while the
 * real cause is logged in full server-side against the request ID.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId;

    const { status, body, logLevel, cause } = this.translate(exception, requestId);

    // 5xx means we broke; 4xx means the caller did. Only the former is an alarm.
    if (logLevel === 'error') {
      this.logger.error(
        { requestId, code: body.code, method: request.method, path: request.url, err: cause },
        `Unhandled error: ${body.code}`,
      );
    } else {
      this.logger.warn(
        { requestId, code: body.code, method: request.method, path: request.url },
        `Request rejected: ${body.code}`,
      );
    }

    response.status(status).json(body);
  }

  private translate(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ApiErrorBody; logLevel: 'warn' | 'error'; cause?: unknown } {
    const timestamp = new Date().toISOString();

    // 1. Domain errors already carry a stable code and status.
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        body: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          requestId,
          timestamp,
        },
        logLevel: exception.status >= 500 ? 'error' : 'warn',
        cause: exception,
      };
    }

    // 2. Zod validation failures become field-level details.
    if (exception instanceof ZodError) {
      const details: Record<string, string[]> = {};
      for (const issue of exception.issues) {
        const path = issue.path.join('.') || '(root)';
        (details[path] ??= []).push(issue.message);
      }
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Request validation failed',
          details,
          requestId,
          timestamp,
        },
        logLevel: 'warn',
      };
    }

    // 3. Nest's own HttpExceptions (404 on unknown route, guard rejections, ...).
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          code: this.codeForStatus(status),
          message: this.messageFrom(exception),
          requestId,
          timestamp,
        },
        logLevel: status >= 500 ? 'error' : 'warn',
        cause: exception,
      };
    }

    // 4. Anything else is a bug. Log the truth, tell the caller nothing.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        requestId,
        timestamp,
      },
      logLevel: 'error',
      cause: exception,
    };
  }

  /** Framework HTTP statuses mapped to our stable codes. */
  private static readonly CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
    [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
    [HttpStatus.UNAUTHORIZED]: ERROR_CODES.AUTH_REQUIRED,
    [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN_PERMISSION,
    [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
    [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
    [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.VALIDATION_FAILED,
    [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
  };

  private codeForStatus(status: number): ErrorCode {
    return (
      DomainExceptionFilter.CODE_BY_STATUS[status] ??
      (status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_FAILED)
    );
  }

  /**
   * Extract a safe message from an HttpException.
   * 5xx messages are replaced: framework internals must not leak to a user.
   */
  private messageFrom(exception: HttpException): string {
    if (exception.getStatus() >= 500) return 'An unexpected error occurred';

    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const { message } = response;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.map((entry) => String(entry)).join('; ');
    }
    return exception.message;
  }
}
