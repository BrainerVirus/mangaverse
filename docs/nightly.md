# Nightly builds and install scripts

Nightly is the active channel. Stable is built from a `vX.Y.Z` tag later; it is not
published on a schedule.

## Channels

| Channel | How it is built                                                                    | Version / tag                                                                                           | GitHub release          |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------- |
| Nightly | `.github/workflows/nightly.yml`, daily at 04:17 UTC or manual dispatch from `main` | next patch + `-nightly.YYYYMMDD.<run>`, e.g. `0.0.4-nightly.20261108.12` / `v0.0.4-nightly.20261108.12` | pre-release, not latest |
| Stable  | `.github/workflows/release.yml` on a `vX.Y.Z` tag                                  | `X.Y.Z` / `vX.Y.Z`                                                                                      | pre-release             |

The stable channel means the newest tag that is not a nightly. Every release so far is published
as a GitHub pre-release, so the scripts list releases and filter instead of using
`/releases/latest`, which ignores pre-releases.

Nightly releases are immutable and never overwrite stable. Every nightly has the installers,
`SHA256SUMS`, build-provenance attestations and the two install scripts.

## Install without admin

macOS (Apple Silicon) and Linux (x64):

```sh
curl -fsSL https://raw.githubusercontent.com/BrainerVirus/mangaverse/main/scripts/install/install.sh | sh
```

Windows (x64, PowerShell 5.1+):

```powershell
irm https://raw.githubusercontent.com/BrainerVirus/mangaverse/main/scripts/install/install.ps1 | iex
```

The scripts:

- resolve the newest release on the selected channel (`nightly` by default);
- verify the downloaded artifact against the release's `SHA256SUMS`;
- install per-user: `~/Applications/MangaVerse.app` on macOS,
  `~/.local/share/mangaverse` on Linux, `%LOCALAPPDATA%\Programs\MangaVerse` on Windows;
- create a user launcher (and a Linux desktop entry / Windows Start Menu shortcut);
- write a receipt used by `update`, `status` and `uninstall`.

No `sudo` and no paid Apple/Windows account are used.

## Update

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/BrainerVirus/mangaverse/main/scripts/install/install.sh | sh -s -- update
```

Windows PowerShell:

```powershell
$s = [scriptblock]::Create((irm https://raw.githubusercontent.com/BrainerVirus/mangaverse/main/scripts/install/install.ps1)); & $s -Action update
```

`update` is the same verified install flow and keeps local library data. It is also what the
app runs for an in-app update (below). An update stays in the directory the receipt recorded
(macOS/Linux); on Windows the app passes its own install directory, and a manual `update` of a
custom `-InstallDir` needs the same flag.

`--staged DIR` (`-Staged DIR` on Windows) installs a release the app already downloaded: DIR holds the
asset and `SHA256SUMS`, and the same checksum check decides whether it installs, so a staged file is no
more trusted than a downloaded one. The app uses it to show real download progress. The script accepts
only a directory the app made: it resolves the path first (so `..` and links cannot rename it), requires
the name to start with `mangaverse-staged-`, and on macOS and Linux that it is yours and not writable by
others. It copies the two files into its own private temporary directory and verifies and installs that
copy, so nothing can change them between the check and the install. It removes DIR afterwards, and
only a directory that passed those checks.

## In-app nightly updates

A nightly installed by these scripts is self-updating. The app checks GitHub Releases about 30
seconds after startup and every six hours; it only offers a newer nightly, and it holds the
prompt while a chapter is open, exactly like the existing update flow. Accepting the prompt
quits the app, runs a copy of the bundled installer with `update --version <tag>` (staged in
the temp directory so replacing the bundle cannot delete a running script), and relaunches
after the same checksum verification as a manual update.

This is the workaround for having no paid signing account: macOS cannot use Squirrel.Mac with
an ad-hoc build, so the installer replaces the bundle instead of the built-in updater.
Integrity rests on HTTPS plus the release `SHA256SUMS`; there is no signed update feed. Only
script-installed nightlies self-update: a DMG/NSIS/manual install and every stable build keep
the manual path.

The app quits before the script downloads, so a failed download leaves the old bundle untouched:
relaunch it and retry. A successful run replaces the app in place and relaunches it.

Builds from before the script installer (0.0.1–0.0.3) cannot update themselves at all; install
once with the command above to move onto the nightly channel.

## Uninstall

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/BrainerVirus/mangaverse/main/scripts/install/install.sh | sh -s -- uninstall
```

Windows PowerShell:

```powershell
$s = [scriptblock]::Create((irm https://raw.githubusercontent.com/BrainerVirus/mangaverse/main/scripts/install/install.ps1)); & $s -Action uninstall
```

Uninstall keeps the local library, settings and backups by default. Add `--purge-data` /
`-PurgeData` to remove the app's Electron user-data folder as well. The current package name is
`@app/desktop`, so that folder is `Application Support/@app/desktop` on macOS,
`%APPDATA%\@app\desktop` on Windows and `~/.config/@app/desktop` on Linux; the script also
removes a `MangaVerse` folder for forward compatibility.

## Signing caveats

The builds are unsigned. macOS is ad-hoc signed so Apple Silicon can launch it; it is not
notarized. Windows has no Authenticode signature. Downloads made through `curl`/PowerShell do
not carry the browser quarantine/Mark-of-the-Web, so the scripts avoid those first-run warnings.
A browser-downloaded installer still triggers Gatekeeper or SmartScreen; on macOS use
**System Settings → Privacy & Security → Open Anyway**. Do not disable Gatekeeper, SmartScreen
or Smart App Control globally.

Windows 11 Smart App Control may refuse an unsigned app with no per-app override. That is an
OS policy, not something the installer can or should bypass.

## Limits

- macOS: arm64 only; no Intel build.
- Windows/Linux: x64 only.
- The nightly workflow does not replace the stable release workflow; stable still requires a
  version bump and a `vX.Y.Z` tag.
- The current update path is the installer script. A signed in-app update feed is not enabled.
