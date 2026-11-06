// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import type { ReaderPage } from '../types.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
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
    return <img alt={`Page ${props.pageIndex + 1}`} data-page-index={props.pageIndex} />;
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
  tilingThresholdPx,
  dataSaver,
  maxWidthPercent,
  nextChapterThresholdPercent,
  onChapterEnd,
  initialActive = 0,
  cacheReady = false,
}: {
  readonly pages: readonly ReaderPage[];
  readonly onActivePageChange: (index: number) => void;
  readonly handleRef: { current: ReaderScrollViewHandle | null };
  readonly preloadAhead?: number;
  readonly lowMemoryMode?: boolean;
  readonly longStripOptimization?: boolean;
  readonly tilingThresholdPx?: number;
  readonly dataSaver?: boolean;
  readonly maxWidthPercent?: number;
  readonly nextChapterThresholdPercent?: number;
  readonly onChapterEnd?: () => void;
  readonly initialActive?: number;
  readonly cacheReady?: boolean;
}) {
  const [active, setActive] = useState(initialActive);
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
      {...(tilingThresholdPx === undefined ? {} : { tilingThresholdPx })}
      {...(dataSaver === undefined ? {} : { dataSaver })}
      {...(maxWidthPercent === undefined ? {} : { maxWidthPercent })}
      {...(nextChapterThresholdPercent === undefined ? {} : { nextChapterThresholdPercent })}
      {...(onChapterEnd === undefined ? {} : { onChapterEnd })}
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
    readonly tilingThresholdPx?: number;
    readonly dataSaver?: boolean;
    readonly maxWidthPercent?: number;
    readonly nextChapterThresholdPercent?: number;
    readonly onChapterEnd?: () => void;
    readonly initialActive?: number;
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
        {...(options.tilingThresholdPx === undefined
          ? {}
          : { tilingThresholdPx: options.tilingThresholdPx })}
        {...(options.dataSaver === undefined ? {} : { dataSaver: options.dataSaver })}
        {...(options.maxWidthPercent === undefined
          ? {}
          : { maxWidthPercent: options.maxWidthPercent })}
        {...(options.nextChapterThresholdPercent === undefined
          ? {}
          : { nextChapterThresholdPercent: options.nextChapterThresholdPercent })}
        {...(options.onChapterEnd === undefined ? {} : { onChapterEnd: options.onChapterEnd })}
        {...(options.initialActive === undefined ? {} : { initialActive: options.initialActive })}
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

  it('Given data saver, When the viewport straddles a page boundary, Then both visible pages stay mounted', async () => {
    const engine = toReaderEngineSettings({
      ...getDefaultReaderSettings(),
      dataSaver: true,
      preloadAhead: 5,
    });
    expect(engine.preloadAhead).toBe(0);

    const mounted = mount(8, {
      preloadAhead: engine.preloadAhead,
      dataSaver: true,
      cacheReady: true,
    });
    stubStrip(mounted.container, 100, 100);
    expect(cacheRender.pages).toEqual([0]);

    // Viewport [50, 150) overlaps page 0 [0, 100) and page 1 [100, 200).
    await scrollTo(mounted.strip, 50);
    const alts = [...mounted.container.querySelectorAll('img')].map((image) => image.alt);
    expect(alts).toEqual(expect.arrayContaining(['Page 1', 'Page 2']));
    expect(alts).not.toContain('Page 3');

    // Rows still virtualise: placeholders keep the strip's height and offsets.
    expect(mounted.container.querySelectorAll('[data-page-index]').length).toBeGreaterThan(1);
    unmount(mounted);
  });

  it('Given data saver, When the viewport grows over a page boundary, Then both now-visible pages mount', () => {
    const mounted = mount(8, { dataSaver: true, cacheReady: true });
    stubStrip(mounted.container, 100, 100);
    expect([...mounted.container.querySelectorAll('img')].map((image) => image.alt)).toEqual([
      'Page 1',
    ]);

    Object.defineProperty(mounted.strip, 'clientHeight', { configurable: true, value: 200 });
    fireResize();

    const alts = [...mounted.container.querySelectorAll('img')].map((image) => image.alt);
    expect(alts).toEqual(expect.arrayContaining(['Page 1', 'Page 2']));
    unmount(mounted);
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

  describe('tiling threshold', () => {
    const rowTiles = (height: number, tilingThresholdPx?: number) => {
      const page: ReaderPage = {
        id: toChapterPageId('page'),
        index: 0,
        image: { url: 'https://example.com/page.jpg', width: 800, height },
      };
      const mounted = mount(1, {
        pages: [page],
        ...(tilingThresholdPx === undefined ? {} : { tilingThresholdPx }),
      });
      const tiles = mounted.container.querySelectorAll('[data-page-tile]').length;
      unmount(mounted);
      return tiles;
    };

    it.each([
      ['4096px', 4096, 5],
      ['8192px', 8192, 5],
      ['16384px', 16_384, 5],
    ])('Given a %s threshold, When a 20,000px page renders, Then it is tiled', (_label, px, n) => {
      expect(rowTiles(20_000, px)).toBe(n);
    });

    it('Given a 20,000px page and a threshold above it, When it renders, Then it stays one tile', () => {
      expect(rowTiles(20_000, 32_768)).toBe(1);
    });

    it.each([
      [4096, 4097, 2],
      [4096, 6000, 2],
      [8192, 6000, 1],
      [8192, 8192, 1],
      [8192, 8193, 3],
      [16_384, 16_384, 1],
      [16_384, 16_385, 5],
    ])(
      'Given a %ipx threshold, When a %ipx page renders, Then it has %i tiles',
      (px, height, n) => {
        expect(rowTiles(height, px)).toBe(n);
      },
    );

    it('Given no threshold, When a 9,000px page renders, Then Auto tiles it at 8192px', () => {
      expect(rowTiles(9000)).toBe(3);
      expect(rowTiles(9000, 16_384)).toBe(1);
    });

    it('Given a page below the threshold, When it renders, Then it stays one tile', () => {
      expect(rowTiles(4000, 4096)).toBe(1);
    });
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

describe('ReaderScrollView max strip width', () => {
  // 2:3 pages, so a row is 1.5 times the strip width.
  const pages = Array.from({ length: 4 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg`, width: 800, height: 1200 },
  }));

  function stripAt(width: number, maxWidthPercent?: number) {
    const mounted = mount(0, {
      pages,
      ...(maxWidthPercent === undefined ? {} : { maxWidthPercent }),
    });
    Object.defineProperty(mounted.strip, 'clientWidth', { configurable: true, value: width });
    fireResize();
    const content = mounted.container.querySelector<HTMLElement>(
      '[data-testid="reader-scroll-content"]',
    );
    if (content === null) throw new Error('the strip rendered no content wrapper');
    const offsets = JSON.parse(mounted.strip.dataset['pageOffsets'] ?? '[]') as number[];
    return { mounted, content, secondTop: offsets[1] };
  }

  it.each([
    ['Auto on a 999px reader', 999, undefined, '100%', 1499],
    ['Auto on a 1280px reader', 1280, undefined, '70%', 1344],
    ['an explicit 80% on a 999px reader', 999, 80, '80%', 1199],
    ['an explicit 80% on a 1280px reader', 1280, 80, '80%', 1536],
  ])(
    'Given %s, When the strip lays out, Then the centred content is %s wide and rows follow that width',
    (_case, width, maxWidthPercent, expectedWidth, expectedSecondTop) => {
      const { mounted, content, secondTop } = stripAt(width, maxWidthPercent);

      expect(content.style.width).toBe(expectedWidth);
      expect(content.classList.contains('mx-auto')).toBe(true);
      // The scroll container keeps the reader's full width.
      expect(mounted.strip.classList.contains('w-full')).toBe(true);
      expect(secondTop).toBe(expectedSecondTop);
      unmount(mounted);
    },
  );
});

describe('ReaderScrollView next-chapter threshold', () => {
  // Three 800x1200 pages: the last one ends at 3600; the viewport is 100 tall.
  const LAST_BOTTOM = 3600;
  const pages = Array.from({ length: 3 }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg`, width: 800, height: 1200 },
  }));

  function stripWith(nextChapterThresholdPercent?: number, onChapterEnd = vi.fn<() => void>()) {
    const mounted = mount(0, {
      pages,
      onChapterEnd,
      ...(nextChapterThresholdPercent === undefined ? {} : { nextChapterThresholdPercent }),
    });
    return { mounted, onChapterEnd };
  }

  /** Scroll so the last page's bottom sits `overscroll` px past the viewport bottom. */
  const pastEnd = (overscroll: number) => LAST_BOTTOM - VIEWPORT_HEIGHT + overscroll;

  it('Given the default 25% threshold, When the strip scrolls below, to and past it, Then the chapter end fires once at 25% of the viewport', async () => {
    const { mounted, onChapterEnd } = stripWith();

    await scrollTo(mounted.strip, pastEnd(0));
    await scrollTo(mounted.strip, pastEnd(20));
    expect(onChapterEnd).not.toHaveBeenCalled();

    await scrollTo(mounted.strip, pastEnd(25));
    expect(onChapterEnd).toHaveBeenCalledTimes(1);

    // Still past the threshold: no repeat, however far it scrolls.
    await scrollTo(mounted.strip, pastEnd(40));
    await scrollTo(mounted.strip, pastEnd(50));
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given the transition fired, When the strip scrolls back above the threshold and crosses again, Then it re-arms and fires a second time', async () => {
    const { mounted, onChapterEnd } = stripWith();

    await scrollTo(mounted.strip, pastEnd(30));
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    await scrollTo(mounted.strip, pastEnd(10));
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    await scrollTo(mounted.strip, pastEnd(30));
    expect(onChapterEnd).toHaveBeenCalledTimes(2);
    unmount(mounted);
  });

  it('Given a 0% threshold, When the last page bottom reaches the viewport bottom, Then it fires', async () => {
    const { mounted, onChapterEnd } = stripWith(0);

    await scrollTo(mounted.strip, pastEnd(-20));
    expect(onChapterEnd).not.toHaveBeenCalled();
    await scrollTo(mounted.strip, pastEnd(0));
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given a 100% threshold, When the last page bottom is short of the viewport top, Then it waits until the bottom reaches the top', async () => {
    const { mounted, onChapterEnd } = stripWith(100);

    await scrollTo(mounted.strip, pastEnd(50));
    await scrollTo(mounted.strip, pastEnd(98));
    expect(onChapterEnd).not.toHaveBeenCalled();
    // The last page's bottom is exactly at the viewport top.
    await scrollTo(mounted.strip, LAST_BOTTOM);
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given the threshold, When the strip lays out, Then the tail spacer is at least half a viewport and long enough to reach it', () => {
    const contentHeight = (percent: number) => {
      const { mounted } = stripWith(percent);
      fireResize();
      const content = mounted.container.querySelector<HTMLElement>(
        '[data-testid="reader-scroll-content"]',
      );
      const height = content?.style.height;
      unmount(mounted);
      return height;
    };

    expect(contentHeight(0)).toBe(`${LAST_BOTTOM + 50}px`);
    expect(contentHeight(25)).toBe(`${LAST_BOTTOM + 50}px`);
    expect(contentHeight(100)).toBe(`${LAST_BOTTOM + 100}px`);
  });

  it('Given a strip remounted for another chapter, When it scrolls past the threshold, Then the new strip fires on its own crossing', async () => {
    const { mounted, onChapterEnd } = stripWith();
    await scrollTo(mounted.strip, pastEnd(30));
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    unmount(mounted);

    const next = stripWith(undefined, onChapterEnd);
    await scrollTo(next.mounted.strip, pastEnd(30));
    expect(onChapterEnd).toHaveBeenCalledTimes(2);
    unmount(next.mounted);
  });

  it('Given a strip that opens already past the threshold, When it scrolls on, Then the resume position is not a crossing', async () => {
    // The last page is only 40px tall, so resuming on it already sits 60px past the end.
    const shortLast = [
      ...pages.slice(0, 2),
      {
        id: toChapterPageId('page-2'),
        index: 2,
        image: { url: 'https://example.com/2.jpg', width: 800, height: 40 },
      },
    ];
    const clientHeight = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(VIEWPORT_HEIGHT);
    const offsetTop = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return Number(this.dataset['pageIndex'] ?? 0) * 1200;
      });
    const onChapterEnd = vi.fn<() => void>();
    const mounted = mount(0, { pages: shortLast, initialActive: 2, onChapterEnd });
    clientHeight.mockRestore();
    offsetTop.mockRestore();

    expect(mounted.strip.scrollTop).toBe(2400);
    await scrollTo(mounted.strip, 2410);
    expect(onChapterEnd).not.toHaveBeenCalled();
    // Leaving and coming back is a crossing.
    await scrollTo(mounted.strip, 1000);
    await scrollTo(mounted.strip, 2400);
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given a chapter shorter than the viewport and already past at the top, When the reader scrolls, Then the transition is offered', async () => {
    const short = [
      {
        id: toChapterPageId('short'),
        index: 0,
        image: { url: 'https://example.com/short.jpg', width: 800, height: 60 },
      },
    ];
    const onChapterEnd = vi.fn<() => void>();
    const mounted = mount(0, { pages: short, onChapterEnd });

    // The 60px page is already 40px past the viewport bottom at 25%, and the
    // strip cannot scroll below it; the first real scroll arms and fires.
    await scrollTo(mounted.strip, 10);
    expect(onChapterEnd).toHaveBeenCalledTimes(1);
    unmount(mounted);
  });

  it('Given a chapter shorter than the viewport, When it renders, Then the tail leaves room to reach the threshold', () => {
    const short = [
      {
        id: toChapterPageId('short'),
        index: 0,
        image: { url: 'https://example.com/short.jpg', width: 800, height: 40 },
      },
    ];
    const mounted = mount(0, { pages: short, onChapterEnd: vi.fn<() => void>() });
    fireResize();
    const content = mounted.container.querySelector<HTMLElement>(
      '[data-testid="reader-scroll-content"]',
    );
    // Viewport 100 + 25% threshold + 1px, so a scroll gesture has room to fire.
    expect(Number.parseFloat(content?.style.height ?? '0')).toBeGreaterThanOrEqual(126);
    unmount(mounted);
  });

  it('Given a scroll frame queued before a modal opens, When the frame runs, Then the stale callback does not fire', async () => {
    const onChapterEnd = vi.fn<() => void>();
    const mounted = mount(0, { pages, onChapterEnd });

    // Queue the frame without letting it run.
    act(() => {
      mounted.strip.scrollTop = pastEnd(30);
      mounted.strip.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // The modal opens: ReaderScreen re-renders with no onChapterEnd.
    act(() => {
      mounted.root.render(
        <Harness pages={pages} handleRef={mounted.handleRef} onActivePageChange={() => {}} />,
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 32));
    });
    expect(onChapterEnd).not.toHaveBeenCalled();
    unmount(mounted);
  });
});
