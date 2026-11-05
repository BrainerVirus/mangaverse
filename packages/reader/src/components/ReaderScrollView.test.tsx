// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { toChapterPageId } from '@app/shared';
import type { ReaderPage } from '../types.js';
import { ReaderScrollView, type ReaderScrollViewHandle } from './ReaderScrollView.js';

const cacheRender = vi.hoisted(() => ({
  pages: [] as number[],
  props: [] as { pageIndex: number; onLoad?: (size: { width: number; height: number }) => void }[],
}));

vi.mock('@app/cache', () => ({
  CachedPageImage: (props: {
    pageIndex: number;
    onLoad?: (size: { width: number; height: number }) => void;
  }) => {
    cacheRender.pages.push(props.pageIndex);
    cacheRender.props.push(props);
    return null;
  },
}));

const VIEWPORT_HEIGHT = 100;

interface ObserverRecord {
  readonly callback: ResizeObserverCallback;
}

/** jsdom has no layout, so the test fires the observer the component registers. */
const observers: ObserverRecord[] = [];

class ResizeObserverStub {
  private readonly record: ObserverRecord;
  constructor(callback: ResizeObserverCallback) {
    this.record = { callback };
    observers.push(this.record);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

function fireResize() {
  const record = observers.at(-1);
  if (record === undefined) throw new Error('the strip registered no ResizeObserver');
  act(() => {
    record.callback([], {} as ResizeObserver);
  });
}

function buildPages(count: number): readonly ReaderPage[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg` },
  }));
}

function Harness({
  pages,
  onActivePageChange,
  handleRef,
  preloadAhead,
  lowMemoryMode,
  longStripOptimization,
  cacheReady = false,
}: {
  readonly pages: readonly ReaderPage[];
  readonly onActivePageChange: (index: number) => void;
  readonly handleRef: { current: ReaderScrollViewHandle | null };
  readonly preloadAhead?: number;
  readonly lowMemoryMode?: boolean;
  readonly longStripOptimization?: boolean;
  readonly cacheReady?: boolean;
}) {
  const [active, setActive] = useState(0);
  return (
    <ReaderScrollView
      pages={pages}
      gapPx={0}
      activePageIndex={active}
      onActivePageChange={(index) => {
        setActive(index);
        onActivePageChange(index);
      }}
      providerId="mangadex"
      mangaId="manga-1"
      chapterId="chapter-1"
      cacheReady={cacheReady}
      reducedMotion
      {...(preloadAhead === undefined ? {} : { preloadAhead })}
      {...(lowMemoryMode === undefined ? {} : { lowMemoryMode })}
      {...(longStripOptimization === undefined ? {} : { longStripOptimization })}
      onHandle={(handle) => {
        handleRef.current = handle;
      }}
    />
  );
}

interface Mounted {
  readonly root: Root;
  readonly container: HTMLElement;
  readonly strip: HTMLElement;
  readonly handleRef: { current: ReaderScrollViewHandle | null };
  readonly activeChanges: number[];
}

function mount(
  pageCount: number,
  options: {
    readonly pages?: readonly ReaderPage[];
    readonly preloadAhead?: number;
    readonly lowMemoryMode?: boolean;
    readonly longStripOptimization?: boolean;
    readonly cacheReady?: boolean;
  } = {},
): Mounted {
  observers.length = 0;
  cacheRender.pages.length = 0;
  cacheRender.props.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const handleRef = { current: null };
  const activeChanges: number[] = [];
  act(() => {
    root.render(
      <Harness
        pages={options.pages ?? buildPages(pageCount)}
        handleRef={handleRef}
        onActivePageChange={(index) => activeChanges.push(index)}
        {...(options.preloadAhead === undefined ? {} : { preloadAhead: options.preloadAhead })}
        {...(options.lowMemoryMode === undefined ? {} : { lowMemoryMode: options.lowMemoryMode })}
        {...(options.longStripOptimization === undefined
          ? {}
          : { longStripOptimization: options.longStripOptimization })}
        {...(options.cacheReady === undefined ? {} : { cacheReady: options.cacheReady })}
      />,
    );
  });

  const strip = container.querySelector<HTMLElement>('[data-testid="reader-scroll-view"]');
  if (strip === null) throw new Error('scroll view did not render');
  Object.defineProperty(strip, 'clientHeight', { configurable: true, value: VIEWPORT_HEIGHT });

  return { root, container, strip, handleRef, activeChanges };
}

function unmount({ root, container }: Mounted) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

/** Page N starts at N * stride and is `height` tall. */
function stubStrip(container: HTMLElement, stride: number, height: number) {
  for (const node of container.querySelectorAll<HTMLElement>('[data-page-index]')) {
    const index = Number(node.dataset['pageIndex']);
    Object.defineProperty(node, 'offsetTop', { configurable: true, value: index * stride });
    Object.defineProperty(node, 'offsetHeight', { configurable: true, value: height });
  }
}

async function scrollTo(strip: HTMLElement, scrollTop: number) {
  act(() => {
    strip.scrollTop = scrollTop;
    strip.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  // The scroll handler reads offsets in a requestAnimationFrame.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

describe('ReaderScrollView strip rows', () => {
  it('Given provider dimensions, When a landscape page renders, Then the row keeps that ratio', () => {
    const page: ReaderPage = {
      id: toChapterPageId('landscape'),
      index: 0,
      image: { url: 'https://example.com/landscape.jpg', width: 1600, height: 900 },
    };

    const mounted = mount(1, { pages: [page] });
    const row = mounted.container.querySelector<HTMLElement>('[data-page-index="0"]');
    expect(row?.style.aspectRatio).toBe('1600 / 900');

    unmount(mounted);
  });

  it('Given a preload budget, When the strip renders, Then only the budgeted neighbours mount', () => {
    const full = mount(8, { preloadAhead: 5, cacheReady: true });
    expect([...cacheRender.pages].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    unmount(full);

    const lowMemory = mount(8, { preloadAhead: 5, lowMemoryMode: true, cacheReady: true });
    expect([...cacheRender.pages].sort((a, b) => a - b)).toEqual([0, 1]);
    unmount(lowMemory);
  });
});

describe('ReaderScrollView metrics', () => {
  it('Given the strip resized, When scrolling, Then the active page comes from the new offsets', async () => {
    const mounted = mount(8);
    // 8 pages of 100px: tops 0, 100, …, 700.
    stubStrip(mounted.container, 100, 100);
    fireResize();

    // A 100px viewport at scrollTop 250 centres on 300, inside page 3.
    await scrollTo(mounted.strip, 250);
    expect(mounted.activeChanges.at(-1)).toBe(3);

    // The strip grows tenfold, so the same scrollTop now sits inside page 0.
    // A stale cache would keep resolving 3 and never call back.
    stubStrip(mounted.container, 1000, 1000);
    fireResize();
    await scrollTo(mounted.strip, 250);

    expect(mounted.activeChanges.at(-1)).toBe(0);
    unmount(mounted);
  });

  it('Given DOM order disagrees with offsets, When measured, Then metrics stay sorted by top', () => {
    const mounted = mount(3);
    stubStrip(mounted.container, 100, 100);

    const [first] = mounted.container.querySelectorAll<HTMLElement>('[data-page-index]');
    if (first?.parentElement === null || first?.parentElement === undefined) {
      throw new Error('page row has no strip parent');
    }
    // Move the first row last: document order (1, 2, 0) no longer matches the
    // measured tops, which the binary search requires to increase.
    first.parentElement.append(first);

    const handle = mounted.handleRef.current;
    if (handle === null) throw new Error('scroll view published no handle');
    expect(handle.measurePages().map((metric) => metric.top)).toEqual([0, 100, 200]);
    unmount(mounted);
  });
});

describe('ReaderScrollView virtualization', () => {
  function buildSizedPages(count: number): readonly ReaderPage[] {
    return Array.from({ length: count }, (_value, index) => ({
      id: toChapterPageId(`page-${index}`),
      index,
      image: { url: `https://example.com/${index}.jpg`, width: 800, height: 1200 },
    }));
  }

  it('Given a 200-page chapter, When it renders, Then only a bounded row and image window mounts', () => {
    const pages = buildSizedPages(200);
    const mounted = mount(0, { pages, preloadAhead: 3, cacheReady: true });

    const rows = mounted.container.querySelectorAll('[data-page-index]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(16);
    // The image window stays at the preload radius even though the row window
    // is a little larger, so the DOM never grows with chapter length.
    expect(cacheRender.pages.length).toBeLessThanOrEqual(4);

    const offsets = JSON.parse(mounted.strip.dataset['pageOffsets'] ?? '[]') as number[];
    expect(offsets).toHaveLength(200);
    // 1200px page + 0 gap; the last page starts after the previous 199.
    expect(offsets.at(-1)).toBe(199 * 1200);
    expect(mounted.strip.dataset['pageCount']).toBe('200');

    unmount(mounted);
  });

  it('Given a 200-page chapter scrolled to the end, When the strip settles, Then the last row mounts within the same bound', async () => {
    const pages = buildSizedPages(200);
    const mounted = mount(0, { pages, preloadAhead: 3, cacheReady: true });
    Object.defineProperty(mounted.strip, 'scrollTo', {
      configurable: true,
      value: vi.fn<() => void>(),
    });

    const offsets = JSON.parse(mounted.strip.dataset['pageOffsets'] ?? '[]') as number[];
    await scrollTo(mounted.strip, offsets[199] ?? 0);

    expect(mounted.container.querySelector('[data-page-index="199"]')).not.toBeNull();
    const rows = mounted.container.querySelectorAll('[data-page-index]');
    expect(rows.length).toBeLessThanOrEqual(16);
    expect(mounted.activeChanges.at(-1)).toBe(199);

    unmount(mounted);
  });

  it('Given a long strip with no stored dimensions, When its first page decodes, Then the image window shrinks to one page ahead', () => {
    const pages = Array.from({ length: 10 }, (_value, index) => ({
      id: toChapterPageId(`page-${index}`),
      index,
      image: { url: `https://example.com/${index}.jpg` },
    })) as unknown as readonly ReaderPage[];
    const mounted = mount(0, {
      pages,
      preloadAhead: 4,
      longStripOptimization: true,
      cacheReady: true,
    });
    // Nothing has been measured yet, so the optimization cannot see a strip.
    expect(cacheRender.pages.length).toBeGreaterThan(3);

    const first = cacheRender.props.find((props) => props.pageIndex === 0);
    if (first?.onLoad === undefined) throw new Error('the first page never mounted an image');
    cacheRender.pages.length = 0;
    act(() => first.onLoad!({ width: 800, height: 6000 }));

    expect(cacheRender.pages.length).toBeGreaterThan(0);
    expect(cacheRender.pages.length).toBeLessThanOrEqual(3);
    unmount(mounted);
  });

  it('Given a page past browser image limits, When it renders, Then its row is split into clipped tiles', () => {
    const tall: ReaderPage = {
      id: toChapterPageId('tall'),
      index: 0,
      image: { url: 'https://example.com/tall.jpg', width: 800, height: 20_000 },
    };
    const mounted = mount(1, { pages: [tall] });
    const row = mounted.container.querySelector<HTMLElement>('[data-page-index="0"]');
    expect(row).not.toBeNull();

    const tiles = row!.querySelectorAll('[data-page-tile]');
    expect(tiles.length).toBe(5);
    // Tile heights add up to the full rendered page height.
    const heights = [...tiles].map((tile) => (tile as HTMLElement).style.height);
    expect(heights).toEqual(['4096px', '4096px', '4096px', '4096px', '3616px']);
    expect(row!.style.height).toBe('20000px');

    unmount(mounted);
  });
});

