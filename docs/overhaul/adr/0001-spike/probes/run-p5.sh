#!/usr/bin/env bash
# Builds and runs the Electron end-to-end probe on both drivers. Needs SPIKE_DIR and ELECTRON.
set -euo pipefail
cd "$SPIKE_DIR"
node probes/build.mjs p5-main.mjs p5-host.mjs p5-renderer.mjs
cp probes/p5-preload.cjs out/p5-preload.cjs
echo '<!doctype html><title>spike</title><script src="p5-renderer.mjs"></script>' > out/p5.html
for driver in "${@:-node:sqlite}"; do
  echo "== $driver"
  DRIVER="$driver" "$ELECTRON" out/p5-main.mjs 2>&1 | grep -vE 'Unable to|GetVSyncParameters|ERROR:.*(gl_|gpu|viz)' || true
done
