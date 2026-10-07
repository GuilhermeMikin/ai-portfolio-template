# Changelog

All notable changes to this template are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The public interface is the content schema
(`src/content/schema.ts`) and the environment variables: a breaking change to either means a new major version.

## [Unreleased]

### Added

- `.nvmrc` with Node.js 24, the active LTS release tested in CI.
- A "Questions and feedback" link in the issue chooser and the README, pointing to the author's contact page.

### Changed

- The README says the live demo uses a real model (rate-limited), and how to see the assistant without an API
  key on a copy made with the "Deploy with Vercel" button (`CHAT_MODE=demo`).
- `pnpm install` no longer warns about ignored build scripts: `pnpm.ignoredBuiltDependencies` in `package.json`
  records that esbuild and unrs-resolver don't need theirs. No build scripts are allowed.

### Fixed

- Setup instructions for Node.js 25 and newer, which no longer bundle Corepack: install it with
  `npm install --global corepack@latest` before `corepack enable`.
- Demo mode is set in `.env.local` in every guide; `CHAT_MODE=demo pnpm dev` fails in the Windows command
  prompt and PowerShell.

### Security

- `postcss-selector-parser`, which Tailwind CSS 3 uses at build time, is forced to 7.1.6 or newer through
  `pnpm.overrides` in `package.json`, fixing
  [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) (quadratic selector parsing). The
  generated CSS is unchanged.

## [1.0.0] - 2026-10-05

First public version, extracted from the author's personal portfolio and turned into a reusable template.

### Added

- Typed, validated content model in `src/content/` shared by the pages and the AI assistant, with a fictional
  example profile and `pnpm content:check`.
- Chat modes `live`, `demo` and `off`; the chat is off without an API key.
- Shared rate-limit store (Upstash, or in-memory for development), site-wide daily cap, request size limits,
  abort on client disconnect and an output safety cap.
- Monochrome design with light and dark themes: a sun/moon toggle in the header that follows the system
  setting until the visitor chooses, remembers the choice and applies it before the first paint.
- English and Brazilian Portuguese content. Visitors land in their saved or browser language; the header
  switcher remembers the choice in a cookie.
- A featured assistant card on the home page, an "Ask AI" button on every page and floating links to the
  social profiles and email.
- Generated Open Graph image, icons and web manifest; JSON-LD from the content.
- Vitest test suite, `pnpm typecheck`, and `pnpm eval` for model-quality evaluation.
- README, AGENTS.md and guides for customization, deployment and architecture.
- GitHub Actions CI running every check on Node 22 and 24, on pushes to `main` and on pull requests, with
  Dependabot keeping the actions current; a "Deploy with Vercel" button; CONTRIBUTING.md and SECURITY.md, with a
  checklist for running the public chat endpoint safely. Node.js 22 or newer is required (Node 20 is end-of-life).
- `pnpm content:check` warns when a real profile still contains the demo's links, their labels, the FAQ or
  instructions about the template author (mikin.ai, the author's LinkedIn, "Guilherme (Mikin)", the template
  repository).
- While the example profile is active, a slim banner above the header says the site is an open-source demo
  with a fictional profile and links to the source code. The example's GitHub, LinkedIn and website links lead
  to the template and its author, are labelled as such and are left out of the JSON-LD.
- The chat says what happens to messages in each mode: in `live` mode they go to the configured AI provider,
  in `demo` mode to no model, and the app saves no transcripts in either.
- Issue forms for bug reports and feature requests, a pull request template and a Code of Conduct
  (Contributor Covenant 2.1).

[Unreleased]: https://github.com/GuilhermeMikin/ai-portfolio-template/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/GuilhermeMikin/ai-portfolio-template/releases/tag/v1.0.0
