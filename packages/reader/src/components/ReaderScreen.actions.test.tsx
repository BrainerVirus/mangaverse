// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import type { ReaderSettings } from '@app/shared';

vi.mock('@app/cache', () => {
  const context = { db: {}, adapter: {} };
  return {
    createPageDecodePool: () => ({
      setPlan: () => {},
      snapshot: () => ({ decoded: 0, pending: 0, released: 0, failures: 0 }),
      dispose: () => {},
    }),
    CachedPageImage: (props: {
      imageRendering?: string;
      onMetric?: (metric: {
        status: 'loaded';
        fromCache: boolean;
        durationMs: number;
        byteSize: number;
      }) => void;
    }) => (
      <div data-testid="page-image" data-image-rendering={props.imageRendering}>
        <button
          onClick={() =>
            props.onMetric?.({ status: 'loaded', fromCache: true, durationMs: 5, byteSize: 100 })
          }
        >
          Page loaded
        </button>
      </div>
    ),
    holdReaderLocks: vi.fn<(chapter: unknown) => () => void>(() => () => {}),
    evictCacheToLimit: vi.fn<() => Promise<{ evictedCount: number; failedBuckets: string[] }>>(
      async () => ({ evictedCount: 0, failedBuckets: [] }),
    ),
    listCachedChapterPageIndexes: vi.fn<() => Promise<number[]>>(async () => []),
    markChapterPagesAsRead: vi.fn<() => Promise<void>>(async () => {}),
    prefetchChapterPages: vi.fn<() => Promise<unknown>>(async () => ({
      downloadedBytes: 0,
      cachedPages: 0,
      fetchedPages: 0,
      failedPages: 0,
    })),
    useCoverCacheContext: () => context,
  };
});

vi.mock('@app/design-system/motion', () => ({
  useReducedMotion: () => false,
  useGsapContext: () => {},
  readerPageEnter: vi.fn<() => void>(),
}));

vi.mock('@app/design-system', async () => {
  const { useReducer } = await import('react');
  return {
    Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
      <button {...(props as object)}>{children}</button>
    ),
    Dialog: ({ children }: { children: ReactNode }) => <dialog open>{children}</dialog>,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    EmptyState: () => null,
    ErrorState: () => null,
    GlassSurface: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Skeleton: () => null,
    // The chrome reduced to what the reader passes it; Next mirrors the real
    // chrome, which hands the last page's Next to `onChapterEnd` when present.
    ReaderChrome: (props: {
      sourceName?: string;
      currentPage: number;
      totalPages: number;
      showPageNumber?: boolean;
      onChapterEnd?: () => void;
      onPageChange?: (page: number) => void;
      onOpenChapterActions?: () => void;
      onOpenSettings?: () => void;
    }) => (
      <div data-testid="chrome" data-current-page={props.currentPage}>
        {props.sourceName ? <span data-testid="chrome-source">{props.sourceName}</span> : null}
        {props.showPageNumber === false ? null : (
          <span data-testid="chrome-page-number">
            {props.currentPage} / {props.totalPages}
          </span>
        )}
        <button
          disabled={props.currentPage >= props.totalPages && !props.onChapterEnd}
          onClick={() =>
            props.currentPage < props.totalPages
              ? props.onPageChange?.(props.currentPage + 1)
              : props.onChapterEnd?.()
          }
        >
          Chrome next
        </button>
        <button onClick={props.onOpenChapterActions}>Chapter actions</button>
        <button onClick={props.onOpenSettings}>Settings</button>
      </div>
    ),
    Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
      open ? <dialog open>{children}</dialog> : null,
    SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    Input: (props: Record<string, unknown>) => <input {...(props as object)} />,
    Slider: (props: Record<string, unknown>) => <input type="range" {...(props as object)} />,
    useStateReducer: (reducer: (state: unknown, event: unknown) => unknown, initial: unknown) =>
      useReducer(reducer as never, initial),
  };
});

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

import { ReaderScreen } from './ReaderScreen.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

