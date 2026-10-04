# AGENTS.md

Guidance for AI coding assistants (Claude Code, Codex, Cursor, GitHub Copilot and others) working in this
repository. Humans are welcome to read it too.

## The project in one paragraph

A personal portfolio built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS 3, managed with
pnpm. One owner per deployment. All owner-specific data lives in `src/content/<locale>/profile.ts`, validated
by `src/content/schema.ts`. The pages and an optional AI assistant read that same content. The assistant puts
the whole profile in the model's system prompt; it is **not** RAG, has **no tools** and takes **no actions**.
Never describe it otherwise.

## Commands

```bash
pnpm install          # install (pnpm 10; run `corepack enable` first if pnpm is missing)
pnpm dev              # http://localhost:3000
pnpm content:check    # validate content and the assistant's context budget
pnpm lint             # ESLint
pnpm typecheck        # next typegen + tsc --noEmit
pnpm test             # Vitest; never calls a real model
pnpm tailwind:check   # opacity modifiers must be multiples of 5 or bracketed
pnpm build            # content:check + next build
pnpm eval             # model-quality evaluation against a running site; costs tokens, ask first
```

Do not run `pnpm eval` or anything else that calls a paid API unless the owner asks for it.

## Playbook: setting up someone's portfolio

1. **Collect the facts from the owner.** Ask for a CV or résumé, a LinkedIn export or similar text, the
   projects to show (with links), contact details (an email and/or profile links), current availability, and
   the languages the site should support. If something is missing or ambiguous, ask. Never fill gaps with
   plausible guesses: the assistant will repeat whatever the content says to every visitor.
2. **Write `src/content/en/profile.ts`,** then the same facts in `src/content/pt-br/profile.ts` (a faithful
   translation, never new claims), or remove Portuguese if the owner doesn't want it ("Languages" in
   `docs/customization.md`). Follow the types in `src/content/schema.ts` and the field guide in
   `docs/customization.md`.
   - Dates are `"YYYY"` or `"YYYY-MM"`; omit `end` for current roles.
   - `id`s are lowercase slugs and must be unique.
   - `person.summary` is one or two sentences; `about.bio` holds the longer story.
   - Mark at most three projects `featured`.
   - `assistant.suggestedQuestions`: at most three, each answerable from the content.
   - `assistant.faq`: only answers the owner has confirmed (rates, relocation, notice period, …). Drop the
     example's entries and instructions about this template and its author; they exist for the public demo.
   - Remove optional fields you have no data for instead of leaving placeholders; empty sections are hidden.
   - Set `isExample: false` (or remove it). While it is `true` the site shows an "example profile" notice and
     asks search engines not to index it.
