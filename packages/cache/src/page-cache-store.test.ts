import { describe, expect, it } from 'vitest';
import { ok } from '@app/shared';
import type { PlatformAdapter } from '@app/platform';
import { createSqlJsHarness } from '@app/db/testing';

import { listCachedChapterPageIndexes, prefetchChapterPages } from './page-cache-store.js';

/** Only `blobStorage` and `network` are touched by the page cache store. */
function createPageAdapter(): { adapter: PlatformAdapter; peakFetches: () => number } {
  const blobs = new Map<string, { data: ArrayBuffer; mimeType: string }>();
  let inFlight = 0;
  let peak = 0;

  return {
    adapter: {
      blobStorage: {
        put: async (key: string, data: ArrayBuffer, mimeType: string) => {
          blobs.set(key, { data, mimeType });
          return ok(undefined);
        },
        get: async (key: string) => ok(blobs.get(key)),
        delete: async (key: string) => {
          blobs.delete(key);
          return ok(undefined);
        },
        createObjectUrl: async (_data: ArrayBuffer, _mimeType: string) =>
          ok(`blob:page-${blobs.size}`),
        revokeObjectUrl: async (_url: string) => ok(undefined),
      },
      network: {
        fetchBytes: async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          // Yield so every queued page overlaps the ones already in flight.
          await new Promise((resolve) => setTimeout(resolve, 0));
          inFlight -= 1;
          return ok({ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/jpeg' });
        },
      },
    } as unknown as PlatformAdapter,
    peakFetches: () => peak,
  };
}

const CHAPTER = {
  providerId: 'mangadex',
  mangaId: 'dev-md-abc',
  chapterId: 'dev-md-ch-1',
};

describe('page cache store', () => {
  it('Given a long chapter, When prefetching, Then pages are fetched with a bounded fan-out', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter, peakFetches } = createPageAdapter();
    const pages = Array.from({ length: 12 }, (_value, pageIndex) => ({
      pageIndex,
      remoteUrl: `https://uploads.mangadex.org/x${pageIndex + 1}.jpg`,
    }));

    await prefetchChapterPages({ db, adapter, ...CHAPTER, pages });

    expect(peakFetches()).toBeLessThanOrEqual(4);
    // Bounded must not mean truncated: the whole chapter still ends up local.
    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toEqual(pages.map((p) => p.pageIndex));
  });

  it('Given a partially cached chapter, When listing its cached pages, Then only stored indexes come back', async () => {
    const { db } = await createSqlJsHarness();
    const { adapter } = createPageAdapter();
    await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      pages: [
        { pageIndex: 0, remoteUrl: 'https://uploads.mangadex.org/x1.jpg' },
        { pageIndex: 2, remoteUrl: 'https://uploads.mangadex.org/x3.jpg' },
      ],
    });
    await prefetchChapterPages({
      db,
      adapter,
      ...CHAPTER,
      chapterId: 'dev-md-ch-other',
      pages: [{ pageIndex: 0, remoteUrl: 'https://uploads.mangadex.org/y1.jpg' }],
    });

    expect(await listCachedChapterPageIndexes(db, CHAPTER)).toEqual([0, 2]);
  });
});