function buildData(
  overrides: Partial<ReaderSettings> = {},
  titleOverrides: Partial<ReaderSettings> = {},
): ReaderPageData {
  const globalSettings = { ...getDefaultReaderSettings(), ...overrides };
  const settings = { ...globalSettings, ...titleOverrides };
  const pages = Array.from({ length: 5 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg`, width: 800, height: 1200 },
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
    sourceName: 'MangaDex',
    initialPageIndex: 0,
    settings,
    globalSettings,
    titleOverrides,
    engineSettings: toReaderEngineSettings(settings, { globalSettings, titleOverrides }),
  };
}

function renderScreen(overrides: Partial<Parameters<typeof ReaderScreen>[0]> = {}): {
  root: Root;
  container: HTMLElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReaderScreen
        data={buildData()}
        isLoading={false}
        isError={false}
        chromeVisible={true}
        onToggleChrome={() => {}}
        {...overrides}
      />,
    );
  });
  return { root, container };
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === name,
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`);
  return button;
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

function shownPage(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>('[data-testid="chrome"]')?.dataset.currentPage;
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => root.unmount());
  container.remove();
}

describe('ReaderScreen chapter actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Given the chapter menu, When marking read, Then it persists without leaving the reader and reports it', async () => {
    const onMarkRead = vi.fn<() => Promise<void>>(async () => {});
    const { root, container } = renderScreen({ onMarkRead });

    act(() => buttonNamed(container, 'Chapter actions').click());
    await act(async () => buttonNamed(container, 'Mark chapter read').click());
    expect(onMarkRead).toHaveBeenCalledWith(true);
    expect(container.querySelector('[data-testid="reader-status"]')?.textContent).toContain(
      'Chapter marked read',
    );

    act(() => buttonNamed(container, 'Chapter actions').click());
    await act(async () => buttonNamed(container, 'Mark chapter unread').click());
    expect(onMarkRead).toHaveBeenCalledWith(false);
    cleanup(root, container);
  });

  it('Given earlier chapters, When marking previous read, Then the action runs and the failure is reported', async () => {
    const onMarkPreviousRead = vi.fn<() => Promise<void>>(async () => {
      throw new Error('write rejected');
    });
    const { root, container } = renderScreen({ onMarkPreviousRead });

    act(() => buttonNamed(container, 'Chapter actions').click());
    await act(async () => buttonNamed(container, 'Mark previous chapters read').click());
    expect(onMarkPreviousRead).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="reader-status"]')?.textContent).toContain(
      'Could not update read state',
    );
    cleanup(root, container);
  });

  it('Given a provider name, When the reading surface renders, Then the chrome receives attribution', () => {
    const { root, container } = renderScreen();
    expect(container.querySelector('[data-testid="chrome-source"]')?.textContent).toBe('MangaDex');
    cleanup(root, container);
  });
});

describe('ReaderScreen display settings', () => {
  it('Given image smoothing off, When a page renders, Then the image is pixelated', () => {
    const { root, container } = renderScreen({ data: buildData({ imageSmoothing: false }) });
    expect(
      container.querySelector('[data-testid="page-image"]')?.getAttribute('data-image-rendering'),
    ).toBe('pixelated');
    cleanup(root, container);
  });

  it('Given a slide transition, When the page layer renders, Then the setting reaches the layer', () => {
    const { root, container } = renderScreen({ data: buildData({ pageTransition: 'slide' }) });
    expect(
      container
        .querySelector('[data-testid="reader-zoom-layer"]')
        ?.getAttribute('data-page-transition'),
    ).toBe('slide');
    cleanup(root, container);
  });

  it('Given a completed chapter, When it is opened, Then the mount progress does not unmark it', () => {
    vi.useFakeTimers();
    const onPersistProgress = vi.fn<(...args: unknown[]) => void>();
    const data = { ...buildData(), initialCompleted: true };
    const { root, container } = renderScreen({ data, onPersistProgress });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onPersistProgress).not.toHaveBeenCalled();
    vi.useRealTimers();
    cleanup(root, container);
  });

  it('Given diagnostics enabled, When a page load is recorded, Then the panel shows the metric and can clear it', async () => {
    const { root, container } = renderScreen({
      data: buildData({ diagnosticsEnabled: true }),
    });

    await act(async () => buttonNamed(container, 'Page loaded').click());
    act(() => buttonNamed(container, 'Settings').click());
    expect(container.querySelector('[data-testid="reader-diagnostics"]')?.textContent).toContain(
      'Reader diagnostics',
    );
    expect(container.querySelector('[data-testid="reader-diagnostics"]')?.textContent).toContain(
      'Cache hits',
    );

    await act(async () => buttonNamed(container, 'Clear diagnostics').click());
    expect(container.querySelector('[data-testid="reader-diagnostics"]')?.textContent).toContain(
      'Reader diagnostics',
    );
    cleanup(root, container);
  });
});

