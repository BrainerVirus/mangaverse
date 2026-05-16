import { describe, expect, it } from 'vitest';

import { importExtensionRegistry } from './registry-import';
import { createSqlJsHarness } from '@app/db/testing';

describe('importExtensionRegistry', () => {
  it('rejects file registry document URL', async () => {
    const { db } = await createSqlJsHarness();
    const r = await importExtensionRegistry(
      {
        document: {
          name: 'Bad',
          registryUrl: 'file:///tmp/index.json',
          entries: [],
        },
      },
      { db },
    );
    expect(r.ok).toBe(false);
  });

  it('persists registry and returns normalized entries', async () => {
    const { db } = await createSqlJsHarness();
    const doc = {
      name: 'Main',
      registryUrl: 'https://reg.example/index.json',
      entries: [
        { name: 'A', manifestUrl: 'https://a.example/m.json' },
        { name: 'Bad', manifestUrl: 'file:///x' },
      ],
    };
    const r = await importExtensionRegistry({ document: doc }, { db });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.entries).toHaveLength(1);
      expect(r.value.warnings.length).toBeGreaterThan(0);
    }
  });
});
