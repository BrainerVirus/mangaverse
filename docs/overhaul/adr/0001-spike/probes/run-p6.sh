#!/usr/bin/env bash
# Runs the same scenario with the host in a Web Worker. Needs SPIKE_DIR and ELECTRON.
set -euo pipefail
cd "$SPIKE_DIR"
node probes/build.mjs p6-main.mjs p6-renderer.mjs p6-worker-host.mjs
cp probes/p5-preload.cjs out/p5-preload.cjs
cp node_modules/sql.js/dist/sql-wasm.wasm out/sql-wasm.wasm
rm -rf out/migrations && cp -R work/migrations out/migrations
echo '<!doctype html><title>spike</title><script src="p6-renderer.mjs"></script>' > out/p6.html
"$ELECTRON" out/p6-main.mjs 2>&1 | grep -vE 'Unable to|GetVSyncParameters|ERROR:.*(gl_|gpu|viz)' || true
