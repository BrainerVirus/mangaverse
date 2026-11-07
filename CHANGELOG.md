# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/). The desktop app's version is the `version` in
`apps/desktop/package.json`, and a release tag must equal it (`v0.0.1`).

## [Unreleased]

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
