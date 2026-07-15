import { z } from "zod";
import { LIMITS } from "./constants";

/**
 * Public authentication contracts shared by the browser and API.
 *
 * Passwords exist only on the login input boundary. They are deliberately absent
 * from every response schema so a database model can never accidentally become
 * the public current-user shape.
 */
export const LoginInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "Enter your email address.")
      .max(255, "Email address is too long.")
      .email("Enter a valid email address.")
      .transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(1, "Enter your password.")
      .max(
        LIMITS.MAX_PASSWORD_LENGTH,
        `Password must be ${LIMITS.MAX_PASSWORD_LENGTH} characters or fewer.`,
      ),
  })
  .strict();

export type LoginInput = z.input<typeof LoginInputSchema>;
export type LoginCredentials = z.output<typeof LoginInputSchema>;

export const CurrentAuthSchema = z
  .object({
    user: z
      .object({
        id: z.uuid(),
        email: z.email(),
        fullName: z.string().min(1),
        phone: z.string().min(1).nullable(),
        mustChangePassword: z.boolean(),
      })
      .strict(),
    organization: z
      .object({
        id: z.uuid(),
        name: z.string().min(1),
        currency: z.string().regex(/^[A-Z]{3}$/),
        timezone: z.string().min(1),
      })
      .strict(),
    branch: z
      .object({
        id: z.uuid(),
        code: z.string().min(1),
        name: z.string().min(1),
      })
      .strict(),
    // Role codes may include future owner-defined roles. Permission keys are
    // still resolved from database grants and enforced only by the backend.
    roles: z.array(z.string().min(1)),
    permissions: z.array(z.string().min(1)),
    scopes: z.array(
      z
        .object({
          branchId: z.uuid(),
          locationId: z.uuid().nullable(),
        })
        .strict(),
    ),
    session: z
      .object({
        expiresAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();

export type CurrentAuth = z.infer<typeof CurrentAuthSchema>;
