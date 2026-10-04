/**
 * Chat guardrails, checked before any reply is produced, in this order:
 *
 * 1. requests per IP per minute (RATE_LIMIT_RPM, sliding window) — every request;
 * 2. messages per IP + conversation (CHAT_CONVERSATION_QUOTA_LIMIT per window) — every
 *    request that carries a conversation id;
 * 3. a soft budget of estimated tokens per IP per minute (0 disables it) — model requests;
 * 4. model requests per IP per UTC day (CHAT_IP_DAILY_REQUEST_LIMIT, 0 disables it);
 * 5. model requests per UTC day for the whole site (CHAT_DAILY_REQUEST_LIMIT, 0 disables it).
 *
 * Demo replies and fixed replies never call the model, so they only count toward 1 and 2.
 *
 * A request that is turned away uses up nothing: every limit is read first and the
 * request is counted only when all of them pass. Each write is itself conditional, and if
 * a concurrent request takes the last slot in between, what was already counted is given
 * back.
 *
 * Fails CLOSED: if the store cannot be reached, the request is refused with
 * `guard_unavailable` rather than served without limits.
 */
import {
  getClientIpHash,
  getRateLimitStore,
  RateLimitStoreError,
  type CounterCheck,
  type CounterCheckResult,
  type RateLimitStore,
} from "@/lib/rate-limit";

import type { AiConfig, RateLimitStoreKind } from "./config";
import { ChatRouteError } from "./errors";

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const GUARD_UNAVAILABLE_RETRY_MS = 30_000;

type LimitCode =
  | "rate_limited"
  | "conversation_quota_exceeded"
  | "token_budget_exceeded"
  | "ip_daily_limit_reached"
  | "daily_limit_reached";

/** Rough token estimate for budgeting (about four characters per token). */
export function estimateTokensFromChars(charCount: number) {
  return charCount > 0 ? Math.ceil(charCount / 4) : 0;
}

export type ChatGuardParams = {
  request: Request;
  storeKind: RateLimitStoreKind;
  config: Pick<
    AiConfig,
    | "rateLimitRpm"
    | "conversationQuotaLimit"
    | "conversationQuotaWindowSeconds"
    | "softTokenBudgetPerMinute"
    | "ipDailyRequestLimit"
    | "dailyRequestLimit"
  >;
  /** Hash of the conversation id, when the client sent one. */
  conversationIdHash?: string;
  /** Whether the reply calls the model (false for demo and fixed replies). */
  modelRequest: boolean;
  /** Estimated prompt + completion tokens of a model request. */
  estimatedTokens: number;
  env?: Record<string, string | undefined>;
  /** Overrides the store picked from `storeKind`. For tests. */
  store?: RateLimitStore;
};

type CounterLimit = CounterCheck & { code: LimitCode; retryAfterMs: (ttlMs: number) => number };

function limitExceeded(code: LimitCode, retryAfterMs: number) {
  return new ChatRouteError("A chat limit was reached.", {
    code,
    retryable: true,
    retryAfterMs: Math.max(Math.ceil(retryAfterMs), 1_000),
  });
}

