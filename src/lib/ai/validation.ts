import { coerceLocale, type Locale } from "@/shared/config/site";

import type { ChatHistoryMode } from "./config";
import { ChatRouteError } from "./errors";
import { normalizeChatHistory } from "./history";
import { detectPromptInjection } from "./safety";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatHistoryEntry } from "./types";

type ChatValidationOptions = {
  historyMode: ChatHistoryMode;
  maxTranscriptMessages: number;
};

export type ValidatedChatRequest = {
  locale: Locale;
  message: string;
  messages: ChatHistoryEntry[];
  conversationId?: string;
  conversationIdHash?: string;
  droppedHistoryTurns: number;
  historyTrimmed: boolean;
};

/** The `locale` field of a parsed body, if it names a supported locale. */
export function getRequestedLocale(payload: unknown): Locale | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { locale } = payload as { locale?: unknown };
  return typeof locale === "string" ? coerceLocale(locale) : null;
}

export function validateChatRequest(payload: unknown, options: ChatValidationOptions): ValidatedChatRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ChatRouteError("Request body must be a JSON object.", {
      code: "validation_error",
      logClassification: "invalid_payload_shape",
    });
  }

  const { conversationId, message, messages, locale } = payload as {
    conversationId?: unknown;
    message?: unknown;
    messages?: unknown;
    locale?: unknown;
  };

  const normalizedLocale = typeof locale === "string" ? coerceLocale(locale) : null;
  if (!normalizedLocale) {
    throw new ChatRouteError("Unsupported or missing locale.", {
      code: "unsupported_locale",
    });
  }

  if (typeof message !== "string") {
    throw new ChatRouteError("Message must be a string.", {
      code: "validation_error",
      logClassification: "missing_message",
    });
  }

  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new ChatRouteError("Message cannot be empty.", {
      code: "validation_error",
      logClassification: "empty_message",
    });
  }

  if (normalizedMessage.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new ChatRouteError("Message is too long.", {
      code: "validation_error",
      logClassification: "message_too_long",
    });
  }

  const injectionSignal = detectPromptInjection(normalizedMessage);
  if (injectionSignal) {
    throw new ChatRouteError("Message looks like a prompt-injection attempt.", {
      code: "unsafe_input",
      logClassification: `prompt_injection:${injectionSignal}`,
    });
  }

  const history = normalizeChatHistory({
    conversationId,
    historyMode: options.historyMode,
    maxTranscriptMessages: options.maxTranscriptMessages,
    messages,
  });

  return {
    locale: normalizedLocale,
    message: normalizedMessage,
    messages: history.messages,
    conversationId: history.conversationId,
    conversationIdHash: history.conversationIdHash,
    droppedHistoryTurns: history.droppedHistoryTurns,
    historyTrimmed: history.historyTrimmed,
  };
}
