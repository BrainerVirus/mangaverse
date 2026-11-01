// Freezes existing useState and try/catch uses per file (docs/overhaul/01-engineering-rules.md E1).
// oxlint has no baseline feature, so this runs the two rules from .oxlintrc.baseline.json and
// compares the per-file counts with lint/baseline.json: more fails, fewer fails until it is lowered.
// The baseline itself may only shrink against the one committed on the merge base with the trunk,
// except by a record in its `moves` list, which carries frozen uses from one file to another.
//
//   node lint/state-baseline.mjs                    check
//   node lint/state-baseline.mjs --shrink           lower the baseline to the tree; it never raises a count
//   node lint/state-baseline.mjs --move <old> <new> carry the uses that left <old> and arrived in <new>
//
// WORKIT_BASELINE_BASE names the commit to compare the baseline with, instead of the merge base.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = "lint/baseline.json";
const BASELINE_PATH = join(ROOT, BASELINE_FILE);
const OXLINT_BIN = join(ROOT, "node_modules/oxlint/bin/oxlint");
const TARGETS = ["apps", "packages", "vitest.config.ts"];
const RULES = ["no-use-state", "no-try-catch"];

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
// Mirrors ignorePatterns in .oxlintrc.baseline.json; state-baseline.test.mjs keeps them in step.
export const EXEMPT_FILE =
  /\.(test|spec)\.|(^|\/)(__tests__|e2e-production)\/|^apps\/web\/app\/routeTree\.gen\.ts$/;
const DISABLE_DIRECTIVE = /(?:oxlint|eslint)-disable(?:-next-line|-line)?\b([^\n]*)/g;

