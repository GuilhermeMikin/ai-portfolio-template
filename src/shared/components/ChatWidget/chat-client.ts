/**
 * Browser-side protocol helpers for the chat widget: reading `POST /api/chat` responses
 * (SSE frames and JSON errors), building the transcript the server accepts and turning
 * error codes into visitor-facing copy. No React and no DOM, so they are unit-tested.
 */
import type { ChatMessages } from "@/content";
import { formatChatErrorCopy } from "@/lib/ai/error-copy";
import type { ChatHistoryEntry, ChatSourceItem } from "@/lib/ai/types";

export type ChatUserMessage = {
  id: string;
  role: "user";
  text: string;
};

export type ChatAssistantMessage = {
  id: string;
  role: "assistant";
  text: string;
  status: "streaming" | "done" | "error";
  /** The question this reply answers; Retry sends it again. */
  question: string;
  sources?: ChatSourceItem[];
  error?: {
    message: string;
    retryable: boolean;
    /** Epoch ms before which Retry stays disabled (from `retryAfterMs`). */
    retryAt?: number;
  };
};

export type ChatMessage = ChatUserMessage | ChatAssistantMessage;

/** A failed request or stream, before it is turned into copy. */
export type ChatFailure = {
  /** A `ChatErrorCode` from the server, or `network_error` for a failed connection. */
  code: string;
  /** Localized message from the server, used for codes this client does not know. */
  message?: string;
  retryable: boolean;
  retryAfterMs?: number;
};

/** The validated frames the widget acts on (`start` frames carry nothing it needs). */
export type ChatStreamFrame =
  | { type: "chunk"; delta: string }
  | { type: "sources"; items: ChatSourceItem[] }
  | ({ type: "error" } & ChatFailure)
  | { type: "done" };

export const NETWORK_ERROR_CODE = "network_error";

/** Longer waits (e.g. a daily limit) get no Retry button: a countdown would be useless. */
export const MAX_RETRY_COUNTDOWN_MS = 120_000;

const MAX_SERVER_MESSAGE_LENGTH = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRetryAfterMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

/** `Retry-After` in delta-seconds (the form the API sends) → milliseconds. */
export function parseRetryAfterHeader(value: string | null | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return toRetryAfterMs(Number(value.trim()) * 1000);
}

function isSourceItem(value: unknown): value is ChatSourceItem {
  return (
    isRecord(value) &&
    typeof value.section === "string" &&
    typeof value.label === "string" &&
    typeof value.href === "string"
  );
}

/** Validates one decoded `data:` payload. Unknown or malformed frames are ignored. */
export function toChatStreamFrame(value: unknown): ChatStreamFrame | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value.type) {
    case "chunk":
      return typeof value.delta === "string" ? { type: "chunk", delta: value.delta } : null;
    case "sources":
      return Array.isArray(value.items) ? { type: "sources", items: value.items.filter(isSourceItem) } : null;
    case "error":
      return typeof value.code === "string" && value.code
        ? {
            type: "error",
            code: value.code,
            message: typeof value.message === "string" ? value.message : undefined,
            retryable: value.retryable === true,
            retryAfterMs: toRetryAfterMs(value.retryAfterMs),
          }
        : null;
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

function parseSseEvent(rawEvent: string): ChatStreamFrame | null {
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) {
    return null;
  }

  try {
    return toChatStreamFrame(JSON.parse(data));
  } catch {
    return null;
  }
}

/**
 * Splits the complete events (`data: <json>` + blank line) off an SSE text buffer.
 * Returns their frames and the incomplete remainder to prepend to the next chunk.
 */
export function parseSseBuffer(buffer: string): { frames: ChatStreamFrame[]; rest: string } {
  const rawEvents = buffer.split(/\r?\n\r?\n/);
  const rest = rawEvents.pop() ?? "";
  const frames = rawEvents
    .map(parseSseEvent)
    .filter((frame): frame is ChatStreamFrame => frame !== null);

  return { frames, rest };
}

/** Reads an SSE body to the end, calling `onFrame` for every valid frame in order. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: ChatStreamFrame) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const { frames, rest } = parseSseBuffer(buffer);
    buffer = rest;
    frames.forEach(onFrame);

    if (done) {
      break;
    }
  }

  // A final event without the trailing blank line.
  const last = parseSseEvent(buffer);
  if (last) {
    onFrame(last);
  }
}

function codeForStatus(status: number) {
  switch (status) {
    case 408:
    case 504:
      return "timeout_error";
    case 413:
      return "payload_too_large";
    case 415:
      return "unsupported_media_type";
    case 429:
      return "rate_limited";
    case 503:
      return "chat_disabled";
    default:
      return "internal_error";
  }
}

/**
 * The failure behind a non-200 response. Reads the API's JSON error body when present;
 * anything else (an HTML page from a proxy, an empty body) falls back to the status.
 */
