/**
 * Express request augmentation.
 *
 * Declared against the global `Express` namespace rather than
 * `express-serve-static-core`, which is a transitive dependency and not
 * resolvable as an augmentation target from this package.
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation ID for this request, assigned by RequestIdMiddleware.
       * Present on every log line and in every error body.
       */
      requestId: string;
    }
  }
}

export {};
