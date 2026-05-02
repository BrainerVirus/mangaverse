# AGENTS

This file is the operational guide for agentic coding tools working in this repo.

## Project Snapshot

- Framework: Expo SDK 54 + React Native 0.81 + Expo Router 6.
- Language: TypeScript (strict).
- Styling: NativeWind v5 (`nativewind` preview + `react-native-css`) with Tailwind v4.
- State: Zustand v5 (stores in `stores/`).
- Database: expo-sqlite (local) + optional Supabase (auth/cloud).
- Tests: Jest + jest-expo + @testing-library/react-native.
- Lint/format: ESLint (flat config via eslint-config-expo) + Prettier.

## Environment

Copy `.env.example` to `.env` and set:

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` — Supabase is optional; the app checks `isSupabaseConfigured` before using it.
- `EXPO_PUBLIC_EXTENSION_REPO` — URL to `extensions.json` manifest.
- `EXPO_PUBLIC_AUTO_INSTALL_MANGADEX` — auto-installs MangaDex extension on first launch.

The app entry point is `expo-router/entry` (set in `package.json` `main`).

## Install and Run

- Install deps: `npm install`
- Start dev server: `npm start`
- Clear cache: `npm run start:fresh`
- Android: `npm run android`
- iOS (macOS): `npm run ios`
- Web: `npm run web`

## Build / Lint / Test Commands

- Lint: `npm run lint`
- Lint (fix): `npm run lint:fix`
- Format: `npm run format`
- Format (check): `npm run format:check`
- Tests (no coverage): `npm test`
- Tests (watch): `npm run test:watch`
- Tests (focused watch): `npm run test:debug`
- Full test run w/ coverage: `npm run test:final`
- Update snapshots: `npm run update:snapshots`

### Single Test

Use npm script pass-through to Jest:

- By file: `npm test -- __tests__/HomeScreen-test.tsx`
- By test name: `npm test -- -t "Redirects to discover"`
- By file + name: `npm test -- __tests__/HomeScreen-test.tsx -t "Redirects to discover"`

## Extension System

Source scraping extensions live in `extensions/`. Each extension (e.g. `extensions/mangadex/index.ts`) is compiled to a CJS bundle via Rollup:

- Build extensions: `npm run extensions:build`
- Output goes to `extensions/dist/`
- Extensions are loaded at runtime from a remote URL, not bundled with the app.
- The manifest is `extensions/extensions.json`.

## Repo Layout

- `app/`: Expo Router screens and layouts (file-based routing).
- `components/`: Reusable UI components (`ui/`, `discover/`, `reader/` subdirs).
- `hooks/`: Custom React hooks.
- `lib/`: Shared utilities, constants, theme vars.
- `services/`: Data layer (auth/supabase, db, extensions manager, scraping).
- `stores/`: Zustand stores (auth, extensions, settings, etc.).
- `types/`: TypeScript type definitions.
- `extensions/`: Source scraping extensions + Rollup build config.
- `__tests__/`: Jest tests.
- `global.css`: Tailwind v4 config, NativeWind theme, custom utilities.

## Linting and Formatting Rules

Sources: `eslint.config.cjs`, `.prettierrc`, `.lintstagedrc`

**Prettier (`.prettierrc`)**:

- `printWidth: 150`
- `useTabs: true`, `tabWidth: 2`
- `semi: true`, `singleQuote: true`
- `trailingComma: "all"`, `arrowParens: "always"`
- `endOfLine: "lf"`
- JSON/MD/YAML/TOML override: spaces (not tabs)
- Plugins: `prettier-plugin-organize-imports`, `prettier-plugin-tailwindcss`
- NOTE: `.editorconfig` specifies spaces, but Prettier overrides for TS/TSX with tabs.

**Pre-commit** (husky + lint-staged):

- Targets: `app/`, `components/`, `constants/`, `hooks/`, `lib/`, `services/`, `stores/`, `types/`, `utils/`
- Runs `eslint --fix` then `prettier --write` on staged files.

## TypeScript and Path Aliases

Defined in both `tsconfig.json` and `babel.config.js` (module-resolver):

| Alias           | Path           |
| --------------- | -------------- |
| `@app/*`        | `app/*`        |
| `@assets/*`     | `assets/*`     |
| `@components/*` | `components/*` |
| `@constants/*`  | `constants/*`  |
| `@hooks/*`      | `hooks/*`      |
| `@lib/*`        | `lib/*`        |
| `@services/*`   | `services/*`   |
| `@stores/*`     | `stores/*`     |
| `@types/*`      | `types/*`      |

- Prefer absolute aliases over long relative paths.
- Keep side-effect imports (like `"../global.css"`) at top of file.

## React / Expo Router Conventions

- Screen files in `app/` must `export default` a component.
- Layout files are named `_layout.tsx`.
- Prefer function components and hooks.
- Use `className` with NativeWind for styling (see `global.css` for theme tokens and custom utilities like `text-preset-*`).
- The tabs layout uses `expo-router/unstable-native-tabs` (`NativeTabs` component).
- App root layout (`app/_layout.tsx`) initializes DB, Supabase auth, extensions, and wraps in theme context.

## Testing Conventions

- Use `@testing-library/react-native` render helpers.
- Prefer testing behavior, not internal implementation.
- Use `jest.mock` for Expo Router/navigation when needed.
- Tests live under `__tests__/`.

## Important Dependency Notes

- `nativewind` v5 preview: requires `react-native-css` v3. Both versions are pinned in `overrides`.
- `package.json` `overrides` field pins critical versions (`hermes-parser`, `metro-runtime`, `lightningcss`, etc.). Do not change these without understanding the NativeWind/Tailwind v4 integration.
- `zustand` v5 for state management — stores follow the `create(...)` pattern.
- `expo-sqlite` for local DB — initialized in `@services/db`.

## Git Hooks

- `husky` runs `lint-staged` on pre-commit (configured in `.lintstagedrc`).

## CI

- GitHub Actions (`.github/workflows/ci.yml`) triggers on push to `main` and all PRs.
- Runs lint + test on Node 24.13.0.
- Keep lint/test passing before finishing work.

## If You Add New Code

- Add tests for critical logic in `__tests__/`.
- Keep TS strictness happy (no `any` unless truly necessary).
- Follow formatting rules; run `npm run format` after changes.
- Respect existing Expo Router file structure.
- If adding a new path alias, update both `tsconfig.json` and `babel.config.js`.
