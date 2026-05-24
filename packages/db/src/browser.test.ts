import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = dirname(fileURLToPath(import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'testing') continue;
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function browserReachableSources(): string[] {
  const browserEntry = join(srcRoot, 'browser.ts');
  const visited = new Set<string>();
  const queue = [browserEntry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
      const resolved = join(dirname(file), match[1]!.replace(/\.js$/, '.ts'));
      queue.push(resolved);
    }
  }

  return [...visited];
}

describe('@app/db/browser entry', () => {
  it('does not transitively import Node-only migration modules', () => {
    const reachable = browserReachableSources();
    expect(reachable.some((file) => file.endsWith('/migrations.ts'))).toBe(false);
  });

  it('does not use node: imports in the browser entry graph', () => {
    const reachable = browserReachableSources();
    const nodeImportPattern = /from ['"]node:/;

    for (const file of reachable) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(nodeImportPattern);
    }
  });

  it('exports bundled migration helpers used by the web client', async () => {
    const browser = await import('./browser.js');
    expect(typeof browser.migrateDatabaseFromBundled).toBe('function');
    expect(typeof browser.createDrizzleFromSqlJs).toBe('function');
    expect(typeof browser.upsertInstalledExtension).toBe('function');
  });
});
