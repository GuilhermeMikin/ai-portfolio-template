import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  CHAT_ROUTE_MAX_DURATION_SECONDS,
  MAX_REQUEST_TIMEOUT_MS,
  getAiConfig,
  getChatClientConfig,
  resolveChatAvailability,
  resolveRateLimitStore,
} from "@/lib/ai/config";
import { getContactConfig } from "@/lib/contact/config";
import { resetEnvWarnings } from "@/lib/env";

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  resetEnvWarnings();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

function warnings() {
  return warnSpy.mock.calls.map((call) => String(call[0]));
}

const KEY = "sk-test-config-key";
const UPSTASH = {
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token",
};

describe("resolveChatAvailability", () => {
  it.each([
    ["no API key", {}, { enabled: false, mode: "off", reason: "missing_api_key" }],
    ["CHAT_MODE=off", { CHAT_MODE: "off", LLM_API_KEY: KEY }, { enabled: false, mode: "off", reason: "disabled_by_config" }],
    ["CHAT_MODE=live without a key", { CHAT_MODE: "live" }, { enabled: false, mode: "off", reason: "missing_api_key" }],
    ["a key in development", { LLM_API_KEY: KEY, NODE_ENV: "development" }, { enabled: true, mode: "live", store: "memory" }],
    ["CHAT_MODE=demo without a key", { CHAT_MODE: "demo" }, { enabled: true, mode: "demo", store: "memory" }],
    [
      "CHAT_MODE=demo in production without Upstash",
      { CHAT_MODE: "demo", NODE_ENV: "production" },
      { enabled: true, mode: "demo", store: "memory" },
    ],
    [
      "production without Upstash",
      { LLM_API_KEY: KEY, NODE_ENV: "production" },
      { enabled: false, mode: "off", reason: "missing_rate_limit_store" },
    ],
    [
      "production with the in-memory opt-in",
      { LLM_API_KEY: KEY, NODE_ENV: "production", CHAT_RATE_LIMIT_STORE: "memory" },
      { enabled: true, mode: "live", store: "memory" },
    ],
    [
      "production with Upstash",
      { LLM_API_KEY: KEY, NODE_ENV: "production", ...UPSTASH },
      { enabled: true, mode: "live", store: "upstash" },
    ],
    [
      "CHAT_RATE_LIMIT_STORE=upstash without credentials",
      { LLM_API_KEY: KEY, CHAT_RATE_LIMIT_STORE: "upstash" },
      { enabled: false, mode: "off", reason: "missing_rate_limit_store" },
    ],
    [
      "an unknown CHAT_MODE, even with a key",
      { CHAT_MODE: "on", LLM_API_KEY: KEY },
      { enabled: false, mode: "off", reason: "invalid_chat_mode" },
    ],
    ["CHAT_MODE in capitals", { CHAT_MODE: " DEMO " }, { enabled: true, mode: "demo", store: "memory" }],
  ])("%s", (_label, env, expected) => {
    expect(resolveChatAvailability(env)).toEqual(expected);
  });
});

describe("resolveRateLimitStore", () => {
  it("prefers Upstash when configured, unless memory is requested", () => {
    expect(resolveRateLimitStore({ ...UPSTASH, NODE_ENV: "production" })).toBe("upstash");
    expect(resolveRateLimitStore({ ...UPSTASH, CHAT_RATE_LIMIT_STORE: "memory" })).toBe("memory");
    expect(resolveRateLimitStore({ NODE_ENV: "test" })).toBe("memory");
    expect(resolveRateLimitStore({ NODE_ENV: "production" })).toBeNull();
  });
});

