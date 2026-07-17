import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash as hashArgon2, argon2id } from "argon2";
import { parse } from "dotenv";
import {
  ALL_PERMISSIONS,
  DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR,
  DEFAULT_ROLE_PERMISSIONS,
  EXTERNAL_FEE_CONFIG,
  EXTERNAL_FEE_CONFIG_KEYS,
  LIMITS,
  LoginInputSchema,
  ROLES,
  type RoleCode,
} from "@mobileshop/shared";
import { createPrismaClient } from "../src";

const seedEnvironmentPath = process.cwd().toLowerCase().endsWith("database")
  ? resolve(process.cwd(), "../.env")
  : resolve(process.cwd(), ".env");
const seedFileEnvironment = existsSync(seedEnvironmentPath)
  ? parse(readFileSync(seedEnvironmentPath))
  : {};

function seedValue(name: string): string | undefined {
  return process.env[name] ?? seedFileEnvironment[name];
}

const SEED_IDS = Object.freeze({
  organization: "10000000-0000-4000-8000-000000000001",
  branch: "10000000-0000-4000-8000-000000000002",
  location: "10000000-0000-4000-8000-000000000003",
  smartphoneCategory: "10000000-0000-4000-8000-000000000004",
  unbrandedBrand: "10000000-0000-4000-8000-000000000005",
  genericSmartphoneModel: "10000000-0000-4000-8000-000000000006",
  physicalCashAccount: "10000000-0000-4000-8000-000000000007",
  bankAccount: "10000000-0000-4000-8000-000000000008",
  digitalWalletAccount: "10000000-0000-4000-8000-000000000009",
  receivableAccount: "10000000-0000-4000-8000-000000000010",
  inventoryAccount: "10000000-0000-4000-8000-000000000011",
  salesRevenueAccount: "10000000-0000-4000-8000-000000000012",
  salesDiscountAccount: "10000000-0000-4000-8000-000000000013",
  cogsAccount: "10000000-0000-4000-8000-000000000014",
  taxPayableAccount: "10000000-0000-4000-8000-000000000015",
  serviceRevenueAccount: "10000000-0000-4000-8000-000000000016",
  serviceFloatAccount: "10000000-0000-4000-8000-000000000017",
  expenseAccount: "10000000-0000-4000-8000-000000000018",
  serviceCostAccount: "10000000-0000-4000-8000-000000000019",
});

const DEFAULT_FINANCIAL_ACCOUNTS = [
  {
    id: SEED_IDS.physicalCashAccount,
    code: "CASH",
    name: "Physical cash",
    accountType: "asset",
    accountSubtype: "physical_cash",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.bankAccount,
    code: "BANK",
    name: "Bank balance",
    accountType: "asset",
    accountSubtype: "bank",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.digitalWalletAccount,
    code: "DIGITAL",
    name: "Digital wallet balance",
    accountType: "asset",
    accountSubtype: "provider_float",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.receivableAccount,
    code: "AR",
    name: "Customer receivables",
    accountType: "asset",
    accountSubtype: "receivable",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.inventoryAccount,
    code: "INVENTORY",
    name: "Inventory asset",
    accountType: "asset",
    accountSubtype: "inventory_asset",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.salesRevenueAccount,
    code: "SALES",
    name: "Sales revenue",
    accountType: "revenue",
    accountSubtype: "sales_revenue",
    normalBalance: "credit",
  },
  {
    id: SEED_IDS.salesDiscountAccount,
    code: "SALES-DISCOUNT",
    name: "Sales discounts",
    accountType: "revenue",
    accountSubtype: "sales_discount",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.cogsAccount,
    code: "COGS",
    name: "Cost of goods sold",
    accountType: "expense",
    accountSubtype: "cost_of_goods_sold",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.taxPayableAccount,
    code: "TAX-PAYABLE",
    name: "Sales tax payable",
    accountType: "liability",
    accountSubtype: "tax_payable",
    normalBalance: "credit",
  },
  {
    id: SEED_IDS.serviceRevenueAccount,
    code: "SERVICE-REVENUE",
    name: "Service revenue",
    accountType: "revenue",
    accountSubtype: "service_revenue",
    normalBalance: "credit",
  },
  {
    id: SEED_IDS.serviceFloatAccount,
    code: "SERVICE-FLOAT",
    name: "Service provider float",
    accountType: "asset",
    accountSubtype: "service_float",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.expenseAccount,
    code: "EXPENSE",
    name: "Operating expenses",
    accountType: "expense",
    accountSubtype: "expense",
    normalBalance: "debit",
  },
  {
    id: SEED_IDS.serviceCostAccount,
    code: "SERVICE-COST",
    name: "Service provider cost",
    accountType: "expense",
    accountSubtype: "expense",
    normalBalance: "debit",
  },
] as const;

