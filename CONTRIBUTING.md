# Contributing

Thanks for helping improve the AI Portfolio Template. Bug reports, documentation fixes, translations and focused
improvements are all welcome.

## Before you start

- **Open an issue first** for anything larger than a small fix, so we can agree on the approach before you
  spend time on it.
- **Keep the scope.** This is a one-owner portfolio with an optional assistant that answers from the site's
  content. Proposals for databases, CMSs, authentication, retrieval (RAG), agents with tools or new paid
  services are usually out of scope. The README's "Technical decisions" section explains why.
- **Security problems** go through [SECURITY.md](SECURITY.md), not public issues.

## Setup

You need Node.js 22 or newer and pnpm (run `corepack enable` once if `pnpm` is missing).

```bash
pnpm install
pnpm dev                    # http://localhost:3000, chat off without a key
CHAT_MODE=demo pnpm dev     # simulated chat replies, no API key and no cost
```

The live chat needs your own `LLM_API_KEY` in `.env.local` (see `.env.example`). Never commit keys.

## Checks

Run these before opening a pull request. GitHub Actions runs the same ones on every pull request
(`.github/workflows/ci.yml`), and they must pass:

```bash
pnpm content:check
pnpm lint
pnpm typecheck
pnpm test
pnpm tailwind:check
pnpm build
```

`pnpm eval` calls a real model and costs tokens. It is not part of CI; run it only on your own key if your change
affects the assistant's answers.

## Guidelines

The rules in [AGENTS.md](AGENTS.md) apply to people as well as AI assistants. The most important ones:

- **No invented facts and no private data** in content, prompts, tests or docs.
- **Secrets stay on the server:** only `NEXT_PUBLIC_*` variables reach the browser, and they never hold secrets.
- **Design:** use the color tokens, and check UI changes in the light and the dark theme, on a phone (320 px
  wide) and on desktop. Keep keyboard support, visible focus and labelled controls.
- **Languages:** UI text lives in `src/content/<locale>/messages.json` and `chat.json`. Change every locale
  together; `pnpm content:check` verifies that keys and `{placeholders}` match.
- **Tests** use the fixtures in `tests/fixtures/`, never the example profile, so they keep passing after an
  owner replaces it. The suite must never call a real model.
- **Dependencies:** add one only when it is clearly needed, with pnpm.
- **Style:** code comments and documentation in English, commit messages in
  [Conventional Commits](https://www.conventionalcommits.org/) (`fix: …`, `feat: …`, `docs: …`).

## Pull requests

- One topic per pull request, with a short description of what changed and why.
- Say how you tested it. For UI changes, add screenshots in both themes.
- Update the docs (README, `docs/`, AGENTS.md) and `CHANGELOG.md` when behavior or configuration changes.

## License

By contributing, you agree that your contributions are released under the project's [MIT License](LICENSE).
