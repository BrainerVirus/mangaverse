import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  EXEMPT_FILE,
  ROOT,
  baselineBaseRef,
  compareCounts,
  countByFile,
  findRaised,
  findSuppressions,
  readBaseBaseline,
  runRules,
  shrinkBaseline,
} from './state-baseline.mjs';

describe('compareCounts', () => {
  const baseline = { 'a.tsx': { 'no-use-state': 2 } };

  it('passes when counts match', () => {
    assert.deepEqual(compareCounts(baseline, { 'a.tsx': { 'no-use-state': 2 } }), {
      exceeded: [],
      dropped: [],
    });
  });

  it('flags a use above the frozen count, and any use in a new file', () => {
    const { exceeded } = compareCounts(baseline, {
      'a.tsx': { 'no-use-state': 3 },
      'new.tsx': { 'no-try-catch': 1 },
    });
    assert.deepEqual(exceeded, [
      { file: 'a.tsx', rule: 'no-use-state', frozen: 2, found: 3 },
      { file: 'new.tsx', rule: 'no-try-catch', frozen: 0, found: 1 },
    ]);
  });

  it('flags a file below its frozen count, including a deleted file', () => {
    assert.deepEqual(compareCounts(baseline, { 'a.tsx': { 'no-use-state': 1 } }).dropped, [
      { file: 'a.tsx', rule: 'no-use-state', frozen: 2, found: 1 },
    ]);
    assert.deepEqual(compareCounts(baseline, {}).dropped, [
      { file: 'a.tsx', rule: 'no-use-state', frozen: 2, found: 0 },
    ]);
  });

  it('does not let a drop in one file pay for a rise in another', () => {
    const { exceeded, dropped } = compareCounts({ 'a.tsx': { 'no-use-state': 1 } }, { 'b.tsx': { 'no-use-state': 1 } });
    assert.equal(exceeded.length, 1);
    assert.equal(dropped.length, 1);
  });
});

describe('shrinkBaseline', () => {
  it('lowers counts and removes emptied files', () => {
    const baseline = {
      'a.tsx': { 'no-use-state': 2, 'no-try-catch': 1 },
      'gone.tsx': { 'no-try-catch': 1 },
    };
    assert.deepEqual(shrinkBaseline(baseline, { 'a.tsx': { 'no-use-state': 1 } }), {
      'a.tsx': { 'no-use-state': 1 },
    });
  });

  it('never raises a count or adds a file', () => {
    const baseline = { 'a.tsx': { 'no-use-state': 1 } };
    const current = { 'a.tsx': { 'no-use-state': 5 }, 'new.tsx': { 'no-try-catch': 1 } };
    assert.deepEqual(shrinkBaseline(baseline, current), baseline);
  });
});

describe('findSuppressions', () => {
  it('flags directives naming the rules and blanket ones, on the right line', () => {
    const source = [
      '// oxlint-disable-next-line team-conventions/no-use-state -- reason',
      'const a = 1;',
      '/* eslint-disable */',
      '// oxlint-disable-line team-conventions/no-try-catch',
    ].join('\n');
    assert.deepEqual(findSuppressions('a.tsx', source), ['a.tsx:1', 'a.tsx:3', 'a.tsx:4']);
  });

  it('ignores directives for other rules', () => {
    const source = '/* oxlint-disable shadcn/no-inline-styles -- measured */';
    assert.deepEqual(findSuppressions('a.tsx', source), []);
  });
});

describe('findRaised', () => {
  const base = { 'a.tsx': { 'no-use-state': 2, 'no-try-catch': 1 } };

  it('flags a raised count', () => {
    assert.deepEqual(findRaised(base, { 'a.tsx': { 'no-use-state': 3, 'no-try-catch': 1 } }), [
      { file: 'a.tsx', rule: 'no-use-state', count: 3, frozen: 2 },
    ]);
  });

  it('flags an added file and an added rule, even at zero', () => {
    assert.deepEqual(
      findRaised(
        { 'a.tsx': { 'no-use-state': 2 } },
        {
          'a.tsx': { 'no-use-state': 2, 'no-try-catch': 0 },
          'new.tsx': { 'no-use-state': 1 },
          'empty.tsx': {},
        },
      ),
      [
        { file: 'a.tsx', rule: 'no-try-catch', count: 0, frozen: undefined },
        { file: 'new.tsx', rule: 'no-use-state', count: 1, frozen: undefined },
        { file: 'empty.tsx', rule: '(empty)', count: 0 },
      ],
    );
  });

  it('flags a count that is not an integer, which the tree comparison cannot judge', () => {
    assert.equal(findRaised(base, { 'a.tsx': { 'no-use-state': 'many' } }).length, 1);
  });

  it('allows equal and lowered counts and removed entries', () => {
    assert.deepEqual(findRaised(base, base), []);
    assert.deepEqual(findRaised(base, { 'a.tsx': { 'no-use-state': 1 } }), []);
    assert.deepEqual(findRaised(base, {}), []);
  });
});

