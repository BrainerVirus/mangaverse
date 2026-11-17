// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import type { CachedPageImageProps } from '@app/cache';
import { setInAppReducedMotionPreference } from '@app/design-system/motion';
import { getDefaultReaderSettings, toChapterPageId, type ReaderSettings } from '@app/shared';

const images = vi.hoisted(() => [] as CachedPageImageProps[]);
// One identity for the whole file: the prefetch effect keys on the context.
const cacheContext = vi.hoisted(() => ({ db: {}, adapter: {}, cacheLimitBytes: 1024 }));

vi.mock('@app/cache', () => ({
  // A page whose image never arrives: the box keeps its placeholder.
  CachedPageImage: (props: CachedPageImageProps) => {
    images.push(props);
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
  const { useId, useReducer } = await import('react');
  return {
    Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
      <button {...props}>{children}</button>
    ),
    EmptyState: () => null,
    ErrorState: () => null,
    GlassSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ReaderChrome: ({ currentPage }: { currentPage: number }) => (
      <output data-testid="chrome-page">{currentPage}</output>
    ),
    Sheet: () => null,
    SheetContent: () => null,
    SheetHeader: () => null,
    SheetTitle: () => null,
    // The sketch and the back pill as plain markup: enough to find them and drive them.
    PanelSketch: ({ seed, animate = true, revealed = false }: Record<string, unknown>) => (
      <div
        data-panel-sketch={String(seed)}
        data-animate={String(animate)}
        data-revealed={String(revealed)}
        aria-hidden="true"
      />
    ),
    ReaderBackPill: ({
      label,
      variant = 'pill',
      onClick,
    }: {
      label?: string;
      variant?: string;
      onClick?: () => void;
    }) => {
      const round = variant === 'round' || label === undefined || label === '';
      const descriptionId = useId();
      return (
        /* The pill's GlassSurface wrapper, so the header sees one child as it does in the app. */
        <div>
          <button
            type="button"
            aria-label={round ? 'Close reader' : undefined}
            aria-describedby={round ? undefined : descriptionId}
            data-variant={round ? 'round' : variant}
            onClick={onClick}
          >
            {round ? null : label}
          </button>
          {round ? null : (
            <span id={descriptionId} className="sr-only">
              Closes the reader
            </span>
          )}
        </div>
      );
    },
    readingLabel: (series: string | undefined, chapter: string | undefined) =>
      [series, chapter].filter((part) => part !== undefined && part !== '').join(' · ') ||
      undefined,
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

/** Every element reports this box: the reader surface and the strip's scroller alike. */
const viewport = { width: 1280, height: 800 };
const LANDSCAPE = { width: 1280, height: 800 } as const;
const PORTRAIT = { width: 800, height: 1280 } as const;

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => viewport.width,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => viewport.height,
  });
});

afterAll(() => {
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  }
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  }
});

