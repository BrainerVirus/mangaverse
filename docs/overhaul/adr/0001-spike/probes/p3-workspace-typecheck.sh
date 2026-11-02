#!/usr/bin/env bash
# Measures the conversion across the whole workspace in a throwaway clone.
# Step A: only the AppDrizzleDb alias changes. Step B: @app/db becomes the generated client.
# Usage: SPIKE_DIR=... REPO=... bash p3-workspace-typecheck.sh
set -uo pipefail
clone="$SPIKE_DIR/clone"
rm -rf "$clone"
git clone --quiet --local "$REPO" "$clone"
cd "$clone" || exit 1
time pnpm install --frozen-lockfile --ignore-scripts --prefer-offline --silent
run() {
  pnpm exec turbo run typecheck --continue --force --output-logs=errors-only > "$1" 2>&1
  echo "turbo exit: $?"
  grep -E 'Tasks:|Failed:' "$1" | sed 's/\x1b\[[0-9;]*m//g'
}
echo '== baseline'
run /tmp/ws-baseline.txt
echo '== step A: AppDrizzleDb = BaseSQLiteDatabase<sync, unknown, AppSchema>'
cp "$SPIKE_DIR/probes/types/candidates/a-base-unknown.ts" packages/db/src/adapter.ts
git diff --stat
run /tmp/ws-step-a.txt
echo '== step B: @app/db and @app/db/browser become the generated client'
cd packages/db/src
git mv index.ts host-index.ts
git mv browser.ts host-browser.ts
node "$SPIKE_DIR/probes/p3-generate-client.mjs" . host-index index.ts
node "$SPIKE_DIR/probes/p3-generate-client.mjs" . host-browser browser.ts
cd "$clone"
run /tmp/ws-step-b.txt
sed 's/\x1b\[[0-9;]*m//g' /tmp/ws-step-b.txt | grep -E 'error TS' | grep -v ':build: ' | sed -E 's/^[^:]*:[a-z]*: //' > /tmp/ws-step-b-errors.txt
echo "TS errors: $(wc -l < /tmp/ws-step-b-errors.txt)"
echo "  in test files: $(grep -c '\.test\.' /tmp/ws-step-b-errors.txt) across $(grep '\.test\.' /tmp/ws-step-b-errors.txt | cut -d'(' -f1 | sort -u | wc -l | xargs) files"
echo '  in production files:'
grep -v '\.test\.' /tmp/ws-step-b-errors.txt | cut -c1-120
echo 'errors per file:'
cut -d'(' -f1 /tmp/ws-step-b-errors.txt | sort | uniq -c | sort -rn
echo 'errors per code:'
grep -oE 'error TS[0-9]+' /tmp/ws-step-b-errors.txt | sort | uniq -c | sort -rn