const GIT_CONFIG = [
  '-c',
  'user.name=t',
  '-c',
  'user.email=t@t',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

function runGit(cwd, ...args) {
  const { status, stdout, stderr } = spawnSync('git', [...GIT_CONFIG, ...args], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(status, 0, stderr);
  return stdout.trim();
}

function commitAll(cwd, message) {
  runGit(cwd, 'add', '-A');
  runGit(cwd, 'commit', '--allow-empty', '-qm', message);
  return runGit(cwd, 'rev-parse', 'HEAD');
}

describe('the base baseline, from git', () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'state-baseline-git-'));
    runGit(dir, 'init', '-q');
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the committed file, null when the base has none, and throws on an unknown ref', () => {
    const without = commitAll(dir, 'no baseline');
    mkdirSync(join(dir, 'lint'));
    writeFileSync(join(dir, 'lint/baseline.json'), '{"a.tsx":{"no-use-state":1}}');
    const withFile = commitAll(dir, 'baseline');
    assert.equal(readBaseBaseline(without, dir), null);
    assert.deepEqual(readBaseBaseline(withFile, dir), { 'a.tsx': { 'no-use-state': 1 } });
    assert.throws(() => readBaseBaseline('no-such-ref', dir));
  });

  it('uses the override, else the merge base with the CI base ref or origin/main', () => {
    const forkPoint = commitAll(dir, 'fork point');
    runGit(dir, 'checkout', '-qb', 'trunk');
    const trunkAhead = commitAll(dir, 'trunk moved on');
    runGit(dir, 'update-ref', 'refs/remotes/origin/main', trunkAhead);
    runGit(dir, 'update-ref', 'refs/remotes/origin/develop', forkPoint);
    runGit(dir, 'checkout', '-qb', 'feature', forkPoint);
    commitAll(dir, 'feature');

    assert.equal(baselineBaseRef({}, dir), forkPoint);
    assert.equal(baselineBaseRef({ GITHUB_BASE_REF: 'develop' }, dir), forkPoint);
    assert.equal(baselineBaseRef({ GITHUB_BASE_REF: '' }, dir), forkPoint);
    assert.equal(baselineBaseRef({ WORKIT_BASELINE_BASE: 'abc123', GITHUB_BASE_REF: 'develop' }, dir), 'abc123');
    assert.throws(() => baselineBaseRef({ GITHUB_BASE_REF: 'missing' }, dir));
  });
});

