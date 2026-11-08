#!/bin/sh
# Run from any directory. Known counterexample configs must fail with TLC's
# safety-violation exit code; corrected configs must pass.
set -eu
cd "$(dirname "$0")"
jar=${TLA2TOOLS_JAR:-${TMPDIR:-/tmp}/mangaverse-tla2tools-1.8.0.jar}
if [ ! -f "$jar" ]; then
  if [ -n "${TLA2TOOLS_JAR:-}" ]; then
    echo "TLA2TOOLS_JAR does not exist: $jar" >&2; exit 1
  fi
  url=https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar
  echo "Downloading $url to $jar" >&2
  curl -fL "$url" -o "$jar.download"
  mv "$jar.download" "$jar"
fi
# Pin the jar when downloaded via the default location. An explicit jar is
# allowed so alternate TLC versions can be tested.
if [ -z "${TLA2TOOLS_JAR:-}" ]; then
  expected=e1f11b75c4b5bc4478ba0ac5cb6ae28e40a01b0016bc33e0aa97da22dfdbcd7f
  if command -v shasum >/dev/null 2>&1; then actual=$(shasum -a 256 "$jar" | awk '{print $1}'); else actual=$(sha256sum "$jar" | awk '{print $1}'); fi
  [ "$actual" = "$expected" ] || { echo "TLC jar checksum mismatch: $actual" >&2; exit 1; }
fi
mkdir -p traces
metadir=$(mktemp -d "${TMPDIR:-/tmp}/mangaverse-tlc.XXXXXXXX")
trap 'rm -rf "$metadir"' EXIT HUP INT TERM
failed=0
for cfg in models/*.cfg; do
  name=${cfg##*/}; name=${name%.cfg}; module=${name%%-*}
  case "$name" in Navigation-current-ClosedPageNotLeftBelow) expected=13 ;; *-current-*) expected=12 ;; *-current) expected=12 ;; *) expected=0 ;; esac
  printf '\n=== %s ===\n' "$name"
  rc=0
  java -Xmx2g -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers "${TLC_WORKERS:-4}" -deadlock -noGenerateSpecTE -metadir "$metadir/$name" -config "$cfg" "$module.tla" > "traces/$name.txt" 2>&1 || rc=$?
  cat "traces/$name.txt"
  if [ "$rc" -ne "$expected" ]; then
    echo "Unexpected TLC exit $rc (expected $expected): $name" >&2; failed=1
  fi
done
exit "$failed"
