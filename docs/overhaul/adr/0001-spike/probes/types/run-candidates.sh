#!/usr/bin/env bash
# Typechecks @app/db and @app/extensions core with each AppDrizzleDb candidate. Run from SPIKE_DIR.
set -uo pipefail
cd "$SPIKE_DIR"
adapter=work/packages/db-src/adapter.ts
cp "$adapter" /tmp/adapter.original.ts
tsc() { node_modules/.bin/tsc -p probes/types/tsconfig.json --pretty false; }
summary() {
  errors=$(grep -c 'error TS' "$1" || true)
  echo "errors: $errors"
  grep 'error TS' "$1" | sed -E 's/^[^(]+\([0-9,]+\): //' | cut -c1-110 | sort | uniq -c | sort -rn | head -5
  grep 'error TS' "$1" | cut -d'(' -f1 | sort -u | wc -l | xargs echo "files with errors:"
}
echo "== baseline: SQLJsDatabase (assignability.ts expected to fail on the native handle)"
tsc > /tmp/types-baseline.txt 2>&1
summary /tmp/types-baseline.txt
for candidate in probes/types/candidates/*.ts; do
  echo "== $(basename "$candidate")"
  cp "$candidate" "$adapter"
  tsc > "/tmp/types-$(basename "$candidate").txt" 2>&1
  summary "/tmp/types-$(basename "$candidate").txt"
done
cp /tmp/adapter.original.ts "$adapter"
