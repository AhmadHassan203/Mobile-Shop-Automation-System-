const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Schedule an absolute session deadline. Long sessions are re-armed because
 * browser timers cannot safely represent delays above a signed 32-bit integer.
 */
export function scheduleSessionExpiry(
  expiresAt: string,
  onExpired: () => void,
): () => void {
  const expiryTime = Date.parse(expiresAt);
  if (!Number.isFinite(expiryTime)) {
    throw new RangeError("Session expiry must be a valid ISO date-time.");
  }

  let cancelled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const arm = (): void => {
    if (cancelled) return;

    const remaining = expiryTime - Date.now();
    if (remaining <= 0) {
      cancelled = true;
      onExpired();
      return;
    }

    timeout = setTimeout(arm, Math.min(remaining, MAX_TIMER_DELAY_MS));
  };

  arm();

  return () => {
    cancelled = true;
    if (timeout !== undefined) clearTimeout(timeout);
  };
}
