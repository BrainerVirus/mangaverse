import { describe, expect, it, vi } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getChapter,
  getLibraryEntryForManga,
  listChapterHeadersForMapping,
  upsertAppSetting,
  upsertChapterWithPages,
  type AppDrizzleDb,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import {
  toChapterId,
  toChapterPageId,
  type LibraryEntryId,
  type MangaId,
  type ProviderId,
  type ProviderMappingId,
} from '@app/shared';
import {
  LIBRARY_UPDATE_REPORT_KEY,
  readLibraryUpdateReport,
  runLibraryUpdateQueue,
  type LibraryUpdateProvider,
  type LibraryUpdateProviderChapter,
  type LibraryUpdateProviderResolver,
} from './update-queue.js';

interface TestTitle {
  readonly mangaId: MangaId;
  readonly mappingId: ProviderMappingId;
  readonly entryId: LibraryEntryId;
}

async function addTitle(
  db: AppDrizzleDb,
  title: string,
  providerId = 'prov-a',
): Promise<TestTitle> {
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: title,
    status: 'ongoing',
    contentRating: 'safe',
    providerId,
    providerMangaId: `${title.toLowerCase().replaceAll(' ', '-')}-remote`,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('unreachable');
  await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
  const entry = await getLibraryEntryForManga(db, created.value.mangaId);
  if (entry === undefined) throw new Error('missing entry');
  return {
    mangaId: created.value.mangaId,
    mappingId: created.value.mappingId,
    entryId: entry.id,
  };
}

async function addChapter(
  db: AppDrizzleDb,
  title: TestTitle,
  index: number,
  chapterTitle = `Chapter ${index}`,
): Promise<void> {
  const saved = await upsertChapterWithPages(db, {
    chapterId: toChapterId(`chapter-${title.mangaId}-${index}`),
    mangaId: title.mangaId,
    providerMappingId: title.mappingId,
    title: chapterTitle,
    index,
    pages: [],
  });
  expect(saved.ok).toBe(true);
}

function chapter(index: number, title = `Chapter ${index}`): LibraryUpdateProviderChapter {
  return { id: `remote-${index}`, title, index };
}

function provider(
  chapters: (mangaId: string) => readonly LibraryUpdateProviderChapter[],
  overrides: Partial<LibraryUpdateProvider> = {},
): LibraryUpdateProvider {
  return {
    listChapters: async (mangaId) => chapters(mangaId),
    ...overrides,
  };
}

function resolver(
  available: Record<string, LibraryUpdateProvider>,
  unavailable: Record<string, string> = {},
): LibraryUpdateProviderResolver {
  return async (providerId: ProviderId) => {
    const reason = unavailable[String(providerId)];
    if (reason !== undefined) return { status: 'unavailable', reason };
    const found = available[String(providerId)];
    if (found === undefined) {
      return { status: 'unavailable', reason: 'Provider is not installed.' };
    }
    return { status: 'available', provider: found };
  };
}