function buildData(
  patch: Partial<ReaderSettings>,
  options: { readonly pageCount: number; readonly initialPageIndex?: number },
): ReaderPageData {
  const settings = { ...getDefaultReaderSettings(), ...patch };
  // No stored shapes, as on a first open: the loaded pages are no better known than the placeholder.
  const pages = Array.from({ length: options.pageCount }, (_value, index) => ({
    id: toChapterPageId(`page-${index}`),
    index,
    image: { url: `https://example.com/${index}.png` },
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
    initialPageIndex: options.initialPageIndex ?? 0,
    settings,
    engineSettings: toReaderEngineSettings(settings, { pages }),
  };
}

interface Box {
  readonly width: string;
  readonly height: string;
}

let mounted: { root: Root; container: HTMLElement } | undefined;

function render(element: ReactNode): HTMLElement {
  if (mounted === undefined) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    mounted = { root: createRoot(container), container };
  }
  const { root } = mounted;
  act(() => root.render(element));
  return mounted.container;
}

afterEach(async () => {
  images.length = 0;
  setInAppReducedMotionPreference(false);
  if (mounted === undefined) return;
  const { root, container } = mounted;
  mounted = undefined;
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

function screen(
  data: ReaderPageData,
  options: { readonly hydrating: boolean; readonly chromeVisible?: boolean } = {
    hydrating: false,
  },
) {
  return (
    <ReaderScreen
      data={data}
      isLoading={false}
      isError={false}
      isHydrating={options.hydrating}
      chromeVisible={options.chromeVisible ?? false}
      onToggleChrome={() => {}}
      onClose={() => {}}
    />
  );
}

function pagedBoxes(container: HTMLElement): Box[] {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="reader-page-box"]')].map(
    (box) => ({ width: box.style.width, height: box.style.height }),
  );
}

function stripRow(container: HTMLElement, index: number): Box {
  const row = container.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
  if (row === null) throw new Error(`strip row ${index} did not render`);
  return { width: row.style.width, height: row.style.height };
}

/**
 * Opens a chapter whose pages are still hydrating, then lets them land: the
 * boxes before and after, read from the same surface.
 */
function openChapter(
  patch: Partial<ReaderSettings>,
  options: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly initialPageIndex?: number;
    readonly chromeVisible?: boolean;
  },
): { readonly pending: Box[]; readonly loaded: Box[]; readonly container: HTMLElement } {
  viewport.width = options.viewport.width;
  viewport.height = options.viewport.height;
  const initialPageIndex = options.initialPageIndex ?? 0;
  const empty = buildData(patch, { pageCount: 0, initialPageIndex });
  const full = buildData(patch, { pageCount: 12, initialPageIndex });
  const strip = patch.readingMode === 'vertical';
  const chromeVisible = options.chromeVisible ?? false;

  let container = render(screen(empty, { hydrating: true, chromeVisible }));
  const stage = container.querySelector('[data-testid="reader-hydrating"]');
  if (stage === null) throw new Error('the pending stage did not render');
  const pending = strip ? [stripRow(container, 0)] : pagedBoxes(container);

  container = render(screen(full, { hydrating: false, chromeVisible }));
  expect(container.querySelector('[data-testid="reader-hydrating"]')).toBeNull();
  const loaded = strip ? [stripRow(container, initialPageIndex)] : pagedBoxes(container);
  return { pending, loaded, container };
}

