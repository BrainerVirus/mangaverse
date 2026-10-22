/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  addProviderMapping,
  createMangaIdentityWithInitialMapping,
  getChapter,
  getChapterProviderMappingId,
  setDefaultProviderMapping,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterPageId, type ChapterId } from '@app/shared';

import { persistChapterPagesToDb } from '../manga-detail-persist.js';

describe('persistChapterPagesToDb', () => {
  it('writes pages back to the chapter mapping after the default mapping moved', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Migrated Manga',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: 'source-provider',
      providerMangaId: 'source-remote',
    });
    if (!created.ok) throw new Error(created.error.message);
    const { mangaId, mappingId } = created.value;

    const target = await addProviderMapping(db, {
      mangaId,
      providerId: 'target-provider',
      providerMangaId: 'target-remote',
    });
    if (!target.ok) throw new Error(target.error.message);
    const moved = await setDefaultProviderMapping(db, mangaId, target.value);
    expect(moved.ok).toBe(true);

    const chapter = await upsertChapterWithPages(db, {
      mangaId,
      providerMappingId: mappingId,
      providerId: 'source-provider',
      providerChapterId: 'source-chapter-1',
      title: 'Chapter 1',
      index: 1,
      pages: [],
    });
    if (!chapter.ok) throw new Error(chapter.error.message);

    const local = await getChapter(db, chapter.value);
    if (local === undefined) throw new Error('chapter missing');

    await persistChapterPagesToDb(db, local, [
      {
        id: toChapterPageId('page-1'),
        index: 0,
        image: { url: 'https://example.com/1.png' },
      },
    ]);

    const reloaded = await getChapter(db, chapter.value as ChapterId);
    expect(reloaded?.id).toBe(chapter.value);
    expect(reloaded?.pages).toHaveLength(1);
    expect(await getChapterProviderMappingId(db, chapter.value)).toBe(mappingId);
  });
});
