/**
 * POST /api/chat — the portfolio assistant.
 *
 * Checks run in this order: availability (503) → Content-Type (415) → body size (413) →
 * JSON (400) → validation (400) → intent → guardrails (429/503). Request-level failures
 * return JSON; once the event stream has started, failures are sent as an `error` event
 * followed by `done`. Only replies that call the model count toward the token budget and
 * the daily limits (see `src/lib/ai/guardrails.ts`).
 */
import { randomUUID } from "node:crypto";

import { formatMessage, getContent, getMessages, getProfileMessageValues } from "@/content";
import { getAiConfig, resolveChatAvailability, type AiConfig, type ChatMode } from "@/lib/ai/config";
import { buildPortfolioContext } from "@/lib/ai/context-build";
import { buildDemoReply } from "@/lib/ai/demo";
import {
  ChatRouteError,
  buildChatErrorBody,
  getChatErrorMessage,
  getChatErrorStatus,
  toChatRouteError,
} from "@/lib/ai/errors";
import { enforceChatGuardrails, estimateTokensFromChars } from "@/lib/ai/guardrails";
import { classifyIntent } from "@/lib/ai/intents";
import { streamChatCompletion } from "@/lib/ai/llm";
import { chatLogger, logChatDisabledOnce, type ChatLogEntry } from "@/lib/ai/logger";
import {
  SMALL_TALK_MAX_COMPLETION_TOKENS,
  buildChatMessages,
  buildSystemPrompt,
  type ChatPromptMessage,
} from "@/lib/ai/prompts";
import { inferChatReplyLocale } from "@/lib/ai/reply-locale";
import { MAX_CHAT_REQUEST_BYTES, type ChatSourceItem, type ChatStreamEvent } from "@/lib/ai/types";
import { getRequestedLocale, validateChatRequest, type ValidatedChatRequest } from "@/lib/ai/validation";
import { readJsonBody } from "@/lib/http/json-body";
import { resolvePreferredLocale, type Locale } from "@/shared/config/site";
import { getSitePagePath } from "@/shared/config/site-links";

export const runtime = "nodejs";
// Next.js reads this statically, so it stays a literal; it must equal
// CHAT_ROUTE_MAX_DURATION_SECONDS (a test checks it), which bounds CHAT_REQUEST_TIMEOUT_MS.
export const maxDuration = 30;

const SSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
};

type ReplyPlan =
  /** A fixed reply (action requests): no model call. */
  | { kind: "static"; text: string; sources: ChatSourceItem[] }
  /** CHAT_MODE=demo: a simulated reply built from the content. */
  | { kind: "demo"; text: string; sources: ChatSourceItem[] }
  | { kind: "llm"; messages: ChatPromptMessage[]; maxTokens: number; sources: ChatSourceItem[] };

function writeLog(entry: ChatLogEntry, startedAt: number) {
  entry.durationsMs.total = Date.now() - startedAt;
  const status = entry.httpStatus ?? 200;
  if (entry.status === "error" || status >= 500) {
    chatLogger.error(entry);
  } else if (entry.status === "rejected") {
    chatLogger.warn(entry);
  } else {
    chatLogger.info(entry);
  }
}

function errorResponse(error: ChatRouteError, locale: Locale) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (error.retryAfterMs !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(error.retryAfterMs / 1000)));
  }

  return Response.json(buildChatErrorBody(error, getMessages(locale).chat.errors), {
    status: getChatErrorStatus(error.code),
    headers,
  });
}

function planReply({
  config,
  mode,
  validated,
}: {
  config: AiConfig;
  mode: Exclude<ChatMode, "off">;
  validated: ValidatedChatRequest;
}): { plan: ReplyPlan; log: Partial<ChatLogEntry> } {
  const { locale, message } = validated;
  const intent = classifyIntent(message);
  const replyLocale = inferChatReplyLocale(message, locale);

  if (intent === "action_request") {
    const { profile, messages } = getContent(replyLocale);
    return {
      plan: {
        kind: "static",
        text: formatMessage(messages.chat.replies.actionNotSupported, getProfileMessageValues(profile)),
        sources: [
          {
            section: "contact",
            label: messages.contact.title,
            href: getSitePagePath(replyLocale, "contact"),
            locale: replyLocale,
          },
        ],
      },
      log: { intent, replyLocale, model: "static" },
    };
  }

  const context = buildPortfolioContext(locale, message);
  const contextLog = {
    intent,
    replyLocale,
    contextLength: context.contextLength,
    omittedSectionCount: context.omittedSections.length,
  };

  if (mode === "demo") {
    return {
      plan: {
        kind: "demo",
        text: buildDemoReply({
          locale,
          question: message,
          intent,
          sections: context.sections,
          markdownEnabled: config.markdownEnabled,
        }),
        sources: [],
      },
      log: { ...contextLog, model: "demo" },
    };
  }

  const systemPrompt = buildSystemPrompt({
    locale,
    mode: intent === "small_talk" ? "small_talk" : "portfolio",
    context,
    markdownEnabled: config.markdownEnabled,
  });

  return {
    plan: {
      kind: "llm",
      messages: buildChatMessages({ systemPrompt, history: validated.messages, message }),
      maxTokens:
        intent === "small_talk" ? Math.min(SMALL_TALK_MAX_COMPLETION_TOKENS, config.maxTokens) : config.maxTokens,
      // "Related pages" only make sense for questions about the portfolio.
      sources: intent === "portfolio" ? context.sources : [],
    },
    log: { ...contextLog, model: config.chatModel },
  };
}

