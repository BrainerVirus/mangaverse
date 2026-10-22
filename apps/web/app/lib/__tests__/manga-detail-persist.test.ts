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
import {
  toChapterId,
  toChapterPageId,
  toProviderId,
  type ChapterId,
  type ChapterPage,
} from '@app/shared';

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

  it('keeps a switched mapping on the chapter instead of rewriting it under the default mapping', async () => {
    const harness = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(harness.db, {
      canonicalTitle: 'Persisted',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'remote-a',
    });
    if (!created.ok) throw new Error(created.error.message);
    const mapping = await addProviderMapping(harness.db, {
      mangaId: created.value.mangaId,
      providerId: toProviderId('prov-b'),
      providerMangaId: 'remote-b',
    });
    if (!mapping.ok) throw new Error(mapping.error.message);

    const chapterId = toChapterId('switched-chapter');
    const written = await upsertChapterWithPages(harness.db, {
      chapterId,
      mangaId: created.value.mangaId,
      providerMappingId: mapping.value,
      providerId: 'prov-b',
      title: 'Chapter 1',
      index: 1,
      pages: [],
    });
    if (!written.ok) throw new Error(written.error.message);

    const chapter = await getChapter(harness.db, chapterId);
    if (chapter === undefined) throw new Error('chapter should exist');
    const pages: ChapterPage[] = [
      {
        id: toChapterPageId('page-0'),
        index: 0,
        image: { url: 'https://example.com/0.jpg' },
      },
    ];

    await persistChapterPagesToDb(harness.db, chapter, pages);

    const persisted = await getChapter(harness.db, chapterId);
    expect(persisted?.providerMappingId).toBe(mapping.value);
    expect(persisted?.pages.map((page) => page.image.url)).toEqual(['https://example.com/0.jpg']);
  });
});
