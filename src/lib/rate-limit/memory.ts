/**
 * In-memory rate-limit store.
 *
 * Per process only: on serverless or multi-instance hosting every instance keeps its own
 * counts, so these limits are NOT global. Use Upstash for real protection in production.
 *
 * Memory stays bounded: expired entries are swept, and per-visitor keys are capped (the
 * least recently written go first). Site-wide counters (`global` checks, such as the daily
 * cap) live apart and are never evicted, so a flood of new or spoofed visitors cannot
 * push them out and reset the cap.
 */
import type {
  CounterCheck,
  CounterCheckResult,
  RateLimitStore,
  WindowLimitOptions,
  WindowLimitResult,
} from "./store";

export const MEMORY_STORE_MAX_KEYS = 10_000;
/** A full map is swept for expired entries at most this often; otherwise it just evicts. */
const SWEEP_INTERVAL_MS = 1_000;

type Expiring = { expiresAt: number };
type WindowEntry = Expiring & { hits: number[] };
type CounterEntry = Expiring & { value: number };

/**
 * A Map whose entries expire. With a `maxKeys` cap, writing a new key to a full map evicts
 * the least recently written keys; without one (`null`), expired entries are swept on
 * every write instead.
 */
class TtlMap<T extends Expiring> {
  private readonly entries = new Map<string, T>();
  private lastSweepAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly maxKeys: number | null) {}

  get(key: string, now: number): T | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, value: T, now: number) {
    // Re-inserting moves the key to the end, so Map order is "least recently written first".
    this.entries.delete(key);

    if (this.maxKeys === null) {
      this.sweep(now);
    } else if (this.entries.size >= this.maxKeys) {
      if (now - this.lastSweepAt >= SWEEP_INTERVAL_MS) {
        this.sweep(now);
      }
      for (const oldestKey of this.entries.keys()) {
        if (this.entries.size < this.maxKeys) break;
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(key, value);
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  private sweep(now: number) {
    this.lastSweepAt = now;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

function createMemoryRateLimitStore(maxKeys = MEMORY_STORE_MAX_KEYS) {
  const windows = new TtlMap<WindowEntry>(maxKeys);
  const counters = new TtlMap<CounterEntry>(maxKeys);
  const globalCounters = new TtlMap<CounterEntry>(null);

  /** Timestamps of the requests still inside the window (sliding log). */
  const recentHits = (key: string, windowMs: number, now: number) =>
    (windows.get(key, now)?.hits ?? []).filter((timestamp) => timestamp > now - windowMs);

  const blocked = (hits: number[], windowMs: number, now: number): WindowLimitResult => ({
    success: false,
    remaining: 0,
    retryAfterMs: Math.max(hits[0] + windowMs - now, 1),
  });

  const countersFor = (check: CounterCheck) => (check.global ? globalCounters : counters);

  const firstFailure = (checks: CounterCheck[], now: number): CounterCheckResult => {
    for (const [index, check] of checks.entries()) {
      const entry = countersFor(check).get(check.key, now);
      if ((entry?.value ?? 0) + (check.amount ?? 1) > check.limit) {
        return { success: false, failedIndex: index, ttlMs: entry ? entry.expiresAt - now : 0 };
      }
    }
    return { success: true };
  };

  const store: RateLimitStore & { clear(): void } = {
    kind: "memory",

    async limit(key: string, { limit, windowMs }: WindowLimitOptions): Promise<WindowLimitResult> {
      const now = Date.now();
      const hits = recentHits(key, windowMs, now);
      if (hits.length >= limit) {
        return blocked(hits, windowMs, now);
      }

      hits.push(now);
      windows.set(key, { hits, expiresAt: now + windowMs }, now);
      return { success: true, remaining: limit - hits.length, retryAfterMs: 0 };
    },

    async peekLimit(key: string, { limit, windowMs }: WindowLimitOptions): Promise<WindowLimitResult> {
      const now = Date.now();
      const hits = recentHits(key, windowMs, now);
      return hits.length >= limit
        ? blocked(hits, windowMs, now)
        : { success: true, remaining: limit - hits.length - 1, retryAfterMs: 0 };
    },

    async releaseLimit(key: string, { windowMs }: WindowLimitOptions): Promise<void> {
      const now = Date.now();
      const hits = recentHits(key, windowMs, now);
      hits.pop();
      if (hits.length === 0) {
        windows.delete(key);
      } else {
        windows.set(key, { hits, expiresAt: hits[hits.length - 1] + windowMs }, now);
      }
    },

    async checkCounters(checks: CounterCheck[]): Promise<CounterCheckResult> {
      return firstFailure(checks, Date.now());
    },

    async consumeCounters(checks: CounterCheck[]): Promise<CounterCheckResult> {
      // No await between the check and the writes: atomic within this process.
      const now = Date.now();
      const result = firstFailure(checks, now);
      if (!result.success) {
        return result;
      }

      for (const check of checks) {
        const target = countersFor(check);
        const entry = target.get(check.key, now) ?? { value: 0, expiresAt: now + check.ttlMs };
        target.set(check.key, { value: entry.value + (check.amount ?? 1), expiresAt: entry.expiresAt }, now);
      }
      return { success: true };
    },

    clear() {
      windows.clear();
      counters.clear();
      globalCounters.clear();
    },
  };

  return store;
}

export const memoryRateLimitStore = createMemoryRateLimitStore();
export { createMemoryRateLimitStore };
