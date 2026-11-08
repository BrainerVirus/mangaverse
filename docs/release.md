# Release runbook

How a desktop release is built, published and verified. The first release is **v0.0.1**, an
unsigned early preview published as a GitHub **pre-release**. The decisions behind it live in
[`overhaul/04-electron-runtime.md`](overhaul/04-electron-runtime.md) (X8) and
[`overhaul/handoff.md`](overhaul/handoff.md) (Packaging, #215).

## What a release contains

| Platform             | Files                                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| macOS, Apple Silicon | `MangaVerse-<version>-arm64.dmg`, `MangaVerse-<version>-arm64.zip`               |
| Windows x64          | `MangaVerse-<version>-x64.exe` (NSIS), `MangaVerse-<version>-x64.zip` (portable) |
| Linux x64            | `MangaVerse-<version>-x86_64.AppImage`, `MangaVerse-<version>-amd64.deb`         |
| Installers           | `install.sh`, `install.ps1` (the contract in [`nightly.md`](nightly.md))         |
| Integrity            | `SHA256SUMS`, plus a GitHub build-provenance attestation for every file          |

There is no macOS Intel build, no Windows or Linux ARM build, and no `latest*.yml` update feed.
Nightly builds, the install scripts and the script-based update path are documented in
[`nightly.md`](nightly.md).

The version comes from `apps/desktop/package.json` (electron-builder reads it). The root
`package.json` is `0.0.0` and is not a release version. A release tag must equal
`v<desktop version>`.

## How the pipeline works

`.github/workflows/release.yml`:

1. **verify**: the tag is `vX.Y.Z[-suffix]`, equals `v` + the desktop version, points at a commit
   on `main`, that commit has a successful `CI` run **as a push to `main`** (a green pull-request run
   of the same commit is not accepted: the query filters `event=push` and `branch=main`, and each
   returned run is checked again), and no **published** release for the tag exists.
2. **bundle**: one Ubuntu build of the desktop JS (`pnpm --filter @app/desktop build`). The bundle
   is OS-independent, so every platform job packages the same build.
3. **package** (matrix, `fail-fast: false`): `macos-26` (arm64), `windows-2025`, `ubuntu-24.04`
   run `package:mac|win|linux`. Architectures are pinned in
   `apps/desktop/electron-builder.yml`. The macOS job also checks the binary is arm64 and runs the
   packaged-app proof (`test:e2e:packaged`) against the arm64 zip.
4. **release** (the only job with write permission, `environment: release`): adds `install.sh`
   and `install.ps1` to the assets, writes `SHA256SUMS`, attests every file with `actions/attest`,
   and runs `gh release create --verify-tag --prerelease --latest=false`.

Uploads are done with `gh release`, never `electron-builder --publish` (the build jobs hold a
read-only token and no secrets).

`.github/workflows/package.yml` is a manual rehearsal of the same packaging (nothing is
published, artifacts are kept 14 days).

## Cutting a release (owner steps)

1. **Rehearse.** Actions → **Release** → _Run workflow_ on `main` (leave _rehearsal_ ticked), or
   run **Package**. Download the installers from the run's artifacts.
2. **Install and launch on all three OSes**: macOS Apple Silicon, Windows 11, and Ubuntu 24.04
   (try the `.deb`; for the AppImage see the notes below). CI only builds the Windows and Linux
   installers; it does not install or launch them.
3. **Bump the version** if needed (`apps/desktop/package.json`), update `CHANGELOG.md`, merge to
   `main`, and wait for `CI` to be green on that merge commit.
4. **Optional, before the first tag:** turn on _immutable releases_ (see Repository settings).
   A published immutable tag name can never be reused, even after deleting the release.
5. **Tag and push** (this publishes):

   ```sh
   git switch main && git pull --ff-only
   git tag -a v0.0.1 -m "MangaVerse v0.0.1"
   git push origin v0.0.1
   ```

6. Watch the **Release** run. The result is a pre-release named `MangaVerse v0.0.1`, not marked
   latest, with the unsigned-preview notice, verification steps and the committed changes.
7. Verify a download (below), then announce the release.

### Recovering from a failed or interrupted upload

`gh release create` with assets creates an unpublished **draft**, uploads the files, then
publishes. An upload that dies midway therefore leaves a draft, never a half-published release.

1. Look first: `gh release view <tag>` (a published release) and, with a token that can push,
   `gh api repos/BrainerVirus/mangaverse/releases --jq '.[] | select(.tag_name=="<tag>") | {id, draft}'`.
2. **Draft (unpublished):** the workflow now refuses an existing draft rather than deleting it
   (a draft can be published by hand between a read and a delete). After confirming the API says
   `draft: true`, delete it by hand with `gh release delete <tag> --cleanup-tag=false` (this keeps
   the tag), then dispatch **Release** from the **tag ref** with _rehearsal_ unticked.
3. **Published:** the workflow refuses to touch it, and so should you: never delete a published
   release or its tag silently. If it is wrong, say so publicly, delete it deliberately, fix, and
   ship the next patch version (with immutable releases on, the old tag name is burned).

## Unsigned builds: what users see

The v0.0.1 installers are not Developer ID-signed or notarized. The macOS app is ad-hoc signed so Apple Silicon can launch it; Windows and Linux are unsigned.

On macOS the app is still **ad-hoc signed** (not a Developer ID signature, no notarization).
Flipping the Electron fuses edits the Electron Framework and breaks the signature Electron ships
with, and Apple Silicon kills a process with an invalid signature (SIGKILL at launch). So
`apps/desktop/scripts/after-sign.mjs` (`afterSign` in `electron-builder.yml`) re-signs the `.app`
after the fuses are applied and before the dmg and zip are built, only when the bundle does not
already verify. A real Developer ID signature is left untouched. `afterPack` cannot do this: it
runs before the fuses. The ad-hoc signature has no hardened runtime, because an ad-hoc process
cannot load an equally ad-hoc framework under library validation. The packaged proof
(`test:e2e:packaged`) checks `codesign --verify --deep --strict` on the shipped app and framework
and launches the unmodified artifact.

- **macOS**: Gatekeeper refuses to open the app. Open **System Settings → Privacy & Security**
  and choose **Open Anyway** for MangaVerse, then confirm. If macOS says the app is damaged,
  remove the download quarantine: `xattr -dr com.apple.quarantine /Applications/MangaVerse.app`.
- **Windows**: SmartScreen shows "Windows protected your PC". Choose **More info → Run anyway**.
- **Linux**: `chmod +x MangaVerse-*.AppImage` and run it, or install the `.deb` with
  `sudo apt install ./MangaVerse-*.deb`. The app keeps Chromium's sandbox on. Ubuntu 24.04
  restricts unprivileged user namespaces through AppArmor, which can stop a bare AppImage from
  starting; the `.deb` installs a sandbox helper and is the safer choice there. The AppImage also
  needs FUSE 2 (`libfuse2`) on recent Ubuntu. Do not work around this with `--no-sandbox`.

## Verifying a download

```sh
# Checksums (run in the folder with the downloaded files)
sha256sum --check --ignore-missing SHA256SUMS        # Linux
shasum -a 256 --check --ignore-missing SHA256SUMS    # macOS

# Build provenance: proves the file was built by this repository's release workflow
gh attestation verify MangaVerse-0.0.1-arm64.dmg --repo BrainerVirus/mangaverse
```

With immutable releases on, `gh release verify` also checks the release attestation.

## Signing later (owner-gated, #215)

Nothing in the repo reads a signing secret today, and the `package` jobs run with
`CSC_IDENTITY_AUTO_DISCOVERY=false`. When certificates exist:

- **macOS**: an Apple Developer ID Application certificate and notarization credentials.
  electron-builder 26 signs and notarizes by itself when its environment is present, so no
  `afterSign` hook is needed (`hardenedRuntime` and `build/entitlements.mac.plist` are already
  set). Prefer an App Store Connect API key (`APPLE_API_KEY`, `APPLE_API_KEY_ID`,
  `APPLE_API_ISSUER`) over an Apple ID and app-specific password, with the certificate as
  `CSC_LINK` / `CSC_KEY_PASSWORD`.
- **Windows**: newly issued certificates live on hardware or cloud HSMs, so a `.pfx` secret
  generally will not work. Use a cloud signing service, for example Azure Trusted Signing
  through electron-builder's `win.azureSignOptions`.
- **Wiring**: create an environment such as `release-signing` holding the secrets, bind only the
  `package` job (or its `Package` step) to it, scope each secret to the single step that needs
  it, and set `CSC_IDENTITY_AUTO_DISCOVERY` back to `true` only for the signed step. Never put
  signing secrets in job-level `env`, and keep the Windows job from receiving the macOS
  certificate. Then verify the result: `codesign --verify --deep --strict`,
  `spctl -a -vv`, `xcrun stapler validate` on macOS, and `Get-AuthenticodeSignature` on Windows.

## Re-enabling auto-update

The nightly channel does not use this path: a script-installed nightly updates by handing off to
the bundled installer ([`nightly.md`](nightly.md)). This section is only for turning on the
signed electron-updater feed in a stable build.

The updater code is intact (`apps/desktop/src/main/updater.ts`, `update-policy.ts`, the platform
IPC and the renderer prompt). It stays off because `electron-builder.yml` has no `publish` block:
electron-builder then writes no `app-update.yml`, `registerAutoUpdate` finds no feed
(`hasFeed` is false) and logs `[updater] disabled`. To turn it on:

1. Add to `apps/desktop/electron-builder.yml`:

   ```yaml
   publish:
     provider: github
     owner: BrainerVirus
     repo: mangaverse
   ```

   This makes electron-builder write `app-update.yml` into the app and `latest.yml`,
   `latest-mac.yml`, `latest-linux.yml` plus `*.blockmap` files into `release/`.

2. Add those files to the `files:` lists of the `package` matrix in `release.yml` (and
   `package.yml`) so they are uploaded with the installers, **built from the same run and never
   renamed or re-zipped** (the feeds hold the installers' sha512).
3. **Sign the macOS build first.** The macOS updater installs through Squirrel.Mac, which needs a
   signed app. Windows and Linux (AppImage) updates work unsigned.
4. Publish as a normal release, not a pre-release: the updater ignores pre-releases unless the
   running app's own version is a pre-release.
5. Change `apps/desktop/e2e/packed-app.spec.ts` back to expecting `[updater] enabled` and an
   `app-update.yml` in `Contents/Resources`.
6. Disclose it in the release notes: the app then asks GitHub for new releases every 6 hours.

## Repository settings (owner; not changed by the code)

These are GitHub settings, outside the repository's files:

- **CodeQL**: Settings → Code security → _Code scanning_ → default setup (JavaScript/TypeScript).
- **Actions pinning**: Settings → Actions → General → _Require actions to be pinned to a
  full-length commit SHA_. Every workflow here is already pinned (`@<sha> # vX.Y.Z`); Dependabot
  (`.github/dependabot.yml`) keeps them current weekly.
- **Dependabot security updates**: Settings → Code security → enable.
- **Branch protection / rulesets**: protect `main` (pull request and the `CI` check required),
  and add a tag ruleset for `v*` (creation limited to maintainers; no updates or deletions).
- **Immutable releases**: Settings → General → _Releases_ → _Immutable releases_. The release
  job creates the release with all assets in one step, which is the supported flow. Enable it
  after a successful rehearsal.
- **`release` environment**: created on first use with no protection. Add required reviewers
  and a deployment tag rule `v*` if a manual approval before publishing is wanted.

## Local packaging

```sh
pnpm install --frozen-lockfile
pnpm --filter @app/desktop build
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @app/desktop package:mac   # unsigned arm64 dmg + zip
pnpm --filter @app/desktop test:e2e:packaged                               # launches the packaged app
```

`package:dir` builds only the unpacked app. Output goes to `apps/desktop/release/`. Icons are
described in `apps/desktop/build/README.md`.
