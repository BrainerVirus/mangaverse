import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import {
  EXEMPT_FILE,
  ROOT,
  applyMoves,
  baselineBaseRef,
  compareCounts,
  countByFile,
  findNewMoves,
  findRaised,
  findSuppressions,
  parseMove,
  readBaseBaseline,
  recordMove,
  runRules,
  shrinkBaseline,
  splitBaseline,
} from "./state-baseline.mjs";

describe("compareCounts", () => {
  const baseline = { "a.tsx": { "no-use-state": 2 } };

  it("passes when counts match", () => {
    assert.deepEqual(compareCounts(baseline, { "a.tsx": { "no-use-state": 2 } }), {
      exceeded: [],
      dropped: [],
    });
  });

  it("flags a use above the frozen count, and any use in a new file", () => {
    const { exceeded } = compareCounts(baseline, {
      "a.tsx": { "no-use-state": 3 },
      "new.tsx": { "no-try-catch": 1 },
    });
    assert.deepEqual(exceeded, [
      { file: "a.tsx", rule: "no-use-state", frozen: 2, found: 3 },
      { file: "new.tsx", rule: "no-try-catch", frozen: 0, found: 1 },
    ]);
  });

  it("flags a file below its frozen count, including a deleted file", () => {
    assert.deepEqual(compareCounts(baseline, { "a.tsx": { "no-use-state": 1 } }).dropped, [
      { file: "a.tsx", rule: "no-use-state", frozen: 2, found: 1 },
    ]);
    assert.deepEqual(compareCounts(baseline, {}).dropped, [
      { file: "a.tsx", rule: "no-use-state", frozen: 2, found: 0 },
    ]);
  });

  it("does not let a drop in one file pay for a rise in another", () => {
    const { exceeded, dropped } = compareCounts(
      { "a.tsx": { "no-use-state": 1 } },
      { "b.tsx": { "no-use-state": 1 } },
    );
    assert.equal(exceeded.length, 1);
    assert.equal(dropped.length, 1);
  });
});

describe("shrinkBaseline", () => {
  it("lowers counts and removes emptied files", () => {
    const baseline = {
      "a.tsx": { "no-use-state": 2, "no-try-catch": 1 },
      "gone.tsx": { "no-try-catch": 1 },
    };
    assert.deepEqual(shrinkBaseline(baseline, { "a.tsx": { "no-use-state": 1 } }), {
      "a.tsx": { "no-use-state": 1 },
    });
  });

  it("never raises a count or adds a file", () => {
    const baseline = { "a.tsx": { "no-use-state": 1 } };
    const current = { "a.tsx": { "no-use-state": 5 }, "new.tsx": { "no-try-catch": 1 } };
    assert.deepEqual(shrinkBaseline(baseline, current), baseline);
  });
});

describe("findSuppressions", () => {
  it("flags directives naming the rules and blanket ones, on the right line", () => {
    const source = [
      "// oxlint-disable-next-line team-conventions/no-use-state -- reason",
      "const a = 1;",
      "/* eslint-disable */",
      "// oxlint-disable-line team-conventions/no-try-catch",
    ].join("\n");
    assert.deepEqual(findSuppressions("a.tsx", source), ["a.tsx:1", "a.tsx:3", "a.tsx:4"]);
  });

  it("ignores directives for other rules", () => {
    const source = "/* oxlint-disable shadcn/no-inline-styles -- measured */";
    assert.deepEqual(findSuppressions("a.tsx", source), []);
  });
});