describe('ReaderScreen chapter end', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Given the transition screen on, When Next is pressed on the last page by key or chrome, Then the transition opens', () => {
    const { root, container } = renderScreen();

    pressKey('End');
    expect(shownPage(container)).toBe('5');
    pressKey('ArrowRight');
    expect(container.querySelector('dialog')?.textContent).toContain('Chapter complete');

    act(() => buttonNamed(container, 'Back to chapter').click());
    expect(container.querySelector('dialog')).toBeNull();
    act(() => buttonNamed(container, 'Chrome next').click());
    expect(container.querySelector('dialog')?.textContent).toContain('Chapter complete');
    cleanup(root, container);
  });

  it('Given the transition screen off, When Next is pressed on the last page, Then the reader stays there and chapter shortcuts still work', () => {
    const onNextChapter = vi.fn<() => void>();
    const onPreviousChapter = vi.fn<() => void>();
    const { root, container } = renderScreen({
      data: buildData({ showChapterTransition: false }),
      onNextChapter,
      onPreviousChapter,
    });

    pressKey('End');
    pressKey('ArrowRight');
    expect(container.querySelector('dialog')).toBeNull();
    expect(shownPage(container)).toBe('5');
    // The chrome's Next has no chapter end to hand the press to.
    expect(buttonNamed(container, 'Chrome next').disabled).toBe(true);

    pressKey('ArrowRight', { shiftKey: true });
    pressKey('ArrowLeft', { shiftKey: true });
    expect(onNextChapter).toHaveBeenCalledTimes(1);
    expect(onPreviousChapter).toHaveBeenCalledTimes(1);
    expect(container.querySelector('dialog')).toBeNull();
    cleanup(root, container);
  });
});

describe('ReaderScreen strip next-chapter threshold', () => {
  const STRIP_VIEWPORT = 100;
  // Five 800x1200 pages end at 6000; the default 25% threshold is 25px past the end.
  const PAST_THRESHOLD = 6000 - STRIP_VIEWPORT + 25;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function renderStrip(overrides: Partial<ReaderSettings> = {}) {
    const mounted = renderScreen({ data: buildData({ readingMode: 'vertical', ...overrides }) });
    const strip = mounted.container.querySelector<HTMLElement>(
      '[data-testid="reader-scroll-view"]',
    );
    if (strip === null) throw new Error('the vertical reader rendered no strip');
    Object.defineProperty(strip, 'clientHeight', { configurable: true, value: STRIP_VIEWPORT });
    return { ...mounted, strip };
  }

  async function scrollStripTo(strip: HTMLElement, scrollTop: number) {
    act(() => {
      strip.scrollTop = scrollTop;
      strip.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 32));
    });
  }

  const chapterCompleteShown = (container: HTMLElement) =>
    [...container.querySelectorAll('dialog')].some((dialog) =>
      dialog.textContent?.includes('Chapter complete'),
    );

  it('Given the transition screen on, When the strip scrolls past the threshold, Then the chapter transition opens', async () => {
    const { root, container, strip } = renderStrip();

    await scrollStripTo(strip, PAST_THRESHOLD - 10);
    expect(chapterCompleteShown(container)).toBe(false);
    await scrollStripTo(strip, PAST_THRESHOLD);
    expect(chapterCompleteShown(container)).toBe(true);
    cleanup(root, container);
  });

  it('Given the transition screen off, When the strip scrolls past the threshold, Then nothing opens', async () => {
    const { root, container, strip } = renderStrip({ showChapterTransition: false });

    await scrollStripTo(strip, PAST_THRESHOLD);
    expect(container.querySelector('dialog')).toBeNull();
    cleanup(root, container);
  });

  it('Given the settings sheet or the chapter menu is open, When the strip scrolls past the threshold, Then the transition stays closed', async () => {
    for (const opener of ['Settings', 'Chapter actions']) {
      const { root, container, strip } = renderStrip();

      act(() => buttonNamed(container, opener).click());
      expect(container.querySelector('dialog')).not.toBeNull();
      await scrollStripTo(strip, PAST_THRESHOLD);
      expect(chapterCompleteShown(container)).toBe(false);
      cleanup(root, container);
    }
  });
});

describe('ReaderScreen page number', () => {
  it('Given this title turns the page number off, When the chrome renders, Then the badge is gone for it alone', () => {
    const off = renderScreen({ data: buildData({}, { showPageNumber: false }) });
    expect(off.container.querySelector('[data-testid="chrome-page-number"]')).toBeNull();
    cleanup(off.root, off.container);

    const on = renderScreen({ data: buildData() });
    expect(on.container.querySelector('[data-testid="chrome-page-number"]')?.textContent).toBe(
      '1 / 5',
    );
    cleanup(on.root, on.container);
  });
});
