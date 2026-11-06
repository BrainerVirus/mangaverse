// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState, type ReactNode } from 'react';
import type { CachedPageImageProps } from '@app/cache';
import { getDefaultReaderSettings, toChapterPageId, type ReaderSettings } from '@app/shared';

const images = vi.hoisted(() => new Map<number, CachedPageImageProps>());
// One identity for the whole file: the prefetch effect keys on the context.
const cacheContext = vi.hoisted(() => ({ db: {}, adapter: {}, cacheLimitBytes: 1024 }));

vi.mock('@app/cache', () => ({
  CachedPageImage: (props: CachedPageImageProps) => {
    images.set(props.pageIndex, props);
    return null;
  },
  createPageDecodePool: () => ({
    setPlan: () => {},
    snapshot: () => ({ decoded: 0, pending: 0, released: 0, failures: 0 }),
    dispose: () => {},
  }),
  holdReaderLocks: () => () => {},
  evictCacheToLimit: async () => ({ evictedCount: 0, failedBlobKeys: [] }),
  listCachedChapterPageIndexes: async () => [],
  markChapterPagesAsRead: async () => {},
  prefetchChapterPages: async () => {},
  useCoverCacheContext: () => cacheContext,
}));

vi.mock('@app/design-system', async () => {
  const { useReducer } = await import('react');
  return {
    Button: () => null,
    EmptyState: () => null,
    ErrorState: () => null,
    GlassSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    LoadingState: () => null,
    ReaderChrome: ({ currentPage }: { currentPage: number }) => (
      <output data-testid="chrome-page">{currentPage}</output>
    ),
    Sheet: () => null,
    SheetContent: () => null,
    SheetHeader: () => null,
    SheetTitle: () => null,
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
import { resolveAutoStripSwitch, type ReaderPageMeasurement } from '../measured-page-shape.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

function buildData(
  patch: Partial<ReaderSettings> = {},
  titleOverrides?: ReaderPageData['titleOverrides'],
): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...patch };
  // No stored shapes: the first decode is the only evidence of the chapter's shape.
  const pages = Array.from({ length: 5 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.png` },
  }));
  return {
    chapter: { id: 'chapter-1', mangaId: 'manga-1', title: 'Chapter 1', pages, pageCount: 5 },
    mangaId: 'manga-1' as ReaderPageData['mangaId'],
    chapterId: 'chapter-1' as ReaderPageData['chapterId'],
    providerId: 'mangadex',
    initialPageIndex: 2,
    settings,
    ...(titleOverrides !== undefined ? { titleOverrides } : {}),
    engineSettings: toReaderEngineSettings(settings, { titleOverrides, pages }),
  };
}

const measured: ReaderPageMeasurement[] = [];

/** Stands in for the route: it owns the reader data and applies the Auto switch. */
function Host({ initial }: { initial: ReaderPageData }) {
  const [data, setData] = useState(initial);
  return (
    <ReaderScreen
      data={data}
      isLoading={false}
      isError={false}
      chromeVisible={true}
      onToggleChrome={() => {}}
      onPageMeasured={(measurement) => {
        measured.push(measurement);
        setData((current) => resolveAutoStripSwitch(current, measurement) ?? current);
      }}
    />
  );
}

let mounted: { root: Root; container: HTMLElement } | undefined;

function mount(initial: ReaderPageData): HTMLElement {
  images.clear();
  measured.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Host initial={initial} />));
  mounted = { root, container };
  return container;
}

afterEach(() => {
  if (mounted === undefined) return;
  act(() => mounted!.root.unmount());
  mounted.container.remove();
  mounted = undefined;
});

function decode(pageIndex: number, size: { width: number; height: number }) {
  const image = images.get(pageIndex);
  if (image?.onLoad === undefined) throw new Error(`page ${pageIndex + 1} has no image`);
  act(() => image.onLoad!(size));
}

function strip(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-testid="reader-scroll-view"]');
}

function shownPage(container: HTMLElement): string | null | undefined {
  return container.querySelector('[data-testid="chrome-page"]')?.textContent;
}

describe('ReaderScreen first-decode page shape (R6)', () => {
  it('Given Auto and no stored shapes, When the first page decodes as a long strip, Then the reader switches to the strip on the same page', () => {
    const container = mount(buildData());
    expect(strip(container)).toBeNull();
    expect(shownPage(container)).toBe('3');

    decode(2, { width: 800, height: 6000 });

    expect(measured).toEqual([{ pageIndex: 2, width: 800, height: 6000 }]);
    expect(strip(container)).not.toBeNull();
    expect(shownPage(container)).toBe('3');
  });

  it('Given Auto, When the first page decodes as an ordinary page, Then the reader stays paged', () => {
    const container = mount(buildData());

    decode(2, { width: 800, height: 1200 });

    expect(measured).toEqual([{ pageIndex: 2, width: 800, height: 1200 }]);
    expect(strip(container)).toBeNull();
  });

  it('Given a concrete title mode, When a long-strip page decodes, Then the reader stays paged', () => {
    const container = mount(buildData({ readingMode: 'rtl' }, { readingMode: 'rtl' }));

    decode(2, { width: 800, height: 6000 });

    expect(strip(container)).toBeNull();
  });

  it('Given the strip, When a page decodes, Then its size is reported once per new size', () => {
    const container = mount(buildData({ readingMode: 'vertical' }, { readingMode: 'vertical' }));
    expect(strip(container)).not.toBeNull();

    decode(2, { width: 800, height: 6000 });
    decode(2, { width: 800, height: 6000 });

    expect(measured).toEqual([{ pageIndex: 2, width: 800, height: 6000 }]);
  });
});
