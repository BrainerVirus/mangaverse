import { describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '@app/platform';
import { err, ok } from '@app/shared';

import { deleteBlobKeys } from './blob-deletes.js';

function createDeletingAdapter(failKey?: string): {
  adapter: PlatformAdapter;
  deleted: string[];
  peakInFlight: () => number;
} {
  const deleted: string[] = [];
  let inFlight = 0;
  let peak = 0;

  return {
    deleted,
    peakInFlight: () => peak,
    adapter: {
      blobStorage: {
        delete: async (key: string) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await Promise.resolve();
          inFlight -= 1;
          if (key === failKey) {
            return err({ code: 'blob.delete_failed', message: 'nope' });
          }
          deleted.push(key);
          return ok(undefined);
        },
      },
    } as unknown as PlatformAdapter,
  };
}

describe('deleteBlobKeys', () => {
  it('Given many keys, When deleting, Then concurrency stays bounded and every key is attempted', async () => {
    const { adapter, deleted, peakInFlight } = createDeletingAdapter();
    const keys = Array.from({ length: 10 }, (_value, index) => `page:${index}`);

    const outcome = await deleteBlobKeys(adapter, keys);

    expect(outcome).toEqual({ deletedKeys: keys, failedKeys: [] });
    expect(deleted).toEqual(keys);
    expect(peakInFlight()).toBeLessThanOrEqual(4);
  });

  it('Given a failing delete, When deleting, Then the failure is reported instead of thrown', async () => {
    const { adapter, deleted } = createDeletingAdapter('page:1');

    const outcome = await deleteBlobKeys(adapter, ['page:0', 'page:1', 'page:2']);

    expect(outcome).toEqual({ deletedKeys: ['page:0', 'page:2'], failedKeys: ['page:1'] });
    expect(deleted).toEqual(['page:0', 'page:2']);
  });

  it('Given a key skipped by the caller, When deleting, Then it is neither deleted nor failed', async () => {
    const { adapter, deleted } = createDeletingAdapter();

    const outcome = await deleteBlobKeys(adapter, ['page:0', 'page:1', 'page:2'], {
      skip: (key) => key === 'page:1',
    });

    expect(outcome).toEqual({ deletedKeys: ['page:0', 'page:2'], failedKeys: [] });
    expect(deleted).toEqual(['page:0', 'page:2']);
  });

  it('Given no keys, When deleting, Then nothing is attempted', async () => {
    const { adapter, deleted } = createDeletingAdapter();

    expect(await deleteBlobKeys(adapter, [])).toEqual({ deletedKeys: [], failedKeys: [] });
    expect(deleted).toEqual([]);
  });
});
