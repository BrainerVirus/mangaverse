import { describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { createMangaIdentityWithInitialMapping } from './identities.js';
import { toChapterId, toProviderId } from '@app/shared';
import { upsertChapterWithPages } from './chapters.js';
import {
  getDownload,
  listActiveDownloads,
  listDownloadDetails,
  listDownloads,
  listDownloadsForManga,
  removeDownload,
  updateDownloadState,
  upsertDownload,
} from './downloads.js';

const WRITE = {
  chapterId: 'chapter-1',
  mangaId: 'manga-1',
  providerId: 'mangadex',
  status: 'queued' as const,
};

describe('downloads repository', () => {
  it('inserts one row per chapter and keeps its creation time on a rewrite', async () => {
    const { db } = await createSqlJsHarness();

    const first = await upsertDownload(db, {
      ...WRITE,
      pageCount: 5,
      completedPages: 0,
    });
    expect(first).toMatchObject({
      chapterId: 'chapter-1',
      mangaId: 'manga-1',
      providerId: 'mangadex',
      status: 'queued',
      pageCount: 5,
      completedPages: 0,
      attempts: 0,
      failedPageIndexes: [],
    });

    const second = await upsertDownload(db, {
      ...WRITE,
      status: 'downloading',
      pageCount: 5,
      completedPages: 2,
      failedPageIndexes: [4],
      attempts: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second).toMatchObject({
      status: 'downloading',
      completedPages: 2,
      failedPageIndexes: [4],
      attempts: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    // One chapter is one row, never two.
    expect(await listDownloads(db)).toHaveLength(1);
    expect(await getDownload(db, 'chapter-1')).toEqual(second);
  });

  it('lists only unfinished work for startup resume', async () => {
    const { db } = await createSqlJsHarness();
    await upsertDownload(db, { ...WRITE, chapterId: 'queued', status: 'queued' });
    await upsertDownload(db, { ...WRITE, chapterId: 'running', status: 'downloading' });
    await upsertDownload(db, { ...WRITE, chapterId: 'done', status: 'complete' });
    await upsertDownload(db, { ...WRITE, chapterId: 'failed', status: 'failed' });

    expect((await listActiveDownloads(db)).map((row) => row.chapterId).sort()).toEqual([
      'queued',
      'running',
    ]);
    expect((await listDownloadsForManga(db, 'manga-1')).map((row) => row.chapterId).sort()).toEqual(
      ['done', 'failed', 'queued', 'running'],
    );
  });

  it('applies a partial state patch without touching the fields it omits', async () => {
    const { db } = await createSqlJsHarness();
    await upsertDownload(db, {
      ...WRITE,
      status: 'downloading',
      pageCount: 6,
      completedPages: 2,
      attempts: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
    });

    const cancelled = await updateDownloadState(db, 'chapter-1', {
      status: 'cancelled',
      lastErrorCode: 'user-cancelled',
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      pageCount: 6,
      completedPages: 2,
      attempts: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastErrorCode: 'user-cancelled',
    });

    const missing = await updateDownloadState(db, 'absent', { status: 'complete' });
    expect(missing).toBeUndefined();
  });

  it('lists a download with its chapter and title labels for Storage', async () => {
    const { db } = await createSqlJsHarness();
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Download Title',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('mangadex'),
      providerMangaId: 'remote-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { mangaId, mappingId } = created.value;
    await upsertChapterWithPages(db, {
      chapterId: toChapterId('chapter-1'),
      mangaId,
      providerMappingId: mappingId,
      title: 'Chapter One',
      index: 1,
      pages: [],
    });
    await upsertDownload(db, {
      chapterId: 'chapter-1',
      mangaId,
      providerId: 'mangadex',
      status: 'complete',
      pageCount: 3,
      completedPages: 3,
    });

    expect(await listDownloadDetails(db)).toEqual([
      expect.objectContaining({
        chapterId: 'chapter-1',
        mangaId,
        chapterTitle: 'Chapter One',
        chapterIndex: 1,
        mangaTitle: 'Download Title',
        status: 'complete',
      }),
    ]);
  });

  it('reads an unknown status as failed so a newer row can be retried', async () => {
    const { db, raw } = await createSqlJsHarness();
    raw.run(
      `INSERT INTO downloads (chapter_id, manga_id, provider_id, status, created_at, updated_at)
       VALUES ('future', 'manga-1', 'mangadex', 'paused-by-someone-else', 'now', 'now')`,
    );
    expect(await getDownload(db, 'future')).toMatchObject({
      status: 'failed',
      pageCount: 0,
      failedPageIndexes: [],
    });
  });

  it('removes a row and returns what was there', async () => {
    const { db } = await createSqlJsHarness();
    await upsertDownload(db, { ...WRITE, status: 'complete', pageCount: 2, completedPages: 2 });

    expect(await removeDownload(db, 'chapter-1')).toMatchObject({
      chapterId: 'chapter-1',
      status: 'complete',
    });
    expect(await getDownload(db, 'chapter-1')).toBeUndefined();
    expect(await removeDownload(db, 'chapter-1')).toBeUndefined();
  });
});
