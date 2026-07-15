import { describe, expect, it } from "vitest";
import { CurrentAuthSchema, LoginInputSchema } from "./auth";

describe("authentication contracts", () => {
  it("normalizes a login email without changing the password", () => {
    expect(
      LoginInputSchema.parse({
        email: "  Owner@MobileShop.Local ",
        password: "Case Sensitive Password",
      }),
    ).toEqual({
      email: "owner@mobileshop.local",
      password: "Case Sensitive Password",
    });
  });

  it("rejects response fields that could leak credentials", () => {
    const result = CurrentAuthSchema.safeParse({
      user: {
        id: "b1efec16-ceac-4f92-9cdc-38e69bc70517",
        email: "owner@mobileshop.local",
        fullName: "Shop Owner",
        phone: null,
        mustChangePassword: false,
        passwordHash: "must-not-leak",
      },
      organization: {
        id: "c4c952f1-20f2-49dd-aab3-32a3711a0654",
        name: "MobileShop",
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
      branch: {
        id: "d7e5f92c-f247-4022-8f5a-d97d387a4e1c",
        code: "MAIN",
        name: "Main Branch",
      },
      roles: ["owner"],
      permissions: ["settings.manage"],
      scopes: [
        {
          branchId: "d7e5f92c-f247-4022-8f5a-d97d387a4e1c",
          locationId: null,
        },
      ],
      session: { expiresAt: "2026-07-16T12:00:00.000Z" },
    });

    expect(result.success).toBe(false);
  });
});
