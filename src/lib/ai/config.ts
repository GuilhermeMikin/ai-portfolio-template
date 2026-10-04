/**
 * Server-only chat configuration.
 *
 * Values are read from the environment on every call (parsing is cheap), which keeps
 * the module testable with stubbed env vars. Never import this module from a client
 * component: LLM_API_KEY must stay on the server. Client components receive only the
 * safe subset returned by `getChatClientConfig()`.
 *
 * Invalid values fall back to the default (see `src/lib/env.ts`) and are reported once
 * per process with a warning that names the variable.
 */
import {
  parseBooleanEnv,
  parseChoiceEnv,
  parseDecimalEnv,
  parseIntegerEnv,
  readEnv,
  warnInvalidEnv,
  type Env,
} from "@/lib/env";

import { CHAT_MESSAGE_MAX_LENGTH } from "./types";

export type ChatMode = "live" | "demo" | "off";
export type ChatHistoryMode = "client" | "off";
export type RateLimitStoreKind = "upstash" | "memory";
/** Request-body key for the completion limit: newer OpenAI models want `max_completion_tokens`. */
export type MaxTokensParam = "max_tokens" | "max_completion_tokens";

export type ChatDisabledReason =
  /** CHAT_MODE=off. */
  | "disabled_by_config"
  /** CHAT_MODE has a value other than live, demo or off. */
  | "invalid_chat_mode"
  /** Live mode requested (or implied) without LLM_API_KEY. */
  | "missing_api_key"
  /** Production live mode without Upstash and without the explicit in-memory opt-in. */
  | "missing_rate_limit_store";

export type ChatAvailability =
  | { enabled: true; mode: "live" | "demo"; store: RateLimitStoreKind }
  | { enabled: false; mode: "off"; reason: ChatDisabledReason };

/**
 * `maxDuration` of POST /api/chat, in seconds. Next.js reads that export statically, so
 * the route repeats the literal; a test checks that both values match.
 */
export const CHAT_ROUTE_MAX_DURATION_SECONDS = 30;
/**
 * Upper bound for CHAT_REQUEST_TIMEOUT_MS: three seconds below the route's `maxDuration`,
 * so a slow provider is still reported to the visitor as a timeout instead of the
 * platform killing the function mid-stream.
 */
export const MAX_REQUEST_TIMEOUT_MS = CHAT_ROUTE_MAX_DURATION_SECONDS * 1000 - 3_000;

const DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_CHAT_TEMPERATURE = 0.3;
const DEFAULT_CHAT_MAX_TOKENS = 700;
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
const DEFAULT_CHAT_MAX_TRANSCRIPT_MESSAGES = 20;
const DEFAULT_RATE_LIMIT_RPM = 10;
const DEFAULT_CHAT_CONVERSATION_QUOTA_LIMIT = 12;
const DEFAULT_CHAT_CONVERSATION_QUOTA_WINDOW_SECONDS = 600;
const DEFAULT_CHAT_SOFT_TOKEN_BUDGET_PER_MINUTE = 32_000;
const DEFAULT_CHAT_IP_DAILY_REQUEST_LIMIT = 50;
const DEFAULT_CHAT_DAILY_REQUEST_LIMIT = 300;

const MAX_COMPLETION_TOKENS_CEILING = 4_000;
const CHAT_MODES: readonly ChatMode[] = ["live", "demo", "off"];

function normalizeLlmBaseUrl(value: string | undefined) {
  if (!value) {
    return DEFAULT_LLM_BASE_URL;
  }

  try {
    const parsedUrl = new URL(value);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.replace(/\/+$/, "");

    // Common misconfiguration: the marketing site or the bare API host.
    if (
      hostname === "openai.com" ||
      hostname === "www.openai.com" ||
      (hostname === "api.openai.com" && pathname === "")
    ) {
      return "https://api.openai.com/v1";
    }
  } catch {
    // Fall through: an invalid URL fails loudly at request time (logged, not shown to visitors).
  }

  return value.replace(/\/+$/, "");
}

