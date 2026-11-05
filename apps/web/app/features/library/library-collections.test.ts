// @vitest-environment node
// The collections over a real data host on node:sqlite, two windows on one host: what each
// window sees, when, and what a refusal leaves behind.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  addLibraryEntry,
  createDataHostClient,
  createMangaIdentityWithInitialMapping,
  DataHostError,
  getMangaIdentity,
  refreshLibraryUnreadCount,
  setLibraryEntriesStatus,
  upsertChapterMetadata,
  upsertMangaIdentity,
  type AppDrizzleDb,
  type DataHostClient,
} from '@app/db';
import { createDataHost } from '@app/db/host';
import { buildProgressEvent, persistReaderProgress } from '@app/reader';
import { createLiveQueryCollection, eq } from '@tanstack/db';
import { afterEach, describe, expect, it } from 'vitest';
import {
  toLibraryEntryId,
  type LibraryEntryId,
  type LibrarySortKey,
  type LibraryViewState,
} from '@app/shared';
import { createChapterWindowCollection } from './chapter-collection.js';
import { editEntriesOptimistically, libraryCollections } from './library-collections.js';
import { DEFAULT_LIBRARY_VIEW_STATE } from './view-state.js';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function hostWithWindows() {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-collections-'));
  const databasePath = join(directory, 'library.sqlite');
  const host = createDataHost({ databasePath });
  const windows: DataHostClient[] = [];
  /** Every procedure each window asked the host for, in order. */
  const calls: { method: string; args: unknown[] }[][] = [[], []];
  for (let index = 0; index < 2; index += 1) {
    const { port1, port2 } = new MessageChannel();
    host.attach({
      postMessage: (message) => port1.postMessage(message),
      onMessage: (listener) => {
        port1.onmessage = (event) => listener(event.data);
      },
    });
    windows.push(
      createDataHostClient({
        postMessage: (request) => {
          if (request.kind === 'call') calls[index]!.push(request);
          port2.postMessage(request);
        },
        onMessage: (listener) => {
          port2.onmessage = (event) => listener(event.data);
        },
        close: () => port2.close(),
      }),
    );
    cleanups.push(() => {
      port1.close();
      port2.close();
    });
  }
  cleanups.push(() => {
    host.close();
    rmSync(directory, { recursive: true, force: true });
  });
  expect((await windows[0]!.open(null)).ok).toBe(true);
  return {
    databasePath,
    windows: windows as [DataHostClient, DataHostClient],
    calls: calls as [(typeof calls)[0], (typeof calls)[0]],
  };
}

async function seedTitle(db: AppDrizzleDb, title: string, id?: LibraryEntryId) {
  const identity = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: title,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: 'mangadex',
    providerMangaId: title,
  });
  if (!identity.ok) throw new Error(identity.error.message);
  const entry = await addLibraryEntry(db, {
    mangaId: identity.value.mangaId,
    status: 'reading',
    ...(id === undefined ? {} : { id }),
  });
  if (!entry.ok) throw new Error(entry.error.message);
  return { ...identity.value, entryId: entry.value };
}

function itemsOf(client: DataHostClient) {
  return libraryCollections(client.handle, DEFAULT_LIBRARY_VIEW_STATE, (listener) =>
    client.onChange(listener),
  ).items;
}

const statusOf = (items: ReturnType<typeof itemsOf>, id: LibraryEntryId) =>
  items.get(id)?.value.entry.status;

