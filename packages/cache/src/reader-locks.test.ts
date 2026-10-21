import { describe, expect, it, vi } from 'vitest';

import {
  holdReaderLocks,
  probeReaderPresence,
  READER_PRESENCE_LOCK,
  readerChapterLockName,
} from './reader-locks.js';
import {
  installFakeWebLocks,
  installNoWebLocks,
  type FakeWebLocks,
} from './testing/fake-web-locks.js';

const CHAPTER_1 = { providerId: 'mangadex', mangaId: 'manga-1', chapterId: 'chapter-1' };
const CHAPTER_2 = { providerId: 'mangadex', mangaId: 'manga-1', chapterId: 'chapter-2' };

async function heldNames(fake: FakeWebLocks): Promise<string[]> {
  const held = await fake.locks.query();
  return held.held.map((lock) => lock.name).sort();
}

async function expectHeld(fake: FakeWebLocks, names: string[]): Promise<void> {
  await vi.waitFor(async () => {
    expect(await heldNames(fake)).toEqual([...names].sort());
  });
}

describe('reader locks', () => {
  it('Given a mounted reader, When it holds locks, Then presence and chapter are shared and release clears both', async () => {
    const { fake, restore } = installFakeWebLocks();
    try {
      const release = holdReaderLocks(CHAPTER_1);

      await expectHeld(fake, [READER_PRESENCE_LOCK, readerChapterLockName(CHAPTER_1)]);
      const held = (await fake.locks.query()).held;
      expect(held.every((lock) => lock.mode === 'shared')).toBe(true);

      release();
      await expectHeld(fake, []);
    } finally {
      restore();
    }
  });

  it('Given no reader, When probing, Then presence is none and the exclusive lock is held until released', async () => {
    const { fake, restore } = installFakeWebLocks();
    try {
      const presence = await probeReaderPresence();

      expect(presence.status).toBe('none');
      expect(await fake.locks.query()).toMatchObject({
        held: [{ name: READER_PRESENCE_LOCK, mode: 'exclusive' }],
      });

      // A reader mounting mid-sweep queues behind the held exclusive lock.
      const release = holdReaderLocks(CHAPTER_1);
      expect(await heldNames(fake)).toEqual([READER_PRESENCE_LOCK]);

      if (presence.status === 'none') presence.release();
      await expectHeld(fake, [READER_PRESENCE_LOCK, readerChapterLockName(CHAPTER_1)]);
      release();
    } finally {
      restore();
    }
  });

  it('Given a silent background tab holding chapter locks, When probing, Then its chapters are reported', async () => {
    const { fake, restore } = installFakeWebLocks();
    const releasePresence = fake.hold(READER_PRESENCE_LOCK);
    const releaseChapter = fake.hold(readerChapterLockName(CHAPTER_1));
    try {
      expect(await probeReaderPresence()).toEqual({
        status: 'readers',
        chapters: [CHAPTER_1],
      });
    } finally {
      releaseChapter();
      releasePresence();
      restore();
    }
  });

  it('Given every open chapter lock, When probing, Then all open chapters are returned', async () => {
    const { fake, restore } = installFakeWebLocks();
    const releasePresence = fake.hold(READER_PRESENCE_LOCK);
    const releaseFirst = fake.hold(readerChapterLockName(CHAPTER_1));
    const releaseSecond = fake.hold(readerChapterLockName(CHAPTER_2));
    try {
      const presence = await probeReaderPresence();

      expect(presence).toEqual({ status: 'readers', chapters: [CHAPTER_1, CHAPTER_2] });
    } finally {
      releaseSecond();
      releaseFirst();
      releasePresence();
      restore();
    }
  });

  it('Given presence without an identifiable chapter, When probing, Then the result is unknown', async () => {
    const { fake, restore } = installFakeWebLocks();
    const releasePresence = fake.hold(READER_PRESENCE_LOCK);
    try {
      expect(await probeReaderPresence()).toEqual({ status: 'unknown' });
    } finally {
      releasePresence();
      restore();
    }
  });

  it('Given no Web Locks API, When probing, Then the result is unknown', async () => {
    const noLocks = installNoWebLocks();
    try {
      expect(await probeReaderPresence()).toEqual({ status: 'unknown' });
      const onUnavailable = vi.fn<() => void>();
      expect(holdReaderLocks(CHAPTER_1, onUnavailable)()).toBeUndefined();
      expect(onUnavailable).toHaveBeenCalledTimes(1);
    } finally {
      noLocks.restore();
    }
  });

  it('Given an ifAvailable conflict, When the fake grants, Then the callback receives null and no lock is held', async () => {
    const { fake, restore } = installFakeWebLocks();
    const release = fake.hold(READER_PRESENCE_LOCK);
    try {
      const callback = vi.fn<(lock: unknown) => void>();

      await fake.locks.request(
        READER_PRESENCE_LOCK,
        { mode: 'exclusive', ifAvailable: true },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(null);
      expect(await fake.locks.query()).toMatchObject({
        held: [{ name: READER_PRESENCE_LOCK, mode: 'shared' }],
      });
    } finally {
      release();
      restore();
    }
  });

  it('Given a rejected shared-lock request, When a reader mounts, Then the caller is told it is unprotected', async () => {
    const { restore } = installFakeWebLocks();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          query: async () => ({ held: [], pending: [] }),
          request: () => Promise.reject(new Error('locks unavailable')),
        },
      },
    });
    const onUnavailable = vi.fn<() => void>();
    try {
      holdReaderLocks(CHAPTER_1, onUnavailable);

      await vi.waitFor(() => {
        expect(onUnavailable).toHaveBeenCalledTimes(1);
      });
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'navigator');
      else Object.defineProperty(globalThis, 'navigator', original);
      restore();
    }
  });

  it('Given a failing lock manager, When probing, Then the result is unknown', async () => {
    const { restore } = installFakeWebLocks();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          query: async () => ({ held: [] }),
          request: () => Promise.reject(new Error('locks unavailable')),
        },
      },
    });
    try {
      expect(await probeReaderPresence()).toEqual({ status: 'unknown' });
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'navigator');
      else Object.defineProperty(globalThis, 'navigator', original);
      restore();
    }
  });

  it('Given a rejected lock query, When probing, Then the result is unknown', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: {
          query: () => Promise.reject(new Error('query unavailable')),
          request: (_name: string, _options: unknown, callback: (lock: unknown) => void) => {
            // The exclusive request is denied, so the probe falls through to query().
            callback(null);
            return Promise.resolve();
          },
        },
      },
    });
    try {
      expect(await probeReaderPresence()).toEqual({ status: 'unknown' });
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'navigator');
      else Object.defineProperty(globalThis, 'navigator', original);
    }
  });
});
