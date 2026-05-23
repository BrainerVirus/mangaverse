# Phase 1: Monorepo Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the monorepo workspace, shared tooling, `apps/web` TanStack Start foundation, `apps/desktop` Electron shell, and all 14 package skeletons.

**Architecture:** pnpm workspaces with shared TypeScript strict config, oxlint for linting/formatting, Vitest for packages, path aliases through package exports. Legacy Expo/Tauri code remains untouched in the repo root.

**Tech Stack:** pnpm, TypeScript (strict), oxlint (lint + format), Vitest, TanStack Start, Vite, Electron.

---

## Context

The repo is at `/Users/cristhoferpincetti/Documents/projects/personal/mangaverse`. Current state:

- `pnpm-workspace.yaml`: does not exist
- `pnpm-lock.yaml`: does not exist (has `package-lock.json` from npm)
- `apps/web/`: exists but only has `dist/` and `node_modules/` — no source
- `apps/desktop/`: does not exist
- `packages/`: does not exist (no source packages yet)
- Root `package.json`: legacy Expo/Tauri scripts, not workspaces-aware
- Root `tsconfig.json`: extends `expo/tsconfig.base`, legacy path aliases
- ESLint: uses `eslint-config-expo/flat`
- Vitest: not configured at root

The plan creates new structure at `apps/web`, `apps/desktop`, and `packages/*` alongside the legacy root.

---

## Task 1: Workspace Setup

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json` (add workspace scripts, rename legacy commands)

### Step 1: Create `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Step 2: Rename legacy npm commands

Update root `package.json` scripts section — prefix legacy commands with `legacy:` so they remain callable but clearly marked:

- `"start"` → `"legacy:start"`
- `"start:fresh"` → `"legacy:start:fresh"`
- `"android"` → `"legacy:android"`
- `"ios"` → `"legacy:ios"`
- `"web"` → `"legacy:web"`
- `"web:export"` → `"legacy:web:export"`
- `"desktop:dev"` → `"legacy:desktop:dev"`
- `"desktop:build"` → `"legacy:desktop:build"`
- `"extensions:build"` → `"legacy:extensions:build"`

Add new orchestrator scripts:

```json
{
  "scripts": {
    "install": "pnpm install",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "format": "oxlint --format",
    "format:check": "oxlint --format --check-only",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "build": "turbo run build",
    "dev:web": "pnpm --filter @app/web dev",
    "dev:desktop": "pnpm --filter @app/desktop dev",
    "dev": "pnpm -r run dev",
    "clean": "turbo run clean"
  }
}
```

Also add `oxlint` as a root devDependency and remove the legacy eslint/prettier dependencies from root `package.json` `devDependencies`.

**Verification:** After this task, `pnpm install` should succeed and `pnpm ls` should show workspace packages (empty until later tasks).

---

## Task 2: Shared Tooling

**Files:**
- Create: `tsconfig.base.json`, `tsconfig.json` (root), `.oxlintrc.json`, `vitest.config.ts`, `.oxlintignore`
- Modify: `.gitignore` (ignore `node_modules` in apps/packages, `dist`, `.turbo`), legacy `eslint.config.cjs`, legacy `.prettierrc` (mark as legacy) and `prettier.config.mjs` removed

### Step 1: Create `tsconfig.base.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "dist", ".turbo"]
}
```

### Step 2: Create root `tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.base.json" },
    { "path": "./apps/web" },
    { "path": "./apps/desktop" },
    { "path": "./packages/shared" },
    { "path": "./packages/test-utils" },
    { "path": "./packages/reader" },
    { "path": "./packages/extensions-core" },
    { "path": "./packages/extensions-sdk" },
    { "path": "./packages/db" },
    { "path": "./packages/design-system" },
    { "path": "./packages/motion" },
    { "path": "./packages/library" },
    { "path": "./packages/search" },
    { "path": "./packages/migration" },
    { "path": "./packages/settings" },
    { "path": "./packages/theme" },
    { "path": "./packages/platform" }
  ]
}
```

### Step 3: Create `.oxlintrc.json`

```jsonc
{
  "$schema": "https://oxc.rs/schema.json",

  // Categories: high-signal only by default
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "pedantic": "off",
    "perf": "warn",
    "style": "off",
    "restriction": "off",
    "nursery": "warn"
  },

  // Plugins
  "plugins": ["typescript", "react", "jsx-a11y", "vitest"],

  // Rules
  "rules": {
    "typescript/consistent-type-imports": "error",
    "typescript/no-explicit-any": "warn",
    "react-hooks/exhaustive-deps": "warn",
    "no-console": "warn",
    "no-debugger": "error",
    "no-unused-vars": "error"
  },

  // Environment
  "env": {
    "browser": true,
    "node": true,
    "es2022": true
  },

  // File overrides
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
      "rules": {
        "no-console": "off",
        "no-unused-vars": "off"
      }
    },
    {
      "files": ["apps/web/src/routes/**", "apps/desktop/src/renderer/src/**"],
      "rules": {
        "no-console": "off"
      }
    }
  ],

  // Type-aware linting (requires tsconfig)
  "options": {
    "typeAware": true
  }
}
```

### Step 4: Create `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['packages/**/src/**/*.d.ts'],
    },
  },
});
```

### Step 5: Update `.oxlintignore`

```
node_modules
dist
.turbo
apps/web/dist
apps/desktop/dist
packages/*/dist
coverage
*.lock
pnpm-lock.yaml
legacy
.expo
src-tauri
```

### Step 6: Update `.gitignore`

Add/replace these entries in existing `.gitignore`:
```
# Dependencies
node_modules

# Build outputs
dist
.turbo
apps/web/dist
apps/desktop/dist
packages/*/dist

