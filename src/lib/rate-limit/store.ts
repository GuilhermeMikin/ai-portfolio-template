import type { RateLimitStoreKind } from "@/lib/ai/config";

export type WindowLimitOptions = {
  /** Max requests allowed in any rolling window. */
  limit: number;
  windowMs: number;
};

export type WindowLimitResult = {
  success: boolean;
  remaining: number;
  /** How long until a request may pass again (0 when allowed). */
  retryAfterMs: number;
};

/** One counter of an all-or-nothing check (see `RateLimitStore.consumeCounters`). */
export type CounterCheck = {
  key: string;
  /** Added when every check passes. Defaults to 1. */
  amount?: number;
  /** The highest value the counter may reach. */
  limit: number;
  /** The counter expires this long after it was created. */
  ttlMs: number;
  /**
   * A site-wide counter such as the daily cap. The memory store never evicts these to make
   * room for per-visitor keys, so flooding it with new visitors cannot reset them.
   */
  global?: boolean;
};

export type CounterCheckResult =
  | { success: true }
  | {
      success: false;
      /** Index (in the checks passed) of the first counter that would go over its limit. */
      failedIndex: number;
      /** Time left before that counter resets; 0 when unknown. */
      ttlMs: number;
    };

/**
 * Keys are namespaced by the caller (e.g. `chat:rpm:<ip-hash>`). The Upstash store also
 * prefixes them with RATE_LIMIT_KEY_PREFIX so several sites can share one database.
 *
 * A request that is turned away must not use up any quota, so every operation that writes
 * does so only when the request fits, and the read-only variants let a caller check all its
 * limits before writing anything.
 */
export type RateLimitStore = {
  readonly kind: RateLimitStoreKind;
  /** Counts one request against a sliding window if it fits, and says whether it may pass. */
  limit(key: string, options: WindowLimitOptions): Promise<WindowLimitResult>;
  /** What `limit` would answer, without counting anything. */
  peekLimit(key: string, options: WindowLimitOptions): Promise<WindowLimitResult>;
  /** Gives back one request counted by `limit` (a later check turned the request away). */
  releaseLimit(key: string, options: WindowLimitOptions): Promise<void>;
  /** Whether every counter could take its amount, without changing any of them. */
  checkCounters(checks: CounterCheck[]): Promise<CounterCheckResult>;
  /** Atomically adds every amount, but only when every counter stays within its limit. */
  consumeCounters(checks: CounterCheck[]): Promise<CounterCheckResult>;
};

/** The backing store failed (network, timeout, bad reply). */
export class RateLimitStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RateLimitStoreError";
  }
}

const DEFAULT_KEY_PREFIX = "portfolio";

export function getRateLimitKeyPrefix(env: Record<string, string | undefined> = process.env) {
  return env.RATE_LIMIT_KEY_PREFIX?.trim().replace(/:+$/, "") || DEFAULT_KEY_PREFIX;
}
