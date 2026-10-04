import type { ChatMessages } from "@/content";

import { formatChatErrorCopy } from "./error-copy";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatErrorCode, type ChatErrorResponse } from "./types";

/**
 * Machine-readable fields from a provider's error body (`error.code`, `error.param`),
 * kept for the logs. Never the provider's message: it can echo request details.
 */
export type ProviderErrorFields = {
  code?: string;
  param?: string;
};

type ChatRouteErrorOptions = {
  code: ChatErrorCode;
  retryable?: boolean;
  retryAfterMs?: number;
  /** Short machine-readable reason for the logs. Never include visitor text. */
  logClassification?: string;
  providerError?: ProviderErrorFields;
};

/**
 * An expected chat failure. The `message` is for developers only; visitors get the
 * localized text from `getChatErrorMessage()`.
 */
export class ChatRouteError extends Error {
  readonly code: ChatErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly logClassification: string;
  readonly providerError?: ProviderErrorFields;

  constructor(message: string, options: ChatRouteErrorOptions) {
    super(message);
    this.name = "ChatRouteError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.logClassification = options.logClassification ?? options.code;
    this.providerError = options.providerError;
  }
}

/** HTTP status of each request-level error (see the API contract). */
export function getChatErrorStatus(code: ChatErrorCode): number {
  switch (code) {
    case "invalid_json":
    case "validation_error":
    case "unsupported_locale":
    case "unsafe_input":
    case "transcript_cap_reached":
      return 400;
    case "payload_too_large":
      return 413;
    case "unsupported_media_type":
      return 415;
    case "rate_limited":
    case "conversation_quota_exceeded":
    case "token_budget_exceeded":
    case "ip_daily_limit_reached":
    case "daily_limit_reached":
      return 429;
    case "chat_disabled":
    case "guard_unavailable":
      return 503;
    case "upstream_error":
      return 502;
    case "timeout_error":
      return 504;
    case "internal_error":
      return 500;
  }
}

/** Localized, visitor-safe text for an error code (the same copy the chat widget shows). */
export function getChatErrorMessage(code: ChatErrorCode, errors: ChatMessages["errors"]): string {
  return formatChatErrorCopy(code, errors, CHAT_MESSAGE_MAX_LENGTH) ?? errors.generic;
}

export function toChatRouteError(error: unknown): ChatRouteError {
  if (error instanceof ChatRouteError) {
    return error;
  }

  return new ChatRouteError("Unexpected chat error.", {
    code: "internal_error",
    retryable: true,
    logClassification: "unhandled_error",
  });
}

export function buildChatErrorBody(
  error: Pick<ChatRouteError, "code" | "retryable" | "retryAfterMs">,
  errors: ChatMessages["errors"]
): ChatErrorResponse {
  return {
    error: {
      code: error.code,
      message: getChatErrorMessage(error.code, errors),
      retryable: error.retryable,
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
    },
  };
}