# Lock files
package-lock.json
pnpm-lock.yaml

# Test coverage
coverage
```

**Verification:** Run `pnpm build` (should succeed with no packages yet — just turbo routes), `pnpm lint` (no files yet), `pnpm typecheck` (no files yet), `pnpm test` (0 tests found).

---

## Task 3: Package Skeletons (14 packages)

**Files:**
- Create per-package: `package.json`, `tsconfig.json`, `src/index.ts`, `src/*.test.ts`

Create all 14 packages in parallel. Each package follows this pattern:

### Package structure template

**`packages/<name>/package.json`:**
```json
{
  "name": "@app/<name>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc && tsc --declaration"
  },
  "dependencies": {},
  "devDependencies": {
    "oxlint": "^0.16.0",
    "typescript": "^5.9.2",
    "vitest": "^3.0.0"
  }
}
```

### Package-specific notes

**`packages/shared`** — no special deps
**`packages/test-utils`** — exports `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`
**`packages/reader`** — no deps yet (deps come in later phases)
**`packages/extensions-core`** — no deps yet
**`packages/extensions-sdk`** — no deps yet
**`packages/db`** — add `drizzle-orm`, `better-sqlite3` (desktop), `@libsql/client` (web WASM)
**`packages/design-system`** — add `clsx`, `tailwind-merge`
**`packages/motion`** — add `gsap`
**`packages/library`** — no deps yet
**`packages/search`** — no deps yet
**`packages/migration`** — no deps yet
**`packages/settings`** — no deps yet
**`packages/theme`** — no deps yet
**`packages/platform`** — no deps yet

### Per-package `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

### Per-package `src/index.ts`

Each exports an empty or minimal stub. Example for `@app/shared`:

```ts
// @app/shared
export const PACKAGE_NAME = '@app/shared' as const;
```

**Verification:** After all packages created, `pnpm install` should resolve all, `pnpm typecheck` should pass for all packages, `pnpm test` should find and pass all smoke tests.

---

## Task 4: Web App Foundation (`apps/web`)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/app.tsx`, `apps/web/src/routes/_root.tsx`, `apps/web/src/routes/home.tsx`, `apps/web/src/router.tsx`

### `apps/web/package.json`

```json
{
  "name": "@app/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start",
    "typecheck": "tsc --noEmit",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "clean": "rm -rf .vinxi dist"
  },
  "dependencies": {
    "@app/design-system": "workspace:*",
    "@app/motion": "workspace:*",
    "@app/platform": "workspace:*",
    "@app/shared": "workspace:*",
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/start": "^1.0.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "vinxi": "^0.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "typescript": "^5.9.2",
    "vite": "^6.0.0"
  }
}
```

### `apps/web/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "module": "ESNext",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/"],
  "exclude": ["dist", "node_modules", ".vinxi"]
}
```

### `apps/web/vite.config.ts`

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '~': '/src',
    },
  },
});
```

### `apps/web/app.config.ts`

```ts
import { createAppConfig } from '@tanstack/start/config';

export default createAppConfig({
  extensions: ['/src/routes/**/*.tsx'],
});
```

### `apps/web/src/app.tsx`

```tsx
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

export function App() {
  return <RouterProvider router={router} />;
}
```

### `apps/web/src/router.tsx`

```tsx
import { createRouter, createRootRoute, createRoute, createRouterHistory } from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: () => (
    <div>
      <h1>MangaVerse</h1>
      <p>Phase 1 — Monorepo Foundation</p>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Home() {
    return (
      <div>
        <h2>Welcome</h2>
      </div>
    );
  },
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  history: createRouterHistory(typeof document !== 'undefined' ? window.location.href : '/'),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

### `apps/web/src/global.css`

Minimal CSS:
```css
*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### `apps/web/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MangaVerse</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### `apps/web/src/main.ts`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './global.css';

const root = document.getElementById('app');
if (!root) throw new Error('No #app element found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Verification:** `pnpm --filter @app/web build` should succeed and produce a `dist/` directory with built assets.

---

## Task 5: Desktop App Foundation (`apps/desktop`)

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/renderer/index.html`, `apps/desktop/src/renderer/src/main.tsx`, `apps/desktop/src/renderer/src/App.tsx`, `apps/desktop/electron-builder.json`

### `apps/desktop/package.json`

```json
{
  "name": "@app/desktop",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "build": "node scripts/build.mjs",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "clean": "rm -rf dist out"
  },
  "dependencies": {
    "electron": "^34.0.0",
    "electron-builder": "^25.0.0"
  },
  "devDependencies": {
    "@app/web": "workspace:*",
    "@types/node": "^22.0.0",
    "typescript": "^5.9.2"
  }
}
```

### `apps/desktop/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "target": "ES2022"
  },
  "include": ["src/"],
  "exclude": ["dist", "node_modules"]
}
```

### `apps/desktop/src/main/index.ts`

Minimal Electron main process:

```ts
import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    titleBarStyle: 'default',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the web app in development or built dist in production
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:3000';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Open external links in browser
mainWindow?.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: 'deny' };
});
```

### `apps/desktop/src/preload/index.ts`

```ts
import { contextBridge } from 'electron';

