import { describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '@app/db/testing';

import type { MigrationApplyReport } from '@app/db';
import {
  applyMigration,
  buildMigrationApplyReport,
  fetchMigrationCandidates,
  fetchMigrationProviders,
  filterMigrationCandidatesByIds,
  findMissingMigrationMangaIds,
  MigrationPage,
  migrationConfidenceBand,
  previewMigration,
  rankMigrationSearchResults,
  scoreMigrationMatch,
  searchMigrationTargets,
  selectAllMatched,
  summarizeMigrationBatch,
  summarizeMigrationPreview,
  summarizeMigrationRollback,
  toMigrationTargetSearchState,
} from './index.js';
import type { MigrationCandidate, MigrationSearchResult } from './types.js';

describe('@app/migration exports', () => {
  it('exports the migration feature surface', () => {
    expect(typeof MigrationPage).toBe('function');
    expect(typeof fetchMigrationProviders).toBe('function');
    expect(typeof fetchMigrationCandidates).toBe('function');
    expect(typeof previewMigration).toBe('function');
    expect(typeof applyMigration).toBe('function');
  });
});

describe('scoreMigrationMatch', () => {
  it('scores exact and partial title matches', () => {
    expect(scoreMigrationMatch('Naruto', 'Naruto')).toBe(1);
    expect(scoreMigrationMatch('Naruto Shippuden', 'Naruto')).toBeGreaterThan(0.7);
    expect(scoreMigrationMatch('Naruto', 'One Piece')).toBeLessThan(0.3);
  });

  it('reserves an exact score for the normalized exact string', () => {
    const permuted = scoreMigrationMatch('Naruto Shippuden', 'Shippuden Naruto');
    expect(permuted).toBeLessThan(1);
    expect(permuted).toBeGreaterThanOrEqual(0.75);
  });

  it('matches CJK, Cyrillic and Korean titles instead of stripping them', () => {
    expect(scoreMigrationMatch('進撃の巨人', '進撃の巨人')).toBe(1);
    expect(scoreMigrationMatch('進撃の巨人', '進撃の巨人 第2部')).toBeGreaterThan(0.7);

    expect(scoreMigrationMatch('Мастер и Маргарита', 'Мастер и Маргарита')).toBe(1);
    expect(scoreMigrationMatch('Мастер и Маргарита', 'Мастер и Маргарита (роман)')).toBeGreaterThan(
      0.7,
    );

    expect(scoreMigrationMatch('나 혼자만 레벨업', '나 혼자만 레벨업')).toBe(1);
    expect(scoreMigrationMatch('나 혼자만 레벨업', '나 혼자만 레벨업 2')).toBeGreaterThan(0.7);
  });

  it('ranks search candidates by confidence', () => {
    const ranked = rankMigrationSearchResults('Naruto', [
      { providerMangaId: '1', title: 'One Piece' },
      { providerMangaId: '2', title: 'Naruto' },
      { providerMangaId: '3', title: 'Naruto Shippuden' },
    ]);
    expect(ranked[0]?.providerMangaId).toBe('2');
  });
});

describe('migration orchestration', () => {
  it('previews migration through the package API', async () => {
    const { db } = await createSqlJsHarness();
    const providers = await fetchMigrationProviders(db);
    expect(providers).toEqual([]);

    const { createMangaIdentityWithInitialMapping, addLibraryEntry } = await import('@app/db');
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Bleach',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'source-a',
      providerMangaId: 'bleach-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'planned' });

    const candidates = await fetchMigrationCandidates(db, 'source-a');
    expect(candidates).toHaveLength(1);

    const preview = await previewMigration(db, {
      sourceProviderId: 'source-a',
      targetProviderId: 'target-b',
      selections: [
        {
          mangaId: created.value.mangaId,
          targetProviderMangaId: 'bleach-2',
        },
      ],
    });

    expect(summarizeMigrationPreview(preview).canApply).toBe(true);
  });
});

function candidate(mangaId: string, canonicalTitle: string): MigrationCandidate {
  return {
    mangaId,
    canonicalTitle,
    sourceProviderMangaId: `${mangaId}-source`,
    sourceMappingId: `${mangaId}-mapping`,
    isDefaultProvider: true,
    isActiveProvider: true,
  };
}

function result(providerMangaId: string, title: string, confidence: number): MigrationSearchResult {
  return { providerMangaId, title, confidence };
}

describe('migrationConfidenceBand', () => {
  it('labels exact, high, medium and low confidence', () => {
    expect(migrationConfidenceBand(1)).toBe('exact');
    expect(migrationConfidenceBand(0.9)).toBe('high');
    expect(migrationConfidenceBand(0.5)).toBe('medium');
    expect(migrationConfidenceBand(0.2)).toBe('low');
  });
});

describe('searchMigrationTargets', () => {
  it('ranks target results by title confidence', async () => {
    const outcome = await searchMigrationTargets('Naruto', async () => [
      { providerMangaId: 'far', title: 'One Piece' },
      { providerMangaId: 'exact', title: 'Naruto' },
    ]);

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.results[0]?.providerMangaId).toBe('exact');
  });

  it('turns a provider failure into a single row error', async () => {
    const outcome = await searchMigrationTargets('Naruto', async () => {
      throw new Error('provider unavailable');
    });

    expect(outcome).toEqual({ status: 'error', message: 'provider unavailable' });
  });
});