// Owner-editable fee configuration, seeded so the external-services default fee
// is named and versioned rather than a hidden constant (05_RULES.md §9, 13_ §13).
// Branch-scoped so the compound unique (org, branch, key) is fully non-null and
// the upsert stays idempotent; an empty update preserves owner-edited rates.
const DEFAULT_APPLICATION_SETTINGS = [
  {
    key: EXTERNAL_FEE_CONFIG_KEYS.amountBlockMinor,
    value: EXTERNAL_FEE_CONFIG.amountBlockMinor,
    description:
      "External fee block size, in minor units. A partial block is billed as a full block.",
  },
  {
    key: EXTERNAL_FEE_CONFIG_KEYS.money_send,
    value: DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR.money_send,
    description:
      "External money-send fee, in minor units per started PKR 1,000 block.",
  },
  {
    key: EXTERNAL_FEE_CONFIG_KEYS.money_withdrawal,
    value: DEFAULT_EXTERNAL_FEE_PER_BLOCK_MINOR.money_withdrawal,
    description:
      "External money-withdrawal fee, in minor units per started PKR 1,000 block.",
  },
] as const;

const ROLE_DETAILS: Readonly<
  Record<RoleCode, { readonly name: string; readonly description: string }>
> = {
  [ROLES.OWNER]: {
    name: "Owner / Super Admin",
    description:
      "Full business, security, financial, configuration and audit access.",
  },
  [ROLES.MANAGER]: {
    name: "Manager / Admin",
    description:
      "Operational management without unrestricted owner/security override.",
  },
  [ROLES.SALESPERSON]: {
    name: "Salesperson",
    description: "Sales, demand, reservations and product/stock lookup.",
  },
  [ROLES.CASHIER]: {
    name: "Cashier",
    description:
      "Payments, external money services and assigned cash sessions.",
  },
  [ROLES.PURCHASER]: {
    name: "Purchaser / Inventory Staff",
    description:
      "Suppliers, purchasing, receiving, stock counts and adjustments.",
  },
  [ROLES.ACCOUNTANT]: {
    name: "Accountant / Read-only Finance",
    description:
      "Financial visibility, expenses and exports without operational posting.",
  },
  [ROLES.TECHNICIAN]: {
    name: "Technician",
    description: "Restricted read access for assigned technical work.",
  },
};

function required(name: string): string {
  const value = seedValue(name)?.trim();
  if (!value) throw new Error(`Missing required seed setting: ${name}`);
  return value;
}

function validateBootstrapPassword(password: string): void {
  if (
    password.length < LIMITS.MIN_PASSWORD_LENGTH ||
    password.length > LIMITS.MAX_PASSWORD_LENGTH ||
    password.includes("CHANGE_ME")
  ) {
    throw new Error(
      `SEED_OWNER_PASSWORD must be ${LIMITS.MIN_PASSWORD_LENGTH}-${LIMITS.MAX_PASSWORD_LENGTH} characters and not a placeholder`,
    );
  }
}