// Runs the real script in a throwaway repo, so main() itself has to apply the guard.
describe('the shrink-only guard, through the script', () => {
  const USE = "import { useState } from 'react';\nexport const a = () => useState(0);\n";
  const TWO = `${USE}export const b = () => useState(0);\n`;
  let dir;

  function write(baseline, source = USE) {
    writeFileSync(join(dir, 'lint/baseline.json'), JSON.stringify(baseline));
    writeFileSync(join(dir, 'apps/a.tsx'), source);
  }

  function check() {
    const env = { ...process.env, WORKIT_BASELINE_BASE: base };
    delete env.GITHUB_BASE_REF;
    return spawnSync(process.execPath, ['lint/state-baseline.mjs'], {
      cwd: dir,
      env,
      encoding: 'utf8',
    });
  }

  const one = { 'apps/a.tsx': { 'no-use-state': 1 } };
  let base;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'state-baseline-run-'));
    for (const sub of ['lint', 'apps', 'packages']) mkdirSync(join(dir, sub));
    for (const file of ['lint/state-baseline.mjs', 'lint/team-conventions.cjs', '.oxlintrc.baseline.json']) {
      copyFileSync(join(ROOT, file), join(dir, file));
    }
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    writeFileSync(join(dir, 'vitest.config.ts'), 'export default {};\n');
    runGit(dir, 'init', '-q');
    write(one);
    base = commitAll(dir, 'base');
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('passes the unchanged tree', () => {
    const { status, stdout } = check();
    assert.equal(status, 0);
    assert.match(stdout, /1 frozen uses in 1 files match/);
  });

  it('fails a raised count even when the tree matches it, naming the entry', () => {
    write({ 'apps/a.tsx': { 'no-use-state': 2 } }, TWO);
    const { status, stderr } = check();
    assert.equal(status, 1);
    assert.match(stderr, /lint\/baseline\.json: apps\/a\.tsx no-use-state is 2, \w+ has 1\./);
  });

  it('fails an added entry even when the tree matches it, naming the entry', () => {
    write({ ...one, 'apps/b.tsx': { 'no-use-state': 1 } });
    writeFileSync(join(dir, 'apps/b.tsx'), USE);
    const { status, stderr } = check();
    rmSync(join(dir, 'apps/b.tsx'));
    assert.equal(status, 1);
    assert.match(stderr, /lint\/baseline\.json: apps\/b\.tsx no-use-state is 1, \w+ has no such entry\./);
  });

  it('passes a lowered count and a removed entry', () => {
    write({}, 'export const a = 1;\n');
    assert.equal(check().status, 0);
  });

  it('skips and says so when the base has no baseline', () => {
    write(one);
    const previous = base;
    rmSync(join(dir, 'lint/baseline.json'));
    base = commitAll(dir, 'no baseline');
    write(one);
    const { status, stdout } = check();
    base = previous;
    assert.equal(status, 0);
    assert.match(stdout, /shrink-only check skipped, \w+ has no lint\/baseline\.json/);
  });

  it('fails when the base cannot be resolved instead of skipping', () => {
    write(one);
    const previous = base;
    base = 'no-such-ref';
    const { status, stderr } = check();
    base = previous;
    assert.equal(status, 1);
    assert.match(stderr, /git ls-tree exited/);
  });
});

describe('the rules on real source, through oxlint', () => {
  let dir;
  const sources = {
    'plain.tsx': `import { useState } from 'react';
export function A() {
  const [a] = useState(0);
  return a;
}
`,
    'forms.tsx': `import React, { useState as useLocal } from 'react';
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
    'failure.ts': `export function c(run: () => void) {
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
  const exempt = ['a.test.tsx', 'a.spec.ts', '__tests__/a.ts', 'e2e-production/a.ts'];

  before(() => {
    dir = mkdtempSync(join(ROOT, 'lint/.fixture-'));
    mkdirSync(join(dir, '__tests__'));
    mkdirSync(join(dir, 'e2e-production'));
    for (const [name, source] of Object.entries(sources)) writeFileSync(join(dir, name), source);
    for (const name of exempt) writeFileSync(join(dir, name), sources['plain.tsx']);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('names the file and line of each use and skips test files', () => {
    const rel = relative(ROOT, dir);
    const found = runRules([rel])
      .map(({ file, rule, line }) => `${relative(rel, file)}:${line} ${rule}`)
      .sort();
    assert.deepEqual(found, [
      'failure.ts:2 no-try-catch',
      'forms.tsx:3 no-use-state',
      'forms.tsx:4 no-use-state',
      'forms.tsx:5 no-use-state',
      'forms.tsx:6 no-use-state',
      'forms.tsx:7 no-use-state',
      'plain.tsx:3 no-use-state',
    ]);
  });

  it('counts per file and rule', () => {
    const rel = relative(ROOT, dir);
    assert.deepEqual(countByFile(runRules([rel]))[join(rel, 'forms.tsx')], { 'no-use-state': 5 });
  });

  it('exempts the same test paths as the oxlint config', () => {
    for (const name of exempt) assert.match(`apps/web/${name}`, EXEMPT_FILE);
    assert.match('apps/web/app/routeTree.gen.ts', EXEMPT_FILE);
    assert.doesNotMatch('apps/web/app/routes/index.tsx', EXEMPT_FILE);
    assert.doesNotMatch('packages/cache/src/testing/fake-web-locks.ts', EXEMPT_FILE);
  });
});
