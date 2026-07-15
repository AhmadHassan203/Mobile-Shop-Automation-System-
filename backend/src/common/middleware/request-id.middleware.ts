import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { REQUEST_ID_HEADER } from "@mobileshop/shared";

/**
 * Assign a correlation ID to every request (13_ §4, 05_RULES.md §9).
 *
 * Honors an inbound `x-request-id` so a trace survives across the reverse proxy
 * and the frontend, and echoes it back on the response — when a cashier reports
 * "it failed", that one value finds the exact log lines.
 *
 * An inbound value is length-capped and character-restricted: it reaches logs
 * and headers, so an unbounded attacker-controlled string must not pass through.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private static readonly MAX_LENGTH = 128;
  private static readonly SAFE_PATTERN = /^[A-Za-z0-9._-]+$/;

  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.header(REQUEST_ID_HEADER);
    const requestId = RequestIdMiddleware.isAcceptable(inbound)
      ? inbound
      : randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }

  private static isAcceptable(value: string | undefined): value is string {
    return (
      value !== undefined &&
      value.length > 0 &&
      value.length <= RequestIdMiddleware.MAX_LENGTH &&
      RequestIdMiddleware.SAFE_PATTERN.test(value)
    );
  }
}
