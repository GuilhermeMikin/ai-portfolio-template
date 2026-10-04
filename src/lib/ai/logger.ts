/**
 * Structured chat logs: one JSON line per request.
 *
 * Only metadata goes here: ids, codes, durations, token usage, lengths and counts.
 * Never log message text, conversations, raw IPs, API keys or provider responses.
 */
import type { ChatDisabledReason, ChatMode } from "./config";
import type { ProviderErrorFields } from "./errors";
import type { ChatUsage } from "./llm";
import type { ChatIntent } from "./types";

export type ChatLogEntry = {
  requestId: string;
  locale: string;
  status: "success" | "error" | "rejected" | "aborted";
  httpStatus?: number;
  mode?: ChatMode;
  intent?: ChatIntent;
  replyLocale?: string;
  model?: string;
  errorCode?: string;
  logClassification?: string;
  /** Machine-readable fields of a provider 4xx error body (never its message). */
  providerError?: ProviderErrorFields;
  finishReason?: string;
  queryLength?: number;
  outputLength?: number;
  historyMessageCount?: number;
  droppedHistoryTurns?: number;
  historyTrimmed?: boolean;
  hasConversationId?: boolean;
  contextLength?: number;
  omittedSectionCount?: number;
  sourceCount?: number;
  estimatedTokens?: number;
  tokens?: ChatUsage;
  durationsMs: {
    firstToken?: number;
    total: number;
  };
};

function write(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  method(JSON.stringify({ scope: "chat", timestamp: new Date().toISOString(), ...payload }));
}

export const chatLogger = {
  info: (entry: ChatLogEntry) => write("info", entry),
  warn: (entry: ChatLogEntry) => write("warn", entry),
  error: (entry: ChatLogEntry) => write("error", entry),
};

const loggedDisabledReasons = new Set<ChatDisabledReason>();

/** Logs why the chat is off, once per process and reason (no request details). */
export function logChatDisabledOnce(reason: ChatDisabledReason) {
  if (loggedDisabledReasons.has(reason)) {
    return;
  }

  loggedDisabledReasons.add(reason);
  write("warn", { event: "chat_disabled", reason });
}