describe('library list collection', () => {
  it('applies an edit at once, keeps it through acceptance, and updates the other window', async () => {
    const { windows } = await hostWithWindows();
    const [a, b] = windows;
    const { entryId } = await seedTitle(a.handle, 'Alpha');
    const first = itemsOf(a);
    const second = itemsOf(b);
    await Promise.all([first.preload(), second.preload()]);
    expect(statusOf(second, entryId)).toBe('reading');

    const seen: string[] = [];
    first.subscribeChanges(() => seen.push(statusOf(first, entryId) ?? 'missing'));
    const saved = editEntriesOptimistically(first, [entryId], {
      field: 'status',
      value: 'completed',
    });
    // Applied synchronously, before the host has answered.
    expect(statusOf(first, entryId)).toBe('completed');
    await saved;
    expect(statusOf(first, entryId)).toBe('completed');
    // The synced row replaced the optimistic one without going back to the old value.
    expect(seen).not.toContain('reading');
    await expect.poll(() => statusOf(second, entryId)).toBe('completed');
  });

  it('rolls a refused edit back with a typed error and leaves SQLite unchanged', async () => {
    const { windows, databasePath } = await hostWithWindows();
    const [a] = windows;
    const { entryId } = await seedTitle(a.handle, 'Locked');
    const items = itemsOf(a);
    await items.preload();

    const side = new DatabaseSync(databasePath);
    side.exec(
      `CREATE TRIGGER lock_status BEFORE UPDATE OF status ON library_entries
       WHEN OLD.id = '${entryId}' BEGIN SELECT RAISE(ABORT, 'entry is locked'); END`,
    );
    const saved = editEntriesOptimistically(items, [entryId], {
      field: 'status',
      value: 'dropped',
    });
    expect(statusOf(items, entryId)).toBe('dropped');
    const error = await saved.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(DataHostError);
    expect((error as DataHostError).message).toMatch(/entry is locked/);
    expect(statusOf(items, entryId)).toBe('reading');
    const stored = side.prepare('SELECT status FROM library_entries WHERE id = ?').get(entryId) as {
      status: string;
    };
    expect(stored.status).toBe('reading');
    side.close();
  });
});

