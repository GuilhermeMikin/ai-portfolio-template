/**
 * Which `chat.errors` message describes each error code. The API route (server) and the
 * chat widget (browser) both use this map, so a code always reads the same.
 *
 * Client-safe: no Node modules, no environment variables, type-only content imports.
 */
import type { ChatMessages } from "@/content";
import { formatMessage } from "@/content/format";

import type { ChatErrorCode } from "./types";

export type ChatErrorCopyKey = keyof ChatMessages["errors"];

export const CHAT_ERROR_COPY_KEYS: Readonly<Record<ChatErrorCode, ChatErrorCopyKey>> = {
  validation_error: "validation",
  payload_too_large: "validation",
  // Malformed requests come from a broken or outdated client, not from what the visitor typed.
  invalid_json: "generic",
  unsupported_media_type: "generic",
  unsupported_locale: "generic",
  unsafe_input: "unsafe",
  transcript_cap_reached: "transcriptCap",
  rate_limited: "rateLimited",
  token_budget_exceeded: "rateLimited",
  conversation_quota_exceeded: "conversationQuota",
  // From the visitor's side, both daily limits mean "come back tomorrow".
  ip_daily_limit_reached: "dailyLimit",
  daily_limit_reached: "dailyLimit",
  chat_disabled: "unavailable",
  guard_unavailable: "unavailable",
  timeout_error: "timeout",
  upstream_error: "generic",
  internal_error: "generic",
};

/** The copy key of a known code; undefined for anything else (including `__proto__`). */
export function getChatErrorCopyKey(code: string): ChatErrorCopyKey | undefined {
  return Object.prototype.hasOwnProperty.call(CHAT_ERROR_COPY_KEYS, code)
    ? CHAT_ERROR_COPY_KEYS[code as ChatErrorCode]
    : undefined;
}

/** The localized message for a known code (`{max}` filled in), or undefined. */
export function formatChatErrorCopy(
  code: string,
  errors: ChatMessages["errors"],
  maxMessageLength: number
): string | undefined {
  const key = getChatErrorCopyKey(code);
  return key ? formatMessage(errors[key], { max: maxMessageLength }) : undefined;
}