describe("findRaised", () => {
  const base = { "a.tsx": { "no-use-state": 2, "no-try-catch": 1 } };

  it("flags a raised count", () => {
    assert.deepEqual(findRaised(base, { "a.tsx": { "no-use-state": 3, "no-try-catch": 1 } }), [
      { file: "a.tsx", rule: "no-use-state", count: 3, frozen: 2 },
    ]);
  });

  it("flags an added file and an added rule, even at zero", () => {
    assert.deepEqual(
      findRaised(
        { "a.tsx": { "no-use-state": 2 } },
        {
          "a.tsx": { "no-use-state": 2, "no-try-catch": 0 },
          "new.tsx": { "no-use-state": 1 },
          "empty.tsx": {},
        },
      ),
      [
        { file: "a.tsx", rule: "no-try-catch", count: 0, frozen: undefined },
        { file: "new.tsx", rule: "no-use-state", count: 1, frozen: undefined },
        { file: "empty.tsx", rule: "(empty)", count: 0 },
      ],
    );
  });

  it("flags a count that is not an integer, which the tree comparison cannot judge", () => {
    assert.equal(findRaised(base, { "a.tsx": { "no-use-state": "many" } }).length, 1);
  });

  it("allows equal and lowered counts and removed entries", () => {
    assert.deepEqual(findRaised(base, base), []);
    assert.deepEqual(findRaised(base, { "a.tsx": { "no-use-state": 1 } }), []);
    assert.deepEqual(findRaised(base, {}), []);
  });
});

describe("parseMove", () => {
  it("is null without the flag, and normalizes the two paths to the repo root", () => {
    assert.equal(parseMove(["--shrink"]), null);
    assert.deepEqual(parseMove(["--move", "./apps/a.tsx", "apps/b/../b.tsx"]), {
      from: "apps/a.tsx",
      to: "apps/b.tsx",
    });
  });

  it("rejects missing paths and a combined --shrink", () => {
    for (const argv of [
      ["--move"],
      ["--move", "a.tsx"],
      ["--move", "a.tsx", "--shrink"],
      ["--shrink", "--move", "a", "b"],
    ]) {
      assert.ok(parseMove(argv).error);
    }
  });
});

describe("recordMove", () => {
  it("carries a rename and removes the emptied source", () => {
    const counts = { "old.tsx": { "no-use-state": 2 } };
    assert.deepEqual(
      recordMove(counts, { "new.tsx": { "no-use-state": 2 } }, "old.tsx", "new.tsx"),
      {
        counts: { "new.tsx": { "no-use-state": 2 } },
        move: { from: "old.tsx", to: "new.tsx", rules: { "no-use-state": 2 } },
      },
    );
    assert.deepEqual(counts, { "old.tsx": { "no-use-state": 2 } });
  });

  it("carries part of a split and adds to an existing destination", () => {
    const counts = { "a.tsx": { "no-try-catch": 3 }, "b.tsx": { "no-try-catch": 1 } };
    const { counts: next, move } = recordMove(
      counts,
      { "a.tsx": { "no-try-catch": 1 }, "b.tsx": { "no-try-catch": 2 } },
      "a.tsx",
      "b.tsx",
    );
    assert.deepEqual(next, { "a.tsx": { "no-try-catch": 2 }, "b.tsx": { "no-try-catch": 2 } });
    assert.deepEqual(move.rules, { "no-try-catch": 1 });
  });

  it("refuses a destination that gained more than the source lost, or another rule", () => {
    const counts = { "a.tsx": { "no-use-state": 2 } };
    const unbalanced = { "a.tsx": { "no-use-state": 1 }, "b.tsx": { "no-use-state": 2 } };
    assert.match(
      recordMove(counts, unbalanced, "a.tsx", "b.tsx").error,
      /gained 2 no-use-state but a\.tsx lost only 1/,
    );
    const other = { "b.tsx": { "no-use-state": 2, "no-try-catch": 1 } };
    assert.match(
      recordMove(counts, other, "a.tsx", "b.tsx").error,
      /gained 1 no-try-catch but a\.tsx lost only 0/,
    );
  });

  it("refuses an unknown source, a move to itself, and a destination that gained nothing", () => {
    const counts = { "a.tsx": { "no-use-state": 1 } };
    assert.match(recordMove(counts, {}, "x.tsx", "a.tsx").error, /no entry/);
    assert.match(recordMove(counts, counts, "a.tsx", "a.tsx").error, /twice/);
    assert.match(recordMove(counts, {}, "a.tsx", "b.tsx").error, /nothing to move/);
  });
});

