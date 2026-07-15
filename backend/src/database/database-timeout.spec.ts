import { afterEach, describe, expect, it, vi } from "vitest";
import { withDatabaseTimeout } from "./database-timeout";

describe("withDatabaseTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an operation result that arrives within the budget", async () => {
    await expect(withDatabaseTimeout(Promise.resolve("ok"), 100)).resolves.toBe(
      "ok",
    );
  });

  it("rejects within the configured budget when an operation hangs", async () => {
    vi.useFakeTimers();
    const pending = withDatabaseTimeout(
      new Promise<never>(() => undefined),
      250,
    );
    const assertion = expect(pending).rejects.toMatchObject({
      name: "DatabaseOperationTimeoutError",
      timeoutMs: 250,
    });

    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });
});
