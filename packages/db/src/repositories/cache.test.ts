import { expect, it } from 'vitest';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { deleteCacheEntries } from './cache.js';

it('deletes across the SQL ceiling, counting duplicates and missing ids only once', async () => {
  const { db, raw } = await createSqlJsHarness();
  raw.run(`
    WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x < 32766)
    INSERT INTO cache_entries (id, provider_id, manga_id, cache_kind, blob_key, byte_size, last_access_at)
    SELECT 'c-'||x, 'fixture', 'manga', 'image', 'key-'||x, 1, 'now' FROM n;
    INSERT INTO cache_entries (id, provider_id, manga_id, cache_kind, blob_key, byte_size, last_access_at)
    VALUES ('keep', 'fixture', 'manga', 'image', 'keep', 1, 'now');
  `);
  const prepare = raw.prepare.bind(raw);
  raw.prepare = (sql, ...args) => {
    expect((sql.match(/\?/g) ?? []).length).toBeLessThanOrEqual(500);
    return prepare(sql, ...args);
  };
  const ids = Array.from({ length: 32767 }, (_, index) => `c-${32766 - index}`);
  expect(await deleteCacheEntries(db, [...ids, ids[0]!, 'missing'])).toBe(ids.length);
  expect(raw.exec('SELECT id FROM cache_entries')[0]?.values).toEqual([['keep']]);
  expect(await deleteCacheEntries(db, ids)).toBe(0);
  expect(await deleteCacheEntries(db, [])).toBe(0);
  raw.close();
}, 30_000);
