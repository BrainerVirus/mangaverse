import { describe, expect, it } from 'vitest';
import { toMangaId } from '@app/shared';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { createMangaIdentityWithInitialMapping, getMangaIdentities } from './identities.js';

describe('getMangaIdentities', () => {
  it('Given identities and tags across two chunks, When reading in reverse order, Then every relation stays attached to its identity', async () => {
    const { raw, db } = await createSqlJsHarness();
    raw.run(`
      WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x < 500)
      INSERT INTO manga_identities (id, canonical_title, status, content_rating, merged, default_provider_mapping_id)
      SELECT 'm-'||x, 'Series '||x, 'ongoing', 'safe', 0, 'mapping-'||x FROM n;
      INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id)
      SELECT default_provider_mapping_id, id, 'fixture', id FROM manga_identities;
      INSERT INTO manga_titles (id, manga_id, value) SELECT id, id, 'Alternate '||id FROM manga_identities;
      INSERT INTO manga_people (id, manga_id, name, kind) SELECT id, id, 'Author '||id, 'author' FROM manga_identities;
      INSERT INTO manga_tags (id, label) SELECT id, 'Tag '||id FROM manga_identities;
      INSERT INTO manga_tag_memberships (manga_id, tag_id) SELECT id, id FROM manga_identities;
    `);
    const ids = Array.from({ length: 501 }, (_, index) => toMangaId(`m-${500 - index}`));
    const result = await getMangaIdentities(db, ids);
    expect(result.map((identity) => identity.id)).toEqual(ids);
    expect(result[0]).toMatchObject({
      canonicalTitle: 'Series 500',
      alternativeTitles: [{ value: 'Alternate m-500' }],
      authors: [{ name: 'Author m-500' }],
      tags: [{ id: 'm-500', label: 'Tag m-500' }],
      providerMappings: [{ providerMangaId: 'm-500' }],
    });
    expect(result[500]).toMatchObject({
      canonicalTitle: 'Series 0',
      tags: [{ id: 'm-0', label: 'Tag m-0' }],
      providerMappings: [{ providerMangaId: 'm-0' }],
    });
    raw.close();
  });
  it('Given more than 32766 ids, When reading identities, Then order, duplicates and relations survive the SQL ceiling', async () => {
    const { raw, db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Boundary series',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'fixture',
      providerMangaId: 'boundary',
    });
    if (!created.ok) throw new Error('Fixture failed');
    const id = created.value.mangaId;
    const ids = Array.from({ length: 32767 }, (_, index) => toMangaId(`missing-${index}`));
    ids[500] = id;
    const result = await getMangaIdentities(db, [...ids, id]);
    expect(result.map((identity) => identity.id)).toEqual([id, id]);
    expect(result[0]?.providerMappings[0]?.providerMangaId).toBe('boundary');
    expect(await getMangaIdentities(db, [])).toEqual([]);
    raw.close();
  });
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
