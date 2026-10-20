// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import type { CoverCacheContextValue } from '@app/cache';

import { useChapterPrefetch } from './use-chapter-cache.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

const mocks = vi.hoisted(() => ({
  prefetchChapterPages: vi.fn<() => Promise<void>>(async () => {}),
  markChapterPagesAsRead: vi.fn<() => Promise<void>>(async () => {}),
  evictCacheToLimit: vi.fn<() => Promise<number>>(async () => 0),
  listCachedChapterPageIndexes: vi.fn<() => Promise<number[]>>(async () => []),
}));

vi.mock('@app/cache', () => mocks);

function buildData(): ReaderPageData {
  const settings = getDefaultReaderSettings();
  const pages = Array.from({ length: 2 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg` },
  }));
  return {
    chapter: {
      id: 'chapter-1',
      mangaId: 'manga-1',
      title: 'Chapter 1',
      pages,
      pageCount: pages.length,
    },
    mangaId: 'manga-1' as ReaderPageData['mangaId'],
    chapterId: 'chapter-1' as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex: 0,
    settings,
    engineSettings: toReaderEngineSettings(settings),
  };
}

function Probe({
  data,
  context,
}: {
  readonly data: ReaderPageData;
  readonly context: CoverCacheContextValue;
}) {
  useChapterPrefetch(data, context);
  return null;
}

describe('useChapterPrefetch cache sweep', () => {
  it('Given a prefetched chapter, When maintenance runs, Then it protects the open chapter with the reader limit', async () => {
    const db = { id: 'db' } as unknown as CoverCacheContextValue['db'];
    const adapter = {} as unknown as CoverCacheContextValue['adapter'];
    const data = buildData();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Probe data={data} context={{ db, adapter, cacheLimitBytes: 1024 }} />);
    });

    await vi.waitFor(() => expect(mocks.evictCacheToLimit).toHaveBeenCalledTimes(1));
    expect(mocks.markChapterPagesAsRead).toHaveBeenCalledWith(db, {
      providerId: 'mangadex',
      mangaId: 'manga-1',
      chapterId: 'chapter-1',
    });
    expect(mocks.evictCacheToLimit).toHaveBeenCalledWith(db, adapter, {
      limitBytes: 1024,
      protectChapter: {
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
      },
    });

    act(() => root.unmount());
    container.remove();
  });
});
