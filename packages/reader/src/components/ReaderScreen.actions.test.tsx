// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import type { ReaderSettings } from '@app/shared';

vi.mock('@app/cache', () => {
  const context = { db: {}, adapter: {} };
  return {
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

vi.mock('@app/motion', () => ({
  useReducedMotion: () => false,
  useGsapContext: () => {},
  readerPageEnter: vi.fn<() => void>(),
}));

vi.mock('@app/design-system', () => ({
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
  LoadingState: () => null,
  ReaderChrome: (props: {
    sourceName?: string;
    onOpenChapterActions?: () => void;
    onOpenSettings?: () => void;
  }) => (
    <div data-testid="chrome">
      {props.sourceName ? <span data-testid="chrome-source">{props.sourceName}</span> : null}
      <button onClick={props.onOpenChapterActions}>Chapter actions</button>
      <button onClick={props.onOpenSettings}>Settings</button>
    </div>
  ),
  Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <dialog open>{children}</dialog> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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

import { ReaderScreen } from './ReaderScreen.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

function buildData(overrides: Partial<ReaderSettings> = {}): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...overrides };
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
    engineSettings: toReaderEngineSettings(settings),
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
