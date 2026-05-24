import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('root route styles', () => {
  it('imports design-system globals.css', () => {
    const rootRoutePath = join(testDir, '../routes/__root.tsx');
    const source = readFileSync(rootRoutePath, 'utf8');

    expect(source).toContain("@app/design-system/styles/globals.css");
  });

  it('sources monorepo templates from design-system globals.css', () => {
    const workspaceRoot = join(testDir, '../../../..');
    const globalsPath = join(workspaceRoot, 'packages/design-system/src/styles/globals.css');
    const source = readFileSync(globalsPath, 'utf8');

    expect(source).toContain('@source');
    expect(source).toContain('apps/web/app');
    expect(source).toContain('packages/*/src');
  });
});
