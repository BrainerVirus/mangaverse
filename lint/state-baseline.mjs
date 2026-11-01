// Freezes existing useState and try/catch uses per file (docs/overhaul/01-engineering-rules.md E1).
// oxlint has no baseline feature, so this runs the two rules from .oxlintrc.baseline.json and
// compares the per-file counts with lint/baseline.json: more fails, fewer fails until it is lowered.
// The baseline itself may only shrink against the one committed on the merge base with the trunk.
//
//   node lint/state-baseline.mjs            check
//   node lint/state-baseline.mjs --shrink   lower the baseline to the tree; it never raises a count
//
// WORKIT_BASELINE_BASE names the commit to compare the baseline with, instead of the merge base.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = 'lint/baseline.json';
const BASELINE_PATH = join(ROOT, BASELINE_FILE);
const OXLINT_BIN = join(ROOT, 'node_modules/oxlint/bin/oxlint');
const TARGETS = ['apps', 'packages', 'vitest.config.ts'];
const RULES = ['no-use-state', 'no-try-catch'];

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
// Mirrors ignorePatterns in .oxlintrc.baseline.json; state-baseline.test.mjs keeps them in step.
export const EXEMPT_FILE = /\.(test|spec)\.|(^|\/)(__tests__|e2e-production)\/|^apps\/web\/app\/routeTree\.gen\.ts$/;
const DISABLE_DIRECTIVE = /(?:oxlint|eslint)-disable(?:-next-line|-line)?\b([^\n]*)/g;

export function runRules(targets = TARGETS) {
  const { status, stdout, stderr, error } = spawnSync(
    process.execPath,
    [OXLINT_BIN, '-c', '.oxlintrc.baseline.json', '--disable-nested-config', '--format', 'json', ...targets],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (error) throw error;
  // oxlint exits 1 whenever it finds a frozen use; anything else means it did not lint.
  if (status !== 0 && status !== 1) throw new Error(`oxlint exited ${status}:\n${stderr}${stdout}`);
  return JSON.parse(stdout).diagnostics.map((diagnostic) => ({
    file: diagnostic.filename,
    rule: diagnostic.code?.match(/team-conventions\(([^)]+)\)/)?.[1] ?? String(diagnostic.code),
    line: diagnostic.labels[0]?.span.line ?? 0,
    message: diagnostic.message,
  }));
}

export function countByFile(findings) {
  const counts = {};
  for (const { file, rule } of findings) {
    counts[file] ??= {};
    counts[file][rule] = (counts[file][rule] ?? 0) + 1;
  }
  return counts;
}

export function compareCounts(baseline, current) {
  const exceeded = [];
  const dropped = [];
  for (const file of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    for (const rule of RULES) {
      const frozen = baseline[file]?.[rule] ?? 0;
      const found = current[file]?.[rule] ?? 0;
      if (found > frozen) exceeded.push({ file, rule, frozen, found });
      if (found < frozen) dropped.push({ file, rule, frozen, found });
    }
  }
  return { exceeded, dropped };
}

export function shrinkBaseline(baseline, current) {
  const shrunk = {};
  for (const file of Object.keys(baseline).sort()) {
    for (const rule of Object.keys(baseline[file]).sort()) {
      const count = Math.min(baseline[file][rule], current[file]?.[rule] ?? 0);
      if (count > 0) (shrunk[file] ??= {})[rule] = count;
    }
  }
  return shrunk;
}

