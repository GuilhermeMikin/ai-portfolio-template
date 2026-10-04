/**
 * Shared rate-limit store used by the chat guardrails and the contact form.
 *
 * Two backends: Upstash Redis (shared by every server instance) and an in-memory store
 * (per process). Which one applies is decided by `resolveRateLimitStore()` in
 * `src/lib/ai/config.ts`. Store failures are thrown as RateLimitStoreError; each caller
 * decides whether to fail closed (chat) or open (contact form).
 *
 * Server-only.
 */
import { createHash } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

import type { RateLimitStoreKind } from "@/lib/ai/config";
import { readEnv, warnInvalidEnv, type Env } from "@/lib/env";

import { memoryRateLimitStore } from "./memory";
import type { RateLimitStore } from "./store";
import { getUpstashRateLimitStore, resetUpstashRateLimitStore } from "./upstash";

export * from "./store";

/** Every request whose address cannot be read shares this bucket. */
const UNKNOWN_CLIENT = "unknown";
const HEADER_NAME_PATTERN = /^[a-z0-9-]+$/;

export function getRateLimitStore(kind: RateLimitStoreKind, env: Env = process.env): RateLimitStore {
  return kind === "upstash" ? getUpstashRateLimitStore(env) : memoryRateLimitStore;
}

/** The eight 16-bit groups of a valid IPv6 address (`::` expanded, an IPv4 tail converted). */
function ipv6Groups(address: string): number[] {
  let text = address;
  const ipv4Tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (ipv4Tail) {
    const [a, b, c, d] = ipv4Tail.slice(1).map(Number);
    text = `${text.slice(0, ipv4Tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head, tail] = text.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(":") : [];
  const missing = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  return [...headGroups, ...Array<string>(missing).fill("0"), ...tailGroups].map((group) => Number.parseInt(group, 16));
}

/**
 * The rate-limit identity of an address: IPv4 as is, an IPv4-mapped IPv6 address as its
 * IPv4 form, and any other IPv6 address as its /64 network, because one subscriber
 * usually gets a whole /64 and could otherwise rotate through billions of addresses.
 * Ports and zone ids are dropped; anything that is not an IP address is `unknown`.
 */
export function normalizeClientIp(value: string | null | undefined): string {
  let address = value?.trim().toLowerCase() ?? "";
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) {
    address = bracketed[1];
  } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(address)) {
    address = address.slice(0, address.lastIndexOf(":"));
  }
  address = address.replace(/%.*$/, "");

  if (isIPv4(address)) {
    return address;
  }

  if (!isIPv6(address)) {
    return UNKNOWN_CLIENT;
  }

  const groups = ipv6Groups(address);
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }

  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

/** RATE_LIMIT_IP_HEADER, lowercased, when it is a plausible header name. */
function getTrustedIpHeader(env: Env) {
  const name = readEnv(env, "RATE_LIMIT_IP_HEADER")?.toLowerCase();
  if (name && !HEADER_NAME_PATTERN.test(name)) {
    warnInvalidEnv("RATE_LIMIT_IP_HEADER", "not_a_header_name", "x-forwarded-for");
    return undefined;
  }
  return name;
}

/**
 * The visitor's address as the rate limits see it (see `normalizeClientIp`).
 *
 * With RATE_LIMIT_IP_HEADER set, only that header is read (e.g. `cf-connecting-ip` behind
 * Cloudflare, `fly-client-ip` on Fly.io): your proxy sets it and visitors cannot. Without
 * it, the leftmost `x-forwarded-for` entry is used, then `x-real-ip`. Vercel overwrites
 * X-Forwarded-For with the real client address, but proxies that append to it (nginx,
 * most load balancers) leave the leftmost entry under the visitor's control. There, or
 * on a server exposed directly to the internet, a client can send a different address
 * on every request and dodge the per-IP limits (requests per minute, token budget and
 * per-IP daily ceiling). The site-wide daily cap still bounds the total number of model
 * requests: it does not depend on the address and is never evicted from the memory store.
 */
export function getClientIp(request: Request, env: Env = process.env): string {
  const trustedHeader = getTrustedIpHeader(env);
  if (trustedHeader) {
    return normalizeClientIp(request.headers.get(trustedHeader)?.split(",")[0]);
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0];
  return normalizeClientIp(forwardedFor?.trim() ? forwardedFor : request.headers.get("x-real-ip"));
}

/** `getClientIp()` hashed with sha256, so raw addresses never reach the store or logs. */
export function getClientIpHash(request: Request, env: Env = process.env): string {
  return createHash("sha256").update(getClientIp(request, env)).digest("hex").slice(0, 32);
}

/** Clears the in-memory store and the cached Upstash clients. For tests. */
export function resetRateLimitStores() {
  memoryRateLimitStore.clear();
  resetUpstashRateLimitStore();
}
