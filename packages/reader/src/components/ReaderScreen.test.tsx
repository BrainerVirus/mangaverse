// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';

const cacheState = vi.hoisted(() => ({
  context: null as unknown,
  cachedPageIndexes: [] as number[],
}));

vi.mock('@app/cache', () => ({
  CachedPageImage: () => null,
  listCachedChapterPageIndexes: vi.fn<() => Promise<number[]>>(
    async () => cacheState.cachedPageIndexes,
  ),
  markChapterPagesAsRead: vi.fn<() => Promise<void>>(async () => {}),
  prefetchChapterPages: vi.fn<() => Promise<void>>(async () => {}),
  useCoverCacheContext: () => cacheState.context,
}));

vi.mock('@app/design-system', () => ({
  Button: () => null,
  EmptyState: () => null,
  ErrorState: ({
    title,
    message,
    onRetry,
  }: {
    title: string;
    message: string;
    onRetry?: () => void;
  }) => (
    <div>
      <span>{title}</span>
      <span>{message}</span>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
  GlassSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LoadingState: () => null,
  ReaderChrome: () => null,
  Sheet: () => null,
  SheetContent: () => null,
  SheetHeader: () => null,
  SheetTitle: () => null,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

import { prefetchChapterPages } from '@app/cache';

import { ReaderScreen } from './ReaderScreen.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

function buildData(): ReaderPageData {
  const settings = getDefaultReaderSettings();
  const pages = Array.from({ length: 37 }, (_value, index) => ({
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

function mount(
  onPersist: (event: { pageIndex: number }) => void,
  data: ReaderPageData = buildData(),
): {
  root: Root;
  container: HTMLElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReaderScreen
        data={data}
        isLoading={false}
        isError={false}
        chromeVisible={true}
        onToggleChrome={() => {}}
        onPersistProgress={onPersist}
      />,
    );
  });
  return { root, container };
}

describe('ReaderScreen offline state', () => {
  it('Given no data and a paused offline fetch, When rendered, Then an offline message with Retry appears', () => {
    const onRetry = vi.fn<() => void>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ReaderScreen
          data={undefined}
          isLoading={false}
          isError={false}
          isOffline={true}
          chromeVisible={true}
          onToggleChrome={() => {}}
          onRetry={onRetry}
        />,
      );
    });

    expect(container.textContent).toContain('You are offline');
    const retry = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Retry'),
    );
    expect(retry).toBeDefined();
    act(() => {
      retry?.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
    cacheState.context = null;
  });

  it('Given a partially cached chapter reopened offline, When rendered, Then the missing pages are named', async () => {
    cacheState.context = { db: {}, adapter: {} };
    // Everything but pages 3 and 5 is local; those two never reached the cache.
    cacheState.cachedPageIndexes = Array.from({ length: 37 }, (_value, index) => index).filter(
      (index) => index !== 2 && index !== 4,
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ReaderScreen
          data={buildData()}
          isLoading={false}
          isError={false}
          isOffline={true}
          chromeVisible={true}
          onToggleChrome={() => {}}
        />,
      );
    });
    await act(async () => {});

    const note = container.querySelector('[data-testid="reader-offline-note"]');
    expect(note?.textContent).toBe('Offline: pages 3 and 5 are not saved locally.');

    act(() => {
      root.unmount();
    });
    container.remove();
    cacheState.context = null;
  });

  it('Given a fully cached chapter offline, When rendered, Then no unavailable-page note appears', async () => {
    cacheState.context = { db: {}, adapter: {} };
    cacheState.cachedPageIndexes = Array.from({ length: 37 }, (_value, index) => index);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ReaderScreen
          data={buildData()}
          isLoading={false}
          isError={false}
          isOffline={true}
          chromeVisible={true}
          onToggleChrome={() => {}}
        />,
      );
    });
    await act(async () => {});

    expect(container.querySelector('[data-testid="reader-offline-note"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
    cacheState.context = null;
  });
});

describe('ReaderScreen progress checkpoint', () => {
  it('Given a reader that mounted and left immediately, When unmounting, Then the initial page is not persisted', () => {
    const onPersist = vi.fn<(event: { pageIndex: number }) => void>();
    const { root, container } = mount(onPersist);

    // A router blip (or a user pressing Back right after opening) must not
    // persist its initial page over newer progress from another instance.
    act(() => {
      root.unmount();
    });
    container.remove();

    expect(onPersist).not.toHaveBeenCalled();
  });

  it('Given the reader advanced a page, When unmounting before the debounce, Then the new page is checkpointed', () => {
    const onPersist = vi.fn<(event: { pageIndex: number }) => void>();
    const { root, container } = mount(onPersist);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    act(() => {
      root.unmount();
    });
    container.remove();

    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0]?.[0]).toMatchObject({ pageIndex: 1 });
  });
});

describe('ReaderScreen prefetch wiring', () => {
  it('Given reader settings, When the chapter mounts, Then the budget reaches the prefetch call', () => {
    cacheState.context = { db: {}, adapter: {} };
    vi.mocked(prefetchChapterPages).mockClear();
    const budgetBytes = 512 * 1024 * 1024;
    const data = {
      ...buildData(),
      settings: { ...getDefaultReaderSettings(), prefetchBudgetBytes: budgetBytes },
    };

    const { root, container } = mount(() => {}, data);
    act(() => {
      root.unmount();
    });
    container.remove();
    cacheState.context = null;

    expect(vi.mocked(prefetchChapterPages)).toHaveBeenCalledWith(
      expect.objectContaining({ budgetBytes }),
    );
  });
});
