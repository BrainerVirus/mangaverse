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
  upsertChapterMetadata,
  type AppDrizzleDb,
  type DataHostClient,
} from '@app/db';
import { createDataHost } from '@app/db/host';
import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { afterEach, describe, expect, it } from 'vitest';
import type { LibraryEntryId } from '@app/shared';
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
        postMessage: (request) => port2.postMessage(request),
        onMessage: (listener) => {
          port2.onmessage = (event) => listener(event.data);
        },
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
  return { databasePath, windows: windows as [DataHostClient, DataHostClient] };
}

async function seedTitle(db: AppDrizzleDb, title: string) {
  const identity = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: title,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: 'mangadex',
    providerMangaId: title,
  });
  if (!identity.ok) throw new Error(identity.error.message);
  const entry = await addLibraryEntry(db, { mangaId: identity.value.mangaId, status: 'reading' });
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
