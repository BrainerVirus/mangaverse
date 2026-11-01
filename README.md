# MangaVerse

[![CI](https://github.com/BrainerVirus/mangaverse/actions/workflows/ci.yml/badge.svg)](https://github.com/BrainerVirus/mangaverse/actions/workflows/ci.yml)

A local-first manga, comic and webtoon reader. The Electron desktop app is being built first as the complete product; an invite-only website follows. Your library, reading progress and settings live on your device, with optional sync of metadata between devices planned. MangaDex is the first built-in source; a provider SDK and extension packages make more possible.

## Status

Early development, in the middle of an overhaul. The current web app works end-to-end locally on a `localhost` origin:

- onboarding → provider search and discover → library → reader
- reader: single, double and webtoon modes; zoom and pan; keyboard, wheel and tap navigation; resume after reload; cached chapters reopen offline
- multi-tab: concurrent tabs converge without a lockout screen

Work now follows [the overhaul roadmap](docs/overhaul/roadmap.md), starting with a foundation milestone and then the Electron runtime.

## Stack

- **App**: React 19 + [TanStack Start](https://tanstack.com/start) (Router, Query) on Vite; Zustand for local UI state
- **Data**: SQLite (sql.js/WASM) with Drizzle ORM; IndexedDB-backed durable storage with multi-tab convergence
- **UI**: shadcn/ui through `@app/design-system`; GSAP through `@app/motion`
- **Providers**: `@app/extensions-sdk` contract + `@app/extensions-mangadex`; community extensions stay separate from the app shell
- **Tooling**: TypeScript, pnpm workspaces, Turborepo, Vitest, Playwright (production E2E), oxlint

## Getting started

```sh
pnpm install
pnpm dev          # web app on http://localhost:5173
```

Canonical commands:

| Command                                                                 | What it does                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| `pnpm dev` (`dev:web`, `dev:desktop`)                                   | dev servers                                      |
| `pnpm lint` / `pnpm lint:fix`                                           | oxlint                                           |
| `pnpm format` / `pnpm format:check`                                     | apply / verify autofixes                         |
| `pnpm typecheck`                                                        | turbo typecheck                                  |
| `pnpm test`                                                             | Vitest suites                                    |
| `pnpm build` (`--filter @app/web build`, `--filter @app/desktop build`) | production builds                                |
| `pnpm test:e2e:production`                                              | Playwright against the built web app (port 5185) |
| `pnpm clean`                                                            | remove build outputs                             |

## Repository layout

```txt
apps/
  web/                 TanStack Start web app
  desktop/             Electron app (first priority)
packages/
  reader/              reader engine, screen and pure helpers
  extensions-core/     provider runtime and resolution
  extensions-sdk/      provider contract
  extensions-mangadex/ built-in MangaDex provider
  db/                  SQLite schema, repositories, durable storage
  design-system/       shadcn/ui wrappers, reader chrome
  motion/              GSAP helpers
  library/ search/ migration/ settings/ theme/ platform/ shared/
docs/                  overhaul/, SPEC, ARCHITECTURE, Design
```

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — product spec
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — package boundaries and data flow
- [`docs/Design.md`](docs/Design.md) — design system and motion rules
- [`docs/overhaul/`](docs/overhaul/) — the current specs, roadmap and handoff
