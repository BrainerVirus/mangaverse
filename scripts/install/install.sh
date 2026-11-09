#!/bin/sh
# MangaVerse installer / updater / uninstaller for macOS (arm64) and Linux (x64).
# Same commands as install.ps1. No root, no paid signing account.
set -eu

REPO="BrainerVirus/mangaverse"
CHANNEL="nightly"
CHANNEL_SET=0
ACTION="install"
VERSION=""
STAGED=""
INSTALL_DIR=""
PURGE=0
DRY_RUN=0
LAUNCH=1

usage() {
  cat <<'USAGE'
MangaVerse installer

Usage:
  install.sh [install|update] [--channel nightly|stable] [--version V] [--staged DIR] [--dry-run] [--no-launch]
  install.sh uninstall [--purge-data] [--dry-run]
  install.sh status

Defaults: channel=nightly, install to ~/Applications (macOS) or
$XDG_DATA_HOME/mangaverse (Linux). Data is preserved on uninstall unless --purge-data.
USAGE
}

die() { printf 'install: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    install|update) ACTION="install" ;;
    uninstall|remove) ACTION="uninstall" ;;
    status) ACTION="status" ;;
    --channel) CHANNEL="${2:-}"; CHANNEL_SET=1; shift ;;
    --version) VERSION="${2:-}"; shift ;;
    --staged) STAGED="${2:-}"; shift ;;
    --dir) INSTALL_DIR="${2:-}"; shift ;;
    --purge-data|--purge) PURGE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-launch) LAUNCH=0 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

# A pinned version says which channel it belongs to unless --channel overrides it.
if [ "$CHANNEL_SET" -eq 0 ] && [ -n "$VERSION" ]; then
  case "$VERSION" in
    *-nightly.*) CHANNEL="nightly" ;;
    *) CHANNEL="stable" ;;
  esac
fi

case "$CHANNEL" in nightly|stable) ;; *) die "channel must be nightly or stable" ;; esac
[ "$(id -u)" -eq 0 ] && die "run as your user, not root"

OS=$(uname -s)
ARCH=$(uname -m)
case "$OS" in
  Darwin)
    [ "$ARCH" = "arm64" ] || die "macOS builds are Apple Silicon only (arm64)"
    ASSET_SUFFIX="arm64.zip"
    DEFAULT_DIR="$HOME/Applications"
    ;;
  Linux)
    [ "$ARCH" = "x86_64" ] || die "Linux builds are x86_64 only"
    ASSET_SUFFIX="x86_64.AppImage"
    DEFAULT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/mangaverse"
    ;;
  *) die "unsupported OS: $OS" ;;
esac

WRAPPER="$HOME/.local/bin/mangaverse"
if [ "$OS" = "Darwin" ]; then
  RECEIPT_DIR="$HOME/Library/Application Support/MangaVerse Installer"
  RECEIPT="$RECEIPT_DIR/receipt"
  # The packaged app's userData is its package name (@app/desktop); MangaVerse is the
  # name a future productName would use. Remove both on --purge-data.
  PACKAGE_DATA_DIR="$HOME/Library/Application Support/@app/desktop"
  DATA_DIR="$HOME/Library/Application Support/MangaVerse"
  DESKTOP_ENTRY=""
else
  RECEIPT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/mangaverse"
  RECEIPT="$RECEIPT_DIR/receipt"
  PACKAGE_DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/@app/desktop"
  DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/MangaVerse"
  DESKTOP_ENTRY="${XDG_DATA_HOME:-$HOME/.local/share}/applications/mangaverse.desktop"
fi

read_receipt() {
  [ -f "$RECEIPT" ] || return 0
  key=$1
  sed -n "s/^${key}=//p" "$RECEIPT" | head -1
}

