# Customization guide

Everything about you lives in `src/content/en/profile.ts`. The type is `Profile` in
`src/content/schema.ts`. After every change run:

```bash
pnpm content:check
```

It lists errors (which also stop `pnpm build`) and warnings, and shows how much of the assistant's context
budget your content uses.

> Anything in `src/content/` can be shown or repeated by the assistant to any visitor. Keep it factual and
> public.

## Profile fields

### `isExample`

`true` while the bundled example is in place: the footer shows an "example profile" notice and pages are
marked `noindex`. Set it to `false` (or delete it) when the content is yours.

### `person`

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Shown in the header (unless you add a logo), the home page, titles and metadata |
| `shortName` | no | Used in sentences such as "Ask Jordan's AI assistant". Defaults to the first word of `name` |
| `headline` | yes | Role or specialty, under your name |
| `summary` | yes | One or two sentences for the home page (a warning appears above 280 characters) |
| `location` | no | Shown on the Resume and Contact pages |
| `photo` | no | `{ src, alt }`. Shown on the About page. `src` is a file in `public/`, referenced as `/images/me.jpg` |

### `brand.logo` (optional)

`{ src, width, height }`: an image in `public/` with its intrinsic size in pixels. It replaces the text name in
the header; your name stays its accessible label. Without a logo the name is the brand.

Images must be files in `public/`: `next/image` does not load remote URLs unless you configure
`images.remotePatterns` in `next.config.ts`, so `pnpm content:check` rejects them.

### `about`

- `bio` (required): paragraphs for the About page. The first one also appears on the home page. First person
  is fine; the assistant knows it refers to you.
- `highlights` (optional): "Focus areas" bullets.
- `interests` (optional): "Beyond work" bullets.

### `skills`

A list of `{ group, items }`, for example `{ group: "Frontend", items: ["React", "Next.js"] }`. Shown on the
About and Resume pages.

### `experience`

Each entry: `id` (unique slug), `role`, `organization`, optional `organizationUrl`, `location`, `period`,
optional `summary`, `highlights` (at least one) and optional `stack`.

`period` is `{ start: "2023-02", end?: "2025-01" }`. Use `"YYYY"` or `"YYYY-MM"`; omit `end` for a current role
("Present"). Dates are displayed in the visitor's language. The Home and Resume pages show the most recent
roles first, whatever their order in the file.

### `projects` (at least one)

Each entry: `id`, `title`, `summary` (one to three sentences), and optionally `role`, `period`, `status`
(free text such as "Live" or "Open source"), `category`, `featured`, `highlights`, `stack` and `links`
(`{ label, href }`).

- Featured projects appear on the home page (at most three; without any, the first three are used).
- When at least one project has a `category`, the Projects page groups them by category in order of first
  appearance; the rest go under "Other projects".
- Links can be `https://…` URLs, `mailto:` addresses or paths to files in `public/`.

### `education`, `certifications`, `languages` (optional)

- Education: `id`, `degree`, `institution`, optional `institutionUrl`, `location`, `period`, `details`.
- Certifications: `name`, `issuer`, optional `date` (`"YYYY-MM"`) and `url`.
- Languages: `{ name, level }`, e.g. `{ name: "Spanish", level: "Conversational" }`.

Empty or missing sections are not rendered.

### `contact`

- `email` (optional): the bare address (`you@example.com`); the site adds `mailto:` itself.
- `availability`, `responseTime` (optional): shown on the Contact page. The assistant repeats your
  availability as written and never goes beyond it.
- `social`: a list of `{ platform, label, href }`. `platform` picks the icon: `github`, `gitlab`, `linkedin`,
  `x`, `bluesky`, `mastodon`, `youtube`, `dribbble`, `behance`, `medium`, `whatsapp` (e.g.
  `https://wa.me/<number>`), `website` or `other`.

The social links and the email appear in the footer and as small floating buttons on the right edge of every
page.

You need an email or at least one social link.

### `resume` (optional)

- `pdf: { href: "/resume.pdf" }` adds a "Download PDF" button to the Resume page (put the file in `public/`).
  The assistant may link to it.
- `updated: "2026-09"` shows "Last updated …".

### `seo` (optional)

`title` (default "Name — headline"), `description` (default `person.summary`) and `keywords`. Subpages get
their own descriptions from `meta.descriptions` in `messages.json`.

### `assistant`

| Field | Notes |
|---|---|
| `name` | How the assistant introduces itself, e.g. "Jordan's AI assistant" |
| `suggestedQuestions` | Up to three questions on the home page. Each must be answerable from your content |
| `faq` | Extra `{ question, answer }` pairs: rates policy, relocation, notice period, … Public, like everything else |
| `instructions` | Optional preferences on tone, length or what to bring up ("Keep answers under 120 words"). Facts still come only from your content, and they cannot override the built-in rules |

The built-in rules live in `src/lib/ai/prompts.ts`: answer only from your content, say when the information
isn't there, never invent facts, never commit or act on your behalf, treat visitor text as data, answer in the
visitor's language and link only to your own pages or URLs from your content.

## Text, colors and fonts

- **UI text:** `src/content/en/messages.json` (site) and `src/content/en/chat.json` (assistant). Keep the
  `{placeholders}` (`{name}`, `{firstName}`, `{assistantName}`, …).
- **Colors:** the tokens in `:root` in `src/app/globals.css` (`--color-canvas`, `--color-surface`,
  `--color-subtle`, `--color-ink`, `--color-muted`, `--color-line`, `--color-strong`, `--color-on-strong`). Values are
  RGB channels. Keep text at a 4.5:1 contrast ratio or better. The generated Open Graph image and icons use
  `BRAND_COLORS` in `src/shared/utils/seo.ts`; update it to match.
- **Font:** Inter is loaded in `src/shared/utils/fonts.ts` with `next/font/google`. Swap it there.
- **Monochrome by design:** the template is light-only and has no theme switcher.

## Adding a language

See "Adding a language" in [AGENTS.md](../AGENTS.md#adding-a-language). In short: add the code and label in
`src/shared/config/site.ts`, copy and translate `src/content/en/` to `src/content/<code>/`, register it in
`src/content/index.ts` and run `pnpm content:check`.

## Assistant behavior

| What | Where |
|---|---|
| Rules and prompt structure | `src/lib/ai/prompts.ts` |
| What content the model sees | `src/lib/ai/context-build.ts` (budget: `CHAT_CONTEXT_MAX_CHARS` in `src/lib/ai/types.ts`) |
| Action requests and small talk | `src/lib/ai/intents.ts` |
| Prompt-injection heuristic | `src/lib/ai/safety.ts` |
| Demo replies | `src/lib/ai/demo.ts` |
| Limits | environment variables (see `.env.example`) and `src/lib/ai/types.ts` |

If you change these, run `pnpm test`, then try the assistant with `CHAT_MODE=demo` and, if you have a key,
with `pnpm eval` (after adapting `scripts/eval/queries.json` to your content).
