// @vitest-environment jsdom
import { useState, type Dispatch, type SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';
import type { ReaderEngineSettings } from '../types.js';
import { createReaderState } from '../state.js';
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderSessionInput, ReaderState } from '../types.js';
import { useReaderGestures } from './use-reader-gestures.js';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;

const input: Omit<ReaderSessionInput, 'settings'> = {
  chapter: {
    id: 'chapter-1' as ReaderSessionInput['chapter']['id'],
    mangaId: 'manga-1' as ReaderSessionInput['chapter']['mangaId'],
    title: 'Chapter 1',
    pages: [
      { id: toChapterPageId('p1'), index: 0, image: { url: 'https://example.com/1.jpg' } },
      { id: toChapterPageId('p2'), index: 1, image: { url: 'https://example.com/2.jpg' } },
    ],
    pageCount: 2,
  },
  viewport: { width: 800, height: 600, orientation: 'landscape' },
};

function Harness({ settings, zoomScale }: { settings: ReaderEngineSettings; zoomScale: number }) {
  const sessionInput: ReaderSessionInput = { ...input, settings };
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<ReaderState>(() => {
    const base = createReaderState(sessionInput);
    return { ...base, zoom: { ...base.zoom, scale: zoomScale } };
  });
  const gestures = useReaderGestures({
    sessionInput,
    readerState: state,
    surface,
    overlayInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    navigate: () => {},
    onToggleChrome: () => {},
    setReaderState: setState as Dispatch<SetStateAction<ReaderState | null>>,
  });

  return (
    <div ref={setSurface} data-testid="surface" onPointerUp={gestures.handlePointerUp}>
      <div
        data-testid="zoom-layer"
        onPointerDown={gestures.handleZoomPointerDown}
        onPointerMove={gestures.handleZoomPointerMove}
        onPointerUp={gestures.handleZoomPointerUp}
      />
      <output data-testid="scale">{state.zoom.scale}</output>
      <output data-testid="translate-x">{state.zoom.translateX}</output>
    </div>
  );
}

const mounted: { root: Root; container: HTMLElement }[] = [];

function mount(
  overrides: Partial<ReaderEngineSettings> = {},
  zoomScale = 1,
): { container: HTMLElement; layer: HTMLElement } {
  const settings: ReaderEngineSettings = {
    ...toReaderEngineSettings(getDefaultReaderSettings()),
    ...overrides,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness settings={settings} zoomScale={zoomScale} />);
  });
  mounted.push({ root, container });

  const surface = container.querySelector<HTMLElement>('[data-testid="surface"]');
  const layer = container.querySelector<HTMLElement>('[data-testid="zoom-layer"]');
  if (surface === null || layer === null) throw new Error('gesture harness did not render');
  Object.defineProperty(surface, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }),
  });

  return { container, layer };
}

function scaleOf(container: HTMLElement): number {
  return Number(container.querySelector('[data-testid="scale"]')?.textContent ?? '0');
}

function translateXOf(container: HTMLElement): number {
  return Number(container.querySelector('[data-testid="translate-x"]')?.textContent ?? '0');
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  vi.restoreAllMocks();
});

let clock = 0;

beforeEach(() => {
  clock = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});

function pointer(
  target: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  clientX: number,
  clientY: number,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId, clientX, clientY });
  act(() => {
    target.dispatchEvent(event);
  });
}

function tap(target: HTMLElement, time: number, x = 400, y = 300) {
  clock = time;
  pointer(target, 'pointerdown', 1, x, y);
  pointer(target, 'pointerup', 1, x, y);
}

describe('useReaderGestures settings', () => {
  it('Given a double tap, Then doubleTapZoom sets the resulting scale', () => {
    const { layer, container } = mount({ doubleTapZoom: 2.5 });

    tap(layer, 1000);
    tap(layer, 1200);

    expect(scaleOf(container)).toBe(2.5);
  });

  it('Given a low gesture sensitivity, Then a slower double tap is two taps', () => {
    const { layer, container } = mount({ gestureSensitivity: 0.5, doubleTapZoom: 2.5 });

    tap(layer, 1000);
    tap(layer, 1250);

    expect(scaleOf(container)).toBe(1);
  });

  it('Given a high gesture sensitivity, Then a slower double tap still zooms', () => {
    const { layer, container } = mount({ gestureSensitivity: 2, doubleTapZoom: 2.5 });

    tap(layer, 1000);
    tap(layer, 1250);

    expect(scaleOf(container)).toBe(2.5);
  });

  it('Given pinchSensitivity, Then the distance ratio reaches pinchScale', () => {
    const normal = mount({ pinchSensitivity: 1, maxZoom: 5 });
    pointer(normal.layer, 'pointerdown', 1, 100, 300);
    pointer(normal.layer, 'pointerdown', 2, 200, 300);
    pointer(normal.layer, 'pointermove', 2, 300, 300);
    pointer(normal.layer, 'pointerup', 2, 300, 300);
    expect(scaleOf(normal.container)).toBe(2);

    const sensitive = mount({ pinchSensitivity: 2, maxZoom: 5 });
    pointer(sensitive.layer, 'pointerdown', 1, 100, 300);
    pointer(sensitive.layer, 'pointerdown', 2, 200, 300);
    pointer(sensitive.layer, 'pointermove', 2, 300, 300);
    pointer(sensitive.layer, 'pointerup', 2, 300, 300);
    expect(scaleOf(sensitive.container)).toBe(3);
  });

  it('Given gestureSensitivity, Then pan starts at the scaled threshold', () => {
    const low = mount({ gestureSensitivity: 0.25 }, 2);
    pointer(low.layer, 'pointerdown', 1, 300, 300);
    pointer(low.layer, 'pointermove', 1, 290, 300);
    pointer(low.layer, 'pointerup', 1, 290, 300);
    expect(translateXOf(low.container)).toBe(0);

    const high = mount({ gestureSensitivity: 4 }, 2);
    pointer(high.layer, 'pointerdown', 1, 300, 300);
    pointer(high.layer, 'pointermove', 1, 290, 300);
    pointer(high.layer, 'pointerup', 1, 290, 300);
    expect(translateXOf(high.container)).toBe(-10);
  });
});