# An update stays in the directory the receipt recorded; --dir still overrides it. Without
# this, an in-app update of a non-default install would land in the default path.
if [ "$ACTION" = "install" ] && [ -z "$INSTALL_DIR" ]; then
  recorded_app_dir=$(read_receipt app_dir)
  if [ -n "$recorded_app_dir" ]; then INSTALL_DIR="$recorded_app_dir"; fi
fi

APP_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"
if [ "$OS" = "Darwin" ]; then
  APP_PATH="$APP_DIR/MangaVerse.app"
else
  APP_PATH="$APP_DIR/MangaVerse.AppImage"
fi

if [ "$ACTION" = "status" ]; then
  if [ -f "$RECEIPT" ]; then cat "$RECEIPT"; else say "MangaVerse is not installed by this script."; fi
  exit 0
fi

if [ "$ACTION" = "uninstall" ]; then
  recorded_app=$(read_receipt app_path)
  recorded_wrapper=$(read_receipt wrapper)
  recorded_desktop=$(read_receipt desktop_entry)
  target_app=${recorded_app:-$APP_PATH}
  target_wrapper=${recorded_wrapper:-$WRAPPER}
  target_desktop=${recorded_desktop:-$DESKTOP_ENTRY}
  say "Remove $target_app"
  [ "$DRY_RUN" -eq 1 ] || rm -rf "$target_app" "$target_desktop" "$target_wrapper" "$RECEIPT"
  if [ "$PURGE" -eq 1 ]; then
    say "Remove user data $PACKAGE_DATA_DIR and $DATA_DIR"
    [ "$DRY_RUN" -eq 1 ] || rm -rf "$PACKAGE_DATA_DIR" "$DATA_DIR"
  fi
  say "MangaVerse uninstalled$( [ "$PURGE" -eq 1 ] || printf ' (data preserved)')."
  exit 0
fi

api="https://api.github.com/repos/$REPO/releases"
if [ -n "$VERSION" ]; then
  TAG="v${VERSION#v}"
else
  # Every current release is published as a pre-release, so /releases/latest is empty.
  # "stable" means the newest tag that is not a nightly; "nightly" the newest that is.
  json=$(curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -H 'User-Agent: MangaVerse-Installer' -H 'Accept: application/vnd.github+json' "$api?per_page=30") || die "could not read $CHANNEL releases"
  tags=$(printf '%s' "$json" | grep -o '"tag_name": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  if [ "$CHANNEL" = "stable" ]; then
    TAG=$(printf '%s\n' "$tags" | grep -v -- '-nightly\.' | head -1)
  else
    TAG=$(printf '%s\n' "$tags" | grep -E -- '-nightly\.' | head -1)
  fi
fi
[ -n "${TAG:-}" ] || die "no $CHANNEL release found"
VERSION="${TAG#v}"
case "$VERSION" in
  ""|*[!0-9A-Za-z.+-]*) die "invalid version: $VERSION" ;;
esac
case "$CHANNEL" in
  nightly) printf '%s' "$VERSION" | grep -q -- '-nightly\.' || die "resolved tag $TAG is not a nightly" ;;
  stable) printf '%s' "$VERSION" | grep -q -- '-nightly\.' && die "resolved tag $TAG is not stable" ;;
esac

