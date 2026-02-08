# AGENTS

This file is the operational guide for agentic coding tools working in this repo.

## Project Snapshot
- Framework: Expo + React Native + Expo Router.
- Language: TypeScript (strict).
- Styling: NativeWind + Tailwind v4 (className on RN components).
- Tests: Jest + @testing-library/react-native.
- Lint/format: ESLint (flat config) + Prettier (tabs, no semicolons).

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
- Update snapshots: `npm run update:snapshots`
- Full test run w/ coverage: `npm run test:final`

### Single Test (preferred)
Use npm script pass-through to Jest:
- By file: `npm test -- __tests__/HomeScreen-test.tsx`
- By test name: `npm test -- -t "Redirects to discover"`
- By file + name: `npm test -- __tests__/HomeScreen-test.tsx -t "Redirects to discover"`

## Repo Layout (common)
- `app/`: Expo Router screens and layouts.
- `components/`: Reusable UI components.
- `constants/`, `lib/`, `utils/`: Shared modules (not all exist yet).
- `__tests__/`: Jest tests.
- `global.css`: Tailwind + NativeWind imports.

## Linting and Formatting Rules
Sources:
- ESLint: `eslint.config.cjs`
- Prettier: `.prettierrc`
- Lint staged: `.lintstagedrc`

Key conventions:
- Tabs for indentation in TS/TSX (Prettier `useTabs: true`).
- Line width 100, no semicolons, double quotes.
- JSON/MD/YAML/TOML use spaces (Prettier override).
- Line endings: LF enforced by ESLint + Prettier.
- Imports are organized by `prettier-plugin-organize-imports`.
- Tailwind class ordering is handled by `prettier-plugin-tailwindcss`.

## TypeScript and Imports
- `tsconfig.json` uses `strict: true`.
- Prefer explicit types for public APIs and shared utilities.
- Path aliases:
  - `@app/*` -> `app/*`
  - `@assets/*` -> `assets/*`
  - `@components/*` -> `components/*`
  - `@constants/*` -> `constants/*`

Import guidance:
- Prefer absolute aliases over long relative paths when available.
- Keep side-effect imports (like `"../global.css"`) at top of file.
- Avoid unused imports; organize imports via Prettier.

## React / Expo Router Conventions
- Screen files in `app/` must `export default` a component.
- Layout files are named `_layout.tsx` and should remain lightweight.
- Prefer function components and hooks.
- Use `className` with NativeWind for styling (see `global.css`).
- Keep components pure; avoid work in render where possible.

## Testing Conventions
- Use `@testing-library/react-native` render helpers.
- Prefer testing behavior, not internal implementation.
- Use `jest.mock` for Expo Router/navigation when needed.
- Current tests live under `__tests__/`.

## Error Handling and Logging
- Prefer early returns and guard clauses.
- Use `try/catch` around async effects and service calls.
- Avoid swallowing errors; surface user-friendly messages and log details.
- Keep logs lightweight; remove debug logs before final PRs.

## Naming and File Conventions
- Component names: `PascalCase`.
- Hooks: `useSomething`.
- Test files: `*-test.tsx` in `__tests__/`.
- Route segments under `app/` are lowercase (Expo Router convention).

## Git Hooks (informational)
- `husky` runs `lint-staged` on pre-commit.
- Lint-staged targets TS/JS files under `app/`, `components/`, `constants/`,
  `lib/`, `utils/` and runs ESLint + Prettier.

## CI Notes
- README indicates GitHub Actions runs lint and tests on push/PR.
- Keep lint/test passing before finishing work.

## If You Add New Code
- Add tests for critical logic in `__tests__/`.
- Keep TS strictness happy (no `any` unless truly necessary).
- Follow formatting rules; run `npm run format` after changes.
- Respect existing Expo Router file structure.

## Cursor/Copilot Rules
- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md` found
  at the time this file was generated.
