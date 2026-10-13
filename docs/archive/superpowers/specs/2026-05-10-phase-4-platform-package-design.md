# Phase 4: `@app/platform` Platform Package Design Spec

**Date:** 2026-05-10
**Status:** Ready for implementation
**Approach:** Capability-first platform adapter boundary

## Summary

Build `@app/platform` as the only cross-platform capability boundary for browser, PWA, and Electron behavior. Feature packages must consume stable platform APIs instead of importing browser globals, Electron APIs, Node APIs, or desktop service URLs directly.

## Chosen Approach

Use a capability-first adapter model:

- `@app/platform` owns shared types, capability detection, web adapter, Electron renderer adapter, and adapter contract tests.
- `apps/desktop` owns Electron main/preload implementation, IPC handlers, custom protocol handoff, secure storage backing, native dialogs, native fullscreen, diagnostics, and desktop-local Express service startup.
- Web fallbacks are explicit and safe: manual URL install, browser download fallback, browser fullscreen, browser clipboard where available, unsupported secure storage, and PWA install-prompt detection.

## Alternatives Considered

1. **Capability-first adapter boundary (chosen):** Best fit because feature packages can branch on stable capabilities without knowing runtime details.
2. **Direct feature imports of Electron/browser APIs:** Rejected because it violates package boundaries and makes web/desktop behavior leak into features.
3. **Platform package owns Electron main process:** Rejected because Electron main/preload are app-shell responsibilities in `apps/desktop`; `@app/platform` should only define contracts and renderer-safe adapters.

## Goals

- Define stable `@app/platform` capability and adapter contracts.
- Implement web/PWA adapter fallbacks.
- Implement Electron renderer adapter against a narrow preload bridge.
- Implement Electron main IPC handlers and preload exposure in `apps/desktop`.
- Define and implement a desktop-local Express service boundary for health and diagnostics.
- Keep desktop-only capabilities discoverable through capability checks.
- Preserve Electron security: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, narrow preload API.

## Non-Goals

- Do not build provider install UI; Phase 5 owns extension install flows.
- Do not execute provider code.
- Do not implement full backup/restore UI.
- Do not import Electron or Node APIs from feature packages.
- Do not expose arbitrary file-system access.
- Do not add raw SQL or database repository logic to `@app/platform`.
- Do not implement cloud sync.

## Public API Contract

`@app/platform` should export:

- `PlatformRuntime = 'web' | 'pwa' | 'electron' | 'unknown'`
- `PlatformCapabilities`
- `PlatformAdapter`
- `PlatformFileOpenOptions`
- `PlatformFileSaveOptions`
- `PlatformFileResult`
- `PlatformDiagnosticsSnapshot`
- `DesktopPlatformBridge`
- `createWebPlatformAdapter(environment?)`
- `createElectronPlatformAdapter(bridge)`
- `createUnsupportedPlatformAdapter(reason)`
- `detectWebCapabilities(environment?)`
- `detectElectronCapabilities(bridgeCapabilities)`
- `isSafeExternalUrl(url)`
- `isExtensionInstallProtocolUrl(url)`

`PlatformAdapter` should expose stable grouped APIs:

- `capabilities(): Promise<AppResult<PlatformCapabilities>>`
- `clipboard.readText()` and `clipboard.writeText(text)`
- `files.openTextFile(options)` and `files.saveTextFile(options)`
- `fullscreen.enter()`, `fullscreen.exit()`, and `fullscreen.isActive()`
- `protocol.getPendingInstallUrl()` and `protocol.canHandleInstallLinks()`
- `externalLinks.open(url)`
- `installPrompt.getState()` and `installPrompt.prompt()`
- `secureStorage.get(key)`, `secureStorage.set(key, value)`, and `secureStorage.delete(key)`
- `diagnostics.getSnapshot()`

Use `AppResult` from `@app/shared` for recoverable failures.

## Electron Bridge Contract

Expose a single preload global:

```ts
window.mangaversePlatform
```

Do not keep or expand the old generic `window.electron` shape unless a current consumer requires it. Current search found no consumers.

IPC channels should be namespaced and narrow:

```ts
platform:capabilities:get
platform:clipboard:read-text
platform:clipboard:write-text
platform:file:open-text
platform:file:save-text
platform:fullscreen:enter
platform:fullscreen:exit
platform:fullscreen:is-active
platform:external-link:open
platform:protocol:get-pending-install-url
platform:secure-storage:get
platform:secure-storage:set
platform:secure-storage:delete
platform:diagnostics:get
platform:local-service:get-info
```

## Desktop Local Service Boundary

Use Express only inside `apps/desktop`.

The service must:

- Bind to `127.0.0.1` on an ephemeral port.
- Start during Electron bootstrap and stop on quit.
- Expose `GET /health`.
- Expose `GET /diagnostics`.
- Reject unknown routes with 404.
- Validate all inputs.
- Avoid arbitrary file reads/writes.
- Return JSON only.
- Be discoverable through platform IPC, not hardcoded renderer URLs.

## Security Requirements

- Keep `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.
- Validate external links and only allow `http:` and `https:`.
- Validate extension install protocol URLs but only hand them off; do not install extensions in Phase 4.
- Validate secure-storage keys with a strict allowlist pattern.
- Store secure values with Electron `safeStorage` when encryption is available.
- Never put secrets in logs, diagnostics details, or `AppError.details`.
- Do not expose broad Node, Electron, filesystem, process, or shell APIs to renderer code.

## Acceptance Criteria

- `@app/platform` no longer only exports `PACKAGE_NAME`; it exposes stable platform contracts and adapters.
- Web adapter returns explicit capabilities and safe fallback behavior.
- Electron renderer adapter works through `DesktopPlatformBridge`, not direct Electron imports.
- Electron preload exposes only `window.mangaversePlatform`.
- Electron main registers platform IPC handlers.
- Desktop local Express service is bound to localhost and has health/diagnostics endpoints.
- Feature packages can depend on `@app/platform` without knowing web vs desktop implementation details.
- Unit tests cover capability detection.
- Adapter contract tests cover mocked web and mocked Electron bridge behavior.
- Desktop service tests cover health, diagnostics, unknown routes, and shutdown.
- `pnpm --filter @app/platform test`, `typecheck`, and `build` pass.
- Root `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
