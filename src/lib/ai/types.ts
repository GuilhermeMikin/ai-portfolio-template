/**
 * Chat constants and types shared by the API route and the chat UI.
 *
 * Client-safe: imported by "use client" components, so it must not import Node
 * modules or read environment variables.
 */
import type { Locale } from "@/shared/config/site";

/** Max characters in one visitor message (the composer enforces the same limit). */
export const CHAT_MESSAGE_MAX_LENGTH = 500;
/** Prior messages (user + assistant) the server keeps from the client transcript. */
export const CHAT_HISTORY_MAX_MESSAGES = 20;
/** Prior assistant replies are cut to this length when sent back as history. */
export const CHAT_HISTORY_ASSISTANT_MAX_LENGTH = 600;
export const CHAT_CONVERSATION_ID_MAX_LENGTH = 64;
/**
 * Budget for the portfolio content in the system prompt. Sections that do not fit are
 * left out, so `pnpm content:check` fails when the content outgrows this budget.
 */
export const CHAT_CONTEXT_MAX_CHARS = 24_000;
/** Max size of a POST /api/chat body. */
export const MAX_CHAT_REQUEST_BYTES = 32_768;

/**
 * - `portfolio`: a question about the owner, answered from the site content.
 * - `small_talk`: greetings, thanks, jokes, live-information questions (weather, news…).
 * - `action_request`: the visitor asks the assistant to do something (browse, send,
 *   schedule…). Answered with a fixed reply, without calling the model.
 */
export type ChatIntent = "portfolio" | "small_talk" | "action_request";

export type ChatErrorCode =
  // 400
  | "invalid_json"
  | "validation_error"
  | "unsupported_locale"
  | "unsafe_input"
  | "transcript_cap_reached"
  // 413 / 415
  | "payload_too_large"
  | "unsupported_media_type"
  // 429
  | "rate_limited"
  | "conversation_quota_exceeded"
  | "token_budget_exceeded"
  /** This visitor's IP used up CHAT_IP_DAILY_REQUEST_LIMIT for the UTC day. */
  | "ip_daily_limit_reached"
  /** The whole site used up CHAT_DAILY_REQUEST_LIMIT for the UTC day. */
  | "daily_limit_reached"
  // 503
  | "chat_disabled"
  | "guard_unavailable"
  // 500
  | "internal_error"
  // Sent as stream events after the response started.
  | "upstream_error"
  | "timeout_error";

export type ChatHistoryRole = "user" | "assistant";

export type ChatHistoryEntry = {
  role: ChatHistoryRole;
  content: string;
};

/** POST /api/chat request body. */
export type ChatRequestPayload = {
  locale: Locale;
  message: string;
  conversationId?: string;
  /** Prior completed turns, alternating user/assistant. */
  messages?: ChatHistoryEntry[];
};

/** A "related page" shown under an answer. */
export type ChatSourceItem = {
  section: string;
  label: string;
  href: string;
  locale: Locale;
};

/** Body of every request-level (non-stream) error response. */
export type ChatErrorResponse = {
  error: {
    code: ChatErrorCode;
    /** Localized and safe to show. */
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
};

export type ChatStartEvent = {
  type: "start";
  requestId: string;
  messageId: string;
  locale: Locale;
};

export type ChatChunkEvent = {
  type: "chunk";
  delta: string;
};

export type ChatSourcesEvent = {
  type: "sources";
  items: ChatSourceItem[];
};

export type ChatErrorEvent = {
  type: "error";
  code: ChatErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
};

export type ChatDoneEvent = {
  type: "done";
  /** "stop", "length", "static", "demo", "error", or another provider reason. */
  finishReason: string;
};

/** One `data: <json>` frame of the POST /api/chat event stream. */
export type ChatStreamEvent =
  | ChatStartEvent
  | ChatChunkEvent
  | ChatSourcesEvent
  | ChatErrorEvent
  | ChatDoneEvent;
