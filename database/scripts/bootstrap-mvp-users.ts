/**
 * Idempotent MVP user bootstrap.
 *
 * Creates or updates exactly two accounts — an Owner and a Cashier — under the
 * already-seeded organization/branch, so the demo/MVP stack has known logins.
 * Safe to run repeatedly: it upserts by email and never duplicates accounts,
 * roles, permissions or scope grants, and it touches nothing else.
 *
 * Security:
 *  - The plaintext password is read ONLY from the environment
 *    (`MVP_BOOTSTRAP_PASSWORD`); it is never hardcoded, logged, or returned.
 *  - Only the argon2id hash is stored.
 *  - It does NOT weaken any runtime authorization: login/session/permission
 *    checks are unchanged. It only sets a short *temporary* demo password, which
 *    must be rotated before any public production use.
 *
 * The Cashier is a DISTINCT user with the DISTINCT `cashier` role, but that role
 * is granted the full permission set for now (parity with Owner). Restricting
 * the cashier later means trimming the `cashier` role's grants — no redesign.
 *
 * Run:  NODE_ENV=development MVP_BOOTSTRAP_PASSWORD=<temporary-password> \
 *         pnpm --filter ./database exec tsx scripts/bootstrap-mvp-users.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash as hashArgon2, argon2id } from "argon2";
import { parse } from "dotenv";
import { ALL_PERMISSIONS, ROLES } from "@mobileshop/shared";
import { createPrismaClient } from "../src";

const envPath = process.cwd().toLowerCase().endsWith("database")
  ? resolve(process.cwd(), "../.env")
  : resolve(process.cwd(), ".env");
const fileEnv = existsSync(envPath) ? parse(readFileSync(envPath)) : {};

function envValue(name: string): string | undefined {
  return process.env[name] ?? fileEnv[name];
}

function required(name: string): string {
  const value = envValue(name);
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required to bootstrap MVP users.`);
  }
  return value;
}

async function bootstrap(): Promise<void> {
  const nodeEnv = envValue("NODE_ENV");
  if (nodeEnv !== "development" && nodeEnv !== "test") {
    throw new Error(
      "MVP user bootstrap requires NODE_ENV=development or NODE_ENV=test.",
    );
  }

  const connectionString = required("DATABASE_URL");
  const password = required("MVP_BOOTSTRAP_PASSWORD");
  if (password.length < 6 || password.length > 256) {
    throw new Error("MVP_BOOTSTRAP_PASSWORD must be 6-256 characters.");
  }
  if (password.length < 12) {
    console.warn(
      "WARNING: the temporary MVP password is short. Rotate it before any public production use.",
    );
  }
  const ownerEmail = (envValue("MVP_OWNER_EMAIL") ?? "owner@mobileshop.local")
    .trim()
    .toLowerCase();
  const cashierEmail = (
    envValue("MVP_CASHIER_EMAIL") ?? "cashier@mobileshop.local"
  )
    .trim()
    .toLowerCase();

  const passwordHash = await hashArgon2(password, { type: argon2id });
  const prisma = createPrismaClient({ connectionString });

  try {
    await prisma.$transaction(
      async (tx) => {
        const organization = await tx.organization.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (organization === null) {
          throw new Error(
            "No organization found. Run the baseline seed before bootstrapping MVP users.",
          );
        }
        const organizationId = organization.id;

        const branch =
          (await tx.branch.findFirst({
            where: { organizationId, isDefault: true },
            select: { id: true },
          })) ??
          (await tx.branch.findFirst({
            where: { organizationId },
            orderBy: { code: "asc" },
            select: { id: true },
          }));
        if (branch === null) {
          throw new Error("No branch found for the organization.");
        }
        // Capture the narrowed id so the nested upsertUser closure reads a plain
        // string rather than re-narrowing `branch` across the function boundary.
        const branchId = branch.id;

        // Ensure a permission row exists for every key (idempotent).
        const permissionByKey = new Map<string, string>();
        for (const key of ALL_PERMISSIONS) {
          const [resource = key, action = ""] = key.split(".");
          const permission = await tx.permission.upsert({
            where: { key },
            create: { key, resource, action },
            update: { resource, action },
            select: { id: true },
          });
          permissionByKey.set(key, permission.id);
        }

        // Ensure the two roles exist and both currently hold every permission.
        async function ensureRoleWithAllPermissions(
          code: string,
          name: string,
          description: string,
        ): Promise<string> {
          const existing = await tx.role.findUnique({
            where: { organizationId_code: { organizationId, code } },
            select: { id: true },
          });
          const role =
            existing ??
            (await tx.role.create({
              data: {
                organizationId,
                code,
                name,
                description,
                isSystem: true,
              },
              select: { id: true },
            }));
          for (const permissionId of permissionByKey.values()) {
            const link = await tx.rolePermission.findFirst({
              where: { roleId: role.id, permissionId },
              select: { id: true },
            });
            if (link === null) {
              await tx.rolePermission.create({
                data: { roleId: role.id, permissionId },
              });
            }
          }
          return role.id;
        }

        const ownerRoleId = await ensureRoleWithAllPermissions(
          ROLES.OWNER,
          "Owner / Super Admin",
          "Full business, security, financial, configuration and audit access.",
        );
        const cashierRoleId = await ensureRoleWithAllPermissions(
          ROLES.CASHIER,
          "Cashier",
          "MVP: full access for now; restrict this role's grants later.",
        );

        async function upsertUser(
          email: string,
          fullName: string,
          roleId: string,
        ): Promise<void> {
          const existing = await tx.user.findUnique({
            where: { organizationId_email: { organizationId, email } },
            select: { id: true },
          });
          const user = existing
            ? await tx.user.update({
                where: { id: existing.id },
                data: {
                  passwordHash,
                  isActive: true,
                  mustChangePassword: false,
                },
                select: { id: true },
              })
            : await tx.user.create({
                data: {
                  organizationId,
                  email,
                  passwordHash,
                  fullName,
                  mustChangePassword: false,
                },
                select: { id: true },
              });

          await tx.userRole.upsert({
            where: {
              organizationId_userId_roleId: {
                organizationId,
                userId: user.id,
                roleId,
              },
            },
            create: {
              organizationId,
              userId: user.id,
              roleId,
              assignedBy: user.id,
            },
            update: {},
          });

          const scope = await tx.userScopeAccess.findFirst({
            where: {
              organizationId,
              userId: user.id,
              branchId,
              locationId: null,
            },
            select: { id: true },
          });
          if (scope === null) {
            await tx.userScopeAccess.create({
              data: {
                organizationId,
                userId: user.id,
                branchId,
                locationId: null,
              },
            });
          }
        }

        await upsertUser(ownerEmail, "Shop Owner", ownerRoleId);
        await upsertUser(cashierEmail, "Shop Cashier", cashierRoleId);
      },
      { timeout: 30_000 },
    );

    // Safe output only — never the password or hash.
    console.log("MVP users bootstrapped (idempotent).");
    console.log(`  Owner login:   ${ownerEmail}`);
    console.log(`  Cashier login: ${cashierEmail}`);
    console.log(
      "  Password: set from MVP_BOOTSTRAP_PASSWORD. Rotate before public production use.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap().catch((error: unknown) => {
  console.error(
    "MVP user bootstrap failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
});