async function seed(): Promise<void> {
  const environment = seedValue("NODE_ENV");
  if (environment !== "development" && environment !== "test") {
    throw new Error(
      "The bootstrap seed requires NODE_ENV=development or NODE_ENV=test",
    );
  }

  const connectionString = required("DATABASE_URL");
  const ownerPassword = required("SEED_OWNER_PASSWORD");
  validateBootstrapPassword(ownerPassword);
  const ownerCredentials = LoginInputSchema.parse({
    email: required("SEED_OWNER_EMAIL"),
    password: ownerPassword,
  });
  const ownerPasswordHash = await hashArgon2(ownerCredentials.password, {
    type: argon2id,
  });
  const prisma = createPrismaClient({ connectionString, logQueries: false });

  try {
    await prisma.$transaction(
      async (tx) => {
        const organization = await tx.organization.upsert({
          where: { id: SEED_IDS.organization },
          create: {
            id: SEED_IDS.organization,
            name: "MobileShop",
            currency: "PKR",
            timezone: "Asia/Karachi",
          },
          update: {},
        });

        const branch = await tx.branch.upsert({
          where: {
            organizationId_code: {
              organizationId: organization.id,
              code: "MAIN",
            },
          },
          create: {
            id: SEED_IDS.branch,
            organizationId: organization.id,
            code: "MAIN",
            name: "Main Branch",
            city: "Lahore",
            isDefault: true,
          },
          update: {},
        });

        await tx.stockLocation.upsert({
          where: {
            organizationId_branchId_code: {
              organizationId: organization.id,
              branchId: branch.id,
              code: "SHOP",
            },
          },
          create: {
            id: SEED_IDS.location,
            organizationId: organization.id,
            branchId: branch.id,
            code: "SHOP",
            name: "Shop Floor",
            kind: "store",
            isDefault: true,
          },
          update: {},
        });

        // Structural chart-of-account prerequisites, not sample transactions.
        // Empty updates preserve owner-renamed accounts while making the seed
        // safely re-runnable after the Sales foundation migration is applied.
        for (const account of DEFAULT_FINANCIAL_ACCOUNTS) {
          await tx.financialAccount.upsert({
            where: {
              organizationId_branchId_code: {
                organizationId: organization.id,
                branchId: branch.id,
                code: account.code,
              },
            },
            create: {
              id: account.id,
              organizationId: organization.id,
              branchId: branch.id,
              code: account.code,
              name: account.name,
              accountType: account.accountType,
              accountSubtype: account.accountSubtype,
              normalBalance: account.normalBalance,
            },
            update: {},
          });
        }

        // Named, owner-editable defaults for the external-services fee model.
        // Empty updates preserve any rate an owner has already changed.
        for (const setting of DEFAULT_APPLICATION_SETTINGS) {
          await tx.applicationSetting.upsert({
            where: {
              organizationId_branchId_key: {
                organizationId: organization.id,
                branchId: branch.id,
                key: setting.key,
              },
            },
            create: {
              organizationId: organization.id,
              branchId: branch.id,
              key: setting.key,
              value: setting.value,
              valueType: "integer",
              description: setting.description,
            },
            update: {},
          });
        }

        // Development-only reference prerequisites for the Add Product flow.
        // Empty updates deliberately preserve any names/flags edited by the
        // owner, and no product, price, stock or transaction rows are seeded.
        const smartphoneCategory = await tx.category.upsert({
          where: {
            organizationId_slug: {
              organizationId: organization.id,
              slug: "smartphones",
            },
          },
          create: {
            id: SEED_IDS.smartphoneCategory,
            organizationId: organization.id,
            name: "Smartphones",
            slug: "smartphones",
          },
          update: {},
        });

        const unbrandedBrand = await tx.brand.upsert({
          where: {
            organizationId_slug: {
              organizationId: organization.id,
              slug: "unbranded",
            },
          },
          create: {
            id: SEED_IDS.unbrandedBrand,
            organizationId: organization.id,
            name: "Unbranded",
            slug: "unbranded",
          },
          update: {},
        });

        await tx.productModel.upsert({
          where: {
            organizationId_brandId_canonicalName: {
              organizationId: organization.id,
              brandId: unbrandedBrand.id,
              canonicalName: "generic smartphone",
            },
          },
          create: {
            id: SEED_IDS.genericSmartphoneModel,
            organizationId: organization.id,
            brandId: unbrandedBrand.id,
            categoryId: smartphoneCategory.id,
            name: "Generic smartphone",
            canonicalName: "generic smartphone",
          },
          update: {},
        });

        const permissionByKey = new Map<string, string>();
        for (const key of ALL_PERMISSIONS) {
          const [resource, action] = key.split(".");
          if (!resource || !action)
            throw new Error(`Invalid permission key: ${key}`);
          const permission = await tx.permission.upsert({
            where: { key },
            create: { key, resource, action },
            update: { resource, action },
          });
          permissionByKey.set(key, permission.id);
        }

        const roleByCode = new Map<RoleCode, string>();
        for (const roleCode of Object.values(ROLES)) {
          const details = ROLE_DETAILS[roleCode];
          const existing = await tx.role.findUnique({
            where: {
              organizationId_code: {
                organizationId: organization.id,
                code: roleCode,
              },
            },
            select: { id: true },
          });
          const role =
            existing ??
            (await tx.role.create({
              data: {
                organizationId: organization.id,
                code: roleCode,
                name: details.name,
                description: details.description,
                isSystem: true,
              },
              select: { id: true },
            }));
          roleByCode.set(roleCode, role.id);

          // Default grants are installed only with a new system role. Re-running
          // the seed must never overwrite permission edits made by an owner.
          if (existing === null) {
            for (const permissionKey of DEFAULT_ROLE_PERMISSIONS[roleCode]) {
              const permissionId = permissionByKey.get(permissionKey);
              if (!permissionId) {
                throw new Error(`Missing permission row for ${permissionKey}`);
              }
              await tx.rolePermission.create({
                data: { roleId: role.id, permissionId },
              });
            }
          }
        }

        const existingOwner = await tx.user.findUnique({
          where: {
            organizationId_email: {
              organizationId: organization.id,
              email: ownerCredentials.email,
            },
          },
        });
        const owner =
          existingOwner ??
          (await tx.user.create({
            data: {
              organizationId: organization.id,
              email: ownerCredentials.email,
              passwordHash: ownerPasswordHash,
              fullName: "Shop Owner",
              mustChangePassword: false,
            },
          }));

        const ownerRoleId = roleByCode.get(ROLES.OWNER);
        if (!ownerRoleId) throw new Error("Owner role was not seeded");
        await tx.userRole.upsert({
          where: {
            organizationId_userId_roleId: {
              organizationId: organization.id,
              userId: owner.id,
              roleId: ownerRoleId,
            },
          },
          create: {
            organizationId: organization.id,
            userId: owner.id,
            roleId: ownerRoleId,
            assignedBy: owner.id,
          },
          update: {},
        });

        const ownerScope = await tx.userScopeAccess.findFirst({
          where: {
            organizationId: organization.id,
            userId: owner.id,
            branchId: branch.id,
            locationId: null,
          },
          select: { id: true },
        });
        if (ownerScope === null) {
          await tx.userScopeAccess.create({
            data: {
              organizationId: organization.id,
              userId: owner.id,
              branchId: branch.id,
              locationId: null,
            },
          });
        }
      },
      { timeout: 30_000 },
    );

    // Safe output only. Never print the email, password, hash or connection URL.
    console.log("Development baseline seed completed.");
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch(() => {
  console.error(
    "Database seed failed. Review the non-secret seed configuration and database status.",
  );
  process.exitCode = 1;
});