describe('toMigrationTargetSearchState', () => {
  it('keeps the previous error visible while a retry is in flight', () => {
    expect(
      toMigrationTargetSearchState({
        data: { status: 'error', message: 'provider unavailable' },
        isFetching: true,
        error: null,
      }),
    ).toEqual({ isLoading: true, error: 'provider unavailable', results: [] });
  });

  it('maps a query rejection and a ranked result to row state', () => {
    expect(
      toMigrationTargetSearchState({
        data: undefined,
        isFetching: false,
        error: new Error('network down'),
      }),
    ).toEqual({ isLoading: false, error: 'network down', results: [] });

    expect(
      toMigrationTargetSearchState({
        data: {
          status: 'ok',
          results: [{ providerMangaId: '1', title: 'Naruto', confidence: 1 }],
        },
        isFetching: false,
        error: null,
      }),
    ).toEqual({
      isLoading: false,
      error: null,
      results: [{ providerMangaId: '1', title: 'Naruto', confidence: 1 }],
    });
  });
});

describe('batch migration helpers', () => {
  const candidates = [
    candidate('a', 'Naruto'),
    candidate('b', 'Bleach'),
    candidate('c', 'One Piece'),
  ];
  const resultsByMangaId = {
    a: [result('a-remote', 'Naruto', 1), result('a-other', 'Naruto Shippuden', 0.9)],
    b: [result('b-remote', 'Bleach', 1)],
    c: [],
  };
  const blockedMangaIds = new Set(['b']);

  it('selects the best match for unblocked, unselected titles only', () => {
    const selections = selectAllMatched({
      candidates,
      resultsByMangaId,
      selections: { c: 'manual-id' },
      blockedMangaIds,
    });

    expect(selections).toEqual({ a: 'a-remote', c: 'manual-id' });
  });

  it('summarizes selected, matched and blocked titles', () => {
    expect(
      summarizeMigrationBatch({
        candidates,
        selections: { a: 'a-remote', c: 'manual-id' },
        resultsByMangaId,
        blockedMangaIds,
      }),
    ).toEqual({ totalCount: 3, selectedCount: 2, matchedCount: 2, blockedCount: 1 });
  });

  it('limits candidates to the requested ids and reports stale ones', () => {
    expect(
      filterMigrationCandidatesByIds(candidates, ['c', 'a']).map((item) => item.mangaId),
    ).toEqual(['a', 'c']);
    expect(findMissingMigrationMangaIds(candidates, ['a', 'gone'])).toEqual(['gone']);
    expect(filterMigrationCandidatesByIds(candidates, [])).toEqual(candidates);
  });
});

describe('migration reports', () => {
  it('lists applied and skipped titles with the skip reason', () => {
    const report = {
      applied: [{ mangaId: 'a', ok: true, mappingId: 'mapping-a' }],
      skipped: [{ mangaId: 'b', ok: false, error: 'Target id belongs to another title.' }],
    } as unknown as MigrationApplyReport;

    expect(buildMigrationApplyReport(report, { a: 'Naruto' })).toEqual({
      appliedCount: 1,
      skippedCount: 1,
      items: [
        { mangaId: 'a', title: 'Naruto', status: 'applied' },
        {
          mangaId: 'b',
          title: 'b',
          status: 'skipped',
          reason: 'Target id belongs to another title.',
        },
      ],
    });
  });

  it('summarizes rollback skips with titles and reasons', () => {
    const summary = summarizeMigrationRollback(
      {
        restored: [{ mangaId: 'a' }],
        skipped: [{ mangaId: 'b', error: 'The default provider changed.' }],
      },
      { a: 'Naruto', b: 'Bleach' },
    );

    expect(summary).toEqual({
      restoredCount: 1,
      alreadyRestoredCount: 0,
      skippedCount: 1,
      skipped: [{ mangaId: 'b', title: 'Bleach', reason: 'The default provider changed.' }],
    });
  });

  it('counts titles that were already back on the previous mapping', () => {
    expect(
      summarizeMigrationRollback(
        {
          restored: [],
          alreadyRestored: [{ mangaId: 'a' }],
          skipped: [],
        },
        { a: 'Naruto' },
      ),
    ).toEqual({
      restoredCount: 0,
      alreadyRestoredCount: 1,
      skippedCount: 0,
      skipped: [],
    });
  });
});
