/**
 * Streaming client for any OpenAI-compatible Chat Completions API (OpenAI, OpenRouter,
 * Groq, a local server…), using plain fetch.
 *
 * Never log or return prompts, message text, the API key or provider response bodies:
 * errors carry only a code, a retry hint and a short classification for the logs.
 */
import type { AiConfig } from "./config";
import { ChatRouteError, type ProviderErrorFields } from "./errors";
import type { ChatPromptMessage } from "./prompts";

export type ChatUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ChatCompletionResult = {
  /** "stop", "length", … or "aborted" when the visitor disconnected. */
  finishReason: string;
  aborted: boolean;
  usage?: ChatUsage;
  outputLength: number;
};

type StreamChatCompletionParams = {
  config: Pick<
    AiConfig,
    | "llmBaseUrl"
    | "llmApiKey"
    | "chatModel"
    | "temperature"
    | "maxTokensParam"
    | "requestTimeoutMs"
    | "openRouterHttpReferer"
    | "openRouterTitle"
  >;
  messages: ChatPromptMessage[];
  maxTokens: number;
  /** Aborted when the visitor disconnects. */
  signal?: AbortSignal;
  onDelta: (delta: string) => void;
};

/** Output safety cap: a reply longer than this is cut, whatever the provider does. */
const CHARS_PER_TOKEN_CAP = 8;
/** Only this much of a 4xx error body is read, to find its machine-readable fields. */
const ERROR_BODY_MAX_BYTES = 8_192;
/** Error codes and parameter names are short identifiers; anything else is not logged. */
const PROVIDER_FIELD_PATTERN = /^[\w.:[\]-]{1,64}$/;

function buildHeaders(config: StreamChatCompletionParams["config"]) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.llmApiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  // Optional attribution headers used by OpenRouter.
  if (config.openRouterHttpReferer) {
    headers["HTTP-Referer"] = config.openRouterHttpReferer;
  }
  if (config.openRouterTitle) {
    headers["X-Title"] = config.openRouterTitle;
  }

  return headers;
}

function readDelta(payload: Record<string, unknown>) {
  const [choice] = Array.isArray(payload.choices) ? payload.choices : [];
  if (!choice || typeof choice !== "object") {
    return { delta: "", finishReason: undefined };
  }

  const { delta, finish_reason: finishReason } = choice as { delta?: unknown; finish_reason?: unknown };
  const content = delta && typeof delta === "object" ? (delta as { content?: unknown }).content : undefined;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("")
        : "";

  return { delta: text, finishReason: typeof finishReason === "string" ? finishReason : undefined };
}

function readUsage(payload: Record<string, unknown>): ChatUsage | undefined {
  const usage = payload.usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const { prompt_tokens, completion_tokens, total_tokens } = usage as Record<string, unknown>;
  const asNumber = (value: unknown) => (typeof value === "number" ? value : undefined);
  return {
    promptTokens: asNumber(prompt_tokens),
    completionTokens: asNumber(completion_tokens),
    totalTokens: asNumber(total_tokens),
  };
}

/** Splits an SSE buffer into complete `data:` payloads; returns the unfinished rest. */
function consumeSseBuffer(buffer: string, onData: (data: string) => void) {
  const frames = buffer.replace(/\r\n?/g, "\n").split("\n\n");
  const rest = frames.pop() ?? "";

  for (const frame of frames) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (data) {
      onData(data);
    }
  }

  return rest;
}

function upstreamError(logClassification: string, retryable = true, providerError?: ProviderErrorFields) {
  return new ChatRouteError("The model provider request failed.", {
    code: "upstream_error",
    retryable,
    logClassification,
    providerError,
  });
}

/** The start of a response body as text, at most `maxBytes`; the rest is discarded. */
async function readBodyStart(response: Response, maxBytes: number) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * `error.code` and `error.param` of an OpenAI-style error body (e.g. `unsupported_parameter`
 * and `max_tokens`), so the logs show why a request was refused. The provider's message is
 * never read into the logs: it can echo request details.
 */
