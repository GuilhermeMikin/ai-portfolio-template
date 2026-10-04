import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { enforceChatGuardrails, type ChatGuardParams } from "@/lib/ai/guardrails";
import { ChatRouteError } from "@/lib/ai/errors";
import { resetEnvWarnings } from "@/lib/env";
import {
  RateLimitStoreError,
  getClientIp,
  getClientIpHash,
  getRateLimitKeyPrefix,
  getRateLimitStore,
  normalizeClientIp,
  resetRateLimitStores,
  type CounterCheck,
  type RateLimitStore,
} from "@/lib/rate-limit";
import { MEMORY_STORE_MAX_KEYS, createMemoryRateLimitStore } from "@/lib/rate-limit/memory";

function requestFrom(headers: Record<string, string>) {
  return new Request("http://localhost/api/chat", { method: "POST", headers });
}

beforeEach(() => {
  resetRateLimitStores();
  resetEnvWarnings();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("memory store — sliding window", () => {
  it("allows `limit` requests per window, then reports when to retry", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    const store = getRateLimitStore("memory");
    const options = { limit: 2, windowMs: 60_000 };

    expect(await store.limit("test:window", options)).toMatchObject({ success: true, remaining: 1 });
    vi.advanceTimersByTime(10_000);
    expect(await store.limit("test:window", options)).toMatchObject({ success: true, remaining: 0 });

    const blocked = await store.limit("test:window", options);
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterMs).toBe(50_000);

    // The first hit leaves the window after 60 s.
    vi.advanceTimersByTime(50_000);
    expect((await store.limit("test:window", options)).success).toBe(true);
    // Keys are independent.
    expect((await store.limit("test:other", options)).success).toBe(true);
  });

  it("peeks without counting and gives a counted request back", async () => {
    const store = createMemoryRateLimitStore();
    const options = { limit: 1, windowMs: 60_000 };

    expect(await store.peekLimit("w", options)).toMatchObject({ success: true, remaining: 0 });
    expect(await store.peekLimit("w", options)).toMatchObject({ success: true });
    expect((await store.limit("w", options)).success).toBe(true);
    expect((await store.peekLimit("w", options)).success).toBe(false);
    expect((await store.limit("w", options)).success).toBe(false);

    await store.releaseLimit("w", options);
    expect((await store.limit("w", options)).success).toBe(true);
  });
});

describe("memory store — counters", () => {
  const check = (key: string, limit: number, extra: Partial<CounterCheck> = {}): CounterCheck => ({
    key,
    limit,
    ttlMs: 60_000,
    ...extra,
  });

  it("adds every amount only when every counter fits", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    const store = createMemoryRateLimitStore();

    expect(await store.consumeCounters([check("a", 2), check("b", 10, { amount: 6 })])).toEqual({ success: true });
    // "b" would reach 12: nothing is added, not even to "a".
    expect(await store.consumeCounters([check("a", 2), check("b", 10, { amount: 6 })])).toEqual({
      success: false,
      failedIndex: 1,
      ttlMs: 60_000,
    });
    expect(await store.consumeCounters([check("a", 2), check("b", 10, { amount: 4 })])).toEqual({ success: true });
    expect(await store.checkCounters([check("a", 2)])).toMatchObject({ success: false, failedIndex: 0 });
  });

  it("checks without writing", async () => {
    const store = createMemoryRateLimitStore();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await store.checkCounters([check("a", 1)])).toEqual({ success: true });
    }
    expect(await store.consumeCounters([check("a", 1)])).toEqual({ success: true });
  });

  it("resets a counter after its TTL", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    const store = createMemoryRateLimitStore();

    expect(await store.consumeCounters([check("a", 1, { ttlMs: 1_000 })])).toEqual({ success: true });
    vi.advanceTimersByTime(400);
    expect(await store.consumeCounters([check("a", 1, { ttlMs: 1_000 })])).toEqual({
      success: false,
      failedIndex: 0,
      ttlMs: 600,
    });
    vi.advanceTimersByTime(600);
    expect(await store.consumeCounters([check("a", 1, { ttlMs: 1_000 })])).toEqual({ success: true });
  });

  it("caps per-visitor keys by evicting the least recently written", async () => {
    const store = createMemoryRateLimitStore(3);
    for (const key of ["a", "b", "c"]) {
      await store.consumeCounters([check(key, 5)]);
    }
    // Writing "a" again makes "b" the least recently written.
    await store.consumeCounters([check("a", 5)]);
    await store.consumeCounters([check("d", 5)]);

    expect(await store.checkCounters([check("a", 2)])).toMatchObject({ success: false }); // a = 2, kept
    expect(await store.checkCounters([check("b", 1)])).toEqual({ success: true }); // b was evicted
    expect(await store.checkCounters([check("c", 1)])).toMatchObject({ success: false }); // c = 1, kept
  });

  it("never evicts a site-wide counter, however many visitors arrive", async () => {
    const store = createMemoryRateLimitStore(3);
    const daily = check("daily", 1, { global: true });

    expect(await store.consumeCounters([daily])).toEqual({ success: true });
    for (let index = 0; index < 50; index += 1) {
      await store.consumeCounters([check(`visitor:${index}`, 5)]);
      await store.limit(`rpm:${index}`, { limit: 5, windowMs: 60_000 });
    }

    expect(await store.consumeCounters([daily])).toMatchObject({ success: false, failedIndex: 0 });
  });
});

