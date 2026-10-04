# Deployment guide

The site is a standard Next.js 16 app. Pages are prerendered at build time; only `/api/chat` and
`/api/contact` run on the server. Any host that runs Node.js 20.9+ works.

## Before you deploy

- [ ] Your content is in `src/content/en/profile.ts` and `isExample` is `false`.
- [ ] `pnpm content:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- [ ] `NEXT_PUBLIC_SITE_URL` is set to your domain (for example `https://example.com`) **at build time**, so
      canonical URLs, Open Graph tags and the sitemap point to it. `pnpm content:check` prints a note when
      it is missing.
- [ ] Decide the chat mode: `off` (default without a key), `demo` (simulated, free) or `live`.
- [ ] For the live chat: an LLM API key **and a hard budget or usage limit set in the provider's dashboard**,
      plus an Upstash Redis database for rate limits.
- [ ] Optional: Resend for the contact form, Vercel Web Analytics.

Pages are generated at build time, so the chat mode shown in the interface is fixed when you build. After
changing `CHAT_MODE` or `LLM_API_KEY`, rebuild or redeploy.

## Vercel

1. Push the repository to GitHub, GitLab or Bitbucket and import it in Vercel. The framework (Next.js) and the
   package manager (pnpm, from `packageManager` in `package.json`) are detected automatically.
2. Add the environment variables you need (Project → Settings → Environment Variables). Mark API keys and
   tokens as sensitive.
3. Deploy. `pnpm build` runs the content check before `next build`; a content error stops the deployment.

Notes:

- Without `NEXT_PUBLIC_SITE_URL`, the site uses Vercel's production domain (or the deployment URL for
  previews).
- `/api/chat` declares `maxDuration = 30`; the provider timeout defaults to 25 s so a timeout can still be
  reported to the visitor.
- Set `ENABLE_VERCEL_ANALYTICS=true` and enable Web Analytics in the dashboard if you want it.
- Check Vercel's plans and terms. The Hobby plan is for personal, non-commercial projects; a portfolio that
  sells services may need a paid plan.

## Self-hosting

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start            # listens on port 3000; set PORT to change it
```

- Put the app behind a reverse proxy that terminates HTTPS. Per-visitor limits need the real client IP: either the
  proxy **overwrites** `X-Forwarded-For`, or you set `RATE_LIMIT_IP_HEADER` to a header the proxy sets and visitors
  cannot (`x-real-ip` on an nginx you configured, `cf-connecting-ip` behind Cloudflare, `fly-client-ip` on Fly.io).
  Proxies that append to `X-Forwarded-For` leave its first entry under the visitor's control. IPv6 visitors are
  grouped per /64 network.
- With a single long-running Node.js process, `CHAT_RATE_LIMIT_STORE=memory` is a real limit for that process.
  With several processes or containers, use Upstash.
- Consider adding `Strict-Transport-Security` at the proxy (Vercel adds it for you).
- **Building images without secrets** (common with Docker): the interface decides whether to show the chat at
  build time. Build with `CHAT_MODE=live` and provide `LLM_API_KEY` and the Upstash variables at runtime; the
  API checks the real configuration on every request and returns "assistant unavailable" if something is
  missing.

## Rate limits and cost protection

| Variable | Default | What it limits |
|---|---|---|
| `RATE_LIMIT_RPM` | 10 | Chat requests per visitor IP per minute |
| `CHAT_CONVERSATION_QUOTA_LIMIT` / `…_WINDOW_SECONDS` | 12 / 600 | Messages per conversation per window |
| `CHAT_SOFT_TOKEN_BUDGET_PER_MINUTE` | 32000 | Estimated tokens of model requests per visitor IP per minute (0 = off) |
| `CHAT_IP_DAILY_REQUEST_LIMIT` | 50 | Model requests per visitor IP per UTC day (0 = off) |
| `CHAT_DAILY_REQUEST_LIMIT` | 300 | Model requests per UTC day for the whole site (0 = off) |
| `CHAT_MAX_TOKENS` | 700 | Maximum answer length (and cost) per request |
| `CHAT_MAX_TRANSCRIPT_MESSAGES` | 20 | Messages before a visitor must start a new conversation |
| `CONTACT_RATE_LIMIT_MAX` / `…_WINDOW_SECONDS` | 5 / 3600 | Contact-form messages per visitor IP |

The per-minute and per-conversation limits count every chat request; the token budget and the two daily limits
count only requests that call the model (demo replies and the fixed "I can't do that" reply don't). Every limit is
checked before anything is counted, so a request that is turned away uses up no quota.

Where the counters live:

- **Upstash** (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`): shared by every server instance. Use it
  for any public site with the live chat. Several sites can share one database with different
  `RATE_LIMIT_KEY_PREFIX` values.
