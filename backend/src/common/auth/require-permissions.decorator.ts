import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@mobileshop/shared";

export const REQUIRED_PERMISSIONS = Symbol("required-permissions");

/**
 * Require every listed grant. The database-backed permissions already resolved
 * by AuthGuard remain the source of truth; frontend visibility is never enough.
 */
export function RequirePermissions(...permissions: readonly PermissionKey[]) {
  if (permissions.length === 0) {
    throw new RangeError("RequirePermissions needs at least one permission");
  }
  return SetMetadata(REQUIRED_PERMISSIONS, permissions);
}
