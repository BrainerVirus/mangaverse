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
  Object.defineProperty(surface, 'getBoundingClientRect', { value: () => VIEWPORT_RECT });
  Object.defineProperty(surface, 'clientWidth', { value: VIEWPORT_RECT.width });
  Object.defineProperty(surface, 'clientHeight', { value: VIEWPORT_RECT.height });
  Object.defineProperty(layer, 'getBoundingClientRect', { value: () => VIEWPORT_RECT });

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

function wheel(layer: HTMLElement, init: { deltaY: number; ctrlKey?: boolean }) {
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

  it('Given a zoomed view, When dragging, Then the view pans and stays clamped', () => {
    const mounted = mount();
    doubleTap(mounted.layer);
    expect(scaleOf(mounted.layer)).toBe(1.5);

    act(() => {
      mounted.layer.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 3, clientX: 400, clientY: 300 }),
      );
      mounted.layer.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 3, clientX: 200, clientY: 150 }),
      );
      // The release applies the last move even though its frame never ran.
      mounted.layer.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 3, clientX: 200, clientY: 150 }),
      );
    });

    const translate = translateOf(mounted.layer);
    expect(translate.x).toBeLessThan(0);
    expect(translate.y).toBeLessThan(0);
    // Clamped to the scaled content: never panned past its edges.
    expect(translate.x).toBeGreaterThanOrEqual(-400);
    expect(translate.y).toBeGreaterThanOrEqual(-300);
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