// A disable comment would hide a use from the count, so it fails instead of shrinking the baseline.
export function findSuppressions(file, source) {
  const lines = [];
  for (const match of source.matchAll(DISABLE_DIRECTIVE)) {
    const named = match[1].split('--')[0].replace('*/', '').trim();
    if (named === '' || RULES.some((rule) => named.includes(rule))) {
      lines.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }
  return lines;
}

function git(args, cwd) {
  const { status, stdout, stderr, error } = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (error) throw error;
  if (status !== 0) throw new Error(`git ${args[0]} exited ${status}:\n${stderr}`);
  return stdout;
}

// A base that cannot be resolved throws: skipping would let a raised baseline through a shallow clone.
export function baselineBaseRef(env, cwd) {
  if (env.WORKIT_BASELINE_BASE) return env.WORKIT_BASELINE_BASE;
  return git(['merge-base', 'HEAD', `origin/${env.GITHUB_BASE_REF || 'main'}`], cwd).trim();
}

export function readBaseBaseline(ref, cwd) {
  if (git(['ls-tree', ref, '--', BASELINE_FILE], cwd) === '') return null;
  return JSON.parse(git(['show', `${ref}:${BASELINE_FILE}`], cwd));
}

export function findRaised(base, working) {
  const raised = [];
  for (const [file, rules] of Object.entries(working)) {
    const entries = Object.entries(rules);
    if (entries.length === 0 && base[file] === undefined) raised.push({ file, rule: '(empty)', count: 0 });
    for (const [rule, count] of entries) {
      const frozen = base[file]?.[rule];
      if (frozen === undefined || !Number.isInteger(count) || count > frozen) {
        raised.push({ file, rule, count, frozen });
      }
    }
  }
  return raised;
}

function scanSuppressions() {
  return git(['ls-files', '-co', '--exclude-standard', '--', ...TARGETS], ROOT)
    .split('\n')
    .filter((file) => SOURCE_FILE.test(file) && !EXEMPT_FILE.test(file))
    .filter((file) => existsSync(join(ROOT, file)))
    .flatMap((file) => findSuppressions(file, readFileSync(join(ROOT, file), 'utf8')));
}

function main() {
  const findings = runRules();
  const unexpected = findings.filter(({ rule }) => !RULES.includes(rule));
  const current = countByFile(findings.filter(({ rule }) => RULES.includes(rule)));
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { exceeded, dropped } = compareCounts(baseline, current);
  const suppressions = scanSuppressions();
  const shrink = process.argv.includes('--shrink');
  const next = shrink ? shrinkBaseline(baseline, current) : baseline;
  const baseRef = baselineBaseRef(process.env, ROOT);
  const base = readBaseBaseline(baseRef, ROOT);
  const raised = base === null ? [] : findRaised(base, next);

  if (shrink) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    dropped.length = 0;
  }
  if (base === null) console.log(`state-baseline: shrink-only check skipped, ${baseRef} has no ${BASELINE_FILE}.`);

  for (const { file, rule, message, line } of unexpected) {
    console.error(`${file}:${line} ${rule}: ${message}`);
  }
  for (const { file, rule, frozen, found } of exceeded) {
    console.error(`\n${file}: ${found} ${rule}, baseline allows ${frozen}. Remove the new use:`);
    for (const site of findings.filter((f) => f.file === file && f.rule === rule)) {
      console.error(`  ${file}:${site.line} ${site.message}`);
    }
  }
  for (const { file, rule, frozen, found } of dropped) {
    console.error(`${file}: ${found} ${rule}, baseline still says ${frozen}. Run: pnpm lint:baseline --shrink`);
  }
  for (const site of suppressions) {
    console.error(`${site} disable comment hides ${RULES.join(' or ')} from the baseline. Remove it.`);
  }
  for (const { file, rule, count, frozen } of raised) {
    const was = frozen === undefined ? 'has no such entry' : `has ${frozen}`;
    console.error(`${BASELINE_FILE}: ${file} ${rule} is ${count}, ${baseRef} ${was}. The baseline only shrinks.`);
  }

  if (unexpected.length + exceeded.length + dropped.length + suppressions.length + raised.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(`state-baseline: ${findings.length} frozen uses in ${Object.keys(current).length} files match.`);
}

// realpath: import.meta.url is resolved, so a symlinked invocation would otherwise skip the check and exit 0.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
