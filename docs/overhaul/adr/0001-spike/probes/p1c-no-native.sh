#!/usr/bin/env bash
# Proves the node:sqlite path needs neither better-sqlite3 nor its types, at compile or run time.
set -uo pipefail
cd "$SPIKE_DIR"
aside=$(mktemp -d)
mv node_modules/better-sqlite3 "$aside/pkg"
mv node_modules/@types/better-sqlite3 "$aside/types"
cp work/packages/db-src/adapter.ts "$aside/adapter.ts"
cp probes/types/candidates/a-base-unknown.ts work/packages/db-src/adapter.ts
node_modules/.bin/tsc -p probes/types/tsconfig.no-native.json --pretty false
echo "tsc exit without better-sqlite3 or its types: $?"
node probes/build.mjs p1-drivers.mjs
DRIVER=node:sqlite ELECTRON_RUN_AS_NODE=1 "$ELECTRON" out/p1-drivers.mjs 2>&1 | tail -1
mv "$aside/pkg" node_modules/better-sqlite3
mv "$aside/types" node_modules/@types/better-sqlite3
cp "$aside/adapter.ts" work/packages/db-src/adapter.ts