/** CHAT_TEMPERATURE: a number from 0 to 2, or `default` to leave it to the provider (`null`). */
function parseTemperature(env: Env): number | null {
  if (readEnv(env, "CHAT_TEMPERATURE")?.toLowerCase() === "default") {
    return null;
  }

  return parseDecimalEnv(env, "CHAT_TEMPERATURE", DEFAULT_CHAT_TEMPERATURE, { min: 0, max: 2 });
}

export function getAiConfig(env: Env = process.env) {
  const maxTranscriptMessages = parseIntegerEnv(
    env,
    "CHAT_MAX_TRANSCRIPT_MESSAGES",
    DEFAULT_CHAT_MAX_TRANSCRIPT_MESSAGES,
    { min: 2, max: 100 }
  );

  return {
    llmBaseUrl: normalizeLlmBaseUrl(readEnv(env, "LLM_BASE_URL")),
    llmApiKey: readEnv(env, "LLM_API_KEY") ?? "",
    chatModel: readEnv(env, "CHAT_MODEL") ?? DEFAULT_CHAT_MODEL,
    openRouterHttpReferer: readEnv(env, "OPENROUTER_HTTP_REFERER") ?? "",
    openRouterTitle: readEnv(env, "OPENROUTER_X_TITLE") ?? "",
    /** `null` leaves the temperature out of the request (some reasoning models reject it). */
    temperature: parseTemperature(env),
    maxTokens: parseIntegerEnv(env, "CHAT_MAX_TOKENS", DEFAULT_CHAT_MAX_TOKENS, {
      min: 16,
      max: MAX_COMPLETION_TOKENS_CEILING,
    }),
    maxTokensParam: parseChoiceEnv<MaxTokensParam>(
      env,
      "CHAT_MAX_TOKENS_PARAM",
      ["max_tokens", "max_completion_tokens"],
      "max_tokens"
    ),
    requestTimeoutMs: parseIntegerEnv(env, "CHAT_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, {
      min: 1_000,
      max: MAX_REQUEST_TIMEOUT_MS,
    }),
    historyMode: parseChoiceEnv<ChatHistoryMode>(env, "CHAT_HISTORY_MODE", ["client", "off"], "client"),
    markdownEnabled: parseBooleanEnv(env, "CHAT_MARKDOWN_ENABLED", true),
    // An even number keeps complete user/assistant pairs.
    maxTranscriptMessages: maxTranscriptMessages - (maxTranscriptMessages % 2),
    rateLimitRpm: parseIntegerEnv(env, "RATE_LIMIT_RPM", DEFAULT_RATE_LIMIT_RPM),
    conversationQuotaLimit: parseIntegerEnv(env, "CHAT_CONVERSATION_QUOTA_LIMIT", DEFAULT_CHAT_CONVERSATION_QUOTA_LIMIT),
    conversationQuotaWindowSeconds: parseIntegerEnv(
      env,
      "CHAT_CONVERSATION_QUOTA_WINDOW_SECONDS",
      DEFAULT_CHAT_CONVERSATION_QUOTA_WINDOW_SECONDS
    ),
    /** Estimated tokens per IP per minute, for model requests only. 0 disables it. */
    softTokenBudgetPerMinute: parseIntegerEnv(
      env,
      "CHAT_SOFT_TOKEN_BUDGET_PER_MINUTE",
      DEFAULT_CHAT_SOFT_TOKEN_BUDGET_PER_MINUTE,
      { min: 0 }
    ),
    /** Model requests per client IP per UTC day. 0 disables it. */
    ipDailyRequestLimit: parseIntegerEnv(env, "CHAT_IP_DAILY_REQUEST_LIMIT", DEFAULT_CHAT_IP_DAILY_REQUEST_LIMIT, {
      min: 0,
    }),
    /** Site-wide cap on model requests per UTC day (all visitors together). 0 disables it. */
    dailyRequestLimit: parseIntegerEnv(env, "CHAT_DAILY_REQUEST_LIMIT", DEFAULT_CHAT_DAILY_REQUEST_LIMIT, {
      min: 0,
    }),
    messageMaxLength: CHAT_MESSAGE_MAX_LENGTH,
  };
}

