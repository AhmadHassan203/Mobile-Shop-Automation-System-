import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  DomainError,
  ERROR_CODES,
  hasPermission,
  type PermissionKey,
} from "@mobileshop/shared";
import type { Request } from "express";
import { REQUIRED_PERMISSIONS } from "./require-permissions.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndMerge<readonly PermissionKey[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );

    // Auth-only endpoints such as /auth/me carry no domain permission.
    if (required === undefined || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.auth;
    if (auth === undefined) {
      throw new DomainError(
        ERROR_CODES.AUTH_REQUIRED,
        "Authentication is required",
      );
    }

    const granted = auth.current.permissions as readonly PermissionKey[];
    if (
      [...new Set(required)].every((permission) =>
        hasPermission(granted, permission),
      )
    ) {
      return true;
    }

    throw new DomainError(
      ERROR_CODES.FORBIDDEN_PERMISSION,
      "You do not have permission to perform this action",
    );
  }
}
