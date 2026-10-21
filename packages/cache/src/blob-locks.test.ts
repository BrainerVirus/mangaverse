import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@app/platform';
import { ok } from '@app/shared';

import { deleteBlobKeys } from './blob-deletes.js';
import { blobLockName, isBlobWriteInFlight, withBlobWrite } from './blob-writes.js';
import {
  installFakeWebLocks,
  installNoWebLocks,
  type FakeWebLocks,
} from './testing/fake-web-locks.js';

function createAdapter(): { adapter: PlatformAdapter; deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    adapter: {
      blobStorage: {
        delete: async (key: string) => {
          deleted.push(key);
          return ok(undefined);
        },
      },
    } as unknown as PlatformAdapter,
  };
}

function createGatedAdapter(): {
  adapter: PlatformAdapter;
  deleted: string[];
  started: Promise<void>;
  releaseDelete: () => void;
} {
  const deleted: string[] = [];
  let releaseDelete!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  return {
    deleted,
    started,
    releaseDelete: () => releaseDelete(),
    adapter: {
      blobStorage: {
        delete: async (key: string) => {
          deleted.push(key);
          markStarted();
          await gate;
          return ok(undefined);
        },
      },
    } as unknown as PlatformAdapter,
  };
}

describe('per-key blob locks', () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  function useFakeLocks(): FakeWebLocks {
    const installed = installFakeWebLocks();
    restore = installed.restore;
    return installed.fake;
  }

  it('Given another tab writing the key, When deleting, Then the delete waits and checks inside the lock', async () => {
    const locks = useFakeLocks();
    const { adapter, deleted } = createAdapter();
    const key = 'cover:prov-a:manga-1';
    const releaseOtherTab = locks.hold(blobLockName(key));
    const checks: string[] = [];

    const deletion = deleteBlobKeys(adapter, [key], {
      skip: (checkedKey) => {
        checks.push(checkedKey);
        return true;
      },
    });

    await vi.waitFor(async () => {
      expect((await locks.locks.query()).pending).toContainEqual({
        name: blobLockName(key),
        mode: 'exclusive',
      });
    });
    expect(checks).toEqual([]);
    expect(deleted).toEqual([]);

    releaseOtherTab();
    await expect(deletion).resolves.toEqual({ deletedKeys: [], failedKeys: [] });
    expect(checks).toEqual([key]);
    expect(deleted).toEqual([]);
  });

  it('Given a write starting during the check, When deleting, Then the write cannot slip between the check and delete', async () => {
    useFakeLocks();
    const { adapter, deleted, started, releaseDelete } = createGatedAdapter();
    const key = 'page:prov-a:manga-1:chapter-1:0';
    let wrote = false;
    let write: Promise<void> | undefined;

    const deletion = deleteBlobKeys(adapter, [key], {
      skip: () => {
        // The write starts while the skip check runs. Only an exclusive lock
        // held across the check and the delete keeps it out until after.
        write = withBlobWrite(key, async () => {
          wrote = true;
        });
        return false;
      },
    });

    await started;
    expect(deleted).toEqual([key]);
    expect(wrote).toBe(false);

    releaseDelete();
    await deletion;
    await write;
    expect(wrote).toBe(true);
  });

  it('Given no Web Locks API, When writing, Then the write still runs and deleting fails closed', async () => {
    restore = installNoWebLocks().restore;
    const { adapter, deleted } = createAdapter();
    let wrote = false;

    await withBlobWrite('cover:prov-a:manga-1', async () => {
      wrote = true;
    });

    expect(wrote).toBe(true);
    expect(isBlobWriteInFlight('cover:prov-a:manga-1')).toBe(false);
    await expect(deleteBlobKeys(adapter, ['cover:prov-a:manga-1'])).resolves.toEqual({
      deletedKeys: [],
      failedKeys: ['cover:prov-a:manga-1'],
    });
    expect(deleted).toEqual([]);

    await expect(
      deleteBlobKeys(adapter, ['cover:prov-a:manga-1'], { allowUnlocked: true }),
    ).resolves.toEqual({ deletedKeys: ['cover:prov-a:manga-1'], failedKeys: [] });
  });

  it('Given a lock manager that refuses the request, When deleting, Then nothing is deleted', async () => {
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
    restore = () => {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'navigator');
      else Object.defineProperty(globalThis, 'navigator', original);
    };
    const { adapter, deleted } = createAdapter();

    await expect(deleteBlobKeys(adapter, ['page:prov-a:manga-1:chapter-1:0'])).resolves.toEqual({
      deletedKeys: [],
      failedKeys: ['page:prov-a:manga-1:chapter-1:0'],
    });
    expect(deleted).toEqual([]);

    // A writer must not be blocked by the same failure.
    await expect(
      withBlobWrite('page:prov-a:manga-1:chapter-1:0', async () => 'stored'),
    ).resolves.toBe('stored');
  });
});
