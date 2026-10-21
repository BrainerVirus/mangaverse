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
  holdReaderLocks: vi.fn<(chapter: unknown) => () => void>(() => vi.fn<() => void>()),
  prefetchChapterPages: vi.fn<(input: { signal?: AbortSignal }) => Promise<void>>(async () => {}),
  markChapterPagesAsRead: vi.fn<() => Promise<void>>(async () => {}),
  evictCacheToLimit: vi.fn<() => Promise<{ evictedCount: number; failedBlobKeys: string[] }>>(
    async () => ({ evictedCount: 0, failedBlobKeys: [] }),
  ),
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
    expect(mocks.holdReaderLocks).toHaveBeenCalledWith({
      providerId: 'mangadex',
      mangaId: 'manga-1',
      chapterId: 'chapter-1',
    });
    const releaseLocks = mocks.holdReaderLocks.mock.results[0]?.value;

    act(() => root.unmount());
    expect(releaseLocks).toHaveBeenCalledTimes(1);
    container.remove();
  });

  it('Given a settings change, When the same chapter rerenders, Then prefetch does not run twice and the locks stay held', async () => {
    mocks.prefetchChapterPages.mockClear();
    mocks.markChapterPagesAsRead.mockClear();
    mocks.evictCacheToLimit.mockClear();
    mocks.holdReaderLocks.mockClear();
    const db = { id: 'db' } as unknown as CoverCacheContextValue['db'];
    const adapter = {} as unknown as CoverCacheContextValue['adapter'];
    const context = { db, adapter, cacheLimitBytes: 1024 };
    const data = buildData();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<Probe data={data} context={context} />));
    await vi.waitFor(() => expect(mocks.evictCacheToLimit).toHaveBeenCalledTimes(1));

    // A settings toggle replaces the query data object but keeps the page array.
    const changed = { ...data, settings: { ...data.settings, brightness: 0.5 } };
    await act(async () => root.render(<Probe data={changed} context={context} />));

    expect(mocks.prefetchChapterPages).toHaveBeenCalledTimes(1);
    expect(mocks.holdReaderLocks).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it('Given a prefetch budget change, When the chapter rerenders, Then prefetch runs with the new budget', async () => {
    mocks.prefetchChapterPages.mockClear();
    mocks.evictCacheToLimit.mockClear();
    const db = { id: 'db' } as unknown as CoverCacheContextValue['db'];
    const adapter = {} as unknown as CoverCacheContextValue['adapter'];
    const context = { db, adapter, cacheLimitBytes: 1024 };
    const data = buildData();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<Probe data={data} context={context} />));
    await vi.waitFor(() => expect(mocks.evictCacheToLimit).toHaveBeenCalledTimes(1));

    const changed = {
      ...data,
      settings: { ...data.settings, prefetchBudgetBytes: data.settings.prefetchBudgetBytes + 1 },
    };
    await act(async () => root.render(<Probe data={changed} context={context} />));

    expect(mocks.prefetchChapterPages).toHaveBeenCalledTimes(2);
    expect(mocks.prefetchChapterPages.mock.calls[1]?.[0]).toMatchObject({
      budgetBytes: data.settings.prefetchBudgetBytes + 1,
    });
    act(() => root.unmount());
    container.remove();
  });

  it('Given an unmount, When the prefetch resolves, Then cleanup is skipped and the sweep is aborted', async () => {
    mocks.prefetchChapterPages.mockClear();
    mocks.markChapterPagesAsRead.mockClear();
    mocks.evictCacheToLimit.mockClear();
    let resolvePrefetch!: () => void;
    mocks.prefetchChapterPages.mockImplementation(
      () => new Promise<void>((resolve) => (resolvePrefetch = resolve)),
    );
    const db = { id: 'db' } as unknown as CoverCacheContextValue['db'];
    const adapter = {} as unknown as CoverCacheContextValue['adapter'];
    const data = buildData();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Probe data={data} context={{ db, adapter, cacheLimitBytes: 1024 }} />);
    });
    await vi.waitFor(() => expect(mocks.prefetchChapterPages).toHaveBeenCalledTimes(1));
    const signal = mocks.prefetchChapterPages.mock.calls[0]?.[0].signal;

    act(() => root.unmount());
    expect(signal?.aborted).toBe(true);
    await act(async () => resolvePrefetch());

    expect(mocks.markChapterPagesAsRead).not.toHaveBeenCalled();
    expect(mocks.evictCacheToLimit).not.toHaveBeenCalled();
    container.remove();
  });
});
