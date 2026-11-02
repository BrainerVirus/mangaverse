#!/usr/bin/env bash
# Reruns every probe from nothing and writes evidence/. Machine-specific paths are replaced.
# Usage: SPIKE_DIR=/abs/throwaway bash run-all.sh
set -uo pipefail
: "${SPIKE_DIR:?set SPIKE_DIR to an absolute throwaway directory}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REPO="${REPO:-$(cd "$HERE/../../../.." && pwd)}"
export SPIKE_DIR
export ELECTRON="${ELECTRON:-$REPO/apps/desktop/node_modules/.bin/electron}"
EVIDENCE="$HERE/evidence"
mkdir -p "$EVIDENCE"
clean() { sed -E -e "s|$SPIKE_DIR|\$SPIKE_DIR|g" -e "s|$REPO|\$REPO|g" -e "s|$HOME|~|g" -e 's/\x1b\[[0-9;]*m//g'; }
record() { local name="$1"; shift; echo "--- $name"; "$@" 2>&1 | clean > "$EVIDENCE/$name.txt"; tail -1 "$EVIDENCE/$name.txt"; }
as_node() { DRIVER="$1" ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "${@:2}"; }

rm -rf "$SPIKE_DIR"
start=$SECONDS
record 00-setup bash "$HERE/setup.sh"
echo "setup seconds: $((SECONDS - start))" >> "$EVIDENCE/00-setup.txt"
cd "$SPIKE_DIR" || exit 1
{
  echo "machine (not the reference machine): $(sysctl -n hw.model) $(sysctl -n hw.ncpu) cores $(($(sysctl -n hw.memsize) / 1073741824)) GB, macOS $(sw_vers -productVersion)"
  ELECTRON_RUN_AS_NODE=1 "$ELECTRON" -p "JSON.stringify({electron:process.versions.electron,node:process.versions.node,abi:process.versions.modules,napi:process.versions.napi,sqlite:process.versions.sqlite,arch:process.arch})"
} | clean > "$EVIDENCE/01-runtime.txt"
record 02-native-facts bash probes/p1d-native-facts.sh
node probes/build.mjs p1-drivers.mjs p1b-facts.mjs
cp probes/p0-stock-driver.mjs p0.mjs
record 03-stock-driver-as-is as_node none p0.mjs
record 04-drivers-node-sqlite as_node node:sqlite out/p1-drivers.mjs
record 04-drivers-better-sqlite3 as_node better-sqlite3 out/p1-drivers.mjs
record 05-facts-node-sqlite as_node node:sqlite out/p1b-facts.mjs
record 05-facts-better-sqlite3 as_node better-sqlite3 out/p1b-facts.mjs
record 06-no-native-dependency bash probes/p1c-no-native.sh
suite() {
  as_node "$1" node_modules/vitest/vitest.mjs run --config probes/p2-suite.vitest.config.mjs --reporter=dot 2>&1 |
    grep -E 'FAIL|Test Files|Tests  |Caused by' || true
}
record 07-suite-sql.js-baseline suite sql.js
record 07-suite-node-sqlite suite node:sqlite
record 07-suite-better-sqlite3 suite better-sqlite3
export RPC_CLONE=1
record 08-suite-through-structured-clone suite node:sqlite
export RPC_CLONE_BREAK=1
record 08-control-boundary-broken suite node:sqlite
unset RPC_CLONE RPC_CLONE_BREAK
record 09-type-candidates bash probes/types/run-candidates.sh
record 10-workspace-typecheck bash probes/p3-workspace-typecheck.sh
node probes/p3-generate-client.mjs work/packages/db-src index work/packages/db-src/client.gen.ts > /dev/null
export CONVERTED=1
record 11-converted-callers-node-sqlite suite node:sqlite
record 11-converted-callers-better-sqlite3 suite better-sqlite3
unset CONVERTED
rm -f work/packages/db-src/client.gen.ts
record 12-electron-end-to-end bash probes/run-p5.sh node:sqlite better-sqlite3
record 13-web-worker-fit bash probes/run-p6.sh
