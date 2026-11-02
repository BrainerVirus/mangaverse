#!/usr/bin/env bash
# Prepares the throwaway spike directory. Nothing under the repo's workspace changes.
# Usage: SPIKE_DIR=/abs/throwaway REPO=/abs/repo bash setup.sh
set -euo pipefail
: "${SPIKE_DIR:?set SPIKE_DIR to an absolute throwaway directory}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${REPO:-$(cd "$HERE/../../../.." && pwd)}"

mkdir -p "$SPIKE_DIR"
cp "$HERE/spike-deps.json" "$SPIKE_DIR/package.json"
npm install --prefix "$SPIKE_DIR" --no-audit --no-fund --no-package-lock

# Unmodified copies of the real sources, so the conversion can be patched and rerun.
rm -rf "$SPIKE_DIR/work" "$SPIKE_DIR/probes"
mkdir -p "$SPIKE_DIR/work/packages"
cp -R "$REPO/packages/db/src" "$SPIKE_DIR/work/packages/db-src"
cp -R "$REPO/packages/shared/src" "$SPIKE_DIR/work/packages/shared-src"
cp -R "$REPO/packages/extensions/src" "$SPIKE_DIR/work/packages/extensions-src"
cp -R "$REPO/packages/extensions-sdk/src" "$SPIKE_DIR/work/packages/extensions-sdk-src"
cp -R "$REPO/packages/platform/src" "$SPIKE_DIR/work/packages/platform-src"
cp -R "$REPO/packages/db/migrations" "$SPIKE_DIR/work/migrations"
# migrations.ts resolves ../migrations from its own folder.
cp -R "$REPO/packages/db/migrations" "$SPIKE_DIR/work/packages/migrations"
cp -R "$HERE/probes" "$SPIKE_DIR/probes"
# Probe sources carry .txt in the repo so the workspace's knip and formatter leave them alone.
find "$SPIKE_DIR/probes" -type f -name '*.txt' -exec sh -c 'mv "$1" "${1%.txt}"' _ {} \;
echo "spike ready: $SPIKE_DIR"
