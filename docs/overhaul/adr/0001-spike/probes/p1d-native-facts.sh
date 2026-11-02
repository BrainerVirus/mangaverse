#!/usr/bin/env bash
# better-sqlite3 install, rebuild and platform facts. Needs SPIKE_DIR.
set -uo pipefail
cd "$SPIKE_DIR"
pkg=node_modules/better-sqlite3
echo "version: $(node -p "require('./$pkg/package.json').version") gypfile: $(node -p "require('./$pkg/package.json').gypfile") install script: $(node -p "require('./$pkg/package.json').scripts?.install ?? 'none'")"
du -sh "$pkg" "$pkg/deps" "$pkg/prebuilds" | sed "s|$SPIKE_DIR/||"
ls -l "$pkg/prebuilds" | awk 'NR>1 {print $5, $9}'
file "$pkg/prebuilds/darwin-arm64.node" | sed "s|^.*prebuilds/||"
codesign -dv "$pkg/prebuilds/darwin-arm64.node" 2>&1 | grep -E 'CodeDirectory|Signature' | sed 's/hashes.*//'
echo '== @electron/rebuild for Electron 44.7.0'
start=$SECONDS
node_modules/.bin/electron-rebuild -v 44.7.0 -m "$pkg" -f 2>&1 | tail -2
echo "elapsed: $((SECONDS - start))s; .node files it built: $(find "$pkg/build" -name '*.node' 2>/dev/null | wc -l | xargs)"
rm -rf "$pkg/build"
echo '== source build against Electron 44.7.0 headers (documented alternative)'
src=$(mktemp -d)
cp -R "$pkg/." "$src/"
mkdir -p "$src/node_modules"
ln -sfn "$SPIKE_DIR/node_modules/node-addon-api" "$src/node_modules/node-addon-api"
start=$SECONDS
(cd "$src" && "$SPIKE_DIR/node_modules/.bin/node-gyp" rebuild --release --force_build=1 --target=44.7.0 --dist-url=https://electronjs.org/headers --arch="$(node -p process.arch)" 2>&1 | tail -1)
echo "elapsed: $((SECONDS - start))s; size: $(wc -c < "$src/build/Release/better_sqlite3.node" | xargs) bytes"
rm -rf "$src"
