# Phase 4: `@app/platform` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Use `test-driven-development` for every behavior change.

**Goal:** Build the platform abstraction layer for browser/PWA/Electron capabilities.

**Architecture:** `@app/platform` defines shared contracts and renderer-safe adapters. `apps/desktop` implements Electron main/preload IPC and the desktop-local Express service. Feature packages must call `@app/platform`, not browser globals, Electron, Node, or local service URLs.

**Tech Stack:** TypeScript, Vitest, Electron IPC, Express, `@app/shared` `AppResult`.

---

## Recommended Skills

- `using-superpowers`
- `subagent-driven-development` or `executing-plans`
- `test-driven-development`
- `electron`
- `nodejs-backend-patterns`
- `vitest`
- `frontend-architecture`
- `verification-before-completion`
- `oxlint`

## Task 1: Package Dependencies And Test Setup

**Files:**

- Modify `packages/platform/package.json`
- Modify `apps/desktop/package.json`
- Create `apps/desktop/vitest.config.ts`
- Modify `apps/desktop/tsconfig.json`
- Modify `apps/desktop/tsconfig.preload.json`
- Optionally modify root `vitest.config.ts` to include `apps/**/*.{test,spec}.{ts,tsx}`

**Work:**

- Add `@app/shared` as a workspace dependency to `@app/platform`.
- Add `@app/platform` as a dependency to `@app/desktop`.
- Add `express` to `@app/desktop`.
- Add `vitest` and `@types/express` to `@app/desktop` dev dependencies.
- Add `test` and `test:watch` scripts to `@app/desktop`.
- Exclude `src/**/*.test.ts` from desktop build tsconfigs so tests do not emit to `dist`.

**TDD command:**

- Run `pnpm --filter @app/platform test`; expected current smoke passes before edits.
- Run `pnpm --filter @app/desktop test`; expected failure before adding test config because the script does not exist.

## Task 2: Define Platform Types And Errors

**Files:**

- Create `packages/platform/src/types.ts`
- Create `packages/platform/src/errors.ts`
- Modify `packages/platform/src/index.ts`
- Replace `packages/platform/src/index.test.ts`

**Work:**

- Define runtime, capabilities, adapter interfaces, file options, diagnostics snapshot, install prompt state, secure storage API, and desktop bridge types.
- Use `AppResult`, `ok`, `err`, and `createAppError` from `@app/shared`.
- Add error helpers with codes such as `platform.unsupported`, `platform.invalid-url`, `platform.permission-denied`, `platform.io-failed`, and `platform.secure-storage-unavailable`.

**Tests:**

- `exports platform adapter types and package name`
- `creates unsupported errors without leaking causes in details`

**Verification:**

- `pnpm --filter @app/platform test`
- `pnpm --filter @app/platform typecheck`

## Task 3: Capability Detection

**Files:**

- Create `packages/platform/src/capabilities.ts`
- Create `packages/platform/src/capabilities.test.ts`
- Modify `packages/platform/src/index.ts`

**Work:**

- Implement `detectWebCapabilities(environment?)`.
- Implement `detectElectronCapabilities(input)`.
- Implement `createUnknownCapabilities(reason)`.
- Include capabilities for clipboard, file open/save, fullscreen, external links, protocol handler, install prompt, secure storage, diagnostics, local service, and SQLite runtime exposure.
- Use injected environment objects so tests do not depend on real browser globals.

**Tests:**

- Web with `navigator.clipboard`, `document.fullscreenEnabled`, `navigator.registerProtocolHandler`, and storage APIs reports supported capabilities.
- Web without browser APIs reports explicit unsupported capabilities.
- Electron capabilities preserve native file dialogs, native fullscreen, secure storage availability, diagnostics, protocol handoff, and local service support.
- Unknown runtime reports unsupported capabilities without throwing.

**Verification:**

- `pnpm --filter @app/platform test -- capabilities`
- `pnpm --filter @app/platform typecheck`

## Task 4: Web Adapter

**Files:**

- Create `packages/platform/src/web.ts`
- Create `packages/platform/src/web.test.ts`
- Modify `packages/platform/src/index.ts`

**Work:**

- Implement `createWebPlatformAdapter(environment?)`.
- Implement clipboard read/write via `navigator.clipboard` when available.
- Implement fullscreen via `document.documentElement.requestFullscreen` and `document.exitFullscreen`.
- Implement external link opening through injected `open` or `location.assign` fallback after URL validation.
- Implement `saveTextFile` with Blob/object URL/download-anchor fallback when DOM APIs exist.
- Implement `openTextFile` as unsupported with a clear message that UI must provide a browser file input.
- Implement manual protocol fallback: return no pending install URL and report browser protocol handler support if available.
- Implement install prompt state hooks for `beforeinstallprompt` when provided by environment.
- Implement secure storage as unsupported on web.