ASSET="MangaVerse-${VERSION}-${ASSET_SUFFIX}"
BASE="https://github.com/$REPO/releases/download/$TAG"
say "Install MangaVerse $VERSION ($CHANNEL) from $TAG"
say "  app:     $APP_PATH"
say "  wrapper: $WRAPPER"
[ "$DRY_RUN" -eq 1 ] && { say "Dry run: nothing downloaded or written."; exit 0; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/mangaverse-install.XXXXXX")
# An update the app downloaded itself (to show real progress) arrives in a directory the app made;
# only that kind of directory is removed afterwards, so a mistaken --staged path is never deleted.
cleanup() {
  rm -rf "$TMP"
  case "$STAGED" in
    */mangaverse-staged-*) rm -rf "$STAGED" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

if [ -n "$STAGED" ]; then
  [ -f "$STAGED/$ASSET" ] || die "staged directory has no $ASSET"
  [ -f "$STAGED/SHA256SUMS" ] || die "staged directory has no SHA256SUMS"
  SRC="$STAGED"
else
  curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o "$TMP/$ASSET" "$BASE/$ASSET"
  curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o "$TMP/SHA256SUMS" "$BASE/SHA256SUMS"
  SRC="$TMP"
fi
# Staged or downloaded, the checksum is what decides whether this installs.
line=$(grep "  $ASSET\$" "$SRC/SHA256SUMS" | head -1)
[ -n "$line" ] || die "SHA256SUMS has no entry for $ASSET"
expected=${line%% *}
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$SRC/$ASSET" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$SRC/$ASSET" | awk '{print $1}')
fi
[ "$actual" = "$expected" ] || die "checksum mismatch for $ASSET"

# The in-app updater starts this script and then quits; replacing files under a live app
# fails on Windows and is unsafe everywhere. Wait for it to go instead of killing it.
wait_for_app_exit() {
  command -v pgrep >/dev/null 2>&1 || return 0
  pattern="$APP_PATH"
  if [ "$OS" = "Darwin" ]; then pattern="$APP_PATH/Contents/MacOS/MangaVerse"; fi
  i=0
  while pgrep -f "$pattern" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -le 300 ] || die "MangaVerse is still running; quit it and run the update again"
    sleep 0.2
  done
}
wait_for_app_exit

mkdir -p "$APP_DIR" "$(dirname "$WRAPPER")" "$RECEIPT_DIR"
if [ "$OS" = "Darwin" ]; then
  mkdir -p "$TMP/extract"
  ditto -x -k "$SRC/$ASSET" "$TMP/extract"
  [ -d "$TMP/extract/MangaVerse.app" ] || die "zip did not contain MangaVerse.app"
  rm -rf "$APP_PATH"
  ditto "$TMP/extract/MangaVerse.app" "$APP_PATH"
  # The archive came from curl, not a browser, and carries no quarantine flag.
  xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
  cat > "$WRAPPER" <<WRAP
#!/bin/sh
exec "$APP_PATH/Contents/MacOS/MangaVerse" "\$@"
WRAP
else
  install -m 0755 "$SRC/$ASSET" "$APP_PATH"
  cat > "$WRAPPER" <<WRAP
#!/bin/sh
exec "$APP_PATH" "\$@"
WRAP
  mkdir -p "$(dirname "$DESKTOP_ENTRY")"
  icon_url="https://raw.githubusercontent.com/$REPO/$TAG/apps/desktop/build/icon.png"
  curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o "$APP_DIR/mangaverse.png" "$icon_url" >/dev/null 2>&1 || true
  cat > "$DESKTOP_ENTRY" <<DESKTOP
[Desktop Entry]
Type=Application
Name=MangaVerse
Comment=Local-first manga reader
Exec=$WRAPPER %U
Icon=$APP_DIR/mangaverse.png
Terminal=false
Categories=Graphics;Viewer;
MimeType=x-scheme-handler/mangaverse;
DESKTOP
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$(dirname "$DESKTOP_ENTRY")" >/dev/null 2>&1 || true
fi
chmod 0755 "$WRAPPER"
cat > "$RECEIPT" <<RECEIPT
channel=$CHANNEL
version=$VERSION
tag=$TAG
method=script
app_path=$APP_PATH
app_dir=$APP_DIR
wrapper=$WRAPPER
desktop_entry=$DESKTOP_ENTRY
RECEIPT
chmod 0600 "$RECEIPT"
say "Installed MangaVerse $VERSION."
if [ "$OS" = "Darwin" ] && [ "$LAUNCH" -eq 1 ]; then open "$APP_PATH"; fi
if [ "$OS" = "Linux" ] && [ "$LAUNCH" -eq 1 ]; then "$WRAPPER" >/dev/null 2>&1 & fi
