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

function buildData(
  pageCount = 2,
  overrides: Partial<ReturnType<typeof getDefaultReaderSettings>> = {},
): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...overrides };
  const pages = Array.from({ length: pageCount }, (_value, index) => ({
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
  activePageIndex,
}: {
  readonly data: ReaderPageData;
  readonly context: CoverCacheContextValue;
  readonly activePageIndex?: number;
}) {
  useChapterPrefetch(
    data,
    context,
    activePageIndex === undefined ? data.initialPageIndex : activePageIndex,
  );
  return null;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly signal: () => AbortSignal | undefined;
}

/** One controllable prefetch sweep, so a test can settle them out of order. */
function deferredPrefetch(): Deferred {
  let resolve!: () => void;
  let signal: AbortSignal | undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  mocks.prefetchChapterPages.mockImplementationOnce((input) => {
    signal = input.signal;
    return promise;
  });
  return { promise, resolve, signal: () => signal };
}

describe('useChapterPrefetch cache sweep', () => {
  it('prefetches only upcoming pages and stops when preload is disabled', async () => {
    mocks.prefetchChapterPages.mockClear();
    const context = {
      db: {} as CoverCacheContextValue['db'],
      adapter: {} as CoverCacheContextValue['adapter'],
      cacheLimitBytes: 1024,
    };
    const data = buildData();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<Probe data={data} context={context} />));
    expect(mocks.prefetchChapterPages.mock.calls[0]?.[0]).toMatchObject({
      pages: [{ pageIndex: 1, remoteUrl: 'https://example.com/1.jpg' }],
    });
    mocks.prefetchChapterPages.mockClear();
    await act(async () =>
      root.render(
        <Probe
          data={{ ...data, settings: { ...data.settings, lowMemoryMode: true, preloadAhead: 0 } }}
          context={context}
        />,
      ),
    );
    expect(mocks.prefetchChapterPages).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('Given data saver, When the chapter opens or a page turns, Then no page is prefetched', async () => {
    mocks.prefetchChapterPages.mockClear();
    const context = {
      db: {} as CoverCacheContextValue['db'],
      adapter: {} as CoverCacheContextValue['adapter'],
      cacheLimitBytes: 1024,
    };
    const data = buildData(8, { dataSaver: true, preloadAhead: 4, preloadBehind: 2 });
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Probe data={data} context={context} activePageIndex={2} />));
    await act(async () => root.render(<Probe data={data} context={context} activePageIndex={3} />));
    expect(mocks.prefetchChapterPages).not.toHaveBeenCalled();

    // Turning it off restores the sweep.
    const off = { ...data, settings: { ...data.settings, dataSaver: false } };
    await act(async () => root.render(<Probe data={off} context={context} activePageIndex={3} />));
    expect(mocks.prefetchChapterPages).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('Given preloadBehind, When the sweep plans mid-chapter, Then it warms that many pages behind', async () => {
    const context = {
      db: {} as CoverCacheContextValue['db'],
      adapter: {} as CoverCacheContextValue['adapter'],
      cacheLimitBytes: 1024,
    };
    const planned = async (preloadBehind: number) => {
      mocks.prefetchChapterPages.mockClear();
      const root = createRoot(document.createElement('div'));
      const data = buildData(8, { preloadAhead: 1, preloadBehind });
      await act(async () =>
        root.render(<Probe data={data} context={context} activePageIndex={5} />),
      );
      const call = mocks.prefetchChapterPages.mock.calls[0]?.[0] as unknown as {
        pages: { pageIndex: number }[];
      };
      act(() => root.unmount());
      return call.pages.map((page) => page.pageIndex);
    };

    expect(await planned(2)).toEqual([4, 6, 3]);
    expect(await planned(0)).toEqual([6]);
  });
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
    expect(mocks.holdReaderLocks).toHaveBeenCalledWith(
      {
        providerId: 'mangadex',
        mangaId: 'manga-1',
        chapterId: 'chapter-1',
      },
      expect.any(Function),
    );
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
    const changed = { ...data, settings: { ...data.settings, tapZoneLayout: 'grid' as const } };
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

describe('useChapterPrefetch page-turn plans', () => {
  const context = {
    db: {} as CoverCacheContextValue['db'],
    adapter: {} as CoverCacheContextValue['adapter'],
    cacheLimitBytes: 1024,
  };

  function mountProbe(data: ReaderPageData) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    return {
      container,
      root,
      render: (activePageIndex: number) =>
        root.render(<Probe data={data} context={context} activePageIndex={activePageIndex} />),
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  }

  it('Given a page turn, When the old sweep resolves late, Then its queued-away plan never writes maintenance', async () => {
    mocks.prefetchChapterPages.mockReset();
    mocks.markChapterPagesAsRead.mockClear();
    mocks.evictCacheToLimit.mockClear();
    const data = buildData(6);
    const first = deferredPrefetch();
    const second = deferredPrefetch();
    const probe = mountProbe(data);

    await act(async () => probe.render(0));
    expect(first.signal()?.aborted).toBe(false);

    await act(async () => probe.render(3));
    // The turn cancelled the previous plan before issuing the new one.
    expect(first.signal()?.aborted).toBe(true);
    expect(second.signal()?.aborted).toBe(false);
    expect(mocks.prefetchChapterPages.mock.calls[1]?.[0]).toMatchObject({
      pages: [
        { pageIndex: 2, remoteUrl: 'https://example.com/2.jpg' },
        { pageIndex: 4, remoteUrl: 'https://example.com/4.jpg' },
        { pageIndex: 5, remoteUrl: 'https://example.com/5.jpg' },
      ],
    });

    // The final page's sweep settles first.
    await act(async () => second.resolve());
    await vi.waitFor(() => expect(mocks.evictCacheToLimit).toHaveBeenCalledTimes(1));

    // The stale sweep settling afterwards is ignored, so no older plan can
    // rewrite read state or evict against the page the reader is on.
    await act(async () => first.resolve());
    expect(mocks.markChapterPagesAsRead).toHaveBeenCalledTimes(1);
    expect(mocks.evictCacheToLimit).toHaveBeenCalledTimes(1);

    probe.unmount();
  });

  it('Given rapid page turns, When each settles, Then every older sweep is aborted and only the last one writes', async () => {
    mocks.prefetchChapterPages.mockReset();
    mocks.markChapterPagesAsRead.mockClear();
    mocks.evictCacheToLimit.mockClear();
    const data = buildData(6);
    const sweeps = [deferredPrefetch(), deferredPrefetch(), deferredPrefetch(), deferredPrefetch()];
    const probe = mountProbe(data);

    for (const [turn, sweep] of sweeps.entries()) {
      await act(async () => probe.render(turn));
      expect(sweep.signal()?.aborted).toBe(false);
      // Every earlier plan is cancelled by the turn that replaced it.
      for (const earlier of sweeps.slice(0, turn)) {
        expect(earlier.signal()?.aborted).toBe(true);
      }
    }

    // Settle out of order: newest first, then the stale ones oldest last.
    await act(async () => sweeps[3]!.resolve());
    await vi.waitFor(() => expect(mocks.evictCacheToLimit).toHaveBeenCalledTimes(1));
    for (const stale of [sweeps[0]!, sweeps[1]!, sweeps[2]!]) {
      await act(async () => stale.resolve());
    }
    expect(mocks.markChapterPagesAsRead).toHaveBeenCalledTimes(1);
    expect(mocks.evictCacheToLimit).toHaveBeenCalledTimes(1);
    expect(mocks.prefetchChapterPages.mock.calls.at(-1)?.[0]).toMatchObject({
      pages: [{ pageIndex: 2 }, { pageIndex: 4 }, { pageIndex: 5 }],
    });

    probe.unmount();
  });
});