describe('ReaderScreen page placeholder geometry', () => {
  it.each([
    ['width', LANDSCAPE],
    ['height', LANDSCAPE],
    ['contain', LANDSCAPE],
    ['cover', LANDSCAPE],
    ['original', LANDSCAPE],
    ['width', PORTRAIT],
    ['height', PORTRAIT],
    ['contain', PORTRAIT],
    ['cover', PORTRAIT],
    ['original', PORTRAIT],
  ] as const)(
    'Given single pages fit to %s in a %o viewport, When the pages land, Then the placeholder was the page box',
    (fitMode, size) => {
      const { pending, loaded } = openChapter(
        { readingMode: 'ltr', pageLayout: 'single', fitMode },
        { viewport: size },
      );
      expect(pending).toHaveLength(1);
      expect(pending).toEqual(loaded);
    },
  );

  it('Given Auto fit, When the placeholder renders, Then it is the fitted page, not a small centred box', () => {
    const { pending } = openChapter(
      { readingMode: 'ltr', pageLayout: 'single', fitMode: 'auto' },
      { viewport: LANDSCAPE },
    );
    // Contain: the 800px surface minus the 96 + 48 chrome insets, at 2:3.
    expect(pending).toEqual([{ width: `${(656 * 2) / 3}px`, height: '656px' }]);
  });

  it.each([
    ['ltr', 'double', 1, 'contain', 2],
    ['rtl', 'double', 1, 'contain', 2],
    ['ltr', 'double', 1, 'width', 2],
    ['rtl', 'double', 1, 'cover', 2],
    // The default first page is a cover: it opens alone.
    ['ltr', 'double', 0, 'width', 1],
    ['rtl', 'double', 0, 'contain', 1],
    // Smart spreads never pair pages of unknown shape.
    ['ltr', 'smartSpread', 1, 'width', 1],
    // Auto layout is spreads in landscape.
    ['ltr', 'auto', 1, 'width', 2],
  ] as const)(
    'Given %s %s pages with spread offset %d fit to %s, When the pages land, Then the %d placeholder(s) were the page boxes',
    (readingMode, pageLayout, spreadOffset, fitMode, slots) => {
      const { pending, loaded } = openChapter(
        { readingMode, pageLayout, spreadOffset, fitMode },
        { viewport: LANDSCAPE },
      );
      expect(pending).toHaveLength(slots);
      expect(pending).toEqual(loaded);
    },
  );

  it('Given Auto layout in a portrait viewport, When the pages land, Then one placeholder was the single page box', () => {
    const { pending, loaded } = openChapter(
      { readingMode: 'ltr', pageLayout: 'auto', spreadOffset: 1, fitMode: 'width' },
      { viewport: PORTRAIT },
    );
    expect(pending).toHaveLength(1);
    expect(pending).toEqual(loaded);
  });

  it('Given a double layout resuming mid-chapter, When the pages land, Then the placeholder spread was the resumed spread', () => {
    const { pending, loaded } = openChapter(
      { readingMode: 'ltr', pageLayout: 'double', spreadOffset: 0, fitMode: 'height' },
      { viewport: LANDSCAPE, initialPageIndex: 4 },
    );
    expect(pending).toHaveLength(2);
    expect(pending).toEqual(loaded);
  });

  it.each([
    ['auto', true],
    ['auto', false],
    ['always', true],
    ['hidden', false],
  ] as const)(
    'Given chrome visibility %s (chrome shown: %s), When the pages land, Then the placeholder was the page box',
    (chromeVisibility, chromeVisible) => {
      const { pending, loaded } = openChapter(
        { readingMode: 'ltr', pageLayout: 'double', spreadOffset: 1, chromeVisibility },
        { viewport: LANDSCAPE, chromeVisible },
      );
      expect(pending).toEqual(loaded);
      // The chrome never resizes the page: a centre tap must not move it.
      expect(pending).toEqual([
        { width: `${(656 * 2) / 3}px`, height: '656px' },
        { width: `${(656 * 2) / 3}px`, height: '656px' },
      ]);
    },
  );

  it.each([
    [100, LANDSCAPE, 'width'],
    [100, PORTRAIT, 'width'],
    [60, LANDSCAPE, 'width'],
    [60, PORTRAIT, 'width'],
    [100, LANDSCAPE, 'contain'],
    [60, PORTRAIT, 'height'],
  ] as const)(
    'Given a strip at %d%% width in a %o viewport fit to %s, When the pages land, Then the placeholder row was the page row',
    (maxStripWidthPercent, size, fitMode) => {
      const { pending, loaded } = openChapter(
        { readingMode: 'vertical', maxStripWidthPercent, fitMode },
        { viewport: size },
      );
      expect(pending).toEqual(loaded);
    },
  );

  it('Given an Auto-width strip on a desktop window, When the placeholder renders, Then it spans the bounded strip column', () => {
    const { pending } = openChapter(
      { readingMode: 'vertical', maxStripWidthPercent: 100, fitMode: 'auto' },
      { viewport: LANDSCAPE },
    );
    // Auto bounds the strip to 70% from 1024px up; the row is that column at 2:3.
    expect(pending).toEqual([{ width: '896px', height: '1344px' }]);
  });

  it('Given a strip resuming mid-chapter, When the pages land, Then the placeholder row was the resumed page row', () => {
    const { pending, loaded } = openChapter(
      { readingMode: 'vertical', maxStripWidthPercent: 80, fitMode: 'width' },
      { viewport: PORTRAIT, initialPageIndex: 5 },
    );
    expect(pending).toEqual(loaded);
  });
});