describe("findNewMoves", () => {
  const move = { from: "a.tsx", to: "b.tsx", rules: { "no-use-state": 1 } };

  it("skips what the base holds, but not a repeat of it", () => {
    assert.deepEqual(findNewMoves([move], [move]), []);
    assert.deepEqual(findNewMoves([move], [move, { ...move }]), [move]);
    assert.deepEqual(findNewMoves([], [move]), [move]);
  });

  it("keeps a malformed list so the guard can reject it", () => {
    assert.deepEqual(findNewMoves([], { "a.tsx": "b.tsx" }), [{ "a.tsx": "b.tsx" }]);
  });
});

describe("applyMoves", () => {
  const base = { "a.tsx": { "no-use-state": 2 } };
  const move = { from: "a.tsx", to: "b.tsx", rules: { "no-use-state": 2 } };

  it("accepts a balanced move, leaving nothing raised", () => {
    const working = { "b.tsx": { "no-use-state": 2 } };
    const { ceiling, errors } = applyMoves(base, [move], working);
    assert.deepEqual(errors, []);
    assert.deepEqual(findRaised(ceiling, working), []);
  });

  it("fails the raise when the source did not shrink", () => {
    const working = { "a.tsx": { "no-use-state": 2 }, "b.tsx": { "no-use-state": 2 } };
    const { ceiling, errors } = applyMoves(base, [move], working);
    assert.deepEqual(errors, []);
    assert.deepEqual(findRaised(ceiling, working), [
      { file: "a.tsx", rule: "no-use-state", count: 2, frozen: 0 },
    ]);
  });

  it("allows a destination to shrink below the moved uses and fails a raise above them", () => {
    const below = applyMoves(base, [move], { "b.tsx": { "no-use-state": 1 } });
    assert.deepEqual(below.errors, []);
    assert.deepEqual(findRaised(below.ceiling, { "b.tsx": { "no-use-state": 1 } }), []);

    assert.match(
      applyMoves(base, [move], { "b.tsx": { "no-use-state": 3 } }).errors[0],
      /b\.tsx no-use-state is 3, its recorded moves carry it to 2/,
    );
  });

  it("fails a record carrying more than its source holds, and gives it no credit", () => {
    const greedy = { ...move, rules: { "no-use-state": 3 } };
    const working = { "b.tsx": { "no-use-state": 3 } };
    const { ceiling, errors } = applyMoves(base, [greedy], working);
    assert.match(errors[0], /carries 3 no-use-state, source has 2/);
    assert.equal(findRaised(ceiling, working).length, 1);
  });

  it("follows a chain and cannot spend a count twice", () => {
    const chain = [move, { from: "b.tsx", to: "c.tsx", rules: { "no-use-state": 2 } }];
    assert.deepEqual(applyMoves(base, chain, { "c.tsx": { "no-use-state": 2 } }).errors, []);
    const twice = [move, { ...move, to: "c.tsx" }];
    assert.match(applyMoves(base, twice, {}).errors[0], /source has 0/);
  });

  it("rejects malformed records, without touching the prototype", () => {
    const malformed = [
      null,
      { "a.tsx": "b.tsx" },
      { ...move, to: "a.tsx" },
      { ...move, to: "__proto__" },
      { ...move, rules: {} },
      { ...move, rules: { "no-use-state": -1 } },
      { ...move, rules: { "no-use-state": 0.5 } },
      { ...move, rules: { "no-use-effect": 1 } },
    ];
    for (const record of malformed) {
      const { ceiling, errors } = applyMoves(base, [record], {});
      assert.match(errors[0], /malformed/);
      assert.deepEqual(ceiling, base);
    }
    assert.equal({}["no-use-state"], undefined);
  });
});

describe("splitBaseline", () => {
  it("separates the moves from the file counts", () => {
    assert.deepEqual(splitBaseline({ "a.tsx": {}, moves: [1] }), {
      counts: { "a.tsx": {} },
      moves: [1],
    });
    assert.deepEqual(splitBaseline({ "a.tsx": {} }), { counts: { "a.tsx": {} }, moves: [] });
  });
});

const GIT_CONFIG = [
  "-c",
  "user.name=t",
  "-c",
  "user.email=t@t",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "core.hooksPath=/dev/null",
];