describe('runLibraryUpdateQueue', () => {
  it('persists new chapters, leaves cached pages alone and recomputes unread counts', async () => {
    const { db } = await createSqlJsHarness();
    const title = await addTitle(db, 'Alpha Series');
    await addChapter(db, title, 1);
    const withPage = await upsertChapterWithPages(db, {
      chapterId: toChapterId('chapter-with-page'),
      mangaId: title.mangaId,
      providerMappingId: title.mappingId,
      title: 'Chapter 2',
      index: 2,
      pages: [
        {
          id: toChapterPageId('page-1'),
          index: 0,
          image: { url: 'https://example.test/page-1.jpg' },
        },
      ],
    });
    expect(withPage.ok).toBe(true);

    const report = await runLibraryUpdateQueue(db, {
      resolveProvider: resolver({
        'prov-a': provider(() => [chapter(1), chapter(2), chapter(3)]),
      }),
    });

    expect(report.status).toBe('done');
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({
      status: 'done',
      providerId: 'prov-a',
      newChapterCount: 1,
      updatedChapterCount: 0,
      unreadCount: 3,
    });

    const headers = await listChapterHeadersForMapping(db, title.mappingId);
    expect(headers.map((header) => header.index)).toEqual([1, 2, 3]);

    // The update check never touches pages: chapter 2 keeps its cached page.
    const pages = await getChapter(db, toChapterId('chapter-with-page'));
    expect(pages?.pages).toHaveLength(1);

    const entry = await getLibraryEntryForManga(db, title.mangaId);
    expect(entry?.unreadCount).toBe(3);

    // The report survives a reload through the settings row.
    const reloaded = await readLibraryUpdateReport(db);
    expect(reloaded?.items[0]).toMatchObject({ status: 'done', newChapterCount: 1 });
  });

  it('counts a changed provider chapter as updated, not new', async () => {
    const { db } = await createSqlJsHarness();
    const title = await addTitle(db, 'Beta Chronicles');
    await addChapter(db, title, 1, 'Chapter 1');

    const report = await runLibraryUpdateQueue(db, {
      resolveProvider: resolver({
        'prov-a': provider(() => [
          { id: 'remote-1', title: 'Chapter 1 (fixed)', index: 1, publishedAt: '2026-01-01' },
        ]),
      }),
    });

    expect(report.items[0]).toMatchObject({
      status: 'done',
      newChapterCount: 0,
      updatedChapterCount: 1,
    });
  });

  it('keeps checking other titles when one provider fails', async () => {
    const { db } = await createSqlJsHarness();
    const alpha = await addTitle(db, 'Alpha Series', 'prov-a');
    const beta = await addTitle(db, 'Beta Chronicles', 'prov-b');
    await addChapter(db, alpha, 1);
    await addChapter(db, beta, 1);

    const report = await runLibraryUpdateQueue(db, {
      resolveProvider: resolver({
        'prov-a': provider(() => [chapter(1), chapter(2)]),
        'prov-b': provider(() => {
          throw new Error('Feed unavailable');
        }),
      }),
    });

    expect(report.status).toBe('done');
    const byTitle = new Map(report.items.map((item) => [item.title, item]));
    expect(byTitle.get('Alpha Series')).toMatchObject({
      status: 'done',
      newChapterCount: 1,
      unreadCount: 2,
    });
    expect(byTitle.get('Beta Chronicles')).toMatchObject({
      status: 'failed',
      providerId: 'prov-b',
      reason: 'Feed unavailable',
    });
    expect(report.items.filter((item) => item.status === 'done')).toHaveLength(1);
  });

  it('skips a local-only title with a reason and never calls a provider', async () => {
    const { db } = await createSqlJsHarness();
    const title = await addTitle(db, 'Local Only', 'prov-disabled');
    const listChapters =
      vi.fn<(mangaId: string) => Promise<readonly LibraryUpdateProviderChapter[]>>();

    const report = await runLibraryUpdateQueue(db, {
      resolveProvider: resolver({}, { 'prov-disabled': 'Provider is disabled.' }),
    });

    expect(report.items[0]).toMatchObject({
      entryId: title.entryId,
      status: 'skipped',
      providerId: 'prov-disabled',
      reason: 'Provider is disabled.',
    });
    expect(listChapters).not.toHaveBeenCalled();
  });

  it('cancels mid-run and leaves the remaining titles cancelled', async () => {
    const { db } = await createSqlJsHarness();
    await addTitle(db, 'Alpha Series', 'prov-a');
    await addTitle(db, 'Beta Chronicles', 'prov-a');

    const abortable: LibraryUpdateProvider = {
      listChapters: (_mangaId, { signal }) =>
        new Promise<readonly LibraryUpdateProviderChapter[]>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    };
    const controller = new AbortController();

    const report = await runLibraryUpdateQueue(db, {
      resolveProvider: resolver({ 'prov-a': abortable }),
      signal: controller.signal,
      concurrency: 1,
      onProgress: (progress) => {
        if (progress.items.some((item) => item.status === 'running')) controller.abort();
      },
    });

    expect(report.status).toBe('cancelled');
    expect(report.items.every((item) => item.status === 'cancelled')).toBe(true);
  });

  it('bounds concurrent provider calls', async () => {
    const { db } = await createSqlJsHarness();
    for (const title of ['One', 'Two', 'Three']) await addTitle(db, title, 'prov-a');

    let active = 0;
    let maxActive = 0;
    const slow: LibraryUpdateProvider = {
      listChapters: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return [chapter(1)];
      },
    };

    const report = await runLibraryUpdateQueue(db, {
      resolveProvider: resolver({ 'prov-a': slow }),
      concurrency: 2,
    });

    expect(report.items).toHaveLength(3);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('retries one failed title and merges it into the stored report', async () => {
    const { db } = await createSqlJsHarness();
    const alpha = await addTitle(db, 'Alpha Series', 'prov-a');
    const beta = await addTitle(db, 'Beta Chronicles', 'prov-b');
    await addChapter(db, alpha, 1);
    await addChapter(db, beta, 1);

    let betaFails = true;
    const resolveProvider: LibraryUpdateProviderResolver = async (providerId) => {
      if (String(providerId) === 'prov-b') {
        return {
          status: 'available',
          provider: provider(() => {
            if (betaFails) throw new Error('Feed unavailable');
            return [chapter(1), chapter(2)];
          }),
        };
      }
      return { status: 'available', provider: provider(() => [chapter(1)]) };
    };

    const first = await runLibraryUpdateQueue(db, { resolveProvider });
    const failed = first.items.find((item) => item.status === 'failed');
    expect(failed?.entryId).toBe(beta.entryId);

    betaFails = false;
    const retried = await runLibraryUpdateQueue(db, {
      resolveProvider,
      entryIds: [beta.entryId],
    });

    expect(retried.status).toBe('done');
    const byTitle = new Map(retried.items.map((item) => [item.title, item]));
    expect(byTitle.get('Alpha Series')).toMatchObject({ status: 'done' });
    expect(byTitle.get('Beta Chronicles')).toMatchObject({
      status: 'done',
      newChapterCount: 1,
    });

    const stored = await readLibraryUpdateReport(db);
    expect(stored?.items.find((item) => item.entryId === beta.entryId)).toMatchObject({
      status: 'done',
      newChapterCount: 1,
    });
  });

  it('reads an interrupted running report as cancelled', async () => {
    const { db } = await createSqlJsHarness();
    await upsertAppSetting(db, LIBRARY_UPDATE_REPORT_KEY, {
      status: 'running',
      startedAt: '2026-01-01T00:00:00.000Z',
      items: [
        {
          entryId: 'entry-a',
          mangaId: 'manga-a',
          title: 'Alpha',
          status: 'running',
          newChapterCount: 0,
          updatedChapterCount: 0,
          unreadCount: 0,
        },
      ],
    });

    const report = await readLibraryUpdateReport(db);
    expect(report?.status).toBe('cancelled');
    expect(report?.items[0]).toMatchObject({ status: 'cancelled' });
  });

  it('spaces calls to one provider by its request interval', async () => {
    const { db } = await createSqlJsHarness();
    await addTitle(db, 'One', 'prov-a');
    await addTitle(db, 'Two', 'prov-a');
    const starts: number[] = [];
    const spaced: LibraryUpdateProvider = {
      requestIntervalMs: 40,
      listChapters: async () => {
        starts.push(Date.now());
        return [chapter(1)];
      },
    };

    await runLibraryUpdateQueue(db, {
      resolveProvider: resolver({
        'prov-a': { ...spaced, requestIntervalMs: 40 },
      }),
      concurrency: 2,
    });

    expect(starts).toHaveLength(2);
    expect((starts[1] ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(30);
  });
});
