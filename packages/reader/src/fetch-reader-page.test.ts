import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getChapterReadState,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterId, toChapterPageId, toExtensionInstallId, toProviderId } from '@app/shared';
import { fetchReaderPage } from './fetch-reader-page.js';

describe('fetchReaderPage', () => {
  it('returns undefined when chapter is missing', async () => {
    const { db } = await createSqlJsHarness();
    const page = await fetchReaderPage(db, toChapterId('missing-chapter'));
    expect(page).toBeUndefined();
  });

  it('loads chapter pages, resume index, and reader settings from local db', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Reader Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'reader-1',
      language: 'en',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { mangaId, mappingId } = created.value;
    const chapterId = toChapterId('chapter-reader-1');

    await upsertChapterWithPages(db, {
      chapterId,
      mangaId,
      providerMappingId: mappingId,
      title: 'Chapter 1',
      index: 1,
      pages: [
        {
          id: toChapterPageId('page-1'),
          index: 0,
          image: { url: 'https://example.com/1.jpg', width: 800, height: 1200 },
        },
        {
          id: toChapterPageId('page-2'),
          index: 1,
          image: { url: 'https://example.com/2.jpg', width: 800, height: 1200 },
        },
      ],
    });

    await addLibraryEntry(db, { mangaId, status: 'reading' });
    const nextChapterId = toChapterId('chapter-reader-2');
    await upsertChapterWithPages(db, {
      chapterId: nextChapterId,
      mangaId,
      providerMappingId: mappingId,
      title: 'Chapter 2',
      index: 2,
      pages: [],
    });

    const { upsertChapterReadState } = await import('@app/db');
    await upsertChapterReadState(db, {
      chapterId,
      mangaId,
      progress: {
        readPercent: 50,
        lastPageIndex: 1,
        completed: false,
      },
    });

    const page = await fetchReaderPage(db, chapterId);
    expect(page).toBeDefined();
    expect(page?.chapter.title).toBe('Chapter 1');
    expect(page?.sourceName).toBeUndefined();
    expect(page?.initialCompleted).toBe(false);
    expect(page?.chapter.pageCount).toBe(2);
    expect(page?.initialPageIndex).toBe(1);
    expect(page?.engineSettings.readingMode).toBe('ltr');
    expect(page?.nextChapterId).toBe(nextChapterId);
    expect(page?.previousChapterId).toBeUndefined();
    const nextPage = await fetchReaderPage(db, nextChapterId);
    expect(nextPage?.previousChapterId).toBe(chapterId);
    expect(nextPage?.nextChapterId).toBeUndefined();

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(1);

    const {
      upsertTitleReaderSettings,
      resetTitleReaderSettings,
      getReaderSettings,
      upsertReaderSettings,
    } = await import('@app/db');
    await upsertTitleReaderSettings(db, mangaId, { ...page!.settings, readingMode: 'rtl' });
    expect((await fetchReaderPage(db, chapterId))?.settings.readingMode).toBe('rtl');
    expect((await getReaderSettings(db)).readingMode).toBe('ltr');
    await upsertReaderSettings(db, {
      ...(await getReaderSettings(db)),
      backgroundColor: '#ffffff',
    });
    expect((await fetchReaderPage(db, chapterId))?.settings).toMatchObject({
      readingMode: 'rtl',
      backgroundColor: '#ffffff',
    });
    await resetTitleReaderSettings(db, mangaId);
    expect((await fetchReaderPage(db, chapterId))?.settings.readingMode).toBe('ltr');
  });

  it('Given an installed provider, When the reader opens a chapter, Then it carries the display name', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Attributed',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'attributed',
    });
    if (!created.ok) throw new Error(created.error.message);
    const chapterId = toChapterId('chapter-attributed');
    await upsertChapterWithPages(db, {
      chapterId,
      mangaId: created.value.mangaId,
      providerMappingId: created.value.mappingId,
      providerId: 'prov-a',
      title: 'Chapter 1',
      index: 1,
      pages: [],
    });
    const { upsertInstalledExtension } = await import('@app/db');
    const installed = await upsertInstalledExtension(db, {
      id: toExtensionInstallId('ext-prov-a'),
      manifest: {
        id: toProviderId('prov-a'),
        name: 'Provider A',
        version: '1.0.0',
        source: { url: 'https://example.com/src' },
        compatibility: { platforms: ['web'] },
        capabilities: { 'discovery.search': true },
        permissions: ['network.http'],
        languages: ['en'],
        contentFlags: { nsfw: false, suggestive: false, violence: false },
      },
      sourceUrl: 'https://example.com/ext',
      installedVersion: '1.0.0',
      enabled: true,
      installedAt: new Date().toISOString(),
      state: 'installed',
      health: 'ok',
      warnings: [],
    });
    expect(installed.ok).toBe(true);

    expect((await fetchReaderPage(db, chapterId))?.sourceName).toBe('Provider A');
  });
});