function runGit(cwd, ...args) {
  const { status, stdout, stderr } = spawnSync("git", [...GIT_CONFIG, ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(status, 0, stderr);
  return stdout.trim();
}

function commitAll(cwd, message) {
  runGit(cwd, "add", "-A");
  runGit(cwd, "commit", "--allow-empty", "-qm", message);
  return runGit(cwd, "rev-parse", "HEAD");
}

describe("the base baseline, from git", () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "state-baseline-git-"));
    runGit(dir, "init", "-q");
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the committed file, null when the base has none, and throws on an unknown ref", () => {
    const without = commitAll(dir, "no baseline");
    mkdirSync(join(dir, "lint"));
    writeFileSync(join(dir, "lint/baseline.json"), '{"a.tsx":{"no-use-state":1}}');
    const withFile = commitAll(dir, "baseline");
    assert.equal(readBaseBaseline(without, dir), null);
    assert.deepEqual(readBaseBaseline(withFile, dir), { "a.tsx": { "no-use-state": 1 } });
    assert.throws(() => readBaseBaseline("no-such-ref", dir));
  });

  it("uses the override, else the merge base with the CI base ref or origin/main", () => {
    const forkPoint = commitAll(dir, "fork point");
    runGit(dir, "checkout", "-qb", "trunk");
    const trunkAhead = commitAll(dir, "trunk moved on");
    runGit(dir, "update-ref", "refs/remotes/origin/main", trunkAhead);
    runGit(dir, "update-ref", "refs/remotes/origin/develop", forkPoint);
    runGit(dir, "checkout", "-qb", "feature", forkPoint);
    commitAll(dir, "feature");

    assert.equal(baselineBaseRef({}, dir), forkPoint);
    assert.equal(baselineBaseRef({ GITHUB_BASE_REF: "develop" }, dir), forkPoint);
    assert.equal(baselineBaseRef({ GITHUB_BASE_REF: "" }, dir), forkPoint);
    assert.equal(
      baselineBaseRef({ WORKIT_BASELINE_BASE: "abc123", GITHUB_BASE_REF: "develop" }, dir),
      "abc123",
    );
    assert.throws(() => baselineBaseRef({ GITHUB_BASE_REF: "missing" }, dir));
  });
});

