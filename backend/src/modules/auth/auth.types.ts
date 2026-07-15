import type { CurrentAuth } from "@mobileshop/shared";

/** Server-only request context. The raw session token is intentionally absent. */
export interface AuthenticatedRequestContext {
  readonly current: CurrentAuth;
  readonly sessionId: string;
}