**Tests:**

- Clipboard calls injected browser clipboard methods.
- Fullscreen calls injected fullscreen methods.
- Invalid external URLs are rejected.
- Web file save uses injected download hooks.
- Web file open returns unsupported instead of creating hidden UI.
- Secure storage returns unsupported.

**Verification:**

- `pnpm --filter @app/platform test -- web`
- `pnpm --filter @app/platform typecheck`

## Task 5: Electron Renderer Adapter

**Files:**

- Create `packages/platform/src/electron.ts`
- Create `packages/platform/src/electron.test.ts`
- Modify `packages/platform/src/index.ts`

**Work:**

- Implement `createElectronPlatformAdapter(bridge: DesktopPlatformBridge)`.
- Do not import `electron`.
- Delegate each adapter method to the bridge.
- Normalize bridge exceptions into `AppResult` errors.
- Validate external URLs before bridge calls.
- Validate secure-storage keys before bridge calls.

**Tests:**

- Adapter reads capabilities from fake bridge.
- Adapter delegates clipboard, file, fullscreen, protocol, secure storage, diagnostics, and local service calls.
- Adapter rejects invalid URLs before calling bridge.
- Adapter converts thrown bridge errors into `AppResult` failures.

**Verification:**

- `pnpm --filter @app/platform test -- electron`
- `pnpm --filter @app/platform typecheck`

## Task 6: Desktop IPC Handlers

**Files:**

- Create `apps/desktop/src/main/platform-ipc.ts`
- Create `apps/desktop/src/main/platform-ipc.test.ts`
- Modify `apps/desktop/src/main/index.ts`

**Work:**

- Implement `registerPlatformIpc(deps)` using dependency injection for `ipcMain`, `BrowserWindow`, `dialog`, `clipboard`, `shell`, `app`, `safeStorage`, and filesystem helpers.
- Register the namespaced IPC channels from the spec.
- Implement file open/save with native dialogs and text-only file reads/writes.
- Implement fullscreen against the focused or main window.
- Implement external links with `http:` and `https:` only.
- Implement diagnostics snapshot with app version, Electron/Chrome/Node versions, platform, arch, userData path presence, local service status, and capability flags.
- Return serializable `AppResult` values.

**Tests:**

- Registers every expected IPC channel.
- Rejects unsafe external URL.
- Opens safe external URL through injected shell.
- Saves text only to selected path.
- Returns cancellation when dialog is cancelled.
- Fullscreen handlers call the injected window.
- Diagnostics snapshot omits secrets.

**Verification:**

- `pnpm --filter @app/desktop test -- platform-ipc`
- `pnpm --filter @app/desktop typecheck`

## Task 7: Secure Storage Backing

**Files:**

- Create `apps/desktop/src/main/secure-storage.ts`
- Create `apps/desktop/src/main/secure-storage.test.ts`
- Modify `apps/desktop/src/main/platform-ipc.ts`

**Work:**

- Implement secure storage using Electron `safeStorage` when encryption is available.
- Persist encrypted base64 values to `secure-storage.json` under `app.getPath('userData')`.
- Validate keys with `^[a-zA-Z0-9._:-]{1,120}$`.
- Do not expose key listing.
- Return unsupported when encryption is unavailable.
- Keep error messages generic and non-secret.

**Tests:**

- Stores and retrieves encrypted values with fake `safeStorage`.
- Deletes existing values.
- Rejects invalid keys.
- Returns unsupported when encryption is unavailable.
- Does not include secret values in errors.

**Verification:**

- `pnpm --filter @app/desktop test -- secure-storage`
- `pnpm --filter @app/desktop typecheck`

## Task 8: Protocol Handoff

**Files:**

- Create `apps/desktop/src/main/protocol-handoff.ts`
- Create `apps/desktop/src/main/protocol-handoff.test.ts`
- Modify `apps/desktop/src/main/index.ts`
- Modify `apps/desktop/src/main/platform-ipc.ts`

**Work:**

- Register `mangaverse` as the app protocol where supported.
- Capture macOS `open-url` events.
- Capture second-instance argv URLs for Windows/Linux.
- Accept only `mangaverse://install-extension?url=<encoded http/https URL>`.
- Store one pending install URL at a time for Phase 5 to consume.
- Expose pending install URL through `platform:protocol:get-pending-install-url`.
- Do not fetch, validate manifests, or install providers in Phase 4.

**Tests:**

- Accepts valid install-extension URLs.
- Rejects non-HTTP provider URLs.
- Rejects unrelated custom protocol URLs.
- Returns pending URL once without installing anything.