describe('ReaderScreen page placeholder look', () => {
  const PLATE = ['bg-stage-ink/5', 'border-stage-ink/15'];

  function plates(container: HTMLElement): HTMLElement[] {
    return [
      ...container.querySelectorAll<HTMLElement>(
        '[data-testid="reader-page-box"], [data-page-tile] > div > div',
      ),
    ];
  }

  function sketches(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('[data-panel-sketch]')].map((node) => ({
      seed: node.dataset['panelSketch'],
      animate: node.dataset['animate'],
      revealed: node.dataset['revealed'],
    }));
  }

  /** What each still-loading page image draws over itself, before and once its source arrives. */
  function imageSketches(): { pending: Record<string, unknown>; ready: Record<string, unknown> }[] {
    // Each page's latest render: the mock records every render.
    const latest = new Map(images.map((image) => [image.pageIndex, image]));
    return [...latest.values()].map((image) => {
      const pending = image.renderPlaceholder?.(false) as { props: Record<string, unknown> };
      const ready = image.renderPlaceholder?.(true) as { props: Record<string, unknown> };
      return { pending: pending.props, ready: ready.props };
    });
  }

  it.each(['ltr', 'vertical'] as const)(
    'Given %s pages pending, Then each page slot is the still stage plate with the page sketched over it',
    (readingMode) => {
      viewport.width = LANDSCAPE.width;
      viewport.height = LANDSCAPE.height;
      const container = render(
        screen(buildData({ readingMode, pageLayout: 'single' }, { pageCount: 0 }), {
          hydrating: true,
        }),
      );
      const slots = plates(container);
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        for (const token of PLATE) expect(slot.className).toContain(token);
        // The plate never pulses: the sketch is the only motion.
        expect(slot.className).not.toMatch(/animate-/);
      }
      expect(sketches(container)).toEqual([
        { seed: 'chapter-1:0', animate: 'true', revealed: 'false' },
      ]);
    },
  );

  it.each(['ltr', 'vertical'] as const)(
    'Given %s pages pending and landed, Then every sketch fills a positioned page box, never the whole stage',
    (readingMode) => {
      viewport.width = LANDSCAPE.width;
      viewport.height = LANDSCAPE.height;
      const patch = { readingMode, pageLayout: 'single' } as const;
      for (const data of [
        buildData(patch, { pageCount: 0 }),
        buildData(patch, { pageCount: 12 }),
      ]) {
        const container = render(screen(data, { hydrating: data.chapter.pageCount === 0 }));
        const nodes = [...container.querySelectorAll<HTMLElement>('[data-panel-sketch]')];
        for (const node of nodes) {
          // `absolute inset-0` resolves against the nearest positioned box: it must be the page's.
          expect(node.parentElement?.className).toMatch(/(^|\s)(relative|absolute)(\s|$)/);
          expect(
            node.parentElement?.closest('[data-testid="reader-page-box"], [data-page-index]'),
          ).not.toBeNull();
        }
        // Loaded images draw theirs inside the page box (or the strip tile), which is positioned too.
        const boxes = container.querySelectorAll<HTMLElement>(
          '[data-testid="reader-page-box"], [data-page-tile] > div',
        );
        for (const box of boxes) expect(box.className).toMatch(/(^|\s)(relative|absolute)(\s|$)/);
      }
    },
  );

  it('Given a spread pending, Then its two pages sketch different layouts', () => {
    viewport.width = LANDSCAPE.width;
    viewport.height = LANDSCAPE.height;
    const container = render(
      screen(
        buildData({ readingMode: 'rtl', pageLayout: 'double', spreadOffset: 1 }, { pageCount: 0 }),
        { hydrating: true },
      ),
    );
    const seeds = sketches(container).map((sketch) => sketch.seed);
    expect(seeds).toHaveLength(2);
    expect(new Set(seeds).size).toBe(2);
  });

  it.each(['ltr', 'vertical'] as const)(
    'Given %s pages that land, Then each image keeps sketching the same page until its source arrives, then dissolves into it',
    (readingMode) => {
      viewport.width = LANDSCAPE.width;
      viewport.height = LANDSCAPE.height;
      const patch = { readingMode, pageLayout: 'single' } as const;
      let container = render(screen(buildData(patch, { pageCount: 0 }), { hydrating: true }));
      const pendingSeed = sketches(container)[0]?.seed;

      container = render(screen(buildData(patch, { pageCount: 12 })));
      expect(images.length).toBeGreaterThan(0);
      const first = imageSketches().find((sketch) => sketch.pending['seed'] === pendingSeed);
      // The same seed: the drawing carries on across the hand-over instead of changing page.
      expect(first?.pending).toMatchObject({ revealed: false });
      expect(first?.ready).toMatchObject({ revealed: true });
      for (const image of images) {
        for (const token of PLATE) expect(image.placeholderClassName).toContain(token);
        expect(image.placeholderClassName).not.toMatch(/animate-/);
      }
      expect(container.querySelector('[class*="animate-"]')).toBeNull();
    },
  );

  it('Given a strip with rows above and below the viewport, Then only the rows on screen draw', () => {
    viewport.width = LANDSCAPE.width;
    viewport.height = LANDSCAPE.height;
    const container = render(
      screen(buildData({ readingMode: 'vertical', fitMode: 'width' }, { pageCount: 12 })),
    );
    // The first row (896 x 1344) fills the 800px viewport; the rest are below it.
    const onScreen = imageSketches().filter((sketch) => sketch.pending['animate'] === true);
    const offScreen = imageSketches().filter((sketch) => sketch.pending['animate'] === false);
    expect(onScreen.map((sketch) => sketch.pending['seed'])).toEqual(['chapter-1:0']);
    expect(offScreen.length).toBeGreaterThan(0);
    for (const sketch of sketches(container)) expect(sketch.animate).toBe('false');
  });

  it.each([
    ['#000000', 'dark'],
    ['#f5f2eb', 'light'],
  ] as const)(
    'Given a %s stage, Then the stage is marked %s so the ink reads on it, pending and loaded',
    (backgroundColor, tone) => {
      const patch = { readingMode: 'ltr', backgroundColor } as const;
      let container = render(screen(buildData(patch, { pageCount: 0 }), { hydrating: true }));
      expect(
        container
          .querySelector('[data-testid="reader-hydrating"]')
          ?.getAttribute('data-stage-tone'),
      ).toBe(tone);
      container = render(screen(buildData(patch, { pageCount: 12 })));
      expect(
        container.querySelector('[data-testid="reader-surface"]')?.getAttribute('data-stage-tone'),
      ).toBe(tone);
    },
  );

  it('Given pages pending, When the stage renders, Then it is busy with a quiet screen-reader message and the title', () => {
    const container = render(
      screen(buildData({ readingMode: 'ltr' }, { pageCount: 0 }), { hydrating: true }),
    );
    const stage = container.querySelector('[data-testid="reader-hydrating"]');
    expect(stage?.getAttribute('aria-busy')).toBe('true');
    const message = stage?.querySelector('output');
    expect(message?.textContent).toBe('Loading chapter pages…');
    expect(message?.className).toBe('sr-only');
    expect(stage?.textContent).toContain('Chapter 1');
    // The placeholder is decoration: nothing to announce or focus.
    for (const box of stage?.querySelectorAll('[data-testid="reader-page-box"]') ?? []) {
      expect(box.getAttribute('aria-hidden')).toBe('true');
    }
    for (const sketch of stage?.querySelectorAll('[data-panel-sketch]') ?? []) {
      expect(sketch.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('ReaderScreen input around the page placeholder', () => {
  function tap(target: Element, clientX: number, clientY: number) {
    for (const type of ['pointerdown', 'pointerup'] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, clientX, clientY });
      act(() => {
        target.dispatchEvent(event);
      });
    }
  }

  function key(name: string) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    });
  }

  function currentPage(container: HTMLElement): string | null | undefined {
    return container.querySelector('[data-testid="chrome-page"]')?.textContent;
  }

  it('Given pages pending, When the reader taps and presses keys, Then nothing navigates and the loaded chapter opens on its resume page', () => {
    viewport.width = LANDSCAPE.width;
    viewport.height = LANDSCAPE.height;
    const onToggleChrome = vi.fn<() => void>();
    const patch = { readingMode: 'ltr', pageLayout: 'single', fitMode: 'contain' } as const;
    const pendingScreen = (data: ReaderPageData, hydrating: boolean) => (
      <ReaderScreen
        data={data}
        isLoading={false}
        isError={false}
        isHydrating={hydrating}
        chromeVisible={true}
        onToggleChrome={onToggleChrome}
      />
    );
    let container = render(
      pendingScreen(buildData(patch, { pageCount: 0, initialPageIndex: 3 }), true),
    );
    const stage = container.querySelector('[data-testid="reader-hydrating"]');
    if (stage === null) throw new Error('the pending stage did not render');
    tap(stage, 1200, 400);
    tap(stage, 640, 400);
    key('ArrowRight');
    key(' ');
    expect(onToggleChrome).not.toHaveBeenCalled();

    container = render(
      pendingScreen(buildData(patch, { pageCount: 12, initialPageIndex: 3 }), false),
    );
    expect(currentPage(container)).toBe('4');
  });

  it('Given pages landed but their images are still loading, When the reader taps the right zone and presses ArrowRight, Then the pages turn', () => {
    viewport.width = LANDSCAPE.width;
    viewport.height = LANDSCAPE.height;
    const onToggleChrome = vi.fn<() => void>();
    const patch = { readingMode: 'ltr', pageLayout: 'single', fitMode: 'contain' } as const;
    render(
      <ReaderScreen
        data={buildData(patch, { pageCount: 0 })}
        isLoading={false}
        isError={false}
        isHydrating={true}
        chromeVisible={true}
        onToggleChrome={onToggleChrome}
      />,
    );
    const container = render(
      <ReaderScreen
        data={buildData(patch, { pageCount: 12 })}
        isLoading={false}
        isError={false}
        chromeVisible={true}
        onToggleChrome={onToggleChrome}
      />,
    );
    const surface = container.querySelector<HTMLElement>('[data-testid="reader-surface"]');
    if (surface === null) throw new Error('reader surface did not render');
    Object.defineProperty(surface, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800 }),
    });
    expect(currentPage(container)).toBe('1');

    tap(surface, 1200, 400);
    expect(currentPage(container)).toBe('2');
    key('ArrowRight');
    expect(currentPage(container)).toBe('3');
    tap(surface, 640, 400);
    expect(onToggleChrome).toHaveBeenCalledTimes(1);
  });
});

