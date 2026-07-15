import { Injectable } from "@nestjs/common";
import type { CurrentAuth } from "@mobileshop/shared";
import { Prisma, type Branch } from "@mobileshop/database";
import { PrismaService } from "../../database/prisma.service";

export const AUTH_USER_INCLUDE = {
  organization: true,
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  },
  scopeAccess: true,
} satisfies Prisma.UserInclude;

export const AUTH_SESSION_INCLUDE = {
  branch: true,
  user: { include: AUTH_USER_INCLUDE },
} satisfies Prisma.SessionInclude;

export type AuthUserRecord = Prisma.UserGetPayload<{
  include: typeof AUTH_USER_INCLUDE;
}>;

export type AuthSessionRecord = Prisma.SessionGetPayload<{
  include: typeof AUTH_SESSION_INCLUDE;
}>;

@Injectable()
export class AuthContextService {
  constructor(private readonly prisma: PrismaService) {}

  /** Email alone is intentionally accepted only when it identifies one tenant. */
  async findLoginUser(email: string): Promise<AuthUserRecord | null> {
    const matches = await this.prisma.client.user.findMany({
      where: { email },
      include: AUTH_USER_INCLUDE,
      take: 2,
    });

    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  async chooseActiveBranch(user: AuthUserRecord): Promise<Branch | null> {
    const explicitlyAllowed = [
      ...new Set(user.scopeAccess.map(({ branchId }) => branchId)),
    ];

    return this.prisma.client.branch.findFirst({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        ...(explicitlyAllowed.length === 0
          ? { isDefault: true }
          : { id: { in: explicitlyAllowed } }),
      },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    });
  }

  async findSession(tokenHash: string): Promise<AuthSessionRecord | null> {
    return this.prisma.client.session.findUnique({
      where: { tokenHash },
      include: AUTH_SESSION_INCLUDE,
    });
  }

  branchIsAllowed(session: AuthSessionRecord): boolean {
    const scopes = session.user.scopeAccess;
    if (scopes.length === 0) return session.branch.isDefault;
    return scopes.some(({ branchId }) => branchId === session.branchId);
  }

  toCurrentAuth(
    user: AuthUserRecord,
    branch: Pick<Branch, "id" | "code" | "name">,
    expiresAt: Date,
  ): CurrentAuth {
    const roles = [
      ...new Set(user.userRoles.map(({ role }) => role.code)),
    ].sort();
    const permissions = [
      ...new Set(
        user.userRoles.flatMap(({ role }) =>
          role.rolePermissions.map(({ permission }) => permission.key),
        ),
      ),
    ].sort();
    const scopes =
      user.scopeAccess.length === 0
        ? [{ branchId: branch.id, locationId: null }]
        : user.scopeAccess
            .map(({ branchId, locationId }) => ({ branchId, locationId }))
            .sort((left, right) =>
              `${left.branchId}:${left.locationId ?? ""}`.localeCompare(
                `${right.branchId}:${right.locationId ?? ""}`,
              ),
            );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        mustChangePassword: user.mustChangePassword,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        currency: user.organization.currency,
        timezone: user.organization.timezone,
      },
      branch: { id: branch.id, code: branch.code, name: branch.name },
      roles,
      permissions,
      scopes,
      session: { expiresAt: expiresAt.toISOString() },
    };
  }
}
