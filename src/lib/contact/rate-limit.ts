import { resolveRateLimitStore } from "@/lib/ai/config";
import { getClientIpHash, getRateLimitStore } from "@/lib/rate-limit";

import { getContactConfig } from "./config";

type Env = Record<string, string | undefined>;

export type ContactRateLimitResult = {
  allowed: boolean;
  retryAfterMs?: number;
};

/**
 * Per-IP limit for the contact form (CONTACT_RATE_LIMIT_MAX per
 * CONTACT_RATE_LIMIT_WINDOW_SECONDS) on the shared store.
 *
 * Fails OPEN, the opposite of the chat: a genuine message should never be lost to a
 * store outage (the honeypot still applies). Without Upstash it falls back to the
 * per-process memory store, which is better than no limit at all.
 */
export async function checkContactRateLimit(
  request: Request,
  env: Env = process.env
): Promise<ContactRateLimitResult> {
  const config = getContactConfig(env);

  try {
    const store = getRateLimitStore(resolveRateLimitStore(env) ?? "memory", env);
    const result = await store.limit(`contact:ip:${getClientIpHash(request)}`, {
      limit: config.rateLimitMax,
      windowMs: config.rateLimitWindowSeconds * 1000,
    });

    return result.success ? { allowed: true } : { allowed: false, retryAfterMs: result.retryAfterMs };
  } catch {
    console.warn(JSON.stringify({ scope: "contact", event: "rate_limit_unavailable", failOpen: true }));
    return { allowed: true };
  }
}