/** The counters this request must fit in, in the order they are reported. */
function buildCounterLimits(params: ChatGuardParams, ipHash: string, now: number): CounterLimit[] {
  const { config, conversationIdHash, modelRequest, estimatedTokens } = params;
  const limits: CounterLimit[] = [];

  if (conversationIdHash) {
    const windowMs = config.conversationQuotaWindowSeconds * 1000;
    limits.push({
      code: "conversation_quota_exceeded",
      key: `chat:conversation:${ipHash}:${conversationIdHash}`,
      limit: config.conversationQuotaLimit,
      ttlMs: windowMs,
      retryAfterMs: (ttlMs) => (ttlMs > 0 ? ttlMs : windowMs),
    });
  }

  if (!modelRequest) {
    return limits;
  }

  if (config.softTokenBudgetPerMinute > 0 && estimatedTokens > 0) {
    const minute = Math.floor(now / ONE_MINUTE_MS);
    limits.push({
      code: "token_budget_exceeded",
      key: `chat:tokens:${ipHash}:${minute}`,
      amount: estimatedTokens,
      limit: config.softTokenBudgetPerMinute,
      ttlMs: 2 * ONE_MINUTE_MS,
      retryAfterMs: () => (minute + 1) * ONE_MINUTE_MS - now,
    });
  }

  const day = new Date(now).toISOString().slice(0, 10);
  const untilMidnight = (Math.floor(now / ONE_DAY_MS) + 1) * ONE_DAY_MS - now;
  // Daily keys expire an hour after the UTC day ends, which absorbs clock differences.
  const dailyTtlMs = untilMidnight + ONE_HOUR_MS;

  if (config.ipDailyRequestLimit > 0) {
    limits.push({
      code: "ip_daily_limit_reached",
      key: `chat:ip-daily:${day}:${ipHash}`,
      limit: config.ipDailyRequestLimit,
      ttlMs: dailyTtlMs,
      retryAfterMs: () => untilMidnight,
    });
  }

  if (config.dailyRequestLimit > 0) {
    limits.push({
      code: "daily_limit_reached",
      key: `chat:daily:${day}`,
      limit: config.dailyRequestLimit,
      ttlMs: dailyTtlMs,
      global: true,
      retryAfterMs: () => untilMidnight,
    });
  }

  return limits;
}

function counterExceeded(limits: CounterLimit[], result: Extract<CounterCheckResult, { success: false }>) {
  const failed = limits[result.failedIndex];
  return limitExceeded(failed.code, failed.retryAfterMs(result.ttlMs));
}

async function runChecks(store: RateLimitStore, params: ChatGuardParams, ipHash: string) {
  const rpmKey = `chat:rpm:${ipHash}`;
  const rpm = { limit: params.config.rateLimitRpm, windowMs: ONE_MINUTE_MS };
  const counters = buildCounterLimits(params, ipHash, Date.now());

  // 1. Read every limit. A request that would be turned away writes nothing.
  const [rpmPeek, countersPeek] = await Promise.all([
    store.peekLimit(rpmKey, rpm),
    counters.length > 0 ? store.checkCounters(counters) : ({ success: true } as const),
  ]);
  if (!rpmPeek.success) {
    throw limitExceeded("rate_limited", rpmPeek.retryAfterMs);
  }
  if (!countersPeek.success) {
    throw counterExceeded(counters, countersPeek);
  }

  // 2. Count the request. Each call writes only if the request still fits.
  const perMinute = await store.limit(rpmKey, rpm);
  if (!perMinute.success) {
    throw limitExceeded("rate_limited", perMinute.retryAfterMs);
  }

  if (counters.length === 0) {
    return;
  }

  let consumed: CounterCheckResult;
  try {
    consumed = await store.consumeCounters(counters);
  } catch (error) {
    await releaseQuietly(store, rpmKey, rpm);
    throw error;
  }

  if (!consumed.success) {
    // Another request took the last slot after step 1: give the minute's slot back.
    await releaseQuietly(store, rpmKey, rpm);
    throw counterExceeded(counters, consumed);
  }
}

async function releaseQuietly(store: RateLimitStore, key: string, options: { limit: number; windowMs: number }) {
  try {
    await store.releaseLimit(key, options);
  } catch {
    // Best effort: the slot expires with the window anyway.
  }
}

/** Throws ChatRouteError when a limit is reached or the store is unavailable. */
export async function enforceChatGuardrails(params: ChatGuardParams): Promise<void> {
  const ipHash = getClientIpHash(params.request, params.env);

  try {
    await runChecks(params.store ?? getRateLimitStore(params.storeKind, params.env), params, ipHash);
  } catch (error) {
    if (error instanceof ChatRouteError) {
      throw error;
    }

    throw new ChatRouteError("The rate-limit store is unavailable.", {
      code: "guard_unavailable",
      retryable: true,
      retryAfterMs: GUARD_UNAVAILABLE_RETRY_MS,
      logClassification: error instanceof RateLimitStoreError ? "store_error" : "guard_error",
    });
  }
}
