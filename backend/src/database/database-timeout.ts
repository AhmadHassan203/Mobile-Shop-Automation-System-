/** Error used internally when a database lifecycle/probe operation exceeds its budget. */
export class DatabaseOperationTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Database operation exceeded its ${timeoutMs} ms timeout`);
    this.name = "DatabaseOperationTimeoutError";
  }
}

/**
 * Bound an operation without logging its error, which may contain connection detail.
 * The original promise retains resolve/reject handlers after timeout, so it cannot
 * later create an unhandled rejection.
 */
export function withDatabaseTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DatabaseOperationTimeoutError(timeoutMs)),
      timeoutMs,
    );
    timer.unref();

    void operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(
          error instanceof Error
            ? error
            : new Error("Database operation failed", { cause: error }),
        );
      },
    );
  });
}
