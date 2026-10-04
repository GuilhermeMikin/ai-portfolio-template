# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub:
[Security → Report a vulnerability](https://github.com/GuilhermeMikin/ai-portfolio-template/security/advisories/new).
If that form is not available, contact the maintainer through [mikin.ai](https://mikin.ai) and ask for a
private channel, without sharing details publicly.

Please include the affected file or endpoint, steps to reproduce, the impact you expect, and the commit you
tested. Reports are handled on a best-effort basis: this is a small open-source project.

Only the latest `main` branch is supported; there are no maintained release branches.

### In scope

- Exposure of secrets (`LLM_API_KEY`, `UPSTASH_*`, `RESEND_*`) to the browser, the bundle, logs or the model.
- Script injection or unsafe links through the chat's rendering of model output.
- Ways around the rate limits, quotas or daily caps (beyond rotating IP addresses, which is a known limit),
  or around the request size and history limits.
- Abuse of the contact form endpoint (for example, sending mail to arbitrary recipients).
- Anything that lets a visitor make the server act beyond answering with text.

### Out of scope

- **Revealing the system prompt or the site's content.** Both are public by design: the prompt holds only the
  content already shown on the site, and the assistant has no tools.
- Wrong, off-topic or jailbroken answers that expose nothing private. Report them as regular issues if they
  show a reproducible weakness in the prompt rules.
- Spending within the limits you configured, and per-IP limits bypassed by rotating addresses (see below).
- Vulnerabilities in a deployment's own configuration, such as a key placed in a `NEXT_PUBLIC_*` variable.

## Running the public chat endpoint safely

`/api/chat` is public. Anyone can call it directly, not only through your site's chat panel, and every
answer from a live model is paid with your API key. The template limits and validates requests, but these
settings are your responsibility:

1. **Cap spending at the provider.** Set a hard monthly budget or usage limit in your LLM provider's dashboard;
   a prepaid balance with auto-recharge off is the most reliable cap. The site's limits slow abuse down but
   are estimates and per-identity counters, so **they do not guarantee a spending cap**.
2. **Use a dedicated, restricted key:** a separate provider project for the site, a key owned by a service
   account rather than a person where possible, permissions limited to chat completions, and an allow-list
   with only your chat model if the provider supports it.
3. **Keep secrets on the server.** `LLM_API_KEY`, `UPSTASH_*` and `RESEND_*` must never go in a `NEXT_PUBLIC_*`
   variable or in git. On Vercel, mark them as sensitive and set them only for Production, so preview
   deployments run with the chat off.
4. **Use Upstash for the rate limits.** In-memory counters live in one server process: on serverless or
   multi-instance hosting each instance counts separately, so they are not a global limit. In production the
   live chat stays off without Upstash unless you set `CHAT_RATE_LIMIT_STORE=memory` on purpose.
5. **Tune the limits** to your traffic and budget: `RATE_LIMIT_RPM`, `CHAT_IP_DAILY_REQUEST_LIMIT`,
   `CHAT_DAILY_REQUEST_LIMIT` (site-wide) and `CHAT_MAX_TOKENS`. Behind a proxy or CDN other than Vercel, set
   `RATE_LIMIT_IP_HEADER` so visitors are identified by their real IP. Details and defaults are in
   [docs/deployment.md](docs/deployment.md#rate-limits-and-cost-protection).
6. **Know the kill switch.** `CHAT_MODE=off` (or `demo`, which never calls a model) followed by a redeploy
   turns the live chat off. If you suspect a key leaked, revoke it at the provider and create a new one.
7. **Treat your content as public.** Everything in `src/content/` goes into the model's prompt and can be
   repeated to any visitor. Never put secrets, private contact details or internal notes there, including in
   `assistant.faq` and `assistant.instructions`.
8. **Keep logs clean if you change the code.** Server logs are structured JSON without message text, prompts,
   provider response bodies, raw IP addresses or keys.

Visitor messages and the conversation history are treated as untrusted data: they are validated and size
limited, screened by a prompt-injection heuristic, and wrapped as data in the prompt. That heuristic reduces
noise but is not a security boundary; the boundaries are that the model sees no secrets, has no tools, and that
its output is rendered without HTML and with links limited to your pages and the URLs in your content.
