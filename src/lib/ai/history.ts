import { createHash } from "node:crypto";

import type { ChatHistoryMode } from "./config";
import { ChatRouteError } from "./errors";
import { detectPromptInjection } from "./safety";
import {
  CHAT_CONVERSATION_ID_MAX_LENGTH,
  CHAT_HISTORY_ASSISTANT_MAX_LENGTH,
  CHAT_HISTORY_MAX_MESSAGES,
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatHistoryEntry,
} from "./types";

const CONVERSATION_ID_PATTERN = /^[a-zA-Z0-9:_-]{8,64}$/;

export type NormalizedChatHistory = {
  conversationId?: string;
  /** Short hash of the conversation id, for rate-limit keys and logs. */
  conversationIdHash?: string;
  /** Turns removed because they looked like injection attempts. */
  droppedHistoryTurns: number;
  /** Messages kept after validation and trimming. */
  messages: ChatHistoryEntry[];
  historyTrimmed: boolean;
};

type NormalizeChatHistoryParams = {
  conversationId?: unknown;
  historyMode: ChatHistoryMode;
  maxTranscriptMessages: number;
  messages?: unknown;
};

function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function validationError(message: string, logClassification: string) {
  return new ChatRouteError(message, { code: "validation_error", logClassification });
}

function normalizeHistoryContent(value: string, maxLength: number) {
  const normalized = value
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function validateConversationId(conversationId: unknown) {
  if (conversationId === undefined || conversationId === null) {
    return undefined;
  }

  if (typeof conversationId !== "string") {
    throw validationError("Conversation id must be a string.", "conversation_id_invalid_type");
  }

  const normalized = conversationId.trim();
  if (normalized.length > CHAT_CONVERSATION_ID_MAX_LENGTH || !CONVERSATION_ID_PATTERN.test(normalized)) {
    throw validationError("Conversation id is invalid.", "conversation_id_invalid_format");
  }

  return normalized;
}

function validateHistoryEntry(value: unknown, index: number): ChatHistoryEntry {
  if (!value || typeof value !== "object") {
    throw validationError("History message must be an object.", `history_invalid_shape:${index}`);
  }

  const { role, content } = value as { role?: unknown; content?: unknown };
  if (role !== "user" && role !== "assistant") {
    throw validationError("History message role is invalid.", `history_invalid_role:${index}`);
  }

  if (typeof content !== "string") {
    throw validationError("History message content must be a string.", `history_invalid_content:${index}`);
  }

  return { role, content };
}

/**
 * Validates the client-managed transcript: complete user/assistant pairs, below the
 * transcript cap. Pairs that look like injection attempts are dropped, long messages are
 * cut, and only the most recent CHAT_HISTORY_MAX_MESSAGES are kept.
 *
 * The conversation id is validated and hashed in every history mode: the per-conversation
 * quota applies even when earlier turns are not sent.
 */
export function normalizeChatHistory({
  conversationId,
  historyMode,
  maxTranscriptMessages,
  messages,
}: NormalizeChatHistoryParams): NormalizedChatHistory {
  const normalizedConversationId = validateConversationId(conversationId);
  const base = {
    conversationId: normalizedConversationId,
    conversationIdHash: normalizedConversationId ? hashIdentifier(normalizedConversationId) : undefined,
  };

  if (historyMode === "off" || messages === undefined || messages === null) {
    return { ...base, droppedHistoryTurns: 0, messages: [], historyTrimmed: false };
  }

  if (!Array.isArray(messages)) {
    throw validationError("History must be an array.", "history_invalid_type");
  }

  if (messages.length % 2 !== 0) {
    throw validationError("History must contain complete user/assistant turns.", "history_incomplete_turn");
  }

  if (messages.length >= maxTranscriptMessages) {
    throw new ChatRouteError("The conversation reached the transcript cap.", {
      code: "transcript_cap_reached",
    });
  }

  const kept: ChatHistoryEntry[] = [];
  let droppedHistoryTurns = 0;

  for (let index = 0; index < messages.length; index += 2) {
    const userEntry = validateHistoryEntry(messages[index], index);
    const assistantEntry = validateHistoryEntry(messages[index + 1], index + 1);

    if (userEntry.role !== "user" || assistantEntry.role !== "assistant") {
      throw validationError("History must alternate user and assistant messages.", `history_invalid_sequence:${index}`);
    }

    const userContent = normalizeHistoryContent(userEntry.content, CHAT_MESSAGE_MAX_LENGTH);
    const assistantContent = normalizeHistoryContent(assistantEntry.content, CHAT_HISTORY_ASSISTANT_MAX_LENGTH);

    if (!userContent || !assistantContent) {
      throw validationError("History messages cannot be empty.", `history_empty_content:${index}`);
    }

    // The client controls the whole transcript, so both sides are untrusted.
    if (detectPromptInjection(userContent) || detectPromptInjection(assistantContent)) {
      droppedHistoryTurns += 1;
      continue;
    }

    kept.push({ role: "user", content: userContent }, { role: "assistant", content: assistantContent });
  }

  const historyTrimmed = kept.length > CHAT_HISTORY_MAX_MESSAGES;

  return {
    ...base,
    droppedHistoryTurns,
    messages: historyTrimmed ? kept.slice(-CHAT_HISTORY_MAX_MESSAGES) : kept,
    historyTrimmed,
  };
}