// Runs the real script in a throwaway repo, so main() itself has to apply the guard.
describe("the shrink-only guard, through the script", () => {
  const USE = "import { useState } from 'react';\nexport const a = () => useState(0);\n";
  const TWO = `${USE}export const b = () => useState(0);\n`;
  let dir;

  function write(baseline, source = USE) {
    writeFileSync(join(dir, "lint/baseline.json"), JSON.stringify(baseline));
    writeFileSync(join(dir, "apps/a.tsx"), source);
  }

  function check(...args) {
    const env = { ...process.env, WORKIT_BASELINE_BASE: base };
    delete env.GITHUB_BASE_REF;
    return spawnSync(process.execPath, ["lint/state-baseline.mjs", ...args], {
      cwd: dir,
      env,
      encoding: "utf8",
    });
  }

  const one = { "apps/a.tsx": { "no-use-state": 1 } };
  let base;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "state-baseline-run-"));
    for (const sub of ["lint", "apps", "packages"]) mkdirSync(join(dir, sub));
    for (const file of [
      "lint/state-baseline.mjs",
      "lint/team-conventions.cjs",
      ".oxlintrc.baseline.json",
    ]) {
      copyFileSync(join(ROOT, file), join(dir, file));
    }
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
    writeFileSync(join(dir, ".gitignore"), "node_modules\n");
    writeFileSync(join(dir, "vitest.config.ts"), "export default {};\n");
    runGit(dir, "init", "-q");
    write(one);
    base = commitAll(dir, "base");
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("passes the unchanged tree", () => {
    const { status, stdout } = check();
    assert.equal(status, 0);
    assert.match(stdout, /1 frozen uses in 1 files match/);
  });

  it("fails a raised count even when the tree matches it, naming the entry", () => {
    write({ "apps/a.tsx": { "no-use-state": 2 } }, TWO);
    const { status, stderr } = check();
    assert.equal(status, 1);
    assert.match(stderr, /lint\/baseline\.json: apps\/a\.tsx no-use-state is 2, \w+ has 1\./);
  });

  it("fails an added entry even when the tree matches it, naming the entry", () => {
    write({ ...one, "apps/b.tsx": { "no-use-state": 1 } });
    writeFileSync(join(dir, "apps/b.tsx"), USE);
    const { status, stderr } = check();
    rmSync(join(dir, "apps/b.tsx"));
    assert.equal(status, 1);
    assert.match(
      stderr,
      /lint\/baseline\.json: apps\/b\.tsx no-use-state is 1, \w+ has no such entry\./,
    );
  });

  it("passes a lowered count and a removed entry", () => {
    write({}, "export const a = 1;\n");
    assert.equal(check().status, 0);
  });

  describe("with a move", () => {
    const moved = { "apps/b.tsx": { "no-use-state": 1 } };
    const record = { from: "apps/a.tsx", to: "apps/b.tsx", rules: { "no-use-state": 1 } };

    function renameInTree() {
      write(one, "export const a = 1;\n");
      writeFileSync(join(dir, "apps/b.tsx"), USE);
    }

    const readBaseline = () => JSON.parse(readFileSync(join(dir, "lint/baseline.json"), "utf8"));

    afterEach(() => rmSync(join(dir, "apps/b.tsx"), { force: true }));

    it("fails a rename until the move is recorded, then passes and shows the record", () => {
      renameInTree();
      assert.equal(check().status, 1);
      const { status, stdout, stderr } = check("--move", "apps/a.tsx", "apps/b.tsx");
      assert.equal(status, 0, stderr);
      assert.match(stdout, /recorded/);
      assert.deepEqual(readBaseline(), { ...moved, moves: [record] });
      assert.equal(check().status, 0);
    });

    it("keeps the record through --shrink", () => {
      renameInTree();
      assert.equal(check("--move", "apps/a.tsx", "apps/b.tsx").status, 0);
      assert.equal(check("--shrink").status, 0);
      assert.deepEqual(readBaseline().moves, [record]);
    });

    it("allows the destination to shrink below the moved count", () => {
      renameInTree();
      assert.equal(check("--move", "apps/a.tsx", "apps/b.tsx").status, 0);
      writeFileSync(join(dir, "apps/b.tsx"), "export const b = 1;\n");
      const { status, stderr } = check("--shrink");
      assert.equal(status, 0, stderr);
      assert.equal(readBaseline()["apps/b.tsx"], undefined);
      assert.deepEqual(readBaseline().moves, [record]);
      assert.equal(check().status, 0);
    });

    it("does not write a shrink that still fails", () => {
      write(one);
      writeFileSync(join(dir, "apps/a.tsx"), TWO);
      const before = readBaseline();
      const { status } = check("--shrink");
      assert.equal(status, 1);
      assert.deepEqual(readBaseline(), before);
    });

    it("refuses an unbalanced move, writing nothing", () => {
      write(one);
      writeFileSync(join(dir, "apps/b.tsx"), USE);
      const { status, stderr } = check("--move", "apps/a.tsx", "apps/b.tsx");
      assert.equal(status, 1);
      assert.match(stderr, /apps\/b\.tsx gained 1 no-use-state but apps\/a\.tsx lost only 0/);
      assert.deepEqual(readBaseline(), one);
    });

    it("fails a record whose source entry did not shrink, naming it", () => {
      write({ ...one, ...moved, moves: [record] });
      writeFileSync(join(dir, "apps/b.tsx"), USE);
      const { status, stderr } = check();
      assert.equal(status, 1);
      assert.match(stderr, /apps\/a\.tsx no-use-state is 1, \w+ has 0 after its recorded moves/);
    });

    it("fails a hand-raised count beside a valid record, naming it", () => {
      write({ "apps/b.tsx": { "no-use-state": 2 }, moves: [record] }, "export const a = 1;\n");
      writeFileSync(join(dir, "apps/b.tsx"), TWO);
      const { status, stderr } = check();
      assert.equal(status, 1);
      assert.match(stderr, /apps\/b\.tsx no-use-state is 2, \w+ has 1 after its recorded moves/);
    });

    it("gives no second credit for a record the base already holds", () => {
      const previous = base;
      write({ ...moved, moves: [record] }, "export const a = 1;\n");
      writeFileSync(join(dir, "apps/b.tsx"), USE);
      base = commitAll(dir, "landed move");
      assert.equal(check().status, 0);

      write({ "apps/b.tsx": { "no-use-state": 2 }, moves: [record] }, "export const a = 1;\n");
      writeFileSync(join(dir, "apps/b.tsx"), TWO);
      const { status, stderr } = check();
      base = previous;
      assert.equal(status, 1);
      assert.match(stderr, /apps\/b\.tsx no-use-state is 2, \w+ has 1\./);
    });

    it("fails a malformed list instead of treating it as a file", () => {
      write({ ...one, moves: { "apps/a.tsx": "apps/b.tsx" } });
      const { status, stderr } = check();
      assert.equal(status, 1);
      assert.match(stderr, /malformed/);
    });
  });

  it("skips and says so when the base has no baseline", () => {
    write(one);
    const previous = base;
    rmSync(join(dir, "lint/baseline.json"));
    base = commitAll(dir, "no baseline");
    write(one);
    const { status, stdout } = check();
    base = previous;
    assert.equal(status, 0);
    assert.match(stdout, /shrink-only check skipped, \w+ has no lint\/baseline\.json/);
  });

  it("fails when the base cannot be resolved instead of skipping", () => {
    write(one);
    const previous = base;
    base = "no-such-ref";
    const { status, stderr } = check();
    base = previous;
    assert.equal(status, 1);
    assert.match(stderr, /git ls-tree exited/);
  });
});

