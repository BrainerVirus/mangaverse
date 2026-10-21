import { describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { createMangaIdentityWithInitialMapping, getMangaIdentities } from './identities.js';

describe('getMangaIdentities', () => {
  it('Given many ids, When reading identities, Then statement count does not grow with the list', async () => {
    const { raw, db } = await createSqlJsHarness();
    const ids = [];
    for (let index = 0; index < 24; index++) {
      const created = await createMangaIdentityWithInitialMapping(db, {
        canonicalTitle: `Series ${index}`,
        status: 'ongoing',
        contentRating: 'safe',
        providerId: 'fixture',
        providerMangaId: `series-${index}`,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      ids.push(created.value.mangaId);
    }

    let statements = 0;
    const prepare = raw.prepare.bind(raw);
    raw.prepare = (...args) => {
      statements += 1;
      return prepare(...args);
    };

    const two = await getMangaIdentities(db, ids.slice(0, 2));
    const forTwo = statements;
    statements = 0;
    const all = await getMangaIdentities(db, ids);

    expect(all).toHaveLength(24);
    expect(all[0]?.canonicalTitle).toBe('Series 0');
    expect(all[0]?.providerMappings).toHaveLength(1);
    expect(statements).toBe(forTwo);
    expect(two).toHaveLength(2);
  });
});
