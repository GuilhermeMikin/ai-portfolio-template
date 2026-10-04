import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { ChatRouteError } from "@/lib/ai/errors";
import { streamChatCompletion } from "@/lib/ai/llm";

type TestConfig = Parameters<typeof streamChatCompletion>[0]["config"];

const config: TestConfig = {
  llmBaseUrl: "https://llm.example.com/v1",
  llmApiKey: "sk-llm-test",
  chatModel: "test-model",
  temperature: 0.3,
  maxTokensParam: "max_tokens",
  requestTimeoutMs: 5_000,
  openRouterHttpReferer: "",
  openRouterTitle: "",
};
const messages = [{ role: "user" as const, content: "Hi" }];

/** A provider response body; `keepOpen` simulates a provider that is still sending. */
function streamOf(text: string, { status = 200, keepOpen = false } = {}) {
  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      if (!keepOpen) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(body, { status }), wasCancelled: () => cancelled };
}

function frame(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\r\n\r\n`;
}

async function run(maxTokens = 100, signal?: AbortSignal, overrides: Partial<TestConfig> = {}) {
  const deltas: string[] = [];
  const result = await streamChatCompletion({
    config: { ...config, ...overrides },
    messages,
    maxTokens,
    signal,
    onDelta: (delta) => deltas.push(delta),
  });
  return { result, text: deltas.join("") };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ChatRouteError);
    return error as ChatRouteError;
  }
  throw new Error("Expected a ChatRouteError");
}

let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, "fetch");
});

describe("streamChatCompletion", () => {
  it("parses CRLF-framed deltas, the finish reason and usage", async () => {
    fetchMock.mockResolvedValue(
      streamOf(
        frame({ choices: [{ delta: { content: "Hello" } }] }) +
          frame({ choices: [{ delta: { content: [{ type: "text", text: " world" }] } }] }) +
          frame({ choices: [{ delta: {}, finish_reason: "stop" }] }) +
          frame({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }) +
          "data: [DONE]\r\n\r\n"
      ).response
    );

    const { result, text } = await run();
    expect(text).toBe("Hello world");
    expect(result).toEqual({
      finishReason: "stop",
      aborted: false,
      outputLength: 11,
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "test-model",
      max_tokens: 100,
      temperature: 0.3,
      stream: true,
    });
  });

  it("uses CHAT_MAX_TOKENS_PARAM as the limit key and leaves out a `default` temperature", async () => {
    fetchMock.mockResolvedValue(streamOf(frame({ choices: [{ delta: { content: "Hi" } }] })).response);

    await run(100, undefined, { maxTokensParam: "max_completion_tokens", temperature: null });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.max_completion_tokens).toBe(100);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("stops at the output safety cap and cancels the stream", async () => {
    const stream = streamOf(frame({ choices: [{ delta: { content: "x".repeat(500) } }] }), { keepOpen: true });
    fetchMock.mockResolvedValue(stream.response);

    const { result, text } = await run(16);
    expect(text).toHaveLength(16 * 8);
    expect(result.finishReason).toBe("length");
    expect(stream.wasCancelled()).toBe(true);
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [401, false],
    [400, false],
  ])("maps HTTP %i to a %s-retryable upstream_error", async (status, retryable) => {
    fetchMock.mockResolvedValue(new Response("provider body", { status }));
    const error = await failure(run());
    expect(error.code).toBe("upstream_error");
    expect(error.retryable).toBe(retryable);
    expect(error.logClassification).toBe(`upstream_status_${status}`);
  });

  it("keeps only the error code and parameter of a 4xx body", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { message: "The model `x` does not exist or you do not have access", code: "model_not_found", param: null } },
        { status: 404 }
      )
    );
    const error = await failure(run());
    expect(error.providerError).toEqual({ code: "model_not_found", param: undefined });
    expect(JSON.stringify(error)).not.toContain("does not exist");

    // OpenRouter uses numeric codes; free text in those fields is dropped.
    fetchMock.mockResolvedValue(Response.json({ error: { code: 402, param: "a long sentence, not a name" } }, { status: 402 }));
    expect((await failure(run())).providerError).toEqual({ code: "402", param: undefined });

    // Not JSON, or a 5xx: nothing is kept.
    fetchMock.mockResolvedValue(new Response("<html>Bad request</html>", { status: 400 }));
    expect((await failure(run())).providerError).toBeUndefined();
    fetchMock.mockResolvedValue(Response.json({ error: { code: "server_error" } }, { status: 500 }));
    expect((await failure(run())).providerError).toBeUndefined();
  });

  it("maps a network failure to a retryable upstream_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const error = await failure(run());
    expect(error).toMatchObject({ code: "upstream_error", retryable: true, logClassification: "upstream_network" });
  });

  it("treats provider error frames and empty replies as upstream errors", async () => {
    fetchMock.mockResolvedValueOnce(streamOf(frame({ error: { message: "overloaded" } })).response);
    expect((await failure(run())).logClassification).toBe("upstream_stream_error");

    fetchMock.mockResolvedValueOnce(streamOf("{\"not\":\"sse\"}").response);
    expect((await failure(run())).logClassification).toBe("upstream_empty_response");
  });

  it("returns quietly when the visitor disconnects", async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        })
    );
    const controller = new AbortController();
    const pending = run(100, controller.signal);
    controller.abort();

    const { result, text } = await pending;
    expect(result).toMatchObject({ aborted: true, finishReason: "aborted" });
    expect(text).toBe("");
  });
});
