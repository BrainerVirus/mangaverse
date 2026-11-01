import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  EXEMPT_FILE,
  ROOT,
  compareCounts,
  countByFile,
  findSuppressions,
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
    const { exceeded, dropped } = compareCounts(
      { 'a.tsx': { 'no-use-state': 1 } },
      { 'b.tsx': { 'no-use-state': 1 } },
    );
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
  return a + b;
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
      'plain.tsx:3 no-use-state',
    ]);
  });

  it('counts per file and rule', () => {
    const rel = relative(ROOT, dir);
    assert.deepEqual(countByFile(runRules([rel]))[join(rel, 'forms.tsx')], { 'no-use-state': 2 });
  });

  it('exempts the same test paths as the oxlint config', () => {
    for (const name of exempt) assert.match(`apps/web/${name}`, EXEMPT_FILE);
    assert.match('apps/web/app/routeTree.gen.ts', EXEMPT_FILE);
    assert.doesNotMatch('apps/web/app/routes/index.tsx', EXEMPT_FILE);
    assert.doesNotMatch('packages/cache/src/testing/fake-web-locks.ts', EXEMPT_FILE);
  });
});
