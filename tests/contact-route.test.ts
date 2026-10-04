import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { POST } from "@/app/api/contact/route";
import { getMessages } from "@/content";
import { isContactFormEnabled } from "@/lib/contact/config";
import { resetRateLimitStores } from "@/lib/rate-limit";
import { DEFAULT_LOCALE } from "@/shared/config/site";

const RESEND_KEY = "re_test_secret_key";
const OWNER_EMAIL = "owner@example.com";
// Requests without Accept-Language get the default locale.
const form = getMessages(DEFAULT_LOCALE).contact.form;

const CONTACT_ENV = [
  "RESEND_API_KEY",
  "RESEND_TO_EMAIL",
  "RESEND_FROM_EMAIL",
  "CONTACT_RATE_LIMIT_MAX",
  "CONTACT_RATE_LIMIT_WINDOW_SECONDS",
  "CHAT_RATE_LIMIT_STORE",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RATE_LIMIT_KEY_PREFIX",
  "RATE_LIMIT_IP_HEADER",
];

function setEnv(values: Record<string, string> = {}) {
  for (const name of CONTACT_ENV) {
    vi.stubEnv(name, values[name] ?? "");
  }
}

function setConfiguredEnv(values: Record<string, string> = {}) {
  setEnv({ RESEND_API_KEY: RESEND_KEY, RESEND_TO_EMAIL: OWNER_EMAIL, ...values });
}

let ipCounter = 0;
function contactRequest(body: unknown, { ip }: { ip?: string } = {}) {
  ipCounter += 1;
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip ?? `192.0.2.${ipCounter}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validMessage = {
  name: "Alex Example",
  email: "alex@example.com",
  reason: "Freelance project",
  message: "Hi! I'd like to talk about a small project.",
};

let fetchMock: MockInstance<typeof fetch>;
let consoleSpies: MockInstance[];

function consoleOutput() {
  return consoleSpies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" "))).join("\n");
}

beforeEach(() => {
  resetRateLimitStores();
  setEnv();
  fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network call"));
  consoleSpies = (["log", "info", "warn", "error"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined)
  );
});

describe("isContactFormEnabled", () => {
  it("needs both the Resend key and the destination address", () => {
    expect(isContactFormEnabled({})).toBe(false);
    expect(isContactFormEnabled({ RESEND_API_KEY: RESEND_KEY })).toBe(false);
    expect(isContactFormEnabled({ RESEND_TO_EMAIL: OWNER_EMAIL })).toBe(false);
    expect(isContactFormEnabled({ RESEND_API_KEY: RESEND_KEY, RESEND_TO_EMAIL: OWNER_EMAIL })).toBe(true);
  });
});

describe("POST /api/contact", () => {
  it("returns 503 not_configured without Resend settings", async () => {
    const response = await POST(contactRequest(validMessage));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "not_configured", message: form.error } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 415 for a non-JSON body and 400 for invalid JSON", async () => {
    setConfiguredEnv();
    const plain = new Request("http://localhost/api/contact", { method: "POST", body: "name=Alex" });
    expect((await POST(plain)).status).toBe(415);

    const broken = await POST(contactRequest("{nope"));
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { error: { code: string } }).error.code).toBe("invalid_json");
  });

  it("returns 413 for an oversized body", async () => {
    setConfiguredEnv();
    const response = await POST(contactRequest({ ...validMessage, message: "x".repeat(20_000) }));
    expect(response.status).toBe(413);
  });

  it("pretends success for a filled honeypot without sending", async () => {
    setConfiguredEnv();
    const response = await POST(contactRequest({ ...validMessage, extra_field: "https://spam.example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }],
    ["a missing message", { message: "   " }],
    ["a missing name", { name: undefined }],
    ["a name over 120 characters", { name: "n".repeat(121) }],
    ["a reason over 80 characters", { reason: "r".repeat(81) }],
    ["a message over 4000 characters", { message: "m".repeat(4001) }],
    ["a non-string field", { email: ["alex@example.com"] }],
  ])("returns 400 validation_error for %s", async (_label, override) => {
    setConfiguredEnv();
    const response = await POST(contactRequest({ ...validMessage, ...override }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "validation_error", message: form.error } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the message through Resend", async () => {
    setConfiguredEnv();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));

    const response = await POST(
      contactRequest({ ...validMessage, name: "Alex\r\nBcc: victim@example.com" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${RESEND_KEY}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      from: "Portfolio <onboarding@resend.dev>",
      to: [OWNER_EMAIL],
      reply_to: "alex@example.com",
    });
    expect(payload.subject).not.toMatch(/[\r\n]/);
    expect(payload.text).toContain(validMessage.message);
    expect(consoleOutput()).not.toContain("alex@example.com");
  });

  it("returns 502 send_failed when Resend fails, logging the status only", async () => {
    setConfiguredEnv();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "provider detail for alex@example.com" }), { status: 500 })
    );

    const response = await POST(contactRequest(validMessage));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: "send_failed", message: form.error } });

    const output = consoleOutput();
    expect(output).toContain("500");
    expect(output).not.toContain("provider detail");
    expect(output).not.toContain("alex@example.com");
    expect(output).not.toContain(RESEND_KEY);
  });

  it("returns 502 send_failed on a network error", async () => {
    setConfiguredEnv();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await POST(contactRequest(validMessage))).status).toBe(502);
  });

  it("returns 429 with Retry-After once the per-IP limit is reached", async () => {
    setConfiguredEnv({ CONTACT_RATE_LIMIT_MAX: "1" });
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    const ip = "192.0.2.250";

    expect((await POST(contactRequest(validMessage, { ip }))).status).toBe(200);

    const limited = await POST(contactRequest(validMessage, { ip }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: { code: "rate_limited", message: form.rateLimited } });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not count invalid or honeypot submissions toward the limit", async () => {
    setConfiguredEnv({ CONTACT_RATE_LIMIT_MAX: "1" });
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    const ip = "192.0.2.251";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await POST(contactRequest({ ...validMessage, email: "typo@" }, { ip }))).status).toBe(400);
      expect((await POST(contactRequest({ ...validMessage, extra_field: "bot" }, { ip }))).status).toBe(200);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    // The one allowed message still goes through, and only then is the limit reached.
    expect((await POST(contactRequest(validMessage, { ip }))).status).toBe(200);
    expect((await POST(contactRequest(validMessage, { ip }))).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails open when the shared store is unreachable", async () => {
    setConfiguredEnv({
      UPSTASH_REDIS_REST_URL: "https://redis.example.com",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
    });
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes("redis.example.com")) {
        throw new TypeError("fetch failed");
      }
      return new Response("{}", { status: 200 });
    });

    const response = await POST(contactRequest(validMessage));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.some(([url]) => url === "https://api.resend.com/emails")).toBe(true);
  });
});
