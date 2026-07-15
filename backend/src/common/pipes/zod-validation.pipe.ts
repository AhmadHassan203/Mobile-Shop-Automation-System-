import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { DomainError, ERROR_CODES } from "@mobileshop/shared";

/**
 * Validates request input against a Zod schema.
 *
 * `03_ARCHITECTURE.md` §2 allows "Zod or class-validator at API boundaries".
 * Zod is used throughout because `13_` §1.4 puts shared DTO contracts and schemas
 * in `shared/` — so one schema validates the request on the server AND drives the
 * React Hook Form on the client. A single definition cannot drift out of sync;
 * two parallel systems (class-validator server-side, Zod client-side) inevitably do.
 *
 * Unknown keys are stripped by the schema's own `.strict()`/`.strip()` policy, so
 * a typo'd field is rejected rather than silently ignored.
 *
 * Usage:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(CreateCustomerSchema)) body: CreateCustomerInput) {}
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<
  unknown,
  TOutput
> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // Field-level detail keyed by dotted path, matching ApiErrorBody.details.
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "(root)";
      (details[path] ??= []).push(issue.message);
    }

    throw new DomainError(
      ERROR_CODES.VALIDATION_FAILED,
      "Request validation failed",
      { details },
    );
  }
}

/** Convenience factory: `@Body(zodBody(CreateCustomerSchema))`. */
export function zodBody<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
