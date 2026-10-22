import { describe, expect, it } from 'vitest';
import { MIGRATION_BATCH_LIMIT } from '@app/migration';

import { parseMigrationSearch } from '../../lib/migration-search.js';

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `id-${index}`);
}

describe('/migration route', () => {
  it('exports a TanStack route definition', async () => {
    const module = await import('../../routes/migration.lazy.js');
    expect(module.Route).toBeDefined();
    expect(typeof module.Route.options.component).toBe('function');
  });

  it('validates the library bulk hand-off search params', async () => {
    const module = await import('../../routes/migration.js');
    const validateSearch = module.Route.options.validateSearch;

    expect(
      validateSearch?.({
        ids: ['m1', ' m2 ', 'm1', '', 42],
        sources: ['mangadex', 'mangadex', 'target'],
      }),
    ).toEqual({ handoffError: 'invalid' });
    expect(validateSearch?.({ ids: ['m1', ' m2 ', 'm1'], sources: ['mangadex'] })).toEqual({
      ids: ['m1', 'm2'],
      sources: ['mangadex'],
    });
    expect(validateSearch?.({ ids: 'm1', sources: { provider: 'x' } })).toEqual({
      handoffError: 'invalid',
    });
    expect(validateSearch?.({ ids: ['', '   '], sources: [] })).toEqual({
      handoffError: 'invalid',
    });
    expect(validateSearch?.({ source: ' mangadex ' })).toEqual({ source: 'mangadex' });
    expect(validateSearch?.({ source: '' })).toEqual({});
    expect(validateSearch?.({ source: ['mangadex', 'other'] })).toEqual({
      handoffError: 'invalid',
    });
    expect(validateSearch?.({ source: 42 })).toEqual({ handoffError: 'invalid' });
    expect(validateSearch?.({ id: ['m1'] })).toEqual({});
  });

  it('accepts a full batch and rejects one id more instead of truncating', () => {
    expect(parseMigrationSearch({ ids: ids(MIGRATION_BATCH_LIMIT) })).toEqual({
      ids: ids(MIGRATION_BATCH_LIMIT),
    });
    expect(parseMigrationSearch({ ids: ids(MIGRATION_BATCH_LIMIT + 1) })).toEqual({
      handoffError: 'too-many',
      handoffIdCount: MIGRATION_BATCH_LIMIT + 1,
    });
  });

  it('keeps a full-batch URL under the 8KB request-line limit', () => {
    const uuids = Array.from(
      { length: MIGRATION_BATCH_LIMIT },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    // The router sends the ids as one encoded JSON array; nginx 431s past 8KB.
    const url = `/migration?ids=${encodeURIComponent(JSON.stringify(uuids))}`;

    expect(url.length).toBeLessThanOrEqual(7 * 1024);
  });
});
