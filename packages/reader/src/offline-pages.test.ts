import { describe, expect, it } from 'vitest';
import {
  buildPageBlobKey,
  evictCacheToLimit,
  listCachedChapterPageIndexes,
  storePageInCache,
  type CoverCacheContextValue,
} from '@app/cache';
import { createSqlJsHarness } from '@app/db/testing';
import { err, ok } from '@app/shared';

import { formatUnavailableOfflinePages } from './offline-pages.js';

const PAGES = [0, 1, 2, 3, 4];
const CHAPTER = { providerId: 'mangadex', mangaId: 'dev-md-abc', chapterId: 'chapter-1' };

function createAdapter(
  failDelete: (key: string) => boolean = () => false,
): CoverCacheContextValue['adapter'] {
  const blobs = new Map<string, ArrayBuffer>();

  return {
    blobStorage: {
      put: async (key: string, data: ArrayBuffer) => {
        blobs.set(key, data);
        return ok(undefined);
      },
      get: async (key: string) => {
        const data = blobs.get(key);
        return ok(data === undefined ? undefined : { data, mimeType: 'image/jpeg' });
      },
      delete: async (key: string) => {
        if (failDelete(key)) return err({ code: 'blob.delete_failed', message: 'delete failed' });
        blobs.delete(key);
        return ok(undefined);
      },
      createObjectUrl: async () => ok('blob:mock'),
      revokeObjectUrl: async () => ok(undefined),
    },
  } as unknown as CoverCacheContextValue['adapter'];
}

describe('formatUnavailableOfflinePages', () => {
  it('Given a fully cached chapter, When formatting, Then there is nothing to report', () => {
    expect(formatUnavailableOfflinePages(PAGES, PAGES)).toBeNull();
    expect(formatUnavailableOfflinePages(PAGES, [])).not.toBeNull();
  });

  it('Given one uncached page, When formatting, Then it is named in the reader numbering', () => {
    expect(formatUnavailableOfflinePages(PAGES, [0, 1, 3, 4])).toBe(
      'Offline: page 3 is not saved locally.',
    );
  });

  it('Given several uncached pages, When formatting, Then every one is listed in order', () => {
    expect(formatUnavailableOfflinePages(PAGES, [1, 2])).toBe(
      'Offline: pages 1, 4 and 5 are not saved locally.',
    );
  });

  it('Given a chapter evicted with a failed blob delete, When formatting offline, Then every page is named', async () => {
    const { db } = await createSqlJsHarness();
    const adapter = createAdapter(
      (key) => key === buildPageBlobKey('mangadex', 'dev-md-abc', 'chapter-1', 2),
    );

    for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
      await storePageInCache({
        db,
        adapter,
        ...CHAPTER,
        pageIndex,
        remoteUrl: `https://example.com/${pageIndex}.jpg`,
        data: new Uint8Array(10).buffer,
        mimeType: 'image/jpeg',
      });
    }

    expect(await evictCacheToLimit(db, adapter, { limitBytes: 50 })).toBe(6);
    expect(
      formatUnavailableOfflinePages(
        [0, 1, 2, 3, 4, 5],
        await listCachedChapterPageIndexes(db, CHAPTER),
      ),
    ).toBe('Offline: pages 1, 2, 3, 4, 5 and 6 are not saved locally.');
  });
});
