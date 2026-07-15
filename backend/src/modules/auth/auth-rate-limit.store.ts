import { Injectable, type OnApplicationShutdown } from "@nestjs/common";

/** Hard memory ceiling for credential trackers in one API process. */
export const AUTH_RATE_LIMIT_MAX_TRACKERS = 10_000;

interface TrackerEntry {
  hits: number;
  windowExpiresAt: number;
  blockedUntil: number;
}

export interface AuthRateLimitDecision {
  readonly isBlocked: boolean;
  /** True only for the request that changed this tracker to blocked. */
  readonly becameBlocked: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Bounded, TTL-evicting state for the stricter credential limiter.
 *
 * Nest's in-memory ThrottlerStorage retains an empty Map key after hit timers
 * expire. Email identifiers are attacker-controlled, so auth uses this store
 * instead: expired entries are deleted, a single timer performs idle cleanup,
 * and an absolute ceiling prevents unbounded cardinality between cleanups.
 */
@Injectable()
export class AuthRateLimitStore implements OnApplicationShutdown {
  private readonly trackers = new Map<string, TrackerEntry>();
  private cleanupTimer: NodeJS.Timeout | undefined;
  private cleanupScheduledFor: number | undefined;

  get trackedKeyCount(): number {
    return this.trackers.size;
  }

  hasTracker(key: string): boolean {
    return this.trackers.has(key);
  }

  consume(
    key: string,
    limit: number,
    ttlMs: number,
    now = Date.now(),
  ): AuthRateLimitDecision {
    if (limit < 1 || ttlMs < 1) {
      throw new RangeError("Auth rate-limit policy must be positive");
    }

    let entry = this.trackers.get(key);
    if (entry !== undefined && this.expiresAt(entry) <= now) {
      this.trackers.delete(key);
      entry = undefined;
    }

    if (entry !== undefined && entry.blockedUntil !== 0) {
      return this.blockedDecision(entry.blockedUntil, now, false);
    }

    if (entry === undefined) {
      this.ensureCapacity(now);
      const created: TrackerEntry = {
        hits: 1,
        windowExpiresAt: now + ttlMs,
        blockedUntil: 0,
      };
      this.trackers.set(key, created);
      this.scheduleCleanup(created.windowExpiresAt);
      return { isBlocked: false, becameBlocked: false, retryAfterSeconds: 0 };
    }

    entry.hits += 1;
    if (entry.hits <= limit) {
      return { isBlocked: false, becameBlocked: false, retryAfterSeconds: 0 };
    }

    entry.blockedUntil = now + ttlMs;
    this.scheduleCleanup(entry.blockedUntil);
    return this.blockedDecision(entry.blockedUntil, now, true);
  }

  /** Public for deterministic tests and operational cleanup hooks. */
  cleanupExpired(now = Date.now()): number {
    if (this.cleanupTimer !== undefined) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = undefined;
    this.cleanupScheduledFor = undefined;

    const before = this.trackers.size;
    for (const [key, entry] of this.trackers) {
      if (this.expiresAt(entry) <= now) this.trackers.delete(key);
    }
    this.scheduleNextCleanup();
    return before - this.trackers.size;
  }

  onApplicationShutdown(): void {
    if (this.cleanupTimer !== undefined) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = undefined;
    this.cleanupScheduledFor = undefined;
    this.trackers.clear();
  }

  private blockedDecision(
    blockedUntil: number,
    now: number,
    becameBlocked: boolean,
  ): AuthRateLimitDecision {
    return {
      isBlocked: true,
      becameBlocked,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1_000)),
    };
  }

  private expiresAt(entry: TrackerEntry): number {
    return entry.blockedUntil || entry.windowExpiresAt;
  }

  private ensureCapacity(now: number): void {
    if (this.trackers.size < AUTH_RATE_LIMIT_MAX_TRACKERS) return;

    for (const [key, entry] of this.trackers) {
      if (this.expiresAt(entry) <= now) this.trackers.delete(key);
    }
    if (this.trackers.size < AUTH_RATE_LIMIT_MAX_TRACKERS) return;

    // Preserve active blocks where possible; evict the oldest ordinary window.
    let fallbackKey: string | undefined;
    for (const [key, entry] of this.trackers) {
      fallbackKey ??= key;
      if (entry.blockedUntil === 0) {
        this.trackers.delete(key);
        return;
      }
    }
    if (fallbackKey !== undefined) this.trackers.delete(fallbackKey);
  }

  private scheduleCleanup(expiresAt: number): void {
    if (
      this.cleanupScheduledFor !== undefined &&
      this.cleanupScheduledFor <= expiresAt
    ) {
      return;
    }
    if (this.cleanupTimer !== undefined) clearTimeout(this.cleanupTimer);

    this.cleanupScheduledFor = expiresAt;
    this.cleanupTimer = setTimeout(
      () => {
        this.cleanupTimer = undefined;
        this.cleanupScheduledFor = undefined;
        this.cleanupExpired();
      },
      Math.max(1, expiresAt - Date.now()),
    );
    this.cleanupTimer.unref();
  }

  private scheduleNextCleanup(): void {
    let earliest: number | undefined;
    for (const entry of this.trackers.values()) {
      const expiration = this.expiresAt(entry);
      if (earliest === undefined || expiration < earliest)
        earliest = expiration;
    }
    if (earliest !== undefined) this.scheduleCleanup(earliest);
  }
}