// Expose minimal, safe APIs to renderer
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

export {};
```

### `apps/desktop/src/renderer/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" />
    <title>MangaVerse — Desktop</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

### `apps/desktop/src/renderer/src/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('app');
if (!root) throw new Error('No #app element found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### `apps/desktop/src/renderer/src/App.tsx`

```tsx
export function App() {
  return (
    <div>
      <h1>MangaVerse — Desktop</h1>
      <p>Phase 1 — Electron shell</p>
    </div>
  );
}
```

### `apps/desktop/electron-builder.json`

```json
{
  "appId": "com.mangaverse.app",
  "productName": "MangaVerse",
  "directories": {
    "output": "out"
  },
  "files": [
    "dist/**/*",
    "renderer/**/*"
  ],
  "mac": {
    "category": "public.app-category.entertainment",
    "target": ["dmg", "zip"]
  },
  "win": {
    "target": ["nsis", "portable"]
  },
  "linux": {
    "target": ["AppImage", "deb"]
  }
}
```

**Verification:** `pnpm --filter @app/desktop build` should produce something in `dist/`. Desktop app is smoke test — it doesn't need to fully run in CI.

---

## Task 6: Turborepo Config

**Files:**
- Create: `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Verification:** `pnpm build` should run all package builds via turbo.

---

## Task 7: CI / Documentation Update

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `AGENTS.md` (update `Existing Legacy Commands` section)

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, feat/**]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint, Typecheck, Test, Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

### Update `AGENTS.md` `Existing Legacy Commands` section

Update to show new canonical commands and mark legacy ones:

```markdown
## Existing Legacy Commands

Legacy Expo/Tauri commands (prefixed with `legacy:` to avoid accidental use):
- Legacy install: `npm install` (use `pnpm install`)
- Legacy start: `npm run legacy:start`
- Legacy web: `npm run legacy:web`
- Legacy desktop dev: `npm run legacy:desktop:dev`
- Legacy desktop build: `npm run legacy:desktop:build`
- Legacy lint: `npm run lint`
- Legacy tests: `npm test`

## New Canonical Commands

- Install deps: `pnpm install`
- Start web dev: `pnpm dev:web`
- Start desktop dev: `pnpm dev:desktop`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Build all: `pnpm build`
- Build web: `pnpm --filter @app/web build`
- Build desktop: `pnpm --filter @app/desktop build`
- Format: `pnpm format`
- Format check: `pnpm format:check`
```

**Verification:** After all tasks, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all should pass.

---

## Acceptance Criteria Checklist

After all tasks complete:

- [ ] `pnpm install` works without errors
- [ ] `apps/web` has a minimal TanStack Start route and `pnpm --filter @app/web build` succeeds
- [ ] `apps/desktop` has a minimal Electron shell and builds
- [ ] All 14 planned package folders exist, compile, and have smoke tests passing
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass
- [ ] `AGENTS.md` and `docs/PLAN.md` reflect the new canonical commands
- [ ] Legacy Expo code is not ported or rewritten
- [ ] Git status shows only Phase 1 files added/modified (no legacy feature code)

---

## File Map

```
Root changes:
  + pnpm-workspace.yaml
  + tsconfig.base.json
  + tsconfig.json (root references)
  + .oxlintrc.json
  + vitest.config.ts
  + turbo.json
  + .oxlintignore
  + .github/workflows/ci.yml
  M package.json (scripts renamed + new)
  M AGENTS.md (legacy commands documented)

apps/web/:
  + package.json
  + tsconfig.json
  + vite.config.ts
  + app.config.ts
  + index.html
  + src/app.tsx
  + src/router.tsx
  + src/main.tsx
  + src/global.css

apps/desktop/:
  + package.json
  + tsconfig.json
  + src/main/index.ts
  + src/preload/index.ts
  + src/renderer/index.html
  + src/renderer/src/main.tsx
  + src/renderer/src/App.tsx
  + electron-builder.json

packages/shared/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/test-utils/:
  + package.json
  + tsconfig.json
  + src/index.ts

packages/reader/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/extensions-core/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/extensions-sdk/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/db/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/design-system/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/motion/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/library/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/search/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/migration/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/settings/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/theme/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts

packages/platform/:
  + package.json
  + tsconfig.json
  + src/index.ts
  + src/index.test.ts
```