describe('ReaderScreen top controls and the desktop title bar', () => {
  // `below-title-bar` is `top: var(--title-bar-height)`: under the desktop strip, 0 on the web and
  // in fullscreen. A viewport-relative `top-*` would put the control under the strip.
  const VIEWPORT_TOP = /(^|\s)top-\d/;

  /** What a button says it does: the text its aria-describedby points at. */
  function describedText(button: HTMLButtonElement, container: HTMLElement): string | null {
    const id = button.getAttribute('aria-describedby');
    if (id === null) return null;
    return container.querySelector(`[id="${id}"]`)?.textContent ?? null;
  }

  function closeButtons(container: HTMLElement): HTMLButtonElement[] {
    return [...container.querySelectorAll('button')].filter(
      (button) =>
        describedText(button, container) === 'Closes the reader' ||
        button.getAttribute('aria-label') === 'Close reader',
    );
  }

  it.each([
    ['hydrating', true, false],
    ['hydration-error', false, true],
  ] as const)(
    'Given the %s stage, When it renders, Then one back pill in the header carries the title, so nothing overlaps',
    (_stage, isHydrating, isHydrationError) => {
      const container = render(
        <ReaderScreen
          data={buildData({ readingMode: 'ltr' }, { pageCount: 0 })}
          isLoading={false}
          isError={false}
          isHydrating={isHydrating}
          isHydrationError={isHydrationError}
          chromeVisible={false}
          onToggleChrome={() => {}}
          onClose={() => {}}
        />,
      );
      const [close, ...others] = closeButtons(container);
      expect(others).toHaveLength(0);
      const header = container.querySelector('[data-testid="reader-stage-header"]');
      // In the header, inside the pill's own wrapper: the title is not a sibling control.
      expect(close?.closest('[data-testid="reader-stage-header"]')).toBe(header);
      // The title lives inside the pill (which truncates it), not beside it.
      expect(close?.getAttribute('data-variant')).toBe('pill');
      expect(close?.textContent).toBe('Chapter 1');
      // Its name is the visible title; what it does is the description.
      expect(close?.hasAttribute('aria-label')).toBe(false);
      expect(close && describedText(close, container)).toBe('Closes the reader');
      expect(header?.children).toHaveLength(1);
      expect(header?.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    },
  );

  it('Given no chapter data yet, When the stage renders, Then Close sits in its header, not floated over the window edge', () => {
    const container = render(
      <ReaderScreen
        data={undefined}
        isLoading={true}
        isError={false}
        chromeVisible={false}
        onToggleChrome={() => {}}
        onClose={() => {}}
      />,
    );
    const [close] = closeButtons(container);
    expect(close?.closest('[data-testid="reader-stage-header"]')).not.toBeNull();
  });

  it('Given a gate with no header, When it renders, Then the round back button floats below the title bar', () => {
    const container = render(
      <ReaderScreen
        data={undefined}
        isLoading={false}
        isError={true}
        chromeVisible={false}
        onToggleChrome={() => {}}
        onClose={() => {}}
      />,
    );
    const [close] = closeButtons(container);
    expect(close?.getAttribute('data-variant')).toBe('round');
    const anchor = close?.closest('[data-testid="reader-exit"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.className).toContain('below-title-bar');
    expect(anchor?.className).toContain('fixed');
    expect(anchor?.className).not.toMatch(VIEWPORT_TOP);
  });

  it('Given the chrome hidden after the pages land, When the reader shows its exit, Then it is the round back button below the title bar where the pending pill was', () => {
    const container = render(
      <ReaderScreen
        data={buildData({ readingMode: 'ltr' }, { pageCount: 12 })}
        isLoading={false}
        isError={false}
        chromeVisible={false}
        onToggleChrome={() => {}}
        onClose={() => {}}
      />,
    );
    const [close] = closeButtons(container);
    expect(close?.getAttribute('data-variant')).toBe('round');
    const anchor = close?.closest('[data-testid="reader-exit"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.className).toContain('below-title-bar');
    expect(anchor?.className).not.toMatch(VIEWPORT_TOP);
    // The pending header's row: 1rem in and 0.75rem down from the surface top.
    expect(anchor?.className).toContain('left-4');
    expect(anchor?.className).toContain('mt-3');
  });
});
