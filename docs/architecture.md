# Architecture

## Overview

```
Browser                                   Server (Next.js)
─────────────────────────────────────────────────────────────────────────────────────────
Static pages (/en, /en/about, …)  ◄────── prerendered at build time from src/content/
  │
  ├─ Home assistant card ─┐
  └─ Chat panel ──────────┴─ POST /api/chat ──► availability (CHAT_MODE, key, store)
                                                ► Content-Type and body size (≤ 32 KB)
                                                ► JSON + validation (message ≤ 500 chars,
                                                  alternating history, conversation id)
                                                ► prompt-injection heuristic
                                                ► intent: portfolio | small_talk | action_request
                                                ► guardrails (Upstash or memory)
                                                ► reply:
                                                    action_request → fixed reply, no model call
                                                    demo mode      → simulated reply, no model call
                                                    otherwise      → Chat Completions stream (LLM)
                                                ◄ SSE: start → chunk* → sources? → done
  Contact form ─────────── POST /api/contact ─► size/JSON checks → honeypot → rate limit → Resend
```

Everything the site and the assistant know about the owner comes from `src/content/<locale>/profile.ts`.

## Content layer (`src/content/`)

- `schema.ts`: the `Profile` type and `validateProfile()` (errors and warnings with dot paths), plus
  `validateMessages()` for translation parity.
- `index.ts`: `getContent(locale)`, `getProfile(locale)` and `getMessages(locale)`, the only way pages and
  server code read content. Client components receive what they need as props.
- `format.ts`: client-safe helpers (`formatMessage`, `formatPeriod`, `getFirstName`, …).
- `scripts/check-content.ts` runs the validators for every locale and checks that the assistant's context fits
  its budget. It runs before every `pnpm build`.

## Assistant (`src/lib/ai/`)

| Module | Role |
|---|---|
| `config.ts` | Reads environment variables on every call; resolves the chat mode, the rate-limit store and the browser-safe settings |
| `validation.ts`, `history.ts` | Request validation; history normalization, trimming and the transcript cap |
| `safety.ts` | Regex heuristic for obvious prompt-injection attempts (a first filter, not the boundary) |
| `intents.ts` | Routes action requests and small talk; everything else is a portfolio question |
| `context-build.ts` | Serializes the profile into labeled sections within `CHAT_CONTEXT_MAX_CHARS`; picks up to three "related pages" by keyword match |
| `prompts.ts` | Builds the system prompt: identity, rules, site links, the content and FAQ inside delimiters, owner style preferences |
| `guardrails.ts` | Per-IP requests per minute, per-conversation quota, per-IP token budget, per-IP and site-wide daily caps; checks everything before counting anything |
| `llm.ts` | Streams from `{LLM_BASE_URL}/chat/completions`; timeout and client disconnect abort the request; output safety cap |
| `demo.ts` | Simulated, labeled replies built from matching content sections |
| `errors.ts`, `error-copy.ts`, `logger.ts` | Error codes → HTTP status; one code → message map shared with the browser; structured logs |

The model receives the system prompt, the trimmed history and the question. The profile is wrapped in
`<portfolio_content>` and the FAQ in `<faq>`; any closing tag inside the content is neutralized, and the rules
state that the content and the conversation are data, not instructions.

## HTTP contract: `POST /api/chat`

Request: `Content-Type: application/json`, at most 32 KB.

```json
{ "locale": "en", "message": "What has Jordan built?", "conversationId": "conv_…",
  "messages": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }] }
```

Success is a `text/event-stream` of JSON frames:
`start` → `chunk`* → `sources`? → `done`. A failure after streaming started is sent as `error` followed by
`done` (`upstream_error`, `timeout_error`).

Request-level failures return JSON `{ "error": { "code", "message", "retryable", "retryAfterMs"? } }`:

| Status | Codes |
|---|---|
| 400 | `invalid_json`, `validation_error`, `unsupported_locale`, `unsafe_input`, `transcript_cap_reached` |
| 413 | `payload_too_large` |
| 415 | `unsupported_media_type` |
| 429 | `rate_limited`, `conversation_quota_exceeded`, `token_budget_exceeded`, `ip_daily_limit_reached`, `daily_limit_reached` (with `Retry-After`) |
| 503 | `chat_disabled`, `guard_unavailable` |
| 500 | `internal_error` |

Messages are localized and never contain stack traces, prompts, provider responses or configuration.

## Security model

| Threat | Mitigation |
|---|---|
| API key leaks to the browser | Keys are read only in server modules; the layout passes a small browser-safe config (`getChatClientConfig`) |
| Prompt injection by visitors | Nothing secret is in the context; no tools or actions; rules mark content and history as data; a heuristic rejects obvious attempts; history turns that look like injections are dropped |
| Malicious content in answers | Markdown is parsed into React elements without HTML; on-site links must be real pages or files; external links must appear in the content and open in a new tab |
| Abuse and cost | Size limits, rate limits, quotas, a token estimate, a daily cap, bounded answers, a provider timeout and abort on disconnect; a provider-side budget is still required |
| Data exposure | No transcripts stored by the app (in `live` mode the question and recent turns go to the LLM provider); rate-limit keys use hashed IPs; logs contain lengths, counts, codes, durations and token usage, never text, raw IPs or keys |
| Contact-form abuse | Size and field limits, email validation, CR/LF removed from the subject, honeypot, per-IP rate limit |

Per-visitor limits identify visitors by IP: the header named in `RATE_LIMIT_IP_HEADER`, otherwise the first
`X-Forwarded-For` entry (trustworthy only behind a proxy that overwrites it, as Vercel does), with IPv6 grouped per
/64. In-memory counters are per process; site-wide counters are never evicted from them.

## Rendering

- `src/app/[locale]/` pages are statically generated for every supported locale (`generateStaticParams`,
  `dynamicParams = false`). The chat mode is passed to the client at build time.
- `src/app/page.tsx` redirects `/` to the visitor's saved language (the `site_locale` cookie, written by the
  language switcher) or the browser's preferred one (`Accept-Language`); `src/proxy.ts` does the same for
  locale-less page paths (`/about`). URLs that carry a locale are never redirected.
- Unknown URLs get the prerendered `src/app/not-found.tsx`, which works without JavaScript. In the browser it
  switches to the URL's locale, or to the saved or browser language for URLs without one.
- Themes: `globals.css` holds the light tokens in `:root` and the dark ones in `:root[data-theme="dark"]`. An
  inline script in the document head (`THEME_INIT_SCRIPT`, `src/shared/config/theme.ts`) sets `data-theme` from
  the saved choice (`localStorage`) or the system setting before the first paint, so prerendered pages need no
  server-side theme. The header toggle switches the attribute, the theme-color metas and the saved choice.
- Production responses carry a static Content-Security-Policy (`next.config.ts`) that keeps pages prerendered.
- Open Graph images, icons, the manifest, `sitemap.xml` and `robots.txt` are generated from the content.

## Tests

`pnpm test` runs Vitest suites in `tests/`. They cover content validation and formatting, the chat API
end to end with a mocked provider (status codes, streaming, provider errors and timeouts, limits, demo mode,
action requests), intents, history, the context builder, prompts, the rate-limit stores, the contact API, the
Markdown parser and link guard, the chat client helpers, first renders of the chat UI in each mode, language
negotiation and redirects, the theme script and toggle, and SEO output. Suites use fixtures where they need specific data, so they keep passing after you replace the example
profile. Model answer quality is evaluated separately with `pnpm eval`.
