/**
 * Express request augmentation.
 *
 * Declared against the global `Express` namespace rather than
 * `express-serve-static-core`, which is a transitive dependency and not
 * resolvable as an augmentation target from this package.
 */
import type { AuthenticatedRequestContext } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation ID for this request, assigned by RequestIdMiddleware.
       * Present on every log line and in every error body.
       */
      requestId: string;
      /** Resolved by the global AuthGuard; absent only on explicitly public routes. */
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
