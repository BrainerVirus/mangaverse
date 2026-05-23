import { describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '@app/db/testing';

import {
  applyMigration,
  fetchMigrationCandidates,
  fetchMigrationProviders,
  MigrationPage,
  PACKAGE_NAME,
  previewMigration,
  rankMigrationSearchResults,
  scoreMigrationMatch,
  summarizeMigrationPreview,
} from './index.js';

describe('@app/migration exports', () => {
  it('exports the migration feature surface', () => {
    expect(PACKAGE_NAME).toBe('@app/migration');
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

    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'plan_to_read' });

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
