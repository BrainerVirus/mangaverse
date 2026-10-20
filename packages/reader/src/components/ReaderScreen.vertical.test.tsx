// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';

vi.mock('@app/cache', () => ({
  CachedPageImage: () => null,
  evictCacheToLimit: vi.fn<() => Promise<number>>(async () => 0),
  listCachedChapterPageIndexes: vi.fn<() => Promise<number[]>>(async () => []),
  markChapterPagesAsRead: vi.fn<() => Promise<void>>(async () => {}),
  prefetchChapterPages: vi.fn<() => Promise<void>>(async () => {}),
  useCoverCacheContext: () => null,
}));

vi.mock('@app/design-system', () => ({
  Button: () => null,
  EmptyState: () => null,
  ErrorState: () => null,
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

import { ReaderScreen } from './ReaderScreen.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import { computeScrollTargetTop } from '../scroll-navigation.js';
import type { ReaderPageData } from '../reader-page-data.js';
import type { ScrollPageMetric } from '../scroll-layout.js';

const PAGE_COUNT = 37;
const PAGE_HEIGHT = 500;
const PAGE_GAP = 100;
const VIEWPORT_HEIGHT = 720;
const STRIDE = PAGE_HEIGHT + PAGE_GAP;

/** Strip metrics for pages of PAGE_HEIGHT separated by PAGE_GAP. */
function stripMetrics(): ScrollPageMetric[] {
  return Array.from({ length: PAGE_COUNT }, (_value, index) => ({
    index,
    top: index * STRIDE,
    height: PAGE_HEIGHT,
  }));
}

function scrollHeight(): number {
  return PAGE_COUNT * STRIDE;
}

function buildData(): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), readingMode: 'vertical' as const };
  const pages = Array.from({ length: PAGE_COUNT }, (_value, index) => ({
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

interface Mounted {
  readonly root: Root;
  readonly container: HTMLElement;
  readonly strip: HTMLElement;
  readonly scrollTo: ReturnType<typeof vi.fn>;
}

/**
 * jsdom has no layout: page nodes report a fixed strip geometry, and the scroll
 * container reports a viewport plus scrollable range. The scrollTo spy records
 * every offset the keyboard navigation asks for.
 */
function mount(pageHeights: Readonly<Record<number, number>> = {}): Mounted {
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
      />,
    );
  });

  const strip = container.querySelector<HTMLElement>('[data-testid="reader-scroll-view"]');
  if (strip === null) throw new Error('scroll view did not render');

  const scrollTo = vi.fn<(...args: unknown[]) => void>();
  Object.defineProperty(strip, 'clientHeight', { value: VIEWPORT_HEIGHT });
  Object.defineProperty(strip, 'scrollHeight', { value: scrollHeight() });
  Object.defineProperty(strip, 'scrollTo', { value: scrollTo });

  for (const node of container.querySelectorAll<HTMLElement>('[data-page-index]')) {
    const index = Number(node.dataset['pageIndex']);
    Object.defineProperty(node, 'offsetTop', { value: index * STRIDE });
    Object.defineProperty(node, 'offsetHeight', { value: pageHeights[index] ?? PAGE_HEIGHT });
  }

  return { root, container, strip, scrollTo };
}

function unmount({ root, container }: Mounted) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** Scrolls the strip so the viewport centre lands inside the given page. */
function scrollCentreToPage(strip: HTMLElement, index: number, pageHeight = PAGE_HEIGHT) {
  act(() => {
    strip.scrollTop = index * STRIDE - (VIEWPORT_HEIGHT - pageHeight) / 2;
    strip.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

/** Waits for the strip's requestAnimationFrame scroll handler to settle. */
async function settleScroll() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

function lastTarget(scrollTo: ReturnType<typeof vi.fn>): number {
  const call = scrollTo.mock.calls.at(-1);
  return (call?.[0] as { top: number } | undefined)?.top ?? -1;
}

function centredOn(index: number, metrics = stripMetrics()): number {
  return computeScrollTargetTop(metrics, index, VIEWPORT_HEIGHT, scrollHeight());
}

describe('ReaderScreen vertical keyboard navigation', () => {
  it('Given the strip centred on page 11, When ArrowRight is pressed, Then the scroll centres page 12', async () => {
    const mounted = mount();
    scrollCentreToPage(mounted.strip, 10);
    await settleScroll();

    press('ArrowRight');

    expect(mounted.scrollTo).toHaveBeenCalledTimes(1);
    expect(lastTarget(mounted.scrollTo)).toBe(centredOn(11));
    unmount(mounted);
  });

  it('Given the strip mid-chapter, When Home is pressed, Then the scroll lands on the first page', () => {
    const mounted = mount();

    press('Home');

    expect(lastTarget(mounted.scrollTo)).toBe(centredOn(0));
    unmount(mounted);
  });

  it('Given the strip mid-chapter, When End is pressed, Then the scroll lands on the last page', () => {
    const mounted = mount();

    press('End');

    expect(lastTarget(mounted.scrollTo)).toBe(centredOn(PAGE_COUNT - 1));
    unmount(mounted);
  });

  it('Given N rapid ArrowRight presses, When they land, Then the strip advances N pages', async () => {
    const mounted = mount();
    scrollCentreToPage(mounted.strip, 10);
    await settleScroll();

    for (let pressCount = 0; pressCount < 5; pressCount += 1) {
      press('ArrowRight');
    }

    // Every press advanced the target, even though the centre-based active page
    // never caught up while the smooth scrolls were still in flight.
    expect(mounted.scrollTo).toHaveBeenCalledTimes(5);
    expect(lastTarget(mounted.scrollTo)).toBe(centredOn(15));
    unmount(mounted);
  });

  it('Given a short page under the viewport centre, When ArrowRight is pressed, Then the scroll centres the next page', async () => {
    const mounted = mount({ 10: 120 });
    scrollCentreToPage(mounted.strip, 10, 120);
    await settleScroll();

    press('ArrowRight');

    const metrics = stripMetrics();
    metrics[10] = { index: 10, top: 10 * STRIDE, height: 120 };
    expect(lastTarget(mounted.scrollTo)).toBe(centredOn(11, metrics));
    unmount(mounted);
  });
});