export function runRules(targets = TARGETS) {
  const { status, stdout, stderr, error } = spawnSync(
    process.execPath,
    [
      OXLINT_BIN,
      "-c",
      ".oxlintrc.baseline.json",
      "--disable-nested-config",
      "--format",
      "json",
      ...targets,
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
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
    const named = match[1].split("--")[0].replace("*/", "").trim();
    if (named === "" || RULES.some((rule) => named.includes(rule))) {
      lines.push(`${file}:${source.slice(0, match.index).split("\n").length}`);
    }
  }
  return lines;
}

// `moves` is the one key of lint/baseline.json that is not a file; every path holds an extension.
export function splitBaseline({ moves = [], ...counts }) {
  return { counts, moves };
}

function serializeBaseline(counts, moves) {
  const hasMoves = !Array.isArray(moves) || moves.length > 0;
  return `${JSON.stringify(hasMoves ? { ...counts, moves } : counts, null, 2)}\n`;
}

export function parseMove(argv) {
  const at = argv.indexOf("--move");
  if (at === -1) return null;
  const [from, to] = argv.slice(at + 1, at + 3);
  if (argv.includes("--shrink")) return { error: "--move and --shrink run separately." };
  if (!from || !to || from.startsWith("--") || to.startsWith("--"))
    return { error: "usage: --move <old> <new>" };
  return { from: relative(ROOT, resolve(ROOT, from)), to: relative(ROOT, resolve(ROOT, to)) };
}

// Carries only what the tree shows arrived in `to` and left `from`, so it cannot raise a rule's total.
export function recordMove(counts, current, from, to) {
  if (from === to) return { error: `--move needs two paths, got ${from} twice.` };
  if (counts[from] === undefined)
    return { error: `${from} has no entry in ${BASELINE_FILE}, nothing to move.` };
  const rules = {};
  for (const rule of RULES) {
    const arrived = (current[to]?.[rule] ?? 0) - (counts[to]?.[rule] ?? 0);
    const left = (counts[from][rule] ?? 0) - (current[from]?.[rule] ?? 0);
    if (arrived <= 0) continue;
    if (arrived > left) {
      return {
        error: `${to} gained ${arrived} ${rule} but ${from} lost only ${left}. Remove the new use.`,
      };
    }
    rules[rule] = arrived;
  }
  if (Object.keys(rules).length === 0)
    return { error: `${to} gained no frozen uses from ${from}, nothing to move.` };

  const next = structuredClone(counts);
  next[to] ??= {};
  for (const [rule, count] of Object.entries(rules)) {
    next[from][rule] -= count;
    next[to][rule] = (next[to][rule] ?? 0) + count;
  }
  // Shrinking to itself only sorts the entries and removes the emptied ones.
  return { counts: shrinkBaseline(next, next), move: { from, to, rules } };
}

// Records the base already holds were spent when they landed; a repeat of one counts as new.
export function findNewMoves(baseMoves, moves) {
  const spent = [].concat(baseMoves).map((move) => JSON.stringify(move));
  return [].concat(moves).filter((move) => {
    const at = spent.indexOf(JSON.stringify(move));
    if (at === -1) return true;
    spent.splice(at, 1);
    return false;
  });
}

function isMoveRecord(move) {
  if (typeof move?.from !== "string" || typeof move.to !== "string" || move.from === move.to)
    return false;
  if (!SOURCE_FILE.test(move.from) || !SOURCE_FILE.test(move.to)) return false;
  if (typeof move.rules !== "object" || move.rules === null || Array.isArray(move.rules))
    return false;
  const entries = Object.entries(move.rules);
  return (
    entries.length > 0 &&
    entries.every(([rule, count]) => RULES.includes(rule) && Number.isInteger(count) && count > 0)
  );
}

// Each move lowers its source and raises its destination by the same count, so the totals of the
// returned ceiling never exceed the base. findRaised then fails a source that did not shrink.
export function applyMoves(base, moves, working) {
  const ceiling = structuredClone(base);
  const errors = [];
  const destinations = new Set();
  for (const move of moves) {
    if (!isMoveRecord(move)) {
      errors.push(
        `${BASELINE_FILE}: move ${JSON.stringify(move)} is malformed. Record it with --move.`,
      );
      continue;
    }
    for (const [rule, count] of Object.entries(move.rules)) {
      const available = ceiling[move.from]?.[rule] ?? 0;
      if (count > available) {
        errors.push(
          `${BASELINE_FILE}: move ${move.from} -> ${move.to} carries ${count} ${rule}, source has ${available}.`,
        );
        continue;
      }
      ceiling[move.from][rule] = available - count;
      ceiling[move.to] ??= {};
      ceiling[move.to][rule] = (ceiling[move.to][rule] ?? 0) + count;
      destinations.add(JSON.stringify([move.to, rule]));
    }
  }
  for (const [file, rule] of [...destinations].map((entry) => JSON.parse(entry))) {
    const count = working[file]?.[rule] ?? 0;
    if (count !== ceiling[file][rule]) {
      errors.push(
        `${BASELINE_FILE}: ${file} ${rule} is ${count}, its recorded moves carry it to ${ceiling[file][rule]}.`,
      );
    }
  }
  return { ceiling, errors };
}

function git(args, cwd) {
  const { status, stdout, stderr, error } = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (error) throw error;
  if (status !== 0) throw new Error(`git ${args[0]} exited ${status}:\n${stderr}`);
  return stdout;
}

// A base that cannot be resolved throws: skipping would let a raised baseline through a shallow clone.
export function baselineBaseRef(env, cwd) {
  if (env.WORKIT_BASELINE_BASE) return env.WORKIT_BASELINE_BASE;
  return git(["merge-base", "HEAD", `origin/${env.GITHUB_BASE_REF || "main"}`], cwd).trim();
}

export function readBaseBaseline(ref, cwd) {
  if (git(["ls-tree", ref, "--", BASELINE_FILE], cwd) === "") return null;
  return JSON.parse(git(["show", `${ref}:${BASELINE_FILE}`], cwd));
}

export function findRaised(base, working) {
  const raised = [];
  for (const [file, rules] of Object.entries(working)) {
    const entries = Object.entries(rules);
    if (entries.length === 0 && base[file] === undefined)
      raised.push({ file, rule: "(empty)", count: 0 });
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
  return git(["ls-files", "-co", "--exclude-standard", "--", ...TARGETS], ROOT)
    .split("\n")
    .filter((file) => SOURCE_FILE.test(file) && !EXEMPT_FILE.test(file))
    .filter((file) => existsSync(join(ROOT, file)))
    .flatMap((file) => findSuppressions(file, readFileSync(join(ROOT, file), "utf8")));
}

function main() {
  const argv = process.argv.slice(2);
  const findings = runRules();
  const unexpected = findings.filter(({ rule }) => !RULES.includes(rule));
  const current = countByFile(findings.filter(({ rule }) => RULES.includes(rule)));
  const { counts: baseline, moves } = splitBaseline(
    JSON.parse(readFileSync(BASELINE_PATH, "utf8")),
  );
  const request = parseMove(argv);
  const recorded =
    request && !request.error ? recordMove(baseline, current, request.from, request.to) : null;
  const moveError = request?.error ?? recorded?.error;
  if (moveError) {
    console.error(`state-baseline: ${moveError}`);
    process.exitCode = 1;
    return;
  }
  const { exceeded, dropped } = compareCounts(recorded ? recorded.counts : baseline, current);
  const suppressions = scanSuppressions();
  const shrink = argv.includes("--shrink");
  const next = recorded ? recorded.counts : shrink ? shrinkBaseline(baseline, current) : baseline;
  const nextMoves = recorded ? [].concat(moves, recorded.move) : moves;
  const baseRef = baselineBaseRef(process.env, ROOT);
  const rawBase = readBaseBaseline(baseRef, ROOT);
  const base = rawBase === null ? null : splitBaseline(rawBase);
  const newMoves = base === null ? [] : findNewMoves(base.moves, nextMoves);
  const { ceiling, errors: moveErrors } =
    base === null ? { errors: [] } : applyMoves(base.counts, newMoves, next);
  const raised = base === null ? [] : findRaised(ceiling, next);

  if (shrink || recorded) writeFileSync(BASELINE_PATH, serializeBaseline(next, nextMoves));
  if (shrink) dropped.length = 0;
  if (base === null)
    console.log(`state-baseline: shrink-only check skipped, ${baseRef} has no ${BASELINE_FILE}.`);
  if (recorded)
    console.log(`state-baseline: recorded ${JSON.stringify(recorded.move)} in ${BASELINE_FILE}.`);

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
    console.error(
      `${file}: ${found} ${rule}, baseline still says ${frozen}. Run: pnpm lint:baseline --shrink`,
    );
  }
  for (const site of suppressions) {
    console.error(
      `${site} disable comment hides ${RULES.join(" or ")} from the baseline. Remove it.`,
    );
  }
  for (const { file, rule, count, frozen } of raised) {
    const was = frozen === undefined ? "has no such entry" : `has ${frozen}`;
    const moved = newMoves.length > 0 ? " after its recorded moves" : "";
    console.error(
      `${BASELINE_FILE}: ${file} ${rule} is ${count}, ${baseRef} ${was}${moved}. The baseline only shrinks.`,
    );
  }
  for (const error of moveErrors) console.error(error);

  if (
    unexpected.length +
      exceeded.length +
      dropped.length +
      suppressions.length +
      raised.length +
      moveErrors.length >
    0
  ) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `state-baseline: ${findings.length} frozen uses in ${Object.keys(current).length} files match.`,
  );
}

// realpath: import.meta.url is resolved, so a symlinked invocation would otherwise skip the check and exit 0.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
