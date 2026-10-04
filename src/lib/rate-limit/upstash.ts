/**
 * Upstash Redis rate-limit store: shared by every server instance.
 *
 * Sliding windows use @upstash/ratelimit, whose script only counts a request when it
 * fits. Counters use the Lua script below, so checking and adding happen in one atomic
 * step for all the counters of a request.
 */
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import {
  RateLimitStoreError,
  getRateLimitKeyPrefix,
  type CounterCheck,
  type CounterCheckResult,
  type RateLimitStore,
  type WindowLimitOptions,
  type WindowLimitResult,
} from "./store";

type Env = Record<string, string | undefined>;

/** Keep store failures fast: a slow guard delays every chat request. */
const REDIS_REQUEST_TIMEOUT_MS = 3_000;

/**
 * All-or-nothing counters, atomic because Redis runs a script without interleaving.
 *
 * KEYS: the counter keys. ARGV[1]: "1" to add, "0" to only check. Then three values per
 * key: amount, limit, ttl in ms (key i uses ARGV[3i-1], ARGV[3i], ARGV[3i+1]).
 * Returns {0, 0} when every counter can take its amount (and adds them when asked), or
 * {i, pttl} for the first key i (1-based) that would go over its limit, without writing.
 * Setting the expiry only when the key has none also repairs a key that lost its TTL.
 */
const COUNTERS_SCRIPT = `
for i, key in ipairs(KEYS) do
  local amount = tonumber(ARGV[3 * i - 1])
  local limit = tonumber(ARGV[3 * i])
  local value = tonumber(redis.call("GET", key) or "0")
  if value + amount > limit then
    return {i, redis.call("PTTL", key)}
  end
end
if ARGV[1] == "1" then
  for i, key in ipairs(KEYS) do
    redis.call("INCRBY", key, ARGV[3 * i - 1])
    if redis.call("PTTL", key) < 0 then
      redis.call("PEXPIRE", key, ARGV[3 * i + 1])
    end
  end
end
return {0, 0}
`;

let cachedClient: { url: string; token: string; redis: Redis } | null = null;
const limiters = new Map<string, Ratelimit>();

function getRedis(env: Env) {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

  if (!cachedClient || cachedClient.url !== url || cachedClient.token !== token) {
    cachedClient = {
      url,
      token,
      redis: new Redis({
        url,
        token,
        retry: { retries: 1, backoff: () => 100 },
        signal: () => AbortSignal.timeout(REDIS_REQUEST_TIMEOUT_MS),
        enableTelemetry: false,
      }),
    };
    limiters.clear();
  }

  return cachedClient.redis;
}

function getLimiter(redis: Redis, prefix: string, { limit, windowMs }: WindowLimitOptions) {
  const cacheKey = `${prefix}|${limit}|${windowMs}`;
  let limiter = limiters.get(cacheKey);

  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      prefix,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms` as Duration),
      analytics: false,
      timeout: REDIS_REQUEST_TIMEOUT_MS,
    });
    limiters.set(cacheKey, limiter);
  }

  return limiter;
}

function storeError(message: string, error: unknown) {
  return error instanceof RateLimitStoreError ? error : new RateLimitStoreError(message, { cause: error });
}

export function getUpstashRateLimitStore(env: Env = process.env): RateLimitStore {
  const prefix = getRateLimitKeyPrefix(env);

  async function runCounters(checks: CounterCheck[], commit: boolean): Promise<CounterCheckResult> {
    if (checks.length === 0) {
      return { success: true };
    }

    let reply: unknown;
    try {
      reply = await getRedis(env).eval(
        COUNTERS_SCRIPT,
        checks.map((check) => `${prefix}:${check.key}`),
        [commit ? "1" : "0", ...checks.flatMap((check) => [check.amount ?? 1, check.limit, Math.max(Math.ceil(check.ttlMs), 1)])]
      );
    } catch (error) {
      throw storeError("Upstash counters failed.", error);
    }

    const [failed, ttl] = Array.isArray(reply) ? reply.map(Number) : [];
    if (!Number.isInteger(failed) || failed < 0 || failed > checks.length || !Number.isFinite(ttl)) {
      throw new RateLimitStoreError("Upstash counters returned an unexpected reply.");
    }

    return failed === 0 ? { success: true } : { success: false, failedIndex: failed - 1, ttlMs: Math.max(ttl, 0) };
  }

  return {
    kind: "upstash",

    async limit(key: string, options: WindowLimitOptions): Promise<WindowLimitResult> {
      try {
        const result = await getLimiter(getRedis(env), prefix, options).limit(key);
        // On timeout the library lets the request through; we report it as a failure instead.
        if (result.reason === "timeout") {
          throw new RateLimitStoreError("Upstash rate limit timed out.");
        }

        return {
          success: result.success,
          remaining: result.remaining,
          retryAfterMs: result.success ? 0 : Math.max(result.reset - Date.now(), 1_000),
        };
      } catch (error) {
        throw storeError("Upstash rate limit failed.", error);
      }
    },

    async peekLimit(key: string, options: WindowLimitOptions): Promise<WindowLimitResult> {
      try {
        // Read-only: the library's "remaining tokens" script never increments.
        const { remaining, reset } = await getLimiter(getRedis(env), prefix, options).getRemaining(key);
        return remaining > 0
          ? { success: true, remaining: remaining - 1, retryAfterMs: 0 }
          : { success: false, remaining: 0, retryAfterMs: Math.max(reset - Date.now(), 1_000) };
      } catch (error) {
        throw storeError("Upstash rate limit check failed.", error);
      }
    },

    async releaseLimit(key: string, options: WindowLimitOptions): Promise<void> {
      try {
        // A negative rate is the library's refund: it decrements the current window.
        await getLimiter(getRedis(env), prefix, options).limit(key, { rate: -1 });
      } catch (error) {
        throw storeError("Upstash rate limit release failed.", error);
      }
    },

    checkCounters: (checks) => runCounters(checks, false),
    consumeCounters: (checks) => runCounters(checks, true),
  };
}

export function resetUpstashRateLimitStore() {
  cachedClient = null;
  limiters.clear();
}