describe("normalizeClientIp", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["203.0.113.7:51234", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["::FFFF:cb00:7107", "203.0.113.7"],
    ["[::ffff:203.0.113.7]:443", "203.0.113.7"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:0db8:0001:0002:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::1", "2001:db8:1:2::/64"],
    ["[2001:db8::1]:8080", "2001:db8:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["64:ff9b::203.0.113.7", "64:ff9b:0:0::/64"],
    ["unknown", "unknown"],
    ["not an address", "unknown"],
    ["", "unknown"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeClientIp(input)).toBe(expected);
  });

  it("gives every address of one IPv6 /64 the same identity", () => {
    expect(getClientIpHash(requestFrom({ "x-forwarded-for": "2001:db8:1:2::a" }))).toBe(
      getClientIpHash(requestFrom({ "x-forwarded-for": "2001:db8:1:2:ffff::b" }))
    );
    expect(getClientIpHash(requestFrom({ "x-forwarded-for": "2001:db8:1:3::a" }))).not.toBe(
      getClientIpHash(requestFrom({ "x-forwarded-for": "2001:db8:1:2::a" }))
    );
  });
});

describe("getClientIpHash", () => {
  it("hashes the first x-forwarded-for entry", () => {
    const hash = getClientIpHash(requestFrom({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain("203.0.113.7");
    expect(getClientIpHash(requestFrom({ "x-forwarded-for": "203.0.113.7" }))).toBe(hash);
    expect(getClientIpHash(requestFrom({ "x-forwarded-for": "203.0.113.8" }))).not.toBe(hash);
    expect(getClientIpHash(requestFrom({ "x-forwarded-for": "::ffff:203.0.113.7" }))).toBe(hash);
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(getClientIpHash(requestFrom({ "x-real-ip": "203.0.113.7" }))).toBe(
      getClientIpHash(requestFrom({ "x-forwarded-for": "203.0.113.7" }))
    );
    expect(getClientIp(requestFrom({}))).toBe("unknown");
    expect(getClientIpHash(requestFrom({}))).toMatch(/^[0-9a-f]{32}$/);
  });

  it("reads only RATE_LIMIT_IP_HEADER when it is set", () => {
    const env = { RATE_LIMIT_IP_HEADER: " Fly-Client-IP " };
    expect(getClientIp(requestFrom({ "fly-client-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" }), env)).toBe(
      "203.0.113.9"
    );
    // A spoofed X-Forwarded-For is ignored; without the trusted header everyone shares one bucket.
    expect(getClientIp(requestFrom({ "x-forwarded-for": "198.51.100.1" }), env)).toBe("unknown");
  });

  it("ignores a RATE_LIMIT_IP_HEADER that is not a header name, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = { RATE_LIMIT_IP_HEADER: "x-real-ip: 1.2.3.4" };
    expect(getClientIp(requestFrom({ "x-forwarded-for": "198.51.100.1" }), env)).toBe("198.51.100.1");
    expect(String(warn.mock.calls[0][0])).toContain('"variable":"RATE_LIMIT_IP_HEADER"');
    expect(String(warn.mock.calls[0][0])).not.toContain("1.2.3.4");
  });
});

describe("getRateLimitKeyPrefix", () => {
  it("defaults to `portfolio` and trims trailing colons", () => {
    expect(getRateLimitKeyPrefix({})).toBe("portfolio");
    expect(getRateLimitKeyPrefix({ RATE_LIMIT_KEY_PREFIX: " my-site: " })).toBe("my-site");
  });
});

describe("chat guardrails", () => {
  const config: ChatGuardParams["config"] = {
    rateLimitRpm: 100,
    conversationQuotaLimit: 100,
    conversationQuotaWindowSeconds: 600,
    softTokenBudgetPerMinute: 0,
    ipDailyRequestLimit: 0,
    dailyRequestLimit: 0,
  };

  function guard(ip: string, overrides: Partial<ChatGuardParams> = {}) {
    return enforceChatGuardrails({
      request: requestFrom({ "x-forwarded-for": ip }),
      storeKind: "memory",
      config,
      modelRequest: true,
      estimatedTokens: 500,
      ...overrides,
    });
  }

  async function codeOf(promise: Promise<void>) {
    try {
      await promise;
      return null;
    } catch (error) {
      return error instanceof ChatRouteError ? error.code : "unexpected";
    }
  }

  it("keeps the site-wide daily cap after the memory store is flooded with visitors", async () => {
    const capped = { config: { ...config, dailyRequestLimit: 2 } };
    expect(await codeOf(guard("203.0.113.1", capped))).toBeNull();
    expect(await codeOf(guard("203.0.113.2", capped))).toBeNull();

    // Requests that do not call the model still create per-visitor keys (minute and
    // conversation counters): more of them than the store holds.
    for (let index = 0; index < MEMORY_STORE_MAX_KEYS + 50; index += 1) {
      const ip = `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
      expect(await codeOf(guard(ip, { ...capped, modelRequest: false, conversationIdHash: `c${index}` }))).toBeNull();
    }

    expect(await codeOf(guard("203.0.113.3", capped))).toBe("daily_limit_reached");
  });

  it("checks the per-IP daily ceiling before the site-wide cap", async () => {
    const capped = { config: { ...config, ipDailyRequestLimit: 1, dailyRequestLimit: 1 } };
    expect(await codeOf(guard("203.0.113.1", capped))).toBeNull();
    expect(await codeOf(guard("203.0.113.1", capped))).toBe("ip_daily_limit_reached");
    expect(await codeOf(guard("203.0.113.2", capped))).toBe("daily_limit_reached");
  });

  it("does not charge earlier limits for a request a later one turns away", async () => {
    const capped = {
      config: { ...config, rateLimitRpm: 2, softTokenBudgetPerMinute: 1_000, dailyRequestLimit: 1 },
    };
    expect(await codeOf(guard("203.0.113.1", capped))).toBeNull();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await codeOf(guard("203.0.113.1", capped))).toBe("daily_limit_reached");
    }

    // The token budget still has room for one 500-token request, and the minute for one request.
    expect(await codeOf(guard("203.0.113.1", { ...capped, modelRequest: false }))).toBeNull();
    expect(await codeOf(guard("203.0.113.1", { ...capped, modelRequest: false }))).toBe("rate_limited");
  });

  it("gives the minute's slot back when another request takes the last daily slot first", async () => {
    const memory = createMemoryRateLimitStore();
    // Simulates the race: the read says yes, the atomic write says no.
    const store: RateLimitStore = {
      ...memory,
      checkCounters: async () => ({ success: true }),
      consumeCounters: async () => ({ success: false, failedIndex: 0, ttlMs: 0 }),
    };
    const release = vi.spyOn(store, "releaseLimit");
    const capped = { store, config: { ...config, rateLimitRpm: 1, dailyRequestLimit: 1 } };

    expect(await codeOf(guard("203.0.113.1", capped))).toBe("daily_limit_reached");
    expect(release).toHaveBeenCalledTimes(1);
    // The slot is free again.
    expect((await memory.peekLimit(release.mock.calls[0][0], { limit: 1, windowMs: 60_000 })).success).toBe(true);
  });

  it("fails closed when the store throws", async () => {
    const memory = createMemoryRateLimitStore();
    const store: RateLimitStore = {
      ...memory,
      consumeCounters: async () => {
        throw new RateLimitStoreError("down");
      },
    };

    await expect(guard("203.0.113.1", { store, config: { ...config, dailyRequestLimit: 5 } })).rejects.toMatchObject({
      code: "guard_unavailable",
      logClassification: "store_error",
    });
  });
});

describe("Upstash store", () => {
  const env = {
    UPSTASH_REDIS_REST_URL: "https://redis.example.com",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    RATE_LIMIT_KEY_PREFIX: "my-site",
  };

  /** Answers every Redis command with `result`; the client may batch them (auto-pipelining). */
  function mockRedis(result: unknown): MockInstance<typeof fetch> {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const pipelined = String(input).endsWith("/pipeline");
      const commands = pipelined ? (JSON.parse(String(init?.body)) as unknown[]) : [null];
      const body = pipelined ? commands.map(() => ({ result })) : { result };
      return new Response(JSON.stringify(body), { status: 200 });
    });
  }

  /** Every command sent, as arrays of strings. */
  function sentCommands(fetchMock: MockInstance<typeof fetch>) {
    return fetchMock.mock.calls.flatMap(([input, init]) => {
      const body = JSON.parse(String(init?.body)) as unknown[];
      return (String(input).endsWith("/pipeline") ? body : [body]) as unknown[][];
    });
  }

  const checks: CounterCheck[] = [
    { key: "chat:conversation:abc", limit: 12, ttlMs: 600_000 },
    { key: "chat:daily:2026-01-01", amount: 1, limit: 300, ttlMs: 90_000.4, global: true },
  ];

  it("consumes counters with one atomic script and prefixed keys", async () => {
    const fetchMock = mockRedis([0, 0]);

    expect(await getRateLimitStore("upstash", env).consumeCounters(checks)).toEqual({ success: true });

    const [command] = sentCommands(fetchMock);
    expect(command[0]).toMatch(/^eval/i);
    expect(String(command[1])).toContain("INCRBY");
    expect(command.slice(2).map(String)).toEqual([
      "2",
      "my-site:chat:conversation:abc",
      "my-site:chat:daily:2026-01-01",
      "1",
      "1",
      "12",
      "600000",
      "1",
      "300",
      "90001",
    ]);
  });

  it("checks counters with the same script in read-only mode and reports the first failure", async () => {
    const fetchMock = mockRedis([2, 45_000]);

    expect(await getRateLimitStore("upstash", env).checkCounters(checks)).toEqual({
      success: false,
      failedIndex: 1,
      ttlMs: 45_000,
    });
    // ARGV[1] = "0": the script returns before any INCRBY.
    expect(String(sentCommands(fetchMock)[0][5])).toBe("0");
  });

  it("rejects an unexpected reply", async () => {
    mockRedis([7, 0]);
    await expect(getRateLimitStore("upstash", env).consumeCounters(checks)).rejects.toBeInstanceOf(
      RateLimitStoreError
    );
  });

  it("peeks a window with the library's read-only script", async () => {
    // [remaining, limit]
    const fetchMock = mockRedis([0, 10]);
    const result = await getRateLimitStore("upstash", env).peekLimit("chat:rpm:abc", { limit: 10, windowMs: 60_000 });

    expect(result.success).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(1_000);
    for (const command of sentCommands(fetchMock)) {
      expect(command.map(String).join(" ")).not.toMatch(/INCRBY/);
    }
  });

  it("turns network failures into RateLimitStoreError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const store = getRateLimitStore("upstash", env);
    const window = { limit: 1, windowMs: 1_000 };

    await expect(store.consumeCounters(checks)).rejects.toBeInstanceOf(RateLimitStoreError);
    await expect(store.checkCounters(checks)).rejects.toBeInstanceOf(RateLimitStoreError);
    await expect(store.limit("chat:test", window)).rejects.toBeInstanceOf(RateLimitStoreError);
    await expect(store.peekLimit("chat:test", window)).rejects.toBeInstanceOf(RateLimitStoreError);
    await expect(store.releaseLimit("chat:test", window)).rejects.toBeInstanceOf(RateLimitStoreError);
  });
});