export type AiConfig = ReturnType<typeof getAiConfig>;

export function hasConfiguredUpstashRedis(env: Env = process.env) {
  return Boolean(readEnv(env, "UPSTASH_REDIS_REST_URL") && readEnv(env, "UPSTASH_REDIS_REST_TOKEN"));
}

/**
 * Which shared store backs the rate limits.
 *
 * - Upstash when UPSTASH_REDIS_REST_URL/TOKEN are set (shared by every instance).
 * - In-memory when CHAT_RATE_LIMIT_STORE=memory, or outside production. Memory limits
 *   are per process: on serverless or multi-instance hosting they are NOT a global limit.
 * - `null` in production when neither applies.
 */
export function resolveRateLimitStore(env: Env = process.env): RateLimitStoreKind | null {
  const requested = parseChoiceEnv<RateLimitStoreKind | "">(env, "CHAT_RATE_LIMIT_STORE", ["upstash", "memory"], "");

  if (requested === "memory") {
    return "memory";
  }

  if (hasConfiguredUpstashRedis(env)) {
    return "upstash";
  }

  if (requested !== "upstash" && readEnv(env, "NODE_ENV") !== "production") {
    return "memory";
  }

  return null;
}

/**
 * Resolves the chat mode from CHAT_MODE (`live` | `demo` | `off`).
 * Unset: `live` when LLM_API_KEY is present, otherwise `off`. Any other value: `off`.
 */
export function resolveChatAvailability(env: Env = process.env): ChatAvailability {
  const requestedMode = readEnv(env, "CHAT_MODE")?.toLowerCase();
  const hasApiKey = Boolean(readEnv(env, "LLM_API_KEY"));

  if (requestedMode === "off") {
    return { enabled: false, mode: "off", reason: "disabled_by_config" };
  }

  if (requestedMode !== undefined && !CHAT_MODES.includes(requestedMode as ChatMode)) {
    warnInvalidEnv("CHAT_MODE", "unknown_value", "off");
    return { enabled: false, mode: "off", reason: "invalid_chat_mode" };
  }

  if (requestedMode === "demo") {
    // Demo replies never call a paid API, so a per-process limiter is acceptable.
    return { enabled: true, mode: "demo", store: resolveRateLimitStore(env) ?? "memory" };
  }

  if (!hasApiKey) {
    return { enabled: false, mode: "off", reason: "missing_api_key" };
  }

  const store = resolveRateLimitStore(env);
  if (!store) {
    return { enabled: false, mode: "off", reason: "missing_rate_limit_store" };
  }

  return { enabled: true, mode: "live", store };
}

/** The only chat settings that may reach the browser. Contains no secrets. */
export type ChatClientConfig = {
  mode: ChatMode;
  historyMode: ChatHistoryMode;
  markdownEnabled: boolean;
  maxTranscriptMessages: number;
  maxMessageLength: number;
};

/**
 * Static pages evaluate this at build time. An explicit CHAT_MODE is trusted as-is, so a
 * deployment that injects LLM_API_KEY only at runtime (e.g. a Docker image built without
 * secrets) can still render the assistant by building with CHAT_MODE=live; the API then
 * checks the real configuration on every request. Without CHAT_MODE, the mode is inferred
 * from what the build can see; an unknown CHAT_MODE means off.
 */
export function getChatClientConfig(env: Env = process.env): ChatClientConfig {
  const config = getAiConfig(env);
  const requestedMode = readEnv(env, "CHAT_MODE")?.toLowerCase();
  const mode: ChatMode =
    requestedMode === "live" || requestedMode === "demo" || requestedMode === "off"
      ? requestedMode
      : resolveChatAvailability(env).mode;

  return {
    mode,
    historyMode: config.historyMode,
    markdownEnabled: config.markdownEnabled,
    maxTranscriptMessages: config.maxTranscriptMessages,
    maxMessageLength: config.messageMaxLength,
  };
}
