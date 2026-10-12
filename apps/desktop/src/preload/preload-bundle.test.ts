import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = dirname(dirname(testDir));
const preloadPath = join(desktopRoot, 'dist/preload/index.js');

describe('desktop preload bundle', () => {
  it('ships CommonJS without top-level import statements', () => {
    const source = readFileSync(preloadPath, 'utf8');
    expect(source).toMatch(/contextBridge\.exposeInMainWorld\(/);
    expect(source).not.toMatch(/^\s*import\s+/m);
    expect(source).toMatch(/require\(["']electron["']\)/);
  });
});