describe('ReaderScrollView placeholder shape', () => {
  it('Given no provider dimensions, When the first page decodes, Then the strip adopts its shape instead of reflowing page by page', () => {
    const pages = Array.from({ length: 10 }, (_value, index) => ({
      id: toChapterPageId(`page-${index}`),
      index: 0,
      image: { url: `https://example.com/${index}.jpg` },
    })) as unknown as readonly ReaderPage[];
    const sized = pages.map((page, index) => ({ ...page, index }));
    const mounted = mount(0, { pages: sized, preloadAhead: 3, cacheReady: true });

    const before = JSON.parse(mounted.strip.dataset['pageOffsets'] ?? '[]') as number[];
    // 2:3 placeholder: a 800px strip renders 1200px pages.
    expect(before[1]).toBe(1200);

    const first = cacheRender.props.find((props) => props.pageIndex === 0);
    if (first?.onLoad === undefined) throw new Error('the first page never mounted an image');
    act(() => first.onLoad!({ width: 800, height: 800 }));

    const after = JSON.parse(mounted.strip.dataset['pageOffsets'] ?? '[]') as number[];
    // The decoded square page teaches the strip the chapter's real shape, so an
    // unloaded page is already its final height.
    expect(after[1]).toBe(800);
    expect(after[9]).toBe(9 * 800);

    unmount(mounted);
  });
});
