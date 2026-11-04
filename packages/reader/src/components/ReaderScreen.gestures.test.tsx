// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { getDefaultReaderSettings, toChapterPageId } from '@app/shared';

const renderCounts = vi.hoisted(() => ({ shell: 0, pageImage: 0 }));
// One identity for the whole file: the prefetch effect keys on the context, and
// a fresh object per render would re-run it forever.
const cacheContext = vi.hoisted(() => ({ db: {}, adapter: {}, cacheLimitBytes: 1024 }));

vi.mock('@app/cache', () => ({
  CachedPageImage: () => {
    renderCounts.pageImage += 1;
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
    Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
      <button {...props}>{children}</button>
    ),
    Dialog: ({ children }: { children: ReactNode }) => <dialog open>{children}</dialog>,
    DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    EmptyState: () => null,
    ErrorState: () => null,
    GlassSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    LoadingState: () => null,
    ReaderChrome: () => null,
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
import { toReaderEngineSettings } from '../to-reader-engine-settings.js';
import type { ReaderPageData } from '../reader-page-data.js';

function buildData(): ReaderPageData {
  const settings = getDefaultReaderSettings();
  const pages = Array.from({ length: 6 }, (_value, index) => ({
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

/** Stands in for the app shell above the reader route. */
function Shell({ children }: { children: ReactNode }) {
  // oxlint-disable-next-line react/immutability -- test-only render counter: the point of this probe is to count how often the shell above the reader renders
  renderCounts.shell += 1;
  return <>{children}</>;
}

function mount(): { root: Root; container: HTMLElement } {
  renderCounts.shell = 0;
  renderCounts.pageImage = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Shell>
        <ReaderScreen
          data={buildData()}
          isLoading={false}
          isError={false}
          chromeVisible={true}
          onToggleChrome={() => {}}
        />
      </Shell>,
    );
  });

  const surface = container.querySelector<HTMLElement>('[data-testid="reader-surface"]');
  if (surface === null) throw new Error('reader surface did not render');
  Object.defineProperty(surface, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }),
  });
  return { root, container };
}

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

/** Lets the pending requestAnimationFrame run; no React work is expected. */
function flushFrames(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

/**
 * Waits out the reader's async warm-up (the mocked prefetch sweep completes a
 * turn after mount and commits one render). Gesture assertions start from a
 * quiet tree so a render can only come from the gesture itself.
 */
async function settle(): Promise<void> {
  let previous = `${renderCounts.shell}:${renderCounts.pageImage}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await flushFrames();
    const current = `${renderCounts.shell}:${renderCounts.pageImage}`;
    if (current === previous) return;
    previous = current;
  }
}

describe('ReaderScreen gesture rendering', () => {
  it('Given a pinch, When pointer frames run, Then neither the shell nor the reader re-renders until the gesture commits', async () => {
    const { root, container } = mount();
    const layer = container.querySelector<HTMLElement>('[data-testid="reader-zoom-layer"]');
    if (layer === null) throw new Error('zoom layer did not render');
    await settle();

    const shellBefore = renderCounts.shell;
    const imagesBefore = renderCounts.pageImage;
    expect(imagesBefore).toBeGreaterThan(0);
    expect(layer.style.transform).toContain('scale(1)');

    pointer(layer, 'pointerdown', 1, 100, 300);
    pointer(layer, 'pointerdown', 2, 200, 300);
    for (let step = 1; step <= 10; step += 1) {
      pointer(layer, 'pointermove', 2, 200 + step * 10, 300);
    }
    await flushFrames();

    // The transform is live on the DOM, but no React state changed: the shell
    // and every page box are exactly as they were before the pinch.
    expect(layer.style.transform).not.toContain('scale(1)');
    expect(renderCounts.shell).toBe(shellBefore);
    expect(renderCounts.pageImage).toBe(imagesBefore);

    // Releasing the second finger ends the pinch and commits once.
    pointer(layer, 'pointerup', 2, 300, 300);
    expect(renderCounts.pageImage).toBe(imagesBefore + 1);
    expect(renderCounts.shell).toBe(shellBefore);

    act(() => root.unmount());
    container.remove();
  });

  it('Given a pan at scale 2, When frames run, Then the shell renders zero times and the commit keeps the pan', async () => {
    const { root, container } = mount();
    const layer = container.querySelector<HTMLElement>('[data-testid="reader-zoom-layer"]');
    if (layer === null) throw new Error('zoom layer did not render');

    // Zoom in with a double tap (a discrete action, one commit).
    pointer(layer, 'pointerdown', 1, 400, 300);
    pointer(layer, 'pointerup', 1, 400, 300);
    pointer(layer, 'pointerdown', 1, 400, 300);
    pointer(layer, 'pointerup', 1, 400, 300);
    expect(layer.style.transform).toContain('scale(1.5)');
    await settle();

    const shellBefore = renderCounts.shell;
    const imagesBefore = renderCounts.pageImage;
    pointer(layer, 'pointerdown', 1, 400, 300);
    for (let step = 1; step <= 5; step += 1) {
      pointer(layer, 'pointermove', 1, 400 - step * 10, 300);
    }
    await flushFrames();
    expect(renderCounts.shell).toBe(shellBefore);
    expect(renderCounts.pageImage).toBe(imagesBefore);

    const pannedTransform = layer.style.transform;
    pointer(layer, 'pointerup', 1, 350, 300);
    expect(layer.style.transform).toBe(pannedTransform);

    act(() => root.unmount());
    container.remove();
  });
});