describe("the rules on real source, through oxlint", () => {
  let dir;
  const sources = {
    "plain.tsx": `import { useState } from 'react';
export function A() {
  const [a] = useState(0);
  return a;
}
`,
    "forms.tsx": `import React, { useState as useLocal } from 'react';
export function B() {
  const [a] = React.useState(0);
  const [b] = useLocal(0);
  const [c] = React['useState'](0);
  const [d] = React["useState"](0);
  const [e] = React[\`useState\`](0);
  const [f] = React['useMemo'](() => [0], []);
  return a + b + c + d + e + f;
}
`,
    "failure.ts": `export function c(run: () => void) {
  try {
    run();
  } catch {
    return false;
  }
  try {
    run();
  } finally {
    run();
  }
  return true;
}
`,
  };
  const exempt = ["a.test.tsx", "a.spec.ts", "__tests__/a.ts", "e2e-production/a.ts"];

  before(() => {
    dir = mkdtempSync(join(ROOT, "lint/.fixture-"));
    mkdirSync(join(dir, "__tests__"));
    mkdirSync(join(dir, "e2e-production"));
    for (const [name, source] of Object.entries(sources)) writeFileSync(join(dir, name), source);
    for (const name of exempt) writeFileSync(join(dir, name), sources["plain.tsx"]);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("names the file and line of each use and skips test files", () => {
    const rel = relative(ROOT, dir);
    const found = runRules([rel])
      .map(({ file, rule, line }) => `${relative(rel, file)}:${line} ${rule}`)
      .sort();
    assert.deepEqual(found, [
      "failure.ts:2 no-try-catch",
      "forms.tsx:3 no-use-state",
      "forms.tsx:4 no-use-state",
      "forms.tsx:5 no-use-state",
      "forms.tsx:6 no-use-state",
      "forms.tsx:7 no-use-state",
      "plain.tsx:3 no-use-state",
    ]);
  });

  it("counts per file and rule", () => {
    const rel = relative(ROOT, dir);
    assert.deepEqual(countByFile(runRules([rel]))[join(rel, "forms.tsx")], { "no-use-state": 5 });
  });

  it("exempts the same test paths as the oxlint config", () => {
    for (const name of exempt) assert.match(`apps/web/${name}`, EXEMPT_FILE);
    assert.match("apps/web/app/routeTree.gen.ts", EXEMPT_FILE);
    assert.doesNotMatch("apps/web/app/routes/index.tsx", EXEMPT_FILE);
    assert.doesNotMatch("packages/cache/src/testing/fake-web-locks.ts", EXEMPT_FILE);
  });
});