function streamReply({
  request,
  config,
  plan,
  locale,
  requestId,
  log,
  startedAt,
}: {
  request: Request;
  config: AiConfig;
  plan: ReplyPlan;
  locale: Locale;
  requestId: string;
  log: ChatLogEntry;
  startedAt: number;
}) {
  const encoder = new TextEncoder();
  const cancelled = new AbortController();
  // Stop the model call when the visitor disconnects, however the runtime reports it.
  const signal = AbortSignal.any([request.signal, cancelled.signal]);

  const run = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    let closed = false;
    const send = (event: ChatStreamEvent) => {
      if (closed) return;
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch {
        closed = true;
      }
    };

    send({ type: "start", requestId, messageId: `msg_${randomUUID()}`, locale });

    try {
      if (plan.kind === "llm") {
        const result = await streamChatCompletion({
          config,
          messages: plan.messages,
          maxTokens: plan.maxTokens,
          signal,
          onDelta: (delta) => {
            log.durationsMs.firstToken ??= Date.now() - startedAt;
            send({ type: "chunk", delta });
          },
        });

        log.outputLength = result.outputLength;
        log.tokens = result.usage;
        log.finishReason = result.finishReason;
        if (result.aborted) {
          log.status = "aborted";
          return;
        }
      } else {
        log.durationsMs.firstToken = Date.now() - startedAt;
        log.outputLength = plan.text.length;
        log.finishReason = plan.kind;
        send({ type: "chunk", delta: plan.text });
      }

      if (plan.sources.length > 0) {
        send({ type: "sources", items: plan.sources });
      }
      send({ type: "done", finishReason: log.finishReason ?? "stop" });
      log.sourceCount = plan.sources.length;
      log.status = "success";
    } catch (error) {
      // The visitor left: nobody is listening, so stop quietly.
      if (signal.aborted) {
        log.status = "aborted";
        return;
      }

      const routeError = toChatRouteError(error);
      send({
        type: "error",
        code: routeError.code,
        message: getChatErrorMessage(routeError.code, getMessages(locale).chat.errors),
        retryable: routeError.retryable,
        retryAfterMs: routeError.retryAfterMs,
      });
      send({ type: "done", finishReason: "error" });
      log.status = "error";
      log.errorCode = routeError.code;
      log.logClassification = routeError.logClassification;
      log.providerError = routeError.providerError;
      log.finishReason = "error";
    } finally {
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by a cancel.
        }
      }
      writeLog(log, startedAt);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void run(controller);
    },
    cancel() {
      cancelled.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = `req_${randomUUID()}`;
  // Until the body names a locale, errors use the browser's preferred one.
  let locale = resolvePreferredLocale({ acceptLanguage: request.headers.get("accept-language") });
  const log: ChatLogEntry = { requestId, locale, status: "rejected", durationsMs: { total: 0 } };

  const reject = (error: ChatRouteError) => {
    log.locale = locale;
    log.httpStatus = getChatErrorStatus(error.code);
    log.errorCode = error.code;
    log.logClassification = error.logClassification;
    writeLog(log, startedAt);
    return errorResponse(error, locale);
  };

  try {
    const availability = resolveChatAvailability();
    if (!availability.enabled) {
      logChatDisabledOnce(availability.reason);
      return errorResponse(new ChatRouteError("The chat is disabled.", { code: "chat_disabled" }), locale);
    }
    log.mode = availability.mode;

    const body = await readJsonBody(request, MAX_CHAT_REQUEST_BYTES);
    if (!body.ok) {
      return reject(new ChatRouteError("The request body was rejected.", { code: body.error }));
    }

    locale = getRequestedLocale(body.value) ?? locale;
    log.locale = locale;
    const config = getAiConfig();
    const validated = validateChatRequest(body.value, {
      historyMode: config.historyMode,
      maxTranscriptMessages: config.maxTranscriptMessages,
    });

    Object.assign(log, {
      queryLength: validated.message.length,
      historyMessageCount: validated.messages.length,
      droppedHistoryTurns: validated.droppedHistoryTurns,
      historyTrimmed: validated.historyTrimmed,
      hasConversationId: Boolean(validated.conversationIdHash),
    });

    const { plan, log: planLog } = planReply({ config, mode: availability.mode, validated });
    Object.assign(log, planLog);

    const estimatedTokens =
      plan.kind === "llm"
        ? estimateTokensFromChars(plan.messages.reduce((total, entry) => total + entry.content.length, 0)) +
          plan.maxTokens
        : 0;
    log.estimatedTokens = estimatedTokens;

    await enforceChatGuardrails({
      request,
      storeKind: availability.store,
      config,
      conversationIdHash: validated.conversationIdHash,
      modelRequest: plan.kind === "llm",
      estimatedTokens,
    });

    log.httpStatus = 200;
    return streamReply({ request, config, plan, locale, requestId, log, startedAt });
  } catch (error) {
    return reject(toChatRouteError(error));
  }
}