describe('library list after a write', () => {
  type Calls = Awaited<ReturnType<typeof hostWithWindows>>['calls'][0];

  /** Page reads of the view itself: not a count alone (limit 0), not a read of named rows. */
  const listReads = (calls: Calls) =>
    calls.filter((call) => {
      if (call.method !== 'listLibraryEntryPage') return false;
      const query = call.args[0] as { limit: number; entryIds?: unknown };
      return query.limit > 0 && query.entryIds === undefined;
    });

  /**
   * Three titles; the first has two unread chapters, is the oldest, and has the last id, so
   * it ranks last by update time and by read time (none yet, so the id decides).
   */
  async function seedLibrary(db: AppDrizzleDb) {
    const alpha = await seedTitle(db, 'Alpha', toLibraryEntryId('entry-c'));
    const chapterIds = [];
    for (let index = 0; index < 2; index += 1) {
      const created = await upsertChapterMetadata(db, {
        mangaId: alpha.mangaId,
        providerMappingId: alpha.mappingId,
        title: `Chapter ${index}`,
        index,
      });
      if (!created.ok) throw new Error(created.error.message);
      chapterIds.push(created.value.chapterId);
    }
    await refreshLibraryUnreadCount(db, alpha.mangaId, alpha.mappingId);
    const beta = await seedTitle(db, 'Beta', toLibraryEntryId('entry-a'));
    const gamma = await seedTitle(db, 'Gamma', toLibraryEntryId('entry-b'));
    return { alpha, beta, gamma, chapterIds };
  }

  const view = (client: DataHostClient, viewState: LibraryViewState) =>
    libraryCollections(client.handle, viewState, (listener) => client.onChange(listener)).items;

  const sortedBy = (key: LibrarySortKey): LibraryViewState => ({
    ...DEFAULT_LIBRARY_VIEW_STATE,
    sort: { key, direction: 'desc' },
  });

  it('updates the read title in every window without reading the list again', async () => {
    const { windows, calls } = await hostWithWindows();
    const [a, b] = windows;
    const { alpha, chapterIds } = await seedLibrary(a.handle);
    const first = view(a, DEFAULT_LIBRARY_VIEW_STATE);
    const second = view(b, DEFAULT_LIBRARY_VIEW_STATE);
    await Promise.all([first.preload(), second.preload()]);
    expect(second.get(alpha.entryId)?.value.entry.unreadCount).toBe(2);
    const position = second.get(alpha.entryId)?.position;
    calls[0].length = 0;
    calls[1].length = 0;

    // The reader's own save: read state, the unread badge, then the resume progress.
    await persistReaderProgress(a.handle, buildProgressEvent(chapterIds[0]!, alpha.mangaId, 4, 5));

    for (const items of [first, second]) {
      await expect.poll(() => items.get(alpha.entryId)?.value.entry.progressPercent).toBe(100);
      expect(items.get(alpha.entryId)?.value.entry.unreadCount).toBe(1);
      expect(items.get(alpha.entryId)?.position).toBe(position);
      expect(items.size).toBe(3);
    }
    expect(listReads(calls[0])).toEqual([]);
    expect(listReads(calls[1])).toEqual([]);
  });

  it.each(['last_updated', 'last_read'] as const)(
    'reads the %s list again, where reading moves the title',
    async (key) => {
      const { windows, calls } = await hostWithWindows();
      const [a, b] = windows;
      const { alpha, chapterIds } = await seedLibrary(a.handle);
      const items = view(b, sortedBy(key));
      await items.preload();
      expect(items.get(alpha.entryId)?.position).toBe(2);
      calls[1].length = 0;

      await persistReaderProgress(
        a.handle,
        buildProgressEvent(chapterIds[0]!, alpha.mangaId, 0, 5),
      );

      await expect.poll(() => items.get(alpha.entryId)?.position).toBe(0);
      expect(listReads(calls[1]).length).toBeGreaterThan(0);
    },
  );

  it('shows a read state whose resume update was skipped in the unread count of every window', async () => {
    const { windows } = await hostWithWindows();
    const [a, b] = windows;
    const { alpha, chapterIds } = await seedLibrary(a.handle);
    const items = view(b, DEFAULT_LIBRARY_VIEW_STATE);
    await items.preload();
    const at = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
    const [t0, t1, t2] = [at(10), at(20), at(30)];
    const save = (chapterId: string, completed: boolean, timestamp: string) =>
      persistReaderProgress(a.handle, {
        chapterId,
        mangaId: alpha.mangaId,
        pageIndex: completed ? 4 : 0,
        readPercent: completed ? 100 : 20,
        completed,
        timestamp,
      });

    // Chapter 0 finished, then a newer save on chapter 1 owns "continue reading".
    await save(chapterIds[0]!, true, t0);
    await save(chapterIds[1]!, false, t2);
    await expect.poll(() => items.get(alpha.entryId)?.value.entry.unreadCount).toBe(1);

    // Chapter 0 opened again by an event older than t2: its read state is newer and accepted,
    // the resume update is not, and an unfinished save does not recount the badge.
    await save(chapterIds[0]!, false, t1);

    await expect.poll(() => items.get(alpha.entryId)?.value.entry.unreadCount).toBe(2);
  });

  it('shows a chapter written alone in the unread count of every window', async () => {
    const { windows } = await hostWithWindows();
    const [a, b] = windows;
    const { alpha } = await seedLibrary(a.handle);
    const items = view(b, DEFAULT_LIBRARY_VIEW_STATE);
    await items.preload();
    expect(items.get(alpha.entryId)?.value.entry.unreadCount).toBe(2);

    // A provider refresh inserts chapters without recounting the stored badge.
    const created = await upsertChapterMetadata(a.handle, {
      mangaId: alpha.mangaId,
      providerMappingId: alpha.mappingId,
      title: 'Chapter 2',
      index: 2,
    });
    expect(created.ok).toBe(true);

    await expect.poll(() => items.get(alpha.entryId)?.value.entry.unreadCount).toBe(3);
  });

  it('patches the owning row for a chapter write without reading the list again', async () => {
    const { windows, calls } = await hostWithWindows();
    const [a, b] = windows;
    const { alpha } = await seedLibrary(a.handle);
    const items = view(b, DEFAULT_LIBRARY_VIEW_STATE);
    await items.preload();
    const position = items.get(alpha.entryId)?.position;
    calls[1].length = 0;

    const created = await upsertChapterMetadata(a.handle, {
      mangaId: alpha.mangaId,
      providerMappingId: alpha.mappingId,
      title: 'Chapter 2',
      index: 2,
    });
    expect(created.ok).toBe(true);

    await expect.poll(() => items.get(alpha.entryId)?.value.entry.unreadCount).toBe(3);
    expect(items.get(alpha.entryId)?.position).toBe(position);
    expect(listReads(calls[1])).toEqual([]);
  });

  it('reads a burst of chapter writes once on a sort they can move, and lands the host order', async () => {
    const { windows, calls } = await hostWithWindows();
    const [a, b] = windows;
    const { alpha } = await seedLibrary(a.handle);
    const items = view(b, sortedBy('last_updated'));
    await items.preload();
    expect(items.get(alpha.entryId)?.position).toBe(2);
    calls[1].length = 0;

    // A provider refresh writes one chapter per call, each its own change batch.
    for (let index = 2; index < 12; index += 1) {
      const created = await upsertChapterMetadata(a.handle, {
        mangaId: alpha.mangaId,
        providerMappingId: alpha.mappingId,
        title: `Chapter ${index}`,
        index,
      });
      expect(created.ok).toBe(true);
    }
    await expect.poll(() => items.get(alpha.entryId)?.value.entry.unreadCount).toBe(12);
    await expect.poll(() => listReads(calls[1]).length).toBeGreaterThan(0);
    // Ten change batches, one reload (the writes finish well inside the delay).
    expect(listReads(calls[1]).length).toBeLessThanOrEqual(2);
    expect([...items.values()].map((row) => row.position).sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it('refills a filtered window when a loaded title leaves the filter', async () => {
    const { windows, databasePath } = await hostWithWindows();
    const [a, b] = windows;
    seedTitlesAt(databasePath, 450);
    const items = view(b, { ...DEFAULT_LIBRARY_VIEW_STATE, filter: { statuses: ['reading'] } });
    await items.preload();
    // Newest first: 0449 down to 0250 are loaded, 0249 is the next title.
    expect(items.size).toBe(200);
    const leaving = toLibraryEntryId('entry-0300');
    const next = toLibraryEntryId('entry-0249');
    expect(items.has(next)).toBe(false);

    const result = await setLibraryEntriesStatus(a.handle, [leaving], 'completed');
    expect(result.ok).toBe(true);

    await expect.poll(() => items.has(next)).toBe(true);
    expect(items.has(leaving)).toBe(false);
    expect(items.size).toBe(200);

    // Back in the filter, it takes its place again and the window keeps its limit.
    await setLibraryEntriesStatus(a.handle, [leaving], 'reading');
    await expect.poll(() => items.has(leaving)).toBe(true);
    expect(items.has(next)).toBe(false);
    expect(items.size).toBe(200);
  });

  it('leaves a title past the loaded window alone and patches one inside it', async () => {
    const { windows, calls, databasePath } = await hostWithWindows();
    const [a, b] = windows;
    seedTitlesAt(databasePath, 450);
    const items = view(b, DEFAULT_LIBRARY_VIEW_STATE);
    await items.preload();
    // Newest first: 0449 down to 0250 are loaded.
    expect(items.size).toBe(200);
    const outside = toLibraryEntryId('entry-0010');
    const inside = toLibraryEntryId('entry-0300');
    calls[1].length = 0;

    await setLibraryEntriesStatus(a.handle, [outside, inside], 'completed');

    await expect.poll(() => items.get(inside)?.value.entry.status).toBe('completed');
    expect(items.has(outside)).toBe(false);
    expect(items.size).toBe(200);
    expect(listReads(calls[1])).toEqual([]);
  });

  it('shows a title change in every window', async () => {
    const { windows } = await hostWithWindows();
    const [a, b] = windows;
    const { gamma } = await seedLibrary(a.handle);
    const first = view(a, DEFAULT_LIBRARY_VIEW_STATE);
    const second = view(b, DEFAULT_LIBRARY_VIEW_STATE);
    await Promise.all([first.preload(), second.preload()]);

    const identity = await getMangaIdentity(a.handle, gamma.mangaId);
    if (identity === undefined) throw new Error('Gamma is missing.');
    await upsertMangaIdentity(a.handle, { ...identity, canonicalTitle: 'Gamma Renamed' });

    for (const items of [first, second]) {
      await expect
        .poll(() => items.get(gamma.entryId)?.value.manga.canonicalTitle)
        .toBe('Gamma Renamed');
    }
  });
});

describe('chapter window collection', () => {
  async function seedChapters(db: AppDrizzleDb, count: number) {
    const { mangaId, mappingId } = await seedTitle(db, 'Long series');
    for (let index = 0; index < count; index += 1) {
      const created = await upsertChapterMetadata(db, {
        mangaId,
        providerMappingId: mappingId,
        title: `Chapter ${index}`,
        index,
      });
      if (!created.ok) throw new Error(created.error.message);
    }
    return mangaId;
  }

  it('loads one bounded window of one title on demand', async () => {
    const { windows } = await hostWithWindows();
    const [a] = windows;
    const mangaId = await seedChapters(a.handle, 200);
    const chapters = createChapterWindowCollection(
      a.handle,
      (listener) => a.onChange(listener),
      'chapters-window',
    );
    const page = createLiveQueryCollection((q) =>
      q
        .from({ chapter: chapters })
        .where(({ chapter }) => eq(chapter.mangaId, mangaId))
        .orderBy(({ chapter }) => chapter.index, 'asc')
        .limit(50),
    );
    await page.preload();
    expect(page.toArray.map((row) => row.index)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    // Only the window is in memory, not the title's 200 chapters.
    expect(chapters.size).toBeLessThanOrEqual(51);
  });

  it('refuses a load that names no title', async () => {
    const { windows } = await hostWithWindows();
    const [a] = windows;
    await seedChapters(a.handle, 5);
    const chapters = createChapterWindowCollection(
      a.handle,
      (listener) => a.onChange(listener),
      'chapters-unbounded',
    );
    const everything = createLiveQueryCollection((q) =>
      q
        .from({ chapter: chapters })
        .orderBy(({ chapter }) => chapter.index, 'asc')
        .limit(10),
    );
    const failure = await everything.preload().then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(failure).not.toBeNull();
    expect(chapters.size).toBe(0);
  });
});

/** Titles written straight to the file: 450 rows are faster than 900 host calls. */
function seedTitlesAt(databasePath: string, count: number): void {
  const side = new DatabaseSync(databasePath);
  const identity = side.prepare(
    'INSERT INTO manga_identities (id, canonical_title, status, content_rating, merged, default_provider_mapping_id) VALUES (?,?,?,?,?,?)',
  );
  const mapping = side.prepare(
    'INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id) VALUES (?,?,?,?)',
  );
  const entry = side.prepare(
    'INSERT INTO library_entries (id, manga_id, favorite, status, unread_count, added_at, updated_at) VALUES (?,?,?,?,?,?,?)',
  );
  side.exec('BEGIN');
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const addedAt = `2026-01-01T00:00:${suffix}.000Z`;
    identity.run(`manga-${suffix}`, `Series ${suffix}`, 'ongoing', 'safe', 0, `mapping-${suffix}`);
    mapping.run(`mapping-${suffix}`, `manga-${suffix}`, 'prov-a', `remote-${index}`);
    entry.run(
      `entry-${suffix}`,
      `manga-${suffix}`,
      index % 5 === 0 ? 1 : 0,
      'reading',
      0,
      addedAt,
      addedAt,
    );
  }
  side.exec('COMMIT');
  side.close();
}

describe('library list paging', () => {
  it('loads one bounded page, extends it on request, and restarts a changed view at page one', async () => {
    const { windows, databasePath } = await hostWithWindows();
    const [a] = windows;
    seedTitlesAt(databasePath, 450);
    const changes = (listener: Parameters<Parameters<typeof libraryCollections>[2]>[0]) =>
      a.onChange(listener);

    const view = libraryCollections(a.handle, DEFAULT_LIBRARY_VIEW_STATE, changes);
    await Promise.all([view.items.preload(), view.total.preload()]);
    // The first load is bounded: 200 of 450 rows, with the real total beside it.
    expect(view.items.size).toBe(200);
    expect(view.total.get('total')?.value.total).toBe(450);

    await view.loadMore();
    expect(view.items.size).toBe(400);
    await view.loadMore();
    expect(view.items.size).toBe(450);
    expect(view.total.get('total')?.value.total).toBe(450);

    // A filter change is a new view, so it starts again at the first page.
    const favorites = libraryCollections(
      a.handle,
      { ...DEFAULT_LIBRARY_VIEW_STATE, filter: { favoritesOnly: true } },
      changes,
    );
    await Promise.all([favorites.items.preload(), favorites.total.preload()]);
    expect(favorites.items.size).toBe(90);
    expect(favorites.total.get('total')?.value.total).toBe(90);

    // So is a sort change.
    const sorted = libraryCollections(
      a.handle,
      { ...DEFAULT_LIBRARY_VIEW_STATE, sort: { key: 'title', direction: 'asc' } },
      changes,
    );
    await Promise.all([sorted.items.preload(), sorted.total.preload()]);
    expect(sorted.items.size).toBe(200);
    expect(sorted.total.get('total')?.value.total).toBe(450);
  });
});
