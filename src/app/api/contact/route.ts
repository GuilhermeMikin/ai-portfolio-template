/**
 * POST /api/contact — sends the contact form to the owner's inbox through Resend.
 *
 * Order: configuration (503) → Content-Type, size and JSON (415/413/400) → honeypot (a
 * fake 200) → validation (400) → per-IP rate limit (429) → Resend. Only a valid message
 * counts toward the rate limit, so a visitor fixing a typo is not locked out.
 *
 * Nothing is stored. Logs contain status codes only, never addresses or message text.
 */
import { getMessages } from "@/content";
import { getContactConfig } from "@/lib/contact/config";
import { checkContactRateLimit } from "@/lib/contact/rate-limit";
import { readJsonBody } from "@/lib/http/json-body";
import { resolvePreferredLocale, type Locale } from "@/shared/config/site";

export const runtime = "nodejs";

const MAX_CONTACT_REQUEST_BYTES = 16 * 1024;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;
const FIELD_LIMITS = { name: 120, email: 200, reason: 80, message: 4000 } as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactErrorCode =
  | "invalid_json"
  | "validation_error"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "not_configured"
  | "send_failed";

const STATUS_BY_CODE: Record<ContactErrorCode, number> = {
  invalid_json: 400,
  validation_error: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  not_configured: 503,
  send_failed: 502,
};

type ContactMessage = {
  name: string;
  email: string;
  reason: string;
  message: string;
};

function log(level: "info" | "warn" | "error", payload: Record<string, unknown>) {
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  method(JSON.stringify({ scope: "contact", ...payload }));
}

function errorResponse(code: ContactErrorCode, locale: Locale, retryAfterMs?: number) {
  const form = getMessages(locale).contact.form;
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterMs !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
  }

  return Response.json(
    { error: { code, message: code === "rate_limited" ? form.rateLimited : form.error } },
    { status: STATUS_BY_CODE[code], headers }
  );
}

/** A trimmed string within `maxLength`, "" when absent, or null when invalid. */
function readField(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : null;
}

function validateMessage(payload: unknown): ContactMessage | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const name = readField(body.name, FIELD_LIMITS.name);
  const email = readField(body.email, FIELD_LIMITS.email);
  const reason = readField(body.reason, FIELD_LIMITS.reason);
  const message = readField(body.message, FIELD_LIMITS.message);

  if (!name || !email || reason === null || !message || !EMAIL_PATTERN.test(email)) {
    return null;
  }

  return { name, email, reason, message };
}

/** Removes line breaks so visitor input cannot add email headers. */
function toHeaderValue(value: string) {
  return value.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function isHoneypotFilled(payload: unknown) {
  const value = payload && typeof payload === "object" ? (payload as { extra_field?: unknown }).extra_field : undefined;
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export async function POST(request: Request): Promise<Response> {
  const locale = resolvePreferredLocale({ acceptLanguage: request.headers.get("accept-language") });
  const config = getContactConfig();

  if (!config.resendApiKey || !config.toEmail) {
    return errorResponse("not_configured", locale);
  }

  const body = await readJsonBody(request, MAX_CONTACT_REQUEST_BYTES);
  if (!body.ok) {
    return errorResponse(body.error, locale);
  }

  // A filled honeypot means a bot: pretend success so it learns nothing.
  if (isHoneypotFilled(body.value)) {
    log("info", { event: "honeypot" });
    return Response.json({ ok: true });
  }

  const contact = validateMessage(body.value);
  if (!contact) {
    return errorResponse("validation_error", locale);
  }

  const rateLimit = await checkContactRateLimit(request);
  if (!rateLimit.allowed) {
    return errorResponse("rate_limited", locale, rateLimit.retryAfterMs ?? 60_000);
  }

  const subject = toHeaderValue(
    `Portfolio message from ${contact.name}${contact.reason ? ` (${contact.reason})` : ""}`
  );
  const text = [
    "New message from the portfolio contact form.",
    "",
    `Name: ${contact.name}`,
    `Email: ${contact.email}`,
    contact.reason ? `Reason: ${contact.reason}` : null,
    "",
    contact.message,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [config.toEmail],
        reply_to: contact.email,
        subject,
        text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      log("error", { event: "send_failed", status: response.status });
      return errorResponse("send_failed", locale);
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    log("error", { event: "send_failed", reason: timedOut ? "timeout" : "network" });
    return errorResponse("send_failed", locale);
  }

  log("info", { event: "sent" });
  return Response.json({ ok: true });
}
