import { PERMISSIONS, type CurrentAuth } from "@mobileshop/shared";
import { PATH_METADATA } from "@nestjs/common/constants";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { REQUIRED_PERMISSIONS } from "../../common/auth/require-permissions.decorator";
import {
  CustomersController,
  customerActorContext,
} from "./customers.controller";

const current: CurrentAuth = {
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "customer@example.test",
    fullName: "Customer User",
    phone: null,
    mustChangePassword: false,
  },
  organization: {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Test Shop",
    currency: "PKR",
    timezone: "Asia/Karachi",
  },
  branch: {
    id: "10000000-0000-4000-8000-000000000003",
    code: "MAIN",
    name: "Main Branch",
  },
  roles: ["owner"],
  permissions: [
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
    PERMISSIONS.CUSTOMERS_VIEW_SENSITIVE,
  ],
  scopes: [],
  session: { expiresAt: "2026-07-17T12:00:00.000Z" },
};

describe("CustomersController", () => {
  it("publishes customer routes under the canonical resource", () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomersController)).toBe(
      "customers",
    );
  });

  it("protects list and create with their exact permissions", () => {
    const prototype = CustomersController.prototype as unknown as Record<
      string,
      object
    >;
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, prototype["list"]!),
    ).toEqual([PERMISSIONS.CUSTOMERS_VIEW]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, prototype["create"]!),
    ).toEqual([PERMISSIONS.CUSTOMERS_MANAGE]);
  });

  it("derives tenant, branch and sensitive visibility from authentication", () => {
    const request = {
      auth: { sessionId: "session-id", current },
      ip: "127.0.0.1",
      requestId: "request-id",
      get: () => "vitest",
    } as unknown as Request;
    const context = customerActorContext(request);
    expect(context.organizationId).toBe(current.organization.id);
    expect(context.branchId).toBe(current.branch.id);
    expect(context.canViewSensitive).toBe(true);
  });

  it("fails closed without authenticated current-user context", () => {
    expect(() => customerActorContext({} as Request)).toThrow(
      "Authentication is required",
    );
  });
});