**Verification:**

- `pnpm --filter @app/desktop test -- protocol-handoff`
- `pnpm --filter @app/desktop typecheck`

## Task 9: Preload Bridge

**Files:**

- Modify `apps/desktop/src/preload/index.ts`
- Create `apps/desktop/src/preload/platform-bridge.ts`
- Create `apps/desktop/src/preload/global.d.ts`

**Work:**

- Expose only `window.mangaversePlatform`.
- Use `contextBridge.exposeInMainWorld`.
- Use `ipcRenderer.invoke` for each namespaced IPC method.
- Do not expose raw `ipcRenderer`, `process`, `shell`, `dialog`, filesystem, or arbitrary channel invocation.
- Remove or stop expanding the old generic `window.electron` bridge because no current consumers were found.

**Verification:**

- `pnpm --filter @app/desktop typecheck:preload`
- `pnpm --filter @app/desktop build`

## Task 10: Desktop Local Express Service

**Files:**

- Create `apps/desktop/src/main/local-service.ts`
- Create `apps/desktop/src/main/local-service.test.ts`
- Modify `apps/desktop/src/main/index.ts`
- Modify `apps/desktop/src/main/platform-ipc.ts`

**Work:**

- Create `createDesktopLocalService(deps)`.
- Bind only to `127.0.0.1` with port `0`.
- Implement `GET /health`.
- Implement `GET /diagnostics`.
- Implement JSON 404 for unknown routes.
- Add `start()` and `stop()` lifecycle methods.
- Start service during Electron bootstrap.
- Stop service on `before-quit` and `window-all-closed`.
- Expose service info through IPC, not a hardcoded URL.

**Tests:**

- Health endpoint returns `{ ok: true }`.
- Diagnostics endpoint returns injected diagnostics.
- Unknown route returns 404 JSON.
- Service binds to localhost.
- Stop closes the server.

**Verification:**

- `pnpm --filter @app/desktop test -- local-service`
- `pnpm --filter @app/desktop typecheck`

## Task 11: Wire Desktop Main Bootstrap

**Files:**

- Modify `apps/desktop/src/main/index.ts`

**Work:**

- Register protocol handoff before app ready where Electron requires it.
- Start local service after app ready.
- Register platform IPC before creating the window.
- Pass the current `BrowserWindow` getter into IPC handlers.
- Preserve renderer Nitro startup behavior.
- Preserve external window-open denial, but route external opening through validated platform helper if shared locally.
- Ensure cleanup kills Nitro and stops local service.

**Verification:**

- `pnpm --filter @app/desktop typecheck:main`
- `pnpm --filter @app/desktop build`

## Task 12: Public Exports And Contract Tests

**Files:**

- Modify `packages/platform/src/index.ts`
- Modify `packages/platform/src/index.test.ts`

**Work:**

- Export all public contracts and adapter factories.
- Keep internal helpers unexported unless another package needs them.
- Ensure no default export.
- Ensure no `index.ts` barrel folders are created under nested `src` directories beyond package entrypoint.

**Tests:**

- Public entry exports `PACKAGE_NAME`.
- Public entry exports `createWebPlatformAdapter`.
- Public entry exports `createElectronPlatformAdapter`.
- Public entry exports capability detection helpers.
- Public entry does not require browser or Electron globals at import time.

**Verification:**

- `pnpm --filter @app/platform test`
- `pnpm --filter @app/platform build`

## Task 13: Boundary Review

**Files:**

- Review only; fix violations if found.

**Checks:**

- No feature package imports `electron`.
- No feature package imports Node filesystem/path/process APIs.
- No feature package hardcodes localhost desktop service URLs.
- `@app/platform` does not import Electron.
- `apps/desktop/src/preload` exposes only the narrow bridge.
- `apps/desktop/src/main` is the only place using Electron native APIs.
- Desktop service validates routes and does not expose arbitrary filesystem access.

**Suggested searches:**

```bash
rg "from 'electron'|from \"electron\"" apps packages
rg "localhost|127\\.0\\.0\\.1" apps packages
rg "node:fs|node:path|node:process" packages
```

## Task 14: Final Verification

**Commands:**

```bash
pnpm --filter @app/platform test
pnpm --filter @app/platform typecheck
pnpm --filter @app/platform build
pnpm --filter @app/desktop test
pnpm --filter @app/desktop typecheck
pnpm --filter @app/desktop build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

**Completion Definition:**

Phase 4 is complete only when all commands pass, adapter contract tests cover web and Electron behavior, desktop-local service tests pass, and package boundary review finds no browser/Electron/Node leaks into feature packages.
