// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { toChapterPageId } from '@app/shared';
import type { ReaderPage } from '../types.js';
import { ReaderScrollView } from './ReaderScrollView.js';

// A real strip with the real ink sketch: only what the viewport shows may run a timeline.

vi.mock('@app/cache', () => ({
  // A page image that never arrives, so the data saver window shows as mounted images.
  CachedPageImage: ({ pageIndex }: { pageIndex: number }) => (
    <img alt="" data-image-page={pageIndex} />
  ),
}));

const VIEWPORT = { width: 600, height: 800 };
/** A page far taller than the tiling threshold: 600 x 30,000 is eight 4096px tiles. */
const TALL = { width: 600, height: 30_000 };
const GAP = 2_000;

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => VIEWPORT.width,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT.height,
  });
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth);
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight);
});

function page(index: number, size: { width: number; height: number }): ReaderPage {
  return {
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.jpg`, ...size },
  };
}

function Harness({
  pages,
  gapPx,
  dataSaver = false,
}: {
  pages: readonly ReaderPage[];
  gapPx: number;
  dataSaver?: boolean;
}) {
  const [active, setActive] = useState(0);
  return (
    <ReaderScrollView
      pages={pages}
      gapPx={gapPx}
      fitMode="width"
      activePageIndex={active}
      onActivePageChange={setActive}
      providerId="mangadex"
      mangaId="manga-1"
      chapterId="chapter-1"
      // Without data saver the pages are still on their way: every tile shows its plate and sketch.
      cacheReady={dataSaver}
      dataSaver={dataSaver}
      preloadAhead={dataSaver ? 0 : 3}
      reducedMotion={false}
      onHandle={() => {}}
    />
  );
}

let mounted: { root: Root; container: HTMLElement } | undefined;

function mount(pages: readonly ReaderPage[], gapPx: number, dataSaver = false): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness pages={pages} gapPx={gapPx} dataSaver={dataSaver} />));
  mounted = { root, container };
  const strip = container.querySelector<HTMLElement>('[data-testid="reader-scroll-view"]');
  if (strip === null) throw new Error('the strip did not render');
  return strip;
}

afterEach(() => {
  if (mounted !== undefined) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
});

async function scrollTo(strip: HTMLElement, top: number): Promise<void> {
  strip.scrollTop = top;
  await act(async () => {
    strip.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

/**
 * Sketches told to draw, and sketches whose ink a running loop is drawing: a live timeline sets
 * the borders' dash inline, a sketch at rest (the finished drawing) has none.
 */
function drawing(container: ParentNode) {
  const sketches = [...container.querySelectorAll('[data-panel-sketch]')];
  return {
    sketches: container.querySelectorAll('[data-sketch-animate]').length,
    timelines: sketches.filter((sketch) =>
      [...sketch.querySelectorAll<SVGElement>('[data-sketch-stroke]')].some(
        (stroke) => stroke.style.strokeDasharray !== '',
      ),
    ).length,
  };
}

describe('ReaderScrollView sketch visibility', () => {
  it('Given a page tiled far past the viewport, When the first tile is on screen, Then only that tile draws', async () => {
    const strip = mount([page(0, TALL), page(1, { width: 600, height: 900 })], GAP);
    const tiles = strip.querySelectorAll('[data-page-index="0"] [data-page-tile]');
    expect(tiles.length).toBe(8);
    expect(strip.querySelectorAll('[data-page-index="0"] [data-panel-sketch]')).toHaveLength(8);

    await scrollTo(strip, 0);
    expect(drawing(strip)).toEqual({ sketches: 1, timelines: 1 });
    const live = strip.querySelector('[data-sketch-animate]');
    expect(live?.closest('[data-page-tile]')?.getAttribute('data-page-tile')).toBe('0');

    // Straddling the boundary between the third and fourth tiles: those two, nothing else.
    await scrollTo(strip, 4096 * 3 - 400);
    expect(drawing(strip)).toEqual({ sketches: 2, timelines: 2 });
    expect(
      [...strip.querySelectorAll('[data-sketch-animate]')].map((node) =>
        node.closest('[data-page-tile]')?.getAttribute('data-page-tile'),
      ),
    ).toEqual(['8192', '12288']);
  });

  it('Given a gap between pages, When the viewport sits wholly in it, Then no sketch draws and none runs', async () => {
    const short = { width: 600, height: 900 };
    const strip = mount([page(0, short), page(1, short)], GAP);
    await scrollTo(strip, 0);
    expect(drawing(strip)).toEqual({ sketches: 1, timelines: 1 });

    // The gap is [900, 2,900); the 800px viewport fits inside it.
    await scrollTo(strip, short.height + 500);
    expect(drawing(strip)).toEqual({ sketches: 0, timelines: 0 });

    // Out of the gap onto the next page: that page draws again.
    await scrollTo(strip, short.height + GAP);
    expect(drawing(strip)).toEqual({ sketches: 1, timelines: 1 });
    expect(
      strip
        .querySelector('[data-sketch-animate]')
        ?.closest('[data-page-index]')
        ?.getAttribute('data-page-index'),
    ).toBe('1');
  });

  it('Given data saver, When the viewport sits in a gap, Then the page it last showed stays mounted', async () => {
    const short = { width: 600, height: 900 };
    const strip = mount([page(0, short), page(1, short), page(2, short)], GAP, true);
    const images = () =>
      [...strip.querySelectorAll('[data-image-page]')].map((image) =>
        image.getAttribute('data-image-page'),
      );
    await scrollTo(strip, 0);
    expect(images()).toEqual(['0']);
    // An empty viewport is not "no pages": data saver keeps what it showed rather than unmount it.
    await scrollTo(strip, short.height + 500);
    expect(images()).toEqual(['0']);
    await scrollTo(strip, short.height + GAP);
    expect(images()).toEqual(['1']);
  });
});
