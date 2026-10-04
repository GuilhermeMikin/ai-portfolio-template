/**
 * Server-only contact form configuration (Resend). Never import from a client component:
 * RESEND_API_KEY must stay on the server.
 */
import { parseIntegerEnv, readEnv, type Env } from "@/lib/env";

const DEFAULT_FROM_EMAIL = "Portfolio <onboarding@resend.dev>";
const DEFAULT_RATE_LIMIT_MAX = 5;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 3_600;

export function getContactConfig(env: Env = process.env) {
  return {
    resendApiKey: readEnv(env, "RESEND_API_KEY") ?? "",
    toEmail: readEnv(env, "RESEND_TO_EMAIL") ?? "",
    fromEmail: readEnv(env, "RESEND_FROM_EMAIL") ?? DEFAULT_FROM_EMAIL,
    rateLimitMax: parseIntegerEnv(env, "CONTACT_RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX),
    rateLimitWindowSeconds: parseIntegerEnv(env, "CONTACT_RATE_LIMIT_WINDOW_SECONDS", DEFAULT_RATE_LIMIT_WINDOW_SECONDS),
  };
}

export type ContactConfig = ReturnType<typeof getContactConfig>;

/** True when the contact form can send email (RESEND_API_KEY and RESEND_TO_EMAIL are set). */
export function isContactFormEnabled(env: Env = process.env): boolean {
  const config = getContactConfig(env);
  return Boolean(config.resendApiKey && config.toEmail);
}