- **Memory**: counters inside one server process. Per-visitor keys are capped (the least recently used go first);
  site-wide counters such as the daily cap are never evicted. On serverless or multi-instance hosting each
  instance counts separately, so this is **not a global limit**. It is the default in development and in demo mode; in
  production the live chat stays off unless Upstash is configured or you set `CHAT_RATE_LIMIT_STORE=memory`.

If the store fails, the chat fails closed (the visitor sees "assistant unavailable"); the contact form fails
open, so a genuine message is not lost (the honeypot still applies).

**These limits do not guarantee a spending cap.** They are estimates and per-identity counters: someone
rotating IP addresses, a misconfiguration or another use of the same API key can still generate cost. The
only real cap is the budget or usage limit you set at your LLM provider.

### Rough usage per question

With the bundled example profile, a question sends about 2,600 tokens of instructions and content (measured
with a 4-characters-per-token estimate; real tokenizers differ), plus up to about 2,800 tokens of earlier
turns, and receives at most `CHAT_MAX_TOKENS`. A larger profile costs more per question: `pnpm content:check`
prints the size of your content. Multiply by your provider's current prices; the daily cap bounds the number
of requests, not their price.

## Services

### LLM provider

Any OpenAI-compatible Chat Completions endpoint: set `LLM_BASE_URL`, `LLM_API_KEY` and `CHAT_MODEL`. For
OpenRouter, `OPENROUTER_HTTP_REFERER` and `OPENROUTER_X_TITLE` are optional attribution headers. Model
availability and prices change; pick a model from your provider's current list.

Newer OpenAI reasoning models reject `max_tokens` and custom temperatures: set
`CHAT_MAX_TOKENS_PARAM=max_completion_tokens`, `CHAT_TEMPERATURE=default` and a larger `CHAT_MAX_TOKENS` (their
hidden reasoning counts toward it). `CHAT_REQUEST_TIMEOUT_MS` is capped at 27 s because the chat route may run for
30 s; raise `maxDuration` in `src/app/api/chat/route.ts` (and the cap in `src/lib/ai/config.ts`) if you need more.
When the provider rejects a request, the server log shows the provider's error code and parameter (never its
message).

### Upstash Redis

Create a Redis database at [upstash.com](https://upstash.com), copy its REST URL and REST token into
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, and check the current plans and limits.

### Resend (contact form)

Create an API key at [resend.com](https://resend.com), verify a sending domain, and set `RESEND_API_KEY`,
`RESEND_TO_EMAIL` (your inbox, never shown to visitors) and `RESEND_FROM_EMAIL` (an address on the verified
domain). Without these variables the Contact page shows your email and links instead of a form.

## Security notes

- Secrets are read only on the server. Only `NEXT_PUBLIC_*` variables reach the browser.
- Responses include `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy`,
  and in production a static `Content-Security-Policy` (see `next.config.ts`): scripts, styles, fonts, images
  and connections only from your own origin, no plugins, no framing, forms only to your site. It allows inline
  scripts because Next.js inlines its bootstrap code; a strict nonce-based policy would make every page
  dynamic (see the Next.js CSP guide). If you add a third-party script, font, image host or API, add its
  origin to the matching directive.
- Logs are structured JSON without message text, prompts, provider bodies, raw IPs or keys.
- The assistant has no tools, its output is rendered without HTML, and its links are limited to your pages and
  the URLs in your content.
