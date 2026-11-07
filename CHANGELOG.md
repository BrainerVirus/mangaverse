# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/). The desktop app's version is the `version` in
`apps/desktop/package.json`, and a release tag must equal it (`v0.0.2`).

## [Unreleased]

## [0.0.2] - Unreleased

Second unsigned preview. The app-flow audit fixes the Windows-reported navigation, reader,
Discover, settings and UI state-machine failures.

### Fixed

- Reader close returns to the origin list, and detail Back no longer reopens the reader.
- Reader settings persist by scope: a reset cannot be recreated by a delayed save, a title edit
  cannot rewrite a stale global row, and the reader and settings page serialize the same rows.
- Reader strip fit modes (width, height, contain, cover, original) are honoured, wide pages are
  reachable, and explicit shape/direction choices persist.
- Discover keeps a failed section visible with its own Retry, preserves loaded results when a
  later page fails, bounds 429/timeout waits, recovers from a failed settings read, and classifies
  TLS/DNS/refused/reset failures instead of collapsing them into an unknown error.
- MangaDex stops before the 10,000-result window and keeps Latest/Popular distinct; Default sort
  now orders search results.
- Search query/filters and Library filter/sort/layout survive Back and reload; the main column
  restores its scroll position.
- Migrate from a title carries that title's id and source; an unmapped title is disabled with an
  explanation instead of an enabled no-op.
- Long Select lists keep their last options reachable; bulk status is disabled with no selection.

### Known limitations

- Not code-signed or notarized: macOS Gatekeeper and Windows SmartScreen warn on first launch.
- No auto-update. Install a newer release by hand.
- Windows and Linux installers are built in CI but their install-and-launch proof is manual.
- Multi-window concurrent settings writes and quit-before-flush durability remain unverified.

## [0.0.1] - Unreleased

First installable build of the Electron desktop app: an **unsigned early preview**, published as
a GitHub pre-release. See [`docs/release.md`](docs/release.md) for install notes and how to
open an unsigned app.

### Added

- Desktop installers: macOS Apple Silicon (`.dmg`, `.zip`), Windows x64 (NSIS `.exe`), Linux
  x64 (`.AppImage`, `.deb`). There is no macOS Intel build.
- Local-first library, reader and MangaDex provider running entirely on the device: native
  SQLite in a data process, pages cached as files and served over `page://`, the app UI served
  over `app://` with no open network port.
- App icon, `mangaverse://` deep-link registration, and a release pipeline that publishes
  `SHA256SUMS` and a build-provenance attestation next to the installers.

### Security

- Navigation is limited to the app origin (links to http and https open in the system browser;
  `<webview>` is refused) and browser permissions are denied except the reader's fullscreen and
  a sanitized clipboard write from the app itself.
- Packaged builds flip the Electron fuses `runAsNode`, `NODE_OPTIONS` and `--inspect` off and
  enable embedded ASAR integrity validation and load-from-asar only.

### Known limitations

- Not code-signed or notarized: macOS Gatekeeper and Windows SmartScreen warn on first launch.
- No auto-update. Install a newer release by hand.
- Windows and Linux installers are built in CI but their install-and-launch proof is manual.