export function toChatFailure(status: number, body: unknown, retryAfterHeader?: string | null): ChatFailure {
  const headerRetryAfterMs = parseRetryAfterHeader(retryAfterHeader);
  const retryableStatus = status === 408 || status === 429 || status >= 500;
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;

  if (error && typeof error.code === "string" && error.code) {
    return {
      code: error.code,
      message: typeof error.message === "string" ? error.message : undefined,
      retryable: typeof error.retryable === "boolean" ? error.retryable : retryableStatus,
      retryAfterMs: toRetryAfterMs(error.retryAfterMs) ?? headerRetryAfterMs,
    };
  }

  return { code: codeForStatus(status), retryable: retryableStatus, retryAfterMs: headerRetryAfterMs };
}

/**
 * Visitor-facing text for a failure: the copy for known codes (the same map the server
 * uses, see `src/lib/ai/error-copy.ts`), else the server's message.
 */
export function getChatErrorMessage(
  failure: Pick<ChatFailure, "code" | "message">,
  errors: ChatMessages["errors"],
  maxMessageLength: number
): string {
  if (failure.code === NETWORK_ERROR_CODE) {
    return errors.network;
  }

  const copy = formatChatErrorCopy(failure.code, errors, maxMessageLength);
  if (copy) {
    return copy;
  }

  const serverMessage = failure.message?.trim();
  return serverMessage ? serverMessage.slice(0, MAX_SERVER_MESSAGE_LENGTH) : errors.generic;
}

/** How a failure is shown: its text, whether Retry is offered, and whether the cap was hit. */
export function describeChatFailure(
  failure: ChatFailure,
  errors: ChatMessages["errors"],
  maxMessageLength: number
): { message: string; retryable: boolean; retryAfterMs?: number; transcriptCapReached: boolean } {
  const transcriptCapReached = failure.code === "transcript_cap_reached";
  const retryAfterMs = failure.retryAfterMs;
  const retryable =
    failure.retryable &&
    !transcriptCapReached &&
    (retryAfterMs === undefined || retryAfterMs <= MAX_RETRY_COUNTDOWN_MS);

  return {
    message: getChatErrorMessage(failure, errors, maxMessageLength),
    retryable,
    retryAfterMs: retryable ? retryAfterMs : undefined,
    transcriptCapReached,
  };
}

/** Completed user/assistant pairs, oldest first; failed or unfinished turns are skipped. */
function completedTurns(messages: readonly ChatMessage[]) {
  const turns: [ChatUserMessage, ChatAssistantMessage][] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const user = messages[index];
    const assistant = messages[index + 1];
    if (user.role !== "user" || assistant?.role !== "assistant") {
      continue;
    }

    index += 1;
    if (assistant.status === "done" && user.text.trim() && assistant.text.trim()) {
      turns.push([user, assistant]);
    }
  }

  return turns;
}

/** Messages that count toward the transcript cap (completed turns × 2). */
export function countCompletedMessages(messages: readonly ChatMessage[]): number {
  return completedTurns(messages).length * 2;
}

/**
 * The `messages` field of a chat request: completed turns only, each side cut to the
 * server's limits, keeping the most recent `maxMessages` (an even number: whole turns).
 */
export function buildChatHistory(
  messages: readonly ChatMessage[],
  limits: { maxMessages: number; maxUserLength: number; maxAssistantLength: number }
): ChatHistoryEntry[] {
  const maxMessages = Math.max(0, limits.maxMessages - (limits.maxMessages % 2));
  if (maxMessages === 0) {
    return [];
  }

  const entries = completedTurns(messages).flatMap(([user, assistant]): ChatHistoryEntry[] => [
    { role: "user", content: user.text.trim().slice(0, limits.maxUserLength) },
    { role: "assistant", content: assistant.text.trim().slice(0, limits.maxAssistantLength) },
  ]);

  return entries.slice(-maxMessages);
}

/** Random id for messages and conversations; matches the server's `[A-Za-z0-9:_-]{8,64}`. */
export function createChatId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

  return `${prefix}_${random}`;
}