async function readProviderErrorFields(response: Response): Promise<ProviderErrorFields | undefined> {
  try {
    const payload = JSON.parse(await readBodyStart(response, ERROR_BODY_MAX_BYTES)) as unknown;
    const error = payload && typeof payload === "object" ? (payload as { error?: unknown }).error : undefined;
    if (!error || typeof error !== "object") {
      return undefined;
    }

    const field = (value: unknown) => {
      const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
      return typeof text === "string" && PROVIDER_FIELD_PATTERN.test(text) ? text : undefined;
    };
    const { code, param } = error as { code?: unknown; param?: unknown };
    const fields = { code: field(code), param: field(param) };
    return fields.code || fields.param ? fields : undefined;
  } catch {
    return undefined;
  }
}

function timeoutError() {
  return new ChatRouteError("The model provider timed out.", {
    code: "timeout_error",
    retryable: true,
    logClassification: "upstream_timeout",
  });
}

/**
 * Streams a chat completion, calling `onDelta` for each text chunk.
 *
 * Throws ChatRouteError (`timeout_error` or `upstream_error`). Returns quietly with
 * `aborted: true` when `signal` aborts (the visitor went away).
 */
export async function streamChatCompletion({
  config,
  messages,
  maxTokens,
  signal,
  onDelta,
}: StreamChatCompletionParams): Promise<ChatCompletionResult> {
  const timeoutSignal = AbortSignal.timeout(config.requestTimeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const outputCap = maxTokens * CHARS_PER_TOKEN_CAP;
  const aborted = (outputLength: number): ChatCompletionResult => ({
    finishReason: "aborted",
    aborted: true,
    outputLength,
  });

  /** Classifies a thrown fetch/read error by which signal fired. */
  const failure = (logClassification: string) => {
    if (timeoutSignal.aborted) return timeoutError();
    return upstreamError(logClassification);
  };

  let response: Response;
  try {
    response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: "POST",
      headers: buildHeaders(config),
      signal: requestSignal,
      body: JSON.stringify({
        model: config.chatModel,
        stream: true,
        stream_options: { include_usage: true },
        // CHAT_MAX_TOKENS_PARAM: newer OpenAI models reject `max_tokens`.
        [config.maxTokensParam]: maxTokens,
        // CHAT_TEMPERATURE=default: some reasoning models reject any temperature.
        ...(config.temperature === null ? {} : { temperature: config.temperature }),
        messages,
      }),
    });
  } catch {
    if (signal?.aborted) return aborted(0);
    throw failure("upstream_network");
  }

  if (!response.ok) {
    const { status } = response;
    // A 4xx usually means a configuration problem (model name, parameter, quota): keep its
    // error code and parameter for the logs. Other bodies are discarded unread.
    let providerError: ProviderErrorFields | undefined;
    if (status >= 400 && status < 500) {
      providerError = await readProviderErrorFields(response);
    } else {
      void response.body?.cancel().catch(() => undefined);
    }
    throw upstreamError(`upstream_status_${status}`, status === 429 || status >= 500, providerError);
  }

  if (!response.body) {
    throw upstreamError("upstream_missing_body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason = "stop";
  let usage: ChatUsage | undefined;
  let outputLength = 0;
  let capped = false;
  let providerError = false;

  const handleData = (data: string) => {
    if (data === "[DONE]" || capped || providerError) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }

    // Some providers report mid-stream failures as `{ "error": … }` frames.
    if (payload.error) {
      providerError = true;
      return;
    }

    usage = readUsage(payload) ?? usage;
    const { delta, finishReason: nextFinishReason } = readDelta(payload);
    if (nextFinishReason) finishReason = nextFinishReason;
    if (!delta) return;

    const room = outputCap - outputLength;
    const text = delta.length > room ? delta.slice(0, Math.max(room, 0)) : delta;
    if (text) {
      outputLength += text.length;
      onDelta(text);
    }
    if (delta.length > room) {
      capped = true;
      finishReason = "length";
    }
  };

  try {
    while (!capped && !providerError) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = consumeSseBuffer(done ? `${buffer}\n\n` : buffer, handleData);
      if (done) break;
    }
  } catch {
    if (signal?.aborted) return aborted(outputLength);
    throw failure("upstream_stream_interrupted");
  } finally {
    if (capped || providerError || requestSignal.aborted) {
      void reader.cancel().catch(() => undefined);
    }
  }

  if (providerError) {
    throw upstreamError("upstream_stream_error");
  }

  // A 200 without any text (a non-streaming error body, a filtered reply) is a failure.
  if (outputLength === 0) {
    throw upstreamError("upstream_empty_response");
  }

  return { finishReason, aborted: false, usage, outputLength };
}
