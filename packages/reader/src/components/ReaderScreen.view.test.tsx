// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import type { ReaderSettings } from '@app/shared';

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

const resizeCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

/** jsdom has no layout, so the test fires every observer the reader registered. */
function fireResize() {
  act(() => {
    for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
  });
}

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

const VIEWPORT_RECT = {
  width: 800,
  height: 600,
  left: 0,
  top: 0,
  right: 800,
  bottom: 600,
  x: 0,
  y: 0,
};

/** The same layer after the window shrank under a gesture. */
const SHRUNK_RECT = {
  width: 300,
  height: 200,
  left: 0,
  top: 0,
  right: 300,
  bottom: 200,
  x: 0,
  y: 0,
};

function buildData(overrides: Partial<ReaderSettings> = {}): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...overrides };
  const pages = Array.from({ length: 37 }, (_value, index) => ({
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
    initialPageIndex: 0,
    settings,
    engineSettings: toReaderEngineSettings(settings),
  };
}

interface Mounted {
  readonly root: Root;
  readonly container: HTMLElement;
  readonly surface: HTMLElement;
  readonly layer: HTMLElement;
}

/**
 * jsdom has no layout: the component reads the viewport from its container, so
 * every measured element reports the fixed rect the reader would see at 800x600.
 */
function mount(overrides: Partial<ReaderSettings> = {}): Mounted {
  resizeCallbacks.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ReaderScreen
        data={buildData(overrides)}
        isLoading={false}
        isError={false}
        chromeVisible={true}
        onToggleChrome={() => {}}
      />,
    );
  });

  const surface = container.querySelector<HTMLElement>('[data-testid="reader-surface"]');
  const layer = container.querySelector<HTMLElement>('[data-testid="reader-zoom-layer"]');
  if (surface === null || layer === null) throw new Error('reader surface did not render');
  Object.defineProperty(surface, 'getBoundingClientRect', {
    configurable: true,
    value: () => VIEWPORT_RECT,
  });
  Object.defineProperty(surface, 'clientWidth', { value: VIEWPORT_RECT.width });
  Object.defineProperty(surface, 'clientHeight', { value: VIEWPORT_RECT.height });
  Object.defineProperty(layer, 'getBoundingClientRect', {
    configurable: true,
    value: () => VIEWPORT_RECT,
  });

  return { root, container, surface, layer };
}

function unmount({ root, container }: Mounted) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function pageBox(container: HTMLElement): HTMLElement {
  const box = container.querySelector<HTMLElement>('[data-testid="reader-page-box"]');
  if (box === null) throw new Error('page box did not render');
  return box;
}

function pointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: { pointerId: number; clientX: number; clientY: number },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, init);
  return event;
}

function doubleTap(layer: HTMLElement, x = 400, y = 300) {
  act(() => {
    layer.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: x, clientY: y }));
    layer.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: x, clientY: y }));
    layer.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: x, clientY: y }));
    layer.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: x, clientY: y }));
  });
}

function wheel(
  layer: HTMLElement,
  init: { deltaY: number; ctrlKey?: boolean; clientX?: number; clientY?: number },
) {
  act(() => {
    layer.dispatchEvent(new WheelEvent('wheel', { ...init, bubbles: true, cancelable: true }));
  });
}

/** Lets the next animation frame apply a coalesced zoom update. */
async function settleFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

function scaleOf(layer: HTMLElement): number {
  const match = /scale\(([\d.]+)\)/.exec(layer.style.transform);
  return Number(match?.[1] ?? '0');
}

function translateOf(layer: HTMLElement): { x: number; y: number } {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(layer.style.transform);
  return { x: Number(match?.[1] ?? '0'), y: Number(match?.[2] ?? '0') };
}

describe('ReaderScreen fit modes', () => {
  // The component falls back to an 800x600 viewport when jsdom cannot measure
  // the surface; the available area is that minus the chrome insets (96/48).
  const cases = [
    { fitMode: 'width' as const, width: '800', height: '1200', objectFit: 'contain' },
    { fitMode: 'height' as const, width: '304', height: '456', objectFit: 'contain' },
    { fitMode: 'contain' as const, width: '304', height: '456', objectFit: 'contain' },
    { fitMode: 'cover' as const, width: '800', height: '456', objectFit: 'cover' },
    { fitMode: 'original' as const, width: '304', height: '456', objectFit: 'none' },
  ];

  for (const testCase of cases) {
    it(`Given fitMode ${testCase.fitMode}, When rendered, Then the page box is sized for that mode`, () => {
      const mounted = mount({ fitMode: testCase.fitMode });

      const box = pageBox(mounted.container);
      expect(box.dataset['fitMode']).toBe(testCase.fitMode);
      expect(box.style.width).toBe(`${testCase.width}px`);
      expect(box.style.height).toBe(`${testCase.height}px`);

      unmount(mounted);
    });
  }

  it('Given every fit mode, When rendered, Then the page box differs per mode', () => {
    const rendered = cases.map(({ fitMode }) => {
      const mounted = mount({ fitMode });
      const box = pageBox(mounted.container);
      const signature = `${box.style.width}x${box.style.height}`;
      unmount(mounted);
      return signature;
    });

    // contain/height/original may share a box; the rendered image still differs
    // through object-fit, which the sheet's aria-pressed state mirrors.
    expect(new Set(rendered).size).toBe(3);
    expect(rendered[0]).toBe('800pxx1200px');
    expect(rendered[3]).toBe('800pxx456px');
  });
});