describe("getAiConfig", () => {
  it("applies defaults", () => {
    expect(getAiConfig({})).toMatchObject({
      llmBaseUrl: "https://api.openai.com/v1",
      chatModel: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 700,
      maxTokensParam: "max_tokens",
      requestTimeoutMs: 25_000,
      historyMode: "client",
      markdownEnabled: true,
      maxTranscriptMessages: 20,
      rateLimitRpm: 10,
      conversationQuotaLimit: 12,
      softTokenBudgetPerMinute: 32_000,
      ipDailyRequestLimit: 50,
      dailyRequestLimit: 300,
      messageMaxLength: 500,
    });
    expect(warnings()).toEqual([]);
  });

  it("clamps out-of-range values and accepts 0 where it disables a limit", () => {
    const clamped = getAiConfig({
      CHAT_MAX_TOKENS: "999999",
      CHAT_REQUEST_TIMEOUT_MS: "10",
      CHAT_DAILY_REQUEST_LIMIT: "0",
      CHAT_IP_DAILY_REQUEST_LIMIT: "0",
      CHAT_SOFT_TOKEN_BUDGET_PER_MINUTE: "0",
      CHAT_MAX_TRANSCRIPT_MESSAGES: "7",
    });
    expect(clamped.maxTokens).toBe(4_000);
    expect(clamped.requestTimeoutMs).toBe(25_000);
    expect(clamped.dailyRequestLimit).toBe(0);
    expect(clamped.ipDailyRequestLimit).toBe(0);
    expect(clamped.softTokenBudgetPerMinute).toBe(0);
    expect(clamped.maxTranscriptMessages).toBe(6);
  });

  it("keeps the model timeout below the route's maxDuration", () => {
    expect(MAX_REQUEST_TIMEOUT_MS).toBe(27_000);
    expect(MAX_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(CHAT_ROUTE_MAX_DURATION_SECONDS * 1000 - 3_000);
    expect(getAiConfig({ CHAT_REQUEST_TIMEOUT_MS: "60000" }).requestTimeoutMs).toBe(27_000);
    expect(getAiConfig({ CHAT_REQUEST_TIMEOUT_MS: "27000" }).requestTimeoutMs).toBe(27_000);
    expect(getAiConfig({ CHAT_REQUEST_TIMEOUT_MS: "1000" }).requestTimeoutMs).toBe(1_000);
  });

  it.each([
    ["CHAT_MAX_TOKENS", "12abc", "maxTokens", 700],
    ["CHAT_MAX_TOKENS", "1e3", "maxTokens", 700],
    ["CHAT_MAX_TOKENS", "800.5", "maxTokens", 700],
    ["RATE_LIMIT_RPM", "-5", "rateLimitRpm", 10],
    ["CHAT_DAILY_REQUEST_LIMIT", "0x10", "dailyRequestLimit", 300],
    ["CHAT_IP_DAILY_REQUEST_LIMIT", "ten", "ipDailyRequestLimit", 50],
    ["CHAT_TEMPERATURE", "warm", "temperature", 0.3],
    ["CHAT_TEMPERATURE", "7.5", "temperature", 0.3],
    ["CHAT_MARKDOWN_ENABLED", "maybe", "markdownEnabled", true],
    ["CHAT_HISTORY_MODE", "server", "historyMode", "client"],
    ["CHAT_MAX_TOKENS_PARAM", "max_output_tokens", "maxTokensParam", "max_tokens"],
  ] as const)("ignores %s=%j with a warning that names only the variable", (name, value, key, expected) => {
    expect(getAiConfig({ [name]: value })[key]).toBe(expected);

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain(`"variable":"${name}"`);
    expect(warnings()[0]).not.toContain(value);
  });

  it("warns once per variable, not on every request", () => {
    getAiConfig({ CHAT_MAX_TOKENS: "lots" });
    getAiConfig({ CHAT_MAX_TOKENS: "lots" });
    expect(warnings()).toHaveLength(1);
  });

  it("accepts surrounding spaces and a value at the edge of the range", () => {
    expect(getAiConfig({ CHAT_MAX_TOKENS: " 900 ", CHAT_TEMPERATURE: "2" })).toMatchObject({
      maxTokens: 900,
      temperature: 2,
    });
    expect(warnings()).toEqual([]);
  });

  it("supports reasoning models: max_completion_tokens and no temperature", () => {
    const config = getAiConfig({ CHAT_MAX_TOKENS_PARAM: "max_completion_tokens", CHAT_TEMPERATURE: "default" });
    expect(config.maxTokensParam).toBe("max_completion_tokens");
    expect(config.temperature).toBeNull();
    // Empty keeps the default.
    expect(getAiConfig({ CHAT_TEMPERATURE: "" }).temperature).toBe(0.3);
  });

  it("parses the contact form limits just as strictly", () => {
    expect(getContactConfig({ CONTACT_RATE_LIMIT_MAX: "3x", CONTACT_RATE_LIMIT_WINDOW_SECONDS: "60" })).toMatchObject({
      rateLimitMax: 5,
      rateLimitWindowSeconds: 60,
    });
    expect(warnings()[0]).toContain("CONTACT_RATE_LIMIT_MAX");
  });
});

describe("getChatClientConfig", () => {
  it("exposes only the browser-safe settings", () => {
    const config = getChatClientConfig({ LLM_API_KEY: KEY, ...UPSTASH, NODE_ENV: "production" });

    expect(Object.keys(config).sort()).toEqual(
      ["historyMode", "markdownEnabled", "maxMessageLength", "maxTranscriptMessages", "mode"].sort()
    );
    expect(config.mode).toBe("live");
    expect(JSON.stringify(config)).not.toContain(KEY);
    expect(JSON.stringify(config)).not.toContain("upstash-token");
  });

  it("reports the off and demo modes", () => {
    expect(getChatClientConfig({}).mode).toBe("off");
    expect(getChatClientConfig({ CHAT_MODE: "demo" }).mode).toBe("demo");
  });

  it("never shows the live assistant for an unknown CHAT_MODE", () => {
    expect(getChatClientConfig({ CHAT_MODE: "yes", LLM_API_KEY: KEY, NODE_ENV: "development" }).mode).toBe("off");
    expect(warnings().join("\n")).toContain('"variable":"CHAT_MODE"');
  });

  it("trusts an explicit CHAT_MODE at build time, when secrets arrive only at runtime", () => {
    expect(getChatClientConfig({ CHAT_MODE: "live", NODE_ENV: "production" }).mode).toBe("live");
    expect(getChatClientConfig({ CHAT_MODE: "off", LLM_API_KEY: KEY }).mode).toBe("off");
    // The API still checks the real configuration on every request.
    expect(resolveChatAvailability({ CHAT_MODE: "live", NODE_ENV: "production" })).toMatchObject({
      enabled: false,
      reason: "missing_api_key",
    });
  });
});
