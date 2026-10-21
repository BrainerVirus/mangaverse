import { describe, expect, it, vi } from 'vitest';

import { deleteBlobKeys } from './blob-deletes.js';
import { blobLockName, withBlobWrite } from './blob-writes.js';
import {
  holdReaderLocks,
  probeReaderPresence,
  READER_PRESENCE_LOCK,
  readerChapterLockName,
} from './reader-locks.js';
import type { PlatformAdapter } from '@app/platform';
import { ok } from '@app/shared';

const hasWebLocks = 'locks' in navigator;

/** Runs against the runtime's own lock manager, not `fake-web-locks`. */
describe.skipIf(!hasWebLocks)('Web Locks integration', () => {
  it('Given a held lock, When an exclusive ifAvailable request conflicts, Then its callback receives null', async () => {
    const name = `mangaverse:test:${crypto.randomUUID()}`;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = navigator.locks.request(name, { mode: 'shared' }, () => hold);
    let received: unknown = 'not-invoked';

    await navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
      received = lock;
    });

    expect(received).toBeNull();
    release();
    await holder;
  });

  it('Given a real reader holding shared locks, When probing, Then presence reports its chapter', async () => {
    const chapter = {
      providerId: 'real',
      mangaId: 'manga-1',
      chapterId: `chapter-${crypto.randomUUID()}`,
    };
    const release = holdReaderLocks(chapter);
    try {
      await vi.waitFor(async () => {
        const { held = [] } = await navigator.locks.query();
        expect(held.some((lock) => lock.name === READER_PRESENCE_LOCK)).toBe(true);
        expect(held.some((lock) => lock.name === readerChapterLockName(chapter))).toBe(true);
      });

      await expect(probeReaderPresence()).resolves.toEqual({
        status: 'readers',
        chapters: [chapter],
      });
    } finally {
      release();
    }

    await vi.waitFor(async () => {
      const { held = [] } = await navigator.locks.query();
      expect(held.some((lock) => lock.name === readerChapterLockName(chapter))).toBe(false);
    });
  });

  it('Given a real write holding the blob lock, When deleting, Then the delete waits and keeps the written row', async () => {
    const key = `page:real:manga-1:chapter-x:${crypto.randomUUID()}`;
    let releaseWrite!: () => void;
    let markRowLanded!: () => void;
    const rowLanded = new Promise<void>((resolve) => {
      markRowLanded = resolve;
    });
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    const write = withBlobWrite(key, async () => {
      await writeGate;
      markRowLanded();
      return 'stored';
    });
    // The other tab's write is inside its callback: shared lock held.
    await vi.waitFor(async () => {
      const { held = [] } = await navigator.locks.query();
      expect(held.some((lock) => lock.name === blobLockName(key))).toBe(true);
    });

    const deleted: string[] = [];
    const adapter = {
      blobStorage: {
        delete: async (deletedKey: string) => {
          deleted.push(deletedKey);
          return ok(undefined);
        },
      },
    } as unknown as PlatformAdapter;
    let skipCalls = 0;
    const deletion = deleteBlobKeys(adapter, [key], {
      skip: () => {
        skipCalls += 1;
        return true;
      },
    });

    // The exclusive request queues behind the real write; nothing is deleted.
    await vi.waitFor(async () => {
      const { pending = [] } = await navigator.locks.query();
      expect(pending.some((lock) => lock.name === blobLockName(key))).toBe(true);
    });
    expect(deleted).toEqual([]);
    expect(skipCalls).toBe(0);

    releaseWrite();
    await expect(write).resolves.toBe('stored');
    await rowLanded;
    await expect(deletion).resolves.toEqual({ deletedKeys: [], failedKeys: [] });
    expect(skipCalls).toBe(1);
    expect(deleted).toEqual([]);
  });
});