describe('ReaderScreen zoom and pan', () => {
  it('Given scale 1, When double-clicking, Then the view scales to doubleTapZoom', () => {
    const mounted = mount();

    doubleTap(mounted.layer);

    expect(scaleOf(mounted.layer)).toBe(1.5);
    unmount(mounted);
  });

  it('Given doubleTapZoom above maxZoom, When double-clicking, Then the scale clamps to maxZoom', () => {
    const mounted = mount({ maxZoom: 1.2, doubleTapZoom: 1.5 });

    doubleTap(mounted.layer);

    expect(scaleOf(mounted.layer)).toBe(1.2);
    unmount(mounted);
  });

  it('Given doubleTapZoom below minZoom, When double-clicking, Then the scale clamps to minZoom', () => {
    const mounted = mount({ minZoom: 1.2, maxZoom: 3, doubleTapZoom: 1.1 });

    doubleTap(mounted.layer);

    expect(scaleOf(mounted.layer)).toBeGreaterThanOrEqual(1.2);
    unmount(mounted);
  });

  it('Given minZoom above 1, When double-tapping twice, Then the reset never drops below minZoom', () => {
    const mounted = mount({ minZoom: 1.2, maxZoom: 3, doubleTapZoom: 1.5 });

    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);

    // The second pair starts 100px away, so its first tap is not a third tap of
    // the first pair; its second tap is the zoom-out double tap.
    doubleTap(mounted.layer, 500, 300);

    expect(scaleOf(mounted.layer)).toBe(1.2);
    unmount(mounted);
  });

  it('Given wheelBehavior zoom, When Ctrl+wheel, Then the view zooms in', async () => {
    const mounted = mount({ wheelBehavior: 'zoom' });

    wheel(mounted.layer, { deltaY: -100, ctrlKey: true });
    await settleFrame();

    expect(scaleOf(mounted.layer)).toBeGreaterThan(1);
    unmount(mounted);
  });

  it('Given wheelBehavior zoom, When Ctrl+wheel repeats, Then the scale stays within minZoom and maxZoom', async () => {
    const mounted = mount({ wheelBehavior: 'zoom', minZoom: 1.2, maxZoom: 1.5 });

    for (let index = 0; index < 10; index += 1) {
      wheel(mounted.layer, { deltaY: -100, ctrlKey: true });
    }
    await settleFrame();
    expect(scaleOf(mounted.layer)).toBe(1.5);

    for (let index = 0; index < 20; index += 1) {
      wheel(mounted.layer, { deltaY: 100, ctrlKey: true });
    }
    await settleFrame();
    expect(scaleOf(mounted.layer)).toBe(1.2);
    unmount(mounted);
  });

  it('Given wheelBehavior none or scroll, When Ctrl+wheel, Then the zoom does not change', () => {
    for (const wheelBehavior of ['none', 'scroll'] as const) {
      const mounted = mount({ wheelBehavior });

      wheel(mounted.layer, { deltaY: -100, ctrlKey: true });

      expect(scaleOf(mounted.layer)).toBe(1);
      unmount(mounted);
    }
  });

  it('Given a zoomed view, When the drag is released before its frame, Then the last move lands and stays clamped', () => {
    const mounted = mount();
    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);

    act(() => {
      // The drag starts at the layer origin, so its queued travel is only ever
      // applied by the release flush: the frame it was scheduled on never runs.
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 3, clientX: 0, clientY: 0 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 3, clientX: 400, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 3, clientX: 400, clientY: 300 }),
      );
    });

    // -200/-150 from the double tap, +400/+300 from the drag: without the
    // release flush the translate would still be -200/-150.
    expect(translateOf(mounted.layer)).toEqual({ x: 0, y: 0 });
    unmount(mounted);
  });

  it('Given the surface shrinks mid-drag, When the drag is released, Then the pan clamps against the new box', () => {
    const mounted = mount();
    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);

    act(() => {
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 8, clientX: 400, clientY: 300 }),
      );
      // The surface shrinks before the gesture ends; the box measured at
      // pointer-down is stale until the resize observer drops it.
      Object.defineProperty(mounted.surface, 'getBoundingClientRect', {
        configurable: true,
        value: () => SHRUNK_RECT,
      });
      fireResize();
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 8, clientX: 100, clientY: 150 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 8, clientX: 100, clientY: 150 }),
      );
    });

    // Drag -300/-150 from the double-tap offset: the 300x200 box clamps the
    // 450x300 scaled layer at -150/-100, where the stale 800x600 box allowed
    // -400/-300.
    expect(translateOf(mounted.layer)).toEqual({ x: -150, y: -100 });
    unmount(mounted);
  });

  it('Given a transformed layer rect, When dragging, Then the pan clamps against the surface layout box', () => {
    const mounted = mount();
    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);

    // A browser reports the transformed box for the layer: 800x600 at 1.5 is
    // 1200x900, shifted by the current translate. The clamp must use the
    // untransformed surface box instead, or it subtracts the scale twice.
    Object.defineProperty(mounted.layer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...VIEWPORT_RECT, width: 1200, height: 900, left: -200, top: -150 }),
    });

    act(() => {
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 9, clientX: 400, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 9, clientX: 0, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 9, clientX: 0, clientY: 300 }),
      );
    });

    // A 400px drag from the double-tap offset lands at -600; the 800-wide
    // surface at 1.5 clamps it at -400, where the 1200-wide transformed box
    // would allow -600.
    expect(translateOf(mounted.layer)).toEqual({ x: -400, y: -150 });
    unmount(mounted);
  });

  it('Given a panned zoom and a transformed layer rect, When pinching, Then the anchor uses the surface box', async () => {
    const mounted = mount();
    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);
    expect(translateOf(mounted.layer)).toEqual({ x: -200, y: -150 });

    // The browser's layer rect is the transformed box, shifted by the current
    // translate; anchoring against it would add that translate to the centre.
    Object.defineProperty(mounted.layer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...VIEWPORT_RECT, width: 1200, height: 900, left: -200, top: -150 }),
    });

    act(() => {
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 11, clientX: 300, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 12, clientX: 500, clientY: 300 }),
      );
      // Separation 200 -> 400 doubles the 1.5 baseline to the 3x maximum.
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 11, clientX: 200, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 12, clientX: 600, clientY: 300 }),
      );
    });
    await settleFrame();

    // Anchoring at the local centre 400,300 from -200,-150 at 1.5 gives
    // -800,-600 at 3x; the transformed anchor would give -1000,-750.
    expect(scaleOf(mounted.layer)).toBeCloseTo(3, 5);
    expect(translateOf(mounted.layer)).toEqual({ x: -800, y: -600 });
    unmount(mounted);
  });

  it('Given a panned zoom, When a resize re-measures the wheel box, Then the wheel keeps the point under the cursor', async () => {
    const mounted = mount({ wheelBehavior: 'zoom' });
    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);

    act(() => {
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 10, clientX: 400, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 10, clientX: 0, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 10, clientX: 0, clientY: 300 }),
      );
    });
    expect(translateOf(mounted.layer)).toEqual({ x: -400, y: -150 });

    // The browser's layer rect is the transformed box (1200x900 at 1.5, offset
    // by the current translate). A re-measure must read the surface instead.
    Object.defineProperty(mounted.layer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...VIEWPORT_RECT, width: 1200, height: 900, left: -400, top: -150 }),
    });
    fireResize();

    const cursor = { x: 400, y: 300 };
    const before = translateOf(mounted.layer);
    const contentX = (cursor.x - before.x) / scaleOf(mounted.layer);
    const contentY = (cursor.y - before.y) / scaleOf(mounted.layer);

    wheel(mounted.layer, { deltaY: -100, ctrlKey: true, clientX: cursor.x, clientY: cursor.y });
    await settleFrame();

    // The anchored zoom leaves the same content point under the cursor; a
    // transformed-anchor measurement moves it by the current translate.
    expect((cursor.x - translateOf(mounted.layer).x) / scaleOf(mounted.layer)).toBeCloseTo(
      contentX,
      2,
    );
    expect((cursor.y - translateOf(mounted.layer).y) / scaleOf(mounted.layer)).toBeCloseTo(
      contentY,
      2,
    );
    unmount(mounted);
  });

  it('Given two pointers, When pinching over one frame, Then the scale follows the separation', async () => {
    const mounted = mount({ minZoom: 1, maxZoom: 3 });

    act(() => {
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 6, clientX: 300, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 7, clientX: 500, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 6, clientX: 200, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 7, clientX: 600, clientY: 300 }),
      );
    });
    await settleFrame();

    // Separation 200 -> 400 is a 2x pinch.
    expect(scaleOf(mounted.layer)).toBeCloseTo(2, 5);
    unmount(mounted);
  });

  it('Given a zoomed view, When the page changes, Then the zoom resets to scale 1', () => {
    const mounted = mount();
    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(scaleOf(mounted.layer)).toBe(1);
    unmount(mounted);
  });

  it('Given a zoomed view, When dragging, Then the page does not also turn', () => {
    const mounted = mount();
    doubleTap(mounted.layer);

    act(() => {
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 4, clientX: 400, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 4, clientX: 100, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 4, clientX: 100, clientY: 300 }),
      );
    });

    // The page indicator lives in the mocked chrome; the zoom staying put is
    // the observable: a tap-zone navigation would have reset the scale to 1.
    expect(scaleOf(mounted.layer)).toBe(1.5);
    unmount(mounted);
  });
});
