# Changelog

All notable changes to this template are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First public version, extracted from the author's personal portfolio and turned into a reusable template.

### Added

- Typed, validated content model in `src/content/` shared by the pages and the AI assistant, with a fictional
  example profile and `pnpm content:check`.
- Chat modes `live`, `demo` and `off`; the chat is off without an API key.
- Shared rate-limit store (Upstash, or in-memory for development), site-wide daily cap, request size limits,
  abort on client disconnect and an output safety cap.
- Monochrome, light-only design with a featured assistant card on the home page, an "Ask AI" button on every
  page and floating links to the social profiles and email.
- Generated Open Graph image, icons and web manifest; JSON-LD from the content.
- Vitest test suite, `pnpm typecheck`, and `pnpm eval` for model-quality evaluation.
- README, AGENTS.md and guides for customization, deployment and architecture.