3. **Assets (optional).** Put a portrait or logo under `public/images/` and reference it with a path starting
   with `/` (`person.photo` with an `alt` text; `brand.logo` with the image's intrinsic width and height).
   Remote image URLs are rejected. A résumé PDF goes in
   `public/` and is referenced from `resume.pdf.href`. Never reuse images you don't have rights to.
4. **Look and wording (optional).** Colors are CSS variables in `src/app/globals.css`: the light theme in
   `:root`, the dark theme in `:root[data-theme="dark"]` (mirror changes in `BRAND_COLORS` in
   `src/shared/utils/seo.ts`, used by generated images, and `THEME_COLORS` in `src/shared/config/theme.ts`).
   UI text is in `messages.json` (site) and `chat.json` (assistant) in each language folder.
5. **Validate.** Run `pnpm content:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`.
   Fix every error; read the warnings.
6. **Try the assistant.** `CHAT_MODE=demo pnpm dev` needs no key. For real answers the owner adds
   `LLM_API_KEY` (and optionally `LLM_BASE_URL`, `CHAT_MODEL`) to `.env.local` themselves. Never ask for, print
   or commit keys.
7. **Hand over the deployment checklist** from `docs/deployment.md`: `NEXT_PUBLIC_SITE_URL`, Upstash for rate
   limits, a hard budget at the LLM provider, optional Resend for the contact form.

## Rules

- **Facts:** never invent or embellish experience, employers, clients, titles, dates, numbers, skills,
  certifications, education, availability or rates — in content, prompts, tests or docs.
- **Privacy:** everything in `src/content/` is public. No secrets, home addresses, phone numbers or other
  private data unless the owner explicitly wants them published.
- **Secrets:** `LLM_API_KEY`, `UPSTASH_*` and `RESEND_*` are read only in server code (`src/lib/**`, route
  handlers, server components). Never import `src/lib/ai/config.ts` or `src/content/index.ts` into a
  `"use client"` file; pass the needed values as props. Only `NEXT_PUBLIC_*` variables may reach the browser,
  and they must never hold secrets.
- **Assistant behavior** is defined in `src/lib/ai/prompts.ts`. Owner preferences (tone, length, what to bring
  up) belong in `assistant.instructions` in the profile; they cannot override the built-in rules.
- **Design:** use the color tokens (`bg-canvas`, `bg-surface`, `bg-subtle`, `text-ink`, `text-muted`,
  `border-line`, `bg-strong`, `text-on-strong`) rather than raw colors so both themes work, check changes in
  the light and the dark theme, keep the monochrome look unless asked otherwise, keep visible focus styles,
  and keep opacity modifiers on the scale (`pnpm tailwind:check`).
- **Accessibility:** one `h1` per page, labelled controls, keyboard support, no autofocus, nothing that opens
  on page load, no horizontal scrolling at 320 px.
- **Tests** must not depend on the example profile; use fixtures, as the existing suites do, so they keep
  passing after the content is replaced.
- **Dependencies:** use pnpm; don't add packages unless they are clearly needed.

## Adding a language

1. Add the code to `SUPPORTED_LOCALES` and a label to `LOCALE_LABELS` in `src/shared/config/site.ts`
   (for example `"es"` and `"Español"`). Codes are lowercase. The first entry is the default locale.
2. Copy `src/content/en/` to `src/content/<code>/` and translate `profile.ts`, `messages.json` and `chat.json`.
   Keep keys and `{placeholders}` identical.
3. Register the new folder in `contentByLocale` in `src/content/index.ts`; TypeScript reports a missing entry.
4. Run `pnpm content:check`: it checks key and placeholder parity against the default locale.

The language switcher, `hreflang` tags and sitemap entries appear automatically. URL slugs stay the same in
every language (`/es/projects`). Visitors are sent to it automatically when it is their saved or browser
language.

**A site in another language only:** put that locale first in `SUPPORTED_LOCALES` (or replace `"en"`), rename
`src/content/en/` accordingly and update the imports and the `typeof en…` types in `src/content/index.ts`.

## Where things live

| Path | Contents |
|---|---|
| `src/content/` | Profile, UI text, schema/validator, formatting helpers |
| `src/app/[locale]/` | Pages, root layout for locale routes, Open Graph image |
| `src/app/api/chat`, `src/app/api/contact` | The two server endpoints |
| `src/lib/ai/` | Chat config, context builder, prompts, intents, guardrails, provider client, demo replies |
| `src/lib/rate-limit/` | Upstash and in-memory stores |
| `src/shared/components/` | UI components (chat widget, home assistant card, header, footer, …) |
| `src/shared/config/` | Locales and language negotiation, themes, canonical URL, on-site link allow-list |
| `src/proxy.ts` | Redirects `/about`, `/projects`, … to the visitor's language |
| `scripts/` | `check-content.ts`, `check-tailwind-classes.ts`, `eval/` |
| `tests/` | Vitest suites |
| `docs/` | Customization, deployment and architecture guides |

## Definition of done

`pnpm content:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all pass; the site works with
the chat off; no example data or placeholder text remains (unless the owner wants the demo); no secrets or
private data were added to the repository.
