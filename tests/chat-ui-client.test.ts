import { describe, expect, it, vi } from "vitest";

import { formatMessage, getMessages } from "@/content";
import { CHAT_ERROR_COPY_KEYS } from "@/lib/ai/error-copy";
import { getChatErrorMessage as getServerErrorMessage } from "@/lib/ai/errors";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatErrorCode } from "@/lib/ai/types";
import { DEFAULT_LOCALE } from "@/shared/config/site";
import {
  MAX_RETRY_COUNTDOWN_MS,
  NETWORK_ERROR_CODE,
  buildChatHistory,
  countCompletedMessages,
  createChatId,
  describeChatFailure,
  getChatErrorMessage,
  parseRetryAfterHeader,
  parseSseBuffer,
  readChatStream,
  toChatFailure,
  toChatStreamFrame,
  type ChatMessage,
  type ChatStreamFrame,
} from "@/shared/components/ChatWidget/chat-client";

const errors = getMessages(DEFAULT_LOCALE).chat.errors;
const MAX_LENGTH = CHAT_MESSAGE_MAX_LENGTH;

const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

function streamOf(...parts: (string | Uint8Array)[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(typeof part === "string" ? encoder.encode(part) : part);
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const frames: ChatStreamFrame[] = [];
  await readChatStream(stream, (item) => frames.push(item));
  return frames;
}

describe("parseSseBuffer", () => {
  it("returns complete frames and keeps the incomplete rest", () => {
    const buffer = `${frame({ type: "chunk", delta: "Hi" })}${frame({ type: "done", finishReason: "stop" })}data: {"type":"chu`;
    expect(parseSseBuffer(buffer)).toEqual({
      frames: [{ type: "chunk", delta: "Hi" }, { type: "done" }],
      rest: 'data: {"type":"chu',
    });
  });

  it("accepts CRLF line endings, comments, other fields and multi-line data", () => {
    const buffer = [
      ": keep-alive",
      "",
      "event: message",
      'data: {"type":"chunk",',
      'data: "delta":"x"}',
      "id: 1",
      "",
      "",
    ].join("\r\n");
    expect(parseSseBuffer(buffer).frames).toEqual([{ type: "chunk", delta: "x" }]);
  });

  it("skips invalid JSON, start frames and unknown frame types", () => {
    const buffer = `data: {nope}\n\n${frame({ type: "start", requestId: "r", messageId: "m", locale: "en" })}${frame({ type: "other" })}`;
    expect(parseSseBuffer(buffer)).toEqual({ frames: [], rest: "" });
  });
});

describe("toChatStreamFrame", () => {
  it("validates chunk, sources, error and done frames", () => {
    expect(toChatStreamFrame({ type: "chunk", delta: 1 })).toBeNull();
    expect(toChatStreamFrame(null)).toBeNull();
    expect(
      toChatStreamFrame({
        type: "sources",
        items: [{ section: "about", label: "About", href: "/en/about", locale: "en" }, { label: 3 }, "x"],
      })
    ).toEqual({ type: "sources", items: [{ section: "about", label: "About", href: "/en/about", locale: "en" }] });
    expect(toChatStreamFrame({ type: "error", code: "timeout_error", message: "Too slow", retryable: true, retryAfterMs: 2000 })).toEqual({
      type: "error",
      code: "timeout_error",
      message: "Too slow",
      retryable: true,
      retryAfterMs: 2000,
    });
    expect(toChatStreamFrame({ type: "error", code: "upstream_error", retryAfterMs: -5 })).toEqual({
      type: "error",
      code: "upstream_error",
      message: undefined,
      retryable: false,
      retryAfterMs: undefined,
    });
    expect(toChatStreamFrame({ type: "error", message: "no code" })).toBeNull();
    expect(toChatStreamFrame({ type: "done", finishReason: "stop" })).toEqual({ type: "done" });
  });
});

describe("readChatStream", () => {
  it("reassembles frames and multi-byte characters split across network chunks", async () => {
    const encoded = new TextEncoder().encode(
      `${frame({ type: "chunk", delta: "Olá 👋" })}${frame({ type: "done", finishReason: "stop" })}`
    );
    const emojiStart = encoded.indexOf(0xf0);
    const frames = await collect(
      streamOf(encoded.slice(0, 10), encoded.slice(10, emojiStart + 2), encoded.slice(emojiStart + 2))
    );
    expect(frames).toEqual([{ type: "chunk", delta: "Olá 👋" }, { type: "done" }]);
  });

  it("delivers a final frame that has no trailing blank line", async () => {
    const frames = await collect(streamOf(frame({ type: "chunk", delta: "a" }), 'data: {"type":"done","finishReason":"stop"}'));
    expect(frames).toEqual([{ type: "chunk", delta: "a" }, { type: "done" }]);
  });

  it("keeps the order of chunk, sources, error and done frames", async () => {
    const frames = await collect(
      streamOf(
        frame({ type: "start", requestId: "r", messageId: "m", locale: "en" }),
        frame({ type: "chunk", delta: "Partial" }),
        frame({ type: "error", code: "timeout_error", message: "Slow", retryable: true }),
        frame({ type: "done", finishReason: "error" })
      )
    );
    expect(frames.map((item) => item.type)).toEqual(["chunk", "error", "done"]);
  });
});

describe("toChatFailure", () => {
  it("reads the API's JSON error body", () => {
    const body = { error: { code: "rate_limited", message: "Slow down", retryable: true, retryAfterMs: 30_000 } };
    expect(toChatFailure(429, body, "60")).toEqual({
      code: "rate_limited",
      message: "Slow down",
      retryable: true,
      retryAfterMs: 30_000,
    });
  });

  it("falls back to the Retry-After header (seconds)", () => {
    const body = { error: { code: "conversation_quota_exceeded", message: "Wait", retryable: true } };
    expect(toChatFailure(429, body, "12").retryAfterMs).toBe(12_000);
  });

  it("keeps the server's retryable flag", () => {
    const body = { error: { code: "transcript_cap_reached", message: "Cap", retryable: false } };
    expect(toChatFailure(400, body, null)).toMatchObject({ code: "transcript_cap_reached", retryable: false });
  });

  it("derives a code from the status when the body is not the API's JSON", () => {
    expect(toChatFailure(502, null)).toEqual({ code: "internal_error", retryable: true, retryAfterMs: undefined });
    expect(toChatFailure(503, "<html>")).toMatchObject({ code: "chat_disabled", retryable: true });
    expect(toChatFailure(504, null)).toMatchObject({ code: "timeout_error", retryable: true });
    expect(toChatFailure(413, null)).toMatchObject({ code: "payload_too_large", retryable: false });
    expect(toChatFailure(429, { error: { message: "no code" } }, "5")).toEqual({
      code: "rate_limited",
      retryable: true,
      retryAfterMs: 5_000,
    });
    expect(toChatFailure(404, null)).toMatchObject({ code: "internal_error", retryable: false });
  });
});

describe("parseRetryAfterHeader", () => {
  it("converts delta-seconds to milliseconds and ignores anything else", () => {
    expect(parseRetryAfterHeader("30")).toBe(30_000);
    expect(parseRetryAfterHeader(" 5 ")).toBe(5_000);
    expect(parseRetryAfterHeader("1.5")).toBe(1_500);
    expect(parseRetryAfterHeader("0")).toBeUndefined();
    expect(parseRetryAfterHeader("-1")).toBeUndefined();
    expect(parseRetryAfterHeader("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
    expect(parseRetryAfterHeader("")).toBeUndefined();
    expect(parseRetryAfterHeader(null)).toBeUndefined();
  });
});

describe("getChatErrorMessage", () => {
  const messageFor = (code: string, message?: string) => getChatErrorMessage({ code, message }, errors, MAX_LENGTH);

  it("maps per-minute limits to the rate-limit message", () => {
    for (const code of ["rate_limited", "token_budget_exceeded"]) {
      expect(messageFor(code, "server text"), code).toBe(errors.rateLimited);
    }
  });

  it("maps the conversation quota to its own message", () => {
    expect(messageFor("conversation_quota_exceeded", "server text")).toBe(errors.conversationQuota);
  });

  it("maps both daily limits to the daily message", () => {
    expect(messageFor("daily_limit_reached", "server text")).toBe(errors.dailyLimit);
    expect(messageFor("ip_daily_limit_reached", "server text")).toBe(errors.dailyLimit);
  });

  it("maps message problems to the validation message with {max}", () => {
    for (const code of ["validation_error", "payload_too_large"]) {
      expect(messageFor(code), code).toBe(formatMessage(errors.validation, { max: MAX_LENGTH }));
    }
  });

  it("maps malformed requests to the generic message: the visitor did nothing wrong", () => {
    for (const code of ["invalid_json", "unsupported_media_type", "unsupported_locale"]) {
      expect(messageFor(code, "server text"), code).toBe(errors.generic);
    }
  });

  it("shows the same copy as the server for every error code", () => {
    for (const code of Object.keys(CHAT_ERROR_COPY_KEYS) as ChatErrorCode[]) {
      expect(messageFor(code, "server text"), code).toBe(getServerErrorMessage(code, errors));
    }
  });

  it("maps the remaining known codes", () => {
    expect(messageFor("unsafe_input")).toBe(errors.unsafe);
    expect(messageFor("transcript_cap_reached")).toBe(errors.transcriptCap);
    expect(messageFor("chat_disabled")).toBe(errors.unavailable);
    expect(messageFor("guard_unavailable")).toBe(errors.unavailable);
    expect(messageFor("timeout_error")).toBe(errors.timeout);
    expect(messageFor(NETWORK_ERROR_CODE)).toBe(errors.network);
    expect(messageFor("upstream_error", "server text")).toBe(errors.generic);
    expect(messageFor("internal_error")).toBe(errors.generic);
  });

  it("falls back to the server message for unknown codes, then to the generic message", () => {
    expect(messageFor("brand_new_code", "  A localized server message.  ")).toBe("A localized server message.");
    expect(messageFor("brand_new_code", "x".repeat(1000))).toHaveLength(300);
    expect(messageFor("brand_new_code")).toBe(errors.generic);
    expect(messageFor("brand_new_code", "   ")).toBe(errors.generic);
  });

  it("is not fooled by object prototype keys", () => {
    for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(messageFor(code), code).toBe(errors.generic);
    }
  });
});

describe("describeChatFailure", () => {
  it("flags the transcript cap and never offers Retry for it", () => {
    expect(describeChatFailure({ code: "transcript_cap_reached", retryable: true }, errors, MAX_LENGTH)).toEqual({
      message: errors.transcriptCap,
      retryable: false,
      retryAfterMs: undefined,
      transcriptCapReached: true,
    });
  });

  it("keeps short waits for the countdown and drops Retry for long ones", () => {
    expect(describeChatFailure({ code: "rate_limited", retryable: true, retryAfterMs: 15_000 }, errors, MAX_LENGTH)).toMatchObject({
      retryable: true,
      retryAfterMs: 15_000,
    });
    expect(
      describeChatFailure({ code: "daily_limit_reached", retryable: true, retryAfterMs: MAX_RETRY_COUNTDOWN_MS + 1 }, errors, MAX_LENGTH)
    ).toMatchObject({ retryable: false, retryAfterMs: undefined });
    expect(describeChatFailure({ code: NETWORK_ERROR_CODE, retryable: true }, errors, MAX_LENGTH)).toEqual({
      message: errors.network,
      retryable: true,
      retryAfterMs: undefined,
      transcriptCapReached: false,
    });
  });

  it("offers no Retry when the server says the request cannot succeed", () => {
    expect(describeChatFailure({ code: "unsafe_input", retryable: false, retryAfterMs: 1000 }, errors, MAX_LENGTH)).toMatchObject({
      retryable: false,
      retryAfterMs: undefined,
    });
  });
});

describe("transcript", () => {
  const user = (id: string, text: string): ChatMessage => ({ id, role: "user", text });
  const reply = (id: string, text: string, status: "streaming" | "done" | "error" = "done"): ChatMessage => ({
    id,
    role: "assistant",
    text,
    status,
    question: "q",
  });

  it("includes only completed turns with text on both sides", () => {
    const messages = [
      user("u1", " What does Robin do? "),
      reply("a1", " Product engineering. "),
      user("u2", "Failed question"),
      reply("a2", "Partial answer", "error"),
      user("u3", "Still streaming"),
      reply("a3", "Part", "streaming"),
      user("u4", "Empty answer"),
      reply("a4", "   "),
    ];
    const limits = { maxMessages: 20, maxUserLength: 500, maxAssistantLength: 600 };

    expect(buildChatHistory(messages, limits)).toEqual([
      { role: "user", content: "What does Robin do?" },
      { role: "assistant", content: "Product engineering." },
    ]);
    expect(countCompletedMessages(messages)).toBe(2);
  });

  it("cuts each side to the server limits", () => {
    const [question, answer] = buildChatHistory([user("u1", "q".repeat(700)), reply("a1", "a".repeat(900))], {
      maxMessages: 20,
      maxUserLength: 500,
      maxAssistantLength: 600,
    });
    expect(question.content).toHaveLength(500);
    expect(answer.content).toHaveLength(600);
  });

  it("keeps the most recent whole turns", () => {
    const messages = Array.from({ length: 12 }, (_, index) => [user(`u${index}`, `Q${index}`), reply(`a${index}`, `A${index}`)]).flat();
    const limits = { maxUserLength: 500, maxAssistantLength: 600 };

    const recent = buildChatHistory(messages, { ...limits, maxMessages: 20 });
    expect(recent).toHaveLength(20);
    expect(recent[0]).toEqual({ role: "user", content: "Q2" });
    expect(countCompletedMessages(messages)).toBe(24);

    // An odd limit keeps whole turns only.
    expect(buildChatHistory(messages, { ...limits, maxMessages: 5 }).map((entry) => entry.content)).toEqual([
      "Q10",
      "A10",
      "Q11",
      "A11",
    ]);
    expect(buildChatHistory(messages, { ...limits, maxMessages: 0 })).toEqual([]);
  });
});

describe("createChatId", () => {
  // The server accepts conversation ids matching this pattern.
  const SERVER_ID_PATTERN = /^[a-zA-Z0-9:_-]{8,64}$/;

  it("creates distinct ids the server accepts", () => {
    const first = createChatId("conv");
    expect(first).toMatch(/^conv_/);
    expect(first).toMatch(SERVER_ID_PATTERN);
    expect(createChatId("conv")).not.toBe(first);
  });

  it("works without crypto.randomUUID (plain-http origins)", () => {
    vi.stubGlobal("crypto", {});
    expect(createChatId("conv")).toMatch(SERVER_ID_PATTERN);
  });
});
